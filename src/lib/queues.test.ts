import { describe, expect, it } from "vitest";
import { addEntry, createQueue, deleteQueue, updateQueue } from "./data";
import { addDuration, byDuration, longLabel, queueLabel, shortLabel } from "./queues";
import { dueAt } from "./scheduling";
import { emptyAppData, type AppData, type Queue, type TimeUnit } from "../types";

const q = (unit: TimeUnit | null, value = 1, createdOrder = 0, name?: string): Queue => ({
  id: `${value}${unit}${createdOrder}`,
  interval: unit ? { unit, value } : null,
  name,
  createdOrder,
});
const now = new Date("2026-01-20T00:00:00.000Z");
const queuesOf = (data: AppData) => data.topics[0].queues;

describe("queue labels", () => {
  it("auto-names with a short label and a long tooltip", () => {
    expect([shortLabel(q("day", 3)), longLabel(q("day", 3))]).toEqual(["3d", "3 Days"]);
    expect([shortLabel(q("hour", 6)), longLabel(q("hour", 6))]).toEqual(["6h", "6 Hours"]);
    expect([shortLabel(q("week", 2)), longLabel(q("week", 2))]).toEqual(["2w", "2 Weeks"]);
    expect([shortLabel(q("month", 1)), longLabel(q("month", 1))]).toEqual(["1mo", "1 Month"]);
    expect(shortLabel(q(null))).toBe("Done");
  });
  it("suffixes duplicate durations in creation order", () => {
    const queues = [q("week", 2, 0), q("week", 2, 1), q("week", 2, 2)];
    expect(queues.map((x) => queueLabel(x, queues))).toEqual(["2w", "2w(1)", "2w(2)"]);
  });
  it("prefers a custom name", () => {
    const queues = [q("week", 2, 0, "Warm-up"), q("week", 2, 1)];
    expect(queues.map((x) => queueLabel(x, queues))).toEqual(["Warm-up", "2w"]);
  });
  it("starts topics with 1d, 3d, 1w, 1mo and Done", () =>
    expect(byDuration(queuesOf(emptyAppData())).map((x) => queueLabel(x, queuesOf(emptyAppData())))).toEqual([
      "1d",
      "3d",
      "1w",
      "1mo",
      "Done",
    ]));
});

describe("durations", () => {
  it("adds calendar months, clamping to the month end", () =>
    expect(addDuration(new Date("2026-01-31T10:00:00Z"), { unit: "month", value: 1 }).toISOString()).toBe(
      "2026-02-28T10:00:00.000Z",
    ));
  it("orders by duration, then creation order, with parking queues last", () =>
    expect(
      byDuration([q(null, 1, 4), q("day", 3, 0), q("month", 1, 1), q("week", 2, 2), q("week", 2, 3)]).map(
        (x) => x.id,
      ),
    ).toEqual(["3day0", "2week2", "2week3", "1month1", "1null4"]));
});

describe("queue management", () => {
  it("creates auto-named queues and rejects clashing names", () => {
    let data = createQueue(emptyAppData(), "default", { interval: { unit: "week", value: 2 } });
    data = createQueue(data, "default", { interval: { unit: "week", value: 2 } });
    const queues = queuesOf(data);
    expect(queues.slice(-2).map((x) => queueLabel(x, queues))).toEqual(["2w", "2w(1)"]);
    expect(() => createQueue(data, "default", { interval: { unit: "day", value: 5 }, name: "2w" })).toThrow();
    expect(() => createQueue(data, "default", { interval: { unit: "day", value: 0 } })).toThrow();
  });
  it("creates a second parking queue with a suffix", () => {
    const data = createQueue(emptyAppData(), "default", { interval: null, name: "Shelved" });
    expect(queueLabel(queuesOf(data).at(-1)!, queuesOf(data))).toBe("Shelved");
    expect(() => createQueue(data, "default", { interval: null, name: "done" })).toThrow();
  });
  it("renames and reverts to the auto label", () => {
    const data = emptyAppData();
    const id = queuesOf(data)[0].id;
    const renamed = updateQueue(data, "default", id, { name: "Hard" });
    expect(queueLabel(queuesOf(renamed)[0], queuesOf(renamed))).toBe("Hard");
    const reverted = updateQueue(renamed, "default", id, { name: " " });
    expect(queueLabel(queuesOf(reverted)[0], queuesOf(reverted))).toBe("1d");
  });
  it("moves entries on delete, keeping their timer start", () => {
    const base = emptyAppData();
    const [d1, , w1] = queuesOf(base).map((x) => x.id);
    const data = addEntry(base, "default", d1, { title: "a" }, now);
    const moved = deleteQueue(data, "default", d1, { mode: "move", target: w1 });
    expect(queuesOf(moved).some((x) => x.id === d1)).toBe(false);
    expect(moved.entries[0]).toMatchObject({ queueId: w1, movedAt: now.toISOString() });
    expect(
      dueAt(
        moved.entries[0],
        queuesOf(moved).find((x) => x.id === w1),
      )!.getTime(),
    ).toBe(now.getTime() + 7 * 86_400_000);
  });
  it("drops entries on delete", () => {
    const base = emptyAppData();
    const [d1, d3] = queuesOf(base).map((x) => x.id);
    let data = addEntry(base, "default", d1, { title: "a" });
    data = addEntry(data, "default", d3, { title: "b" });
    const dropped = deleteQueue(data, "default", d1, { mode: "drop" });
    expect(dropped.entries.map((e) => e.title)).toEqual(["b"]);
  });
  it("refuses to delete the last queue", () => {
    let data = emptyAppData();
    for (const x of queuesOf(data).slice(1)) data = deleteQueue(data, "default", x.id, { mode: "drop" });
    expect(() => deleteQueue(data, "default", queuesOf(data)[0].id, { mode: "drop" })).toThrow();
  });
});
