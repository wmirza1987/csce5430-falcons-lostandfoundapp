import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../config/api";
import { authHeaders, formatDateTime, readJson } from "../config/http";

function MessageThreads() {
  const [threads, setThreads] = useState([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(apiUrl("/api/v1/messages/threads"), { headers: authHeaders() });
        const data = await readJson(response);

        if (!response.ok) {
          setError(data.message || "Unable to load message threads.");
        } else {
          setThreads(data.threads || []);
        }
      } catch (err) {
        setError("Unable to connect to the backend.");
      } finally {
        setLoaded(true);
      }
    };

    load();
  }, []);

  return (
    <div>
      <h1>Messages</h1>
      <p className="hint">Threads open after a claim is approved.</p>

      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}

      {loaded && threads.length === 0 && !error && <p>No message threads yet.</p>}

      <ul className="plain-list">
        {threads.map((thread) => (
          <li key={thread.claimId} className="notification-card">
            <Link to={`/messages/${thread.claimId}`}>{thread.listingTitle}</Link>
            <p className="hint">
              You are the {thread.yourRole} · updated {formatDateTime(thread.updatedAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MessageThreads;
