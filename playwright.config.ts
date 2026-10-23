import { defineConfig, devices } from '@playwright/test';
import { loadTestEnv } from './e2e/helpers';

loadTestEnv();

export default defineConfig({
  testDir: './e2e',
  // the flows share accounts and sessions, so they run one at a time
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], locale: 'ar-SA' } }],
});
