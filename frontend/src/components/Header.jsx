import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { Search, ShoppingBag, User, LogOut, Package, LayoutDashboard, Heart, Settings } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { totalItems } = useCart();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const panelRef = useRef(null);

  // Close the profile panel whenever the route changes, or on outside click
  useEffect(() => setProfileOpen(false), [location.pathname]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLogout() {
    logout();
    setProfileOpen(false);
    navigate("/");
  }

  return (
    <header ref={panelRef} className="sticky top-0 z-50 bg-mall-900 backdrop-blur-md border-b border-cream/10 text-cream">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
        {/* Logo - compact mark + wordmark, wordmark hides on small screens */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src="/pics/azard-stores-logo.webp" alt="Azard Stores" width="256" height="171" fetchPriority="high" decoding="async" className="w-16 h-16 object-contain rounded-lg" />
        </Link>

        {/* Browse - looks like search, is actually just a link to the Directory */}
        <Link
          to="/directory"
          className="flex-1 max-w-md flex items-center gap-2 px-4 py-2 rounded-full bg-mall-800 text-cream/50 text-sm hover:bg-mall-700 hover:text-cream/70 transition"
        >
          <Search size={16} className="shrink-0" aria-hidden="true" />
          <span>Explore the mall</span>
        </Link>

        <div className="flex items-center gap-3 ml-auto">
          {/* Profile - single icon, inline-extending panel below, not a floating card */}
          <div className="relative">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              aria-expanded={profileOpen}
              aria-controls="account-menu-panel"
              aria-label="Account menu"
              className={`relative w-9 h-9 rounded-full flex items-center justify-center transition ${
                profileOpen ? "bg-mall-accent text-mall-900" : "bg-mall-800 text-cream hover:bg-mall-700"
              }`}
            >
              <User size={18} />
              {user?.role === "admin" && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-mall-accent ring-2 ring-mall-900"
                />
              )}
            </button>
          </div>

          {/* Cart */}
          <Link
            to="/cart"
            aria-label={`Cart, ${totalItems} item${totalItems === 1 ? "" : "s"}`}
            className="relative w-9 h-9 rounded-full bg-mall-800 text-cream hover:bg-mall-700 transition flex items-center justify-center"
          >
            <ShoppingBag size={18} />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-mall-accent text-mall-900 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Profile panel - extends the header itself, no shadow, no floating card */}
      <div
        id="account-menu-panel"
        className={`overflow-hidden transition-[max-height] duration-300 ease-in-out border-t border-mall-700/0 ${
          profileOpen ? "max-h-80 border-mall-700/60" : "max-h-0"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 py-5">
          {user ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="font-display text-xl">Hi, {user.name?.split(" ")[0] || "there"}</p>
                <p className="text-cream/50 text-sm">{user.email}</p>
              </div>
              <nav className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                {user.role === "admin" && (
                  <Link
                    to="/admin"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-mall-800 transition"
                  >
                    <LayoutDashboard size={16} /> Admin Dashboard
                  </Link>
                )}
                <Link
                  to="/dashboard"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-mall-800 transition"
                >
                  <Package size={16} /> My Orders
                </Link>
                {user.role !== "admin" && (
                  <>
                    <Link
                      to="/wishlist"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-mall-800 transition"
                    >
                      <Heart size={16} /> Wishlist
                    </Link>
                    <Link
                      to="/account"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-mall-800 transition"
                    >
                      <Settings size={16} /> Account Settings
                    </Link>
                  </>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-cream/70 hover:bg-mall-800 hover:text-cream transition"
                >
                  <LogOut size={16} /> Log out
                </button>
              </nav>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-cream/70 text-sm">Log in to track orders, or create an account to get started.</p>
              <div className="flex gap-2">
                <Link
                  to="/login"
                  onClick={() => setProfileOpen(false)}
                  className="px-4 py-2 rounded-md text-sm font-medium border border-cream/20 hover:border-cream/40 transition"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setProfileOpen(false)}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-mall-accent text-mall-900 hover:bg-mall-accentDark transition"
                >
                  Sign up
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
