# Group-2-Team-1

A Node.js + Express 5 + TypeScript backend using Prisma 7 with PostgreSQL.

## Tech Stack

- **Runtime:** Node.js 25.9.0
- **Framework:** Express 5
- **Language:** TypeScript 6
- **ORM:** Prisma 7 (with `@prisma/adapter-pg`)
- **Database:** PostgreSQL 17
- **Auth:** JWT (`jsonwebtoken`)

---

## Prerequisites

Before you begin, make sure you have:

| Tool | Version | Required | Notes |
|------|---------|----------|-------|
| **Node.js** | `25.9.0` | Yes | Use `nvm` to match the version in `.nvmrc` |
| **Git** | any | Yes | For cloning |
| **Docker Desktop** | latest | Optional | Only if using Option A (recommended) |
| **PostgreSQL** | `17.x` | Optional | Only if using Option B |

### Installing Node.js with nvm

**Windows (nvm-windows):**
```powershell
# Install nvm-windows from: https://github.com/coreybutler/nvm-windows
nvm install 25.9.0
nvm use 25.9.0
```

**macOS / Linux (nvm):**
```bash
# Install nvm from: https://github.com/nvm-sh/nvm
nvm install 25.9.0
nvm use 25.9.0
```

If you're in the project directory, `nvm use` alone will read `.nvmrc`.

---

## Setup

### Step 1 — Clone the repository

```bash
git clone <repository-url>
cd Group-2-Team-1
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Configure environment variables

Copy the example file:

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**
```bash
cp .env.example .env
```

Open `.env` and adjust values as needed. Defaults work for local development:

```env
PORT=4444
NODE_ENV=development
JWT_SECRET=<generate-a-random-string>

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=G2T1M
POSTGRES_PORT=5432

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/G2T1M
```

> **Generate a JWT secret:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## Database Setup

Choose **one** of the following options.

### Option A — Docker (recommended)

**Requirements:** Docker Desktop installed and running.

1. Start the PostgreSQL container:
   ```bash
   docker compose up -d
   ```

2. Verify the container is healthy (wait ~10 seconds first):
   ```bash
   docker compose ps
   ```
   Expected output should show `STATUS: Up X seconds (healthy)`.

3. Apply database migrations:
   ```bash
   npm run db:migrate
   ```
   When prompted for a migration name, press Enter to accept `init`.

4. (Optional) Open Prisma Studio to inspect your tables:
   ```bash
   npm run db:studio
   ```

**Common commands:**
```bash
docker compose up -d           # Start the database
docker compose stop            # Stop (keeps data)
docker compose down            # Stop and remove container (keeps data volume)
docker compose down -v         # Stop and wipe all data
docker compose logs -f postgres  # View database logs
```

---

### Option B — Local PostgreSQL

**Requirements:** PostgreSQL 17 installed on your machine.

1. Install PostgreSQL:
   - **Windows / macOS:** Download from [postgresql.org/download](https://www.postgresql.org/download/)
   - **Ubuntu / Debian:**
     ```bash
     sudo apt update
     sudo apt install postgresql-17 postgresql-contrib
     sudo systemctl start postgresql
     ```

2. Create the database and user:
   ```bash
   # Connect as the default superuser
   sudo -u postgres psql     # Linux
   psql -U postgres          # Windows / macOS
   ```
   Then run:
   ```sql
   CREATE DATABASE "G2T1M";
   -- The default 'postgres' user usually already exists with password 'postgres'.
   -- If not, set one:
   ALTER USER postgres WITH PASSWORD 'postgres';
   \q
   ```

3. Update `.env` if your credentials differ:
   ```env
   DATABASE_URL=postgresql://<user>:<password>@localhost:5432/G2T1M
   ```

4. Apply migrations:
   ```bash
   npm run db:migrate
   ```

---

## Running the App

### Development mode (with hot reload)
```bash
npm run dev
```

### Production mode
```bash
npm start
```

The server will start on the port defined in `.env` (`PORT=4444` by default).

### Verify it works

Open a browser or run:
```bash
curl http://localhost:4444/health
```

Expected response:
```json
{
  "status": "OK",
  "database": "connected",
  "timestamp": "2026-04-21T..."
}
```

If you see `"status": "DEGRADED"` or the server won't start, see [`docs/troubleshooting.md`](docs/troubleshooting.md).

---

## Available Scripts

### Development
| Script | Description |
|--------|-------------|
| `npm run dev` | Start the server with hot reload |
| `npm start` | Start the server in production mode |
| `npm test` | Run tests (not yet configured) |

### Database (Prisma)
| Script | Description |
|--------|-------------|
| `npm run db:generate` | Regenerate the Prisma Client from the schema |
| `npm run db:migrate` | Create and apply a new migration (development) |
| `npm run db:migrate:deploy` | Apply existing migrations (production — no new ones created) |
| `npm run db:studio` | Open Prisma Studio at `http://localhost:5555` |
| `npm run db:reset` | ⚠️ Drop the database and re-apply all migrations |
| `npm run db:format` | Auto-format `schema.prisma` |

---

## Project Structure

```
src/
├── config/              # Environment, logger, Prisma client
│   ├── env.ts
│   ├── logger.ts
│   └── prisma.ts
├── generated/           # Auto-generated Prisma Client (git-ignored)
│   └── prisma/
├── middlewares/         # Express middlewares
│   ├── auth.middleware.ts
│   └── error.middleware.ts
├── modules/             # Feature modules (User, etc.)
│   └── user/
├── routes/              # Route aggregation
│   └── index.ts
├── utils/               # Shared utilities
│   ├── asyncHandler.ts
│   └── response.ts
├── app.ts               # Express app configuration
└── server.ts            # Server entry point

prisma/
├── migrations/          # Migration history (committed to git)
└── schema.prisma        # Database schema
```

---

## Troubleshooting

If you run into issues during setup — authentication errors, port conflicts,
Prisma Client generation issues, etc. — see:

**[`docs/troubleshooting.md`](docs/troubleshooting.md)**

It covers the specific problems we encountered and their solutions.

---

## License

ISC