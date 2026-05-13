import { describe, it, expect } from "vitest"
import { inferArea, inferRiskLevel, mapPrStatus } from "../../lib/github/mappers"

describe("inferArea", () => {
  it("infers area from PR title keyword", () => {
    expect(inferArea("fix login redirect after oauth flow", [])).toBe("auth")
    expect(inferArea("update Stripe billing webhook handler", [])).toBe("billing")
    expect(inferArea("run schema migration for new column", [])).toBe("data")
    expect(inferArea("add deploy step to CI pipeline", [])).toBe("deployments")
    expect(inferArea("add Sentry alert for p99 latency metric", [])).toBe("observability")
    expect(inferArea("refactor UI component with new CSS design", [])).toBe("frontend")
  })

  it("infers area from labels when title has no match", () => {
    expect(inferArea("update stuff", ["oauth"])).toBe("auth")
    expect(inferArea("update stuff", ["migration"])).toBe("data")
  })

  it("title keywords take priority over nothing", () => {
    expect(inferArea("refactor session handling", [])).toBe("auth")
  })

  it("falls back to platform when no keyword matches", () => {
    expect(inferArea("miscellaneous update", [])).toBe("platform")
    expect(inferArea("bump version to 1.2.3", [])).toBe("platform")
  })
})

describe("inferRiskLevel", () => {
  const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
  const old    = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago

  it("returns high for high-risk label", () => {
    expect(inferRiskLevel(["high-risk"], recent)).toBe("high")
  })

  it("returns high for breaking-change label", () => {
    expect(inferRiskLevel(["breaking-change"], recent)).toBe("high")
  })

  it("returns high for security label", () => {
    expect(inferRiskLevel(["security"], recent)).toBe("high")
  })

  it("returns high for critical label", () => {
    expect(inferRiskLevel(["critical"], recent)).toBe("high")
  })

  it("label check is case-insensitive", () => {
    expect(inferRiskLevel(["High-Risk"], recent)).toBe("high")
    expect(inferRiskLevel(["SECURITY"], recent)).toBe("high")
  })

  it("returns medium for a PR open longer than the age threshold", () => {
    expect(inferRiskLevel([], old, 7)).toBe("medium")
  })

  it("returns low for a recent PR with no risk labels", () => {
    expect(inferRiskLevel([], recent, 7)).toBe("low")
  })

  it("labels take priority over age heuristic", () => {
    expect(inferRiskLevel(["high-risk"], old, 7)).toBe("high")
  })

  it("respects a custom ageWarningDays threshold", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(inferRiskLevel([], threeDaysAgo, 2)).toBe("medium") // over threshold
    expect(inferRiskLevel([], threeDaysAgo, 7)).toBe("low")    // under threshold
  })
})

describe("mapPrStatus", () => {
  it("maps closed state to done", () => {
    expect(mapPrStatus("closed", false)).toBe("done")
  })

  it("maps open draft to in_progress", () => {
    expect(mapPrStatus("open", true)).toBe("in_progress")
  })

  it("maps open non-draft to in_review", () => {
    expect(mapPrStatus("open", false)).toBe("in_review")
  })

  it("closed draft is still done (closed wins)", () => {
    expect(mapPrStatus("closed", true)).toBe("done")
  })
})
