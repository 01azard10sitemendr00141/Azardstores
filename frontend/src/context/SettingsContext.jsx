import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client";

// Fetched once and shared app-wide, same pattern as AuthContext/CartContext.
// Defaults here match what was previously hardcoded across the site, so if
// the fetch hasn't resolved yet (or ever fails), nothing breaks or flashes
// empty — it just behaves exactly as it did before this existed.
const DEFAULT_SETTINGS = {
  whatsappNumber: "254140122685",
  contactEmail: "hello@azardstores.co.ke",
  deliveryFee: 0,
  freeDeliveryThreshold: 0,
  deliveryCounties: ["Nairobi"],
  deliveryTowns: [{ county: "Nairobi", town: "Nairobi CBD" }],
  deliveryRoutes: [],
  maintenanceMode: false,
  paymentMethods: { mpesa: false, paystack: false },
  emailDeliveryConfigured: false,
};

const SettingsContext = createContext({ settings: DEFAULT_SETTINGS, loading: true });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function updateSettings(nextSettings) {
    setSettings((prev) => ({ ...prev, ...nextSettings }));
  }

  async function refreshSettings() {
    setError("");
    try {
      const res = await api.get("/settings", { timeout: 10_000 });
      updateSettings(res.data);
      return res.data;
    } catch (requestError) {
      setError("Store settings could not be loaded. Delivery and payment options may be unavailable.");
      throw requestError;
    }
  }

  useEffect(() => {
    refreshSettings()
      .catch(() => {}) // keep defaults on failure — never block rendering on this
      .finally(() => setLoading(false));
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, error, refreshSettings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
