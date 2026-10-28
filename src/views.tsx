import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { parseTags, type EntryInput, type QueueDeletion, type QueueInput } from "./lib/data";
import { byDuration, longLabel, queueLabel, shortLabel } from "./lib/queues";
import { formatDue } from "./lib/scheduling";
import type { SyncConfig } from "./storage/gistSync";
import type { ThemePref } from "./theme";
import { TIME_UNITS, type Entry, type Interval, type Queue, type TimeUnit, type Topic } from "./types";

export function Modal({
  title,
  close,
  wide,
  children,
}: {
  title: string;
  close: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function EntryEditor({
  entry,
  topic,
  now,
  close,
  save,
  move,
  remove,
}: {
  entry: Entry;
  topic: Topic;
  now: Date;
  close: () => void;
  save: (input: EntryInput) => void;
  move: (queueId: string) => void;
  remove: () => void;
}) {
  const [title, setTitle] = useState(entry.title),
    [notes, setNotes] = useState(entry.notes ?? ""),
    [tags, setTags] = useState(entry.tags.join(", "));
  const queue = topic.queues.find((q) => q.id === entry.queueId);
  const moves = entry.history.length - 1;
  return (
    <Modal title="Entry" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({ title, notes, tags: parseTags(tags) });
        }}
      >
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
        </label>
        <label>
          Tags
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="graphs, bfs" />
        </label>
        <div className="field">
          <span>
            Move to <small>(restarts the timer)</small>
          </span>
          <div className="chips">
            {byDuration(topic.queues).map((q) => (
              <button
                type="button"
                key={q.id}
                className={q.id === entry.queueId ? "on" : ""}
                title={longLabel(q)}
                onClick={() => move(q.id)}
              >
                {queueLabel(q, topic.queues)}
              </button>
            ))}
          </div>
        </div>
        <p className="muted">
          Added {new Date(entry.createdAt).toLocaleDateString()} · moved {moves} time{moves === 1 ? "" : "s"}
          {queue?.interval && ` · ${formatDue(entry, queue, now)}`}
        </p>
        <div className="modal-actions">
          <button type="button" className="danger" onClick={remove}>
            Remove
          </button>
          <span />
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

const NEVER = "never";
export function QueueEditor({
  queue,
  topic,
  count,
  close,
  save,
  remove,
}: {
  queue: Queue | null;
  topic: Topic;
  count: number;
  close: () => void;
  save: (input: QueueInput) => void;
  remove: (how: QueueDeletion) => void;
}) {
  const [name, setName] = useState(queue?.name ?? ""),
    [value, setValue] = useState(queue?.interval?.value ?? 2),
    [unit, setUnit] = useState<TimeUnit | typeof NEVER>(queue ? (queue.interval?.unit ?? NEVER) : "week"),
    [random, setRandom] = useState(!!queue?.random),
    [deleting, setDeleting] = useState(false);
  const others = byDuration(topic.queues).filter((q) => q.id !== queue?.id);
  const [mode, setMode] = useState<QueueDeletion["mode"]>("move"),
    [target, setTarget] = useState(others[0]?.id ?? "");
  const interval: Interval | null = unit === NEVER ? null : { unit, value };
  if (queue && deleting)
    return (
      <Modal title={`Delete ${queueLabel(queue, topic.queues)}?`} close={close}>
        {count === 0 ? (
          <p>This queue is empty.</p>
        ) : (
          <>
            <p>
              It holds {count} entr{count === 1 ? "y" : "ies"}.
            </p>
            <label className="inline">
              <input type="radio" checked={mode === "move"} onChange={() => setMode("move")} /> Move them to{" "}
              <select value={target} disabled={mode !== "move"} onChange={(e) => setTarget(e.target.value)}>
                {others.map((q) => (
                  <option key={q.id} value={q.id}>
                    {queueLabel(q, topic.queues)}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline">
              <input type="radio" checked={mode === "drop"} onChange={() => setMode("drop")} /> Remove them
              too
            </label>
          </>
        )}
        <div className="modal-actions">
          <span />
          <button onClick={() => setDeleting(false)}>Back</button>
          <button
            className="danger"
            onClick={() => remove(mode === "move" && count ? { mode: "move", target } : { mode: "drop" })}
          >
            Delete queue
          </button>
        </div>
      </Modal>
    );
  return (
    <Modal title={queue ? "Edit queue" : "New queue"} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({ name, interval, random: random && !!interval });
        }}
      >
        <label>
          Bring entries back after
          <div className="duration">
            <input
              type="number"
              min="1"
              step="1"
              value={value}
              disabled={unit === NEVER}
              onChange={(e) => setValue(Math.max(1, Math.floor(+e.target.value) || 1))}
            />
            <select value={unit} onChange={(e) => setUnit(e.target.value as TimeUnit | typeof NEVER)}>
              {TIME_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}s
                </option>
              ))}
              <option value={NEVER}>never (parking queue)</option>
            </select>
          </div>
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={random && unit !== NEVER}
            disabled={unit === NEVER}
            onChange={(e) => setRandom(e.target.checked)}
          />
          Resurface at a random time (between 1× and 2× this delay)
        </label>
        <label>
          Name <small>(optional)</small>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={shortLabel({ id: "", interval, createdOrder: 0, random: random || undefined })}
          />
        </label>
        <div className="modal-actions">
          {queue && (
            <button
              type="button"
              className="danger"
              disabled={topic.queues.length === 1}
              onClick={() => setDeleting(true)}
            >
              Delete
            </button>
          )}
          <span />
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {queue ? "Save" : "Add queue"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TopicEditor({
  topic,
  canDelete,
  close,
  save,
  remove,
}: {
  topic: Topic | null;
  canDelete: boolean;
  close: () => void;
  save: (title: string) => void;
  remove: () => void;
}) {
  const [title, setTitle] = useState(topic?.title ?? "");
  return (
    <Modal title={topic ? "Topic" : "New topic"} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(title);
        }}
      >
        <label>
          Name
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. DSA, System design, Spanish"
            autoFocus
          />
        </label>
        {!topic && (
          <p className="muted">
            It starts with 1d · 3d · 1w · 1mo · Random · Done queues. You can change them later.
          </p>
        )}
        <div className="modal-actions">
          {topic && (
            <button type="button" className="danger" disabled={!canDelete} onClick={remove}>
              Delete topic
            </button>
          )}
          <span />
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!title.trim()}>
            {topic ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "☀ Light" },
  { value: "dark", label: "☾ Dark" },
];
export interface CloudSync {
  config: SyncConfig | null;
  busy: boolean;
  connect: (token: string) => void;
  save: () => void;
  load: () => void;
  compare: () => void;
  disconnect: () => void;
}
const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
function CloudPanel({ cloud }: { cloud: CloudSync }) {
  const [token, setToken] = useState("");
  const { config, busy } = cloud;
  return (
    <article className="panel">
      <h3>Cloud sync (GitHub Gist)</h3>
      {config ? (
        <>
          <p className="muted">
            {config.remoteUpdatedAt
              ? `Last synced ${new Date(config.remoteUpdatedAt).toLocaleString()}`
              : "Not saved to the cloud yet"}
            {/* Shown so a growing save gets noticed: see NOTE (size limit) in storage/gistSync.ts. */}
            {config.bytes !== undefined && ` · ${formatBytes(config.bytes)}`}
            {config.dirty && " · unsaved changes"}
          </p>
          <div className="actions">
            <button className="primary" disabled={busy} onClick={cloud.save}>
              Save to cloud
            </button>
            <button disabled={busy || !config.gistId} onClick={cloud.load}>
              Load from cloud
            </button>
            <button disabled={busy || !config.gistId} onClick={cloud.compare}>
              Sync with diff
            </button>
            <button disabled={busy} onClick={cloud.disconnect}>
              Disconnect
            </button>
          </div>
          {config.gistId && (
            <a href={`https://gist.github.com/${config.gistId}`} target="_blank" rel="noreferrer">
              View the gist and its save history ↗
            </a>
          )}
        </>
      ) : (
        <>
          <p className="muted">
            Save your progress to a private gist and load it in another browser or on another laptop. Create a{" "}
            <a
              href="https://github.com/settings/tokens/new?scopes=gist&description=TreatCode"
              target="_blank"
              rel="noreferrer"
            >
              token with only gist access
            </a>{" "}
            and paste it here. It's stored only in this browser.
          </p>
          <form
            className="token-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (token.trim()) cloud.connect(token.trim());
            }}
          >
            <input
              type="password"
              placeholder="GitHub token"
              autoComplete="off"
              aria-label="GitHub token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button className="primary" disabled={busy || !token.trim()}>
              Connect
            </button>
          </form>
        </>
      )}
    </article>
  );
}
export function SettingsView({
  theme,
  setTheme,
  exportData,
  importData,
  fileRef,
  cloud,
  clear,
  back,
}: {
  theme: ThemePref;
  setTheme: (theme: ThemePref) => void;
  exportData: () => void;
  importData: (f?: File) => void;
  fileRef: RefObject<HTMLInputElement | null>;
  cloud: CloudSync;
  clear: () => void;
  back: () => void;
}) {
  return (
    <section className="settings">
      <button className="link" onClick={back}>
        ← Back to board
      </button>
      <h2>Settings</h2>
      <article className="panel">
        <h3>Appearance</h3>
        <p className="muted">System follows your device's light or dark setting.</p>
        <div className="chips" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.value}
              role="radio"
              aria-checked={theme === t.value}
              className={theme === t.value ? "on" : ""}
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </article>
      <CloudPanel cloud={cloud} />
      <article className="panel">
        <h3>Backup</h3>
        <p className="muted">
          Everything lives in this browser. Export a JSON file to keep an offline copy, or move devices
          without cloud sync.
        </p>
        <div className="actions">
          <button onClick={exportData}>Export JSON</button>
          <button onClick={() => fileRef.current?.click()}>Import JSON</button>
        </div>
        <input
          hidden
          ref={fileRef}
          type="file"
          accept="application/json"
          onChange={(e) => importData(e.target.files?.[0])}
        />
      </article>
      <article className="panel">
        <h3>Danger zone</h3>
        <p className="muted">Deletes every topic, queue and entry.</p>
        <button className="danger" onClick={clear}>
          Clear all data
        </button>
      </article>
    </section>
  );
}
