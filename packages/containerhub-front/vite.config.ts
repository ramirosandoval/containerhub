import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import {fileURLToPath, URL} from 'node:url'

const backendProxyTarget = process.env.VITE_BACKEND_PROXY ?? 'http://localhost:9998'

// ponytail: Drax's @drax/common-front does `import merge from 'deepmerge'` and
// deepmerge ships only as CJS (`dist/cjs.js`). Vite's pre-bundler doesn't
// always pick it up automatically when imported transitively, so the dev
// server fails with "does not provide an export named 'default'". Adding it
// explicitly here forces esbuild to inline the default export. The prod build
// already handles it. Remove this entry if Drax drops deepmerge.
export default defineConfig({
    plugins: [vue(), vuetify({autoImport: true})],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    optimizeDeps: {
        include: ['deepmerge', 'graphql', 'graphql-request']
    },
    server: {
        port: 5173,
        proxy: {
            '/graphql': {target: backendProxyTarget, ws: true},
            '/api': {target: backendProxyTarget, ws: true}
        }
    }
})