import { describe, expect, it } from "vitest";
import { evaluateQuotas } from "./quotas";

describe("plan quotas", () => {
  it("counts quotas as soft limits", () => {
    const results = evaluateQuotas("SIMPLE", { activeUsers: 21, publishedPages: 5, storageBytes: 1 });
    expect(results.find((item) => item.code === "activeUsers")).toMatchObject({ exceeded: true, enforcement: "SOFT" });
  });

  it("keeps unlimited users and pages unbounded", () => {
    const results = evaluateQuotas("UNLIMITED", { activeUsers: 10000, publishedPages: 5000, storageBytes: 1 });
    expect(results.filter((item) => item.limit === null).every((item) => !item.exceeded)).toBe(true);
  });
});
