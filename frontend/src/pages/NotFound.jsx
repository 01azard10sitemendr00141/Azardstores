import { Link } from "react-router-dom";
import { Compass, ArrowRight, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-mall-900 flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md mx-auto">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-mall-accent/10 flex items-center justify-center mx-auto mb-6">
          <Compass size={40} className="text-mall-accent" />
        </div>

        {/* Heading */}
        <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-3">
          Azard Stores
        </p>
        <h1 className="font-display text-6xl sm:text-7xl text-cream mb-3 leading-tight">
          404
        </h1>
        <p className="text-cream/50 text-sm sm:text-base leading-relaxed mb-8">
          This floor doesn't exist. The page you're looking for may have moved, or the link might be off.
        </p>

        {/* Divider */}
        <div className="border-t border-cream/10 mb-8" />

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/"
            className="flex-1 flex items-center justify-center gap-2 bg-mall-accent text-mall-900 font-semibold py-3.5 rounded-xl hover:bg-mall-accentDark transition text-sm"
          >
            Back to Home
            <ArrowRight size={13} />
          </Link>
          <Link
            to="/directory"
            className="flex-1 flex items-center justify-center gap-2 border border-cream/15 text-cream/60 hover:text-cream hover:border-cream/30 font-medium py-3.5 rounded-xl transition text-sm"
          >
            <Search size={14} />
            Browse the Mall
          </Link>
        </div>
      </div>
    </div>
  );
}
