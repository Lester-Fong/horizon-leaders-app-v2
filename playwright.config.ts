import { defineConfig } from '@playwright/test'

const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://localhost:5173'
const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: frontendUrl,
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: 'npm --prefix backend run dev',
      url: `${backendUrl}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm --prefix frontend run dev -- --host localhost',
      url: `${frontendUrl}/login`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
