FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/containerhub-agent/package.json packages/containerhub-agent/package.json
COPY packages/containerhub-back/package.json packages/containerhub-back/package.json
COPY packages/containerhub-front/package.json packages/containerhub-front/package.json
RUN npm ci

COPY . .
RUN npm run build:back && npm run build:front && npm prune --omit=dev

FROM node:22-bookworm-slim AS application
ENV NODE_ENV=production \
    CONTAINERHUB_FRONT_DIR=/app/public
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/containerhub-back/package.json packages/containerhub-back/package.json
COPY --from=build /app/packages/containerhub-back/node_modules packages/containerhub-back/node_modules
COPY --from=build /app/packages/containerhub-back/dist packages/containerhub-back/dist
COPY --from=build /app/packages/containerhub-front/dist public
COPY --chmod=755 docker/containerhub-monitoring /usr/local/bin/containerhub-monitoring
EXPOSE 9998
CMD ["node", "packages/containerhub-back/dist/index.js"]
