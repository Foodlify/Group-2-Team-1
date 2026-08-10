import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who is making the current request, and from where.
 *
 * Held in an `AsyncLocalStorage` rather than threaded through call signatures.
 * The actor is genuinely a property of the request, not of `updateStatus` — and
 * the alternative is an `actorId` parameter on every repository method between
 * the controller and the write, which is both noise and a thing somebody
 * eventually forgets to pass. An audit trail whose completeness depends on
 * remembering an argument is not a trail.
 *
 * Every field is optional because every field legitimately can be absent: a
 * Stripe webhook has no user, and a scheduled sweep has no request at all.
 * `undefined` there is the truth; a placeholder would be a lie in a table whose
 * only job is to be true.
 */
export interface RequestContext {
  actorId?: string;
  actorRole?: string;
  ip?: string;
  /** `GET /api/v1/transactions` — method and path, never the query string. */
  route?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `context` visible to everything it awaits, however deep. */
export const runWithContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn);

/**
 * The current context, or undefined outside a request — a background job, a
 * unit test. Callers must treat undefined as normal rather than as an error.
 */
export const currentContext = (): RequestContext | undefined =>
  storage.getStore();

/**
 * Fills in the actor once authentication has resolved it.
 *
 * Mutates the store rather than opening a nested one: the context is entered
 * before the body is even parsed, so the actor is simply not known yet at that
 * point. A no-op outside a request, which is what makes it safe to call from
 * middleware that also runs in tests.
 */
export const setContextActor = (actorId: string, actorRole: string): void => {
  const store = storage.getStore();
  if (!store) return;
  store.actorId = actorId;
  store.actorRole = actorRole;
};
