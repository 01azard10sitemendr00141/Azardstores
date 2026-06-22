import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-mall-900 text-cream/80 mt-16">
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
        <div>
          <h3 className="font-display text-lg text-cream mb-2">ShopRight Mall</h3>
          <p className="text-cream/60">
            A digital mall, organized by floor and shop — built in Kenya, for Kenya.
          </p>
        </div>
        <div>
          <h4 className="font-mono-tag text-xs uppercase text-mall-accent mb-2">Browse</h4>
          <ul className="space-y-1">
            <li><Link to="/directory" className="hover:text-mall-accent transition">Mall Directory</Link></li>
            <li><Link to="/search?q=" className="hover:text-mall-accent transition">Search Products</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-mono-tag text-xs uppercase text-mall-accent mb-2">Account</h4>
          <ul className="space-y-1">
            <li><Link to="/login" className="hover:text-mall-accent transition">Log in</Link></li>
            <li><Link to="/signup" className="hover:text-mall-accent transition">Create account</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-mall-700 text-center text-xs text-cream/40 py-4">
        © {new Date().getFullYear()} ShopRight Mall. Every shop has a number. Every number has a story.
      </div>
    </footer>
  );
}
