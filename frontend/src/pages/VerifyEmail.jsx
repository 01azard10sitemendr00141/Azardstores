import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, XCircle, ArrowRight, ShoppingBag } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing its token.");
      return;
    }
    api
      .get("/auth/verify-email", { params: { token } })
      .then(() => {
        setStatus("success");
        // If they're logged in on this device, refresh so the app knows
        // they're verified without needing to log out and back in.
        if (user) refreshUser().catch(() => {});
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.response?.data?.message || "This link is invalid or has expired.");
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-mall-900 flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-sm mx-auto">
        {status === "verifying" && (
          <>
            <div className="w-6 h-6 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin mx-auto mb-6" />
            <p className="text-cream/40 text-sm">Verifying your email...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={40} className="text-emerald-400" />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl text-cream mb-3">Email verified</h1>
            <p className="text-cream/50 text-sm leading-relaxed mb-8">
              You're all set. You can now check out and place orders.
            </p>
            <Link
              to={user ? "/dashboard" : "/login"}
              className="flex items-center justify-center gap-2 bg-mall-accent text-mall-900 font-semibold py-3.5 rounded-xl hover:bg-mall-accentDark transition text-sm"
            >
              {user ? "Go to Dashboard" : "Log In"} <ArrowRight size={13} />
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-20 h-20 rounded-full bg-red-400/15 flex items-center justify-center mx-auto mb-6">
              <XCircle size={40} className="text-red-400" />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl text-cream mb-3">Couldn't verify</h1>
            <p className="text-cream/50 text-sm leading-relaxed mb-8">{message}</p>
            <div className="flex flex-col gap-3">
              {user && (
                <Link
                  to="/dashboard#settings"
                  className="flex items-center justify-center gap-2 bg-mall-accent text-mall-900 font-semibold py-3.5 rounded-xl hover:bg-mall-accentDark transition text-sm"
                >
                  Resend from Settings <ArrowRight size={13} />
                </Link>
              )}
              <Link
                to="/directory"
                className="flex items-center justify-center gap-2 border border-cream/15 text-cream/60 hover:text-cream hover:border-cream/30 font-medium py-3.5 rounded-xl transition text-sm"
              >
                <ShoppingBag size={14} /> Continue Browsing
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}