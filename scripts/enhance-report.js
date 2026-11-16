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

  /* htmlextra uses Bootstrap cards. Each failure card:
     .card.border-danger > .card-header.bg-danger (has "Folder - Request" text)
                         > div.collapse > .card-body  (inject here)
  */

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* Build HTML matching htmlextra's own Bootstrap card style exactly */
  function buildHTML(d) {
    var sIsErr   = Number(d.statusCode) >= 400;
    var sBadge   = sIsErr ? 'badge-danger' : 'badge-success';

    var reqInfo = (d.method || d.url) ? (
      '<div class="row"><div class="col-sm-12 mb-3"><div class="card-deck">'
      + '<div class="card border-info" style="width:50rem">'
      + '<div class="card-body">'
      + '<h5 class="card-title text-uppercase text-white text-center bg-info">Request Information</h5>'
      + (d.method ? '<span><i class="fas fa-info-circle"></i></span>'
        + '<strong> Request Method:</strong> '
        + '<span class="badge-outline-success badge badge-success">' + esc(d.method) + '</span><br>' : '')
      + (d.url ? '<span><i class="fas fa-info-circle"></i></span>'
        + '<strong> Request URL:</strong> '
        + '<a href="' + esc(d.url) + '" target="_blank">' + esc(d.url) + '</a><br>' : '')
      + '</div></div></div></div></div>'
    ) : '';

    var resInfo = d.statusCode ? (
      '<div class="row"><div class="col-sm-12 mb-3"><div class="card-deck">'
      + '<div class="card border-info" style="width:50rem">'
      + '<div class="card-body">'
      + '<h5 class="card-title text-uppercase text-white text-center bg-info">Response Information</h5>'
      + '<span><i class="fas fa-info-circle"></i></span>'
      + '<strong> Response Code:</strong> '
      + '<span class="float-right badge-outline badge ' + sBadge + '">'
      + esc(d.statusCode) + ' - ' + esc(d.statusText) + '</span><br>'
      + '</div></div></div></div></div>'
    ) : '';

    var reqBody = d.reqBody ? (
      '<div class="row"><div class="col-sm-12 mb-3"><div class="card-deck">'
      + '<div class="card border-info" style="width:50rem">'
      + '<div class="card-body">'
      + '<h5 class="card-title text-uppercase text-white text-center bg-info">Request Body</h5>'
      + '<div class="dyn-height"><pre><code>' + esc(d.reqBody) + '</code></pre></div>'
      + '</div></div></div></div></div>'
    ) : '';

    var resBody = d.resBody ? (
      '<div class="row"><div class="col-sm-12 mb-3"><div class="card-deck">'
      + '<div class="card ' + (sIsErr ? 'border-danger' : 'border-info') + '" style="width:50rem">'
      + '<div class="card-body">'
      + '<h5 class="card-title text-uppercase text-white text-center ' + (sIsErr ? 'bg-danger' : 'bg-info') + '">Response Body</h5>'
      + '<div class="dyn-height"><pre><code>' + esc(d.resBody) + '</code></pre></div>'
      + '</div></div></div></div></div>'
    ) : '';

    return '<div class="__vfe-block">' + reqInfo + resInfo + reqBody + resBody + '</div>';
  }

  var injected = {};

  function findCardBody(folder, req) {
    /* The failure card header has class "card-header bg-danger" and contains
       "Iteration N - AssertionError - FolderName - RequestName"
       Navigate: header.parentElement = .card, then find .card-body inside it. */
    var headers = document.querySelectorAll('.card-header.bg-danger');
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      var t = h.textContent || '';
      if (t.indexOf(folder) !== -1 && t.indexOf(req) !== -1) {
        var card = h.parentElement; /* .card.border-danger */
        if (card) {
          var body = card.querySelector('.card-body');
          if (body) return body;
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

      var target = findCardBody(folder, req);
      if (target && !target.querySelector('.__vfe-block')) {
        var wrap = document.createElement('div');
        wrap.innerHTML = buildHTML(d);
        target.appendChild(wrap.firstChild);
        injected[key] = true;
      }
    }
  }

  /* Fire on tab click (Bootstrap shows the collapse when tab is selected) */
  document.addEventListener('click', function () { setTimeout(augment, 400); });

  /* Fire when Bootstrap collapse finishes opening */
  document.addEventListener('shown.bs.collapse', augment);

  /* Fallback timers */
  setTimeout(augment, 800);
  setTimeout(augment, 2500);
})();
<\/script>`;

// Inject the script just before </body>
const injected = html.includes('</body>')
  ? html.replace('</body>', injectedScript + '\n</body>')
  : html + injectedScript;

fs.writeFileSync(reportPath, injected, 'utf8');
console.log(`Injected failure-detail script (${Object.keys(detailMap).length} failures): ${reportPath}`);
