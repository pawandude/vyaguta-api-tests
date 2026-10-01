# Vyaguta API Tests

Postman/Newman test suite for the Vyaguta API. The base URL is set by
`{{baseUrl}}` in the environment file, and every request authenticates with a
Bearer token from `{{authToken}}`.

## Setup

```bash
npm install
```

## Auth

Every request inherits Bearer auth from the collection, using the `authToken`
variable.

- **Locally:** set `baseUrl` and `authToken` in
  `environments/vyaguta.postman_environment.json`, or in the Postman app's
  environment editor. **Never commit a filled-in `authToken`.** Alternatively,
  pass it at runtime:
  `npx newman run collections/vyaguta-api.postman_collection.json -e environments/vyaguta.postman_environment.json --env-var "authToken=<token>"`
- **In CI:** add a `VYAGUTA_TOKEN` repository secret. `npm run test:ci` injects
  it as `authToken`.

## Running the tests

### Via Newman (CLI)

```bash
npm test        # runs via Newman, prints CLI output, writes an HTML report to reports/report.html
npm run test:ci # same, but writes a JUnit XML report to reports/junit-report.xml (for CI)
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
6. **Optional: get failure notifications.** GitHub emails the repo owner on scheduled-workflow failures by default (configurable under your GitHub notification settings).

## Structure

```
collections/   Postman collection (requests + test scripts)
environments/  Postman environment (baseUrl, authToken variables)
reports/       Generated test reports (gitignored)
```

Requests are grouped by module, one folder each, plus `Sanity`, `Health`, and a `Behavior & Edge Cases` folder. Each request asserts status code, response shape, and a JSON schema for the payload. See [Test coverage](#test-coverage) below for the full per-request breakdown.

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
| _to be added_ | | |

### Health

| Request | Method & URL | Assertions |
| --- | --- | --- |
| _to be added_ | | |

### People

| Request | Method & URL | Assertions |
| --- | --- | --- |
| _to be added_ | | |

### Team

| Request | Method & URL | Assertions |
| --- | --- | --- |
| _to be added_ | | |

### Attendance

| Request | Method & URL | Assertions |
| --- | --- | --- |
| _to be added_ | | |

### JUMP

| Request | Method & URL | Assertions |
| --- | --- | --- |
| _to be added_ | | |

### Honor

| Request | Method & URL | Assertions |
| --- | --- | --- |
| _to be added_ | | |

### OKR

| Request | Method & URL | Assertions |
| --- | --- | --- |
| _to be added_ | | |

### Pulse

| Request | Method & URL | Assertions |
| --- | --- | --- |
| _to be added_ | | |

### Behavior & Edge Cases

| Request | Method & URL | Assertions |
| --- | --- | --- |
| Missing token returns 401 | `GET /` | 401 |
| Invalid token returns 401 | `GET /` | 401 |
| _Role-based 403 tests — to be added once user roles are confirmed_ | | |

## Known behavior of this API

_None documented yet. Record non-obvious behavior here (and cover it with a test in `Behavior & Edge Cases`) as it's found._

## Endpoints

Endpoints are added here as they are discovered. Entries marked `(discovered)` were found via HAR capture or proxy and are not officially documented.

### People
_To be filled in on app access._

### Team
_To be filled in on app access._

### Attendance
_To be filled in on app access._

### JUMP
_To be filled in on app access._

### Honor
_To be filled in on app access._

### OKR
_To be filled in on app access._

### Pulse
_To be filled in on app access._
