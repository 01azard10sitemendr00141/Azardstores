import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShoppingBag, Trash2, Plus, Minus, ArrowRight, Package, MapPin, User, Phone, Mail, ShieldAlert, Truck, Smartphone, CreditCard, Send, ShieldCheck, Wallet } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import api from "../api/client";
import VerificationCenter from "../components/VerificationCenter";
import { getCbdDeliveryFee, hasFreeCbdDelivery } from "../utils/deliveryPricing";

export default function Cart() {
  const { items, updateQuantity, updateItemSnapshot, removeItem, totalAmount, clearCart } = useCart();
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

  // Empty cart
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-mall-900 flex flex-col items-center justify-center px-4 text-center gap-4">
        <ShoppingBag size={48} className="text-cream/15" />
        <p className="font-display text-2xl text-cream/40">Your cart is empty</p>
        <p className="text-cream/30 text-sm">Add some products to get started.</p>
        <Link to="/directory" className="mt-2 inline-flex items-center gap-2 text-mall-accent hover:underline text-sm">
          Browse the mall <ArrowRight size={13} />
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mall-900">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-10">

        {/* Header */}
        <div className="mb-7 sm:mb-9 flex flex-wrap items-end justify-between gap-3 border-b border-cream/10 pb-5 sm:pb-6">
          <div>
            <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-1">Azard Stores · Order availability check</p>
            <h1 className="font-display text-3xl sm:text-4xl text-cream">Your Cart</h1>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-cream/65 text-sm">{itemCount} {itemCount === 1 ? "item" : "items"}</p>
            <a href="#checkout-panel" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-mall-accent transition hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent rounded">
              Continue to checkout <ArrowRight size={13} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(400px,0.95fr)] gap-6 lg:gap-10 items-start">

          {/* ── Cart items ───────────────────────────────────────── */}
          <div>
            <div className="rounded-2xl border border-cream/10 bg-mall-800/55 px-4 sm:px-6 divide-y divide-cream/10">
              {items.map((item) => (
                <div key={`${item.productId}::${item.variantId || ""}`} className="flex items-start gap-3 sm:gap-4 py-4 sm:py-5">
                  {/* Image */}
                  <div className="shrink-0 w-[68px] h-[68px] sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-mall-700 ring-1 ring-cream/10">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={20} className="text-cream/20" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-cream text-sm sm:text-base font-medium leading-tight mb-0.5 line-clamp-2">
                      {item.name}
                    </p>
                    {item.variantName && (
                      <p className="text-cream/65 text-sm mt-1">{item.variantName}</p>
                    )}
                    <p className="font-display text-mall-accent text-base sm:text-lg">
                      KSh {item.price.toLocaleString()}
                    </p>
                    <p className="text-cream/60 text-xs mt-1">
                      Subtotal: KSh {(item.price * item.quantity).toLocaleString()}
                    </p>
                  </div>

                  {/* Quantity + remove */}
                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateQuantity(item.productId, Math.max(1, item.quantity - 1), item.variantId)}
                        aria-label={`Decrease quantity of ${item.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/15 bg-mall-700/70 text-cream/70 transition hover:border-mall-accent hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center text-cream text-sm font-medium" aria-label={`Quantity ${item.quantity}`}>{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity + 1, item.variantId)}
                        disabled={item.stockUnconfirmed || item.quantity >= Math.min(99, Number.isFinite(Number(item.availableStock)) ? Number(item.availableStock) : 99)}
                        aria-label={`Increase quantity of ${item.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/15 bg-mall-700/70 text-cream/70 transition hover:border-mall-accent hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    {item.stockUnconfirmed && <p role="alert" className="max-w-28 text-right text-[10px] text-amber-200">Availability has not been confirmed. Contact Azard Stores before ordering.</p>}
                    {!item.stockUnconfirmed && item.availableStock != null && Number.isFinite(Number(item.availableStock)) && item.quantity > Number(item.availableStock) && <p role="alert" className="max-w-28 text-right text-[10px] text-amber-200">Your cart quantity exceeds the stock last shown. Reduce it before checkout.</p>}
                    <button
                      onClick={() => removeItem(item.productId, item.variantId)}
                      className="flex min-h-9 items-center gap-1 text-cream/45 hover:text-red-400 transition text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent rounded"
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Continue shopping */}
            <div className="pt-4">
              <Link to="/directory" className="min-h-10 text-cream/50 hover:text-mall-accent transition text-xs flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent rounded">
                ← Continue browsing the mall
              </Link>
            </div>
          </div>

          {/* ── Checkout panel ───────────────────────────────────── */}
          <div id="checkout-panel" className="min-w-0 space-y-4 sm:space-y-5">
          <section aria-labelledby="order-summary-heading" className="bg-mall-800 rounded-2xl p-4 sm:p-5 border border-cream/10 shadow-xl shadow-black/10">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div><p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest">Order summary</p><h2 id="order-summary-heading" className="mt-1 font-display text-xl text-cream">Your total</h2></div>
              <span className="text-sm text-cream/65">{itemCount} {itemCount === 1 ? "item" : "items"}</span>
            </div>

            {/* Order total */}
            <div className="mb-5 pb-5 border-b border-cream/10 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-cream/70 text-sm">Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})</span>
                <span className="text-cream text-sm">KSh {totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-cream/60 text-sm">Delivery</span>
                <span className="text-cream text-sm">
                  {!destinationSelected ? "Choose destination" : !deliveryOptionSelected ? availableRoutes.length ? "Choose delivery option" : "Not available" : deliveryFee > 0 ? `KSh ${deliveryFee.toLocaleString()}` : cbdFreeDeliveryApplied ? "Free · threshold met" : "Free"}
                </span>
              </div>
              {isCbd && deliveryOptionSelected && freeCbdThreshold > 0 && <p className="text-right text-[11px] text-cream/40">{cbdFreeDeliveryApplied ? `Free CBD delivery applied to orders of KSh ${freeCbdThreshold.toLocaleString()} or more.` : `Free CBD delivery on orders of KSh ${freeCbdThreshold.toLocaleString()} or more.`}</p>}
              <div className="flex items-end justify-between gap-3 mt-3 rounded-xl border-l-2 border-mall-orange bg-mall-900/60 px-4 py-4">
                <span className="text-cream text-sm font-semibold">Total</span>
                <span className="font-display text-2xl sm:text-3xl text-cream leading-none">{deliveryOptionSelected ? `KSh ${grandTotal.toLocaleString()}` : <span className="text-sm font-sans text-cream/45">{destinationSelected ? "Select delivery option" : "Select destination"}</span>}</span>
              </div>
              {deliveryOptionSelected && <div className="mt-3 border-t border-cream/10 pt-3 space-y-2 text-sm"><div className="flex justify-between gap-3 text-cream/70"><span>Store balance to reserve</span><span className="text-cream">KSh {balanceApplied.toLocaleString()}</span></div><div className="flex justify-between gap-3 font-medium text-cream"><span>Remaining to pay</span><span>KSh {amountDue.toLocaleString()}</span></div></div>}
              {user && availableStoreBalance > 0 && destinationSelected && deliveryOptionSelected && <div className="rounded-xl bg-mall-accent/5 p-3 mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3"><label htmlFor="store-balance-use" className="text-cream/75 text-sm">Use store balance</label><span className="text-cream/60 text-xs">Available KSh {availableStoreBalance.toLocaleString()}</span></div>
                <div className="flex items-center gap-2"><span className="text-cream/65 text-sm">KSh</span><input id="store-balance-use" type="number" min="0" max={Math.min(availableStoreBalance, grandTotal)} step="1" value={storeBalanceToUse} onChange={(event) => setStoreBalanceToUse(Math.min(Math.max(0, Number(event.target.value) || 0), availableStoreBalance, grandTotal))} className="min-w-0 flex-1 bg-mall-700 rounded-lg px-3 py-2 text-cream text-sm outline-none focus:ring-1 focus:ring-mall-accent"/><button type="button" onClick={() => setStoreBalanceToUse(Math.min(availableStoreBalance, grandTotal))} className="min-h-10 px-2 text-sm text-mall-accent">Use max</button></div>
                <p className="text-xs leading-relaxed text-cream/60">Applied after Azard confirms availability. Unused reserved balance returns if the order closes unpaid.</p>
              </div>}
            </div>
          </section>

          <div className="relative px-1 sm:px-2 py-2">
            <div aria-hidden="true" className="pointer-events-none absolute left-5 sm:left-6 top-12 bottom-44 w-px bg-gradient-to-b from-mall-accent/50 via-mall-accent/25 to-mall-orange/35" />

            {!settingsLoading && !settings.emailDeliveryConfigured && (
              <p role="status" className="mb-5 rounded-lg border border-amber-300/15 bg-amber-300/5 px-3 py-2 text-xs leading-relaxed text-amber-100">
                Email delivery is not configured right now. Your order will still be recorded, and you can check its status on this site. Queued emails can be sent after email delivery is configured.
              </p>
            )}

            {/* Contact details */}
            {user ? (
              <section aria-labelledby="contact-heading" className="space-y-3 mb-7 pb-7 border-b border-cream/10">
                <div className="flex items-center gap-3 mb-4"><span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mall-900 text-xs font-semibold text-mall-accent ring-4 ring-mall-900 shadow-[0_0_0_1px_rgba(93,173,255,0.5)]">1</span><div><h2 id="contact-heading" className="text-base font-semibold text-cream">Contact details</h2><p className="text-sm text-cream/65">Order updates go to these details</p></div></div>
                <div className="border-b border-cream/10 px-0 py-2.5">
                  <p className="text-xs uppercase tracking-wider text-cream/65">Name</p>
                  <p className="mt-0.5 text-sm text-cream">{user.name}</p>
                </div>
                <div className="border-b border-cream/10 px-0 py-2.5">
                  <p className="text-xs uppercase tracking-wider text-cream/65">Order updates email</p>
                  <p className="mt-0.5 break-all text-sm text-cream">{user.email}</p>
                  {needsEmailVerification && <p className="mt-1 text-xs text-amber-200">Verify this email before submitting your order.</p>}
                </div>
                <label className="block px-0 py-2.5">
                  <span className="block text-sm text-cream/75">Mobile number for order updates</span>
                  <span className="mt-1 flex items-center gap-2.5">
                    <Phone size={14} className="shrink-0 text-mall-accent/80" />
                  <input type="tel" autoComplete="tel" inputMode="tel" maxLength={18} placeholder="0712 345 678" value={checkoutPhone} onChange={(event) => setCheckoutPhone(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-cream outline-none placeholder:text-cream/25 focus-visible:ring-1 focus-visible:ring-mall-accent rounded" />
                  </span>
                  {needsPhoneVerification && <span className="mt-1 block text-xs text-amber-200">Verify this number before submitting your order.</span>}
                </label>
              </section>
            ) : (
              <section aria-labelledby="contact-heading" className="space-y-3 mb-7 pb-7 border-b border-cream/10">
                <div className="flex items-center gap-3 mb-4"><span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mall-900 text-xs font-semibold text-mall-accent ring-4 ring-mall-900 shadow-[0_0_0_1px_rgba(93,173,255,0.5)]">1</span><div><h2 id="contact-heading" className="text-base font-semibold text-cream">Contact details</h2><p className="text-sm text-cream/65">Order updates go to these details</p></div></div>
                <label htmlFor="guest-name" className="sr-only">Full name</label>
                <div className="flex items-center gap-2.5 border-b border-cream/15 px-0 py-3">
                  <User size={14} className="text-mall-accent/80 shrink-0" />
                  <input
                    id="guest-name"
                    type="text"
                    autoComplete="name"
                    maxLength={100}
                    placeholder="Your name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-cream placeholder-cream/25 text-sm outline-none focus-visible:ring-1 focus-visible:ring-mall-accent rounded"
                  />
                </div>
                <label htmlFor="guest-phone" className="sr-only">Phone number for order updates</label>
                <div className="flex items-center gap-2.5 border-b border-cream/15 px-0 py-3">
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
                    className="min-w-0 flex-1 bg-transparent text-cream placeholder-cream/25 text-sm outline-none focus-visible:ring-1 focus-visible:ring-mall-accent rounded"
                  />
                </div>
                <label htmlFor="guest-email" className="sr-only">Email address for order updates</label>
                <div className="flex items-center gap-2.5 border-b border-cream/15 px-0 py-3">
                  <Mail size={14} className="text-mall-accent/80 shrink-0" />
                  <input
                    id="guest-email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    placeholder="Email for order updates (required)"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-cream placeholder-cream/25 text-sm outline-none focus-visible:ring-1 focus-visible:ring-mall-accent rounded"
                  />
                </div>
              </section>
            )}

            {/* Delivery destination */}
            <section aria-labelledby="delivery-heading" className="mb-6 pb-6 border-b border-cream/10">
              <div className="flex items-center gap-3 mb-4"><span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mall-900 text-xs font-semibold text-mall-accent ring-4 ring-mall-900 shadow-[0_0_0_1px_rgba(93,173,255,0.5)]">2</span><div><h2 id="delivery-heading" className="text-base font-semibold text-cream">Delivery destination</h2><p className="text-sm text-cream/65">Choose where your order should go</p></div></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <select aria-label="Delivery county" value={deliveryCounty} onChange={(e) => { setDeliveryCounty(e.target.value); setDeliveryTown(""); setDeliveryRouteId(""); setCbdDeliveryConfirmed(false); }} className="min-h-11 w-full bg-mall-700 rounded-xl px-3 py-2.5 text-cream text-sm outline-none focus-visible:ring-2 focus-visible:ring-mall-accent">
                  <option value="">Choose county</option>
                  {counties.map((county) => <option key={county} value={county}>{county}</option>)}
                </select>
                <select aria-label="Delivery town or area" value={deliveryTown} disabled={!deliveryCounty} onChange={(e) => { setDeliveryTown(e.target.value); setDeliveryRouteId(""); setCbdDeliveryConfirmed(false); }} className="min-h-11 w-full bg-mall-700 rounded-xl px-3 py-2.5 text-cream text-sm outline-none focus-visible:ring-2 focus-visible:ring-mall-accent disabled:opacity-50">
                  <option value="">Choose town or area</option>
                  {isNairobi && <option value="Nairobi CBD">Nairobi CBD · Azard direct delivery</option>}
                  {towns.filter((town) => !(isNairobi && normalizeLocation(town) === "nairobi cbd")).map((town) => <option key={town} value={town}>{town}</option>)}
                </select>
              </div>
              {deliveryTown && (!isCbd || availableRoutes.length > 0) && (
                <div className="space-y-2 mb-2">
                  <select aria-label="Delivery option" value={deliveryRouteId} disabled={!availableRoutes.length} onChange={(e) => setDeliveryRouteId(e.target.value)} className="min-h-11 w-full bg-mall-700 rounded-xl px-3 py-2.5 text-cream text-sm outline-none focus-visible:ring-2 focus-visible:ring-mall-accent disabled:opacity-50">
                    {isCbdTown && <option value="">Nairobi CBD direct delivery · KSh {Number(settings.deliveryFee || 0).toLocaleString()}</option>}
                    {!isCbdTown && <option value="">Choose delivery option</option>}
                    {availableRoutes.map((route) => <option key={route._id} value={route._id}>{route.serviceType === "direct" ? "Azard direct delivery" : `${route.carrier} · ${route.officeName}`} · KSh {Number(route.fee).toLocaleString()}</option>)}
                  </select>
                  {selectedDeliveryRoute?.serviceType === "parcel" ? <p className="text-cream/70 text-xs leading-relaxed">Collect from {selectedDeliveryRoute.officeAddress}{selectedDeliveryRoute.estimatedDays ? ` - estimated ${selectedDeliveryRoute.estimatedDays} day${selectedDeliveryRoute.estimatedDays === 1 ? "" : "s"}` : ""}.</p> : selectedDeliveryRoute?.serviceType === "direct" ? <p className="text-cream/70 text-xs leading-relaxed">Azard Stores delivers to the address you enter below.</p> : isCbd ? <p className="text-cream/70 text-xs leading-relaxed">Azard Stores delivers to eligible addresses in Nairobi CBD.</p> : <p className="text-amber-200 text-xs leading-relaxed">{availableRoutes.length ? "Choose a configured delivery option to see its charge." : "No delivery option is configured for this area yet."}</p>}
                  {!settings.paymentMethods?.mpesa && !settings.paymentMethods?.paystack && <p className="text-amber-200 text-xs">Online payments are not enabled yet, so checkout outside Nairobi CBD is unavailable. Contact Azard Stores to arrange payment.</p>}
                </div>
              )}
              <p className="text-cream/65 text-xs leading-relaxed mb-3">{!deliveryCounty ? "Choose a county to see available destinations." : !deliveryTown ? `Choose a town or area in ${deliveryCounty}.` : isCbd ? "Nairobi CBD direct delivery is available for eligible addresses." : !availableRoutes.length ? "No delivery option is configured for this town yet." : !selectedDeliveryRoute ? "Choose an available delivery option to see its charge." : selectedDeliveryRoute.serviceType === "direct" ? "Enter the address for direct delivery." : "Your parcel will be collected from the selected office."}</p>
              <div className="flex items-start gap-2.5 bg-mall-700 rounded-xl px-3 py-2.5">
                <MapPin size={14} className="text-cream/30 shrink-0 mt-0.5" />
                <textarea
                  placeholder={addressRequired ? "Street, building, or delivery address" : "Optional notes for Azard Stores"}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  aria-label={addressRequired ? "Street, building, or delivery address" : "Optional delivery notes"}
                  className="min-w-0 flex-1 bg-transparent text-cream placeholder-cream/25 text-sm outline-none resize-none focus-visible:ring-1 focus-visible:ring-mall-accent rounded"
                />
              </div>
              {user && <label className="mt-2 flex min-h-10 items-center gap-2 text-xs text-cream/70"><input type="checkbox" checked={saveAddressToAccount} onChange={(e) => setSaveAddressToAccount(e.target.checked)} className="accent-mall-accent"/>Save this destination to my account for next time</label>}
              {isCbd && <label className="mt-2 flex items-start gap-2 text-sm text-cream/70"><input type="checkbox" checked={cbdDeliveryConfirmed} onChange={(e) => setCbdDeliveryConfirmed(e.target.checked)} className="mt-0.5 accent-mall-accent" />I confirm this address is within Nairobi CBD. Azard Stores will verify the address before accepting COD.</label>}
            </section>

            <p className="mb-5 text-sm leading-relaxed text-cream/70">{paymentTimingCopy}</p>

            {/* Payment method */}
            <section aria-labelledby="payment-heading" className="mb-6">
              <div className="flex items-center gap-3 mb-4"><span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mall-900 text-xs font-semibold text-mall-accent ring-4 ring-mall-900 shadow-[0_0_0_1px_rgba(93,173,255,0.5)]">3</span><div><h2 id="payment-heading" className="text-base font-semibold text-cream">Payment method</h2><p className="text-sm text-cream/65">{storeBalanceCoversTotal ? "Covered by your Store Balance" : "Choose how to pay"}</p></div></div>
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
                  className={`min-h-11 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent ${
                    paymentMethod === "cod" ? "bg-mall-accent text-mall-900 border-mall-accent font-semibold" : "border-cream/15 text-cream/60 hover:border-cream/30"
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
                    className={`min-h-11 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent ${
                      paymentMethod === "mpesa" ? "bg-mall-accent text-mall-900 border-mall-accent font-semibold" : "border-cream/15 text-cream/60 hover:border-cream/30"
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
                    className={`min-h-11 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent ${
                      paymentMethod === "paystack" ? "bg-mall-accent text-mall-900 border-mall-accent font-semibold" : "border-cream/15 text-cream/60 hover:border-cream/30"
                    }`}
                  >
                    <CreditCard size={15} /> Card
                  </button>
                )}
                </>}
              </div>
              {paymentMethod === "mpesa" && <p className="mt-2 text-xs leading-relaxed text-cream/50">After Azard confirms availability, choose Continue payment in your order. Paystack will send a request to your phone; approve it there. We mark the order paid only after Paystack confirms.</p>}
              {paymentMethod === "paystack" && <p className="mt-2 text-xs leading-relaxed text-cream/50">After Azard confirms availability, choose Continue payment in your order to open Paystack’s secure card checkout. We mark the order paid only after Paystack confirms.</p>}
            </section>

            {/* Verify account details here before placing an order. */}
            {blockedByVerification && checkoutAttempted && (
              <div className="bg-mall-accent/10 border border-mall-accent/20 rounded-xl p-4 mb-5 space-y-4">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert size={16} className="text-mall-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-mall-accent text-sm font-semibold">Verify to continue checkout</p>
                    <p className="text-cream/50 text-xs mt-1">Complete the required checks here. Your order will not be placed until verification is complete.</p>
                  </div>
                </div>

                {needsEmailVerification && (
                  <div className="rounded-xl bg-mall-800/70 p-3.5">
                    <div className="flex items-start gap-2.5 mb-3">
                      <Mail size={15} className="text-mall-accent shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-cream text-sm font-medium">Verify your email</p>
                        <p className="text-cream/45 text-xs mt-0.5 break-all">{user.email}</p>
                      </div>
                    </div>
                    {!emailCodeSent ? (
                      <button type="button" onClick={sendCheckoutEmailCode} disabled={emailCodeBusy} className="w-full flex items-center justify-center gap-2 rounded-lg bg-mall-accent text-mall-900 px-3 py-2.5 text-xs font-semibold disabled:opacity-50">
                        <Send size={13} /> {emailCodeBusy ? "Sending code..." : "Email me a verification code"}
                      </button>
                    ) : (
                      <div className="space-y-2.5">
                        <p className="text-cream/50 text-xs">Enter the 6-digit code. It expires in 10 minutes.</p>
                        <div className="flex gap-2">
                          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, ""))} placeholder="6-digit code" aria-label="Email verification code" className="min-w-0 flex-1 bg-mall-700 rounded-lg px-3 py-2.5 text-cream placeholder-cream/25 text-sm outline-none focus:ring-1 focus:ring-mall-accent" />
                          <button type="button" onClick={verifyCheckoutEmailCode} disabled={emailCodeBusy || emailCode.length !== 6} className="flex items-center justify-center gap-1.5 rounded-lg bg-mall-accent text-mall-900 px-3 py-2.5 text-xs font-semibold disabled:opacity-50">
                            <ShieldCheck size={13} /> {emailCodeBusy ? "Checking..." : "Verify"}
                          </button>
                        </div>
                        <button type="button" onClick={sendCheckoutEmailCode} disabled={emailCodeBusy} className="text-mall-accent/80 hover:text-mall-accent text-xs underline disabled:opacity-50">Send another code</button>
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
                        <p className="text-cream/45 text-xs mt-0.5">{user.phone || "Add your phone number to your account to receive a code."}</p>
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

                {/* Place order button */}
                <button
                  onClick={handleCheckout}
                  disabled={placing || (!paymentMethod && !storeBalanceCoversTotal) || (!isCbd && !selectedDeliveryRoute)}
                  className="w-full min-h-12 flex items-center justify-center gap-2 bg-mall-accent text-mall-900 font-semibold py-3.5 rounded-xl hover:bg-mall-accentDark transition disabled:opacity-50 mb-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-mall-800 focus-visible:ring-cream"
                >
                  {storeBalanceCoversTotal ? <Wallet size={15} /> : paymentMethod === "paystack" ? <CreditCard size={15} /> : paymentMethod === "mpesa" ? <Smartphone size={15} /> : <ShoppingBag size={15} />}
                  {placing ? "Submitting order..." : blockedByVerification ? "Verify details and continue" : "Submit for availability check"}
                </button>

                {/* WhatsApp order alternative */}
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMsg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-12 flex items-center justify-center gap-2 bg-[#25D366]/10 text-[#46e27e] font-semibold py-3.5 rounded-xl hover:bg-[#25D366] hover:text-white transition text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.127 1.532 5.86L.057 23.857l6.174-1.448A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.001-1.366l-.36-.214-3.664.86.876-3.565-.233-.375A9.818 9.818 0 1112 21.818z"/>
                  </svg>
                  Ask about this cart
                </a>


          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
