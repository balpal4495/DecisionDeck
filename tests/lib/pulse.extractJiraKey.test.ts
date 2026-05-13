import { describe, it, expect } from "vitest"
import { extractJiraKey } from "@/lib/pulse"

describe("extractJiraKey", () => {
  // ── Standard hyphen-separated ─────────────────────────────────────────────

  it("extracts a standard uppercase key", () => {
    expect(extractJiraKey("DBD-3157 replace nginx ingress")).toBe("DBD-3157")
  })

  it("normalises lowercase to uppercase", () => {
    expect(extractJiraKey("dbd-3157 fix thing")).toBe("DBD-3157")
  })

  it("extracts key wrapped in brackets", () => {
    expect(extractJiraKey("[DBD-2959] some feature")).toBe("DBD-2959")
  })

  it("extracts key mid-title", () => {
    expect(extractJiraKey("feat: DBD-1234 update login flow")).toBe("DBD-1234")
  })

  it("prefers hyphen format when both forms present", () => {
    // hyphen match should win over any incidental space pattern
    expect(extractJiraKey("DBD-1000 at 2000 things")).toBe("DBD-1000")
  })

  // ── Space-separated fallback ──────────────────────────────────────────────

  it("extracts space-separated key (mixed case)", () => {
    expect(extractJiraKey("Dbd 3157 replace nginx ingress scrat services")).toBe("DBD-3157")
  })

  it("extracts space-separated key (uppercase)", () => {
    expect(extractJiraKey("DBD 2959 some description")).toBe("DBD-2959")
  })

  it("extracts space-separated key (all lowercase)", () => {
    expect(extractJiraKey("dbd 1234 fix the thing")).toBe("DBD-1234")
  })

  it("extracts space-separated key at start of branch-style title", () => {
    expect(extractJiraKey("Dbd 3157/replace-nginx")).toBe("DBD-3157")
  })

  // ── No-match cases ────────────────────────────────────────────────────────

  it("returns null when no key present", () => {
    expect(extractJiraKey("replace nginx ingress scrat services")).toBeNull()
  })

  it("does not match 2-letter words followed by numbers (common English)", () => {
    // "at 999" — 2 letters, below the 3-char minimum for space-separated
    expect(extractJiraKey("at 999 things changed")).toBeNull()
  })

  it("does not match version strings like 'Node 20'", () => {
    // 2-digit number — below the 3-digit minimum for space-separated
    expect(extractJiraKey("upgrade Node 20 in CI")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(extractJiraKey("")).toBeNull()
  })
})
