import { describe, expect, it } from "vitest";
import { assertExpectedVersion, VersionConflictError } from "./optimistic-version";

describe("optimistic version", () => {
  it("increments a matching version", () => expect(assertExpectedVersion(4, 4)).toBe(5));
  it("rejects stale writes", () => expect(() => assertExpectedVersion(3, 4)).toThrow(VersionConflictError));
});
