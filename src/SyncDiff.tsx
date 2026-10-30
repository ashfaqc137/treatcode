import { useMemo, useState } from "react";
import { collapse, diffData, lineDiff, type Mark } from "./lib/diff";
import type { SyncConfig } from "./storage/gistSync";
import type { AppData } from "./types";
import { Modal } from "./views";

const BADGES: Record<Mark, string> = { local: "Local only", cloud: "Cloud only", differs: "Different" };
// The JSON diff runs cloud → local, so its removed lines are the cloud's and its added lines are local's.
const SIDES = { del: "cloud", add: "local", same: "" } as const;
const TABS = [
  { value: "changes", label: "Changes" },
  { value: "json", label: "JSON" },
] as const;
const pretty = (data: AppData) => JSON.stringify(data, null, 2);
const when = (iso: string) => new Date(iso).toLocaleString();

export function SyncDiff({
  local,
  cloud,
  cloudSavedAt,
  config,
  dirty,
  busy,
  keepLocal,
  keepCloud,
  close,
}: {
  local: AppData;
  cloud: AppData;
  cloudSavedAt: string;
  config: SyncConfig;
  dirty: boolean;
  busy: boolean;
  keepLocal: () => void;
  keepCloud: () => void;
  close: () => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("changes");
  const topics = useMemo(() => diffData(local, cloud), [local, cloud]);
  // Only built once the JSON tab is opened: it is the costly one on a big save.
  const lines = useMemo(
    () => (tab === "json" ? collapse(lineDiff(pretty(cloud), pretty(local))) : []),
    [tab, local, cloud],
  );
  return (
    <Modal title="Sync" close={close} wide>
      <p className="muted">
        Cloud copy saved {when(cloudSavedAt)}. This browser last synced{" "}
        {config.remoteUpdatedAt ? when(config.remoteUpdatedAt) : "never"}
        {dirty && " and has unsaved changes"}.
      </p>
      <div className="diff-tabs">
        <div className="chips" role="tablist" aria-label="Diff view">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              className={tab === t.value ? "on" : ""}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "json" && (
          <span className="muted legend">
            <span className="cloud">cloud</span> only in the cloud copy · <span className="local">local</span>{" "}
            only in this browser
          </span>
        )}
      </div>
      <div className="diff-body" role="tabpanel">
        {tab === "json" ? (
          <pre className="json-diff">
            {lines.map((l, i) =>
              l.kind === "skip" ? (
                <div key={i} className="skip">
                  {`      … ${l.count} unchanged line${l.count === 1 ? "" : "s"}`}
                </div>
              ) : (
                <div key={i} className={SIDES[l.kind]}>
                  {SIDES[l.kind].padEnd(6)}
                  {l.text}
                </div>
              ),
            )}
          </pre>
        ) : topics.length ? (
          <ul className="changes">
            {topics.map((t) => (
              <li key={t.id}>
                <div className={`diff-row ${t.mark}`}>
                  <strong>{t.title}</strong>{" "}
                  {/* A topic that only holds differing items needs no badge of its own. */}
                  {(t.mark !== "differs" || t.detail) && <Badge mark={t.mark} />}{" "}
                  {t.detail && <span className="muted">{t.detail}</span>}
                </div>
                {t.changes.length > 0 && (
                  <ul>
                    {t.changes.map((c, i) => (
                      <li key={i} className={`diff-row ${c.mark}`}>
                        <Badge mark={c.mark} /> {c.title}{" "}
                        {c.detail && <span className="muted">{c.detail}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Topics, queues and entries match. Only details such as the selected topic or move history differ:
            see the JSON tab.
          </p>
        )}
      </div>
      <div className="modal-actions">
        <span />
        <button disabled={busy} onClick={close}>
          Cancel
        </button>
        <button disabled={busy} onClick={keepCloud} title="Replace this browser's data with the cloud copy">
          Keep cloud
        </button>
        <button className="primary" disabled={busy} onClick={keepLocal} title="Overwrite the cloud copy">
          Keep local
        </button>
      </div>
    </Modal>
  );
}

const Badge = ({ mark }: { mark: Mark }) => <span className={`badge ${mark}`}>{BADGES[mark]}</span>;
