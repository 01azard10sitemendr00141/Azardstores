import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup(form.name, form.email, form.password, form.phone);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <h1 className="font-display text-2xl text-mall-900 mb-6">Create your account</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Full name"
          value={form.name}
          onChange={update("name")}
          required
          className="w-full border border-mall-900/20 rounded-md px-3 py-2 text-sm"
        />
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={update("email")}
          required
          className="w-full border border-mall-900/20 rounded-md px-3 py-2 text-sm"
        />
        <input
          type="tel"
          placeholder="Phone number"
          value={form.phone}
          onChange={update("phone")}
          className="w-full border border-mall-900/20 rounded-md px-3 py-2 text-sm"
        />
        <input
          type="password"
          placeholder="Password (min 6 characters)"
          value={form.password}
          onChange={update("password")}
          required
          minLength={6}
          className="w-full border border-mall-900/20 rounded-md px-3 py-2 text-sm"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-mall-900 text-cream font-medium py-3 rounded-md hover:bg-mall-700 transition disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Sign Up"}
        </button>
      </form>
      <p className="text-sm text-mall-900/60 mt-4">
        Already have an account? <Link to="/login" className="text-mall-accentDark hover:underline">Log in</Link>
      </p>
    </div>
  );
}
