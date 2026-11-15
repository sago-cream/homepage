import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.e2e.ts',
    fullyParallel: true,
    workers: 2,
    timeout: 60_000,
    use: {
        baseURL: 'http://localhost:3100',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    ],
    webServer: {
        command: 'bun run dev --hostname localhost --port 3100',
        url: 'http://localhost:3100',
        reuseExistingServer: !process.env.CI,
    },
});
