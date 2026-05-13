import { describe, it, expect } from "vitest"
import { parseIds } from "@/db/schema"

describe("parseIds", () => {
  it("parses a valid JSON array", () => {
    expect(parseIds('["a","b"]')).toEqual(["a", "b"])
  })
  it("returns empty array on invalid JSON", () => {
    expect(parseIds("not-json")).toEqual([])
  })
  it("returns empty array on empty string", () => {
    expect(parseIds("")).toEqual([])
  })
})
