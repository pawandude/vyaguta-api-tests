#!/usr/bin/env node
'use strict';

/**
 * Post-processes a newman-reporter-htmlextra report to inject full failure
 * details (method, URL, request body, response status, response body) into
 * the page as a panel that appears above the htmlextra app.
 *
 * Usage: node scripts/enhance-report.js --report <html> --results <json>
 */

const fs   = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(n) { const i = args.indexOf('--' + n); return i !== -1 ? args[i + 1] : null; }

const reportPath  = getArg('report');
const resultsPath = getArg('results');

if (!reportPath || !resultsPath) {
  console.error('Usage: node enhance-report.js --report <html> --results <json>');
  process.exit(1);
}
if (!fs.existsSync(reportPath)) { console.log('Report not found, skipping'); process.exit(0); }
if (!fs.existsSync(resultsPath)) { console.log('Results not found, skipping'); process.exit(0); }

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const html    = fs.readFileSync(reportPath, 'utf8');

const failures = results.run.failures || [];
if (failures.length === 0) { console.log('No failures — skipping injection'); process.exit(0); }

// Build execution map: itemId → execution
const execMap = {};
for (const ex of (results.run.executions || [])) {
  if (ex.item && ex.item.id) execMap[ex.item.id] = ex;
}

// Helpers
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function pretty(s) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch(e) { return String(s); } }
function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '\n… (truncated)' : s; }
function methodColor(m) {
  return ({ GET:'#0ea5e9', POST:'#16a34a', PUT:'#d97706', PATCH:'#7c3aed', DELETE:'#dc2626' })[String(m).toUpperCase()] || '#6b7280';
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

// Collect unique failures (dedupe by item id)
const seen = new Set();
const cards = [];

for (const f of failures) {
  const folder  = (f.parent && f.parent.name) || '';
  const reqName = (f.source && f.source.name) || 'Unknown';
  const testNm  = (f.error && f.error.test) || '';
  const errMsg  = (f.error && f.error.message) || '';
  const srcId   = f.source && f.source.id;
  const ex      = srcId ? execMap[srcId] : null;
  const isFirst = !seen.has(srcId || (folder + reqName));
  seen.add(srcId || (folder + reqName));

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

  const loc = folder ? folder + ' &rsaquo; ' + reqName : reqName;

  const methodBadge = method
    ? `<span style="background:${methodColor(method)};color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:4px;font-family:monospace;margin-right:8px">${esc(method)}</span>`
    : '';
  const urlSpan = rawUrl
    ? `<span style="font-size:12px;color:#93c5fd;font-family:monospace;word-break:break-all">${esc(rawUrl)}</span>`
    : '';

  const endpointRow = (method || rawUrl)
    ? `<div style="padding:8px 10px;background:#1e3a5f;border-radius:4px;margin-bottom:10px">${methodBadge}${urlSpan}</div>`
    : '';

  const reqBodyBlock = reqBody
    ? `<div style="margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Request Body</div>
        <pre style="margin:0;font-size:11px;background:#0f172a;color:#94a3b8;padding:10px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;border:1px solid #334155">${esc(reqBody)}</pre>
      </div>`
    : '';

  const sBg  = Number(statusCode) >= 400 ? '#450a0a' : '#052e16';
  const sClr = Number(statusCode) >= 400 ? '#fca5a5' : '#86efac';
  const resStatusBlock = statusCode
    ? `<div style="margin-bottom:10px">
        <span style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-right:8px">Response Status</span>
        <span style="font-size:12px;font-family:monospace;background:${sBg};color:${sClr};font-weight:700;padding:3px 10px;border-radius:4px">${esc(String(statusCode))} ${esc(statusText)}</span>
      </div>`
    : '';

  const resBodyBlock = resBody
    ? `<div style="margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Response Body</div>
        <pre style="margin:0;font-size:11px;background:#0f172a;color:#94a3b8;padding:10px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;border:1px solid #450a0a">${esc(resBody)}</pre>
      </div>`
    : '';

  const assertBlock = `<div style="padding:8px 10px;background:#450a0a;border-radius:4px;border-left:3px solid #ef4444">
      ${testNm ? `<div style="font-size:10px;color:#fca5a5;margin-bottom:4px">Test: ${esc(testNm)}</div>` : ''}
      <div style="font-size:11px;color:#fca5a5;font-family:monospace;font-weight:600">${esc(errMsg)}</div>
    </div>`;

  cards.push(`
    <div style="margin-bottom:16px;border:1px solid #ef4444;border-left:4px solid #ef4444;border-radius:0 6px 6px 0;background:#1e1e2e;padding:16px">
      <div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:12px">${loc}</div>
      ${isFirst ? endpointRow + reqBodyBlock + resStatusBlock + resBodyBlock : ''}
      ${assertBlock}
    </div>`);
}

const panelHtml = `
<div id="__vfails" style="font-family:Arial,Helvetica,sans-serif;background:#0f172a;border-bottom:3px solid #ef4444;padding:20px 24px 24px">
  <div style="max-width:900px;margin:0 auto">
    <div style="font-size:14px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px">
      &#10060; ${failures.length} Failure${failures.length !== 1 ? 's' : ''} — Full Details
    </div>
    ${cards.join('\n')}
  </div>
</div>`;

// Inject before the first <body> content (after <body> tag)
const injected = html.replace(/<body([^>]*)>/, (m, attrs) => `${m}${panelHtml}`);

fs.writeFileSync(reportPath, injected, 'utf8');
console.log(`Enhanced report with ${failures.length} failure detail(s): ${reportPath}`);
