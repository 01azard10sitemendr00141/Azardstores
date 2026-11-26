import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, Layers, Store, Package, ShoppingBag, LogOut, Tag, Award, Users, Settings, BarChart3, Sparkles, Home, Menu, X, Truck, ClipboardList, ArrowRightLeft, Warehouse,
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
    { to: "/admin/stock-requests", label: "Stock Requests", icon: Warehouse },
    { to: "/admin/suppliers", label: "Suppliers", icon: Store },
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
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-cream/10 bg-mall-900 px-3 py-5 md:flex">
        {/* Brand */}
        <div className="mb-6 flex h-12 items-center border-b border-cream/8 px-3 pb-4">
          <div className="min-w-0">
            <p className="mb-1 font-mono-tag text-[9px] uppercase tracking-[0.22em] text-mall-orange">Admin Panel</p>
            <p className="font-display text-[16px] leading-none text-cream">Azard Stores</p>
          </div>
        </div>

        {/* Nav */}
        <nav aria-label="Admin navigation" className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-0.5 pb-4 pr-1">
          {NAV_GROUPS.map((group) => (
            <section key={group.label} aria-labelledby={`desktop-nav-${group.label}`}>
              <p id={`desktop-nav-${group.label}`} className="mb-2 px-3 font-mono-tag text-[9px] uppercase tracking-[0.18em] text-cream/45">{group.label}</p>
              <div className="space-y-1">
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
                        return `group flex min-h-10 items-center gap-3 rounded-xl border px-2.5 py-2 text-[13px] font-medium transition-colors duration-150 ${
                          current
                            ? "border-mall-accent/35 bg-mall-accent/12 text-cream shadow-[inset_3px_0_0_#1683FF]"
                            : "border-transparent text-cream/60 hover:border-cream/8 hover:bg-mall-800/80 hover:text-cream focus-visible:bg-mall-800"
                        }`;
                      }}
                    >
                      <Icon
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden="true"
                        className={`shrink-0 transition-transform duration-150 group-hover:translate-x-px ${
                          (link.to === "/admin/homepage" && isHomepageArea) ? "text-mall-accent" : ""
                        }`}
                      />
                      <span className="truncate">{link.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        {/* User + logout */}
        <div className="mt-auto border-t border-cream/10 pt-3">
          <div className="rounded-xl border border-cream/8 bg-mall-800/70 px-3 py-3">
            <p className="mb-1 truncate text-xs font-semibold text-cream/85">{user?.name}</p>
            <p className="mb-3 truncate text-[10px] text-cream/40">{user?.email}</p>
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-300/15 bg-red-400/5 px-3 text-xs font-medium text-red-300 transition hover:border-red-300/25 hover:bg-red-400/10 hover:text-red-200"
            >
              <LogOut size={13} aria-hidden="true" /> Log out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile top nav ────────────────────────────────────────── */}
      <div className="fixed inset-x-0 top-0 z-50 border-b border-cream/10 bg-mall-900 px-4 py-3 md:hidden">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="font-mono-tag text-[8px] uppercase tracking-[0.2em] text-mall-orange">Admin</p>
            <p className="font-display text-sm leading-tight text-cream">Azard Stores</p>
          </div>
          <button
            ref={mobileMenuButtonRef}
            type="button"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-admin-navigation"
            aria-label={mobileNavOpen ? "Close admin navigation" : "Open admin navigation"}
            onClick={() => setMobileNavOpen((open) => !open)}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-cream/10 bg-mall-800 px-3 py-2 text-cream/80 transition hover:border-cream/15 hover:text-cream"
          >
            {mobileNavOpen ? <X size={16} aria-hidden="true" /> : <Menu size={16} aria-hidden="true" />}
            <span className="text-xs font-medium">Menu</span>
          </button>
        </div>
        {mobileNavOpen && (
          <div id="mobile-admin-navigation" className="mt-3 max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain border-t border-cream/10 pt-3">
            <nav aria-label="Admin navigation" className="space-y-3">
              {NAV_GROUPS.map((group) => (
                <section key={group.label} aria-labelledby={`mobile-nav-${group.label}`}>
                  <p id={`mobile-nav-${group.label}`} className="mb-1.5 px-1 font-mono-tag text-[9px] uppercase tracking-[0.16em] text-cream/45">{group.label}</p>
                  <div className="grid grid-cols-2 gap-1.5">
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
                            return `flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                              current
                                ? "border-mall-accent/50 bg-mall-accent text-mall-900"
                                : "border-transparent text-cream/65 hover:border-cream/8 hover:bg-mall-800 hover:text-cream"
                            }`;
                          }}
                        >
                          <Icon size={14} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
                          <span className="min-w-0 truncate">{link.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>
            <div className="mt-4 border-t border-cream/10 px-1 pt-3 pb-1">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-cream/85">{user?.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-cream/40">{user?.email}</p>
                </div>
                <button type="button" onClick={handleLogout} className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-red-300/15 px-3 text-xs text-red-300 transition hover:border-red-300/25 hover:bg-red-400/10 hover:text-red-200">
                  <LogOut size={13} aria-hidden="true" /> Log out
                </button>
              </div>
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
