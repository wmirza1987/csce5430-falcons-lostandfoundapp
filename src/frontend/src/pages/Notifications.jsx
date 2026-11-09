import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../config/api";
import { authHeaders, formatDateTime, readJson } from "../config/http";

// IF-UI-03 / FR-NOTIF-01: every notification explains what happened and links
// to the action it needs, such as a claim form, a claim review, or a thread.
function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadNotifications = async () => {
    try {
      const response = await fetch(apiUrl("/api/v1/notifications"), { headers: authHeaders() });
      const data = await readJson(response);

      if (!response.ok) {
        setMessage(data.message || "Unable to load notifications.");
        return;
      }

      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setMessage("");
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    }
  };

  const loadPreferences = async () => {
    try {
      const response = await fetch(apiUrl("/api/v1/auth/profile"), { headers: authHeaders() });
      const data = await readJson(response);

      if (response.ok) {
        setEmailNotifications(Boolean(data.user?.emailNotifications));
      }
    } catch (error) {
      // The feed stays usable if preferences fail to load.
    }
  };

  useEffect(() => {
    loadNotifications();
    loadPreferences();
  }, []);

  const markRead = async (notificationId) => {
    try {
      const response = await fetch(apiUrl(`/api/v1/notifications/${notificationId}/read`), {
        method: "PATCH",
        headers: authHeaders(),
      });

      if (response.ok) {
        setNotifications((current) =>
          current.map((item) => (item._id === notificationId ? { ...item, isRead: true } : item))
        );
        setUnreadCount((current) => Math.max(current - 1, 0));
      }
    } catch (error) {
      setMessage("Unable to update notification.");
    }
  };

  const markAllRead = async () => {
    setBusy(true);

    try {
      const response = await fetch(apiUrl("/api/v1/notifications/read-all"), {
        method: "PATCH",
        headers: authHeaders(),
      });

      if (response.ok) {
        setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      setMessage("Unable to update notifications.");
    } finally {
      setBusy(false);
    }
  };

  const toggleEmailNotifications = async () => {
    const nextValue = !emailNotifications;
    setBusy(true);

    try {
      const response = await fetch(apiUrl("/api/v1/auth/preferences"), {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotifications: nextValue }),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setMessage(data.message || "Unable to update preferences.");
        return;
      }

      setEmailNotifications(nextValue);
      setMessage(nextValue ? "Email notifications enabled." : "Email notifications disabled.");
    } catch (error) {
      setMessage("Unable to connect to the backend.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Notifications</h1>

      <p>
        <strong>Unread:</strong> {unreadCount}
      </p>

      <label className="checkbox-row">
        <input type="checkbox" checked={emailNotifications} onChange={toggleEmailNotifications} disabled={busy} />{" "}
        Also email me about matches, claims, messages, and resolutions
      </label>

      {unreadCount > 0 && (
        <p>
          <button type="button" onClick={markAllRead} disabled={busy}>
            Mark all as read
          </button>
        </p>
      )}

      <div role="status" aria-live="polite">
        {message && <p className="field-error">{message}</p>}
      </div>

      {notifications.length === 0 ? (
        <p>No notifications yet.</p>
      ) : (
        <ul className="plain-list">
          {notifications.map((notification) => (
            <li
              key={notification._id}
              className={`notification-card ${notification.isRead ? "is-read" : "is-unread"}`}
            >
              <p>
                <strong>{notification.isRead ? "" : "New: "}</strong>
                {notification.message}
              </p>
              <p className="hint">
                {notification.type} · {formatDateTime(notification.createdAt)}
              </p>

              {notification.actionPath && (
                <p>
                  <Link to={notification.actionPath}>Open</Link>
                </p>
              )}

              {!notification.isRead && (
                <button type="button" onClick={() => markRead(notification._id)}>
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Notifications;
