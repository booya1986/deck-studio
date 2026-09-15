import { describe, expect, it } from "vitest";
import { parseEnv, upsertEnv } from "@/lib/setup/env-file";

describe(".env.local handling", () => {
  it("parses keys, quotes, export prefixes and inline comments", () => {
    const env = parseEnv(`# comment
ANTHROPIC_API_KEY=sk-ant-abc
export PORT=3100   # local port
NAME="Deck Studio"
EMPTY=
not a line`);
    expect(env).toEqual({ ANTHROPIC_API_KEY: "sk-ant-abc", PORT: "3100", NAME: "Deck Studio", EMPTY: "" });
  });

  it("replaces a key in place and keeps comments and order", () => {
    const text = "# Claude\nANTHROPIC_API_KEY=old\n# Port\nPORT=3000\n";
    expect(upsertEnv(text, { ANTHROPIC_API_KEY: "new" })).toBe("# Claude\nANTHROPIC_API_KEY=new\n# Port\nPORT=3000\n");
  });

  it("removes a key with null and appends new keys", () => {
    const text = "ANTHROPIC_API_KEY=old\nPORT=3000\n";
    expect(upsertEnv(text, { ANTHROPIC_API_KEY: null, EXTRA: "a b" })).toBe('PORT=3000\nEXTRA="a b"\n');
  });

  it("writes into an empty file", () => {
    expect(upsertEnv("", { PORT: "3001" })).toBe("PORT=3001\n");
    expect(upsertEnv("", { PORT: null })).toBe("");
  });
});
