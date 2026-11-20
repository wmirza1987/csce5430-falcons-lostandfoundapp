import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../config/api";
import { authHeaders, formatDateTime, readJson, readStoredUser } from "../config/http";

// FR-ADM-02 / FR-ADM-03: administrator dashboard for aggregate analytics,
// moderator accounts, the category catalog, and non-content audit records.
// Private evidence and message bodies are never requested by these views.
function AdminDashboard() {
  const currentUser = readStoredUser();
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(apiUrl(path), {
      ...options,
      headers: { ...authHeaders(), "Content-Type": "application/json", ...options.headers },
    });
    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }

    return data;
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [analyticsData, usersData, categoriesData, auditData] = await Promise.all([
        request("/api/v1/admin/analytics"),
        request("/api/v1/admin/users"),
        request("/api/v1/admin/categories?includeInactive=true"),
        request("/api/v1/admin/audit?limit=50"),
      ]);

      setAnalytics(analyticsData.analytics);
      setUsers(usersData.users || []);
      setCategories(categoriesData.categories || []);
      setAuditLogs(auditData.auditLogs || []);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load the dashboard.");
    }
  }, [request]);

  useEffect(() => {
    if (currentUser?.role === "admin") loadAll();
  }, [currentUser?.role, loadAll]);

  const changeRole = async (userId, role) => {
    try {
      await request(`/api/v1/admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setNotice("Role updated and recorded in the audit log.");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleActive = async (user) => {
    try {
      await request(`/api/v1/admin/users/${user.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      setNotice("Account updated.");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const addCategory = async (event) => {
    event.preventDefault();

    if (newCategory.trim().length < 2) {
      setError("Enter a category name of at least 2 characters.");
      return;
    }

    try {
      await request("/api/v1/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCategory.trim() }),
      });
      setNewCategory("");
      setNotice("Category added.");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleCategory = async (category) => {
    try {
      await request(`/api/v1/admin/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !category.isActive }),
      });
      setNotice("Category updated.");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <h1>Administration</h1>
        <p role="alert" className="field-error">You do not have permission to view this page.</p>
        <p><Link to="/listings">Back to listings</Link></p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Administration</h1>
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p role="alert" className="field-error">{error}</p>}

      <section aria-labelledby="analytics-heading">
        <h2 id="analytics-heading">Aggregate analytics</h2>
        {!analytics ? (
          <p>Loading analytics...</p>
        ) : (
          <>
            <ul className="plain-list">
              <li>Total listings: {analytics.listings.total}</li>
              <li>Active: {analytics.listings.active} · Resolved: {analytics.listings.resolved}</li>
              <li>Resolution rate: {analytics.listings.resolutionRate}%</li>
              <li>Average resolution time: {analytics.listings.averageResolutionDays} days</li>
              <li>Lost: {analytics.byType.lost} · Found: {analytics.byType.found}</li>
              <li>Open reports: {analytics.reports.open} · Reviewing: {analytics.reports.reviewing}</li>
            </ul>

            <h3>Common categories</h3>
            <ul className="plain-list">
              {analytics.commonCategories.map((item) => (
                <li key={item.name}>{item.name}: {item.count}</li>
              ))}
            </ul>

            <h3>Campus hotspots</h3>
            <ul className="plain-list">
              {analytics.hotspots.map((item) => (
                <li key={item.name}>{item.name}{item.zone ? ` (${item.zone})` : ""}: {item.count}</li>
              ))}
            </ul>
            <p className="hint">
              Figures are aggregates. Private claim evidence and message contents are never displayed here.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="users-heading">
        <h2 id="users-heading">Moderator accounts</h2>
        <p className="hint">The administrator role cannot be granted or removed here.</p>
        <ul className="plain-list">
          {users.map((user) => (
            <li key={user.id} className="admin-row">
              <span>
                {user.firstName} {user.lastName} — {user.role} {!user.isActive && "(inactive)"}
              </span>
              <span className="action-row">
                <label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.firstName} {user.lastName}</label>
                <select
                  id={`role-${user.id}`}
                  value={user.role}
                  disabled={user.role === "admin"}
                  onChange={(event) => changeRole(user.id, event.target.value)}
                >
                  <option value="user">User</option>
                  <option value="moderator">Moderator</option>
                  {user.role === "admin" && <option value="admin">Administrator</option>}
                </select>
                {user.role !== "admin" && (
                  <button type="button" onClick={() => toggleActive(user)}>
                    {user.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="categories-heading">
        <h2 id="categories-heading">Item categories</h2>
        <form onSubmit={addCategory} className="stack-form">
          <div className="form-field">
            <label htmlFor="new-category">New category name</label>
            <input
              id="new-category"
              type="text"
              value={newCategory}
              maxLength={60}
              onChange={(event) => setNewCategory(event.target.value)}
            />
          </div>
          <button type="submit">Add category</button>
        </form>
        <ul className="plain-list">
          {categories.map((category) => (
            <li key={category.id} className="admin-row">
              <span>{category.name} {!category.isActive && "(inactive)"}</span>
              <button type="button" onClick={() => toggleCategory(category)}>
                {category.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="audit-heading">
        <h2 id="audit-heading">Audit log</h2>
        <p className="hint">Records contain action names, IDs, and short reasons only — never message text or evidence.</p>
        {auditLogs.length === 0 ? (
          <p>No audit records yet.</p>
        ) : (
          <ul className="plain-list">
            {auditLogs.map((log) => (
              <li key={log.id}>
                <strong>{log.action}</strong> on {log.targetType} {log.detail ? `— ${log.detail}` : ""}
                <span className="hint"> · {formatDateTime(log.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p><Link to="/moderation">Open moderation queue</Link></p>
    </div>
  );
}

export default AdminDashboard;
