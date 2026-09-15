FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/containerhub-agent/package.json packages/containerhub-agent/package.json
COPY packages/containerhub-back/package.json packages/containerhub-back/package.json
COPY packages/containerhub-front/package.json packages/containerhub-front/package.json
RUN npm ci
COPY packages/containerhub-agent packages/containerhub-agent
RUN npm run build -w @containerhub/agent && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/containerhub-agent/package.json packages/containerhub-agent/package.json
COPY --from=build /app/packages/containerhub-agent/dist packages/containerhub-agent/dist
COPY --from=build /app/node_modules node_modules
CMD ["node", "packages/containerhub-agent/dist/index.js"]
