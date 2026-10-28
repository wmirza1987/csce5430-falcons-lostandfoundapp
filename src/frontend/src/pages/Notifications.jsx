import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../config/api";

function Notifications() {
  const token = localStorage.getItem("token");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
  });

  const loadNotifications = async () => {
    try {
      const response = await fetch(apiUrl("/api/v1/notifications"), {
        headers: authHeaders(),
      });
      const data = await response.json();

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
      const response = await fetch(apiUrl("/api/v1/auth/profile"), {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (response.ok) {
        setEmailNotifications(Boolean(data.user?.emailNotifications));
      }
    } catch (error) {
      // The notification list remains usable if preferences fail to load.
    }
  };

  useEffect(() => {
    loadNotifications();
    loadPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = async (notificationId) => {
    try {
      const response = await fetch(
        apiUrl(`/api/v1/notifications/${notificationId}/read`),
        {
          method: "PATCH",
          headers: authHeaders(),
        }
      );

      if (response.ok) {
        setNotifications((current) =>
          current.map((notification) =>
            notification._id === notificationId
              ? { ...notification, isRead: true }
              : notification
          )
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
        setNotifications((current) =>
          current.map((notification) => ({ ...notification, isRead: true }))
        );
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
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ emailNotifications: nextValue }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Unable to update preferences.");
        return;
      }

      setEmailNotifications(nextValue);
      setMessage(
        nextValue
          ? "Email notifications enabled."
          : "Email notifications disabled."
      );
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
        <input
          type="checkbox"
          checked={emailNotifications}
          onChange={toggleEmailNotifications}
          disabled={busy}
        />{" "}
        Email me about matches, claims, and resolutions
      </label>

      {unreadCount > 0 && (
        <p>
          <button type="button" onClick={markAllRead} disabled={busy}>
            Mark all as read
          </button>
        </p>
      )}

      {message && <p role="alert" className="field-error">{message}</p>}

      {notifications.length === 0 ? (
        <p>No notifications yet.</p>
      ) : (
        notifications.map((notification) => (
          <div
            key={notification._id}
            className={`notification-card ${notification.isRead ? "is-read" : "is-unread"}`}
          >
            <p>
              <strong>{notification.message}</strong>
            </p>
            <p className="hint">
              {notification.type} ·{" "}
              {new Date(notification.createdAt).toLocaleString()}
            </p>

            {notification.listing && (
              <p>
                <Link to={`/listings/${notification.listing._id}`}>
                  View {notification.listing.title}
                </Link>
              </p>
            )}

            {!notification.isRead && (
              <button type="button" onClick={() => markRead(notification._id)}>
                Mark read
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default Notifications;
