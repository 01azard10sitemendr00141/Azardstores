import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminRoute({ children }) {
  const { user, loading, authError, retryAuth } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div className="min-h-screen bg-mall-900 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
    </div>
  );
  if (authError) return (
    <div className="min-h-screen bg-mall-900 flex items-center justify-center px-4">
      <div role="alert" className="max-w-md rounded-2xl border border-cream/10 bg-mall-800 p-6 text-center">
        <p className="text-cream mb-4">{authError}</p>
        <button onClick={() => retryAuth().catch(() => {})} className="rounded-full bg-mall-accent px-5 py-2 text-sm font-semibold text-mall-900">Retry session check</button>
      </div>
    </div>
  );
  if (!user || user.role !== "admin") return <Navigate to="/login" state={{ from: location }} replace />;

  return children;
}
