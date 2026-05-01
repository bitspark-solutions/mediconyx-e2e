# Mediconyx E2E Tests

End-to-end, API integration, and UI automation tests for the Mediconyx hospital management platform.

## Test Architecture

This project uses a **3-level testing strategy** for maximum coverage and confidence:

| Level | Folder | What it tests | API calls | Database |
|-------|--------|---------------|-----------|----------|
| **Level 1 — UI** | `tests/ui/` | Frontend rendering, validation, navigation, user interactions | Mocked via `page.route()` | None |
| **Level 2 — API** | `tests/api/` | Backend endpoints directly — status codes, response shapes, validation, persistence | Real (`localhost:9765`) | Real (test data) |
| **Level 3 — E2E** | `tests/e2e/` | Full user journey: browser → real API → real database | Real | Real (test data) |

## Project Structure

```
mediconyx-e2e/
├── playwright.config.ts          # Central config (baseURL, projects, timeouts)
├── package.json
├── tsconfig.json
├── .env                          # Environment variables (API base URL, etc.)
├── tests/
│   ├── pages/                    # Page Object Models (POM)
│   │   ├── contact-sales.page.ts
│   │   └── landing.page.ts
│   ├── fixtures/                 # Custom Playwright fixtures (auth, etc.)
│   ├── helpers/                  # Utilities, test data, data factory, cleanup
│   │   ├── test-data.ts          # Static test data
│   │   ├── data-factory.ts       # Creates/cleans test data via real API
│   │   └── api-client.ts         # Reusable API request helpers
│   ├── ui/                       # Level 1 — UI tests (mocked API)
│   │   ├── contact-sales.spec.ts
│   │   └── landing.spec.ts
│   ├── api/                      # Level 2 — API integration tests (real API)
│   │   └── sales-requests.spec.ts
│   └── e2e/                      # Level 3 — Full E2E (browser + real API + DB)
│       └── contact-sales-flow.spec.ts
```

## Prerequisites

- **Node.js** >= 18
- **Mediconyx stack running** — `docker compose up -d` in `d:\projects\mediconyx`
  - UI: `http://localhost:9673`
  - API: `http://localhost:9765`
  - DB: PostgreSQL on port `5432`
- **Playwright browsers installed** — `npx playwright install chromium`

## Setup

```bash
git clone git@github.com:bitspark-solutions/mediconyx-e2e.git
cd mediconyx-e2e
npm install
npx playwright install chromium
```

## Environment Variables

Create a `.env` file (optional — defaults are provided):

```env
BASE_URL=http://localhost:9673
API_BASE_URL=http://localhost:9765
```

## Running Tests

### All tests
```bash
npm test
```

### By level
```bash
npm run test:ui        # Level 1 — UI tests only (mocked, fast)
npm run test:api       # Level 2 — API integration tests (real backend)
npm run test:e2e       # Level 3 — Full E2E tests (browser + real backend)
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

## Test Data Strategy

- **UI tests (Level 1)**: Use static data from `tests/helpers/test-data.ts`. API is mocked — no real data created.
- **API & E2E tests (Level 2 & 3)**: Use `@faker-js/faker` to generate unique data per run. A `DataFactory` class creates test records via the real API and cleans them up after tests complete.
- **Isolation**: Each test creates its own data and does not depend on other tests or pre-existing database state.

## Best Practices Followed

- **Page Object Model (POM)** — locators and actions encapsulated per page
- **User-facing locators** — `getByRole`, `getByLabel` over CSS selectors
- **Test isolation** — each test is independent, no shared mutable state
- **Hybrid mocking** — mock for UI speed, real API for integration confidence
- **Tags** — `@smoke`, `@contact`, `@api` for selective test runs
- **Screenshots on failure** — auto-captured in `test-results/`
- **HTML reports** — generated after every run

## CI/CD (GitHub Actions)

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      # Start the Mediconyx stack
      - run: docker compose -f ../mediconyx/docker-compose.yml up -d
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests headless |
| `npm run test:headed` | Run with visible browser |
| `npm run test:debug` | Debug with Playwright Inspector |
| `npm run test:ui-mode` | Interactive test explorer |
| `npm run report` | Open HTML report |
| `npx playwright codegen http://localhost:9673` | Record tests via codegen |
