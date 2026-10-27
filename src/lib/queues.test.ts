import { describe, expect, it } from "vitest";
import { createQueue, deleteQueue, updateQueue, validateImport } from "./data";
import { addDuration, byPriority, longLabel, queueLabel, shortLabel } from "./queues";
import { pickNextRevision } from "./picker";
import { dueAt } from "./scheduling";
import { emptyAppData, type AppData, type Queue, type StudyItem } from "../types";

const q = (unit: Queue["unit"], value: number, createdOrder = 0, name?: string): Queue => ({
  id: `${value}${unit}${createdOrder}`,
  unit,
  value,
  name,
  createdOrder,
});
const now = new Date("2026-01-20T00:00:00.000Z");
const item = (id: string, status: string, hoursAgo = 0): StudyItem => ({
  id,
  subjectId: "default",
  title: id,
  status,
  createdAt: now.toISOString(),
  createdOrder: 0,
  lastAttemptedAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
  attemptCount: 1,
  history: [{ attemptedAt: now.toISOString(), previousStatus: "NEW", resultingStatus: status }],
});
const queuesOf = (data: AppData) => data.subjects[0].settings.queues;

describe("queue labels", () => {
  it("auto-names with a short label and a long tooltip", () => {
    expect([shortLabel(q("day", 3)), longLabel(q("day", 3))]).toEqual(["3d", "3 Days"]);
    expect([shortLabel(q("hour", 6)), longLabel(q("hour", 6))]).toEqual(["6h", "6 Hours"]);
    expect([shortLabel(q("week", 2)), longLabel(q("week", 2))]).toEqual(["2w", "2 Weeks"]);
    expect([shortLabel(q("month", 1)), longLabel(q("month", 1))]).toEqual(["1mo", "1 Month"]);
  });
  it("suffixes duplicate durations in creation order", () => {
    const queues = [q("week", 2, 0), q("week", 2, 1), q("week", 2, 2)];
    expect(queues.map((x) => queueLabel(x, queues))).toEqual(["2w", "2w(1)", "2w(2)"]);
  });
  it("prefers a custom name", () => {
    const queues = [q("week", 2, 0, "Warm-up"), q("week", 2, 1)];
    expect(queues.map((x) => queueLabel(x, queues))).toEqual(["Warm-up", "2w"]);
  });
});

describe("durations", () => {
  it("adds calendar months, clamping to the month end", () =>
    expect(addDuration(new Date("2026-01-31T10:00:00Z"), q("month", 1)).toISOString()).toBe(
      "2026-02-28T10:00:00.000Z",
    ));
  it("makes hour queues due the same day", () => {
    const queue = q("hour", 6);
    const settings = { queues: [queue], starvationMultiplier: 2 };
    expect(pickNextRevision([item("a", queue.id, 5)], now, settings)).toBeNull();
    expect(pickNextRevision([item("a", queue.id, 6)], now, settings)?.id).toBe("a");
  });
  it("orders priority by duration, then creation order", () =>
    expect(
      byPriority([q("day", 3, 0), q("month", 1, 1), q("week", 2, 2), q("week", 2, 3)]).map((x) => x.id),
    ).toEqual(["1month1", "2week2", "2week3", "3day0"]));
});

describe("queue management", () => {
  it("creates auto-named queues and rejects clashing names", () => {
    let data = createQueue(emptyAppData(), "default", { unit: "week", value: 2 });
    data = createQueue(data, "default", { unit: "week", value: 2 });
    const queues = queuesOf(data);
    expect(queues.slice(-2).map((x) => queueLabel(x, queues))).toEqual(["2w", "2w(1)"]);
    expect(() => createQueue(data, "default", { unit: "day", value: 5, name: "2w" })).toThrow();
    expect(() => createQueue(data, "default", { unit: "day", value: 5, name: "new" })).toThrow();
    expect(() => createQueue(data, "default", { unit: "day", value: 0 })).toThrow();
  });
  it("renames and reverts to the auto label", () => {
    const data = emptyAppData();
    const id = queuesOf(data)[0].id;
    const renamed = updateQueue(data, "default", id, { name: "Hard" });
    expect(queueLabel(queuesOf(renamed)[0], queuesOf(renamed))).toBe("Hard");
    const reverted = updateQueue(renamed, "default", id, { name: " " });
    expect(queueLabel(queuesOf(reverted)[0], queuesOf(reverted))).toBe("1d");
  });
  it("moves items on delete, keeping history and rescheduling", () => {
    const base = emptyAppData();
    const [d1, , , d10] = queuesOf(base).map((x) => x.id);
    const data = { ...base, items: [item("a", d1, 30)] };
    const moved = deleteQueue(data, "default", d1, { mode: "move", target: d10 });
    expect(queuesOf(moved).some((x) => x.id === d1)).toBe(false);
    expect(moved.items[0]).toMatchObject({ status: d10, lastAttemptedAt: data.items[0].lastAttemptedAt });
    expect(moved.items[0].history).toHaveLength(1);
    expect(dueAt(moved.items[0], moved.subjects[0].settings)!.getTime()).toBe(
      new Date(data.items[0].lastAttemptedAt!).getTime() + 10 * 86_400_000,
    );
  });
  it("moves items back to NEW", () => {
    const base = emptyAppData();
    const d1 = queuesOf(base)[0].id;
    const moved = deleteQueue({ ...base, items: [item("a", d1)] }, "default", d1, {
      mode: "move",
      target: "NEW",
    });
    expect(moved.items[0]).toMatchObject({ status: "NEW", lastAttemptedAt: undefined });
  });
  it("drops items on delete", () => {
    const base = emptyAppData();
    const [d1, d2] = queuesOf(base).map((x) => x.id);
    const dropped = deleteQueue({ ...base, items: [item("a", d1), item("b", d2)] }, "default", d1, {
      mode: "drop",
    });
    expect(dropped.items.map((i) => i.id)).toEqual(["b"]);
  });
  it("refuses to delete the last queue", () => {
    let data = emptyAppData();
    for (const x of queuesOf(data).slice(1)) data = deleteQueue(data, "default", x.id, { mode: "drop" });
    expect(() => deleteQueue(data, "default", queuesOf(data)[0].id, { mode: "drop" })).toThrow();
  });
});

describe("migration", () => {
  it("converts v2 R1..RD into day queues and remaps items and history", () => {
    const data = validateImport({
      version: 2,
      selectedSubjectId: "default",
      subjects: [
        {
          id: "default",
          title: "Default",
          createdAt: now.toISOString(),
          settings: { intervals: { R1: 1, R2: 2, R3: 4, RD: 1.5 }, starvationMultiplier: 3 },
        },
      ],
      items: [
        { ...item("a", "R3"), history: [{ attemptedAt: "x", previousStatus: "R1", resultingStatus: "R3" }] },
      ],
    });
    const queues = queuesOf(data);
    expect(queues.map(shortLabel)).toEqual(["1d", "2d", "4d", "36h"]);
    expect(data.subjects[0].settings.starvationMultiplier).toBe(3);
    expect(data.items[0].status).toBe(queues[2].id);
    expect(data.items[0].history[0]).toMatchObject({
      previousStatus: queues[0].id,
      resultingStatus: queues[2].id,
    });
  });
  it("rejects malformed queues", () => {
    const data = emptyAppData();
    const bad = { ...queuesOf(data)[0], name: {} };
    expect(() =>
      validateImport({
        ...data,
        subjects: [{ ...data.subjects[0], settings: { queues: [bad], starvationMultiplier: 2 } }],
      }),
    ).toThrow();
  });
  it("rejects items in unknown queues", () =>
    expect(() => validateImport({ ...emptyAppData(), items: [item("a", "nope")] })).toThrow());
});
