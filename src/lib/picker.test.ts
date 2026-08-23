import { describe, expect, it } from "vitest";
import { addTitles, classify } from "./data";
import { nextFresh, pickNextRevision } from "./picker";
import { emptyAppData, type StudyItem } from "../types";
const now = new Date("2026-01-20T00:00:00.000Z");
const item = (id: string, status: StudyItem["status"], daysAgo: number): StudyItem => ({
  id,
  subjectId: "default",
  title: id,
  status,
  createdAt: now.toISOString(),
  createdOrder: 0,
  lastAttemptedAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  attemptCount: 1,
  history: [],
});
describe("revision picker", () => {
  it("never selects ineligible items", () =>
    expect(pickNextRevision([item("r1", "R1", 0.9)], now, emptyAppData().subjects[0].settings)).toBeNull());
  it("treats settings as full gap days", () =>
    expect(pickNextRevision([item("r1", "R1", 1)], now, emptyAppData().subjects[0].settings)).toBeNull());
  it("uses RD queue priority", () =>
    expect(
      pickNextRevision([item("r1", "R1", 2), item("rd", "RD", 11)], now, emptyAppData().subjects[0].settings)
        ?.id,
    ).toBe("rd"));
  it("chooses oldest eligible item within a queue", () =>
    expect(
      pickNextRevision(
        [item("newer", "R2", 3), item("older", "R2", 6)],
        now,
        emptyAppData().subjects[0].settings,
      )?.id,
    ).toBe("older"));
  it("lets a sufficiently overdue item override priority", () =>
    expect(
      pickNextRevision([item("r1", "R1", 4), item("rd", "RD", 11)], now, emptyAppData().subjects[0].settings)
        ?.id,
    ).toBe("r1"));
  it("responds immediately to interval settings", () => {
    const settings = emptyAppData().subjects[0].settings;
    settings.intervals.R1 = 3;
    expect(pickNextRevision([item("r1", "R1", 2)], now, settings)).toBeNull();
  });
});
describe("item changes", () => {
  it("consumes fresh items in insertion order and rejects normalized duplicates", () => {
    let data = addTitles(emptyAppData(), "default", ["One", "Two"], now);
    expect(nextFresh(data.items)?.title).toBe("One");
    expect(() => addTitles(data, "default", [" one "], now)).toThrow();
  });
  it("allows movement from any queue on classification", () => {
    const data = { ...emptyAppData(), items: [item("x", "RD", 12)] };
    expect(classify(data, "x", "R1", now).items[0].status).toBe("R1");
  });
});
