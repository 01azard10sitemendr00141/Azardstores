import { useEffect, useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { ShoppingBag, ArrowRight, MapPin, User, Phone, Mail, ShieldAlert, Truck, Smartphone, CreditCard, Send, ShieldCheck, Wallet } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import api from "../api/client";
import VerificationCenter from "../components/VerificationCenter";
import { getCbdDeliveryFee, hasFreeCbdDelivery } from "../utils/deliveryPricing";

export default function Checkout() {
  const { items } = useCart();
  if (!items.length) return <Navigate to="/cart" replace />;
  return <CheckoutForm />;
}

function CheckoutForm() {
  const { items, updateItemSnapshot, removeItem, totalAmount, clearCart } = useCart();
  const { user, refreshUser } = useAuth();
  const { settings, loading: settingsLoading, refreshSettings } = useSettings();
  const WHATSAPP_NUMBER = settings.whatsappNumber;
  const navigate = useNavigate();

  const [address, setAddress] = useState("");
  const [saveAddressToAccount, setSaveAddressToAccount] = useState(true);
  const [deliveryCounty, setDeliveryCounty] = useState("");
  const [deliveryTown, setDeliveryTown] = useState("");
  const [deliveryRouteId, setDeliveryRouteId] = useState("");
  const [cbdDeliveryConfirmed, setCbdDeliveryConfirmed] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [checkoutPhone, setCheckoutPhone] = useState("");
  const [storeBalanceToUse, setStoreBalanceToUse] = useState(0);
  const [currentStoreBalance, setCurrentStoreBalance] = useState(Number(user?.storeBalance || 0));
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [checkoutAttempted, setCheckoutAttempted] = useState(false);
  const [caps, setCaps] = useState(null);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeBusy, setEmailCodeBusy] = useState(false);
  const [emailCodeError, setEmailCodeError] = useState("");
  const [emailCodeMessage, setEmailCodeMessage] = useState("");
  // Mirrors the server-side calculation in routes/orders.js: this is a
  // preview only, so the checkout total matches what's shown before the
  // order is submitted — the real fee is still computed server-side.
  const deliveryRoutes = settings.deliveryRoutes || [];
  const normalizeLocation = (value) => String(value || "").trim().toLowerCase();
  const counties = [...new Map(["Nairobi", ...(settings.deliveryCounties || []), ...deliveryRoutes.map((route) => route.county)].map((county) => [county.trim().toLowerCase(), county.trim().toLowerCase() === "nairobi" ? "Nairobi" : county.trim()])).values()].sort((a, b) => a.localeCompare(b));
  const isNairobi = normalizeLocation(deliveryCounty) === "nairobi";
  const towns = [...new Set([...(settings.deliveryTowns || []).filter((destination) => normalizeLocation(destination.county) === normalizeLocation(deliveryCounty)).map((destination) => destination.town), ...deliveryRoutes.filter((route) => route.active !== false && normalizeLocation(route.county) === normalizeLocation(deliveryCounty)).map((route) => route.town)])].sort((a, b) => a.localeCompare(b));
  const availableRoutes = deliveryRoutes.filter((route) => route.active !== false && normalizeLocation(route.county) === normalizeLocation(deliveryCounty) && normalizeLocation(route.town) === normalizeLocation(deliveryTown));
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);
  const isCbdTown = isNairobi && normalizeLocation(deliveryTown) === "nairobi cbd";
  const isCbd = isCbdTown && !deliveryRouteId;
  const selectedDeliveryRoute = availableRoutes.find((route) => route._id === deliveryRouteId) || null;
  const destinationSelected = Boolean(deliveryCounty && deliveryTown);
  const deliveryOptionSelected = isCbd || Boolean(selectedDeliveryRoute);
  const addressRequired = isCbd || selectedDeliveryRoute?.serviceType === "direct";
  const deliveryArea = isCbd ? "nairobi-cbd" : selectedDeliveryRoute?.serviceType === "direct" ? "nairobi-direct" : "other";
  const freeCbdThreshold = Math.max(0, Number(settings.freeDeliveryThreshold) || 0);
  const cbdFreeDeliveryApplied = isCbd && hasFreeCbdDelivery(totalAmount, freeCbdThreshold);
  const deliveryFee = isCbd ? getCbdDeliveryFee(totalAmount, settings) : selectedDeliveryRoute?.fee || 0;
  const grandTotal = totalAmount + deliveryFee;
  const availableStoreBalance = Number(currentStoreBalance || 0);
  const balanceApplied = user ? Math.min(Math.max(0, Number(storeBalanceToUse) || 0), availableStoreBalance, grandTotal) : 0;
  const amountDue = Math.max(0, grandTotal - balanceApplied);
  const storeBalanceCoversTotal = Boolean(user && balanceApplied >= grandTotal && grandTotal > 0);
  const paymentChoiceCount = storeBalanceCoversTotal
    ? 1
    : Number(isCbd) + Number(Boolean(settings.paymentMethods?.mpesa)) + Number(Boolean(settings.paymentMethods?.paystack));
  const paymentGridColumns = paymentChoiceCount <= 1
    ? "sm:grid-cols-1"
    : paymentChoiceCount === 2
      ? "sm:grid-cols-2"
      : "sm:grid-cols-3";
  const paymentTimingCopy = balanceApplied > 0
    ? `KSh ${balanceApplied.toLocaleString()} of your store balance will be reserved when you submit and applied after availability is confirmed.${storeBalanceCoversTotal ? " No external payment remains." : ` The remaining KSh ${amountDue.toLocaleString()} is due ${paymentMethod === "cod" ? "on delivery after address eligibility is confirmed." : "after confirmation and before delivery or parcel dispatch."}`}`
    : `Submit for an availability check; no payment is taken now. ${paymentMethod === "cod" ? "Eligible Nairobi CBD orders are paid on delivery after the address is confirmed." : "Payment is due after availability is confirmed and before delivery or parcel dispatch."}`;

  useEffect(() => {
    const saved = user?.savedDeliveryAddress;
    if (!saved) return;
    setDeliveryCounty(saved.county || "");
    setDeliveryTown(saved.town || "");
    setAddress(saved.address || "");
    setDeliveryRouteId(saved.routeId || "");
  }, [user?.id]);

  useEffect(() => {
    setCheckoutPhone(user?.phone || "");
  }, [user?.id, user?.phone]);

  useEffect(() => {
    let active = true;
    setStoreBalanceToUse(0);
    if (!user) {
      setCurrentStoreBalance(0);
      return () => { active = false; };
    }
    setCurrentStoreBalance(Number(user.storeBalance || 0));
    api.get("/auth/store-balance")
      .then((res) => {
        if (active) setCurrentStoreBalance(Number(res.data.balance || 0));
      })
      .catch(() => {
        if (active) setCurrentStoreBalance(Number(user.storeBalance || 0));
      });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    api.get("/auth/verification-methods").then((res) => setCaps(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isCbd && paymentMethod === "cod") {
      if (settings.paymentMethods?.mpesa) setPaymentMethod("mpesa");
      else if (settings.paymentMethods?.paystack) setPaymentMethod("paystack");
      else setPaymentMethod("");
    } else if (isCbd && !paymentMethod) {
      setPaymentMethod("cod");
    }
  }, [isCbd, paymentMethod, settings.paymentMethods?.mpesa, settings.paymentMethods?.paystack]);

  const phoneVerificationLive = Boolean(caps && (caps.sms || caps.whatsapp));
  const needsEmailVerification = Boolean(user && caps?.email && !user.isEmailVerified);
  const needsPhoneVerification = Boolean(user && phoneVerificationLive && !user.isPhoneVerified);
  const blockedByVerification = needsEmailVerification || needsPhoneVerification;

  async function sendCheckoutEmailCode() {
    setEmailCodeError("");
    setEmailCodeMessage("");
    setEmailCodeBusy(true);
    try {
      const res = await api.post("/auth/send-checkout-email-otp");
      if (res.data.verified) {
        await refreshUser();
        setEmailCodeMessage(res.data.message);
      } else {
        setEmailCodeSent(true);
        setEmailCodeMessage(res.data.message || "A code was sent to your email.");
      }
    } catch (err) {
      setEmailCodeError(err.response?.data?.message || "We couldn't send the code. Please try again.");
    } finally {
      setEmailCodeBusy(false);
    }
  }

  async function verifyCheckoutEmailCode() {
    setEmailCodeError("");
    setEmailCodeMessage("");
    setEmailCodeBusy(true);
    try {
      const res = await api.post("/auth/verify-checkout-email-otp", { code: emailCode });
      await refreshUser();
      setEmailCodeSent(false);
      setEmailCode("");
      setEmailCodeMessage(res.data.message || "Email verified successfully.");
    } catch (err) {
      setEmailCodeError(err.response?.data?.message || "That code could not be verified. Check it and try again.");
    } finally {
      setEmailCodeBusy(false);
    }
  }

  async function handleCheckout() {
    setError("");
    if (!paymentMethod && !storeBalanceCoversTotal) { setError("Online payment is not available yet, so parcel checkout cannot be placed. Please contact Azard Stores."); return; }
    if (!deliveryCounty.trim() || !deliveryTown.trim() || (!isCbd && !selectedDeliveryRoute)) { setError("Choose a county and an available delivery option"); return; }
    if ((isCbd || selectedDeliveryRoute?.serviceType === "direct") && address.trim().length < 8) { setError("Enter a complete street, building, or delivery address (at least 8 characters)"); return; }
    if (!user && (!guestName.trim() || !/\p{L}/u.test(guestName.trim()))) { setError("Please enter a valid name containing letters"); return; }
    const mobileInput = (user ? checkoutPhone : guestPhone).replace(/\D/g, "");
    if (!/^(?:254|0)?[17]\d{8}$/.test(mobileInput)) {
      if (user && needsPhoneVerification) {
        setError("");
        setCheckoutAttempted(true);
        return;
      }
      setError(user ? "Enter a valid Kenyan mobile number to continue" : "Enter a valid Kenyan mobile number, such as 0712 345 678");
      return;
    }
    if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      setError("Enter a valid email address so we can send order updates and your invoice");
      return;
    }
    if (paymentMethod === "cod" && !isCbd) {
      setError("Cash on delivery is available only for Nairobi CBD direct delivery. Other areas must be paid before delivery or dispatch.");
      return;
    }
    if (paymentMethod === "cod" && !cbdDeliveryConfirmed) { setError("Confirm that your delivery address is inside Nairobi CBD to use cash on delivery"); return; }
    if (blockedByVerification) { setCheckoutAttempted(true); return; }
    setCheckoutAttempted(false);
    setPlacing(true);
    try {
      // A signed-in customer can confirm/update their delivery phone here.
      // Keep the order contact and the account profile in sync.
      if (user && checkoutPhone.trim() !== (user.phone || "").trim()) {
        await api.put("/auth/me", { name: user.name, phone: checkoutPhone.trim() });
        await refreshUser();
      }
      const res = await api.post("/orders", {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, variantId: i.variantId || undefined, expectedPrice: i.price })),
        channel: "cart",
        deliveryAddress: selectedDeliveryRoute?.serviceType === "parcel" ? selectedDeliveryRoute.officeAddress : address.trim(),
        deliveryInstructions: selectedDeliveryRoute?.serviceType === "parcel" ? address.trim() : "",
        deliveryArea,
        deliveryCounty,
        deliveryTown,
        deliveryRouteId: selectedDeliveryRoute?._id,
        expectedDeliveryFee: deliveryFee,
        cbdDeliveryConfirmed,
        paymentMethod: storeBalanceCoversTotal ? "store_balance" : paymentMethod,
        storeBalanceAmount: balanceApplied,
        guestInfo: user ? undefined : { name: guestName, phone: guestPhone, email: guestEmail || undefined },
      });
      const order = res.data;
      let addressSaveWarning = "";
      if (user && saveAddressToAccount) {
        try {
          await api.put("/auth/me", {
            name: user.name,
            phone: checkoutPhone.trim(),
            savedDeliveryAddress: {
              county: deliveryCounty.trim(),
              town: deliveryTown.trim(),
              address: selectedDeliveryRoute?.serviceType === "direct" || isCbd ? address.trim() : "",
              routeId: selectedDeliveryRoute?._id || "",
            },
          });
          await refreshUser();
        } catch {
          addressSaveWarning = "Your order was created, but we couldn't save this address to your account. You can still track your order.";
        }
      }

      clearCart();
      navigate("/order-success", { state: { order, addressSaveWarning } });
      return;
    } catch (err) {
      if (Array.isArray(err.response?.data?.unavailableItems)) {
        err.response.data.unavailableItems.forEach((item) => removeItem(item.productId, item.variantId));
      }
      if (err.response?.data?.stockChanged && err.response.data.item) {
        const { productId, variantId, availableStock } = err.response.data.item;
        updateItemSnapshot(productId, variantId, {
          availableStock,
          stockUnconfirmed: availableStock == null,
        });
      }
      if (err.response?.data?.deliveryChanged) {
        try {
          const refreshedSettings = await refreshSettings();
          const expectedService = deliveryArea === "nairobi-direct" ? "direct" : "parcel";
          if (deliveryRouteId && !refreshedSettings.deliveryRoutes?.some((route) => (
            route._id === deliveryRouteId && route.active !== false &&
            normalizeLocation(route.county) === normalizeLocation(deliveryCounty) &&
            normalizeLocation(route.town) === normalizeLocation(deliveryTown) &&
            (route.serviceType || "parcel") === expectedService
          ))) setDeliveryRouteId("");
        } catch {
          // Keep the server's refresh instruction visible if settings cannot be reloaded.
        }
      }
      if (err.response?.data?.priceChanged && Array.isArray(err.response.data.items)) {
        err.response.data.items.forEach((changedItem) => {
          updateItemSnapshot(changedItem.productId, changedItem.variantId, {
            name: changedItem.name,
            price: changedItem.price,
            image: changedItem.image,
          });
        });
      }
      setError(err.response?.data?.message || "Could not place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }

  // WhatsApp order — build message from cart items
  const whatsappMsg = encodeURIComponent(
    `Hello Azard Stores, I would like help with this order:\n\n` +
    items.map((i) => `- ${i.name}${i.variantName ? ` (${i.variantName})` : ""} x${i.quantity} - KSh ${(i.price * i.quantity).toLocaleString()}`).join("\n") +
    `\n\nItems subtotal: KSh ${totalAmount.toLocaleString()}` +
    (deliveryFee > 0 ? `\nDelivery charge: KSh ${deliveryFee.toLocaleString()}` : "") +
    `\nTotal: ${deliveryOptionSelected ? `KSh ${grandTotal.toLocaleString()}` : "Not calculated - select a delivery option"}\nDelivery area: ${!destinationSelected ? "Not selected" : isCbd ? "Nairobi CBD direct delivery" : selectedDeliveryRoute?.serviceType === "direct" ? "Nairobi County direct delivery" : selectedDeliveryRoute ? "Parcel collection" : "Not selected"}` +
    (balanceApplied > 0 ? `\nStore Balance requested: KSh ${balanceApplied.toLocaleString()} (subject to checkout approval)` + (deliveryOptionSelected ? `\nEstimated amount after approval: KSh ${amountDue.toLocaleString()}` : "\nAmount due will be confirmed after selecting delivery.") : "") +
    (deliveryCounty ? `\nDestination: ${deliveryTown}, ${deliveryCounty}` : "") +
    (selectedDeliveryRoute?.serviceType === "parcel" ? `\nParcel office: ${selectedDeliveryRoute.carrier} - ${selectedDeliveryRoute.officeName}, ${selectedDeliveryRoute.officeAddress}` : !deliveryOptionSelected ? "\nPlease select an available delivery option before checkout." : "") +
    (address ? `\nDelivery notes: ${address}` : "") +
    `\n\nPlease confirm availability and delivery details. This message is an enquiry and does not place or reserve an order.`
  );

  return (
    <main className="min-h-screen bg-mall-900">
      <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
        <header className="mb-5 border-b border-cream/15 pb-5 sm:mb-7 sm:pb-6">
          <Link to="/cart" className="mb-4 inline-flex min-h-11 items-center gap-2 rounded text-sm text-cream/80 transition hover:text-mall-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent">
            <ArrowRight size={14} className="rotate-180" aria-hidden="true" /> Back to cart
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-1 font-mono-tag text-[10px] uppercase tracking-[0.16em] text-mall-orange">Azard Stores · Availability check</p>
              <h1 className="font-display text-3xl text-cream sm:text-4xl">Checkout</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream/85">Choose how your order should be delivered, then send it for an availability check.</p>
            </div>
          </div>
        </header>

        <nav aria-label="Checkout steps" className="mb-5 rounded-2xl border border-cream/15 bg-mall-800/70 p-2 sm:mb-7 sm:p-3">
          <ol className="grid grid-cols-3 gap-1 sm:gap-3">
            {[
              ["1", "Contact", "contact-heading"],
              ["2", "Delivery", "delivery-heading"],
              ["3", "Review & payment", "payment-heading"],
            ].map(([step, label, target], index) => (
              <li key={step} className="min-w-0">
                <a
                  href={`#${target}`}
                  aria-current={index === 0 ? "step" : undefined}
                  className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[10px] leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-orange sm:min-h-11 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                  index === 0 ? "bg-mall-orange text-mall-900 font-semibold" : "text-cream/80 hover:bg-cream/5"
                  }`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] sm:h-6 sm:w-6 sm:text-[11px] ${index === 0 ? "bg-mall-900/10" : "border border-cream/25"}`}>{step}</span>
                  <span className="min-w-0 text-center sm:text-left">{label}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div id="checkout-panel" className="checkout-panel grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(290px,360px)] lg:gap-8">
          <section aria-labelledby="order-summary-heading" className="checkout-summary min-w-0 rounded-2xl border border-cream/15 bg-mall-800 p-4 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24 sm:p-5">
            <details className="checkout-summary-details">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-orange lg:cursor-default">
                <span>
                  <span className="block font-mono-tag text-[10px] uppercase tracking-[0.16em] text-mall-orange">Order summary · {itemCount} {itemCount === 1 ? "item" : "items"}</span>
                  <h2 id="order-summary-heading" className="mt-1 font-display text-xl text-cream">Total <span className="ml-1 font-sans text-base font-semibold">{deliveryOptionSelected ? `KSh ${grandTotal.toLocaleString()}` : "To be calculated"}</span></h2>
                </span>
                <span className="checkout-summary-toggle text-xs font-medium text-mall-accent lg:hidden">View details</span>
              </summary>
              <div className="checkout-summary-content">
                <ul aria-label="Items in your order" className="mb-4 mt-4 max-h-56 space-y-3 overflow-y-auto border-y border-cream/10 py-4">
                  {items.map((item) => (
                    <li key={`${item.productId}::${item.variantId || ""}`} className="flex min-w-0 items-center gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-mall-700">
                        {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><ShoppingBag size={16} aria-hidden="true" /></div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-snug">{item.name}</p>
                        {item.variantName && <p className="mt-0.5 text-xs opacity-70">{item.variantName}</p>}
                      </div>
                      <span className="shrink-0 text-xs font-medium">×{item.quantity}</span>
                    </li>
                  ))}
                </ul>

            <div className="mb-5 space-y-2 border-b border-cream/10 pb-5">
              <div className="flex items-baseline justify-between">
                <span className="text-cream/70 text-sm">Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})</span>
                <span className="text-cream text-sm">KSh {totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-cream/75 text-sm">Delivery</span>
                <span className="text-cream text-sm">
                  {!destinationSelected ? "Choose destination" : !deliveryOptionSelected ? availableRoutes.length ? "Choose delivery option" : "Not available" : deliveryFee > 0 ? `KSh ${deliveryFee.toLocaleString()}` : cbdFreeDeliveryApplied ? "Free · threshold met" : "Free"}
                </span>
              </div>
              {isCbd && deliveryOptionSelected && freeCbdThreshold > 0 && <p className="text-right text-[11px] text-cream/75">{cbdFreeDeliveryApplied ? `Free CBD delivery applied to orders of KSh ${freeCbdThreshold.toLocaleString()} or more.` : `Free CBD delivery on orders of KSh ${freeCbdThreshold.toLocaleString()} or more.`}</p>}
              <div className="mt-3 flex items-end justify-between gap-3 rounded-xl border-l-2 border-mall-orange bg-mall-900/60 px-4 py-4">
                <span className="text-cream text-sm font-semibold">Total</span>
                <span className="font-display text-2xl sm:text-3xl text-cream leading-none">{deliveryOptionSelected ? `KSh ${grandTotal.toLocaleString()}` : <span className="text-sm font-sans text-cream/75">{destinationSelected ? "Select delivery option" : "Select destination"}</span>}</span>
              </div>
              {deliveryOptionSelected && <div className="mt-3 border-t border-cream/10 pt-3 space-y-2 text-sm"><div className="flex justify-between gap-3 text-cream/70"><span>Store balance to reserve</span><span className="text-cream">KSh {balanceApplied.toLocaleString()}</span></div><div className="flex justify-between gap-3 font-medium text-cream"><span>Remaining to pay</span><span>KSh {amountDue.toLocaleString()}</span></div></div>}
              {user && availableStoreBalance > 0 && destinationSelected && deliveryOptionSelected && <div className="mt-3 space-y-2 rounded-xl bg-mall-accent/5 p-3">
                <div className="flex items-center justify-between gap-3"><label htmlFor="store-balance-use" className="text-cream/85 text-sm">Use store balance</label><span className="text-cream/80 text-xs">Available KSh {availableStoreBalance.toLocaleString()}</span></div>
                <div className="flex items-center gap-2"><span className="text-cream/80 text-sm">KSh</span><input id="store-balance-use" type="number" min="0" max={Math.min(availableStoreBalance, grandTotal)} step="1" value={storeBalanceToUse} onChange={(event) => setStoreBalanceToUse(Math.min(Math.max(0, Number(event.target.value) || 0), availableStoreBalance, grandTotal))} className="min-h-11 min-w-0 flex-1 rounded-lg bg-mall-700 px-3 py-2 text-sm text-cream outline-none focus:ring-1 focus:ring-mall-accent"/><button type="button" onClick={() => setStoreBalanceToUse(Math.min(availableStoreBalance, grandTotal))} className="min-h-11 px-2 text-sm text-mall-accent">Use max</button></div>
                <p className="text-xs leading-relaxed text-cream/80">Applied after Azard confirms availability. Unused reserved balance returns if the order closes unpaid.</p>
              </div>}
            </div>
              </div>
            </details>
          </section>

          <div className="checkout-form min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">

            {!settingsLoading && !settings.emailDeliveryConfigured && (
              <p role="status" className="mb-5 rounded-lg border border-amber-300/15 bg-amber-300/5 px-3 py-2 text-xs leading-relaxed text-amber-100">
                Email delivery is not configured right now. Your order will still be recorded, and you can check its status on this site. Queued emails can be sent after email delivery is configured.
              </p>
            )}

            {/* Contact details */}
            {user ? (
              <section aria-labelledby="contact-heading" className="space-y-3 mb-7 pb-7 border-b border-cream/10">
                <div className="flex items-center gap-3 mb-4"><span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mall-orange/10 text-xs font-semibold text-mall-orange ring-4 ring-mall-900 shadow-[0_0_0_1px_rgba(255,105,0,0.45)]">1</span><div><h2 id="contact-heading" className="text-lg font-semibold text-cream">Contact details</h2><p className="text-sm text-cream/80">Order updates go to these details</p></div></div>
                <div className="border-b border-cream/10 px-0 py-2.5">
                  <p className="text-sm font-medium text-cream/80">Name</p>
                  <p className="mt-0.5 text-sm text-cream">{user.name}</p>
                </div>
                <div className="border-b border-cream/10 px-0 py-2.5">
                  <p className="text-sm font-medium text-cream/80">Order updates email</p>
                  <p className="mt-0.5 break-all text-sm text-cream">{user.email}</p>
                  {needsEmailVerification && <p className="mt-1 text-xs text-amber-200">Verify this email before submitting your order.</p>}
                </div>
                <label htmlFor="account-checkout-phone" className="block px-0 py-2.5">
                  <span className="block text-sm font-medium text-cream/85">Mobile number for order updates</span>
                  <span className="mt-1 flex items-center gap-2.5">
                    <Phone size={14} className="shrink-0 text-mall-accent/80" />
                  <input id="account-checkout-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={18} placeholder="0712 345 678" value={checkoutPhone} onChange={(event) => setCheckoutPhone(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded text-sm text-cream outline-none placeholder:text-cream/60 focus-visible:ring-1 focus-visible:ring-mall-orange" />
                  </span>
                  {needsPhoneVerification && <span role="status" className="mt-1 block text-xs font-medium text-amber-200">Verify this number before submitting your order.</span>}
                </label>
              </section>
            ) : (
              <section aria-labelledby="contact-heading" className="space-y-3 mb-7 pb-7 border-b border-cream/10">
                <div className="flex items-center gap-3 mb-4"><span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mall-orange/10 text-xs font-semibold text-mall-orange ring-4 ring-mall-900 shadow-[0_0_0_1px_rgba(255,105,0,0.45)]">1</span><div><h2 id="contact-heading" className="text-lg font-semibold text-cream">Contact details</h2><p className="text-sm text-cream/80">Order updates go to these details</p></div></div>
                <label htmlFor="guest-name" className="block">
                  <span className="mb-1 block text-sm font-medium text-cream/85">Full name</span>
                  <span className="flex items-center gap-2.5">
                    <User size={14} className="text-mall-accent/80 shrink-0" />
                    <input
                      id="guest-name"
                      type="text"
                      autoComplete="name"
                      maxLength={100}
                      placeholder="Your name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="min-h-11 min-w-0 flex-1 rounded text-sm text-cream outline-none placeholder-cream/60 focus-visible:ring-1 focus-visible:ring-mall-orange"
                    />
                  </span>
                </label>
                <label htmlFor="guest-phone" className="block">
                  <span className="mb-1 block text-sm font-medium text-cream/85">Phone number for order updates</span>
                  <span className="flex items-center gap-2.5">
                    <Phone size={14} className="text-mall-accent/80 shrink-0" />
                    <input
                      id="guest-phone"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={18}
                      placeholder="Phone number"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      className="min-h-11 min-w-0 flex-1 rounded text-sm text-cream outline-none placeholder-cream/60 focus-visible:ring-1 focus-visible:ring-mall-orange"
                    />
                  </span>
                </label>
                <label htmlFor="guest-email" className="block">
                  <span className="mb-1 block text-sm font-medium text-cream/85">Email address for order updates (required)</span>
                  <span className="flex items-center gap-2.5">
                    <Mail size={14} className="text-mall-accent/80 shrink-0" />
                    <input
                      id="guest-email"
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      placeholder="Email for order updates"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="min-h-11 min-w-0 flex-1 rounded text-sm text-cream outline-none placeholder-cream/60 focus-visible:ring-1 focus-visible:ring-mall-orange"
                    />
                  </span>
                </label>
              </section>
            )}

            {/* Delivery destination */}
            <section aria-labelledby="delivery-heading" className="mb-6 pb-6 border-b border-cream/10">
              <div className="flex items-center gap-3 mb-4"><span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mall-orange/10 text-xs font-semibold text-mall-orange ring-4 ring-mall-900 shadow-[0_0_0_1px_rgba(255,105,0,0.45)]">2</span><div><h2 id="delivery-heading" className="text-lg font-semibold text-cream">Delivery destination</h2><p className="text-sm text-cream/80">Choose where your order should go</p></div></div>
              <p className="mb-3 text-sm leading-relaxed text-cream/80">Delivery availability depends on your destination. Choose a county first to see supported towns and delivery options.</p>
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label htmlFor="delivery-county" className="block min-w-0">
                  <span className="mb-1.5 block text-sm font-medium text-cream/85">County</span>
                  <select id="delivery-county" value={deliveryCounty} onChange={(e) => { setDeliveryCounty(e.target.value); setDeliveryTown(""); setDeliveryRouteId(""); setCbdDeliveryConfirmed(false); }} className="min-h-11 w-full rounded-xl bg-mall-700 px-3 py-2.5 text-sm text-cream outline-none focus-visible:ring-2 focus-visible:ring-mall-accent">
                    <option value="">Choose county</option>
                    {counties.map((county) => <option key={county} value={county}>{county}</option>)}
                  </select>
                </label>
                <label htmlFor="delivery-town" className="block min-w-0">
                  <span className="mb-1.5 block text-sm font-medium text-cream/85">Town or area</span>
                  <select id="delivery-town" value={deliveryTown} disabled={!deliveryCounty} onChange={(e) => { setDeliveryTown(e.target.value); setDeliveryRouteId(""); setCbdDeliveryConfirmed(false); }} className="min-h-11 w-full rounded-xl bg-mall-700 px-3 py-2.5 text-sm text-cream outline-none focus-visible:ring-2 focus-visible:ring-mall-accent disabled:opacity-50">
                    <option value="">Choose town or area</option>
                    {isNairobi && <option value="Nairobi CBD">Nairobi CBD · Azard direct delivery</option>}
                    {towns.filter((town) => !(isNairobi && normalizeLocation(town) === "nairobi cbd")).map((town) => <option key={town} value={town}>{town}</option>)}
                  </select>
                </label>
              </div>
              {deliveryTown && (!isCbd || availableRoutes.length > 0) && (
                <div className="space-y-2 mb-2">
                  <label htmlFor="delivery-option" className="block">
                    <span className="mb-1.5 block text-sm font-medium text-cream/85">Delivery option</span>
                    <select id="delivery-option" value={deliveryRouteId} disabled={!availableRoutes.length} onChange={(e) => setDeliveryRouteId(e.target.value)} className="min-h-11 w-full rounded-xl bg-mall-700 px-3 py-2.5 text-sm text-cream outline-none focus-visible:ring-2 focus-visible:ring-mall-accent disabled:opacity-50">
                      {isCbdTown && <option value="">Nairobi CBD direct delivery · KSh {Number(settings.deliveryFee || 0).toLocaleString()}</option>}
                      {!isCbdTown && <option value="">Choose delivery option</option>}
                      {availableRoutes.map((route) => <option key={route._id} value={route._id}>{route.serviceType === "direct" ? "Azard direct delivery" : `${route.carrier} · ${route.officeName}`} · KSh {Number(route.fee).toLocaleString()}</option>)}
                    </select>
                  </label>
                  {selectedDeliveryRoute?.serviceType === "parcel" ? <p className="text-cream/80 text-xs leading-relaxed">Collect from {selectedDeliveryRoute.officeAddress}{selectedDeliveryRoute.estimatedDays ? ` - estimated ${selectedDeliveryRoute.estimatedDays} day${selectedDeliveryRoute.estimatedDays === 1 ? "" : "s"}` : ""}.</p> : selectedDeliveryRoute?.serviceType === "direct" ? <p className="text-cream/80 text-xs leading-relaxed">Azard Stores delivers to the address you enter below.</p> : isCbd ? <p className="text-cream/80 text-xs leading-relaxed">Azard Stores delivers to eligible addresses in Nairobi CBD.</p> : <p className="text-amber-200 text-xs leading-relaxed">{availableRoutes.length ? "Choose a configured delivery option to see its charge." : "No delivery option is configured for this area yet."}</p>}
                  {!settings.paymentMethods?.mpesa && !settings.paymentMethods?.paystack && <p className="text-amber-200 text-xs">Online payments are not enabled yet, so checkout outside Nairobi CBD is unavailable. Contact Azard Stores to arrange payment.</p>}
                </div>
              )}
              <p className="text-cream/80 text-xs leading-relaxed mb-3">{!deliveryCounty ? "Choose a county to see available destinations." : !deliveryTown ? `Choose a town or area in ${deliveryCounty}.` : isCbd ? "Nairobi CBD direct delivery is available for eligible addresses." : !availableRoutes.length ? "No delivery option is configured for this town yet." : !selectedDeliveryRoute ? "Choose an available delivery option to see its charge." : selectedDeliveryRoute.serviceType === "direct" ? "Enter the address for direct delivery." : "Your parcel will be collected from the selected office."}</p>
              {destinationSelected && deliveryOptionSelected && <label htmlFor="delivery-address" className="mb-2 block">
                <span className="mb-1.5 block text-sm font-medium text-cream/85">{addressRequired ? "Delivery address" : "Delivery instructions (optional)"}</span>
                {addressRequired && <span className="mb-1.5 block text-xs leading-relaxed text-cream/75">{isCbd ? "Enter the street or building in Nairobi CBD; Azard Stores will confirm address eligibility before accepting COD." : "Enter the street or building where Azard Stores should deliver."}</span>}
                <span className="flex items-start gap-2.5 rounded-xl bg-mall-700 px-3 py-2.5">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-cream/60" aria-hidden="true" />
                  <textarea
                    id="delivery-address"
                    placeholder={addressRequired ? "Street, building, or delivery address" : "Optional notes for the delivery team"}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    required={addressRequired}
                    className="min-h-11 min-w-0 flex-1 resize-y rounded bg-transparent text-sm text-cream outline-none placeholder:text-cream/50 focus-visible:ring-1 focus-visible:ring-mall-accent"
                  />
                </span>
              </label>}
              {user && <label className="mt-2 flex min-h-11 items-center gap-2 text-xs text-cream/80"><input type="checkbox" checked={saveAddressToAccount} onChange={(e) => setSaveAddressToAccount(e.target.checked)} className="accent-mall-accent"/>Save this destination to my account for next time</label>}
              {isCbd && <label className="mt-2 flex min-h-11 items-start gap-2 text-sm text-cream/80"><input type="checkbox" checked={cbdDeliveryConfirmed} onChange={(e) => setCbdDeliveryConfirmed(e.target.checked)} className="mt-1 accent-mall-accent" />I confirm this address is within Nairobi CBD. Azard Stores will verify the address before accepting COD.</label>}
            </section>

            <p className="mb-5 text-sm leading-relaxed text-cream/80">{paymentTimingCopy}</p>

            {/* Payment method */}
            <section aria-labelledby="payment-heading" className="mb-6">
              <div className="flex items-center gap-3 mb-4"><span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mall-orange/10 text-xs font-semibold text-mall-orange ring-4 ring-mall-900 shadow-[0_0_0_1px_rgba(255,105,0,0.45)]">3</span><div><h2 id="payment-heading" className="text-lg font-semibold text-cream">Review &amp; payment</h2><p className="text-sm text-cream/80">{storeBalanceCoversTotal ? "Covered by your Store Balance" : "Choose how to pay"}</p></div></div>
              <div className={`grid grid-cols-1 ${paymentGridColumns} gap-2`}>
                {storeBalanceCoversTotal ? (
                  <div role="status" className="sm:col-span-full flex min-h-11 items-center gap-2 rounded-xl border border-mall-accent/30 bg-mall-accent/10 px-3 py-2.5 text-sm text-mall-accent">
                    <Wallet size={15} /> Your Store Balance covers this order.
                  </div>
                ) : <>
                {isCbd && (
                <button
                  type="button"
                  aria-pressed={paymentMethod === "cod"}
                  onClick={() => setPaymentMethod("cod")}
                  className={`min-h-11 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-orange ${
                    paymentMethod === "cod" ? "bg-mall-orange text-mall-900 border-mall-orange font-semibold" : "border-cream/20 text-cream/90 hover:border-mall-orange/70"
                  }`}
                >
                  <Truck size={15} /> Cash on Delivery
                </button>
                )}
                {settings.paymentMethods?.mpesa && (
                  <button
                    type="button"
                    aria-pressed={paymentMethod === "mpesa"}
                    onClick={() => setPaymentMethod("mpesa")}
                    className={`min-h-11 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-orange ${
                      paymentMethod === "mpesa" ? "bg-mall-orange text-mall-900 border-mall-orange font-semibold" : "border-cream/20 text-cream/90 hover:border-mall-orange/70"
                    }`}
                  >
                    <Smartphone size={15} /> M-Pesa
                  </button>
                )}
                {settings.paymentMethods?.paystack && (
                  <button
                    type="button"
                    aria-pressed={paymentMethod === "paystack"}
                    onClick={() => setPaymentMethod("paystack")}
                    className={`min-h-11 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-orange ${
                      paymentMethod === "paystack" ? "bg-mall-orange text-mall-900 border-mall-orange font-semibold" : "border-cream/20 text-cream/90 hover:border-mall-orange/70"
                    }`}
                  >
                    <CreditCard size={15} /> Card
                  </button>
                )}
                </>}
              </div>
              {paymentMethod === "mpesa" && <p className="mt-2 text-xs leading-relaxed text-cream/80">After Azard confirms availability, choose Continue payment in your order. Paystack will send a request to your phone; approve it there. We mark the order paid only after Paystack confirms.</p>}
              {paymentMethod === "paystack" && <p className="mt-2 text-xs leading-relaxed text-cream/80">After Azard confirms availability, choose Continue payment in your order to open Paystack’s secure card checkout. We mark the order paid only after Paystack confirms.</p>}
            </section>

            {/* Verify account details here before placing an order. */}
            {blockedByVerification && checkoutAttempted && (
              <div className="bg-mall-accent/10 border border-mall-accent/20 rounded-xl p-4 mb-5 space-y-4">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert size={16} className="text-mall-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-mall-accent text-sm font-semibold">Verify to continue checkout</p>
                    <p className="text-cream/80 text-xs mt-1">Complete the required checks here. Your order will not be placed until verification is complete.</p>
                  </div>
                </div>

                {needsEmailVerification && (
                  <div className="rounded-xl bg-mall-800/70 p-3.5">
                    <div className="flex items-start gap-2.5 mb-3">
                      <Mail size={15} className="text-mall-accent shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-cream text-sm font-medium">Verify your email</p>
                        <p className="text-cream/75 text-xs mt-0.5 break-all">{user.email}</p>
                      </div>
                    </div>
                    {!emailCodeSent ? (
                      <button type="button" onClick={sendCheckoutEmailCode} disabled={emailCodeBusy} className="min-h-11 w-full flex items-center justify-center gap-2 rounded-lg bg-mall-accent px-3 py-2.5 text-xs font-semibold text-mall-900 disabled:opacity-50">
                        <Send size={13} /> {emailCodeBusy ? "Sending code..." : "Email me a verification code"}
                      </button>
                    ) : (
                      <div className="space-y-2.5">
                        <p className="text-cream/80 text-xs">Enter the 6-digit code. It expires in 10 minutes.</p>
                        <div className="flex gap-2">
                          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, ""))} placeholder="6-digit code" aria-label="Email verification code" className="min-h-11 min-w-0 flex-1 rounded-lg bg-mall-700 px-3 py-2.5 text-sm text-cream outline-none focus:ring-1 focus:ring-mall-accent" />
                          <button type="button" onClick={verifyCheckoutEmailCode} disabled={emailCodeBusy || emailCode.length !== 6} className="min-h-11 flex items-center justify-center gap-1.5 rounded-lg bg-mall-accent px-3 py-2.5 text-xs font-semibold text-mall-900 disabled:opacity-50">
                            <ShieldCheck size={13} /> {emailCodeBusy ? "Checking..." : "Verify"}
                          </button>
                        </div>
                        <button type="button" onClick={sendCheckoutEmailCode} disabled={emailCodeBusy} className="min-h-11 text-xs text-mall-accent/80 underline hover:text-mall-accent disabled:opacity-50">Send another code</button>
                      </div>
                    )}
                    {emailCodeMessage && <p role="status" className="text-emerald-300/80 text-xs mt-2">{emailCodeMessage}</p>}
                    {emailCodeError && <p role="alert" className="text-red-400 text-xs mt-2">{emailCodeError}</p>}
                  </div>
                )}

                {needsPhoneVerification && (
                  <div className="rounded-xl bg-mall-800/70 p-3.5">
                    <div className="flex items-start gap-2.5">
                      <Phone size={15} className="text-mall-accent shrink-0 mt-0.5" />
                      <div>
                        <p className="text-cream text-sm font-medium">Verify your phone</p>
                        <p className="text-cream/75 text-xs mt-0.5">{user.phone || "Add your phone number to your account to receive a code."}</p>
                      </div>
                    </div>
                    <VerificationCenter embedded open phone={checkoutPhone} onPhoneChange={setCheckoutPhone} />
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-red-400 text-xs mb-4 leading-relaxed">{error}</p>
            )}

                <p className="mb-2 text-center text-xs leading-relaxed text-cream/85">Submitting requests an availability confirmation. No external payment is taken now.</p>
                {/* Place order button */}
                <button
                  onClick={handleCheckout}
                  disabled={placing || (!paymentMethod && !storeBalanceCoversTotal) || (!isCbd && !selectedDeliveryRoute)}
                  className="w-full min-h-12 flex items-center justify-center gap-2 bg-mall-orange text-mall-900 font-semibold py-3.5 rounded-xl hover:bg-mall-orangeDark transition disabled:opacity-50 mb-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-mall-800 focus-visible:ring-mall-orange"
                >
                  {storeBalanceCoversTotal ? <Wallet size={15} /> : paymentMethod === "paystack" ? <CreditCard size={15} /> : paymentMethod === "mpesa" ? <Smartphone size={15} /> : <ShoppingBag size={15} />}
                  {placing ? "Submitting order..." : blockedByVerification ? "Verify details and continue" : "Submit for availability check"}
                </button>

                {/* WhatsApp order alternative */}
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMsg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-12 flex items-center justify-center gap-2 rounded-xl border border-cream/15 py-3.5 text-sm font-medium text-cream/80 transition hover:border-[#25D366]/50 hover:text-[#25D366] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.127 1.532 5.86L.057 23.857l6.174-1.448A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.001-1.366l-.36-.214-3.664.86.876-3.565-.233-.375A9.818 9.818 0 1112 21.818z"/>
                  </svg>
                  Ask about this cart on WhatsApp
                </a>


          </div>
        </div>
      </div>
    </main>
  );
}
