import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const macOSChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(macOSChrome) ? macOSChrome : undefined);
const testPort = process.env.DIVIDENDX_TEST_PORT === '4184' ? 4184 : 4174;

export default defineConfig({
  testDir: './tests',
  outputDir: './qa/test-results',
  reporter: [['line']],
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    browserName: 'chromium',
    launchOptions: executablePath ? { executablePath } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${testPort}`,
    cwd: '../..',
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
