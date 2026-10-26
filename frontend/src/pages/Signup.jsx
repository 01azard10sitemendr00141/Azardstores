import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, ShoppingBag } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";
import AuthInput from "../components/AuthInput";
import { isValidPassword } from "../utils/passwordPolicy";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const claimOrderId = state?.claimOrderId || null;
  const [name, setName] = useState(state?.prefillName || "");
  const [email, setEmail] = useState(state?.prefillEmail || "");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || !password.trim()) { setError("Please fill in all fields"); return; }
    if (!isValidPassword(password)) { setError("Use a password with at least 12 characters and no more than 72 UTF-8 bytes."); return; }
    setLoading(true);
    try {
      await signup(name, email, password, phone, claimOrderId);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Could not create account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      image="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1600&auto=format&fit=crop"
      quote="The standard has changed."
      subquote="Every brand you want, one cart, zero hassle — join in seconds."
    >
      <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-2">Get started</p>
      <h1 className="font-display text-2xl sm:text-3xl text-cream mb-3">Create account</h1>
      <p className="text-cream/40 text-xs mb-5 leading-relaxed">
        {claimOrderId
          ? "Use the email address from your order. We'll link guest orders only after you verify that email address."
          : "Ordered as a guest before? Verify the email address used at checkout to add those orders to your account."}
      </p>

      <form onSubmit={handleSignup}>
        <AuthInput label="Full Name" id="signup-name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        <AuthInput label="Email" id="signup-email" name="email" autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <AuthInput
          id="signup-phone"
          name="phone"
          autoComplete="tel"
          label={claimOrderId ? "Phone (used at checkout)" : "Phone (optional)"}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="07XX XXX XXX"
        />
        <AuthInput
          id="signup-password"
          name="new-password"
          autoComplete="new-password"
          label="Password"
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
        {error && <p className="text-red-400 text-xs mb-4 mt-1">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-mall-accent text-mall-900 font-semibold py-3.5 rounded-xl hover:bg-mall-accentDark transition disabled:opacity-50 text-sm mb-5 mt-5">
          {loading ? "Creating account..." : "Create Account"}
          {!loading && <ArrowRight size={14} />}
        </button>
      </form>

      <p className="text-center text-cream/30 text-sm mb-5">
        Already have an account?{" "}
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
