import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, ShoppingBag } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";
import AuthInput from "../components/AuthInput";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) { setError("Please fill in all fields"); return; }
    setLoading(true);
    try {
      const user = await login(email, password);
      if (location.state?.from && location.state.from.pathname !== "/login") {
        const { pathname, search, hash } = location.state.from;
        navigate(pathname.startsWith("/admin") && user?.role !== "admin"
          ? "/dashboard"
          : `${pathname}${search || ""}${hash || ""}`, { replace: true });
      } else if (user?.role === "admin") navigate("/admin");
      else navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      image="https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=1600&auto=format&fit=crop"
      quote="Everything you need. One address."
      subquote="Hundreds of brands, one cart, delivered fast — day or night."
    >
      <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-2">Welcome back</p>
      <h1 className="font-display text-2xl sm:text-3xl text-cream mb-6">Log in</h1>

      <form onSubmit={handleLogin}>
        <AuthInput label="Email" id="login-email" name="email" autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <AuthInput
          id="login-password"
          name="password"
          autoComplete="current-password"
          label="Password"
          type={showPw ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          suffix={
            <button type="button" onClick={() => setShowPw((s) => !s)} className="text-cream/30 hover:text-cream transition shrink-0">
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          }
        />
        <div className="flex justify-end mb-5">
          <Link to="/forgot-password" className="text-xs text-cream/30 hover:text-mall-accent transition">
            Forgot password?
          </Link>
        </div>
        {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-mall-accent text-mall-900 font-semibold py-3.5 rounded-xl hover:bg-mall-accentDark transition disabled:opacity-50 text-sm mb-5">
          {loading ? "Logging in..." : "Log In"}
          {!loading && <ArrowRight size={14} />}
        </button>
      </form>

      <p className="text-center text-cream/30 text-sm mb-5">
        Don't have an account?{" "}
        <Link to="/signup" className="text-mall-accent hover:underline font-medium">Sign up</Link>
      </p>

      <div className="pt-4 border-t border-cream/10">
        <Link to="/directory" className="flex items-center justify-center gap-2 text-cream/25 hover:text-cream/50 transition text-xs">
          <ShoppingBag size={12} /> Continue browsing without an account
        </Link>
      </div>
    </AuthLayout>
  );
}
