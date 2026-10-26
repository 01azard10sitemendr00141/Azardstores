import { Link } from "react-router-dom";

// crumbs: [{ label, to }] - last item has no link (current location)
export default function Breadcrumbs({ crumbs }) {
  return (
    <nav aria-label="Breadcrumb" className="font-mono-tag text-xs uppercase tracking-wide text-cream/40 mb-4">
      <ol className="flex items-center gap-2 flex-wrap">
        {crumbs.map((crumb, i) => (
          <li key={i} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">→</span>}
            {crumb.to ? (
              <Link to={crumb.to} className="hover:text-mall-accent transition">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-cream/70">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
