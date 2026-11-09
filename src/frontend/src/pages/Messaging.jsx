import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiUrl } from "../config/api";
import { authHeaders, formatDateTime, readJson, readStoredUser } from "../config/http";

const MAX_MESSAGE = 1000;

// IF-UI-06 / FR-COM-01 / FR-COM-02: a one-to-one thread for one approved claim.
// Participants are shown by role ("Finder", "Claimant"), never by email or ID.
function Messaging() {
  const { claimId } = useParams();
  const currentUser = readStoredUser();
  const isModerator = ["moderator", "admin"].includes(currentUser?.role);

  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  const loadMessages = useCallback(
    async (pageNumber = 1) => {
      try {
        const response = await fetch(apiUrl(`/api/v1/claims/${claimId}/messages?page=${pageNumber}`), {
          headers: authHeaders(),
        });
        const data = await readJson(response);

        if (!response.ok) {
          setError(data.message || "Unable to open this conversation.");
          return;
        }

        setThread(data.thread);
        setMessages(data.messages);
        setPage(data.page);
        setTotalPages(data.totalPages || 1);
        setError("");
      } catch (err) {
        setError("Unable to connect to the backend.");
      }
    },
    [claimId]
  );

  useEffect(() => {
    loadMessages(1);
  }, [loadMessages]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async (event) => {
    event.preventDefault();
    setNotice("");

    const body = draft.trim();

    if (!body) {
      setError("Message text is required.");
      return;
    }

    if (body.length > MAX_MESSAGE) {
      setError("Messages must be 1000 characters or fewer.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(apiUrl(`/api/v1/claims/${claimId}/messages`), {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setError(data.message || "Message not sent. Your text is still here.");
        return;
      }

      setDraft("");

      if (data.warning) {
        setNotice(data.warning);
      }

      await loadMessages(1);
    } catch (err) {
      setError("Message not sent. Your text is still here; check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleFlag = async (messageId) => {
    const reason = window.prompt("Reason for flagging this message (kept private to moderators):");

    if (!reason || !reason.trim()) {
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/v1/messages/${messageId}/flag`), {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setError(data.message || "Unable to flag this message.");
        return;
      }

      setNotice("Message flagged for review.");
      await loadMessages(page);
    } catch (err) {
      setError("Unable to connect to the backend.");
    }
  };

  if (error && !thread) {
    return (
      <div>
        <h1>Messages</h1>
        <p role="alert" className="field-error">{error}</p>
        <p>
          <Link to="/messages">Back to messages</Link>
        </p>
      </div>
    );
  }

  if (!thread) {
    return <p>Loading conversation...</p>;
  }

  const canWrite = thread.yourRole === "Finder" || thread.yourRole === "Claimant";

  return (
    <div className="messaging-page">
      <p>
        <Link to="/messages">All message threads</Link>
      </p>
      <h1>{thread.listingTitle}</h1>
      <p className="hint">
        You are the <strong>{thread.yourRole}</strong>. Contact details are not shown here; arrange the handoff inside the app.
      </p>

      <div role="status" aria-live="polite" className="sr-only">
        {notice}
      </div>
      {notice && <p className="notice">{notice}</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}

      {totalPages > 1 && (
        <nav aria-label="Message pages" className="pagination">
          <button type="button" onClick={() => loadMessages(page + 1)} disabled={page >= totalPages}>
            Older messages
          </button>{" "}
          <button type="button" onClick={() => loadMessages(page - 1)} disabled={page <= 1}>
            Newer messages
          </button>
        </nav>
      )}

      <ol className="message-list" ref={listRef} aria-label="Conversation">
        {messages.length === 0 && <li className="hint">No messages yet.</li>}
        {messages.map((message) => (
          <li
            key={message.id}
            className={`message-bubble ${message.isOwn ? "is-own" : ""} ${message.kind === "system" ? "is-system" : ""}`}
          >
            <p className="message-meta">
              <strong>{message.isOwn ? "You" : message.senderRole}</strong>{" "}
              <span className="hint">{formatDateTime(message.createdAt)}</span>
              {message.flagged && <span className="status-badge status-rejected"> Flagged</span>}
            </p>
            <p className="message-body">{message.body}</p>
            {message.containsContactDetails && (
              <p className="hint">This message included contact details.</p>
            )}
            {isModerator && message.kind === "user" && !message.flagged && (
              <button type="button" onClick={() => handleFlag(message.id)}>
                Flag for review
              </button>
            )}
          </li>
        ))}
      </ol>

      {canWrite ? (
        <form onSubmit={handleSend} className="stack-form" aria-labelledby="compose-heading">
          <h2 id="compose-heading">Send a message</h2>
          <div className="form-field">
            <label htmlFor="message-body">Message</label>
            <textarea
              id="message-body"
              rows={3}
              maxLength={MAX_MESSAGE}
              value={draft}
              aria-describedby="message-count"
              onChange={(event) => setDraft(event.target.value)}
            />
            <p id="message-count" className="hint">
              {draft.length} of {MAX_MESSAGE} characters
            </p>
          </div>
          <button type="submit" disabled={busy}>
            {busy ? "Sending..." : "Send"}
          </button>
        </form>
      ) : (
        <p className="hint">Moderators can read this conversation but cannot post in it.</p>
      )}
    </div>
  );
}

export default Messaging;
