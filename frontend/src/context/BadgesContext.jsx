import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client";

// Fetched once and shared app-wide, same pattern as SettingsContext — Badge
// chips render inside every product card across the site, so this avoids
// each one making its own request. If the fetch hasn't resolved yet (or
// fails), badgesBySlug is just empty and consumers fall back to showing
// the raw slug — never a crash, never a blocked render.
const BadgesContext = createContext({ badges: [], badgesBySlug: {}, loading: true });

export function BadgesProvider({ children }) {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/badges")
      .then((res) => setBadges(res.data || []))
      .catch(() => {}) // keep the empty list on failure — never block rendering on this
      .finally(() => setLoading(false));
  }, []);

  const badgesBySlug = Object.fromEntries(badges.map((b) => [b.slug, b]));

  return (
    <BadgesContext.Provider value={{ badges, badgesBySlug, loading }}>
      {children}
    </BadgesContext.Provider>
  );
}

export function useBadges() {
  return useContext(BadgesContext);
}
