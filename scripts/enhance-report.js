#!/usr/bin/env node
'use strict';

/**
 * Post-processes a newman-reporter-htmlextra report by directly injecting
 * failure details (endpoint, request body, response status, response body)
 * into the static HTML string — no browser-side JS needed.
 *
 * The htmlextra failure card structure (Bootstrap):
 *   div.card.border-danger
 *     div.card-header.bg-danger  ← contains "Folder - Request" text
 *     div.collapse
 *       div.card-body            ← inject here, before closing </div>
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
  const host  = Array.isArray(u.host) ? u.host.join('.') : String(u.host || '');
  const pth   = Array.isArray(u.path) ? u.path.filter(Boolean).join('/') : String(u.path || '');
  const qs    = Array.isArray(u.query) && u.query.length
    ? '?' + u.query.filter(q => q && q.key).map(q => q.key + (q.value != null && q.value !== '' ? '=' + q.value : '')).join('&')
    : '';
  const proto = (u.protocol || 'https') + '://';
  return proto + host + (pth ? '/' + pth : '') + qs;
}
function pretty(s) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch(e) { return String(s); } }
function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '\n… (truncated)' : s; }
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Find the closing </div> position for the card-body after the given offset.
// Counts nested divs so we land on the right closing tag.
function findCardBodyClose(html, afterIdx) {
  const OPEN  = '<div';
  const CLOSE = '</div>';
  const marker = '<div class="card-body">';
  const start = html.indexOf(marker, afterIdx);
  if (start === -1) return -1;

  let pos   = start + marker.length;
  let depth = 1;
  while (depth > 0 && pos < html.length) {
    const nextOpen  = html.indexOf(OPEN,  pos);
    const nextClose = html.indexOf(CLOSE, pos);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + OPEN.length;
    } else {
      depth--;
      if (depth === 0) return nextClose; // position of the matching </div>
      pos = nextClose + CLOSE.length;
    }
  }
  return -1;
}

// Build Bootstrap card HTML matching htmlextra's own styling
function buildDetailHtml(d) {
  const sIsErr  = Number(d.statusCode) >= 400;
  const sBadge  = sIsErr ? 'badge-danger' : 'badge-success';
  const resCard = sIsErr ? 'border-danger' : 'border-info';
  const resBg   = sIsErr ? 'bg-danger'     : 'bg-info';

  const reqInfo = (d.method || d.url) ? `
<div class="row"><div class="col-sm-12 mb-3"><div class="card-deck">
  <div class="card border-info" style="width:50rem">
    <div class="card-body">
      <h5 class="card-title text-uppercase text-white text-center bg-info">Request Information</h5>
      ${d.method ? `<span><i class="fas fa-info-circle"></i></span><strong> Request Method:</strong> <span class="badge-outline-success badge badge-success">${esc(d.method)}</span><br>` : ''}
      ${d.url    ? `<span><i class="fas fa-info-circle"></i></span><strong> Request URL:</strong> <a href="${esc(d.url)}" target="_blank">${esc(d.url)}</a><br>` : ''}
    </div>
  </div>
</div></div></div>` : '';

  const resInfo = d.statusCode ? `
<div class="row"><div class="col-sm-12 mb-3"><div class="card-deck">
  <div class="card border-info" style="width:50rem">
    <div class="card-body">
      <h5 class="card-title text-uppercase text-white text-center bg-info">Response Information</h5>
      <span><i class="fas fa-info-circle"></i></span><strong> Response Code:</strong>
      <span class="float-right badge-outline badge ${sBadge}">${esc(d.statusCode)} - ${esc(d.statusText)}</span><br>
    </div>
  </div>
</div></div></div>` : '';

  const reqBody = d.reqBody ? `
<div class="row"><div class="col-sm-12 mb-3"><div class="card-deck">
  <div class="card border-info" style="width:50rem">
    <div class="card-body">
      <h5 class="card-title text-uppercase text-white text-center bg-info">Request Body</h5>
      <div class="dyn-height"><pre><code>${esc(d.reqBody)}</code></pre></div>
    </div>
  </div>
</div></div></div>` : '';

  const resBody = d.resBody ? `
<div class="row"><div class="col-sm-12 mb-3"><div class="card-deck">
  <div class="card ${resCard}" style="width:50rem">
    <div class="card-body">
      <h5 class="card-title text-uppercase text-white text-center ${resBg}">Response Body</h5>
      <div class="dyn-height"><pre><code>${esc(d.resBody)}</code></pre></div>
    </div>
  </div>
</div></div></div>` : '';

  return reqInfo + resInfo + reqBody + resBody;
}

// Process each unique failure and inject into the HTML string
let html = fs.readFileSync(reportPath, 'utf8');
const seen = new Set();
let injectCount = 0;

for (const f of failures) {
  const folder  = (f.parent && f.parent.name) || '';
  const reqName = (f.source && f.source.name) || '';
  const mapKey  = `${folder} - ${reqName}`;
  if (seen.has(mapKey)) continue;
  seen.add(mapKey);

  // Collect request/response detail
  const srcId   = f.source && f.source.id;
  const ex      = srcId ? execMap[srcId] : null;
  const sentReq = ex && ex.request;
  const itemReq = ex && ex.item && ex.item.request;
  const res     = ex && ex.response;

  const method     = ((sentReq && sentReq.method) || (itemReq && itemReq.method) || '').toUpperCase();
  const rawUrl     = buildUrl((sentReq && sentReq.url) || (itemReq && itemReq.url));
  const bodyObj    = (sentReq && sentReq.body) || (itemReq && itemReq.body) || null;
  const reqBody    = bodyObj && bodyObj.raw ? trunc(pretty(bodyObj.raw), 1000) : '';
  const statusCode = res && res.code != null ? String(res.code) : '';
  const statusText = (res && res.status) || '';
  let   resBody    = '';
  if (res && res.stream) {
    try {
      const bytes = res.stream.data ? Buffer.from(res.stream.data) : Buffer.from(res.stream);
      resBody = trunc(pretty(bytes.toString('utf8')), 1500);
    } catch(e) {}
  }

  // Find the failure card header text in the HTML:
  // "FolderName - RequestName" is in the <a> inside card-header.bg-danger
  const markerText = folder + ' - ' + reqName;
  const markerIdx  = html.indexOf(markerText);
  if (markerIdx === -1) {
    console.warn(`  Could not find marker for: ${markerText}`);
    continue;
  }

  // Find the closing </div> of the card-body after this marker
  const closeIdx = findCardBodyClose(html, markerIdx);
  if (closeIdx === -1) {
    console.warn(`  Could not find card-body close for: ${markerText}`);
    continue;
  }

  const detailHtml = buildDetailHtml({ method, url: rawUrl, reqBody, statusCode, statusText, resBody });
  if (!detailHtml.trim()) continue;

  // Insert the detail HTML just before the card-body closing </div>
  html = html.slice(0, closeIdx) + detailHtml + '\n' + html.slice(closeIdx);
  injectCount++;
  console.log(`  Injected details for: ${mapKey}`);
}

fs.writeFileSync(reportPath, html, 'utf8');
console.log(`Done. Injected into ${injectCount} failure card(s): ${reportPath}`);
