import { useState, type CSSProperties, type DragEvent } from "react";
import { addEntry, parseTags } from "./lib/data";
import { allTags, buildBoard, nextUp } from "./lib/board";
import { byDuration, longLabel, queueLabel } from "./lib/queues";
import { formatDue, span } from "./lib/scheduling";
import type { AppData, Entry, Queue, Topic } from "./types";

const PALETTE = ["#7c5cff", "#3b82f6", "#0ea5a4", "#22a55a", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];
export const DUE_ACCENT = "#ff5d5d";
export function accents(queues: Queue[]) {
  let i = 0;
  return new Map(
    byDuration(queues).map((q) => [q.id, q.interval ? PALETTE[i++ % PALETTE.length] : "#94a3b8"]),
  );
}
const accent = (color: string) => ({ "--accent": color }) as CSSProperties;

export interface BoardActions {
  commit: (next: AppData, toast?: string) => void;
  fail: (e: unknown) => void;
  move: (entry: Entry, queueId: string) => void;
  remove: (entry: Entry) => void;
  open: (entry: Entry) => void;
  editQueue: (queue: Queue | "new") => void;
}
export function BoardView({
  data,
  topic,
  now,
  actions,
}: {
  data: AppData;
  topic: Topic;
  now: Date;
  actions: BoardActions;
}) {
  const [tag, setTag] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const entries = data.entries.filter((e) => e.topicId === topic.id);
  const tags = allTags(entries);
  const board = buildBoard(
    topic,
    entries.filter((e) => !tag || e.tags.includes(tag)),
    now,
  );
  const next = nextUp(board, topic);
  const colors = accents(topic.queues);
  const queues = byDuration(topic.queues);
  const label = (q: Queue) => queueLabel(q, topic.queues);
  const drop = (queueId: string) => (e: DragEvent) => {
    e.preventDefault();
    const entry = entries.find((x) => x.id === e.dataTransfer.getData("text/plain"));
    setOver(null);
    setDragging(null);
    if (entry) actions.move(entry, queueId);
  };
  const dropZone = (id: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setOver(id);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
    },
    onDrop: drop(id),
  });
  const card = (entry: Entry, due: boolean) => {
    const queue = topic.queues.find((q) => q.id === entry.queueId)!;
    return (
      <EntryCard
        key={entry.id}
        entry={entry}
        queue={queue}
        queueLabel={label(queue)}
        color={colors.get(queue.id)!}
        now={now}
        due={due}
        dragging={dragging === entry.id}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", entry.id);
          e.dataTransfer.effectAllowed = "move";
          setDragging(entry.id);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
        }}
        actions={actions}
        queues={queues}
        labelOf={label}
        colors={colors}
      />
    );
  };
  return (
    <section className="board-page">
      <QuickAdd key={topic.id} data={data} topic={topic} colors={colors} actions={actions} />
      <div className="status-row">
        <p className={`status ${board.due.length ? "has-due" : ""}`}>
          {board.due.length ? (
            <>
              <b>{board.due.length}</b> {board.due.length === 1 ? "entry is" : "entries are"} waiting for you.
              Drop each one into a queue to schedule it again.
            </>
          ) : next ? (
            <>
              All caught up ✨ Next up: <b>{next.entry.title}</b> {formatDue(next.entry, next.queue, now)}
            </>
          ) : entries.length ? (
            <>All caught up ✨</>
          ) : (
            <>Solve something, then add it above. It will come back when its queue says so.</>
          )}
        </p>
        {tags.length > 0 && (
          <div className="tag-filter">
            <button className={!tag ? "on" : ""} onClick={() => setTag(null)}>
              all
            </button>
            {tags.map((t) => (
              <button key={t} className={tag === t ? "on" : ""} onClick={() => setTag(tag === t ? null : t)}>
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`board ${dragging ? "is-dragging" : ""}`}>
        <div className="column due-lane" style={accent(DUE_ACCENT)}>
          <header>
            <h3>
              Due now <span className="count">{board.due.length}</span>
            </h3>
            <small>Review, then re-queue</small>
          </header>
          <div className="cards">
            {board.due.map((e) => card(e, true))}
            {!board.due.length && (
              <div className="empty">
                <span>🎉</span>
                Nothing due
              </div>
            )}
          </div>
        </div>
        {board.columns.map(({ queue, entries }) => (
          <div
            key={queue.id}
            className={`column ${over === queue.id ? "over" : ""}`}
            style={accent(colors.get(queue.id)!)}
            {...dropZone(queue.id)}
          >
            <header>
              <h3>
                {label(queue)} <span className="count">{entries.length}</span>
              </h3>
              <small>
                {queue.interval ? `Back in ${longLabel(queue).toLowerCase()}` : "No more reviews"}
              </small>
              <button className="icon" title="Edit queue" onClick={() => actions.editQueue(queue)}>
                ⋯
              </button>
            </header>
            <div className="cards">
              {entries.map((e) => card(e, false))}
              {!entries.length && <div className="empty">Drop entries here</div>}
            </div>
          </div>
        ))}
        <button className="column add-column" onClick={() => actions.editQueue("new")}>
          + Add queue
        </button>
      </div>
    </section>
  );
}

function EntryCard({
  entry,
  queue,
  queueLabel,
  color,
  now,
  due,
  dragging,
  onDragStart,
  onDragEnd,
  actions,
  queues,
  labelOf,
  colors,
}: {
  entry: Entry;
  queue: Queue;
  queueLabel: string;
  color: string;
  now: Date;
  due: boolean;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  actions: BoardActions;
  queues: Queue[];
  labelOf: (q: Queue) => string;
  colors: Map<string, string>;
}) {
  const when = queue.interval
    ? formatDue(entry, queue, now)
    : `done ${span(now.getTime() - Date.parse(entry.movedAt))} ago`;
  return (
    <article
      className={`entry ${due ? "due" : ""} ${dragging ? "dragging" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => actions.open(entry)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && actions.open(entry)}
      tabIndex={0}
    >
      <div className="entry-title">{entry.title}</div>
      {due && (
        <button
          className="icon remove"
          title="Remove"
          onClick={(e) => {
            e.stopPropagation();
            actions.remove(entry);
          }}
        >
          ✕
        </button>
      )}
      {entry.notes && <p className="entry-notes">{entry.notes}</p>}
      {entry.tags.length > 0 && (
        <div className="entry-tags">
          {entry.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </div>
      )}
      <div className="entry-meta">
        {due && (
          <span className="from" style={accent(color)}>
            {queueLabel}
          </span>
        )}
        <span className={due ? "late" : ""}>{when}</span>
      </div>
      {due && (
        <div className="requeue" onClick={(e) => e.stopPropagation()}>
          {queues.map((q) => (
            <button
              key={q.id}
              style={accent(colors.get(q.id)!)}
              title={q.id === queue.id ? `Again: ${longLabel(q)}` : longLabel(q)}
              className={q.id === queue.id ? "again" : ""}
              onClick={() => actions.move(entry, q.id)}
            >
              {labelOf(q)}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function QuickAdd({
  data,
  topic,
  colors,
  actions,
}: {
  data: AppData;
  topic: Topic;
  colors: Map<string, string>;
  actions: BoardActions;
}) {
  const queues = byDuration(topic.queues);
  const [title, setTitle] = useState(""),
    [queueId, setQueueId] = useState(queues[0].id),
    [more, setMore] = useState(false),
    [notes, setNotes] = useState(""),
    [tags, setTags] = useState("");
  const target = topic.queues.find((q) => q.id === queueId) ?? queues[0];
  const submit = () => {
    try {
      actions.commit(
        addEntry(data, topic.id, target.id, { title, notes, tags: parseTags(tags) }),
        `Added “${title.trim()}” to ${queueLabel(target, topic.queues)}`,
      );
      setTitle("");
      setNotes("");
      setTags("");
    } catch (e) {
      actions.fail(e);
    }
  };
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="quick-row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`What did you just work on in ${topic.title}?`}
          aria-label="Entry title"
        />
        <button type="submit" className="primary" disabled={!title.trim()}>
          Add
        </button>
      </div>
      <div className="quick-row">
        <span className="hint">Bring it back in</span>
        <div className="chips">
          {queues.map((q) => (
            <button
              type="button"
              key={q.id}
              style={accent(colors.get(q.id)!)}
              className={q.id === target.id ? "on" : ""}
              title={longLabel(q)}
              onClick={() => setQueueId(q.id)}
            >
              {queueLabel(q, topic.queues)}
            </button>
          ))}
        </div>
        <button type="button" className="link" onClick={() => setMore(!more)}>
          {more ? "− fewer details" : "+ notes & tags"}
        </button>
      </div>
      {more && (
        <div className="quick-more">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes: key insight, where you got stuck, a link…"
            rows={2}
          />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags: graphs, bfs" />
        </div>
      )}
    </form>
  );
}
