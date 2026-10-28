import type { AppData, Entry, Queue, Topic } from "../types";
import { longLabel, queueLabel } from "./queues";

// What differs between this browser's data and the cloud copy, for the Sync with diff modal.
// Marks name a side, not an add or a delete: with no record of the last synced version, an item
// only in the cloud may have been added there or deleted here.
export type Mark = "local" | "cloud" | "differs";
export interface Change {
  mark: Mark;
  title: string;
  detail?: string;
}
export interface TopicDiff extends Change {
  id: string;
  changes: Change[];
}

const entryCount = (data: AppData, topicId: string) => {
  const n = data.entries.filter((e) => e.topicId === topicId).length;
  return `${n} entr${n === 1 ? "y" : "ies"}`;
};
const labelIn = (topic: Topic, queueId: string) => {
  const queue = topic.queues.find((q) => q.id === queueId);
  return queue ? queueLabel(queue, topic.queues) : "an unknown queue";
};
const day = (iso: string) => new Date(iso).toLocaleDateString();
const tagList = (e: Entry) => (e.tags.length ? e.tags.join(", ") : "none");
const sameQueue = (a: Queue, b: Queue) =>
  a.name === b.name &&
  !!a.random === !!b.random &&
  a.interval?.unit === b.interval?.unit &&
  a.interval?.value === b.interval?.value;

// Matches topics, queues and entries by id. selectedTopicId, move history and createdOrder are left
// out: they rarely matter when picking a side, and the JSON view still shows them.
export function diffData(local: AppData, cloud: AppData): TopicDiff[] {
  const cloudTopics = new Map(cloud.topics.map((t) => [t.id, t]));
  const localIds = new Set(local.topics.map((t) => t.id));
  const result: TopicDiff[] = [];
  for (const topic of local.topics) {
    const other = cloudTopics.get(topic.id);
    if (!other) {
      const detail = entryCount(local, topic.id);
      result.push({ id: topic.id, mark: "local", title: topic.title, detail, changes: [] });
      continue;
    }
    const changes = [...queueChanges(topic, other), ...entryChanges(local, cloud, topic, other)];
    const renamed = topic.title !== other.title;
    if (renamed || changes.length)
      result.push({
        id: topic.id,
        mark: "differs",
        title: topic.title,
        detail: renamed ? `cloud name “${other.title}”` : undefined,
        changes,
      });
  }
  for (const topic of cloud.topics)
    if (!localIds.has(topic.id)) {
      const detail = entryCount(cloud, topic.id);
      result.push({ id: topic.id, mark: "cloud", title: topic.title, detail, changes: [] });
    }
  return result;
}

function queueChanges(local: Topic, cloud: Topic): Change[] {
  const cloudQueues = new Map(cloud.queues.map((q) => [q.id, q]));
  const localIds = new Set(local.queues.map((q) => q.id));
  const changes: Change[] = [];
  for (const q of local.queues) {
    const other = cloudQueues.get(q.id);
    const title = `Queue ${queueLabel(q, local.queues)}`;
    if (!other) changes.push({ mark: "local", title, detail: longLabel(q) });
    else if (!sameQueue(q, other))
      changes.push({
        mark: "differs",
        title,
        detail: `local ${longLabel(q)} · cloud “${queueLabel(other, cloud.queues)}”, ${longLabel(other)}`,
      });
  }
  for (const q of cloud.queues)
    if (!localIds.has(q.id))
      changes.push({ mark: "cloud", title: `Queue ${queueLabel(q, cloud.queues)}`, detail: longLabel(q) });
  return changes;
}

function entryChanges(local: AppData, cloud: AppData, localTopic: Topic, cloudTopic: Topic): Change[] {
  const inTopic = (data: AppData, topicId: string) => data.entries.filter((e) => e.topicId === topicId);
  const cloudEntries = new Map(inTopic(cloud, cloudTopic.id).map((e) => [e.id, e]));
  const localEntries = inTopic(local, localTopic.id);
  const localIds = new Set(localEntries.map((e) => e.id));
  const changes: Change[] = [];
  for (const e of localEntries) {
    const other = cloudEntries.get(e.id);
    if (!other) {
      changes.push({
        mark: "local",
        title: e.title,
        detail: `in ${labelIn(localTopic, e.queueId)}`,
      });
      continue;
    }
    const diffs: string[] = [];
    if (e.title !== other.title) diffs.push(`cloud title “${other.title}”`);
    if (e.queueId !== other.queueId)
      diffs.push(`local ${labelIn(localTopic, e.queueId)} · cloud ${labelIn(cloudTopic, other.queueId)}`);
    else if (e.movedAt !== other.movedAt)
      diffs.push(`timer differs: local since ${day(e.movedAt)} · cloud since ${day(other.movedAt)}`);
    if ((e.notes ?? "") !== (other.notes ?? "")) diffs.push("notes differ");
    if (e.tags.join() !== other.tags.join())
      diffs.push(`tags: local ${tagList(e)} · cloud ${tagList(other)}`);
    if (diffs.length) changes.push({ mark: "differs", title: e.title, detail: diffs.join("; ") });
  }
  for (const e of cloudEntries.values())
    if (!localIds.has(e.id))
      changes.push({
        mark: "cloud",
        title: e.title,
        detail: `in ${labelIn(cloudTopic, e.queueId)}`,
      });
  return changes;
}

// Line diff for the JSON view.
export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}
// Past this many LCS cells (~16 MB) the changed block is shown as removed, then added, instead.
const MAX_CELLS = 4_000_000;
export function lineDiff(a: string, b: string): DiffLine[] {
  const x = a.split("\n"),
    y = b.split("\n");
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length,
    endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const same = (lines: string[]) => lines.map((text): DiffLine => ({ kind: "same", text }));
  return [
    ...same(x.slice(0, start)),
    ...middle(x.slice(start, endX), y.slice(start, endY)),
    ...same(x.slice(endX)),
  ];
}
function middle(x: string[], y: string[]): DiffLine[] {
  const del = (text: string): DiffLine => ({ kind: "del", text }),
    add = (text: string): DiffLine => ({ kind: "add", text });
  const n = x.length,
    m = y.length;
  if (n * m > MAX_CELLS) return [...x.map(del), ...y.map(add)];
  // lcs[i * w + j] = length of the longest common subsequence of x[i..] and y[j..].
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i * w + j] =
        x[i] === y[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
  const out: DiffLine[] = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ kind: "same", text: x[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) out.push(del(x[i++]));
    else out.push(add(y[j++]));
  }
  return [...out, ...x.slice(i).map(del), ...y.slice(j).map(add)];
}

// Keeps `context` unchanged lines around each change and folds the rest into a skip marker.
export type ShownLine = DiffLine | { kind: "skip"; count: number };
export function collapse(lines: DiffLine[], context = 3): ShownLine[] {
  const out: ShownLine[] = [];
  for (let i = 0; i < lines.length;) {
    if (lines[i].kind !== "same") {
      out.push(lines[i++]);
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].kind === "same") j++;
    const before = i === 0 ? 0 : context,
      after = j === lines.length ? 0 : context;
    if (j - i > before + after + 1)
      out.push(
        ...lines.slice(i, i + before),
        { kind: "skip", count: j - i - before - after },
        ...lines.slice(j - after, j),
      );
    else out.push(...lines.slice(i, j));
    i = j;
  }
  return out;
}
