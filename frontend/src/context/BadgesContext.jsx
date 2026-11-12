import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client";

// Fetched once and shared app-wide, same pattern as SettingsContext. Product
// cards can still render from raw slugs while the managed badge list loads.
const BadgesContext = createContext({ badges: [], badgesBySlug: {}, loading: true, error: "", retry: () => {} });

export function BadgesProvider({ children }) {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    api.get("/badges")
      .then((res) => setBadges(res.data || []))
      .catch(() => setError("Could not load badges. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [retryCount]);

  const badgesBySlug = Object.fromEntries(badges.map((b) => [b.slug, b]));
  const retry = () => setRetryCount((count) => count + 1);

  return (
    <BadgesContext.Provider value={{ badges, badgesBySlug, loading, error, retry }}>
      {children}
    </BadgesContext.Provider>
  );
}

export function useBadges() {
  return useContext(BadgesContext);
}
