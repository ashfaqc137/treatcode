import { describe, expect, it } from "vitest";
import { addEntry, createQueue, createTopic, moveEntry, removeEntry, updateEntry, updateQueue } from "./data";
import { collapse, diffData, lineDiff } from "./diff";
import { emptyAppData, type AppData } from "../types";

const t0 = new Date("2026-01-20T00:00:00.000Z");
const later = new Date("2026-01-25T00:00:00.000Z");
const queues = (data: AppData) => data.topics[0].queues.map((q) => q.id);
const entryId = (data: AppData, title: string) => data.entries.find((e) => e.title === title)!.id;

function seeded() {
  let data = emptyAppData();
  const [d1, d3] = queues(data);
  data = addEntry(data, "default", d1, { title: "Two Sum", tags: ["arrays"] }, t0);
  data = addEntry(data, "default", d3, { title: "Heap" }, t0);
  return data;
}

describe("diffData", () => {
  it("finds nothing when both sides match", () => {
    const data = seeded();
    expect(diffData(data, structuredClone(data))).toEqual([]);
    expect(diffData(data, { ...data, selectedTopicId: "elsewhere" })).toEqual([]);
  });

  it("lists entries that exist on one side only", () => {
    const cloud = seeded();
    let local = addEntry(cloud, "default", queues(cloud)[0], { title: "Graphs" }, t0);
    local = removeEntry(local, entryId(local, "Heap"));
    const [topic] = diffData(local, cloud);
    expect(topic).toMatchObject({ mark: "differs", title: "My topic" });
    expect(topic.changes).toEqual([
      { mark: "local", title: "Graphs", detail: "in 1d" },
      { mark: "cloud", title: "Heap", detail: "in 3d" },
    ]);
  });

  it("shows each side's queue for a moved entry", () => {
    const cloud = seeded();
    const local = moveEntry(cloud, entryId(cloud, "Two Sum"), queues(cloud)[2], later);
    expect(diffData(local, cloud)[0].changes).toEqual([
      { mark: "differs", title: "Two Sum", detail: "local 1w · cloud 1d" },
    ]);
  });

  it("notices a restarted timer, edited notes and tags", () => {
    const cloud = seeded();
    const id = entryId(cloud, "Two Sum");
    let local = moveEntry(cloud, id, queues(cloud)[0], later);
    local = updateEntry(local, id, { title: "Two Sum", notes: "hash map", tags: ["arrays", "hashing"] });
    const [change] = diffData(local, cloud)[0].changes;
    expect(change.detail).toMatch(
      /^timer differs: local since .+ · cloud since .+; notes differ; tags: local arrays, hashing · cloud arrays$/,
    );
  });

  it("reports topics on one side only and renamed topics", () => {
    const cloud = seeded();
    const local = createTopic(cloud, "Spanish");
    const renamed = { ...cloud, topics: [{ ...cloud.topics[0], title: "DSA" }] };
    expect(diffData(local, cloud)).toEqual([
      expect.objectContaining({
        mark: "local",
        title: "Spanish",
        detail: "0 entries",
        changes: [],
      }),
    ]);
    expect(diffData(cloud, local)).toEqual([expect.objectContaining({ mark: "cloud", title: "Spanish" })]);
    expect(diffData(renamed, cloud)).toEqual([
      expect.objectContaining({ mark: "differs", title: "DSA", detail: "cloud name “My topic”" }),
    ]);
  });

  it("reports added and changed queues", () => {
    const cloud = seeded();
    let local = createQueue(cloud, "default", { interval: { unit: "hour", value: 6 } });
    local = updateQueue(local, "default", queues(cloud)[0], { name: "Tomorrow" });
    expect(diffData(local, cloud)[0].changes).toEqual([
      { mark: "differs", title: "Queue Tomorrow", detail: "local 1 Day · cloud “1d”, 1 Day" },
      { mark: "local", title: "Queue 6h", detail: "6 Hours" },
    ]);
  });
});

describe("lineDiff", () => {
  it("marks removed and added lines around the common ones", () => {
    expect(lineDiff("a\nb\nc\nd", "a\nc\nx\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "same", text: "c" },
      { kind: "add", text: "x" },
      { kind: "same", text: "d" },
    ]);
    expect(lineDiff("same", "same")).toEqual([{ kind: "same", text: "same" }]);
  });

  it("falls back to remove-then-add when the changed block is huge", () => {
    const a = Array.from({ length: 2500 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 2500 }, (_, i) => `b${i}`).join("\n");
    const lines = lineDiff(a, b);
    expect(lines).toHaveLength(5000);
    expect(lines[2499]).toEqual({ kind: "del", text: "a2499" });
    expect(lines[2500]).toEqual({ kind: "add", text: "b0" });
  });
});

describe("collapse", () => {
  it("keeps context around changes and folds the rest", () => {
    const text = (n: number) => Array.from({ length: n }, (_, i) => `${i}`).join("\n");
    const shown = collapse(lineDiff(text(20), text(20).replace("\n10\n", "\nten\n")), 2);
    expect(shown.map((l) => (l.kind === "skip" ? `…${l.count}` : `${l.kind[0]}${l.text}`))).toEqual([
      "…8",
      "s8",
      "s9",
      "d10",
      "aten",
      "s11",
      "s12",
      "…7",
    ]);
  });
});
