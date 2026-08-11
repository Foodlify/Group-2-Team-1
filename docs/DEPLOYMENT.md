# Deployment (VPS + Coolify)

> Target: `https://foodify.beingmomen.com`
> Coolify builds the `Dockerfile`; PostgreSQL and Redis are Coolify-managed
> resources, not containers this repository defines.

---

## What runs where

```
Internet
   │  443
   ▼
Traefik  (Coolify's proxy — TLS from Let's Encrypt)
   │  4444, private network
   ▼
foodify-api      ←── this repository's Dockerfile
   │        │
   ▼        ▼
PostgreSQL   Redis        ←── Coolify resources, no published ports
```

`docker-compose.yml` is **not** used on the server. It is the local
development stack and says so at the top of the file.

---

## Before Coolify

**DNS.** An `A` record for `foodify.beingmomen.com` pointing at the VPS's IP,
before you ask Coolify for a certificate — Let's Encrypt validates over HTTP,
so a name that does not resolve yet is a certificate that will not issue.

**Firewall.** Open `22`, `80`, `443`, and `8000` for the Coolify dashboard.
Nothing else. In particular **not** `5432`: the database is reachable over the
private network by name, and a published PostgreSQL port on a public IP is
scanned within hours.

---

## 1. The databases first

The application refuses to boot without `DATABASE_URL`, so create these before
the app exists.

**New Resource → PostgreSQL 17.** Coolify generates the credentials and gives
you two connection strings. Take the **internal** one — it resolves over the
private Docker network and never leaves the host. The external one exists to
be published, which is the thing we are not doing.

**New Resource → Redis.** Same: internal URL only.

Redis is optional in this app — an unset `REDIS_URL` disables caching and
nothing else breaks — but the load-testing numbers in `docs/LOAD_TESTING.md`
were measured with it on.

---

## 2. The application

**New Resource → Application**, pointed at this repository.

| Setting      | Value                            |
| ------------ | -------------------------------- |
| Build Pack   | **Dockerfile**                   |
| Branch       | `main`                           |
| Port Exposes | `4444`                           |
| Domain       | `https://foodify.beingmomen.com` |
| Health check | path `/health`, port `4444`      |

`4444` is the container's own port, not the public one — Traefik reaches it on
the private network and the outside world only ever sees `443`. Nothing about
the deployment would break on a different number.

It matches local `.env` for a reason that has nothing to do with the server:
the port is written down in `GOOGLE_CALLBACK_URL`, in the URI registered with
Google, and in whatever the server actually binds. Two numbers in circulation
means those three drift, and the failure that follows is a browser sent back to
a port with nothing on it.

### Migrations need no configuration

The container applies pending migrations from its entrypoint before starting
the server, so there is no deploy step to remember and no environment where
somebody forgot it. `prisma migrate deploy` applies what is pending and
nothing else — it never resets and never prompts.

Set `RUN_MIGRATIONS=false` to suppress it, which is worth doing only if you
later run migrations from somewhere else and want exactly one thing doing it.

---

## 3. Environment variables

### Required — the app will not boot without these

| Variable             | Value                                             |
| -------------------- | ------------------------------------------------- |
| `NODE_ENV`           | `production`                                      |
| `DATABASE_URL`       | the **internal** URL from the PostgreSQL resource |
| `JWT_SECRET`         | generate — see below                              |
| `JWT_REFRESH_SECRET` | generate — a **different** value                  |
| `CORS_ORIGIN`        | `https://foodify.beingmomen.com`                  |
| `TRUST_PROXY`        | `1`                                               |

`JWT_REFRESH_SECRET` and `CORS_ORIGIN` are optional in development and
**enforced in production** by `src/config/env.ts`, which fails the boot rather
than starting with a permissive default.

**`TRUST_PROXY=1` is the one that is easy to skip and expensive to skip.**
Every request arrives from Traefik, so without it `req.ip` is Traefik's address
for _everybody_ — and `req.ip` is what the rate limiter counts by. The result
is one shared bucket for the entire internet: twenty logins in fifteen minutes
across all users, then everyone is refused. `1` because there is exactly one
proxy hop. Do not raise it "to be safe": each hop you claim beyond the real
count is a hop a client can forge an `X-Forwarded-For` through to mint itself a
fresh identity per request, which turns the limiter off just as effectively.

### Seeding the first deploy

Migrations create the tables; they do not put anything in them. A freshly
deployed instance has no restaurants, no menu, and **no administrator** — the
API answers correctly and has nothing to say.

`RUN_SEED=true` runs the seed once from the entrypoint, after migrations. It
creates an admin, a customer with an address, and one restaurant with a menu.
It is an upsert throughout, so running it twice changes nothing.

**In production it refuses to use the credentials in this repository.** Set
these four alongside it, or the container stops with an error naming them:

| Variable                 |
| ------------------------ |
| `SEED_ADMIN_EMAIL`       |
| `SEED_ADMIN_PASSWORD`    |
| `SEED_CUSTOMER_EMAIL`    |
| `SEED_CUSTOMER_PASSWORD` |

The refusal is the point. `admin@example.com` / `Admin123!` are written in a
public repository, and seeding them onto a public URL hands over an
administrator account to anybody who reads the source. Outside production the
same defaults are used unchanged, because there they are a convenience rather
than a door.

Seeded accounts get `emailVerifiedAt` set, so they can log in immediately. An
account without it authenticates and is then refused at the verification gate,
which reads as a broken password.

Set `RUN_SEED=false` after the first successful deploy. Nothing breaks if you
forget — the upserts are idempotent — but it also resets those two passwords to
whatever the variables say on every boot.

### Leave "Available at Buildtime" unchecked

Coolify can expose a variable to the build as well as to the running
container. Nothing here needs that, and one of them actively breaks the build.

`NODE_ENV=production` reaching the build is the case to know: npm reads it and
skips `devDependencies` on its own, so `npm ci` installs the production set,
`typescript` and `@types/*` are absent, and `tsc` fails with sixty
`TS7016: Could not find a declaration file` errors that look like a
dependency problem in the repository rather than a setting in the panel.

The Dockerfile no longer depends on getting this right — the build stages pin
`NODE_ENV=development` and pass `--include=dev` — but leave the box unchecked
anyway. A secret exposed at build time is baked into an image layer, where it
outlives any later change to the variable.

### Generating the secrets

Run this **on your own machine** and paste the results into Coolify. Do not
reuse the development values — a secret that has been in a `.env` on a laptop
is not a production secret.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Recommended

| Variable            | Value              | Why                                                           |
| ------------------- | ------------------ | ------------------------------------------------------------- |
| `REDIS_URL`         | internal Redis URL | caching; unset simply disables it                             |
| `DATABASE_POOL_MAX` | `20`               | keep `instances × this` under PostgreSQL's `max_connections`  |
| `LOG_DIR`           | leave empty        | Coolify already collects stdout; files would be a second copy |

### Optional features — each one is off until configured

| Feature       | Variables                                                         |
| ------------- | ----------------------------------------------------------------- |
| Email (OTP)   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`   |
| Stripe        | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                      |
| Web Push      | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`          |
| Google log-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |

Unset means the corresponding routes answer `404` and the API is honest about
not offering the feature. **Half-set is refused at boot** for the pairs where
half-configured fails silently — VAPID keys, and the Google credentials.

**SMTP is the exception worth checking.** With no `SMTP_HOST` the mailer logs
messages instead of sending in development and **refuses in production** —
which means registration OTPs go nowhere. Configure it, or know that nobody can
verify an email on the deployed instance.

---

## 4. The three URLs that change with the domain

Each of these is registered with a third party against the old address and has
to be re-registered against the new one. None of them fails at boot; they fail
the first time a real user hits that path.

### Google OAuth

In the Google Cloud console, on the OAuth client, add to **Authorized redirect
URIs**:

```
https://foodify.beingmomen.com/api/v1/auth/google/callback
```

and set `GOOGLE_CALLBACK_URL` to the same string. Google compares the
**string**, not the resolved URL — a trailing slash or `http` instead of
`https` is a different URI and gives `redirect_uri_mismatch`.

Keep the `localhost` entry alongside it. A client can hold several, and
deleting it breaks local development for everyone else on the team.

### Stripe webhook

A new endpoint at:

```
https://foodify.beingmomen.com/api/v1/payments/stripe/webhook
```

**`STRIPE_WEBHOOK_SECRET` is per endpoint**, so the production value is a new
one from this endpoint's page — not the one in local `.env`. Reusing the local
secret means every webhook fails its signature check, and the symptom is
payments that are taken and never confirmed.

### VAPID

`VAPID_SUBJECT` must be a `mailto:` or `https:` URL — reuse the existing keys
or generate a new pair with `npx web-push generate-vapid-keys`. Reusing is
usually right: **changing the key pair invalidates every existing
subscription**, silently. Every previously-registered browser simply stops
receiving.

---

## 5. What production turns off

`NODE_ENV=production` disables the demo page at `/demo/` — it is a development
tool and nothing should be able to reach it on a deployed instance.

The consequence is worth knowing in advance: **Google sign-in and Web Push have
no click-through demonstration on the server.** The API endpoints are all
there, and `/api-docs` still documents them; what is missing is the page that
drove them from a browser. Demonstrate those two locally.

Everything else is on: `/api-docs`, `/api-docs/swagger/`, `/openapi.json` and
`/health` all serve in production.

---

## Verifying a deploy

```bash
curl -i https://foodify.beingmomen.com/health
```

`{"status":"OK","database":"connected"}` means the container booted, migrations
applied and PostgreSQL answered a real query. A `503` with
`"database":"disconnected"` means the app is up but `DATABASE_URL` is wrong —
which is also what the container health check sees, so Coolify will show it
unhealthy rather than route traffic to it.

Then, in order of how much each one tells you:

| Check                                 | Proves                                     |
| ------------------------------------- | ------------------------------------------ |
| `/health`                             | boot, migrations, database                 |
| `/api/v1/restaurants`                 | the router and a real query                |
| `/api-docs`                           | the documentation UI and its CDN           |
| a login, then any authenticated route | cookies survive the proxy — needs `secure` |

That last one is the reason the domain matters: auth cookies are set with
`secure: true` whenever `NODE_ENV=production`, so they are only ever sent over
HTTPS. On plain `http://<ip>` the browser accepts the login response and then
sends no cookie with the next request, and every authenticated route answers
`401` for no visible reason.

---

## Things that were wrong before this was tried

Recorded because each one built and pushed cleanly, and failed only when run.

| What                                             | Symptom                                            |
| ------------------------------------------------ | -------------------------------------------------- |
| `RUN npx tsc` used the root tsconfig (no outDir) | image build failed on `COPY /app/dist`             |
| `chown -R app:app /app`                          | a duplicate copy of every file: **+441MB**         |
| The generated Prisma client imported `.ts` paths | built fine, `MODULE_NOT_FOUND` on boot             |
| winston creating `logs/` as a non-root user      | `EACCES` — crash loop before the first request     |
| `NODE_ENV=production` injected into the build    | npm silently skipped devDependencies; `tsc` failed |

The common thread is that none of them is visible without running the
container. A green build is not a deployment.
