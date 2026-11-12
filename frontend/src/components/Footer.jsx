import { Link } from "react-router-dom";
import { MapPin, Phone, Mail } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import { useBadges } from "../context/BadgesContext";
import { formatPhoneDisplay } from "../utils/formatPhone";

export default function Footer() {
  const { settings } = useSettings();
  const { badges } = useBadges();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-mall-900 text-cream border-t border-cream/5">

      {/* Top band - brand */}
      <div className="border-b border-cream/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="max-w-xs">
            <Link to="/" className="flex items-center gap-2 mb-3">
              <img src="/pics/azard-stores-wordmark.webp" alt="Azard Stores" width="640" height="320" loading="lazy" decoding="async" className="h-20 p-5 pt-4 rounded-lg object-contain" />
            </Link>
            <p className="text-cream/50 text-sm leading-relaxed">
              Browse products from multiple shops in one catalog and checkout.
            </p>
          </div>
        </div>
      </div>

      {/* ── Main columns ──────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6">

        {/* Column 1 — Floors */}
        <div className="col-span-2 sm:col-span-1">
            <h4 className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-4">Account</h4>
          <ul className="space-y-2">
            {[
              { label: "Log In",            to: "/login" },
              { label: "Create Account",    to: "/signup" },
              { label: "My Orders",         to: "/dashboard" },
              { label: "Wishlist",          to: "/wishlist" },
              { label: "Account Settings",  to: "/account" },
            ].map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-cream/60 hover:text-cream text-sm transition">{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 2 — Browse + Account */}
        <div>
          <h4 className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-4">Browse</h4>
          <ul className="space-y-2 mb-8">
            {[
              { label: "Mall Directory",   to: "/directory" },
              { label: "Search Products",  to: "/search?q=" },
              { label: "Flash Sales",      to: "/search?flashSale=true" },
              ...badges.slice(0, 4).map((b) => ({ label: b.sectionHeading, to: `/search?badge=${b.slug}` })),
            ].map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-cream/60 hover:text-cream text-sm transition">{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 3 — Help + Legal */}
        <div>
          <h4 className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-4">Help</h4>
          <ul className="space-y-2 mb-8">
            {[
              { label: "How It Works",      to: "/how-it-works" },
              { label: "FAQs",              to: "/faq" },
              { label: "Track My Order",    to: "/track-order" },
              { label: "Returns & Exchanges", to: "/returns" },
              { label: "Delivery Info",     to: "/delivery" },
              { label: "Contact Us",        to: "/contact" },
            ].map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-cream/60 hover:text-cream text-sm transition">{link.label}</Link>
              </li>
            ))}
          </ul>
          <h4 className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-4">Legal</h4>
          <ul className="space-y-2">
            {[
              { label: "Privacy Policy", to: "/privacy" },
              { label: "Terms of Service", to: "/terms" },
              { label: "Cookie Policy", to: "/cookies" },
            ].map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-cream/60 hover:text-cream text-sm transition">{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 4 — Contact + Socials */}
        <div>
          <h4 className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-4">Contact</h4>
          <ul className="space-y-3 mb-8">
            <li>
              <a href={`https://wa.me/${settings.whatsappNumber}`} target="_blank" rel="noopener noreferrer"
                className="flex items-start gap-2.5 text-cream/60 hover:text-cream text-sm transition">
                <Phone size={13} className="text-mall-accent shrink-0 mt-0.5" />
                <span>{formatPhoneDisplay(settings.whatsappNumber)}<br /><span className="text-[11px] text-cream/30">WhatsApp & Calls</span></span>
              </a>
            </li>

            <li>
              <a href={`mailto:${settings.contactEmail}`}
                className="flex items-start gap-2.5 text-cream/60 hover:text-cream text-sm transition">
                <Mail size={13} className="text-mall-accent shrink-0 mt-0.5" />
                <span>{settings.contactEmail}</span>
              </a>
            </li>
            <li>
              <div className="flex items-start gap-2.5 text-cream/60 text-sm">
                <MapPin size={13} className="text-mall-accent shrink-0 mt-0.5" />
                <span>Nairobi, Kenya<br /><span className="text-[11px] text-cream/30">Online storefront</span></span>
              </div>
            </li>
          </ul>

          {/* WhatsApp CTA */}
          <a href={`https://wa.me/${settings.whatsappNumber}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-xs font-medium px-3 py-2 rounded-lg hover:bg-[#25D366]/20 transition w-fit">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.127 1.532 5.86L.057 23.857l6.174-1.448A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.001-1.366l-.36-.214-3.664.86.876-3.565-.233-.375A9.818 9.818 0 1112 21.818z"/>
            </svg>
            Chat with us on WhatsApp
          </a>
        </div>
      </div>

      {/* ── Bottom bar ────────────────────────────────────────────────────── */}
      <div className="border-t border-cream/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-cream/30 text-xs">
          <p>© {year} Azard Stores. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-cream/60 transition">Privacy</Link>
            <Link to="/terms" className="hover:text-cream/60 transition">Terms</Link>
            <Link to="/cookies" className="hover:text-cream/60 transition">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
