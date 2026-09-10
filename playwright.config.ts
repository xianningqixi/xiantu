import { defineConfig, devices } from "@playwright/test";
const baseURL = process.env.XIANTU_TEST_URL || "http://127.0.0.1:3100";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: process.env.XIANTU_TEST_OUTPUT || "/tmp/xiantu-browser-results",
  use: {
    actionTimeout: 15000,
    ...devices[process.env.PLAYWRIGHT_BROWSER === "firefox" ? "Desktop Firefox" : "Desktop Chrome"],
    baseURL,
    viewport: { width: 1440, height: 1000 },
    browserName: process.env.PLAYWRIGHT_BROWSER === "firefox" ? "firefox" : "chromium",
    channel:
      process.env.PLAYWRIGHT_BROWSER === "firefox" ? undefined : process.env.PLAYWRIGHT_CHANNEL,
    launchOptions: { args: process.env.PLAYWRIGHT_BROWSER === "firefox" ? [] : ["--disable-gpu"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.XIANTU_TEST_URL
    ? undefined
    : {
        command: "npm run start:local -- --hostname 127.0.0.1 --port 3100",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
});
