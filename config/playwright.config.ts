import {fileURLToPath} from 'node:url';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '../tests',
  testMatch: '*.spec.ts',
  workers: 1,
  outputDir: '../test-results',
  timeout: 45_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: 'http://127.0.0.1:4177', viewport: { width: 1440, height: 960 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
    trace: 'retain-on-failure',
  },
  webServer: { cwd: fileURLToPath(new URL('..',import.meta.url)), command: 'npm run preview -- --port 4177 --strictPort', url: 'http://127.0.0.1:4177', reuseExistingServer: false },
});
