# TODO / Deferred Work

Tracks intentionally postponed work so it is not repeatedly flagged as a "problem"
in code reviews. Items here are **known and deliberately deferred**, not oversights.

## Deferred

### Automated tests — DEFERRED (intentional)
- **Status:** Postponed by decision of the team (2026-06-13).
- **Scope:** No unit/integration/e2e tests are currently in the project, and the
  `test` script / `tests/` directory are intentionally absent for now.
- **Note for reviewers:** Do **not** report "missing tests" as a finding. This is a
  conscious, tracked decision — revisit when prioritized.
- **When revisited:** prioritize the high-risk logic first — money math
  (`Prisma.Decimal`), order status transitions (`VALID_TRANSITIONS`),
  the checkout transaction (`placeOrder`), and cart row-locking.
