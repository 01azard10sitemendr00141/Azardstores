import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Clock3, Mail, Phone, ShieldCheck, User } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

export default function StockCheck() {
  const { items, clearCart } = useCart();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [accountExists, setAccountExists] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [createdAccount, setCreatedAccount] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [submittedStockRequest, setSubmittedStockRequest] = useState(null);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPhone(user.phone || "");
      setEmail(user.email || "");
    }
  }, [user?.id]);

  if (!items.length && !submissionComplete) return <Navigate to="/cart" replace />;

  async function openDashboard() {
    setError("");
    try {
      if (createdAccount) await refreshUser();
      navigate("/dashboard#orders", {
        replace: true,
        state: submittedStockRequest ? { submittedStockRequest } : undefined,
      });
    } catch {
      setError("Your order was created, but your dashboard session could not be refreshed. Try again shortly; the order is saved.");
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setAccountExists(false);
    setSubmitting(true);
    try {
      const response = await api.post("/stock-requests", {
        items: items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId || undefined,
          quantity: item.quantity,
        })),
        guestInfo: user ? undefined : { name: name.trim(), phone: phone.trim(), email: email.trim() },
      });
      const createdStockRequest = {
        _id: String(response.data._id),
        status: response.data.status,
        createdAt: response.data.createdAt,
        items: (response.data.items || []).map((item) => ({
          _id: String(item._id),
          name: item.name,
          variantName: item.variantName || "",
          quantity: item.quantity,
          confirmedQuantity: item.confirmedQuantity,
          confirmedCustomerPrice: item.confirmedCustomerPrice,
        })),
      };
      setSubmittedStockRequest(createdStockRequest);
      clearCart();
      setSubmissionComplete(true);
      setCreatedAccount(Boolean(response.data.accountCreated));
      setOrderId(String(response.data.orderId || ""));
      if (response.data.accountCreated) {
        try {
          await refreshUser();
        } catch {
          setError("Your order was created, but your dashboard session could not be refreshed. Try again shortly; the order is saved.");
          return;
        }
      }
      navigate("/dashboard#orders", { replace: true, state: { submittedStockRequest: createdStockRequest } });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The stock check could not be submitted.");
      setAccountExists(requestError.response?.data?.code === "ACCOUNT_EXISTS");
    } finally {
      setSubmitting(false);
    }
  }

  if (submissionComplete) {
    return (
      <main className="min-h-screen bg-mall-900 px-4 py-8 sm:py-12">
        <section className="mx-auto max-w-xl rounded-2xl border border-cream/15 bg-mall-800 p-6">
          <h1 className="font-display text-2xl text-cream">Your order is saved</h1>
          <p className="mt-2 text-sm leading-relaxed text-cream/65">
            {orderId ? `Order #${orderId.slice(-6).toUpperCase()} is now in your dashboard.` : "Your order is now in your dashboard."}
            {" "}I'm checking availability and pricing. No payment is due yet.
          </p>
          {error && <p role="alert" className="mt-4 text-xs text-amber-200">{error}</p>}
          <button type="button" onClick={openDashboard} className="mt-5 min-h-11 w-full rounded-xl bg-mall-orange px-4 text-sm font-semibold text-mall-900">
            Open your order dashboard
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-mall-900 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 border-b border-cream/15 pb-5">
          <p className="font-mono-tag text-[10px] uppercase tracking-[0.16em] text-mall-orange">Availability request</p>
        </header>
        <form onSubmit={submit} className="rounded-2xl border border-cream/15 bg-mall-800 p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-mall-accent/20 bg-mall-accent/5 p-4">
            <Clock3 size={18} className="mt-0.5 shrink-0 text-mall-accent" />
            <p className="text-xs leading-relaxed text-cream/70">A target of <strong className="text-cream">2 business hours</strong> applies to the full-cart check.</p>
          </div>
          {user ? (
            <div className="space-y-3">
              <p className="rounded-xl border border-cream/10 bg-mall-900/50 px-4 py-3 text-sm text-cream/70"><User size={14} className="mr-2 inline text-mall-accent" />{user.name}</p>
              <p className="rounded-xl border border-cream/10 bg-mall-900/50 px-4 py-3 text-sm text-cream/70"><Mail size={14} className="mr-2 inline text-mall-accent" />{user.email}</p>
              <label className="block"><span className="mb-1.5 block text-xs text-cream/60">Mobile for stock updates</span><span className="flex items-center gap-2 rounded-xl border border-cream/10 bg-mall-900 px-3"><Phone size={14} className="text-mall-accent" /><input readOnly value={phone} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-cream outline-none" /></span></label>
              {!user.phone && <p className="text-xs text-amber-200">Add a phone number in <Link to="/dashboard#settings" className="underline">account settings</Link> before submitting.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block"><span className="mb-1.5 block text-xs text-cream/60">Full name</span><span className="flex items-center gap-2 rounded-xl border border-cream/10 bg-mall-900 px-3"><User size={14} className="text-mall-accent" /><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-cream outline-none" /></span></label>
              <label className="block"><span className="mb-1.5 block text-xs text-cream/60">Phone number</span><span className="flex items-center gap-2 rounded-xl border border-cream/10 bg-mall-900 px-3"><Phone size={14} className="text-mall-accent" /><input required maxLength={18} value={phone} onChange={(event) => setPhone(event.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-cream outline-none" /></span></label>
              <label className="block"><span className="mb-1.5 block text-xs text-cream/60">Email for the confirmed quote</span><span className="flex items-center gap-2 rounded-xl border border-cream/10 bg-mall-900 px-3"><Mail size={14} className="text-mall-accent" /><input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-cream outline-none" /></span></label>
            </div>
          )}
          {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
          {accountExists && <Link to="/login" state={{ from: "/stock-check" }} className="mt-3 block text-sm text-mall-accent underline">Sign in to continue with this order</Link>}
          <button type="submit" disabled={submitting || (!user && (!name.trim() || !phone.trim() || !email.trim()))} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-mall-orange text-sm font-semibold text-mall-900 disabled:opacity-50">
            {submitting ? "Submitting…" : "Submit for stock and price check"} <ArrowRight size={15} />
          </button>
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-cream/40"><ShieldCheck size={13} className="mt-0.5 shrink-0" />No payment is taken, and stock isn't held until I confirm availability.</p>
        </form>
      </div>
    </main>
  );
}
