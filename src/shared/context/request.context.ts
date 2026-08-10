import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  actorId?: string;
  actorRole?: string;
  ip?: string;

  route?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn);

export const currentContext = (): RequestContext | undefined =>
  storage.getStore();

export const setContextActor = (actorId: string, actorRole: string): void => {
  const store = storage.getStore();
  if (!store) return;
  store.actorId = actorId;
  store.actorRole = actorRole;
};
