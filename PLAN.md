# Plan: vyaguta-api-tests

## Context
`vyaguta-api-tests` is a Postman/Newman API test suite for the Vyaguta API. It reuses the framework from `../jsonplaceholder-api-tests`. Decisions made at setup:
- **Scope:** only the framework was copied. The collection starts empty, with no JSONPlaceholder requests.
- **Vyaguta API:** details weren't known yet, so it uses placeholders (`{{baseUrl}}`, plus `{{authToken}}` as a Bearer token).
- **Claude setup:** a `CLAUDE.md`, a `.claude/` folder and a memory folder, so Claude sessions follow the framework's conventions.
- **Git:** none. Files were created only, with no `git init`, commit or push.

## Status: framework enhanced (2026-10-01)

## Structure
```
vyaguta-api-tests/
├── .claude/settings.json                      # Claude permissions for npm/newman commands
├── .github/
│   ├── workflows/api-tests.yml                # full regression, daily at 06:00 UTC
│   └── workflows/health-check.yml             # health checks, every 2 hours
├── .gitignore
├── .nvmrc                                     # Node 20
├── CLAUDE.md                                  # framework conventions for Claude sessions
├── PLAN.md                                    # this file
├── README.md
├── collections/vyaguta-api.postman_collection.json  # single collection, all modules
├── environments/
│   └── vyaguta.postman_environment.json       # dev environment (baseUrl + authToken)
├── package.json
└── reports/                                   # generated, gitignored
```

## Completed
- [x] Framework scaffolded from jsonplaceholder-api-tests
- [x] Collection folder structure: Sanity, Health, People, Team, Attendance, JUMP, Honor, OKR, Pulse, Behavior & Edge Cases
- [x] Module-level npm scripts (`test:sanity`, `test:health`, `test:people`, etc.)
- [x] Health check CI workflow (`health-check.yml`, every 2 hours)
- [x] Auth negative tests scaffolded in Behavior & Edge Cases (missing token, invalid token)
- [x] Lint script updated to validate all files in `environments/`
- [x] README updated: single-file rationale, Postman organization tips, module coverage tables, Endpoints section per module
- [x] Environment files for QA and UAT (`vyaguta-qa.postman_environment.json`, `vyaguta-uat.postman_environment.json`)
- [x] Token automation pre-request script stub added at collection level (commented, activate once login endpoint is confirmed)
- [x] Version control initialised; initial commit pushed — ready to add remote and push to GitHub
- [x] `loginEmail` and `loginPassword` variables added to all three environment files (dev, qa, uat)
- [x] Module-specific ID variables added to all environment files: `personId`, `teamId`, `attendanceId`, `jumpId`, `honorId`, `okrId`, `keyResultId`, `pulseId`
- [x] Slack failure notifications added to `api-tests.yml` and `health-check.yml` (requires `SLACK_WEBHOOK_URL` repo secret)
- [x] `npm audit` reviewed — 21 vulnerabilities (8 moderate, 12 high, 1 critical) all inside Newman's own dependency tree; the only fix downgrades Newman to 4.6.1 (breaking change). Leaving as-is; revisit when Newman ships a non-breaking fix.

## Pending (version control)
- [ ] Create GitHub repository and add remote: `git remote add origin <url>`
- [ ] Push: `git push -u origin main`
- [ ] Add `VYAGUTA_TOKEN` secret under repo Settings → Secrets and variables → Actions
- [ ] Trigger **Run workflow** manually once to verify CI end-to-end
- [x] Sanity CI workflow (`sanity-check.yml`) — triggers on push/PR to main; runs `--folder Sanity`; Slack on failure. Will be a no-op until Sanity folder has real requests.


## Framework Enhancement Goals

### 1. Sanity API Tests

A lightweight smoke layer that confirms the API is reachable and core flows work — runs in seconds.

- Add a `Sanity` folder in the collection with one representative request per module (e.g. `GET /employees`, `GET /leaves`, `GET /projects`)
- Each request asserts only: status 200, `Content-Type`, and non-empty response body — no deep schema validation
- Run independently via `--folder Sanity` Newman flag
- Add `"test:sanity"` script to `package.json`
- Trigger on every PR/push for fast feedback; reserve full suite for the daily schedule

### 2. Health API Checks — Daily

Keep the existing daily cron but separate health from regression:

- Add a `Health` folder (or `vyaguta-health.postman_collection.json`) with one lightweight GET per critical endpoint
- Add a second workflow `health-check.yml` running every 2 hours (full regression stays at 06:00 UTC daily)
- Enable GitHub failure notifications or add a Slack/email step on failure

### 3. Module-Based Test Structure

One collection folder per Vyaguta domain module:

```
Sanity/
Health/
Employees/
Leave Management/
Projects/
Attendance/
Roles & Permissions/
Behavior & Edge Cases/
```

Each folder maps to a Newman `--folder` run. Add module-level scripts to `package.json`:

```json
"test:sanity":    "newman run collections/... --folder Sanity ...",
"test:health":    "newman run collections/... --folder Health ...",
"test:employees": "newman run collections/... --folder Employees ...",
"test:leave":     "newman run collections/... --folder 'Leave Management' ..."
```

### 4. Undocumented Endpoint Discovery

Use multiple methods to surface routes the API doesn't document:

**a) Browser HAR capture (primary)**
- Open the Vyaguta web app in Chrome DevTools → Network tab, filter XHR/Fetch
- Navigate through every UI module and capture all API calls
- Export as HAR → import into Postman (Import → File → HAR)

**b) Postman Interceptor**
- Install the browser extension; it pushes captured requests directly into your Postman workspace with real headers, tokens, and payloads

**c) Swagger/OpenAPI probe**
- Try `{{baseUrl}}/swagger`, `/api-docs`, `/openapi.json`, `/v1/docs`, `/docs` in the browser
- Check `robots.txt` and compiled JS bundles for route strings

**d) Proxy (mitmproxy / Charles)**
- Route traffic through a local proxy to capture all calls, including from mobile clients if Vyaguta has them

**e) Backend source (if accessible)**
- Ask the backend team for a route dump or Swagger export; a grep of route definitions is faster than manual discovery

All discovered-but-undocumented endpoints go in the README under `Endpoints` with a note marking them as discovered (not officially documented).

### 5. Coverage Requirements

Coverage checklist per endpoint:

| Layer | Assertions required |
|---|---|
| Status codes | Happy path + 400, 401, 403, 404, 422 where applicable |
| Schema | Every field including optional and nested objects |
| Filters | Each query param — assert results actually match the filter |
| Pagination | Page size, total count, `next`/`prev` links |
| Write ops | Response echoes submitted fields; follow-up GET confirms persistence |
| Auth | Missing token → 401; invalid token → 401; wrong role → 403 |
| Edge cases | Non-existent ID → 404; malformed body → 400/422; boundary values |

Track coverage in the README `Test coverage` table (one row per endpoint, columns per layer).

---

## Sequencing

| Phase | Work | Status |
|---|---|---|
| **Pre-access** | Scaffold module folders, npm scripts, health CI workflow, lint improvements, README structure | Done |
| **Week 1** | Gain app access; discover all endpoints via HAR + Swagger probe; confirm user roles; fill `baseUrl` | Pending |
| **Week 2** | Write real Sanity and Health requests; fill Behavior & Edge Cases auth tests with real endpoints and roles | Pending |
| **Week 3+** | Fill each module folder: read-only GETs first, then write operations | Pending |
| **Ongoing** | Document quirks in README "Known behavior"; update coverage table per endpoint added | Ongoing |

---

## First-Session Checklist (on app access)

1. Grab the base URL for dev/staging and confirm network access
2. Log in, capture the Bearer token from DevTools (Network → any request → `Authorization` header); note expiry
3. Run the HAR capture — click through every module, then export
4. Probe for Swagger at common paths
5. Fill `baseUrl` and `authToken` into `environments/vyaguta.postman_environment.json` and run `npm test` to confirm end-to-end

---

## Outstanding gaps — implementation steps by priority

### P1 — Write real requests per module
> Blocked on app access. Primary deliverable of Weeks 2–3+.

Follow this sequence for each module folder (People → Team → Attendance → JUMP → Honor → OKR → Pulse):

1. **List endpoints** — add discovered routes to the README Endpoints section for the module
2. **Read-only GETs first:**
   - List endpoint: assert 200, `Content-Type: application/json`, schema for every item, non-empty array
   - Single-record endpoint: assert 200, schema, correct ID in response
   - Filter params: assert every returned item matches the filter value
   - Pagination: assert page size, total count, presence of next/prev links
3. **Sanity request** — add one lightweight GET for the module to the `Sanity` folder (status 200, non-empty body only)
4. **Health request** — add one lightweight GET for the module to the `Health` folder
5. **Write operations (POST/PUT/PATCH/DELETE):**
   - Assert response echoes submitted fields
   - Follow up with a GET to confirm persistence
   - Clean up created data at the end of the test (use a `pm.test` + `pm.sendRequest` teardown or a separate DELETE request)
6. **Edge cases** — add to `Behavior & Edge Cases`: non-existent ID → 404, malformed body → 400/422
7. **Update README** — add a row per request to the module's Test coverage table

---

### P2 — Confirm user roles and write 403 tests
> Blocked on app access. Do this in Week 1 alongside HAR capture.

1. Log in to Vyaguta with an admin account and list all available roles (check Settings, Admin panel, or ask the backend team)
2. For each role, identify which modules and endpoints it can and cannot access
3. Create a test user per restricted role in the dev environment (or get credentials from the team)
4. Add the role credentials as environment variables (e.g. `readOnlyEmail`, `readOnlyPassword`) — never commit filled-in values
5. In `Behavior & Edge Cases`, add one 403 test per meaningful restriction:
   ```
   <Role> cannot access <endpoint> returns 403
   ```
6. Update the auth negative test URLs from `{{baseUrl}}/` to a real endpoint once `baseUrl` is known
7. Document the role matrix in README under a new "User roles" section

---

### P3 — Refine module ID environment variables
> Blocked on app access. Do this after writing the first requests for each module.

1. Once real endpoints are known, confirm the actual ID field names the API uses (e.g. the API might use `userId` not `personId`, or `surveyId` not `pulseId`)
2. Rename variables in all three environment files to match the actual API naming
3. Remove any stubs that turn out to be unused
4. Add any additional variables the API needs (e.g. `fiscalYearId`, `projectId`) that weren't anticipated
5. Update the environment variables table in README to reflect the final set

---

### P4 — Push to GitHub (unblocks CI verification)
> Can be done now. Everything else in CI is theoretical until this runs.

1. Create a new GitHub repository (private, no README — the repo already has one)
2. Add the remote and push:
   ```bash
   git remote add origin <repo-url>
   git push -u origin main
   ```
3. Add repository secrets under **Settings → Secrets and variables → Actions**:
   - `VYAGUTA_TOKEN` — Bearer token for the dev environment
   - `SLACK_WEBHOOK_URL` — incoming webhook URL for failure alerts
4. Go to **Actions → Sanity Check → Run workflow** to trigger a manual run and confirm the workflow executes (it will pass with 0 requests until Sanity has real tests)
5. Repeat for **API Tests** and **Health Check** workflows
6. Confirm artifacts (`sanity-junit-report.xml`, `health-junit-report.xml`, `junit-report.xml`) appear on the run summary page
7. Trigger a deliberate failure (e.g. pass a bad token) and confirm the Slack notification fires
8. If Vyaguta is only reachable on the internal network, set up a self-hosted runner and update the `runs-on` field in all three workflow files

---

### P5 — npm audit monitoring
> Can be done now. The critical `handlebars` vulnerability is inherited but real.

1. Check the Newman GitHub releases page periodically for a version that fixes the dependency chain
2. When a candidate version is available, test it:
   ```bash
   npm install newman@<new-version> --save-dev
   npm run lint
   npm test   # requires baseUrl and authToken to be set
   npm audit
   ```
3. If tests pass and the vulnerability count drops, commit the version bump
4. If the fix requires `--force` and breaks the collection runner, revert and wait for the next release
5. Track this in the Completed checklist once resolved

---

## Completion checklist

### Framework setup
- [x] Postman collection with all module folders
- [x] Collection-level Bearer auth and 5000ms response time test
- [x] Token automation pre-request script stub
- [x] Module-level npm scripts
- [x] Lint validates collection and all environment files
- [x] Environment files for dev, qa, and uat with all variable stubs
- [x] CI workflows: regression (daily), health (2-hourly), sanity (on push/PR)
- [x] Slack failure notifications on all three workflows
- [x] Auth negative test stubs (missing token, invalid token)
- [x] README: structure, auth, running, Postman tips, coverage tables, known issues
- [x] PLAN.md: goals, sequencing, completed items, outstanding gaps

### Version control & CI
- [ ] GitHub remote added and pushed
- [ ] `VYAGUTA_TOKEN` secret added
- [ ] `SLACK_WEBHOOK_URL` secret added
- [ ] All three workflows verified via manual trigger
- [ ] Slack notification verified on failure
- [ ] Self-hosted runner configured (if Vyaguta is on internal network only)

### Dependency health
- [ ] `npm audit` resolved or Newman version bump committed

### On app access
- [ ] `baseUrl` filled in for dev environment
- [ ] HAR capture completed — all modules navigated
- [ ] Swagger/OpenAPI probed at common paths
- [ ] All endpoints documented in README Endpoints section
- [ ] User roles confirmed and documented
- [ ] Role credentials added to environment files (empty, never committed)
- [ ] Token automation activated (if login endpoint exists)

### Test coverage
- [ ] Sanity request per module (one per module folder in Sanity)
- [ ] Health request per module (one per module folder in Health)
- [ ] 403 auth tests per role/endpoint restriction
- [ ] Auth negative tests updated with real endpoint URL
- [ ] People module — full coverage (GETs, filters, pagination, writes, edge cases)
- [ ] Team module — full coverage
- [ ] Attendance module — full coverage
- [ ] JUMP module — full coverage
- [ ] Honor module — full coverage
- [ ] OKR module — full coverage
- [ ] Pulse module — full coverage
- [ ] Module ID variables refined to match actual API naming
- [ ] README Test coverage tables fully populated
