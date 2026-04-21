# Troubleshooting Guide

This guide covers common issues you may encounter when setting up or running the project,
based on problems actually encountered during development.

> **Tip:** If your issue isn't listed here, check the logs first:
> - App logs: wherever you ran `npm run dev`
> - Database logs: `docker compose logs postgres` (Docker) or your system's Postgres logs
> - Confirm the error message matches what's described before applying a fix.

---

## Table of Contents

- [Troubleshooting Guide](#troubleshooting-guide)
  - [Table of Contents](#table-of-contents)
  - [Database Connection Issues](#database-connection-issues)
    - [P1000: Authentication failed](#p1000-authentication-failed)
    - [P1001: Can't reach database server](#p1001-cant-reach-database-server)
    - [P3014: Shadow database creation failed](#p3014-shadow-database-creation-failed)
  - [Prisma Client Issues](#prisma-client-issues)
    - [Cannot find module '../generated/prisma/client'](#cannot-find-module-generatedprismaclient)
    - [`url` is no longer supported in schema files](#url-is-no-longer-supported-in-schema-files)
    - [Argument `references` must refer only to existing fields](#argument-references-must-refer-only-to-existing-fields)
  - [Docker Issues](#docker-issues)
    - [Windows: Installation failed — ProgramData must be owned by an elevated account](#windows-installation-failed--programdata-must-be-owned-by-an-elevated-account)
    - [Ubuntu: `docker compose` command not found](#ubuntu-docker-compose-command-not-found)
    - [Ubuntu: Docker commands require sudo](#ubuntu-docker-commands-require-sudo)
    - [Container port mismatch (5432 vs 5433)](#container-port-mismatch-5432-vs-5433)
  - [Port Conflicts](#port-conflicts)
    - [Port 5432 already in use](#port-5432-already-in-use)
    - [Port 4444 already in use](#port-4444-already-in-use)
  - [Still stuck?](#still-stuck)

---

## Database Connection Issues

### P1000: Authentication failed

**Error:**
```
Error: P1000: Authentication failed against database server,
the provided database credentials for `postgres` are not valid.
```

**What this usually means:** The credentials in `.env` don't match what PostgreSQL expects.

**Common cause #1 — Port collision with a local PostgreSQL install:**

If you have PostgreSQL installed locally **and** you're running the Docker container on the
same port, your app may be connecting to the wrong one.

Check which process is listening on port 5432:

**Windows (PowerShell):**
```powershell
Get-NetTCPConnection -LocalPort 5432 -State Listen | ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    [PSCustomObject]@{
        Address = $_.LocalAddress
        Port = $_.LocalPort
        Process = $proc.ProcessName
    }
}
```

**macOS / Linux:**
```bash
sudo lsof -i :5432
```

If you see **both** `postgres` and `com.docker.backend` (or `docker`), you have a conflict.

**Fix — change the Docker port:**

1. Edit `.env`:
   ```env
   POSTGRES_PORT=5433
   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/G2T1M
   ```

2. Restart the container:
   ```bash
   docker compose down
   docker compose up -d
   ```

3. Re-run migrations:
   ```bash
   npm run db:migrate
   ```

**Common cause #2 — Stale volume with old credentials:**

If you previously ran the container with different credentials, the old ones are persisted
in the volume. The `POSTGRES_USER` / `POSTGRES_PASSWORD` env variables only take effect
**on first run against an empty volume**.

**Fix (⚠️ deletes all database data):**
```bash
docker compose down -v
docker compose up -d
npm run db:migrate
```

---

### P1001: Can't reach database server

**Error:**
```
Error: P1001: Can't reach database server at `localhost:5432`
Please make sure your database server is running at `localhost:5432`.
```

**What this usually means:** Nothing is listening on the configured port.

**Checklist:**

1. **Is the database running?**
   ```bash
   # Docker
   docker compose ps   # STATUS should say (healthy)

   # Local install — Windows
   Get-Service postgresql*

   # Local install — Linux
   sudo systemctl status postgresql
   ```

2. **Does the port in `.env` match the actual listening port?**
   ```bash
   docker compose ps
   ```
   Look at the `PORTS` column. It should be `0.0.0.0:<HOST_PORT>->5432/tcp`.
   The `<HOST_PORT>` must match `POSTGRES_PORT` in `.env`.

3. **Is the container in a healthy state?**
   If it says `Up X seconds (health: starting)`, wait another 10 seconds.
   If it says `(unhealthy)`, check logs:
   ```bash
   docker compose logs postgres
   ```

---

### P3014: Shadow database creation failed

**Error:**
```
Error: P3014: Prisma Migrate could not create the shadow database.
Please make sure the database user has permission to create databases.
```

**What this means:** Prisma creates a temporary "shadow database" to validate migrations.
Your database user doesn't have `CREATEDB` permission.

**Fix:**

Connect as a superuser and grant the permission:
```bash
# Docker
docker exec -it g2t1_postgres psql -U postgres -c "ALTER USER postgres CREATEDB;"

# Local install
psql -U postgres -c "ALTER USER postgres CREATEDB;"
```

---

## Prisma Client Issues

### Cannot find module '../generated/prisma/client'

**Error (at runtime or TypeScript compilation):**
```
Cannot find module '../generated/prisma/client'
```

**What this means:** The Prisma Client is generated code that's not committed to git.
Every machine needs to generate its own copy based on the schema.

**Common scenarios where this happens:**
1. After a fresh `git clone` (most common)
2. After `rm -rf node_modules` without rerunning `npm install`
3. After `npm run db:migrate` in Prisma 7.7.0 (occasional race condition where generate is skipped)

**Fix:**
```bash
npm run db:generate
```

Verify the output directory exists:
```bash
# Should list several .ts files: client.ts, models.ts, enums.ts, etc.
ls src/generated/prisma
```

**Note:** In Prisma 7, there is no `index.ts` inside the generated folder — you import from
specific files like `./generated/prisma/client`, not from the folder.

**Prevention:** The project's `package.json` includes a `postinstall` script that runs
`prisma generate` automatically after `npm install`. If you're seeing this error, either:
- You cloned the repo and haven't run `npm install` yet → run `npm install`
- The `postinstall` script failed silently → run `npm run db:generate` manually

**What this means:** The Prisma Client wasn't generated, or was generated but isn't where
the code expects it.

**Fix:**
```bash
npm run db:generate
```

Verify the output directory exists:
```bash
# Should list several .ts files: client.ts, models.ts, enums.ts, etc.
ls src/generated/prisma
```

**Note:** In Prisma 7, there is no `index.ts` inside the generated folder — you import from
specific files like `./generated/prisma/client`, not from the folder.

**When this happens most often:** After `npm run db:migrate` in Prisma 7.7.0, the client
generation step occasionally gets skipped due to a race condition. Running
`npm run db:generate` manually fixes it.

---

### `url` is no longer supported in schema files

**Error:**
```
Error: Prisma schema validation - (validate wasm)
Error code: P1012
error: The datasource property `url` is no longer supported in schema files.
```

**What this means:** You're on Prisma 7, which moved the database URL out of `schema.prisma`
and into `prisma.config.ts`.

**Fix:**

1. In `prisma/schema.prisma`, **remove** the `url` line from the `datasource` block:
   ```prisma
   // Before
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")   // ❌ remove this
   }

   // After
   datasource db {
     provider = "postgresql"
   }
   ```

2. In `prisma.config.ts`, add the `datasource` property:
   ```typescript
   import "dotenv/config";
   import { defineConfig, env } from "prisma/config";

   export default defineConfig({
     schema: "prisma/schema.prisma",
     migrations: { path: "prisma/migrations" },
     datasource: {
       url: env("DATABASE_URL"),   // ✅ now lives here
     },
   });
   ```

---

### Argument `references` must refer only to existing fields

**Error:**
```
error: Error validating: The argument `references` must refer only to existing
fields in the related model `Cart`. The following fields do not exist in the
related model: id
```

**What this means:** A `@relation` references a field that doesn't exist on the target model.
Most common cause: the target model uses a non-`id` field as its primary key.

**Fix:**

Check the target model's primary key. For example, in this project `Cart.userId` is the PK
(not `Cart.id`), so references must point to `userId`:

```prisma
// ❌ Wrong
cart Cart @relation(fields: [cartId], references: [id])

// ✅ Right
cart Cart @relation(fields: [cartId], references: [userId])
```

---

## Docker Issues

### Windows: Installation failed — ProgramData must be owned by an elevated account

**Error (during Docker Desktop install):**
```
For security reasons C:\ProgramData\DockerDesktop must be owned by an elevated account
```

**What this means:** A previous install attempt left a folder that isn't owned by an admin
account.

**Fix (PowerShell as Administrator):**

1. Run PowerShell as Administrator (right-click → Run as administrator).

2. Remove the leftover folders:
   ```powershell
   Remove-Item -Recurse -Force "C:\ProgramData\DockerDesktop" -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force "C:\ProgramData\Docker" -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Docker" -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force "$env:APPDATA\Docker" -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force "$env:APPDATA\Docker Desktop" -ErrorAction SilentlyContinue
   ```

3. Re-run the Docker Desktop installer **as Administrator**
   (right-click the `.exe` → Run as administrator).

---

### Ubuntu: `docker compose` command not found

**Error:**
```
docker: unknown command: docker compose
```

Or with shorthand flags:
```
unknown shorthand flag: 'd' in -d
```

**What this means:** Docker Engine is installed, but the Compose plugin is not.
On Ubuntu, they are separate packages.

**Check what's installed:**
```bash
docker --version              # Should show Docker version
docker compose version        # V2 plugin (preferred)
docker-compose --version      # V1 standalone (legacy)
```

**Fix — Option 1: Install via apt (Ubuntu's repository)**

For Ubuntu 24.04+:
```bash
sudo apt update
sudo apt install docker-compose-v2
```

If the package isn't found, make sure `universe` repository is enabled:
```bash
sudo add-apt-repository universe
sudo apt update
sudo apt install docker-compose-v2
```

**Fix — Option 2: Install from Docker's official repository (latest version)**

```bash
# Add Docker's official GPG key
sudo apt update
sudo apt install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install the Compose plugin
sudo apt update
sudo apt install docker-compose-plugin
```

**Verify:**
```bash
docker compose version
```

Expected output:
```
Docker Compose version v2.x.x
```

---

### Ubuntu: Docker commands require sudo

**Symptom:** Every `docker` command fails unless prefixed with `sudo`. For example:
```
permission denied while trying to connect to the Docker daemon socket
```

**What this means:** By default on Linux, only `root` and members of the `docker` group can
communicate with the Docker daemon.

**Fix — add your user to the docker group:**
```bash
# Add your user to the docker group
sudo usermod -aG docker $USER

# Activate the change in the current shell without logging out
newgrp docker

# Verify
docker ps
```

> **Security note:** Being in the `docker` group grants effectively root-equivalent access
> to your system (since containers can mount the host filesystem). Only add trusted users.

If `newgrp docker` doesn't work, log out and back in.

---

### Container port mismatch (5432 vs 5433)

**Symptom:** You changed `POSTGRES_PORT` in `.env` to `5433`, but `docker compose ps`
shows `0.0.0.0:5433->5433/tcp` and Prisma gets `P1001`.

**What this means:** The `ports` mapping in `docker-compose.yml` was modified to use the
variable on **both** sides. The container port should **always be `5432`** regardless of
the host port, because PostgreSQL inside the container always listens on `5432`.

**Fix — `docker-compose.yml`:**
```yaml
# ❌ Wrong — both sides changed
ports:
  - "${POSTGRES_PORT}:5433"

# ✅ Right — host side is variable, container side is always 5432
ports:
  - "${POSTGRES_PORT}:5432"
```

After fixing:
```bash
docker compose down
docker compose up -d
docker compose ps   # Should show <host_port>->5432
```

---

## Port Conflicts

### Port 5432 already in use

**Error (from `docker compose up`):**
```
Error response from daemon: driver failed programming external connectivity...
bind: address already in use
```

**Fix:** Use a different host port.

1. Edit `.env`:
   ```env
   POSTGRES_PORT=5433
   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/G2T1M
   ```

2. Restart:
   ```bash
   docker compose down
   docker compose up -d
   ```

---

### Port 4444 already in use

**Error:**
```
Error: listen EADDRINUSE: address already in use :::4444
```

**Find the process using the port:**

**Windows (PowerShell):**
```powershell
Get-NetTCPConnection -LocalPort 4444 -State Listen | ForEach-Object {
    Get-Process -Id $_.OwningProcess
}
```

**macOS / Linux:**
```bash
lsof -i :4444
```

**Fix — either:**
- Kill the process using the port, **or**
- Change `PORT` in `.env` to a different value (e.g., `4445`)

---

## Still stuck?

1. Make sure your `.env` matches `.env.example` structure.
2. Run `npm run db:generate` after any schema change.
3. Try a clean slate:
   ```bash
   docker compose down -v
   rm -rf node_modules
   npm install
   docker compose up -d
   npm run db:migrate
   ```
4. Check the Prisma version matches what's documented:
   ```bash
   npm list prisma @prisma/client @prisma/adapter-pg
   ```