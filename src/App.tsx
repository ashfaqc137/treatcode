import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createQueue,
  createTopic,
  deleteQueue,
  deleteTopic,
  emptyAppData,
  moveEntry,
  removeEntry,
  renameTopic,
  updateEntry,
  updateQueue,
  validate,
} from "./lib/data";
import { checksum } from "./lib/checksum";
import { queueLabel } from "./lib/queues";
import { indexedDbStorage } from "./storage/indexedDb";
import {
  changedSince,
  findGist,
  loadSync,
  pullGist,
  pushGist,
  remoteState,
  storeSync,
  SYNC_KEY,
  SyncError,
  syncedTo,
  syncStep,
  type RemoteState,
  type SyncConfig,
} from "./storage/gistSync";
import type { AppData, Entry, Queue } from "./types";
import { BoardView, type BoardActions } from "./Board";
import { EntryEditor, QueueEditor, SettingsView, TopicEditor, type CloudSync } from "./views";
import { SyncDiff } from "./SyncDiff";
import { useTheme } from "./theme";

interface Toast {
  text: string;
  error?: boolean;
  undo?: AppData;
  // Another device saved newer progress; offers a Sync button and stays until acted on.
  offerSync?: boolean;
}
const when = (iso: string) => new Date(iso).toLocaleString();
// Configs from before checksums said `dirty: false` when this browser matched its last sync, so
// the data it has now is what was synced.
function upgradeSync(data: AppData) {
  const old = loadSync() as (SyncConfig & { dirty?: boolean }) | null;
  if (!old || !("dirty" in old)) return;
  const { dirty, ...config } = old;
  storeSync(dirty ? config : { ...config, syncedChecksum: checksum(data) });
}
// Read-only check on open and on returning to the tab. A newer cloud revision holding the same
// content is adopted quietly; any other returns its save time. Errors are ignored so being offline
// doesn't nag; Sync still reports them.
async function newerCloudCopy(local: AppData) {
  const sync = loadSync();
  if (!sync?.gistId) return null;
  const pulled = await pullGist(sync.token, sync.gistId).catch(() => null);
  // A Sync finished while this was in flight, so its answer is already out of date.
  if (loadSync()?.remoteVersion !== sync.remoteVersion) return null;
  if (!pulled || !changedSince(sync, pulled)) return null;
  if (checksum(pulled.data) !== checksum(local)) return pulled.updatedAt;
  storeSync(syncedTo(sync, pulled, local));
  return null;
}
type Pulled = Awaited<ReturnType<typeof pullGist>>;
type Dialog =
  | { kind: "entry"; id: string }
  | { kind: "queue"; queue: Queue | null }
  | { kind: "topic"; editing: boolean };
export default function App() {
  const [data, setData] = useState<AppData | null>(null),
    [view, setView] = useState<"board" | "settings">("board"),
    [toast, setToast] = useState<Toast | null>(null),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [now, setNow] = useState(() => new Date()),
    [sync, setSync] = useState(loadSync),
    [syncing, setSyncing] = useState(false),
    // The cloud has a revision this browser hasn't synced, as of the last check.
    [cloudAhead, setCloudAhead] = useState(false),
    // The cloud copy shown in the Sync modal.
    [comparing, setComparing] = useState<Pulled | null>(null);
  const [theme, setTheme, shownTheme] = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let local = emptyAppData();
    indexedDbStorage
      .load()
      .then((x) => {
        local = validate(x);
        upgradeSync(local);
      })
      .catch(() =>
        setToast({ text: "Saved data was from an older version, so you're starting with a fresh board." }),
      )
      .then(() => {
        setData(local);
        setSync(loadSync());
        return newerCloudCopy(local);
      })
      .then((remote) => {
        setSync(loadSync());
        setCloudAhead(!!remote);
        if (remote)
          setToast(
            (t) =>
              t ?? { text: `Newer progress from another device (saved ${when(remote)}).`, offerSync: true },
          );
      });
  }, []);
  // Another tab synced or disconnected: pick up its sync state so this tab's next Sync
  // doesn't mistake that tab's save for another device's.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SYNC_KEY) setSync(loadSync());
    };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);
  // Re-render every minute so entries slide into "Due now" without a refresh.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast || toast.offerSync) return;
    const id = setTimeout(() => setToast(null), toast.undo ? 6000 : 4000);
    return () => clearTimeout(id);
  }, [toast]);
  // Coming back to the tab: look for another device's save, at most every 5 minutes.
  const lastCheck = useRef(Date.now());
  useEffect(() => {
    if (!data || syncing) return;
    const check = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck.current < 5 * 60_000) return;
      lastCheck.current = Date.now();
      newerCloudCopy(data).then((remote) => {
        setSync(loadSync());
        setCloudAhead(!!remote);
      });
    };
    addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [data, syncing]);
  const close = useCallback(() => setDialog(null), []);
  const localChecksum = useMemo(() => data && checksum(data), [data]);
  if (!data) return <main className="loading">Loading…</main>;
  const topic = data.topics.find((t) => t.id === data.selectedTopicId)!;
  // Local content differs from what this browser last synced.
  const dirty = !!sync && localChecksum !== sync.syncedChecksum;
  // Dot colour on the Sync button, matching the diff's sides.
  const pending = dirty && cloudAhead ? "differs" : dirty ? "local" : cloudAhead ? "cloud" : null;
  const syncHint = { local: "unsaved changes", cloud: "newer copy in the cloud", differs: "both changed" };

  const updateSync = (next: SyncConfig | null) => {
    setSync(next);
    storeSync(next);
  };
  const save = (next: AppData) => {
    setData(next);
    setNow(new Date());
    indexedDbStorage.save(next).catch(() => setToast({ text: "Changes could not be saved.", error: true }));
  };
  const commit = (next: AppData, text?: string) => {
    save(next);
    if (text) setToast({ text, undo: data });
  };
  const fail = (e: unknown) => setToast({ text: (e as Error).message, error: true });
  const attempt = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      fail(e);
    }
  };
  const label = (queueId: string) =>
    queueLabel(
      topic.queues.find((q) => q.id === queueId)!,
      topic.queues,
    );
  const actions: BoardActions = {
    commit,
    fail,
    move: (entry, queueId) =>
      attempt(() =>
        commit(
          moveEntry(data, entry.id, queueId),
          entry.queueId === queueId
            ? `“${entry.title}” goes around ${label(queueId)} again`
            : `Moved “${entry.title}” to ${label(queueId)}`,
        ),
      ),
    remove: (entry) => commit(removeEntry(data, entry.id), `Removed “${entry.title}”`),
    open: (entry: Entry) => setDialog({ kind: "entry", id: entry.id }),
    editQueue: (queue) => setDialog({ kind: "queue", queue: queue === "new" ? null : queue }),
  };

  const exportData = () => {
    const u = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = "treatcode.json";
    a.click();
    URL.revokeObjectURL(u);
  };
  const importData = async (f?: File) => {
    if (!f) return;
    try {
      const x = validate(JSON.parse(await f.text()));
      if (confirm("Replace all current data?")) commit(x, "Import complete");
    } catch (e) {
      fail(e);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Cloud sync is manual: the gist only changes when the user presses Sync.
  const runSync = async (fn: () => Promise<void>) => {
    if (syncing) return;
    setSyncing(true);
    try {
      await fn();
    } catch (e) {
      // The gist is gone (or out of the token's reach): forget it so the next Sync creates a new one.
      if (sync && e instanceof SyncError && e.status === 404) {
        updateSync({
          ...sync,
          gistId: undefined,
          remoteUpdatedAt: undefined,
          remoteVersion: undefined,
          syncedChecksum: undefined,
        });
        setComparing(null);
      }
      fail(e);
    } finally {
      setSyncing(false);
    }
  };
  // Read it fresh in case another tab synced since this one last rendered.
  const currentSync = () => ({ ...sync!, ...loadSync() });
  const synced = (s: SyncConfig, remote: RemoteState & { bytes: number }, content: AppData) => {
    updateSync(syncedTo(s, remote, content));
    setCloudAhead(false);
  };
  const applyPulled = (s: SyncConfig, pulled: Pulled) => {
    // The selected topic is this device's view, so stay on it if the cloud copy has it too.
    const stay = pulled.data.topics.some((t) => t.id === data.selectedTopicId);
    commit(
      stay ? { ...pulled.data, selectedTopicId: data.selectedTopicId } : pulled.data,
      "Loaded from cloud",
    );
    synced(s, pulled, pulled.data);
  };
  const pushNow = async (s: SyncConfig) => {
    const pushed = await pushGist(s.token, s.gistId, data);
    synced({ ...s, gistId: pushed.gistId }, pushed, data);
    setToast({ text: "Saved to cloud" });
  };
  const cloud: CloudSync = {
    config: sync,
    dirty,
    cloudAhead,
    busy: syncing,
    connect: (token) =>
      runSync(async () => {
        const found = await findGist(token);
        if (!found) {
          updateSync({ token });
          setToast({ text: "Connected. Press Sync to create your cloud copy." });
        } else if (confirm(`Cloud copy found (saved ${when(found.updatedAt)}). Load it now?`)) {
          applyPulled({ token, gistId: found.id }, await pullGist(token, found.id));
        } else {
          // No remote revision known yet, so the first Sync shows the diff before anything is overwritten.
          updateSync({ token, gistId: found.id });
          setToast({ text: "Connected. Your local data was kept." });
        }
      }),
    // Nothing to compare against until the first save, so that one goes straight up.
    sync: () =>
      runSync(async () => {
        const s = currentSync();
        if (!s.gistId) return pushNow(s);
        const pulled = await pullGist(s.token, s.gistId);
        switch (syncStep(s, pulled, localChecksum!, checksum(pulled.data))) {
          case "in-sync":
            synced(s, pulled, data);
            setToast({ text: "Already in sync" });
            break;
          case "push":
            return pushNow(s);
          case "pull":
            return applyPulled(s, pulled);
          case "conflict":
            setComparing(pulled);
        }
      }),
    disconnect: () => {
      updateSync(null);
      setCloudAhead(false);
    },
  };
  const keepLocal = (pulled: Pulled) =>
    runSync(async () => {
      const s = currentSync();
      // Someone saved while the diff was open: show them what changed rather than overwrite it unseen.
      const remote = await remoteState(s.token, s.gistId!);
      if (changedSince({ ...s, remoteUpdatedAt: pulled.updatedAt, remoteVersion: pulled.version }, remote)) {
        setComparing(await pullGist(s.token, s.gistId!));
        setToast({ text: "The cloud copy changed while you were comparing, so the diff was refreshed." });
        return;
      }
      await pushNow(s);
      setComparing(null);
    });

  const entry = dialog?.kind === "entry" ? data.entries.find((e) => e.id === dialog.id) : undefined;
  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">↻</span>
          <h1>TreatCode</h1>
        </div>
        <button
          className="icon theme-toggle"
          title={`Switch to ${shownTheme === "dark" ? "light" : "dark"} theme`}
          aria-label={`Switch to ${shownTheme === "dark" ? "light" : "dark"} theme`}
          onClick={() => setTheme(shownTheme === "dark" ? "light" : "dark")}
        >
          {shownTheme === "dark" ? "☀" : "☾"}
        </button>
        {sync && (
          <button
            className="icon sync"
            title={pending ? `Sync with cloud (${syncHint[pending]})` : "Sync with cloud"}
            aria-label={pending ? `Sync with cloud, ${syncHint[pending]}` : "Sync with cloud"}
            disabled={syncing}
            onClick={cloud.sync}
          >
            ⇅{pending && <span className={`dot ${pending}`} />}
          </button>
        )}
        <button
          className={`icon ${view === "settings" ? "on" : ""}`}
          title="Settings"
          onClick={() => setView(view === "settings" ? "board" : "settings")}
        >
          ⚙
        </button>
      </header>
      {view === "settings" && (
        <button className="link back-nav" onClick={() => setView("board")}>
          ← Back to board
        </button>
      )}
      <nav className="topics" aria-label="Topics">
        {data.topics.map((t) => (
          <button
            key={t.id}
            className={t.id === topic.id ? "on" : ""}
            title={t.id === topic.id ? "Rename or delete" : undefined}
            onClick={() => {
              setView("board");
              if (t.id === topic.id) setDialog({ kind: "topic", editing: true });
              else save({ ...data, selectedTopicId: t.id });
            }}
          >
            {t.title}
            {t.id === topic.id && <span className="pencil">✎</span>}
          </button>
        ))}
        <button className="add-topic" onClick={() => setDialog({ kind: "topic", editing: false })}>
          + Topic
        </button>
      </nav>
      {view === "board" ? (
        <BoardView data={data} topic={topic} now={now} actions={actions} />
      ) : (
        <SettingsView
          theme={theme}
          setTheme={setTheme}
          exportData={exportData}
          importData={importData}
          fileRef={fileRef}
          cloud={cloud}
          clear={async () => {
            if (confirm("Delete all data? This cannot be undone.")) {
              await indexedDbStorage.clear();
              setData(emptyAppData());
              setView("board");
            }
          }}
        />
      )}
      {entry && (
        <EntryEditor
          key={entry.id}
          entry={entry}
          topic={topic}
          now={now}
          close={close}
          save={(input) =>
            attempt(() => {
              commit(updateEntry(data, entry.id, input));
              close();
            })
          }
          move={(queueId) => {
            actions.move(entry, queueId);
            close();
          }}
          remove={() => {
            actions.remove(entry);
            close();
          }}
        />
      )}
      {dialog?.kind === "queue" && (
        <QueueEditor
          queue={dialog.queue}
          topic={topic}
          count={data.entries.filter((e) => e.queueId === dialog.queue?.id).length}
          close={close}
          save={(input) =>
            attempt(() => {
              commit(
                dialog.queue
                  ? updateQueue(data, topic.id, dialog.queue.id, input)
                  : createQueue(data, topic.id, input),
              );
              close();
            })
          }
          remove={(how) =>
            attempt(() => {
              commit(deleteQueue(data, topic.id, dialog.queue!.id, how), "Queue deleted");
              close();
            })
          }
        />
      )}
      {dialog?.kind === "topic" && (
        <TopicEditor
          topic={dialog.editing ? topic : null}
          canDelete={data.topics.length > 1}
          close={close}
          save={(title) =>
            attempt(() => {
              commit(dialog.editing ? renameTopic(data, topic.id, title) : createTopic(data, title));
              close();
            })
          }
          remove={() =>
            attempt(() => {
              commit(deleteTopic(data, topic.id), `Deleted topic “${topic.title}”`);
              close();
            })
          }
        />
      )}
      {comparing && sync && (
        <SyncDiff
          local={data}
          cloud={comparing.data}
          cloudSavedAt={comparing.updatedAt}
          config={sync}
          dirty={dirty}
          busy={syncing}
          keepLocal={() => keepLocal(comparing)}
          keepCloud={() => {
            applyPulled(currentSync(), comparing);
            setComparing(null);
          }}
          close={() => setComparing(null)}
        />
      )}
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          <span>{toast.text}</span>
          {toast.offerSync && (
            <button
              onClick={() => {
                setToast(null);
                cloud.sync();
              }}
            >
              Sync
            </button>
          )}
          {toast.undo && (
            <button
              onClick={() => {
                save(toast.undo!);
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
          <button className="icon" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </main>
  );
}
