# Automated testing

All integration and browser tests use database names ending in `_test`. Never point them at development or production.

```bash
npm test                 # unit + MongoDB integration
npm run test:coverage    # HTML and terminal coverage
npm run test:e2e         # desktop and mobile Chromium
```

MongoDB must be available locally. Override isolated database URLs with `MONGODB_URI` for Vitest and `TEST_MONGODB_URI` for Playwright.

Install and run k6 separately for deliberate abuse tests against a disposable environment:

```bash
k6 run -e BASE_URL=http://test-host tests/load/share-abuse.js
k6 run -e BASE_URL=http://test-host tests/load/large-share.js
```

Do not run load tests against production. Billing webhook tests will be added with the payment provider because no billing endpoint or signature format exists yet.
