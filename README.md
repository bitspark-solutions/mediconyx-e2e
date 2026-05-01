# Mediconyx E2E Tests

End-to-end, API integration, and UI automation tests for the Mediconyx hospital management platform.

## Test Architecture

This project uses a **3-level testing strategy** for maximum coverage and confidence:

| Level | Folder | What it tests | API calls | Database |
|-------|--------|---------------|-----------|----------|
| **Level 1 — UI** | `tests/ui/` | Frontend rendering, validation, navigation, user interactions | Mocked via `page.route()` | None |
| **Level 2 — API** | `tests/api/` | Backend endpoints directly — status codes, response shapes, validation, persistence | Real | Real (test data) |
| **Level 3 — E2E** | `tests/e2e/` | Full user journey: browser → real API → real database | Real | Real (test data) |

## Environments

Tests can run against two targets:

| Environment | Compose file | Ports | Rate limiting | Usage |
|-------------|-------------|-------|---------------|-------|
| **Dev stack** | `docker-compose.yml` | UI `9673`, API `9765`, DB `9543` | Enabled (5 POST/hr) | Quick smoke tests |
| **Test stack** | `docker-compose.test.yml` | UI `9674`, API `9766`, DB `9544` | **Disabled** | Full test suite |

Both stacks run on the **same machine** (local or VPS) on different ports.

### Adaptability

All URLs are environment-variable-driven. **Zero code changes** when switching targets:

| Target | `.env.test` values |
|--------|-------------------|
| Local dev | `http://localhost:9674` / `http://localhost:9766` |
| Same VPS | `http://your-vps-ip:9674` / `http://your-vps-ip:9766` |
| AWS/Azure | `https://test.mediconyx.com` / `https://test-api.mediconyx.com` |

## Project Structure

```
mediconyx-e2e/
├── playwright.config.ts          # Central config (env-driven URLs, 3 projects)
├── package.json                  # Scripts for dev and test env
├── Dockerfile.e2e                # Containerized test runner for CI
├── .env                          # Dev stack URLs (localhost:9673/9765)
├── .env.test                     # Test stack URLs (localhost:9674/9766)
├── tests/
│   ├── pages/                    # Page Object Models (POM)
│   │   ├── contact-sales.page.ts
│   │   └── landing.page.ts
│   ├── helpers/
│   │   ├── test-data.ts          # Static test data
│   │   ├── data-factory.ts       # Faker-based unique data generator
│   │   └── api-client.ts         # Reusable API request helpers
│   ├── ui/                       # Level 1 — UI tests (mocked API)
│   │   ├── contact-sales.spec.ts
│   │   └── landing.spec.ts
│   ├── api/                      # Level 2 — API integration tests
│   │   └── sales-requests.spec.ts
│   └── e2e/                      # Level 3 — Full E2E (browser + API + DB)
│       └── contact-sales-flow.spec.ts
```

## Prerequisites

- **Node.js** >= 18
- **Docker & Docker Compose** (for running the test stack)
- **Playwright browsers** — `npx playwright install chromium`

## Setup

```bash
git clone git@github.com:bitspark-solutions/mediconyx-e2e.git
cd mediconyx-e2e
npm install
npx playwright install chromium
```

## Starting the Test Environment

```bash
# From the mediconyx repo:
cd d:\projects\mediconyx
docker compose -f docker-compose.test.yml up -d

# Verify services are running:
docker compose -f docker-compose.test.yml ps
```

The test stack uses:
- `ASPNETCORE_ENVIRONMENT=Test` → rate limiting disabled
- `tmpfs` + `fsync=off` on Postgres → fast disposable database
- Separate network, volumes, and container names → no conflict with dev stack

## Running Tests

### Against the test environment (recommended)
```bash
npm run test:env           # All 3 levels against test stack
npm run test:env:ui        # Level 1 — UI tests only
npm run test:env:api       # Level 2 — API integration tests
npm run test:env:e2e       # Level 3 — Full E2E tests
```

### Against the dev stack (quick smoke)
```bash
npm test                   # All tests against dev stack
npm run test:ui            # Level 1 only
npm run test:api           # Level 2 only (rate-limited!)
npm run test:e2e           # Level 3 only (rate-limited!)
```

### By tag
```bash
npx playwright test --grep @smoke       # Smoke tests across all levels
npx playwright test --grep @contact     # Contact sales feature tests
```

### Other modes
```bash
npm run test:headed    # Watch the browser run tests
npm run test:ui-mode   # Interactive Playwright UI mode
npm run test:debug     # Step-by-step debugging with Playwright Inspector
npm run report         # Open last HTML test report
```

### Containerized (CI / one-command)
```bash
cd d:\projects\mediconyx
docker compose -f docker-compose.test.yml --profile e2e up --build --abort-on-container-exit --exit-code-from e2e-tests
docker compose -f docker-compose.test.yml --profile e2e down -v
```

## Test Data Strategy

- **UI tests (Level 1)**: Use static data from `tests/helpers/test-data.ts`. API is mocked — no real data created.
- **API & E2E tests (Level 2 & 3)**: Use `@faker-js/faker` to generate unique data per run. Each test creates its own data with unique identifiers.
- **Isolation**: Each test is independent and does not depend on other tests or pre-existing database state.
- **Accumulation**: Test data accumulates in the test database. Use `docker compose -f docker-compose.test.yml down -v` to wipe and start fresh.

## Best Practices Followed

- **Page Object Model (POM)** — locators and actions encapsulated per page
- **User-facing locators** — `getByRole`, `getByLabel` over CSS selectors
- **Test isolation** — each test is independent, no shared mutable state
- **Hybrid mocking** — mock for UI speed, real API for integration confidence
- **Tags** — `@smoke`, `@contact`, `@api` for selective test runs
- **Screenshots on failure** — auto-captured in `test-results/`
- **HTML reports** — generated after every run
- **Environment-variable-driven** — adaptable to local, VPS, or cloud deployments

## CI/CD (GitHub Actions)

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          path: mediconyx
      - uses: actions/checkout@v4
        with:
          repository: bitspark-solutions/mediconyx-e2e
          path: mediconyx-e2e
      - name: Start test environment
        working-directory: mediconyx
        run: |
          docker compose -f docker-compose.test.yml up -d --build
          docker compose -f docker-compose.test.yml ps
      - name: Install test dependencies
        working-directory: mediconyx-e2e
        run: |
          npm ci
          npx playwright install --with-deps chromium
      - name: Run tests
        working-directory: mediconyx-e2e
        run: npm run test:env
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: mediconyx-e2e/playwright-report/
      - name: Cleanup
        if: always()
        working-directory: mediconyx
        run: docker compose -f docker-compose.test.yml down -v
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run test:env` | Run all tests against test stack |
| `npm run test:env:e2e` | Run only full E2E tests |
| `npm run test:headed` | Run with visible browser |
| `npm run test:debug` | Debug with Playwright Inspector |
| `npm run test:ui-mode` | Interactive test explorer |
| `npm run report` | Open HTML report |
| `npx playwright codegen http://localhost:9674` | Record tests via codegen |
