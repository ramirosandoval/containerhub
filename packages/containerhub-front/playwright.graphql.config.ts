import {defineConfig, devices} from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    outputDir: `${process.env.TMPDIR ?? './test-results'}/containerhub-graphql-playwright`,
    use: {baseURL: 'http://127.0.0.1:5199', trace: 'retain-on-failure'},
    projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 5199',
        url: 'http://127.0.0.1:5199', reuseExistingServer: false, timeout: 60_000
    }
})
