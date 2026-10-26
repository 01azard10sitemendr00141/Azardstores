import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import api from "../api/client";
import { getCbdDeliveryFee, hasFreeCbdDelivery } from "../utils/deliveryPricing";

export default function AdminReplacementOrderForm({ order, onCreated }) {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState(() => {
    const unavailable = new Set(order.availabilityIssue?.itemIndexes || []);
    return (order.items || []).flatMap((item, index) => {
      if (unavailable.has(index) || !item.product) return [];
      const productId = String(item.product._id || item.product);
      const variantId = item.variantId ? String(item.variantId) : "";
      return [{ key: `${productId}:${variantId || "base"}`, productId, variantId, name: item.name, variantName: item.variantName || "", price: item.price, quantity: item.quantity, stock: 99 }];
    });
  });
  const [deliveryChoice, setDeliveryChoice] = useState("keep");
  const [useStoreBalance, setUseStoreBalance] = useState(false);
  const [address, setAddress] = useState(order.deliveryArea === "nairobi-cbd" || order.deliveryRoute?.serviceType === "direct" ? order.deliveryCorrection?.address || order.deliveryAddress || "" : "");
  const [instructions, setInstructions] = useState(order.deliveryInstructions || "");
  const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod || "");
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdOrder, setCreatedOrder] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    setSettingsLoading(true);
    setSettingsError("");
    api.get("/settings")
      .then((response) => { if (active) setSettings(response.data); })
      .catch(() => { if (active) setSettingsError("Delivery and payment options could not be loaded."); })
      .finally(() => { if (active) setSettingsLoading(false); });
    return () => { active = false; };
  }, [settingsAttempt]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      api.get("/products", { params: { limit: 100, sort: "name", order: "asc", ...(search.trim() ? { search: search.trim() } : {}) } })
        .then((response) => { if (active) setProducts(response.data.products || []); })
        .catch(() => { if (active) setError("Replacement products could not be loaded."); })
        .finally(() => { if (active) setLoading(false); });
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);

  const selectedProduct = products.find((product) => product._id === productId);
  const selectedVariant = selectedProduct?.variants?.find((variant) => variant._id === variantId);
  const routes = (settings?.deliveryRoutes || []).filter((route) => route.active !== false);
  const chosenRoute = routes.find((route) => route._id === deliveryChoice);
  const keepsCbd = deliveryChoice === "keep" && order.deliveryArea === "nairobi-cbd";
  const isCbd = deliveryChoice === "nairobi-cbd" || keepsCbd;
  const isDirect = isCbd || chosenRoute?.serviceType === "direct";
  const availablePaymentMethods = useMemo(() => [
    ...(isCbd ? ["cod"] : []),
    ...(settings?.paymentMethods?.mpesa ? ["mpesa"] : []),
    ...(settings?.paymentMethods?.paystack ? ["paystack"] : []),
  ], [isCbd, settings]);
  useEffect(() => {
    if (!settings) return;
    if (!availablePaymentMethods.includes(paymentMethod)) setPaymentMethod(availablePaymentMethods[0] || "");
  }, [availablePaymentMethods, paymentMethod]);

  function addItem() {
    if (!selectedProduct) return;
    if (selectedProduct.variants?.length && !selectedVariant) { setError("Choose an item option before adding it."); return; }
    const stock = selectedVariant ? selectedVariant.stock : selectedProduct.stock;
    if (Number(quantity) < 1 || Number(quantity) > stock) { setError(`Choose a quantity from 1 to ${stock}.`); return; }
    const key = `${selectedProduct._id}:${selectedVariant?._id || "base"}`;
    const alreadyAdded = items.find((item) => item.key === key)?.quantity || 0;
    if (alreadyAdded + Number(quantity) > stock) { setError(`Only ${stock} of this product option are currently available.`); return; }
    setItems((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) return current.map((item) => item.key === key ? { ...item, quantity: item.quantity + Number(quantity) } : item);
      return [...current, { key, productId: selectedProduct._id, variantId: selectedVariant?._id || "", name: selectedProduct.name, variantName: selectedVariant?.name || "", price: selectedVariant?.price ?? selectedProduct.price, quantity: Number(quantity), stock }];
    });
    setError("");
    setQuantity(1);
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const freeCbdThreshold = Math.max(0, Number(settings?.freeDeliveryThreshold) || 0);
  const cbdFreeDeliveryApplied = deliveryChoice !== "keep" && isCbd && hasFreeCbdDelivery(subtotal, freeCbdThreshold);
  const deliveryFee = deliveryChoice === "keep" ? Number(order.deliveryFee || 0) : isCbd ? getCbdDeliveryFee(subtotal, settings) : Number(chosenRoute?.fee || 0);
  const total = subtotal + deliveryFee;
  const availableBalance = Math.max(0, Number(order.user?.storeBalance || 0));
  const storeBalanceAmount = useStoreBalance ? Math.min(availableBalance, total) : 0;
  const amountDue = Math.max(0, total - storeBalanceAmount);
  const balanceCoversTotal = total > 0 && amountDue === 0;

  async function createReplacement() {
    setError("");
    if (!settings || settingsLoading || settingsError) { setError("Load delivery and payment options before creating this replacement."); return; }
    if (!items.length) { setError("Add at least one replacement item."); return; }
    if (deliveryChoice !== "keep" && isDirect && address.trim().length < 8) { setError("Enter a complete delivery address."); return; }
    if (!paymentMethod && !balanceCoversTotal) { setError("There is no configured payment method for this destination."); return; }
    if (!confirming) { setConfirming(true); return; }
    setSaving(true);
    try {
      const response = await api.post(`/orders/${order._id}/replacement-order`, {
        items: items.map((item) => ({ productId: item.productId, variantId: item.variantId || undefined, quantity: item.quantity })),
        delivery: deliveryChoice === "keep" ? { keepCurrent: true } : { keepCurrent: false, routeId: deliveryChoice, address: address.trim(), instructions: instructions.trim() },
        paymentMethod: balanceCoversTotal ? "store_balance" : paymentMethod,
        storeBalanceAmount,
      });
      setCreatedOrder(response.data.replacementOrder);
      onCreated?.(response.data.originalOrder);
    } catch (err) {
      setError(err.response?.data?.message || "Could not create the replacement order.");
    } finally {
      setSaving(false);
    }
  }

  if (createdOrder) return <div className="mt-3 rounded-lg bg-emerald-400/10 p-3 text-xs text-emerald-100"><p className="font-semibold">Replacement order #{createdOrder._id.slice(-6).toUpperCase()} created</p><p className="mt-1">New total: KSh {Number(createdOrder.totalAmount).toLocaleString()} · difference from original: {Number(createdOrder.replacementPriceDifference) > 0 ? "+" : ""}KSh {Number(createdOrder.replacementPriceDifference).toLocaleString()}</p>{Number(createdOrder.storeBalanceApplied) > 0 && <p className="mt-1">Store Balance reserved: KSh {Number(createdOrder.storeBalanceApplied).toLocaleString()} · remaining after availability: KSh {Math.max(0, Number(createdOrder.totalAmount) - Number(createdOrder.storeBalanceApplied)).toLocaleString()}</p>}<p className="mt-1 text-emerald-100/65">It is awaiting availability confirmation. Stock is not reserved and no external payment is due yet.</p></div>;

  return (
    <div className="mt-3 rounded-xl border border-cream/10 bg-mall-900/40 p-3 space-y-3">
      <div><p className="text-xs font-semibold text-cream">Build replacement order</p><p className="mt-1 text-[11px] text-cream/40">Available original items are included automatically. Add the replacement item(s) for unavailable lines. Catalog prices and stock are checked again by the server, and the customer sees the final total before payment.</p></div>
      {settingsLoading && <p role="status" className="text-[11px] text-cream/45">Loading delivery and payment options…</p>}
      {settingsError && <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-red-400/20 bg-red-400/5 p-2.5 text-[11px] text-red-200"><span>{settingsError}</span><button type="button" onClick={() => setSettingsAttempt((attempt) => attempt + 1)} className="shrink-0 text-mall-accent">Retry</button></div>}
      <label className="relative block"><Search size={13} className="absolute left-3 top-3 text-cream/30" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search active products" className="w-full rounded-lg bg-mall-800 py-2.5 pl-9 pr-3 text-xs text-cream outline-none" /></label>
      <div className="grid sm:grid-cols-[1fr_1fr_80px_auto] gap-2">
        <select value={productId} onChange={(event) => { setProductId(event.target.value); setVariantId(""); setError(""); }} className="min-w-0 rounded-lg bg-mall-800 px-2.5 py-2 text-xs text-cream"><option value="">{loading ? "Loading products..." : "Choose product"}</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} · KSh {Number(product.price).toLocaleString()} · stock {product.stock}</option>)}</select>
        <select value={variantId} onChange={(event) => setVariantId(event.target.value)} disabled={!selectedProduct?.variants?.length} className="min-w-0 rounded-lg bg-mall-800 px-2.5 py-2 text-xs text-cream disabled:opacity-40"><option value="">{selectedProduct?.variants?.length ? "Choose option" : "No options"}</option>{selectedProduct?.variants?.map((variant) => <option key={variant._id} value={variant._id}>{variant.name} · KSh {Number(variant.price ?? selectedProduct.price).toLocaleString()} · stock {variant.stock}</option>)}</select>
        <input type="number" min="1" max={selectedVariant?.stock ?? selectedProduct?.stock ?? 99} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="rounded-lg bg-mall-800 px-2 py-2 text-xs text-cream" aria-label="Replacement quantity" />
        <button type="button" onClick={addItem} disabled={!selectedProduct} className="inline-flex items-center justify-center gap-1 rounded-lg border border-mall-accent/30 px-3 py-2 text-xs text-mall-accent disabled:opacity-40"><Plus size={13} /> Add item</button>
      </div>
      {items.map((item) => <div key={item.key} className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 text-cream/70">{item.name}{item.variantName ? ` · ${item.variantName}` : ""} × {item.quantity}</span><span className="text-cream/50">KSh {(item.price * item.quantity).toLocaleString()}</span><button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))} aria-label={`Remove ${item.name}`} className="text-red-300"><Trash2 size={13} /></button></div>)}
      <div className="space-y-2 border-t border-cream/10 pt-3">
        <label className="block text-[10px] uppercase tracking-wide text-cream/40">Delivery</label>
        <select value={deliveryChoice} onChange={(event) => { setDeliveryChoice(event.target.value); setAddress(""); if (event.target.value === "nairobi-cbd") setPaymentMethod("cod"); }} className="w-full rounded-lg bg-mall-800 px-2.5 py-2 text-xs text-cream"><option value="keep">Keep original destination and charge · KSh {Number(order.deliveryFee || 0).toLocaleString()}</option><option value="nairobi-cbd">Nairobi CBD · direct delivery</option>{routes.map((route) => <option key={route._id} value={route._id}>{route.county} · {route.town} · {route.serviceType === "direct" ? "Direct delivery" : `${route.carrier} / ${route.officeName}`} · KSh {Number(route.fee).toLocaleString()}</option>)}</select>
        {deliveryChoice !== "keep" && isDirect && <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, building, or delivery address" className="w-full rounded-lg bg-mall-800 px-3 py-2.5 text-xs text-cream outline-none" />}
        {deliveryChoice !== "keep" && <input value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Delivery notes (optional)" className="w-full rounded-lg bg-mall-800 px-3 py-2.5 text-xs text-cream outline-none" />}
        {availableBalance > 0 && order.user && <label className="flex items-start gap-2 rounded-lg border border-cream/10 bg-mall-800/60 p-2.5 text-xs"><input type="checkbox" checked={useStoreBalance} onChange={(event) => setUseStoreBalance(event.target.checked)} className="mt-0.5 accent-emerald-400" /><span><span className="block text-cream/85">Apply available Store Balance · KSh {availableBalance.toLocaleString()}</span><span className="mt-1 block text-[11px] text-cream/45">Select only with the customer’s agreement. The amount is reserved now, used only after availability is confirmed, and returned if this replacement is cancelled or unavailable.</span></span></label>}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><label className="text-cream/45">{balanceCoversTotal ? "Payment method" : "Remaining payment method"}</label>{balanceCoversTotal ? <span className="rounded-lg bg-emerald-300/10 px-2.5 py-2 text-emerald-100">Store Balance covers full total</span> : <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={!availablePaymentMethods.length} className="rounded-lg bg-mall-800 px-2.5 py-2 text-xs text-cream disabled:opacity-50">{availablePaymentMethods.map((method) => <option key={method} value={method}>{method === "cod" ? "Cash on delivery" : method === "mpesa" ? "M-Pesa" : "Card"}</option>)}</select>}</div>
        {storeBalanceAmount > 0 && <div className="space-y-1 text-xs"><p className="flex justify-between text-cream/55"><span>Store Balance reserved</span><span>KSh {storeBalanceAmount.toLocaleString()}</span></p><p className="flex justify-between font-semibold text-cream"><span>Due after availability confirmation</span><span>KSh {amountDue.toLocaleString()}</span></p></div>}
        {cbdFreeDeliveryApplied && <p className="text-[11px] text-emerald-200/75">Free Nairobi CBD delivery applied at KSh {freeCbdThreshold.toLocaleString()} or more.</p>}
        <div className="flex justify-between text-xs"><span className="text-cream/45">New total · original KSh {Number(order.totalAmount || 0).toLocaleString()}</span><span className="font-semibold text-cream">KSh {total.toLocaleString()} <span className={total - Number(order.totalAmount || 0) > 0 ? "text-amber-200" : "text-emerald-200"}>({total - Number(order.totalAmount || 0) > 0 ? "+" : ""}{(total - Number(order.totalAmount || 0)).toLocaleString()})</span></span></div>
      </div>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {confirming && <div className="rounded-lg border border-amber-300/15 bg-amber-300/5 p-3 text-xs text-amber-100/80"><p className="font-semibold">Review before creating</p><p className="mt-1">New total: KSh {total.toLocaleString()} · original: KSh {Number(order.totalAmount || 0).toLocaleString()}</p>{storeBalanceAmount > 0 && <p className="mt-1">Store Balance reserved: KSh {storeBalanceAmount.toLocaleString()} · due after availability: KSh {amountDue.toLocaleString()}</p>}<p className="mt-1">No external payment is due until the replacement’s availability is confirmed.</p></div>}
      <div className="flex gap-2">{confirming && <button type="button" onClick={() => setConfirming(false)} disabled={saving} className="flex-1 rounded-lg border border-cream/15 px-3 py-2.5 text-xs text-cream/70 disabled:opacity-50">Edit details</button>}<button type="button" onClick={createReplacement} disabled={saving || settingsLoading || Boolean(settingsError) || !settings || !items.length || (!paymentMethod && !balanceCoversTotal)} className="flex-1 rounded-lg bg-mall-accent px-3 py-2.5 text-xs font-semibold text-mall-900 disabled:opacity-50">{saving ? "Creating replacement order..." : confirming ? "Confirm and create" : "Review replacement"}</button></div>
    </div>
  );
}
