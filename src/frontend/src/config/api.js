// Single source of truth for the backend's base URL. Falls back to the local
// dev server so nothing breaks before VITE_API_BASE_URL is set, but every
// deployed environment should set it. An empty string means same-origin
// (the API serves the built client), which is how the Azure App Service runs.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}
