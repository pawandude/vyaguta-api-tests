#!/usr/bin/env node
'use strict';

/**
 * Post-processes a newman-reporter-htmlextra report by injecting a <script>
 * block that augments the existing "Failed Tests" cards with endpoint URL,
 * request body, response status, and response body — in-place, without adding
 * a top banner.
 *
 * Usage: node scripts/enhance-report.js --report <html> --results <json>
 */

const fs = require('fs');

const args = process.argv.slice(2);
function getArg(n) { const i = args.indexOf('--' + n); return i !== -1 ? args[i + 1] : null; }

const reportPath  = getArg('report');
const resultsPath = getArg('results');

if (!reportPath || !resultsPath) {
  console.error('Usage: node enhance-report.js --report <html> --results <json>');
  process.exit(1);
}
if (!fs.existsSync(reportPath))  { console.log('Report not found, skipping');  process.exit(0); }
if (!fs.existsSync(resultsPath)) { console.log('Results not found, skipping'); process.exit(0); }

const results  = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const html     = fs.readFileSync(reportPath, 'utf8');
const failures = results.run.failures || [];

if (failures.length === 0) { console.log('No failures — nothing to inject'); process.exit(0); }

// Build execution map: itemId → execution
const execMap = {};
for (const ex of (results.run.executions || [])) {
  if (ex.item && ex.item.id) execMap[ex.item.id] = ex;
}

function buildUrl(u) {
  if (!u) return '';
  if (typeof u === 'string') return u;
  const host = Array.isArray(u.host) ? u.host.join('.') : String(u.host || '');
  const pth  = Array.isArray(u.path) ? u.path.filter(Boolean).join('/') : String(u.path || '');
  const qs   = Array.isArray(u.query) && u.query.length
    ? '?' + u.query.filter(q => q && q.key).map(q => q.key + (q.value != null && q.value !== '' ? '=' + q.value : '')).join('&')
    : '';
  const proto = (u.protocol || 'https') + '://';
  return proto + host + (pth ? '/' + pth : '') + qs;
}
function pretty(s) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch(e) { return String(s); } }
function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '\n… (truncated)' : s; }

// Build a map keyed by "FolderName - RequestName" → detail object
// (The htmlextra DOM shows the card header as "Iteration N - ErrorType - Folder - Request")
const detailMap = {};
const seenItems = new Set();

for (const f of failures) {
  const folder  = (f.parent && f.parent.name) || '';
  const reqName = (f.source && f.source.name) || '';
  const srcId   = f.source && f.source.id;
  const ex      = srcId ? execMap[srcId] : null;
  const mapKey  = `${folder} - ${reqName}`;

  if (seenItems.has(mapKey)) continue;
  seenItems.add(mapKey);

  const sentReq = ex && ex.request;
  const itemReq = ex && ex.item && ex.item.request;
  const res     = ex && ex.response;

  const method     = ((sentReq && sentReq.method) || (itemReq && itemReq.method) || '').toUpperCase();
  const rawUrl     = buildUrl((sentReq && sentReq.url) || (itemReq && itemReq.url));
  const bodyObj    = (sentReq && sentReq.body) || (itemReq && itemReq.body) || null;
  const reqBody    = bodyObj && bodyObj.raw ? trunc(pretty(bodyObj.raw), 1000) : '';
  const statusCode = res && res.code != null ? res.code : '';
  const statusText = (res && res.status) || '';
  let   resBody    = '';
  if (res && res.stream) {
    try {
      const bytes = res.stream.data ? Buffer.from(res.stream.data) : Buffer.from(res.stream);
      resBody = trunc(pretty(bytes.toString('utf8')), 1500);
    } catch(e) {}
  }

  detailMap[mapKey] = { method, url: rawUrl, reqBody, statusCode: String(statusCode), statusText, resBody };
}

// Escape for embedding in a JS string literal inside a <script> tag
function jsStr(s) {
  return JSON.stringify(s); // JSON.stringify produces a valid JS string literal
}

// Produce the detail HTML builder as a client-side JS function
const injectedScript = `
<script>
(function () {
  /* Failure details injected by enhance-report.js */
  var DETAILS = ${JSON.stringify(detailMap)};

  var MC = {
    GET:    '#0ea5e9', POST:   '#16a34a', PUT:    '#d97706',
    PATCH:  '#7c3aed', DELETE: '#dc2626'
  };

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function buildHTML(d) {
    var isDark  = document.documentElement.dataset.theme === 'dark' ||
                  window.matchMedia('(prefers-color-scheme:dark)').matches;
    var bg      = isDark ? '#1e293b' : '#f8fafc';
    var border  = isDark ? '#334155' : '#e2e8f0';
    var codeBg  = isDark ? '#0f172a' : '#fff';
    var codeClr = isDark ? '#94a3b8' : '#374151';
    var codeBdr = isDark ? '#334155' : '#e2e8f0';
    var labelClr = isDark ? '#94a3b8' : '#6b7280';
    var wrap = isDark ? '#1e1e2e' : '#fff';

    var methodBadge = d.method
      ? '<span style="background:'+(MC[d.method]||'#6b7280')+';color:#fff;'
        +'font-size:11px;font-weight:700;padding:2px 10px;border-radius:4px;'
        +'font-family:monospace;margin-right:8px;vertical-align:middle">'
        +esc(d.method)+'</span>'
      : '';
    var urlSpan = d.url
      ? '<span style="font-size:11px;color:#3b82f6;font-family:monospace;'
        +'word-break:break-all;vertical-align:middle">'+esc(d.url)+'</span>'
      : '';
    var endpoint = (d.method || d.url)
      ? '<div style="padding:8px 10px;background:'+bg+';border:1px solid '+border+';'
        +'border-radius:4px;margin-bottom:10px">' + methodBadge + urlSpan + '</div>'
      : '';

    var reqB = d.reqBody
      ? '<div style="margin-bottom:10px">'
        +'<div style="font-size:10px;font-weight:700;color:'+labelClr+';text-transform:uppercase;'
        +'letter-spacing:.06em;margin-bottom:4px">Request Body</div>'
        +'<pre style="margin:0;font-size:11px;background:'+codeBg+';color:'+codeClr+';'
        +'padding:10px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;'
        +'word-break:break-all;border:1px solid '+codeBdr+'">'+esc(d.reqBody)+'</pre></div>'
      : '';

    var sIsErr = Number(d.statusCode) >= 400;
    var sBg    = sIsErr ? (isDark?'#450a0a':'#fef2f2') : (isDark?'#052e16':'#f0fdf4');
    var sClr   = sIsErr ? (isDark?'#fca5a5':'#dc2626') : (isDark?'#86efac':'#16a34a');
    var resStatus = d.statusCode
      ? '<div style="margin-bottom:10px">'
        +'<span style="font-size:10px;font-weight:700;color:'+labelClr+';'
        +'text-transform:uppercase;letter-spacing:.06em;margin-right:8px">Response Status</span>'
        +'<span style="font-size:12px;font-family:monospace;background:'+sBg+';color:'+sClr+';'
        +'font-weight:700;padding:3px 10px;border-radius:4px">'
        +esc(d.statusCode)+' '+esc(d.statusText)+'</span></div>'
      : '';

    var resB = d.resBody
      ? '<div style="margin-bottom:4px">'
        +'<div style="font-size:10px;font-weight:700;color:'+labelClr+';text-transform:uppercase;'
        +'letter-spacing:.06em;margin-bottom:4px">Response Body</div>'
        +'<pre style="margin:0;font-size:11px;background:'+codeBg+';color:'+codeClr+';'
        +'padding:10px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;'
        +'word-break:break-all;border:1px solid '+(sIsErr?(isDark?'#7f1d1d':'#fecaca'):codeBdr)+'">'
        +esc(d.resBody)+'</pre></div>'
      : '';

    return '<div class="__vfe-block" style="margin-top:12px;padding:12px;'
      +'background:'+wrap+';border-radius:6px;border:1px solid '+border+'">'
      + endpoint + reqB + resStatus + resB
      +'</div>';
  }

  var injected = {};

  function findCard(folder, req) {
    /* Strategy 1: htmlextra uses <details>/<summary> for failure items.
       The <summary> text is: "Iteration N - ErrorType - Folder - Request ▼"
       Target: inject into the <details> body (sibling of <summary>). */
    var summaries = document.querySelectorAll('summary');
    for (var i = 0; i < summaries.length; i++) {
      var s = summaries[i];
      var t = s.textContent || '';
      if (t.indexOf(folder) !== -1 && t.indexOf(req) !== -1) {
        /* The <details> element IS the card wrapper.
           Return the first non-summary child (the content div), or the details itself. */
        var details = s.parentElement;
        for (var c = details.firstElementChild; c; c = c.nextElementSibling) {
          if (c.tagName !== 'SUMMARY') return c; /* first content div */
        }
        return details;
      }
    }

    /* Strategy 2: Bootstrap accordion — look for a div whose direct text
       (not deep children) contains the header pattern, then use its parent. */
    var allDivs = document.querySelectorAll('div');
    for (var j = 0; j < allDivs.length; j++) {
      var el = allDivs[j];
      /* Only look at elements with limited direct-child elements (a header div) */
      if (el.childElementCount > 4) continue;
      var txt = el.textContent || '';
      if (txt.indexOf('Iteration') !== -1 && txt.indexOf(folder) !== -1 && txt.indexOf(req) !== -1) {
        /* Walk up at most 3 levels to find a container that also has "Failed Test:" */
        var parent = el.parentElement;
        for (var k = 0; k < 3; k++) {
          if (!parent) break;
          if ((parent.textContent || '').indexOf('Failed Test:') !== -1) return parent;
          parent = parent.parentElement;
        }
      }
    }
    return null;
  }

  function augment() {
    for (var key in DETAILS) {
      if (injected[key]) continue;
      var d = DETAILS[key];
      var parts  = key.split(' - ');
      var folder = parts[0];
      var req    = parts.slice(1).join(' - ');

      var target = findCard(folder, req);
      if (target && !target.querySelector('.__vfe-block')) {
        var wrap = document.createElement('div');
        wrap.innerHTML = buildHTML(d);
        target.appendChild(wrap.firstChild);
        injected[key] = true;
      }
    }
  }

  /* Run on click (tab switches reveal the failed tests section) */
  document.addEventListener('click', function () { setTimeout(augment, 400); });

  /* Run whenever Vue mutates the DOM */
  new MutationObserver(function () { setTimeout(augment, 150); })
    .observe(document.body, { childList: true, subtree: true });

  /* Initial attempt after Vue boots */
  setTimeout(augment, 800);
  setTimeout(augment, 2000);
})();
<\/script>`;

// Inject the script just before </body>
const injected = html.includes('</body>')
  ? html.replace('</body>', injectedScript + '\n</body>')
  : html + injectedScript;

fs.writeFileSync(reportPath, injected, 'utf8');
console.log(`Injected failure-detail script (${Object.keys(detailMap).length} failures): ${reportPath}`);
