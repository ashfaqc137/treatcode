import type { Entry, Queue, Topic } from "../types";
import { byDuration } from "./queues";
import { dueAt, isDue } from "./scheduling";

export interface Column {
  queue: Queue;
  entries: Entry[];
}
export interface Board {
  due: Entry[];
  columns: Column[];
}
const time = (d: Date | null) => d?.getTime() ?? Infinity;
// Due entries leave their queue's column and gather in the "Due now" lane, most overdue first.
export function buildBoard(topic: Topic, entries: Entry[], now: Date): Board {
  const queues = new Map(topic.queues.map((q) => [q.id, q]));
  const soonest = (a: Entry, b: Entry) =>
    time(dueAt(a, queues.get(a.queueId))) - time(dueAt(b, queues.get(b.queueId))) ||
    b.movedAt.localeCompare(a.movedAt);
  const mine = entries.filter((e) => e.topicId === topic.id);
  return {
    due: mine.filter((e) => isDue(e, queues.get(e.queueId), now)).sort(soonest),
    columns: byDuration(topic.queues).map((queue) => ({
      queue,
      entries: mine.filter((e) => e.queueId === queue.id && !isDue(e, queue, now)).sort(soonest),
    })),
  };
}
export function nextUp(board: Board, topic: Topic) {
  const queued = board.columns.flatMap((c) => c.entries.map((e) => ({ e, due: dueAt(e, c.queue) })));
  const next = queued.filter((x) => x.due).sort((a, b) => time(a.due) - time(b.due))[0];
  return next
    ? { entry: next.e, due: next.due!, queue: topic.queues.find((q) => q.id === next.e.queueId)! }
    : null;
}
export const allTags = (entries: Entry[]) => [...new Set(entries.flatMap((e) => e.tags))].sort();
