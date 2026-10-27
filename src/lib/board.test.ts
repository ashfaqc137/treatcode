import { describe, expect, it } from "vitest";
import {
  addEntry,
  createTopic,
  deleteTopic,
  moveEntry,
  parseTags,
  renameTopic,
  updateEntry,
  validate,
} from "./data";
import { allTags, buildBoard, nextUp } from "./board";
import { dueAt, formatDue } from "./scheduling";
import { emptyAppData, type AppData } from "../types";

const t0 = new Date("2026-01-20T00:00:00.000Z");
const later = (days: number, hours = 0) => new Date(t0.getTime() + days * 86_400_000 + hours * 3_600_000);
const topic = (data: AppData) => data.topics.find((t) => t.id === data.selectedTopicId)!;
const ids = (data: AppData) => topic(data).queues.map((q) => q.id);
const titles = (entries: { title: string }[]) => entries.map((e) => e.title);

function seeded() {
  let data = emptyAppData();
  const [d1, d3, w1, , random, done] = ids(data);
  data = addEntry(data, "default", d3, { title: "Two Sum", tags: ["arrays"] }, t0);
  data = addEntry(data, "default", d1, { title: "Heap", tags: ["heap", "arrays"] }, t0);
  data = addEntry(data, "default", w1, { title: "Graphs" }, t0);
  data = addEntry(data, "default", done, { title: "FizzBuzz" }, t0);
  return { data, d1, d3, w1, random, done };
}

describe("entries", () => {
  it("cleans titles, notes and tags", () => {
    const base = emptyAppData();
    const data = addEntry(base, "default", ids(base)[0], {
      title: "  LRU  ",
      notes: "  ",
      tags: parseTags("Design, cache  design"),
    });
    expect(data.entries[0]).toMatchObject({ title: "LRU", notes: undefined, tags: ["design", "cache"] });
  });
  it("rejects duplicate titles within a topic only", () => {
    let data = emptyAppData();
    data = addEntry(data, "default", ids(data)[0], { title: "Two Sum" });
    expect(() => addEntry(data, "default", ids(data)[1], { title: "two sum" })).toThrow();
    data = createTopic(data, "Other");
    expect(() => addEntry(data, topic(data).id, ids(data)[0], { title: "Two Sum" })).not.toThrow();
  });
  it("restarts the timer when moved, even into the same queue", () => {
    const { data, d3 } = seeded();
    const id = data.entries[0].id;
    const again = moveEntry(data, id, d3, later(4));
    expect(again.entries[0]).toMatchObject({ queueId: d3, movedAt: later(4).toISOString() });
    expect(again.entries[0].history.map((h) => h.to)).toEqual([d3, d3]);
  });
  it("edits details without touching the schedule", () => {
    const { data } = seeded();
    const edited = updateEntry(data, data.entries[0].id, { title: "Two Sum II", notes: "hash map" });
    expect(edited.entries[0]).toMatchObject({
      title: "Two Sum II",
      notes: "hash map",
      movedAt: t0.toISOString(),
      tags: [],
    });
  });
});

describe("board", () => {
  it("pulls due entries into the due lane, most overdue first", () => {
    const { data, d1, d3, w1, done } = seeded();
    const board = buildBoard(topic(data), data.entries, later(4));
    expect(titles(board.due)).toEqual(["Heap", "Two Sum"]);
    const col = (id: string) => titles(board.columns.find((c) => c.queue.id === id)!.entries);
    expect([col(d1), col(d3), col(w1), col(done)]).toEqual([[], [], ["Graphs"], ["FizzBuzz"]]);
  });
  it("puts re-queued entries back in their column", () => {
    const { data, d1 } = seeded();
    const heap = data.entries.find((e) => e.title === "Heap")!;
    const moved = moveEntry(data, heap.id, d1, later(4));
    const board = buildBoard(topic(moved), moved.entries, later(4));
    expect(titles(board.due)).toEqual(["Two Sum"]);
    expect(titles(board.columns[0].entries)).toEqual(["Heap"]);
  });
  it("reports the next entry to come due", () => {
    const { data } = seeded();
    const next = nextUp(buildBoard(topic(data), data.entries, later(0, 6)), topic(data));
    expect(next?.entry.title).toBe("Heap");
    expect(formatDue(next!.entry, next!.queue, later(0, 6))).toBe("in 18h");
  });
  it("formats overdue times", () => {
    const { data, d3 } = seeded();
    const queue = topic(data).queues.find((q) => q.id === d3);
    expect(formatDue(data.entries[0], queue, later(3))).toBe("due now");
    expect(formatDue(data.entries[0], queue, later(3, 5))).toBe("5h overdue");
    expect(formatDue(data.entries[0], queue, later(5))).toBe("2d overdue");
  });
  it("resurfaces random entries at a stable point between 1x and 2x the delay", () => {
    const { data, random } = seeded();
    const queue = topic(data).queues.find((q) => q.id === random)!;
    const graphs = data.entries.find((e) => e.title === "Graphs")!;
    const parked = moveEntry(data, graphs.id, random, t0).entries.find((e) => e.id === graphs.id)!;
    const due = dueAt(parked, queue)!.getTime();
    expect(due).toBeGreaterThanOrEqual(later(14).getTime());
    expect(due).toBeLessThan(later(28).getTime());
    expect(dueAt(parked, queue)!.getTime()).toBe(due);
    expect(dueAt({ ...parked, movedAt: later(0, 1).toISOString() }, queue)!.getTime() - 3_600_000).not.toBe(
      due,
    );
    const spread = new Set(
      Array.from({ length: 50 }, (_, i) => dueAt({ ...parked, id: `e${i}` }, queue)!.getTime()),
    );
    expect(spread.size).toBeGreaterThan(45);
    expect(buildBoard(topic(data), [parked], later(13)).due).toHaveLength(0);
    expect(buildBoard(topic(data), [parked], later(28)).due).toHaveLength(1);
  });
  it("hides the exact due time of random entries", () => {
    const { data, random } = seeded();
    const queue = topic(data).queues.find((q) => q.id === random)!;
    const entry = { ...data.entries[0], queueId: random };
    const due = dueAt(entry, queue)!;
    expect(formatDue(entry, queue, later(4))).toBe("in 10d+");
    if (due > later(14)) expect(formatDue(entry, queue, later(14))).toBe("any day now");
    expect(formatDue(entry, queue, due)).toBe("due now");
  });
  it("collects tags", () => expect(allTags(seeded().data.entries)).toEqual(["arrays", "heap"]));
});

describe("topics", () => {
  it("creates, selects, renames and deletes topics with their entries", () => {
    let { data } = seeded();
    data = createTopic(data, "System design");
    expect(topic(data).title).toBe("System design");
    expect(() => createTopic(data, "system DESIGN")).toThrow();
    data = renameTopic(data, topic(data).id, "SD");
    data = deleteTopic(data, "default");
    expect(data.entries).toHaveLength(0);
    expect(topic(data).title).toBe("SD");
    expect(() => deleteTopic(data, topic(data).id)).toThrow();
  });
});

describe("validation", () => {
  it("round-trips its own data", () => {
    const { data } = seeded();
    expect(validate(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
  it("rejects the old subject format", () =>
    expect(() => validate({ version: 3, subjects: [], items: [], selectedSubjectId: "x" })).toThrow());
  it("rejects malformed random queues", () => {
    const { data } = seeded();
    const withQueue = (patch: object) => ({
      ...data,
      topics: data.topics.map((t) => ({
        ...t,
        queues: t.queues.map((q, i) => (i ? q : { ...q, ...patch })),
      })),
    });
    expect(() => validate(withQueue({ random: "yes" }))).toThrow();
    expect(() => validate(withQueue({ random: true, interval: null }))).toThrow();
    expect(() => validate(withQueue({ random: true }))).not.toThrow();
  });
  it("rejects entries in unknown queues", () => {
    const { data } = seeded();
    expect(() => validate({ ...data, entries: [{ ...data.entries[0], queueId: "nope" }] })).toThrow();
  });
});
