import { defineConfig, devices } from '@playwright/test'

const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://localhost:5173'
const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3000'

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir: 'test-results/qa005',
  projects: [
    {
      name: 'chromium-edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/qa005' }]],
  testDir: './e2e',
  testMatch: 'qa005.spec.ts',
  timeout: 120_000,
  use: {
    baseURL: frontendUrl,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm --prefix backend run dev',
      reuseExistingServer: true,
      timeout: 120_000,
      url: `${backendUrl}/api/health`,
    },
    {
      command: 'npm --prefix frontend run dev -- --host localhost',
      reuseExistingServer: true,
      timeout: 120_000,
      url: `${frontendUrl}/login`,
    },
  ],
  workers: 1,
})
