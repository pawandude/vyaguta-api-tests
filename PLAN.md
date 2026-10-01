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

## Original Next Steps (still applicable)

1. **Configure environments.** Fill in `baseUrl`; add one file per extra environment (e.g. `vyaguta-qa.postman_environment.json`). Keep `authToken` empty in committed files.
2. **Automate the token** if Vyaguta uses a login endpoint — add a collection-level pre-request script that fetches and stores `authToken`.
3. **Add auth negative tests** in `Behavior & Edge Cases`: missing token → 401, invalid/expired token → 401, wrong role → 403.
4. **Add write tests (POST/PUT/PATCH/DELETE)** once there's an environment where test data can safely be created and cleaned up. Each write test cleans up its own data.
5. **Document as you go.** Update README (Test coverage, Known behavior, Endpoints). Record quirks in `vyaguta_quirks.md`.
6. **Set up version control and CI.** `git init`, commit, push to GitHub. Add `VYAGUTA_TOKEN` secret. Trigger **Run workflow** once manually to verify. Use a self-hosted runner if Vyaguta is only reachable on the internal network.
7. **Review `npm audit` warnings.** Come from Newman dependencies; upgrade only if a fix doesn't break Newman.
