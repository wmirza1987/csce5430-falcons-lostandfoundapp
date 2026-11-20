import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../config/api";
import { authHeaders, formatDateTime, readJson, readStoredUser } from "../config/http";

const MIN_NOTE_LENGTH = 5;

// FR-ADM-01: moderators and administrators review reported listings and
// messages. Hide/restore decisions record a short reason; the API writes a
// non-content audit event for each action.
function Moderation() {
  const currentUser = readStoredUser();
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState(null);

  const loadReports = async () => {
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const response = await fetch(apiUrl(`/api/v1/reports${query}`), { headers: authHeaders() });
      const data = await readJson(response);

      if (!response.ok) {
        setError(data.message || "Unable to load the moderation queue.");
        return;
      }

      setReports(data.reports || []);
      setError("");
    } catch (err) {
      setError("Unable to connect to the backend.");
    }
  };

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const decide = async (reportId, decision) => {
    const note = String(notes[reportId] || "").trim();

    if ((decision === "hide" || decision === "restore") && note.length < MIN_NOTE_LENGTH) {
      setError(`Record a reason of at least ${MIN_NOTE_LENGTH} characters before hiding or restoring.`);
      return;
    }

    setBusyId(reportId);
    setError("");
    setNotice("");

    try {
      const response = await fetch(apiUrl(`/api/v1/reports/${reportId}/decision`), {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ decision, decisionNote: note }),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setError(data.message || "Unable to record this decision.");
        return;
      }

      setNotice(`Report ${decision === "dismiss" ? "dismissed" : decision + "d"}.`);
      setNotes((current) => ({ ...current, [reportId]: "" }));
      await loadReports();
    } catch (err) {
      setError("Unable to connect to the backend.");
    } finally {
      setBusyId(null);
    }
  };

  if (!["moderator", "admin"].includes(currentUser?.role)) {
    return (
      <div>
        <h1>Moderation</h1>
        <p role="alert" className="field-error">You do not have permission to review reports.</p>
        <p><Link to="/listings">Back to listings</Link></p>
      </div>
    );
  }

  return (
    <div className="moderation-page">
      <h1>Moderation queue</h1>
      <p className="hint">
        Reasons are recorded for the audit log. Report text and message contents are never written to audit records.
      </p>

      <div className="form-field">
        <label htmlFor="report-status">Status</label>
        <select id="report-status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All open and resolved</option>
          <option value="open">Open</option>
          <option value="reviewing">Reviewing</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p role="alert" className="field-error">{error}</p>}

      {reports.length === 0 ? (
        <p>No reports match this filter.</p>
      ) : (
        <ul className="plain-list">
          {reports.map((report) => (
            <li key={report.id} className="moderation-card">
              <h2>{report.targetType === "listing" ? "Listing report" : "Message report"}</h2>
              <p>
                <span className={`status-badge status-${report.status}`}>{report.status}</span>{" "}
                <span className="hint">Submitted {formatDateTime(report.createdAt)}</span>
              </p>
              <p>{report.reason}</p>
              <p className="hint">
                Target: {report.targetType} {String(report.targetId).slice(-6)}
                {report.claim && (
                  <>
                    {" · "}
                    <Link to={`/messages/${report.claim}`}>Open conversation</Link>
                  </>
                )}
              </p>

              {report.status !== "resolved" && (
                <div className="stack-form">
                  <div className="form-field">
                    <label htmlFor={`note-${report.id}`}>Decision reason (kept in the audit log)</label>
                    <textarea
                      id={`note-${report.id}`}
                      rows={2}
                      maxLength={500}
                      value={notes[report.id] || ""}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [report.id]: event.target.value }))
                      }
                    />
                  </div>
                  <div className="action-row">
                    <button type="button" disabled={busyId === report.id} onClick={() => decide(report.id, "hide")}>
                      Hide content
                    </button>
                    <button type="button" disabled={busyId === report.id} onClick={() => decide(report.id, "restore")}>
                      Restore content
                    </button>
                    <button type="button" disabled={busyId === report.id} onClick={() => decide(report.id, "dismiss")}>
                      Dismiss report
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Moderation;
