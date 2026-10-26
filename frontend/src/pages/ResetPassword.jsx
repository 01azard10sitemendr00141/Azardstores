import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, ShoppingBag, CheckCircle } from "lucide-react";
import api from "../api/client";
import AuthLayout from "../components/AuthLayout";
import AuthInput from "../components/AuthInput";
import { isValidPassword } from "../utils/passwordPolicy";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!token) { setError("This reset link is invalid or has expired."); return; }
    if (!isValidPassword(password)) { setError("Use a password with at least 12 characters and no more than 72 UTF-8 bytes."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.response?.data?.message || "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      image="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1600&auto=format&fit=crop"
      quote="Almost there."
      subquote="Set a new password to get back into your Azard Stores account."
    >
      <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-2">Account recovery</p>
      <h1 className="font-display text-2xl sm:text-3xl text-cream mb-6">Set a new password</h1>

      {done ? (
        <div className="flex items-start gap-3 bg-emerald-400/10 border border-emerald-400/20 rounded-xl p-4 mb-5">
          <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-cream/70 text-sm leading-relaxed">Password updated. Taking you to log in...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <AuthInput
            id="reset-password"
            name="new-password"
            autoComplete="new-password"
            label="New Password"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 12 characters"
            minLength={12}
            maxLength={72}
            suffix={
              <button type="button" onClick={() => setShowPw((s) => !s)} className="text-cream/30 hover:text-cream transition shrink-0">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          />
          <AuthInput
            id="reset-password-confirm"
            name="confirm-password"
            autoComplete="new-password"
            label="Confirm Password"
            type={showPw ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            minLength={12}
            maxLength={72}
          />
          {error && <p className="text-red-400 text-xs mb-4 mt-1">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-mall-accent text-mall-900 font-semibold py-3.5 rounded-xl hover:bg-mall-accentDark transition disabled:opacity-50 text-sm mb-5">
            {loading ? "Resetting..." : "Reset Password"}
            {!loading && <ArrowRight size={14} />}
          </button>
        </form>
      )}

      <p className="text-center text-cream/30 text-sm mb-5">
        Remembered it after all?{" "}
        <Link to="/login" className="text-mall-accent hover:underline font-medium">Log in</Link>
      </p>

      <div className="pt-4 border-t border-cream/10">
        <Link to="/directory" className="flex items-center justify-center gap-2 text-cream/25 hover:text-cream/50 transition text-xs">
          <ShoppingBag size={12} /> Continue browsing without an account
        </Link>
      </div>
    </AuthLayout>
  );
}
