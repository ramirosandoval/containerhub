# ContainerHub

Docker Swarm management panel. Replaces the legacy `docker-fortes` panel
(scaffolded on Dracul/Apollo 2 / Vue 2) with a Drax-based stack
(TS / Fastify 5 / graphql-yoga 5 / Vue 3 / Vuetify 3).

## Layout

```
packages/
  containerhub-back/    Fastify + graphql-yoga + Mongoose + Drax identity
  containerhub-front/   Vite + Vue 3 + Vuetify 3 + Apollo Client 3
```

The backend shares Mongo with the legacy app. Coexistence: legacy on
port 9999, containerhub on 9998, Mongo DB `incartainer`.

## First run

```bash
sh setup.sh
cp packages/containerhub-back/.env.example packages/containerhub-back/.env
# edit .env (MONGO_URI at minimum)
npm run dev:back       # http://localhost:9998
npm run dev:front      # http://localhost:5173
```

## Migration plan

Pages migrate one by one from `docker-fortes` (Vue 2) to
`containerhub-front` (Vue 3), starting with the Services page.
Until all pages are migrated, both stacks run side by side and the
DNS routes by URL prefix.
