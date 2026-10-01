# CLAUDE.md

Postman/Newman API test suite for the Vyaguta API. Uses the same framework as
`../jsonplaceholder-api-tests`: Postman collection v2.1 + Newman, Node >= 20 (`.nvmrc`).

## Commands

```bash
npm install
npm run lint     # checks that the collection and environment files are valid JSON (runs automatically before test)
npm test         # Newman, CLI + HTML report -> reports/report.html
npm run test:ci  # Newman, CLI + JUnit report -> reports/junit-report.xml; injects $VYAGUTA_TOKEN as authToken
```

## Layout

- `collections/vyaguta-api.postman_collection.json` is the single collection. All requests and tests live here.
- `environments/*.postman_environment.json` hold one file per environment (currently `vyaguta.postman_environment.json` = dev). Each must define `baseUrl` and `authToken`.
- `.github/workflows/api-tests.yml` is the daily CI run (06:00 UTC). It reads `secrets.VYAGUTA_TOKEN`.
- `reports/` is generated output and is gitignored.

## Collection conventions

- One top-level folder per resource, plus a `Behavior & Edge Cases` folder for quirks and negative cases.
- Request names are descriptive sentences, e.g. `Get Employee by Id`, `Get non-existent employee returns 404`.
- URLs always use `{{baseUrl}}`. Auth is inherited from the collection-level Bearer `{{authToken}}`, so don't set auth per request unless you're testing auth itself (e.g. a missing or invalid token returning 401).
- Keep the collection-level `Response time is below 5000ms` test. Don't duplicate it in requests.
- Every request asserts:
  - the status code
  - `Content-Type: application/json` (where there's a body)
  - a JSON schema for the payload (`pm.response.to.have.jsonSchema(schema)`)
- List endpoints: validate every item against the schema. Assert an exact record count only if the data is deterministic.
- Filter/nested endpoints: assert that every returned item actually matches the filter.
- Write endpoints (POST/PUT/PATCH): assert the response echoes the submitted fields. DELETE: assert status and body shape.
- Known quirks: assert the **actual** behavior, name the request `... (quirk)`, and document it in README "Known behavior". Don't "fix" the test to match the expected behavior.

## Rules

- Never hardcode tokens or base URLs, and never commit a filled-in `authToken` value.
- Collection JSON is large and hand-edited. Make targeted edits and run `npm run lint` after every change, then `npm test` if `baseUrl` and `authToken` are available.
- Every new request gets a row in the README `Test coverage` table (`Request | Method & URL | Assertions`). New endpoints go in README `Endpoints`.
