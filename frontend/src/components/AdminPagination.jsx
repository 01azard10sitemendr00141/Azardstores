import { ChevronLeft, ChevronRight } from "lucide-react";

// Shared pagination control for admin list pages (Products, Shops, Orders,
// Customers). All of them follow the same { page, pages } contract from
// their respective backend list endpoints.
export default function AdminPagination({ page, pages, onChange }) {
  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-cream/10">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="flex items-center gap-1.5 text-cream/50 hover:text-cream text-xs font-medium transition disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft size={14} /> Previous
      </button>
      <p className="font-mono-tag text-[10px] uppercase text-cream/30 tracking-widest">
        Page {page} of {pages}
      </p>
      <button
        onClick={() => onChange(Math.min(pages, page + 1))}
        disabled={page >= pages}
        className="flex items-center gap-1.5 text-cream/50 hover:text-cream text-xs font-medium transition disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Next <ChevronRight size={14} />
      </button>
    </div>
  );
}
