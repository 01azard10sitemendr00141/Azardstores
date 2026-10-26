import axios from "axios";

const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const apiBaseUrl = configuredApiUrl
  ? /\/api$/i.test(configuredApiUrl) ? configuredApiUrl : `${configuredApiUrl}/api`
  : "/api";

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

let sessionToken = null;
export function setSessionToken(token) {
  sessionToken = token || null;
}

api.interceptors.request.use((config) => {
  let token = sessionToken;
  // Cookies are the primary session mechanism. Keep the in-memory bearer
  // token only for the current tab so older API clients remain compatible
  // without persisting credentials in localStorage.
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
