import { describe, expect, it } from "vitest";
import {
  currentContext,
  runWithContext,
  setContextActor,
} from "../../src/shared/context/request.context";

describe("carrying the context across async boundaries", () => {
  it("stays visible after awaits, however deep", async () => {
    await runWithContext({ ip: "10.0.0.1" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const deeper = async () => {
        await Promise.resolve();
        return currentContext();
      };

      expect(await deeper()).toMatchObject({ ip: "10.0.0.1" });
    });
  });

  it("keeps two overlapping requests apart", async () => {
    const seen: Array<string | undefined> = [];
    const request = (actorId: string, delay: number) =>
      runWithContext({ actorId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        seen.push(currentContext()?.actorId);
      });

    await Promise.all([request("a", 20), request("b", 1)]);

    expect(seen).toEqual(["b", "a"]);
  });

  it("is undefined outside a request", () => {
    expect(currentContext()).toBeUndefined();
  });
});

describe("filling in the actor once authentication resolves it", () => {
  it("writes into the context the request already entered", async () => {
    await runWithContext({ ip: "10.0.0.1" }, () => {
      setContextActor("user_1", "ADMIN");
      expect(currentContext()).toEqual({
        ip: "10.0.0.1",
        actorId: "user_1",
        actorRole: "ADMIN",
      });
    });
  });

  it("does nothing outside a request rather than throwing", () => {
    expect(() => setContextActor("user_1", "ADMIN")).not.toThrow();
    expect(currentContext()).toBeUndefined();
  });
});
