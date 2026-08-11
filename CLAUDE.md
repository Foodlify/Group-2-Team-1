# CLAUDE.md

Project instructions for Claude Code. These override default behaviour.

---

## No comments. Anywhere.

**Do not write comments in this repository.** Not in `.ts`, `.js`, `.prisma`,
`.html`, `.yml`, `Dockerfile`, `.sh`, `.gitignore`, `.dockerignore`, or any
`.env` file. Not `//`, not `/* */`, not `/** */` JSDoc, not `#`, not `<!-- -->`.

This is not a style preference to weigh against other concerns. The repository
was stripped to zero comments deliberately and must stay there.

That includes:

- Section banners (`// ── Routes ──`)
- Explanations of why a line exists
- JSDoc on functions, parameters or return types
- `///` documentation comments in `prisma/schema.prisma`
- TODO / FIXME / NOTE markers
- Commented-out code

**Say it in the code instead.** A name that states the intent, a function
extracted so its signature carries the explanation, a constant with a
descriptive name instead of a literal and a note. If something genuinely needs
prose, it goes in `docs/`, not beside the code.

### The only exceptions

These are not comments. They are syntax that happens to start with `#` or `//`,
and removing them breaks the build:

| Line                             | Where                  | Why it stays                        |
| -------------------------------- | ---------------------- | ----------------------------------- |
| `#!/bin/sh`                      | `docker-entrypoint.sh` | shebang                             |
| `# syntax=docker/dockerfile:1.7` | `Dockerfile`           | parser directive                    |
| `-- CreateTable` etc.            | `prisma/migrations/`   | generated, checksummed — never edit |
| anything in `src/generated/`     | generated              | rewritten by `prisma generate`      |

If you ever need `// eslint-disable-next-line` or `// @ts-expect-error`, that is
a directive rather than a comment — but prefer fixing the underlying issue.
There are currently zero of them in hand-written code.

### Checking

```bash
grep -rn "//\|/\*\|^\s*#" src tests --include="*.ts"
```

Anything that turns up in hand-written code is a regression.

---

## Everything else

- **Branches** — one new branch off `develop` per work item. `develop` is the
  integration branch; merging to `main` is requested separately. Never delete
  remote branches.
- **Routes** — Express Router plus a manual `routeRegistry.push`. Do not use
  the OpenAPI route-builder.
- **Before committing** — `npm run verify` must pass: format, lint, typecheck,
  545 tests, build, and the OpenAPI check.
- **Scope** — build what the official scope map lists. Anything outside it gets
  reported as not required, not implemented.
- **Secrets** — never write to `.env`. Only variable names are ever read from
  it, never values.
- **Deployment** — see `docs/DEPLOYMENT.md`.
