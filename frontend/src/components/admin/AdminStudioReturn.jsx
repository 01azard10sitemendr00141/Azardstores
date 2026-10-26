import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminStudioReturn() {
  return (
    <Link
      to="/admin/homepage"
      className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-medium text-cream/45 transition hover:text-mall-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mall-accent"
    >
      <ArrowLeft size={14} />
      Homepage Studio
    </Link>
  );
}
