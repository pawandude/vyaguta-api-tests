#!/usr/bin/env node
'use strict';
/**
 * Rebuilds the Health and Sanity folders in the main collection and their
 * standalone module files so they contain only P1 + P2 priority endpoints.
 *
 * Health  → status 200 only ("endpoint is up")
 * Sanity  → status 200 + Content-Type check ("endpoint is reachable")
 */

const fs   = require('fs');
const path = require('path');

// ── ENDPOINT LIST (P1 + P2 only) ──────────────────────────────────────────
// Format: { label, url }
// label = human-readable name prefix, url = path after {{baseUrl}} (may include query string)
// Grouped by module for readability; order preserved in output.

const ENDPOINTS = [
  // ── Core P1 ──
  { label: 'Core — users',                           url: '/api/core/users' },
  { label: 'Core — user profile',                    url: '/api/core/users/{{personId}}' },
  { label: 'Core — holidays',                        url: '/api/core/holidays' },
  { label: 'Core — user dashboard (me/info)',         url: '/api/core/me/info?types=permissions,reminders,notices' },
  { label: 'Core — engagement status',               url: '/api/core/engagement-status' },
  { label: 'Core — designations',                    url: '/api/core/designations?size=1000' },
  { label: 'Core — designation areas',               url: '/api/core/designation-areas' },
  { label: 'Core — users summary',                   url: '/api/core/users/summary' },
  // ── Core P2 ──
  { label: 'Core — people finder',                   url: '/api/core/people-finder?page=1' },
  { label: 'Core — skills (v2)',                     url: '/api/core/skills/v2' },
  { label: 'Core — user roles',                      url: '/api/core/users/{{personId}}/roles' },
  { label: 'Core — leave issuer change requests',    url: '/api/core/leave-issuers/change-requests' },
  { label: 'Core — user skills (v2)',                url: '/api/core/users/{{personId}}/skills/v2' },
  { label: 'Core — user resignations',               url: '/api/core/users/{{personId}}/resignations' },

  // ── Teams P1 ──
  { label: 'Teams — status types',                   url: '/api/teams/status-types' },
  { label: 'Teams — projects',                       url: '/api/teams/projects?size=5' },
  { label: 'Teams — project detail',                 url: '/api/teams/projects/{{projectId}}' },
  { label: 'Teams — project health trend',           url: '/api/teams/projects/health-trend?startDate={{today}}&endDate={{futureDate365}}&metric=Overall+Status&size=10&page=1' },
  { label: 'Teams — project highlights/feed',        url: '/api/teams/projects/feed?size=10' },
  { label: 'Teams — project offboards',              url: '/api/teams/projects/{{projectId}}/offboards' },
  { label: 'Teams — project staffing',               url: '/api/teams/projects/{{projectId}}/staffing?size=5' },
  { label: 'Teams — allocations',                    url: '/api/teams/allocations?size=5&startDate={{today}}&endDate={{futureDate365}}' },
  { label: 'Teams — staffing',                       url: '/api/teams/staffing?size=5' },
  { label: 'Teams — staffing request detail',        url: '/api/teams/staffing/{{staffingRequestId}}' },
  { label: 'Teams — candidates',                     url: '/api/teams/candidates?size=5' },
  { label: 'Teams — candidates bookable',            url: '/api/teams/candidates/bookable?size=5' },
  { label: 'Teams — lateral candidates (ATS)',        url: '/api/teams/lateral-candidates?size=10' },
  // ── Teams P2 ──
  { label: 'Teams — working shift summary',          url: '/api/teams/projects/summary?type=working-shift' },
  { label: 'Teams — employee morale',                url: '/api/leave/employee-morale?startDate={{today}}&endDate={{futureDate365}}&excludedDepartmentIds=14' },
  { label: 'Teams — phases',                         url: '/api/teams/phases?projectId={{projectId}}' },
  { label: 'Teams — project risks',                  url: '/api/teams/projects/{{projectId}}/risks' },
  { label: 'Teams — project opportunities',          url: '/api/teams/projects/{{projectId}}/opportunities' },
  { label: 'Teams — PSRs',                           url: '/api/teams/psrs?projectId={{projectId}}' },
  { label: 'Teams — QSRs',                           url: '/api/teams/qsrs?projectId={{projectId}}' },
  { label: 'Teams — allocation summary report',      url: '/api/teams/reports/allocation-summary-reports?year={{currentYear}}' },
  { label: 'Teams — allocation report',              url: '/api/teams/reports/allocation-reports?startDate={{today}}&endDate={{futureDate180}}' },
  { label: 'Teams — project signoff detail',         url: '/api/teams/projects/{{projectId}}/signoff?year={{currentYear}}&month={{currentMonth}}' },
  { label: 'Teams — signoff summary',                url: '/api/teams/signoff?year={{currentYear}}&month={{currentMonth}}' },
  { label: 'Teams — staffing linked candidates',     url: '/api/teams/staffing/{{staffingRequestId}}/candidates' },
  { label: 'Teams — roles',                          url: '/api/teams/roles' },

  // ── Attendance P1 ──
  { label: 'Attendance — attendance summary',        url: '/api/leave/attendance/summary?fetchType=self' },
  { label: 'Attendance — leaves',                    url: '/api/leave/leaves' },
  { label: 'Attendance — remote applications',       url: '/api/leave/remote-applications' },
  { label: 'Attendance — worklog involvements',      url: '/api/leave/worklogs/involvements' },
  { label: 'Attendance — worklog unfreeze requests', url: '/api/leave/worklog-unfreeze-requests' },
  { label: 'Attendance — leave transfer requests',   url: '/api/leave/leave-transfer-requests?fiscalYearId=1' },
  // ── Attendance P2 ──
  { label: 'Attendance — leave balance',             url: '/api/leave/leave-balance?fiscalYearId={{fiscalYearId}}&userId={{userId}}&onlyActive=true' },
  { label: 'Attendance — well-being credits',        url: '/api/leave/leave-credits/well-being?userId={{userId}}&fiscalYearId={{fiscalYearId}}' },
  { label: 'Attendance — worklog allocation report', url: '/api/leave/worklogs/allocation-details-report?startDate={{today}}&endDate={{today}}&projectId={{projectId}}' },

  // ── OKR P1 ──
  { label: 'OKR — highlights',                       url: '/api/okr/highlights?page=1&size=10&year={{currentYear}}' },
  { label: 'OKR — strategic pillars',                url: '/api/okr/strategic-pillars/all?year={{currentYear}}' },
  { label: 'OKR — strategic pillars summary',        url: '/api/okr/strategic-pillars/summary?year={{currentYear}}' },
  { label: 'OKR — HLO (objectives)',                 url: '/api/okr/hlo?quarters=Q4&with=objectives&year={{currentYear}}' },
  { label: 'OKR — areas (team)',                     url: '/api/okr/areas?type=team&additionalFields=leaderships,objectiveCount' },
  { label: 'OKR — areas (pod)',                      url: '/api/okr/areas?type=pod&additionalFields=leaderships,objectiveCount' },
  // ── OKR P2 ──
  { label: 'OKR — report/all',                       url: '/api/okr/report/all?quarters=Q4&year={{currentYear}}' },

  // ── Pulse P1 ──
  { label: 'Pulse — evaluations groups',             url: '/api/pulse/evaluations/groups' },
  { label: 'Pulse — team dashboard',                 url: '/api/pulse/dashboard?startDate={{today}}&endDate={{futureDate365}}' },
  { label: 'Pulse — user pulse',                     url: '/api/pulse/user/{{personId}}/pulse' },
  { label: 'Pulse — appraiser check',                url: '/api/pulse/appraiser-nominations/check-evaluation?subjectId={{personId}}&areaId=4' },
  { label: 'Pulse — pulse allocations',              url: '/api/pulse/pulse-allocations/{{personId}}' },
  { label: 'Pulse — PIP report',                     url: '/api/pulse/pulse-report/pip?page=1&size=10' },
  { label: 'Pulse — promotion',                      url: '/api/pulse/promotion?startDate={{today}}&endDate={{futureDate365}}&actionAs=appraiser' },
  { label: 'Pulse — feedback notes',                 url: '/api/pulse/notes?noteType=EXPECTATION&subjectId={{personId}}' },
  { label: 'Pulse — expectations',                   url: '/api/pulse/expectations?designationId=5&areaId=2' },
  // ── Pulse P2 ──
  { label: 'Pulse — pulse report',                   url: '/api/pulse/pulse-report?page=1&size=10' },
];

// ── REQUEST BUILDERS ──────────────────────────────────────────────────────

function buildUrl(rawPath) {
  const full = '{{baseUrl}}' + rawPath;
  const [pathPart, queryStr] = rawPath.split('?');
  const pathSegments = pathPart.split('/').filter(Boolean);
  const obj = { raw: full, host: ['{{baseUrl}}'], path: pathSegments };
  if (queryStr) {
    obj.query = queryStr.split('&').map(kv => {
      const eq = kv.indexOf('=');
      return eq === -1
        ? { key: kv, value: '' }
        : { key: kv.slice(0, eq), value: kv.slice(eq + 1) };
    });
  }
  return obj;
}

function healthRequest(ep) {
  return {
    name: ep.label + ' endpoint is up',
    request: { method: 'GET', header: [], url: buildUrl(ep.url) },
    event: [{
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          'pm.test("Status is 200", function () { pm.response.to.have.status(200); });',
          'pm.test("Response time is below 5000ms", function () { pm.expect(pm.response.responseTime).to.be.below(5000); });',
        ],
      },
    }],
  };
}

function sanityRequest(ep) {
  return {
    name: ep.label + ' is reachable',
    request: { method: 'GET', header: [], url: buildUrl(ep.url) },
    event: [{
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          'pm.test("Status is 200", function () { pm.response.to.have.status(200); });',
          'pm.test("Content-Type is application/json", function () { pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json"); });',
          'pm.test("Response time is below 5000ms", function () { pm.expect(pm.response.responseTime).to.be.below(5000); });',
        ],
      },
    }],
  };
}

const healthItems  = ENDPOINTS.map(healthRequest);
const sanityItems  = ENDPOINTS.map(sanityRequest);

// ── UPDATE MAIN COLLECTION ────────────────────────────────────────────────

const mainPath = path.join(__dirname, '..', 'collections', 'vyaguta-api.postman_collection.json');
const main = JSON.parse(fs.readFileSync(mainPath, 'utf8'));

for (const folder of main.item) {
  if (folder.name && folder.name.toLowerCase() === 'health' && folder.item) {
    folder.item = healthItems;
    console.log('Updated main collection Health folder:', healthItems.length, 'requests');
  }
  if (folder.name && folder.name.toLowerCase() === 'sanity' && folder.item) {
    folder.item = sanityItems;
    console.log('Updated main collection Sanity folder:', sanityItems.length, 'requests');
  }
}

fs.writeFileSync(mainPath, JSON.stringify(main, null, 2), 'utf8');
console.log('Written:', mainPath);

// ── UPDATE MODULE: 01-health ──────────────────────────────────────────────

const healthModPath = path.join(__dirname, '..', 'collections', 'modules', '01-health.postman_collection.json');
const healthMod = JSON.parse(fs.readFileSync(healthModPath, 'utf8'));
healthMod.item = healthItems;
fs.writeFileSync(healthModPath, JSON.stringify(healthMod, null, 2), 'utf8');
console.log('Written:', healthModPath);

// ── UPDATE MODULE: 02-sanity ──────────────────────────────────────────────

const sanityModPath = path.join(__dirname, '..', 'collections', 'modules', '02-sanity.postman_collection.json');
const sanityMod = JSON.parse(fs.readFileSync(sanityModPath, 'utf8'));
sanityMod.item = sanityItems;
fs.writeFileSync(sanityModPath, JSON.stringify(sanityMod, null, 2), 'utf8');
console.log('Written:', sanityModPath);

console.log('\nDone. Health:', healthItems.length, 'requests | Sanity:', sanityItems.length, 'requests');
console.log('Dropped: JUMP (P3), Honor (P3), Core departments/fiscal-years/notices/reminders (P3/P4)');
console.log('Added:   holidays, me/info, user profile, leaves, remote-applications, worklog endpoints,');
console.log('         unfreeze, leave-balance, well-being, people-finder, skills, resignations,');
console.log('         OKR highlights/HLO/pillars-summary, Pulse pulse-report, Core user-roles/skills');
