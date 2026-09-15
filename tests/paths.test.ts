import path from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_DIR, isValidProjectId, pp, projectDir } from "@/lib/store/paths";

describe("project id guard", () => {
  it("accepts the ids the app generates", () => {
    for (const id of ["2026-09-15-728d6b", "2026-09-03-ofek-proceduredocx-f76d7a"]) {
      expect(isValidProjectId(id)).toBe(true);
      expect(projectDir(id)).toBe(path.join(DATA_DIR, id));
    }
  });

  it("rejects any id that could leave the data folder", () => {
    const nul = String.fromCharCode(0);
    const hostile = ["..", "../..", "../../../../etc", "a/b", "a" + "\\" + "b", ".hidden", "", "x".repeat(101), "%2e%2e", "id" + nul, "/etc"];
    for (const id of hostile) {
      expect(isValidProjectId(id)).toBe(false);
      expect(() => projectDir(id)).toThrow();
      expect(() => pp(id)).toThrow();
    }
  });
});
