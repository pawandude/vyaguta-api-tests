#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf('--' + name);
  return i !== -1 ? args[i + 1] : null;
}

const dir        = getArg('dir') || 'reports';
const title      = getArg('title') || 'API Tests';
const envPrefix  = getArg('env-prefix') || '';   // '' for DEV, 'QA' for QA
const runUrl     = process.env.RUN_URL || '';

function pfx(key) { return envPrefix ? envPrefix + '_' + key : key; }

// Load JSON results
function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return null; }
}

const rApi = loadJson(path.join(dir, 'results-api.json'));
const rSec = loadJson(path.join(dir, 'results-security.json'));

if (!rApi) {
  const envContent = [pfx('STATUS') + '=ERROR', pfx('SUBJECT') + '<<_SUBEOF', '❌ ' + title + ' — could not parse results', '_SUBEOF', ''].join('\n');
  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, envContent);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'email.html'), '<p>Results not found.</p>');
  process.exit(0);
}

const secStats    = rSec ? rSec.run.stats : { requests: { total: 0 }, assertions: { total: 0, failed: 0 } };
const requests    = rApi.run.stats.requests.total  + secStats.requests.total;
const assertions  = rApi.run.stats.assertions.total + secStats.assertions.total;
const failed      = rApi.run.stats.assertions.failed + secStats.assertions.failed;
const passed      = assertions - failed;
const apiMs       = rApi.run.timings.completed - rApi.run.timings.started;
const secMs       = rSec ? (rSec.run.timings.completed - rSec.run.timings.started) : 0;
const duration    = Math.round((apiMs + secMs) / 1000);
const allFailures  = [...(rApi.run.failures || []), ...(rSec ? rSec.run.failures || [] : [])];
const allExec      = [...(rApi.run.executions || []), ...(rSec ? rSec.run.executions || [] : [])];

const execMap = {};
for (const ex of allExec) {
  if (ex.item && ex.item.id) execMap[ex.item.id] = ex;
}

const status = failed === 0 ? 'PASSED' : 'FAILED';
const emoji  = failed === 0 ? '✅' : '❌';
const dash   = '—';
const subject = failed === 0
  ? emoji + ' ' + title + ' Passed ' + dash + ' ' + assertions + ' assertions, 0 failures'
  : emoji + ' ' + title + ' Failed ' + dash + ' ' + failed + ' failure(s) in ' + assertions + ' assertions';

if (process.env.GITHUB_ENV) {
  const envContent = [
    pfx('STATUS') + '=' + status,
    pfx('REQUESTS') + '=' + requests,
    pfx('ASSERTIONS') + '=' + assertions,
    pfx('PASSED') + '=' + passed,
    pfx('FAILED') + '=' + failed,
    pfx('DURATION') + '=' + duration + 's',
    pfx('SUBJECT') + '<<_SUBEOF',
    subject,
    '_SUBEOF',
    '',
  ].join('\n');
  fs.appendFileSync(process.env.GITHUB_ENV, envContent);
}
process.stdout.write('Status: ' + status + ', Passed: ' + passed + ', Failed: ' + failed + '\n');

// HTML helpers
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function methodBg(m) {
  return ({ GET:'#0ea5e9', POST:'#16a34a', PUT:'#d97706', PATCH:'#7c3aed', DELETE:'#dc2626' })[String(m).toUpperCase()] || '#6b7280';
}
function pretty(s) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch(e) { return s; } }
function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '\n… (truncated)' : s; }

function buildUrl(u) {
  if (!u) return '';
  if (typeof u === 'string') return u;
  const proto = (u.protocol || 'https') + '://';
  const host  = Array.isArray(u.host) ? u.host.join('.') : String(u.host || '');
  const pth   = Array.isArray(u.path) ? u.path.filter(Boolean).join('/') : String(u.path || '');
  const qs    = Array.isArray(u.query) && u.query.length
    ? '?' + u.query.filter(q => q && q.key).map(q => q.key + (q.value != null && q.value !== '' ? '=' + q.value : '')).join('&')
    : '';
  return proto + host + (pth ? '/' + pth : '') + qs;
}

function failureCard(f, seen) {
  const folder  = (f.parent && f.parent.name) || '';
  const reqName = (f.source && f.source.name) || 'Unknown';
  const errMsg  = (f.error && f.error.message) || 'Assertion failed';
  const testNm  = (f.error && f.error.test) || '';
  const loc     = folder ? folder + ' › ' + reqName : reqName;

  const srcId   = f.source && f.source.id;
  const ex      = srcId ? execMap[srcId] : null;
  const sentReq = ex && ex.request;
  const itemReq = ex && ex.item && ex.item.request;
  const res     = ex && ex.response;

  const method  = ((sentReq && sentReq.method) || (itemReq && itemReq.method) || '').toUpperCase();
  const rawUrl  = buildUrl((sentReq && sentReq.url) || (itemReq && itemReq.url));

  const bodyObj    = (sentReq && sentReq.body) || (itemReq && itemReq.body) || null;
  const reqBody    = bodyObj && bodyObj.raw ? trunc(pretty(bodyObj.raw), 800) : '';
  const statusCode = res && res.code != null ? res.code : '';
  const statusText = res && res.status || '';
  let resBody = '';
  if (res && res.stream) {
    try {
      const bytes = res.stream.data ? Buffer.from(res.stream.data) : Buffer.from(res.stream);
      resBody = trunc(pretty(bytes.toString('utf8')), 1200);
    } catch(e) {}
  }

  const dedupKey = srcId || loc;
  const isFirst  = !seen.has(dedupKey);
  seen.add(dedupKey);

  const badge = method
    ? '<span style="background:' + methodBg(method) + ';color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;font-family:monospace;display:inline-block;margin-right:8px;vertical-align:middle">' + esc(method) + '</span>'
    : '';
  const urlTxt = rawUrl
    ? '<span style="font-size:11px;color:#1d4ed8;font-family:monospace;word-break:break-all;vertical-align:middle">' + esc(rawUrl) + '</span>'
    : '';

  const endpointBlock = isFirst && (method || rawUrl)
    ? '<div style="margin-bottom:10px;padding:8px 10px;background:#f8fafc;border-radius:4px;border:1px solid #e5e7eb">' + badge + urlTxt + '</div>' : '';

  const reqBodyBlock = isFirst && reqBody
    ? '<details style="margin-bottom:8px"><summary style="cursor:pointer;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;padding:4px 0;list-style:none">▶ Request Body</summary><pre style="margin:4px 0 0;font-size:10px;background:#f8fafc;padding:8px;border-radius:4px;border:1px solid #e5e7eb;overflow-x:auto;white-space:pre-wrap;word-break:break-all;color:#374151">' + esc(reqBody) + '</pre></details>'
    : '';

  const sBg = statusCode >= 400 ? '#fef2f2' : '#f0fdf4';
  const sClr = statusCode >= 400 ? '#dc2626' : '#16a34a';
  const sBdr = statusCode >= 400 ? '#fecaca' : '#bbf7d0';
  const resStatusBlock = isFirst && statusCode
    ? '<div style="margin-bottom:8px"><span style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-right:8px">Response Status</span><span style="font-size:12px;font-family:monospace;background:' + sBg + ';color:' + sClr + ';font-weight:700;padding:2px 8px;border-radius:3px;border:1px solid ' + sBdr + '">' + esc(String(statusCode)) + ' ' + esc(statusText) + '</span></div>'
    : '';

  const resBodyBlock = isFirst && resBody
    ? '<details style="margin-bottom:8px"><summary style="cursor:pointer;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;padding:4px 0;list-style:none">▶ Response Body</summary><pre style="margin:4px 0 0;font-size:10px;background:#fff8f8;padding:8px;border-radius:4px;border:1px solid #fecaca;overflow-x:auto;white-space:pre-wrap;word-break:break-all;color:#374151">' + esc(resBody) + '</pre></details>'
    : '';

  return '<div style="margin-bottom:14px;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:0 6px 6px 0;background:#fff;padding:14px 16px">' +
    '<div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px">' + esc(loc) + '</div>' +
    endpointBlock + reqBodyBlock + resStatusBlock + resBodyBlock +
    '<div style="padding:8px 10px;background:#fef2f2;border-radius:4px;border:1px solid #fecaca">' +
    (testNm ? '<div style="font-size:10px;color:#9ca3af;margin-bottom:4px">Assertion: ' + esc(testNm) + '</div>' : '') +
    '<div style="font-size:11px;color:#dc2626;font-family:monospace;font-weight:600">' + esc(errMsg) + '</div>' +
    '</div></div>';
}

// Build all-tests section grouped by folder
function buildAllTestsHtml() {
  const folders = new Map();
  for (const ex of allExec) {
    const folderName = (ex.item && ex.item.parent && ex.item.parent.name) || 'General';
    if (!folders.has(folderName)) folders.set(folderName, []);
    const exAssertions = ex.assertions || [];
    let p = 0, f = 0;
    for (const a of exAssertions) { if (a.error) f++; else p++; }
    folders.get(folderName).push({ name: (ex.item && ex.item.name) || 'Unknown', passed: p, failed: f });
  }

  let html = '';
  for (const [folderName, items] of folders) {
    const fTotal = items.reduce((s, i) => s + i.failed, 0);
    const pTotal = items.reduce((s, i) => s + i.passed, 0);
    const fIcon  = fTotal > 0 ? '❌' : '✅';
    const isOpen = fTotal > 0 ? ' open' : '';

    const rows = items.map(item => {
      const icon = item.failed > 0 ? '❌' : '✅';
      return '<tr>' +
        '<td style="padding:5px 8px;font-size:12px;color:#374151;border-bottom:1px solid #f3f4f6;word-break:break-word">' + icon + ' ' + esc(item.name) + '</td>' +
        '<td style="padding:5px 8px;font-size:12px;text-align:center;color:#16a34a;border-bottom:1px solid #f3f4f6;white-space:nowrap">' + item.passed + '</td>' +
        '<td style="padding:5px 8px;font-size:12px;text-align:center;color:' + (item.failed > 0 ? '#dc2626' : '#9ca3af') + ';border-bottom:1px solid #f3f4f6;white-space:nowrap">' + item.failed + '</td>' +
        '</tr>';
    }).join('');

    html += '<details' + isOpen + ' style="margin-bottom:6px">' +
      '<summary style="cursor:pointer;padding:8px 12px;background:#f8fafc;border-radius:4px;border:1px solid #e5e7eb;font-size:13px;font-weight:600;list-style:none;user-select:none">' +
      fIcon + ' ' + esc(folderName) +
      '<span style="color:#6b7280;font-weight:400;font-size:12px"> — ' + pTotal + ' passed' + (fTotal > 0 ? ', <span style="color:#dc2626">' + fTotal + ' failed</span>' : '') + '</span>' +
      '</summary>' +
      '<div style="padding:6px 0 2px">' +
      '<table style="width:100%;border-collapse:collapse">' +
      '<thead><tr>' +
      '<th style="padding:4px 8px;text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:600">Request</th>' +
      '<th style="padding:4px 8px;text-align:center;font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:600">Pass</th>' +
      '<th style="padding:4px 8px;text-align:center;font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:600">Fail</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></details>';
  }
  return html;
}

// Compose HTML
const color   = failed === 0 ? '#16a34a' : '#dc2626';
const bgColor = failed === 0 ? '#f0fdf4' : '#fef2f2';

const statsRows = [
  ['Requests', requests],
  ['Assertions', assertions],
  ['Passed', passed],
  ['Failed', failed],
  ['Duration', duration + 's'],
].map(([k, v]) => {
  const isFail = k === 'Failed' && Number(v) > 0;
  return '<tr><td style="padding:10px 20px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6">' + k + '</td>' +
    '<td style="padding:10px 20px;font-weight:700;font-size:14px;color:' + (isFail ? '#dc2626' : '#111827') + ';border-bottom:1px solid #f3f4f6">' + v + '</td></tr>';
}).join('');

// Failures section (open by default when there are failures)
let failuresSection = '';
if (failed > 0 && allFailures.length > 0) {
  const seen = new Set();
  const cards = allFailures.map(f => failureCard(f, seen)).join('');
  failuresSection = '<details open style="border-top:3px solid #dc2626">' +
    '<summary style="cursor:pointer;padding:14px 24px;background:#fef2f2;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#b91c1c;list-style:none;user-select:none">❌ Failed Tests (' + allFailures.length + ')</summary>' +
    '<div style="padding:16px 24px;background:#fef2f2">' + cards + '</div></details>';
}

// All-tests section (collapsed by default)
const allTestsSection = '<details style="border-top:1px solid #e5e7eb">' +
  '<summary style="cursor:pointer;padding:14px 24px;background:#f8fafc;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#374151;list-style:none;user-select:none">' +
  '📋 All Tests — ' + passed + ' passed' + (failed > 0 ? ', ' + failed + ' failed' : '') + ' of ' + assertions + ' assertions</summary>' +
  '<div style="padding:16px 24px">' + buildAllTestsHtml() + '</div></details>';

const html =
  '<!DOCTYPE html><html><body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6">' +
  '<div style="max-width:660px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">' +
  // Header
  '<div style="background:' + color + ';padding:26px 32px">' +
  '<div style="font-size:24px;font-weight:700;color:#fff">' + emoji + ' ' + esc(title) + ' ' + status + '</div>' +
  '<div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:6px">' + requests + ' requests &nbsp;·&nbsp; ' + duration + 's</div>' +
  '</div>' +
  // Stats
  '<div style="background:' + bgColor + ';padding:0"><table style="width:100%;border-collapse:collapse">' + statsRows + '</table></div>' +
  // Failures (expanded)
  failuresSection +
  // All tests (collapsed)
  allTestsSection +
  // Footer
  '<div style="padding:24px 32px;border-top:1px solid #f3f4f6">' +
  '<a href="' + esc(runUrl) + '" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:600;margin-right:10px">Download HTML Reports</a>' +
  '<a href="' + esc(runUrl) + '" style="display:inline-block;background:#f3f4f6;color:#374151;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:600">View Run</a>' +
  '</div></div></body></html>';

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'email.html'), html);
console.log('Email report written to ' + path.join(dir, 'email.html'));
