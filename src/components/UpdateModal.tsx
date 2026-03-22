import { useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import "./UpdateModal.css";

interface UpdateModalProps {
  update: Update;
  onDismiss: () => void;
}

export function UpdateModal({ update, onDismiss }: UpdateModalProps) {
  const [status, setStatus] = useState<"idle" | "downloading" | "installing" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const handleUpdate = async () => {
    try {
      setStatus("downloading");

      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        } else if (event.event === "Finished") {
          setStatus("done");
          setProgress(100);
        }
      });

      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleRelaunch = async () => {
    await relaunch();
  };

  return (
    <div className="update-overlay" onClick={status === "idle" ? onDismiss : undefined}>
      <div className="update-modal" onClick={(e) => e.stopPropagation()}>
        <span className="update-badge">Update Available</span>
        <h2 className="update-title">A new version is ready</h2>
        <p className="update-version">
          Version <strong>{update.version}</strong>
        </p>

        {update.body && (
          <div className="update-notes">
            <p>{update.body}</p>
          </div>
        )}

        {errorMsg && (
          <div className="update-error">{errorMsg}</div>
        )}

        {(status === "downloading" || status === "installing") && (
          <div className="update-progress-container">
            <div className="update-progress-bar">
              <div className="update-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="update-progress-text">
              {status === "downloading" ? `Downloading… ${progress}%` : "Installing…"}
            </p>
          </div>
        )}

        <div className="update-actions">
          {status === "idle" && (
            <>
              <button className="update-btn-primary" onClick={handleUpdate}>
                Update Now
              </button>
              <button className="update-dismiss" onClick={onDismiss}>
                Remind me later
              </button>
            </>
          )}

          {(status === "downloading" || status === "installing") && (
            <button className="update-btn-primary" disabled>
              {status === "downloading" ? `Downloading… ${progress}%` : "Installing…"}
            </button>
          )}

          {status === "done" && (
            <>
              <button className="update-btn-primary" onClick={handleRelaunch}>
                Restart Now
              </button>
              <p className="update-relaunch-note">The update will apply when you restart the app.</p>
            </>
          )}

          {status === "error" && (
            <>
              <button className="update-btn-primary" onClick={handleUpdate}>
                Retry
              </button>
              <button className="update-dismiss" onClick={onDismiss}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
