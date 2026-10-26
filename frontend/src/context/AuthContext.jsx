import { createContext, useContext, useState, useEffect, useRef } from "react";
import api, { setSessionToken } from "../api/client";
import { clearWishlist, getWishlist, replaceWishlist, subscribeToWishlist } from "../utils/wishlist";

const AuthContext = createContext(null);
const WISHLIST_MIGRATION_PREFIX = "azard_wishlist_migrated_";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [wishlistSlugs, setWishlistSlugs] = useState([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [wishlistError, setWishlistError] = useState("");
  const wishlistQueue = useRef(Promise.resolve());
  const desiredWishlist = useRef([]);
  const serverWishlist = useRef([]);
  const pendingWishlistImport = useRef(null);
  const suppressWishlistSync = useRef(false);
  const activeWishlistUserId = useRef(null);
  const wishlistNeedsSync = useRef(false);

  function sameWishlist(a, b) {
    return a.length === b.length && a.every((slug, index) => slug === b[index]);
  }

  async function loadAccountWishlist() {
    if (!user) return;
    const ownerId = String(user._id || user.id);
    setWishlistLoading(true);
    setWishlistError("");
    try {
      const response = await api.get("/auth/wishlist");
      if (activeWishlistUserId.current !== ownerId) return;
      const saved = Array.isArray(response.data.slugs) ? response.data.slugs : [];
      let importedSlugs = [];
      let merged = saved;
      const pendingImport = pendingWishlistImport.current;
      if (pendingImport?.userId === String(user._id || user.id)) {
        importedSlugs = pendingImport.slugs;
      } else {
        // One-time upgrade migration for customers who were already signed in
        // when wishlists were browser-only. The marker is per account so a
        // later login on the same browser cannot re-import another account's
        // old local list.
        let alreadyMigrated = false;
        try { alreadyMigrated = localStorage.getItem(`${WISHLIST_MIGRATION_PREFIX}${ownerId}`) === "1"; } catch { /* account API remains usable without browser storage */ }
        if (!alreadyMigrated) importedSlugs = getWishlist();
      }
      merged = [...new Set([...saved, ...importedSlugs])];
      if (!sameWishlist(merged, saved)) {
        if (activeWishlistUserId.current !== ownerId) return;
        const persisted = await api.put("/auth/wishlist", { slugs: merged });
        merged = persisted.data.slugs || merged;
      }
      if (activeWishlistUserId.current !== ownerId) return;
      if (pendingImport?.userId === String(user._id || user.id)) pendingWishlistImport.current = null;
      try { localStorage.setItem(`${WISHLIST_MIGRATION_PREFIX}${ownerId}`, "1"); } catch { /* server remains the source of truth */ }
      desiredWishlist.current = merged;
      serverWishlist.current = merged;
      wishlistNeedsSync.current = false;
      setWishlistSlugs(merged);
      replaceWishlist(merged);
    } catch {
      if (activeWishlistUserId.current === ownerId) setWishlistError("Wishlist sync is temporarily unavailable. Your saved items remain on this device.");
    } finally {
      if (activeWishlistUserId.current === ownerId) setWishlistLoading(false);
    }
  }

  function queueWishlistSave(slugs) {
    const ownerId = activeWishlistUserId.current;
    const next = [...new Set(slugs)];
    desiredWishlist.current = next;
    wishlistNeedsSync.current = true;
    setWishlistSlugs(next);
    setWishlistError("");
    wishlistQueue.current = wishlistQueue.current.catch(() => {}).then(async () => {
      if (!ownerId || activeWishlistUserId.current !== ownerId) return;
      if (sameWishlist(next, serverWishlist.current)) {
        wishlistNeedsSync.current = false;
        return;
      }
      try {
        const response = await api.put("/auth/wishlist", { slugs: desiredWishlist.current });
        if (activeWishlistUserId.current !== ownerId) return;
        const saved = response.data.slugs || desiredWishlist.current;
        serverWishlist.current = saved;
        wishlistNeedsSync.current = false;
        setWishlistSlugs(saved);
      } catch {
        setWishlistError("Wishlist changes could not sync. They are saved on this device; retry after reconnecting.");
      }
    });
  }

  useEffect(() => {
    if (user) loadAccountWishlist();
    else {
      activeWishlistUserId.current = null;
      setWishlistSlugs([]);
      setWishlistError("");
    }
  }, [user?._id || user?.id]);

  useEffect(() => subscribeToWishlist((slugs) => {
    if (!user || suppressWishlistSync.current) return;
    if (sameWishlist(slugs, serverWishlist.current)) return;
    queueWishlistSave(slugs);
  }), [user?._id || user?.id]);

  function clearLocalWishlistWithoutSync() {
    suppressWishlistSync.current = true;
    clearWishlist();
    suppressWishlistSync.current = false;
  }

  async function retryAccountWishlist() {
    if (!user) return;
    const ownerId = String(user._id || user.id);
    if (!wishlistNeedsSync.current) return loadAccountWishlist();
    setWishlistLoading(true);
    try {
      const response = await api.get("/auth/wishlist");
      if (activeWishlistUserId.current !== ownerId) return;
      const latestServer = response.data.slugs || [];
      const base = serverWishlist.current;
      const desired = desiredWishlist.current;
      const removed = new Set(base.filter((slug) => !desired.includes(slug)));
      const added = desired.filter((slug) => !base.includes(slug));
      const merged = [...new Set([...latestServer.filter((slug) => !removed.has(slug)), ...added])];
      const saved = sameWishlist(merged, latestServer)
        ? latestServer
        : (await api.put("/auth/wishlist", { slugs: merged })).data.slugs || merged;
      if (activeWishlistUserId.current !== ownerId) return;
      desiredWishlist.current = saved;
      serverWishlist.current = saved;
      wishlistNeedsSync.current = false;
      setWishlistSlugs(saved);
      setWishlistError("");
      replaceWishlist(saved);
    } catch {
      if (activeWishlistUserId.current === ownerId) setWishlistError("Wishlist changes could not sync. They are saved on this device; retry after reconnecting.");
    } finally {
      if (activeWishlistUserId.current === ownerId) setWishlistLoading(false);
    }
  }

  async function loadCurrentUser({ showLoading = true, reportTransientError = true } = {}) {
    if (showLoading) setLoading(true);
    if (reportTransientError) setAuthError("");
    try {
      const res = await api.get("/auth/me");
      activeWishlistUserId.current = String(res.data.user._id || res.data.user.id);
      setUser(res.data.user);
      return res.data.user;
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        activeWishlistUserId.current = null;
        wishlistNeedsSync.current = false;
        setSessionToken(null);
        setUser(null);
        clearLocalWishlistWithoutSync();
      } else {
        // Keep the token on network/server failures so a temporary outage does
        // not silently sign the customer out.
        if (reportTransientError) setAuthError("We couldn't confirm your session. Check your connection and try again.");
      }
      throw error;
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    // The API session is an HttpOnly cookie. The browser sends it
    // automatically, so no credential needs to be persisted in JavaScript.
    loadCurrentUser().catch(() => {});
  }, []);

  async function login(email, password) {
    const guestWishlist = user ? [] : getWishlist();
    const res = await api.post("/auth/login", { email, password });
    if (user) clearLocalWishlistWithoutSync();
    setSessionToken(res.data.token);
    activeWishlistUserId.current = String(res.data.user._id || res.data.user.id);
    setUser(res.data.user);
    pendingWishlistImport.current = { userId: activeWishlistUserId.current, slugs: guestWishlist };
    setAuthError("");
    return res.data.user;
  }

  async function signup(name, email, password, phone, claimOrderId) {
    const guestWishlist = user ? [] : getWishlist();
    const res = await api.post("/auth/signup", { name, email, password, phone, claimOrderId });
    if (user) clearLocalWishlistWithoutSync();
    setSessionToken(res.data.token);
    activeWishlistUserId.current = String(res.data.user._id || res.data.user.id);
    setUser(res.data.user);
    pendingWishlistImport.current = { userId: activeWishlistUserId.current, slugs: guestWishlist };
    setAuthError("");
    return res.data.user;
  }

  function logout() {
    api.post("/auth/logout").catch(() => {});
    activeWishlistUserId.current = null;
    wishlistNeedsSync.current = false;
    setSessionToken(null);
    setUser(null);
    pendingWishlistImport.current = null;
    clearLocalWishlistWithoutSync();
    setAuthError("");
  }

  function updateSessionToken(token) {
    if (typeof token !== "string" || !token) return;
    setSessionToken(token);
  }

  function updateCurrentUser(updatedUser) {
    if (updatedUser && typeof updatedUser === "object") setUser(updatedUser);
  }

  // Re-fetches the current user — used after verifying email/phone so the
  // local state (isEmailVerified/isPhoneVerified) reflects the change
  // without needing a full logout/login.
  async function refreshUser() {
    return loadCurrentUser({ showLoading: false, reportTransientError: false });
  }

  return (
    <AuthContext.Provider value={{ user, loading, authError, retryAuth: loadCurrentUser, login, signup, logout, refreshUser, updateCurrentUser, updateSessionToken, wishlistSlugs, wishlistLoading, wishlistError, retryWishlist: retryAccountWishlist }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
