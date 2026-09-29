FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/containerhub-agent/package.json packages/containerhub-agent/package.json
COPY packages/containerhub-back/package.json packages/containerhub-back/package.json
COPY packages/containerhub-front/package.json packages/containerhub-front/package.json
RUN npm ci --workspace=@containerhub/agent
COPY packages/containerhub-agent packages/containerhub-agent
RUN npm run build -w @containerhub/agent

FROM node:22-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/containerhub-agent/package.json packages/containerhub-agent/package.json
RUN npm ci --omit=dev --workspace=@containerhub/agent

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/packages/containerhub-agent/package.json packages/containerhub-agent/package.json
COPY --from=build /app/packages/containerhub-agent/dist packages/containerhub-agent/dist
COPY --from=production-dependencies /app/node_modules node_modules
RUN node --input-type=module -e "import {existsSync} from 'node:fs'; await import('./packages/containerhub-agent/dist/server.js'); if (['@drax/identity-back', 'vue', 'typescript', 'tsx'].some(name => existsSync('node_modules/' + name))) process.exit(1)"
CMD ["node", "packages/containerhub-agent/dist/index.js"]
