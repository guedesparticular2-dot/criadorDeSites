import { describe, expect, it } from "vitest";
import { canAcceptUpload, canDiscardOriginal } from "./storage-policy";

describe("media storage policy", () => {
  it("stops uploads at 80 percent disk use", () => {
    expect(canAcceptUpload({ mimeType: "image/jpeg", byteSize: 1024, diskUsedPercent: 80 }).reason).toBe("DISK_HEADROOM");
  });

  it("keeps the original until all variants exist", () => {
    expect(canDiscardOriginal(["thumb", "medium", "large"], ["thumb", "medium"])).toBe(false);
    expect(canDiscardOriginal(["thumb", "medium", "large"], ["thumb", "medium", "large"])).toBe(true);
  });
});
