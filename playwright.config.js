import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.E2E_PORT || 4174);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('E2E_PORT inválida.');
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true,
  timeout: 45000, expect: { timeout: 8000 },
  retries: process.env.CI ? 1 : 0, workers: process.env.CI ? 2 : 2,
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: { command: 'npm run dev', env: { PORT: String(port) }, url: baseURL, reuseExistingServer: false }
});
