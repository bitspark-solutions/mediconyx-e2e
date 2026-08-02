import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.test when TEST_ENV=test, otherwise .env (dev stack)
const envFile = process.env.TEST_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const BASE_URL = process.env.BASE_URL || 'http://localhost:9673';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:9765';

export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'ui',
      testDir: './tests/ui',
      // Micro-tests (is X visible?) finish in ~1s and make boring clips —
      // keep video only when one fails, as debugging evidence.
      use: { browserName: 'chromium', baseURL: BASE_URL, video: 'retain-on-failure' },
    },
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: API_BASE_URL },
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      // Full user flows (portal walkthroughs, onboarding story) — always record.
      // SLOW_MO=<ms> slows every action for live demos (npm run test:onboarding:slow).
      use: {
        browserName: 'chromium',
        baseURL: BASE_URL,
        video: 'on',
        launchOptions: { slowMo: Number(process.env.SLOW_MO || 0) },
      },
    },
  ],
});
