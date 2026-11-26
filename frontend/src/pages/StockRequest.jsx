import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock3, MapPin, MessageCircle, Package, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { getCbdDeliveryFee, hasFreeCbdDelivery } from "../utils/deliveryPricing";

export default function StockRequest() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [contact, setContact] = useState(location.state?.contact || "");
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [county, setCounty] = useState("");
  const [town, setTown] = useState("");
  const [routeId, setRouteId] = useState("");
  const [address, setAddress] = useState("");
  const [cbdConfirmed, setCbdConfirmed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [submitting, setSubmitting] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);

  async function load(nextContact = contact) {
    if (!user && !nextContact.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/stock-requests/${id}`, user ? undefined : { params: { contact: nextContact.trim() } });
      setRequest(response.data);
      setLastRefresh(new Date());
      setRefreshError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The stock request could not be found.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshRequestDetails() {
    if (!user && !contact.trim()) return;
    try {
      const response = await api.get(`/stock-requests/${id}`, user ? undefined : { params: { contact: contact.trim() } });
      setRequest(response.data);
      setLastRefresh(new Date());
      setRefreshError("");
    } catch (requestError) {
      setRefreshError(requestError.response?.data?.message || "The latest status could not be refreshed.");
    }
  }

  useEffect(() => {
    if (user) load();
    else if (location.state?.contact) load(location.state.contact);
  }, [id, user?.id]);

  useEffect(() => {
    if (!request || !["checking", "partial"].includes(request.status)) return undefined;

    let intervalId = null;

    const stopPolling = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const startPolling = () => {
      if (document.visibilityState === "visible" && intervalId === null) {
        intervalId = window.setInterval(refreshRequestDetails, 15000);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshRequestDetails();
        startPolling();
      } else {
        stopPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    startPolling();

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [request?.status, id, user?.id, contact]);

  const routes = settings.deliveryRoutes || [];
  const counties = [...new Map(["Nairobi", ...(settings.deliveryCounties || []), ...routes.map((route) => route.county)].map((value) => [String(value).trim().toLowerCase(), String(value).trim()])).values()].sort();
  const selectedCounty = county.trim().toLowerCase();
  const towns = [...new Set([
    ...(settings.deliveryTowns || []).filter((entry) => String(entry.county).trim().toLowerCase() === selectedCounty).map((entry) => entry.town),
    ...routes.filter((route) => route.active !== false && String(route.county).trim().toLowerCase() === selectedCounty).map((route) => route.town),
  ])].sort();
  const isCbd = selectedCounty === "nairobi" && String(town).trim().toLowerCase() === "nairobi cbd";
  const availableRoutes = routes.filter((route) => route.active !== false && String(route.county).trim().toLowerCase() === selectedCounty && String(route.town).trim().toLowerCase() === String(town).trim().toLowerCase());
  const selectedRoute = availableRoutes.find((route) => String(route._id) === routeId) || null;
  const subtotal = useMemo(() => request?.items?.reduce((sum, item) => sum + Number(item.confirmedCustomerPrice || 0) * item.quantity, 0) || 0, [request]);
  const deliveryFee = isCbd ? getCbdDeliveryFee(subtotal, settings) : Number(selectedRoute?.fee || 0);
  const total = subtotal + deliveryFee;
  const quoteActive = request?.status === "quoted" && request.quoteExpiresAt && new Date(request.quoteExpiresAt).getTime() > Date.now();
  const accountSetupComplete = !user || !user.accountSetupStage || user.accountSetupStage === "complete";
  const addressRequired = isCbd || selectedRoute?.serviceType === "direct";
  const requestReference = id ? `#${id.slice(-6).toUpperCase()}` : "";
  const whatsappNumber = String(settings?.whatsappNumber || "").replace(/\D/g, "");
  const whatsappMessage = `Hi, I'm following up on stock request ${requestReference}. Could you please share an update?`;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;

  useEffect(() => {
    if (!isCbd && paymentMethod === "cod") setPaymentMethod(settings.paymentMethods?.mpesa ? "mpesa" : settings.paymentMethods?.paystack ? "paystack" : "");
  }, [isCbd, settings.paymentMethods?.mpesa, settings.paymentMethods?.paystack]);

  async function placeOrder(event) {
    event.preventDefault();
    if (!request || !quoteActive) return;
    if (!county || !town || (!isCbd && !selectedRoute)) return setError("Choose a valid delivery destination.");
    if (addressRequired && address.trim().length < 8) return setError("Enter a complete delivery address.");
    if (isCbd && !cbdConfirmed) return setError("Confirm that the address is inside Nairobi CBD.");
    if (isCbd && paymentMethod === "cod" && !cbdConfirmed) return setError("Confirm Nairobi CBD eligibility for COD.");
    setSubmitting(true);
    setError("");
    try {
      const guestInfo = user ? undefined : {
        name: request.guestInfo?.name,
        phone: request.guestInfo?.phone,
        email: request.guestInfo?.email,
      };
      const response = await api.post("/orders", {
        stockRequestId: request._id,
        items: request.items.map((item) => ({
          productId: item.product,
          variantId: item.variantId || undefined,
          quantity: item.quantity,
          expectedPrice: item.confirmedCustomerPrice,
        })),
        channel: "cart",
        deliveryAddress: selectedRoute?.serviceType === "parcel" ? selectedRoute.officeAddress : address.trim(),
        deliveryInstructions: selectedRoute?.serviceType === "parcel" ? address.trim() : "",
        deliveryArea: isCbd ? "nairobi-cbd" : selectedRoute?.serviceType === "direct" ? "nairobi-direct" : "other",
        deliveryCounty: county,
        deliveryTown: town,
        deliveryRouteId: selectedRoute?._id,
        expectedDeliveryFee: deliveryFee,
        cbdDeliveryConfirmed: cbdConfirmed,
        paymentMethod: paymentMethod || "cod",
        guestInfo,
      });
      navigate("/order-success", { state: { order: response.data }, replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The order could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-mall-900 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 border-b border-cream/15 pb-5">
          <Link to="/dashboard#orders" className="mb-4 inline-flex min-h-11 items-center gap-2 rounded px-3 text-sm text-cream/60 transition hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to my orders
          </Link>
          <p className="font-mono-tag text-[10px] uppercase tracking-[0.16em] text-mall-orange">Stock and price request</p>
          <h1 className="mt-1 font-display text-3xl text-cream">#{id.slice(-6).toUpperCase()}</h1>
        </header>
        {!request && (
          <form onSubmit={(event) => { event.preventDefault(); load(contact); }} className="rounded-2xl border border-cream/15 bg-mall-800 p-5">
            <label className="block text-xs text-cream/60">Phone or email used for the request<input required value={contact} onChange={(event) => setContact(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream" /></label>
            {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
            <button type="submit" disabled={loading} className="mt-4 min-h-11 w-full rounded-xl bg-mall-accent text-sm font-semibold text-mall-900 disabled:opacity-50">{loading ? "Checking…" : "View stock request"}</button>
          </form>
        )}
        {request && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="lg:col-span-2 flex flex-col gap-3 rounded-2xl border border-cream/15 bg-mall-800 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                {["checking", "partial"].includes(request.status) ? (
                  <div className="flex items-center gap-2 text-xs text-cream/60" role="status" aria-live="polite">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-mall-accent motion-safe:animate-pulse" aria-hidden="true" />
                    <span>
                      Live updates {lastRefresh ? `· Last checked ${lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "· Checking now"}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-cream/50">
                    {lastRefresh ? `Status last refreshed ${lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Status loaded"}
                  </p>
                )}
                {refreshError && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p role="alert" className="text-xs text-red-300">{refreshError}</p>
                    <button type="button" onClick={refreshRequestDetails} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-mall-accent hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent">
                      <RefreshCw size={13} aria-hidden="true" />
                      Retry refresh
                    </button>
                  </div>
                )}
              </div>
            </div>
            <section className="min-w-0 rounded-2xl border border-cream/15 bg-mall-800 p-5">
              <div className="mb-5 flex items-start gap-3">
                <Clock3 size={18} className={quoteActive ? "text-mall-accent" : "text-amber-200"} />
                <div>
                  <p className="text-sm font-semibold text-cream">{request.status === "checking" ? "I'm checking availability for your items" : request.status === "partial" ? "I'm confirming the remaining items" : request.status === "quoted" ? quoteActive ? "Confirmed quote ready" : "Quote expired" : request.status === "converted" ? "Converted to an order" : request.status === "cancelled" ? "Request cancelled" : "Stock hold released"}</p>
                  <p className="mt-1 text-xs leading-relaxed text-cream/50">{request.status === "checking" ? "I'm confirming availability and current prices. I'll update you here as soon as I have an answer, usually within two business hours." : request.status === "partial" ? "I'm confirming availability and current prices for the remaining items." : quoteActive ? `This confirmed quote expires ${new Date(request.quoteExpiresAt).toLocaleString("en-KE")}. Availability and prices are confirmed for the quote period.` : "The confirmed quote is no longer active."}</p>
                </div>
              </div>
              <div className="divide-y divide-cream/10">
                {request.items.map((item) => (
                  <div key={item._id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div><p className="text-cream">{item.name}</p>{item.variantName && <p className="text-xs text-cream/45">{item.variantName}</p>}<p className="mt-1 text-xs text-cream/40">Qty {item.quantity}</p></div>
                    {item.confirmedCustomerPrice != null ? <p className="shrink-0 text-cream">KSh {(Number(item.confirmedCustomerPrice) * item.quantity).toLocaleString()}</p> : <p className="text-xs text-cream/40">Checking availability and price</p>}
                  </div>
                ))}
              </div>
              {whatsappNumber && (
                <div className="mt-4 flex justify-end">
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-mall-accent/30 px-3 text-xs font-semibold text-mall-accent transition hover:border-mall-accent hover:bg-mall-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent">
                    <MessageCircle size={14} aria-hidden="true" />
                    WhatsApp help
                  </a>
                </div>
              )}
            </section>
            {quoteActive && !accountSetupComplete && <p className="rounded-2xl border border-mall-accent/20 bg-mall-accent/5 p-4 text-sm text-cream/70">Your confirmed quote is ready. Finish setting your password and verifying your email on <Link to="/dashboard#orders" className="text-mall-accent underline">your account dashboard</Link> before continuing to delivery and payment.</p>}
            {quoteActive && accountSetupComplete && (
              <aside className="lg:col-start-1 lg:col-span-2">
                <form onSubmit={placeOrder} className="rounded-2xl border border-cream/15 bg-mall-800 p-5">
                  <h2 className="font-display text-xl text-cream">Choose delivery and payment</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-cream/60">County<select required value={county} onChange={(event) => { setCounty(event.target.value); setTown(""); setRouteId(""); setCbdConfirmed(false); }} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream"><option value="">Choose county</option>{counties.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                    <label className="text-xs text-cream/60">Town / area<select required value={town} onChange={(event) => { setTown(event.target.value); setRouteId(""); setCbdConfirmed(false); }} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream"><option value="">Choose town</option>{towns.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  </div>
                  {!isCbd && town && (
                    <label className="mt-3 block text-xs text-cream/60">Delivery option<select required value={routeId} onChange={(event) => setRouteId(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream"><option value="">Choose route</option>{availableRoutes.map((route) => <option key={route._id} value={route._id}>{route.serviceType === "direct" ? "Direct delivery" : "Parcel"} · {route.officeName || route.town} · KSh {Number(route.fee || 0).toLocaleString()}</option>)}</select></label>
                  )}
                  {(addressRequired || isCbd) && <label className="mt-3 block text-xs text-cream/60">Delivery address<input required minLength={8} value={address} onChange={(event) => setAddress(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream" /></label>}
                  {isCbd && <label className="mt-3 flex min-h-11 items-start gap-3 rounded-xl border border-cream/10 p-3 text-xs text-cream/70"><input type="checkbox" checked={cbdConfirmed} onChange={(event) => setCbdConfirmed(event.target.checked)} className="mt-0.5" />I confirm this address is inside eligible Nairobi CBD for delivery.</label>}
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {isCbd && <button type="button" onClick={() => setPaymentMethod("cod")} className={`min-h-11 rounded-xl border px-3 text-xs ${paymentMethod === "cod" ? "border-mall-orange bg-mall-orange text-mall-900" : "border-cream/15 text-cream/70"}`}>Cash on delivery</button>}
                    {settings.paymentMethods?.mpesa && <button type="button" onClick={() => setPaymentMethod("mpesa")} className={`min-h-11 rounded-xl border px-3 text-xs ${paymentMethod === "mpesa" ? "border-mall-orange bg-mall-orange text-mall-900" : "border-cream/15 text-cream/70"}`}>M-Pesa</button>}
                    {settings.paymentMethods?.paystack && <button type="button" onClick={() => setPaymentMethod("paystack")} className={`min-h-11 rounded-xl border px-3 text-xs ${paymentMethod === "paystack" ? "border-mall-orange bg-mall-orange text-mall-900" : "border-cream/15 text-cream/70"}`}>Card</button>}
                  </div>
                  <div className="mt-5 border-t border-cream/10 pt-4">
                    <div className="flex justify-between text-sm text-cream/70"><span>Confirmed items</span><span>KSh {subtotal.toLocaleString()}</span></div>
                    <div className="mt-2 flex justify-between text-sm text-cream/70"><span>Delivery</span><span>{county && town && (isCbd || selectedRoute) ? `KSh ${deliveryFee.toLocaleString()}` : "Choose destination"}</span></div>
                    <div className="mt-3 flex justify-between text-cream"><span className="text-sm font-semibold">Final total</span><span className="font-display text-xl">KSh {total.toLocaleString()}</span></div>
                  </div>
                  {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
                  <button type="submit" disabled={submitting || !paymentMethod || !county || !town || (!isCbd && !selectedRoute)} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-mall-orange text-sm font-semibold text-mall-900 disabled:opacity-50">
                    {submitting ? "Creating order…" : "Create order"} <ArrowRight size={15} />
                  </button>
                </form>
              </aside>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
