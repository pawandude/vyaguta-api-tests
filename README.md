# Vyaguta API Tests

Postman/Newman test suite for the Vyaguta API. The base URL is set by
`{{baseUrl}}` in the environment file, and every request authenticates with a
Bearer token from `{{authToken}}`.

## Setup

```bash
npm install
```

## Auth

Every request inherits Bearer auth from the collection, using the `authToken` variable.

- **Locally:** set `baseUrl` and `authToken` in `environments/vyaguta.postman_environment.json`, or in the Postman app's environment editor. **Never commit a filled-in `authToken`.** Alternatively, pass it at runtime:
  `npx newman run collections/vyaguta-api.postman_collection.json -e environments/vyaguta.postman_environment.json --env-var "authToken=<token>"`
- **In CI:** add a `VYAGUTA_TOKEN` repository secret. `npm run test:ci` injects it as `authToken`.

### Token automation

The collection has a pre-request script stub at the root level (currently commented out). If Vyaguta uses a login endpoint rather than a static token, uncomment the block in the collection's pre-request script and fill in `LOGIN_URL` and the response field name. The script reads `loginEmail` and `loginPassword` from the environment, fetches a token, and stores it in `authToken` — no manual pasting needed.

Add `loginEmail` and `loginPassword` to the environment file (already stubbed) and set their values locally. **Never commit filled-in credentials.**

## Running the tests

### Via Newman (CLI)

```bash
npm test              # full suite — CLI output + HTML report → reports/report.html
npm run test:ci       # full suite — JUnit report → reports/junit-report.xml (for CI)

# Module-level runs (each writes its own HTML report to reports/<module>-report.html)
npm run test:sanity
npm run test:health
npm run test:people
npm run test:team
npm run test:attendance
npm run test:jump
npm run test:honor
npm run test:okr
npm run test:pulse
```

### Via the Postman app

1. Open Postman and click **Import** (top left).
2. Drag in, or browse to, both files from this repo:
   - `collections/vyaguta-api.postman_collection.json`
   - `environments/vyaguta.postman_environment.json`
3. In the environment selector (top right dropdown), select **Vyaguta (dev)** and fill in `baseUrl` and `authToken`. Requests fail without them.
4. To run a single request: open it in the collection sidebar and click **Send**; check the **Test Results** tab in the response pane for pass/fail.
5. To run the whole suite: right-click the **Vyaguta API Tests** collection → **Run collection** (or select it and click **Run**). In the Collection Runner:
   - Confirm the **Vyaguta (dev)** environment is selected.
   - Leave all requests checked (or narrow to a single folder).
   - Click **Run Vyaguta API Tests**.
6. Review the run summary: pass/fail counts per request, with failing assertions expandable inline.

## Running on a schedule

### Option 1: Postman Monitor

Runs the collection from Postman's cloud on a schedule, with no CI infrastructure needed.

1. **Get the collection into a Postman workspace (not Scratch Pad).** Sign in to Postman, import both files if you haven't already, then confirm they live in a real workspace: collection **...** menu → **Move**, if needed. Monitors can't be created from Scratch Pad items.
2. **Create the Monitor.** Collection **...** menu → **Monitor collection** (or **New → Monitor** from the sidebar and pick this collection).
3. **Select the environment.** Choose **Vyaguta (dev)** so `{{baseUrl}}` and `{{authToken}}` resolve.
4. **Set the schedule and region.** Pick a run frequency (hourly/daily/custom) and a run region. If Vyaguta is only reachable on an internal network, a cloud Monitor can't reach it; use Option 2 with a runner that can.
5. **Turn on failure alerts.** Enable email notifications, add recipients, and optionally set a failure threshold (e.g. alert only after 2 consecutive failures) to avoid noise from transient network blips.
6. **Save, then click "Run now"** once to confirm it passes, and check the Monitor's run history afterward to confirm the schedule actually fires.

Note: free-tier Postman accounts cap monthly monitor call units, so a daily schedule is a safer default than hourly unless you're on a paid plan.

### Option 2: GitHub Actions

Runs Newman from CI on a schedule, fully version-controlled in this repo. The workflow already exists at [`.github/workflows/api-tests.yml`](.github/workflows/api-tests.yml). It runs daily at 06:00 UTC and can also be triggered manually.

1. **Get this repo into GitHub** and confirm `.github/workflows/api-tests.yml` is committed. It runs `npm ci` then `npm run test:ci` (JUnit reporter) and uploads `reports/` as a build artifact on every run, pass or fail.
2. **Add the `VYAGUTA_TOKEN` secret** under the repo's **Settings → Secrets and variables → Actions**.
3. **Adjust the schedule if needed.** Edit the `cron` line in the workflow, e.g. `'0 */6 * * *'` for every 6 hours. [crontab.guru](https://crontab.guru) helps with the syntax. GitHub Actions cron times are always UTC.
4. **Verify it manually first.** In the repo's **Actions** tab, select **API Tests** → **Run workflow** to trigger it on demand rather than waiting for the schedule.
5. **Check results.** Each run shows pass/fail in the job log; the `newman-report` artifact (containing `junit-report.xml`) is downloadable from the run's summary page.
6. **Add the `SLACK_WEBHOOK_URL` secret** under repo Settings → Secrets and variables → Actions. Both workflows post a Slack message with a direct link to the failed run when a job fails. Skip this step if Slack notifications aren't needed — the notify step is a no-op if the secret is absent.

### Sanity checks (on every push and PR)

[`.github/workflows/sanity-check.yml`](.github/workflows/sanity-check.yml) runs the `Sanity` folder on every push and pull request to `main`, giving fast feedback before the full daily regression runs. It posts a Slack failure notification and uploads a `sanity-junit-report.xml` artifact. The job is a no-op until the Sanity folder has real requests.

### Health checks (every 2 hours)

[`.github/workflows/health-check.yml`](.github/workflows/health-check.yml) runs the `Health` folder every 2 hours. It uses the same `VYAGUTA_TOKEN` and `SLACK_WEBHOOK_URL` secrets and uploads a `health-junit-report.xml` artifact on every run.

## Structure

```
.github/
  workflows/
    api-tests.yml        # full regression — daily at 06:00 UTC, Slack on failure
    health-check.yml     # health checks — every 2 hours, Slack on failure
collections/
  vyaguta-api.postman_collection.json   # single collection, all modules
environments/
  vyaguta.postman_environment.json      # dev
  vyaguta-qa.postman_environment.json   # qa
  vyaguta-uat.postman_environment.json  # uat
reports/                 # generated output (gitignored)
```

### Environment variables

All three environment files define the same variables:

| Variable | Purpose |
| --- | --- |
| `baseUrl` | API base URL for the environment |
| `authToken` | Bearer token (injected by CI; set locally but never commit) |
| `loginEmail` | Used by the token automation script (if login endpoint exists) |
| `loginPassword` | Used by the token automation script (if login endpoint exists) |
| `personId` | Sample People module record ID for parameterised tests |
| `teamId` | Sample Team record ID |
| `attendanceId` | Sample Attendance record ID |
| `jumpId` | Sample JUMP record ID |
| `honorId` | Sample Honor record ID |
| `okrId` | Sample OKR record ID |
| `keyResultId` | Sample Key Result record ID |
| `pulseId` | Sample Pulse record ID |

Requests are grouped by module — one folder each — plus `Sanity`, `Health`, and `Behavior & Edge Cases`. Each request asserts status code, response shape, and a JSON schema for the payload. See [Test coverage](#test-coverage) below for the full per-request breakdown.

## Why a single collection file

All modules live in one file (`collections/vyaguta-api.postman_collection.json`) rather than one file per module. The reasons:

- **Shared auth** — the collection-level Bearer `{{authToken}}` and any pre-request scripts (e.g. auto-fetch token) apply to every request automatically. Splitting into multiple files means duplicating this setup in each file and keeping them in sync.
- **Shared collection-level test** — the `Response time is below 5000ms` assertion is defined once at the collection root and runs on every request without repetition.
- **Isolation via `--folder`** — Newman's `--folder <name>` flag runs a single module in isolation, so multiple files give no practical benefit over folders within one file.
- **Simpler CI and tooling** — one collection path in all `package.json` scripts and workflows; no logic needed to loop over files.

The JSON is large, so keep edits targeted (per the conventions in `CLAUDE.md`) and use the Postman app for authoring rather than editing the raw file by hand.

## Organizing the collection in Postman

When you import the collection into Postman, the module folders appear in the sidebar. To keep things navigable as the suite grows:

1. **Use the sidebar search** (Ctrl/Cmd+K) to jump to a request by name rather than scrolling.
2. **Collapse unused folders** — right-click a folder → Collapse to keep only the module you're working on expanded.
3. **Run a single module** — right-click any folder → **Run folder** to execute just that module in the Collection Runner, instead of running the full suite.
4. **Filter in the Collection Runner** — in the runner dialog, uncheck folders you don't want to run rather than running the full collection.
5. **Use the Postman app for authoring** — add or edit requests in the app, then export back to `collections/vyaguta-api.postman_collection.json` (collection `...` menu → Export → Collection v2.1). Avoid hand-editing the large JSON unless the change is small and targeted.
6. **Pin the environment** — always confirm the **Vyaguta (dev)** environment is selected (top-right dropdown) before running; requests will fail silently with `{{baseUrl}}` unresolved otherwise.

## Test coverage

Every request below asserts a response time under 5000ms (collection-level test) on top of what's listed.

Each module section is added here as requests are written. The assertion columns reflect the [coverage requirements](PLAN.md#5-coverage-requirements) in PLAN.md.

### Sanity

| Request | Method & URL | Assertions |
| --- | --- | --- |
| Get users list | `GET /api/core/users` | 200, data array present |

### Health

| Request | Method & URL | Assertions |
| --- | --- | --- |
| Users endpoint is reachable | `GET /api/core/users` | 200 |

### People

| Request | Method & URL | Assertions |
| --- | --- | --- |
| Get all users returns 200 with paginated list | `GET /api/core/users?sortBy=firstName&order=ASC` | 200, CT, schema (`data.items` array) |
| Get user by ID returns 200 with correct user | `GET /api/core/users/{{personId}}` | 200, CT, schema, returned `id` matches requested |
| Get non-existent user returns 404 | `GET /api/core/users/999999999` | 404 |
| Get user roles by ID returns 200 | `GET /api/core/users/{{personId}}/roles` | 200, CT, schema (`data` array of role objects) |

### Team

| Request | Method & URL | Assertions |
| --- | --- | --- |
| Get project status types returns 200 with list | `GET /api/teams/status-types` | 200, CT, schema |
| Get projects summary returns 200 with status breakdown | `GET /api/teams/projects/summary` | 200, CT, schema |
| Get projects summary filtered by statusId returns matching results | `GET /api/teams/projects/summary?statusId=4` | 200, CT, schema, all items have `status.id === 4` |
| Get projects missing data returns 200 | `GET /api/teams/projects/missing` | 200, CT, schema (`data` object with missing categories) |
| Get projects activity feed returns 200 with paginated items | `GET /api/teams/projects/feed?size=10` | 200, CT, schema, returned page size ≤ 10 |
| Get projects health trend returns 200 with weekly breakdown | `GET /api/teams/projects/health-trend?startDate=...&endDate=...&metric=Overall Status&size=10&page=1` | 200, CT, schema, meta.page matches |

### Attendance

| Request | Method & URL | Assertions |
| --- | --- | --- |
| Get attendance summary for self returns 200 | `GET /api/leave/attendance/summary?fetchType=self` | 200, CT, schema, `data.leave`, `data.worklog`, `data.missing` present |
| Get attendance summary for team returns 200 | `GET /api/leave/attendance/summary?fetchType=team` | 200, CT, schema, `data.missing` ≥ 0 |
| Get attendance summary with invalid fetchType returns 200 or 400 (quirk) | `GET /api/leave/attendance/summary?fetchType=invalid` | 200 or 400 (see Known behavior) |

### JUMP

| Request | Method & URL | Assertions |
| --- | --- | --- |
| Get KPI filters returns 200 with area/designation list | `GET /api/jump/kpis/filters?type=Role based` | 200, CT, schema, `data` array non-empty |
| Get KPIs filtered by designation and area returns matching items | `GET /api/jump/kpis?designationId=3&areaId=4&with=score,goalCount,scope&pageSize=10&type=Role based` | 200, CT, schema, all items `designation.id === 3`, `area.id === 4`, `type === "Role based"` |

### Honor

| Request | Method & URL | Assertions |
| --- | --- | --- |
| Get honor menus returns 200 with menu list | `GET /api/honor/menus` | 200, CT, `data` is a non-empty array of strings |
| Get active campaign returns 200 with campaign details | `GET /api/honor/campaigns/active` | 200, CT, schema, stores `honorCampaignId` env var |
| Get appreciation types returns 200 with type list | `GET /api/honor/appreciation-types` | 200, CT, schema, `data` array non-empty |
| Get user appreciations for active campaign returns 200 | `GET /api/honor/users/{{personId}}/campaigns/<campaignId>/appreciations` | 200, CT, `data` array |
| Get active honor images returns 200 with image list | `GET /api/honor/images/active` | 200, CT, schema (`data` array of `{id, url, active, createdAt, updatedAt}`) |

### OKR

| Request | Method & URL | Assertions |
| --- | --- | --- |
| Get strategic pillars summary returns 200 with pillar list | `GET /api/okr/strategic-pillars/summary?year=2026` | 200, CT, schema, `data` array non-empty |
| Get HLOs for single quarter returns 200 | `GET /api/okr/hlo?quarters=Q4&with=objectives&year=2026` | 200, CT, schema |
| Get HLOs for all quarters returns 200 | `GET /api/okr/hlo?quarters=Q1,Q2,Q3,Q4&with=objectives&year=2026` | 200, CT, at least 1 distinct quarter in results |
| Get OKR areas with leaderships returns 200 | `GET /api/okr/areas?year=2026&additionalFields=leaderships,objectiveCount` | 200, CT, schema (`manager`, `lead`, `leaders` nullable arrays) |
| Get OKR highlights returns 200 | `GET /api/okr/highlights?page=1&size=10&year=2026` | 200, CT, schema (`data.today`, `data.yesterday`, `data.older`) |

### Pulse

| Request | Method & URL | Assertions |
| --- | --- | --- |
| Get pulse dashboard returns 200 | `GET /api/pulse/dashboard?startDate=2026-10-01&endDate=2026-12-31` | 200, CT, schema (`data` array of evaluation objects) |
| Get promotion status as appraiser returns 200 | `GET /api/pulse/promotion?startDate=...&endDate=...&actionAs=appraiser&userIds=` | 200, CT, schema (`data` array) |
| Get evaluation groups returns 200 | `GET /api/pulse/evaluations/groups` | 200, CT, schema (`message`, `data` array) |
| Get user pulse info returns 200 | `GET /api/pulse/user/{{personId}}/pulse` | 200, CT, schema (`data.helpRequests`, `data.pip`, `data.probations`) |
| Get expectation notes for user returns 200 | `GET /api/pulse/notes?noteType=EXPECTATION&subjectId={{personId}}` | 200, CT, schema, every returned note has `noteType === "EXPECTATION"` |
| Get all notes for user returns 200 | `GET /api/pulse/notes?subjectId={{personId}}` | 200, CT, schema |

### Behavior & Edge Cases

| Request | Method & URL | Assertions |
| --- | --- | --- |
| Missing token returns 401 | `GET /api/core/users` | 401 |
| Invalid token returns 401 | `GET /api/core/users` | 401 |
| Get attendance summary with invalid fetchType returns 200 or 400 (quirk) | `GET /api/leave/attendance/summary?fetchType=invalid` | 200 or 400 (see Known behavior) |
| _Role-based 403 tests — to be added once user roles are confirmed_ | | |

## Known dependency issues

Running `npm install` or `npm audit` will report 21 vulnerabilities (8 moderate, 12 high, 1 critical). All are inside Newman's own dependency tree (`postman-collection`, `postman-runtime`, `handlebars`, `lodash`, etc.) — none are in code this repo writes or controls.

The only available fix (`npm audit fix --force`) downgrades Newman to 4.6.1, which is a breaking change. This is left as-is until Newman ships a non-breaking fix. Do not run `npm audit fix --force` without first verifying the downgraded Newman version still works with the collection.

## Known behavior of this API

- **`GET /api/leave/attendance/summary?fetchType=invalid`** returns `400 Bad Request` (not `200 OK`). The test accepts either status and is named `(quirk)`.

## Endpoints

Endpoints are added here as they are discovered. Entries marked `(discovered)` were found via HAR capture or proxy and are not officially documented.

### People

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/core/users` | Paginated user list; supports `sortBy`, `order`, `page`, `size` |
| GET | `/api/core/users/:id` | Single user by ID |
| GET | `/api/core/users/:id/roles` | Roles assigned to a user |

### Team

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/teams/status-types` | Project status type list |
| GET | `/api/teams/projects/summary` | Project summary; filterable by `statusId` |
| GET | `/api/teams/projects/missing` | Projects with missing data |
| GET | `/api/teams/projects/feed` | Activity feed; supports `size`, `page` |
| GET | `/api/teams/projects/health-trend` | Weekly health trend; params `startDate`, `endDate`, `metric`, `size`, `page` |

### Attendance

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/leave/attendance/summary` | Summary for self or team; `fetchType` = `self` \| `team` |

### JUMP

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/jump/kpis/filters` | Area/designation filter options; `type` = `Role based` |
| GET | `/api/jump/kpis` | KPI list; filterable by `designationId`, `areaId`, `type`; supports `with`, `pageSize` |

### Honor

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/honor/menus` | Module menu items |
| GET | `/api/honor/campaigns/active` | Currently active campaign |
| GET | `/api/honor/appreciation-types` | Appreciation type list |
| GET | `/api/honor/users/:userId/campaigns/:campaignId/appreciations` | User appreciations for a campaign |
| GET | `/api/honor/images/active` | Active honor images |

### OKR

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/okr/strategic-pillars/summary` | Strategic pillars with HLO/objective counts; `year` param |
| GET | `/api/okr/hlo` | HLOs; `quarters` (comma-separated), `with`, `year` params |
| GET | `/api/okr/areas` | Areas with optional `additionalFields=leaderships,objectiveCount`; `year` param |
| GET | `/api/okr/highlights` | Activity highlights; `page`, `size`, `year` params |

### Pulse

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/pulse/dashboard` | Dashboard evaluation list; `startDate`, `endDate` params |
| GET | `/api/pulse/promotion` | Promotion status; `startDate`, `endDate`, `actionAs`, `userIds` params |
| GET | `/api/pulse/evaluations/groups` | Evaluation group list |
| GET | `/api/pulse/user/:userId/pulse` | User pulse info (PIP, probations, help requests) |
| GET | `/api/pulse/notes` | Notes for a subject; `subjectId` required, `noteType` optional filter |
