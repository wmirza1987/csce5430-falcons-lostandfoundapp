// Single source of truth for the backend's base URL. Falls back to the local
// dev server so nothing breaks before VITE_API_BASE_URL is set, but every
// deployed environment should set it (Render/Vercel per the Deliverable 1
// free tier plan), rather than relying on this fallback.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}
