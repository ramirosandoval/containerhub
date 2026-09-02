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
# set every required value described below
npm run dev:back       # http://localhost:9998
npm run dev:front      # http://localhost:5173
```

### Backend environment contract

ContainerHub uses the current Drax environment names directly:

| Variable | Required | Purpose |
|---|---:|---|
| `DRAX_DB_ENGINE` | yes | Drax persistence engine: `mongo` or `sqlite` |
| `DRAX_MONGO_URI` | when engine is `mongo` | MongoDB connection URI |
| `DRAX_SQLITE_FILE` | when engine is `sqlite` | SQLite database file |
| `DRAX_JWT_SECRET` | yes | Secret used by Drax to sign and verify access tokens |
| `DRAX_JWT_EXPIRATION` | no | Access-token lifetime; Drax defaults to `1h` |
| `DRAX_JWT_ISSUER` | no | Access-token issuer; Drax defaults to `DRAX` |
| `DRAX_PORT` | no | Backend port; ContainerHub defaults to `9998` |

Startup fails before database connection or bootstrap work when a required
value is missing. `DRAX_JWT_SECRET` deliberately has no example or runtime
fallback. The migration/coexistence deployment uses `mongo` and the shared
`incartainer` database; SQLite remains the alternative engine supported by
the current Drax identity repositories.

## Migration plan

Pages migrate one by one from `docker-fortes` (Vue 2) to
`containerhub-front` (Vue 3), starting with the Services page.
Until all pages are migrated, both stacks run side by side and the
DNS routes by URL prefix.
