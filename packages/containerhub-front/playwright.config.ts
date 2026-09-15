import {defineConfig, devices} from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    outputDir: '/tmp/containerhub-playwright',
    use: {baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure'},
    projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
    webServer: [
        {
            command: 'DRAX_DB_ENGINE=sqlite DRAX_SQLITE_FILE=e2e.db CONTAINERHUB_BOOTSTRAP_ENABLED=true CONTAINERHUB_BOOTSTRAP_NAME="Initial Administrator" CONTAINERHUB_BOOTSTRAP_USERNAME=initial-admin CONTAINERHUB_BOOTSTRAP_PASSWORD=test-only-bootstrap-password CONTAINERHUB_BOOTSTRAP_EMAIL=admin@example.com CONTAINERHUB_BOOTSTRAP_PHONE=+15550000000 DRAX_PORT=10000 TERMINAL_ALLOWED_ORIGIN=http://127.0.0.1:5173 npm run dev',
            cwd: '../containerhub-back',
            url: 'http://127.0.0.1:10000/graphql',
            reuseExistingServer: false,
            timeout: 60_000
        },
        {
            command: 'VITE_BACKEND_PROXY=http://127.0.0.1:10000 npm run dev -- --host 127.0.0.1 --port 5173',
            url: 'http://127.0.0.1:5173',
            reuseExistingServer: false,
            timeout: 60_000
        }
    ]
})
