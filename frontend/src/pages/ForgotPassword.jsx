import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShoppingBag, Mail, CheckCircle } from "lucide-react";
import api from "../api/client";
import AuthLayout from "../components/AuthLayout";
import AuthInput from "../components/AuthInput";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Please enter your email"); return; }
    setLoading(true);
    try {
      const res = await api.post("/auth/forgot-password", { email });
      setMessage(res.data.message || "Check your inbox for a reset link.");
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      image="https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=1600&auto=format&fit=crop"
      quote="Locked out happens to the best of us."
      subquote="Enter your email and we'll send you a link to get back into your Azard Stores account."
    >
      <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-2">Account recovery</p>
      <h1 className="font-display text-2xl sm:text-3xl text-cream mb-6">Reset your password</h1>

      {sent ? (
        <div className="flex items-start gap-3 bg-emerald-400/10 border border-emerald-400/20 rounded-xl p-4 mb-5">
          <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-cream/70 text-sm leading-relaxed">{message}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <AuthInput
            id="forgot-email"
            name="email"
            autoComplete="email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            suffix={<Mail size={14} className="text-cream/30 shrink-0" />}
          />
          {error && <p className="text-red-400 text-xs mb-4 mt-1">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-mall-accent text-mall-900 font-semibold py-3.5 rounded-xl hover:bg-mall-accentDark transition disabled:opacity-50 text-sm mb-5">
            {loading ? "Sending..." : "Send Reset Link"}
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
