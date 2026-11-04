import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, Layers, Store, Package, ShoppingBag, LogOut, Tag, Award, Users, Settings, BarChart3, Sparkles, Home, Menu, X, Truck, ClipboardList, ArrowRightLeft,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const NAV_GROUPS = [
  { label: "Workspace", links: [
    { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  ] },
  { label: "Storefront", links: [
    { to: "/admin/homepage", label: "Homepage Studio", icon: Home },
    { to: "/admin/floors", label: "Floors", icon: Layers },
    { to: "/admin/shops", label: "Shops", icon: Store },
    { to: "/admin/categories", label: "Categories", icon: Tag },
    { to: "/admin/brands", label: "Brands", icon: Award },
    { to: "/admin/badges", label: "Badges", icon: Sparkles },
  ] },
  { label: "Operations", links: [
    { to: "/admin/products", label: "Products", icon: Package },
    { to: "/admin/stock-operations", label: "Stock Operations", icon: ArrowRightLeft },
    { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
    { to: "/admin/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
    { to: "/admin/delivery", label: "Delivery", icon: Truck },
    { to: "/admin/customers", label: "Customers", icon: Users },
  ] },
  { label: "Configuration", links: [
    { to: "/admin/settings", label: "Settings", icon: Settings },
  ] },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileMenuButtonRef = useRef(null);
  const firstMobileLinkRef = useRef(null);
  const isHomepageArea = ["/admin/homepage", "/admin/home-sections", "/admin/hero", "/admin/home-content"]
    .some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    firstMobileLinkRef.current?.focus();
    function handleMenuKeyDown(event) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        mobileMenuButtonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleMenuKeyDown);
    return () => window.removeEventListener("keydown", handleMenuKeyDown);
  }, [mobileNavOpen]);

  function handleLogout() {
    logout();
    navigate("/");
  }

  function closeMobileNavigation() {
    setMobileNavOpen(false);
    mobileMenuButtonRef.current?.focus();
  }

  return (
    <div className="min-h-screen bg-mall-900 flex">

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-cream/8 px-3 py-6 md:flex">
        {/* Brand */}
        <div className="px-3 mb-8">
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">Admin Panel</p>
          <p className="font-display text-cream text-base leading-tight">Azard Stores</p>
        </div>

        {/* Nav */}
        <nav aria-label="Admin navigation" className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-3 font-mono-tag text-[9px] uppercase tracking-widest text-cream/25">{group.label}</p>
              <div className="space-y-0.5">
                {group.links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={link.end}
                      aria-label={link.to === "/admin/homepage" && isHomepageArea ? "Homepage Studio, current section" : undefined}
                      aria-current={link.to === "/admin/homepage" && isHomepageArea ? "page" : undefined}
                      className={({ isActive }) => {
                        const current = isActive || (link.to === "/admin/homepage" && isHomepageArea);
                        return `flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm transition ${
                          current
                            ? "border-mall-accent bg-mall-accent/10 text-mall-accent"
                            : "border-transparent text-cream/50 hover:bg-cream/5 hover:text-cream"
                        }`;
                      }}
                    >
                      <Icon size={15} className="shrink-0" />
                      {link.label}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User + logout */}
        <div className="border-t border-cream/8 pt-4 px-3">
          <p className="text-cream/50 text-xs mb-0.5 truncate">{user?.name}</p>
          <p className="text-cream/25 text-[10px] truncate mb-3">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-red-400 hover:text-red-300 transition text-xs"
          >
            <LogOut size={12} /> Log out
          </button>
        </div>
      </aside>

      {/* ── Mobile top nav ────────────────────────────────────────── */}
      <div className="md:hidden fixed inset-x-0 top-0 z-50 border-b border-cream/8 bg-mall-900 px-4 py-3">
        <div className="flex items-center justify-between">
        <div>
          <p className="font-mono-tag text-[9px] uppercase text-mall-orange tracking-widest">Admin</p>
          <p className="font-display text-cream text-sm">Azard Stores</p>
        </div>
        <button ref={mobileMenuButtonRef} type="button" aria-expanded={mobileNavOpen} aria-controls="mobile-admin-navigation" aria-label={mobileNavOpen ? "Close admin navigation" : "Open admin navigation"} onClick={() => setMobileNavOpen((open) => !open)} className="flex items-center gap-2 rounded-lg bg-mall-800 px-3 py-2 text-cream/70">
          {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
          <span className="text-xs">Menu</span>
        </button>
        </div>
        {mobileNavOpen && (
          <div id="mobile-admin-navigation" className="mt-3 max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain border-t border-cream/8 pt-3">
            <nav aria-label="Admin navigation" className="space-y-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-1 px-1 font-mono-tag text-[9px] uppercase tracking-widest text-cream/30">{group.label}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {group.links.map((link) => {
                      const Icon = link.icon;
                      return (
                        <NavLink
                          key={link.to}
                          ref={link.to === "/admin" ? firstMobileLinkRef : undefined}
                          to={link.to}
                          end={link.end}
                          aria-label={link.to === "/admin/homepage" && isHomepageArea ? "Homepage Studio, current section" : undefined}
                          aria-current={link.to === "/admin/homepage" && isHomepageArea ? "page" : undefined}
                          onClick={closeMobileNavigation}
                          className={({ isActive }) => {
                            const current = isActive || (link.to === "/admin/homepage" && isHomepageArea);
                            return `flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition ${
                              current ? "bg-mall-accent text-mall-900" : "text-cream/55 hover:bg-cream/5 hover:text-cream"
                            }`;
                          }}
                        >
                          <Icon size={13} className="shrink-0" />
                          {link.label}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="mt-4 border-t border-cream/8 px-1 pt-3">
              <p className="truncate text-xs text-cream/65">{user?.name}</p>
              <p className="mb-3 truncate text-[10px] text-cream/35">{user?.email}</p>
              <button type="button" onClick={handleLogout} className="flex items-center gap-2 rounded-lg py-2 text-xs text-red-300 transition hover:text-red-200 focus-visible:outline">
                <LogOut size={13} /> Log out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className="min-h-screen min-w-0 flex-1 overflow-auto pt-16 md:pt-0">
        <div className="mx-auto max-w-5xl px-4 pb-8 pt-4 sm:px-6 sm:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
