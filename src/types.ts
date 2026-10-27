export const TIME_UNITS = ["hour", "day", "week", "month"] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];
export interface Interval {
  unit: TimeUnit;
  value: number;
}
// A queue without an interval is a parking lot (e.g. "Done"): its entries never come due.
export interface Queue {
  id: string;
  interval: Interval | null;
  name?: string;
  createdOrder: number;
}
export interface MoveRecord {
  at: string;
  from?: string;
  to: string;
}
export interface Entry {
  id: string;
  topicId: string;
  title: string;
  queueId: string;
  notes?: string;
  tags: string[];
  createdAt: string;
  // When the entry entered its current queue; the due date counts from here.
  movedAt: string;
  history: MoveRecord[];
}
export interface Topic {
  id: string;
  title: string;
  createdAt: string;
  queues: Queue[];
}
export interface AppData {
  version: 4;
  topics: Topic[];
  selectedTopicId: string;
  entries: Entry[];
}
export const defaultQueues = (): Queue[] =>
  [
    { interval: { unit: "day", value: 1 } },
    { interval: { unit: "day", value: 3 } },
    { interval: { unit: "week", value: 1 } },
    { interval: { unit: "month", value: 1 } },
    { interval: null, name: "Done" },
  ].map((q, createdOrder) => ({ id: crypto.randomUUID(), ...q, createdOrder }) as Queue);
export const newTopic = (title: string, id: string = crypto.randomUUID()): Topic => ({
  id,
  title,
  createdAt: new Date().toISOString(),
  queues: defaultQueues(),
});
export const emptyAppData = (): AppData => {
  const topic = newTopic("My topic", "default");
  return { version: 4, topics: [topic], selectedTopicId: topic.id, entries: [] };
};
