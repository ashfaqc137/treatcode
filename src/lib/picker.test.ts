import { describe, expect, it } from "vitest";
import { addTitles, classify } from "./data";
import { nextFresh, pickNextRevision } from "./picker";
import { emptyAppData, type Settings, type StudyItem } from "../types";
const now = new Date("2026-01-20T00:00:00.000Z");
// Default queues: 1d, 2d, 4d, 10d.
const settings = (): Settings => emptyAppData().subjects[0].settings;
const s = settings();
const [d1, d2, , d10] = s.queues.map((q) => q.id);
const item = (id: string, status: string, daysAgo: number): StudyItem => ({
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
    expect(pickNextRevision([item("a", d1, 0.9)], now, s)).toBeNull());
  it("becomes eligible exactly one interval after the last attempt", () =>
    expect(pickNextRevision([item("a", d1, 1)], now, s)?.id).toBe("a"));
  it("prefers the longest queue", () =>
    expect(pickNextRevision([item("short", d1, 1.5), item("long", d10, 10)], now, s)?.id).toBe("long"));
  it("chooses oldest eligible item within a queue", () =>
    expect(pickNextRevision([item("newer", d2, 3), item("older", d2, 5)], now, s)?.id).toBe("older"));
  it("lets a sufficiently overdue item override priority", () =>
    expect(pickNextRevision([item("short", d1, 3), item("long", d10, 11)], now, s)?.id).toBe("short"));
  it("responds immediately to queue duration changes", () => {
    const changed = settings();
    changed.queues[0] = { ...changed.queues[0], value: 3 };
    expect(pickNextRevision([item("a", changed.queues[0].id, 2)], now, changed)).toBeNull();
  });
  it("ignores items whose queue no longer exists", () =>
    expect(pickNextRevision([item("a", "gone", 30)], now, s)).toBeNull());
});
describe("item changes", () => {
  it("consumes fresh items in insertion order and rejects normalized duplicates", () => {
    const data = addTitles(emptyAppData(), "default", ["One", "Two"], now);
    expect(nextFresh(data.items)?.title).toBe("One");
    expect(() => addTitles(data, "default", [" one "], now)).toThrow();
  });
  it("allows movement from any queue on classification", () => {
    const data = emptyAppData();
    const [first, , , last] = data.subjects[0].settings.queues.map((q) => q.id);
    const moved = classify({ ...data, items: [item("x", last, 12)] }, "x", first, now).items[0];
    expect(moved.status).toBe(first);
    expect(moved.history.at(-1)).toMatchObject({ previousStatus: last, resultingStatus: first });
  });
  it("rejects classification into an unknown queue", () =>
    expect(() => classify({ ...emptyAppData(), items: [item("x", d1, 2)] }, "x", "nope", now)).toThrow());
});
