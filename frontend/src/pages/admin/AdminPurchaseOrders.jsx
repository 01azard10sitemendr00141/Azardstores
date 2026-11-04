import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus, Search, Trash2, Truck, X } from "lucide-react";
import api from "../../api/client";
import AdminLoadError from "../../components/AdminLoadError";
import AdminPagination from "../../components/AdminPagination";

const EMPTY_LINE = () => ({ key: crypto.randomUUID(), selection: "", quantityOrdered: "1", unitCost: "0" });

function purchaseOrderStatus(status) {
  return ({
    ordered: "Ordered",
    partially_received: "Partially received",
    received: "Received",
    cancelled: "Cancelled",
  })[status] || status;
}

function getProductChoices(products) {
  return products.flatMap((product) => product.variants?.length
    ? product.variants.map((variant) => ({
      value: `${product._id}:${variant._id}`,
      productId: product._id,
      productShopId: product.shop?._id || product.shop,
      variantId: variant._id,
      label: `${product.name} · ${variant.name || "Unnamed option"}${variant.sku ? ` · ${variant.sku}` : ""}`,
    }))
    : [{
      value: `${product._id}:`,
      productId: product._id,
      productShopId: product.shop?._id || product.shop,
      variantId: "",
      label: `${product.name}${product.sku ? ` · ${product.sku}` : ""}`,
    }]
  );
}

function PurchaseOrderForm({ products, shops, onClose, onCreated }) {
  const [productCache, setProductCache] = useState(products);
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([EMPTY_LINE()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setProductCache((current) => {
      const byId = new Map(current.map((product) => [String(product._id), product]));
      products.forEach((product) => byId.set(String(product._id), product));
      return [...byId.values()];
    });
  }, [products]);
  const choices = useMemo(() => getProductChoices(productCache), [productCache]);

  function updateLine(key, field, value) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const items = lines.map((line) => {
      const selected = choices.find((choice) => choice.value === line.selection);
      return selected ? {
        productId: selected.productId,
        variantId: selected.variantId || null,
        shopId: line.shopId || selected.productShopId,
        quantityOrdered: Number(line.quantityOrdered),
        unitCost: Number(line.unitCost),
      } : null;
    });
    if (items.some((item) => !item)) return setError("Choose a product or option for each purchase-order line.");
    setSaving(true);
    try {
      const response = await api.post("/purchase-orders", {
        supplierName,
        supplierContact,
        expectedAt: expectedAt || null,
        note,
        items,
      });
      await onCreated(response.data);
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not create the purchase order.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={submit} className="mb-6 rounded-2xl border border-cream/10 bg-mall-800/50 p-4 sm:p-5">
    <div className="mb-4 flex items-center justify-between gap-3"><div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">New order</p><h2 className="font-display text-xl text-cream">Supplier details</h2></div><button type="button" onClick={onClose} aria-label="Close form" className="rounded-lg p-2 text-cream/50 hover:bg-cream/5"><X size={16}/></button></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-cream/60">Supplier name<input required maxLength={160} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream outline-none focus:border-mall-accent"/></label>
      <label className="text-xs text-cream/60">Supplier contact <span className="text-cream/30">(optional)</span><input maxLength={200} value={supplierContact} onChange={(event) => setSupplierContact(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream outline-none focus:border-mall-accent"/></label>
      <label className="text-xs text-cream/60">Expected delivery <span className="text-cream/30">(optional)</span><input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream outline-none focus:border-mall-accent"/></label>
      <label className="text-xs text-cream/60">Order note <span className="text-cream/30">(optional)</span><input maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream outline-none focus:border-mall-accent"/></label>
    </div>
    <div className="mt-5 flex items-center justify-between"><h3 className="text-sm font-semibold text-cream">Items</h3><button type="button" onClick={() => setLines((current) => [...current, EMPTY_LINE()])} disabled={lines.length >= 100} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-cream/15 px-3 text-xs text-cream/70 disabled:opacity-40"><Plus size={13}/> Add item</button></div>
    <div className="mt-3 space-y-3">
      {lines.map((line, index) => <div key={line.key} className="grid gap-2 rounded-xl border border-cream/8 bg-mall-900/60 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_100px_130px_40px] sm:items-end">
        <label className="text-[11px] text-cream/50">Product / option<select required value={line.selection} onChange={(event) => {
          const selection = event.target.value;
          const choice = choices.find((entry) => entry.value === selection);
          setLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, selection, shopId: choice?.productShopId || "" } : entry));
        }} className="mt-1 block min-h-10 w-full rounded-lg border border-cream/10 bg-mall-800 px-2 text-xs text-cream"><option value="">Select catalog item</option>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
        <label className="text-[11px] text-cream/50">Receive into<select required value={line.shopId || ""} onChange={(event) => updateLine(line.key, "shopId", event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-cream/10 bg-mall-800 px-2 text-xs text-cream"><option value="">Select shop</option>{shops.map((shop) => <option key={shop._id} value={shop._id}>{shop.name}{shop.shopNumber ? ` · #${shop.shopNumber}` : ""}</option>)}</select></label>
        <label className="text-[11px] text-cream/50">Order qty<input type="number" min="1" max="1000000" step="1" required value={line.quantityOrdered} onChange={(event) => updateLine(line.key, "quantityOrdered", event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-cream/10 bg-mall-800 px-2 text-xs text-cream"/></label>
        <label className="text-[11px] text-cream/50">Unit cost (KSh)<input type="number" min="0" max="1000000000" step="0.01" required value={line.unitCost} onChange={(event) => updateLine(line.key, "unitCost", event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-cream/10 bg-mall-800 px-2 text-xs text-cream"/></label>
        <button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))} aria-label={`Remove item ${index + 1}`} className="flex min-h-10 items-center justify-center rounded-lg text-cream/35 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-20"><Trash2 size={15}/></button>
      </div>)}
    </div>
    {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
    <div className="mt-5 flex justify-end"><button type="submit" disabled={saving || !choices.length} className="min-h-11 rounded-xl bg-mall-accent px-5 text-sm font-semibold text-mall-900 disabled:opacity-50">{saving ? "Saving…" : "Create purchase order"}</button></div>
  </form>;
}

function ReceiveForm({ purchaseOrder, submitting, onReceive, onClose }) {
  const [quantities, setQuantities] = useState({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [receiptId] = useState(() => crypto.randomUUID());
  const remainingItems = purchaseOrder.items.filter((item) => item.quantityReceived < item.quantityOrdered);

  async function submit(event) {
    event.preventDefault();
    const lines = remainingItems
      .filter((item) => Number(quantities[item._id] || 0) > 0)
      .map((item) => ({ purchaseOrderLineId: item._id, quantity: Number(quantities[item._id]) }));
    if (!lines.length) return setError("Enter a quantity received for at least one item.");
    setError("");
    try { await onReceive(purchaseOrder._id, { receiptId, lines, note }); }
    catch (requestError) { setError(requestError.response?.data?.message || "Receipt could not be completed. Retry without changing the quantities."); }
  }

  return <form onSubmit={submit} className="mt-4 rounded-xl border border-mall-accent/20 bg-mall-accent/5 p-3">
    <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-cream">Record shipment receipt</p><button type="button" onClick={onClose} aria-label="Close receipt form" className="rounded p-1 text-cream/40"><X size={14}/></button></div>
    <div className="space-y-2">{remainingItems.map((item) => {
      const remaining = item.quantityOrdered - item.quantityReceived;
      return <label key={item._id} className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-3 text-xs text-cream/65"><span>{item.productName}{item.variantName ? ` · ${item.variantName}` : ""}<span className="ml-1 text-cream/35">({remaining} remaining)</span></span><input type="number" min="0" max={remaining} step="1" value={quantities[item._id] || ""} onChange={(event) => setQuantities((current) => ({ ...current, [item._id]: event.target.value }))} placeholder="Received" className="min-h-10 rounded-lg border border-cream/10 bg-mall-900 px-2 text-sm text-cream"/></label>;
    })}</div>
    <label className="mt-3 block text-[11px] text-cream/50">Delivery note <span className="text-cream/30">(optional)</span><input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-cream/10 bg-mall-900 px-3 text-xs text-cream"/></label>
    {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
    <button type="submit" disabled={submitting} className="mt-3 min-h-10 rounded-lg bg-mall-accent px-4 text-xs font-semibold text-mall-900 disabled:opacity-50">{submitting ? "Recording…" : "Save received stock"}</button>
  </form>;
}

export default function AdminPurchaseOrders() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [shops, setShops] = useState([]);
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [receivingId, setReceivingId] = useState("");
  const [submittingId, setSubmittingId] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data } = await api.get("/purchase-orders", { params: { search: search || undefined, status, page, limit: 20 } });
      setPurchaseOrders(data.purchaseOrders || []);
      setPages(data.pages || 1);
    } catch (error) {
      setLoadError(error.response?.data?.message || "Purchase orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [search, status, page, loadAttempt]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let active = true;
    api.get("/shops")
      .then(({ data }) => { if (active) setShops(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) setActionError(error.response?.data?.message || "Active shops could not be loaded."); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      api.get("/products/admin/list", { params: { search: productSearch || undefined, status: "all", page: 1, limit: 100 } })
        .then(({ data }) => { if (active) setProducts(data.products || []); })
        .catch((error) => { if (active) setActionError(error.response?.data?.message || "Catalog products could not be loaded."); });
    }, 200);
    return () => { active = false; clearTimeout(timeout); };
  }, [productSearch]);

  async function recordReceipt(orderId, receipt) {
    setSubmittingId(orderId);
    setActionError("");
    setActionSuccess("");
    try {
      await api.post(`/purchase-orders/${orderId}/receipts`, receipt);
      setReceivingId("");
      setActionSuccess("Shipment receipt recorded and stock updated.");
      await load();
    } catch (error) {
      setActionError(error.response?.data?.message || "Receipt could not be completed. Pending receipts can be retried from the order.");
      throw error;
    } finally {
      setSubmittingId("");
    }
  }

  async function retryReceipt(order, receipt) {
    return recordReceipt(order._id, {
      receiptId: receipt.receiptId,
      lines: receipt.lines.map((line) => ({ purchaseOrderLineId: line.purchaseOrderLineId, quantity: line.quantity })),
      note: receipt.note || "",
    });
  }

  async function cancelOrder(order) {
    if (!window.confirm(`Cancel purchase order ${order.orderNumber}? Orders with received stock cannot be cancelled.`)) return;
    setSubmittingId(order._id);
    setActionError("");
    setActionSuccess("");
    try {
      await api.post(`/purchase-orders/${order._id}/cancel`);
      setActionSuccess(`${order.orderNumber} cancelled.`);
      await load();
    } catch (error) {
      setActionError(error.response?.data?.message || "Purchase order could not be cancelled.");
    } finally { setSubmittingId(""); }
  }

  async function created() {
    setPage(1);
    setStatus("all");
    setSearch("");
    setActionSuccess("Purchase order created. Receive deliveries from this page as they arrive.");
    await load();
  }

  return <div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-cream/10 pb-4">
      <div><p className="mb-0.5 font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Inventory operations</p><h1 className="font-display text-2xl text-cream">Purchase Orders</h1></div>
      <button type="button" onClick={() => { setShowCreate((current) => !current); setActionError(""); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-mall-accent px-4 text-xs font-semibold text-mall-900"><Plus size={14}/> Create order</button>
    </div>
    <p className="mb-5 max-w-3xl text-xs leading-relaxed text-cream/45">Track supplier orders, unit cost, expected delivery, and partial receipts. Stock changes only when a delivery is received; each receipt is linked to its purchase order in inventory history.</p>
    {actionError && <p role="alert" className="mb-4 rounded-xl border border-red-300/15 bg-red-300/5 p-3 text-xs text-red-200">{actionError}</p>}
    {actionSuccess && <p role="status" className="mb-4 rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-3 text-xs text-emerald-200">{actionSuccess}</p>}
    {showCreate && <PurchaseOrderForm products={products} shops={shops} onClose={() => setShowCreate(false)} onCreated={created}/>}
    <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px]">
      <label className="relative"><span className="sr-only">Search purchase orders</span><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream/30"/><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search supplier, product, or order number" className="min-h-11 w-full rounded-xl border border-cream/10 bg-mall-800 pl-9 pr-3 text-xs text-cream outline-none focus:border-mall-accent"/></label>
      <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter purchase orders by status" className="min-h-11 rounded-xl border border-cream/10 bg-mall-800 px-3 text-xs text-cream"><option value="all">All statuses</option><option value="ordered">Ordered</option><option value="partially_received">Partially received</option><option value="received">Received</option><option value="cancelled">Cancelled</option></select>
    </div>
    {showCreate && <label className="mb-4 block max-w-lg text-xs text-cream/45">Find products for the order<input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search product names or SKUs" className="mt-1.5 min-h-10 w-full rounded-lg border border-cream/10 bg-mall-800 px-3 text-xs text-cream outline-none focus:border-mall-accent"/></label>}
    {loading ? <div className="py-16 text-center text-xs text-cream/40">Loading purchase orders…</div>
      : loadError ? <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((attempt) => attempt + 1)}/>
        : purchaseOrders.length === 0 ? <div className="rounded-2xl border border-dashed border-cream/10 py-16 text-center"><ClipboardList size={28} className="mx-auto mb-3 text-cream/20"/><p className="text-sm text-cream/60">No purchase orders found</p><p className="mt-1 text-xs text-cream/35">Create an order to track supplier deliveries and stock receipts.</p></div>
          : <div className="space-y-3">{purchaseOrders.map((order) => {
            const totalCost = order.items.reduce((sum, item) => sum + item.quantityOrdered * item.unitCost, 0);
            const hasPendingReceipt = order.receipts?.some((receipt) => receipt.lines?.some((line) => !line.inventoryAppliedAt));
            const canReceive = ["ordered", "partially_received"].includes(order.status);
            return <article key={order._id} className="rounded-2xl border border-cream/8 bg-mall-800/40 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-mono-tag text-[10px] uppercase tracking-wider text-mall-orange">{order.orderNumber} · {purchaseOrderStatus(order.status)}</p><h2 className="mt-1 font-display text-lg text-cream">{order.supplierName}</h2><p className="mt-1 text-xs text-cream/40">{order.supplierContact || "No supplier contact"}{order.expectedAt ? ` · Expected ${new Date(order.expectedAt).toLocaleDateString()}` : ""} · Ordered {new Date(order.orderedAt).toLocaleDateString()}</p></div>
                <p className="text-sm font-semibold text-cream">KSh {totalCost.toLocaleString()}</p>
              </div>
              <div className="mt-4 divide-y divide-cream/5">{order.items.map((item) => <div key={item._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span className="text-cream/75">{item.productName}{item.variantName ? ` · ${item.variantName}` : ""}{item.sku ? <span className="ml-2 text-cream/30">{item.sku}</span> : ""}<span className="ml-2 text-cream/35">Receive at {shops.find((shop) => String(shop._id) === String(item.shopId))?.name || "saved shop"}</span></span><span className="text-cream/50">{item.quantityReceived} / {item.quantityOrdered} received · KSh {Number(item.unitCost).toLocaleString()} each</span></div>)}</div>
              {order.note && <p className="mt-3 text-xs text-cream/40">Note: {order.note}</p>}
              {order.receipts?.length > 0 && <div className="mt-3 space-y-2">{order.receipts.map((receipt) => {
                const pending = receipt.lines?.some((line) => !line.inventoryAppliedAt);
                return <div key={receipt.receiptId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mall-900/70 px-3 py-2 text-[11px] text-cream/45"><span>Receipt · {new Date(receipt.receivedAt).toLocaleString()}{receipt.note ? ` · ${receipt.note}` : ""}{pending ? " · stock update pending" : " · stock updated"}</span>{pending && <button type="button" disabled={submittingId === order._id} onClick={() => retryReceipt(order, receipt).catch(() => {})} className="min-h-8 rounded-md border border-amber-200/20 px-2 text-amber-100 disabled:opacity-50">{submittingId === order._id ? "Retrying…" : "Retry stock update"}</button>}</div>;
              })}</div>}
              <div className="mt-4 flex flex-wrap gap-2">
                {canReceive && <button type="button" onClick={() => { setReceivingId(receivingId === order._id ? "" : order._id); setActionError(""); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-mall-accent/20 px-3 text-xs text-mall-accent"><Truck size={13}/> Receive delivery</button>}
                {order.status === "ordered" && !order.receipts?.length && <button type="button" disabled={submittingId === order._id} onClick={() => cancelOrder(order)} className="min-h-10 rounded-lg border border-red-300/15 px-3 text-xs text-red-200 disabled:opacity-50">Cancel order</button>}
                {hasPendingReceipt && <span className="self-center text-[10px] text-amber-100/70">Receipt is saved; retry any pending stock updates above.</span>}
              </div>
              {receivingId === order._id && <ReceiveForm purchaseOrder={order} submitting={submittingId === order._id} onReceive={recordReceipt} onClose={() => setReceivingId("")}/>}
            </article>;
          })}</div>}
    {!loading && !loadError && <AdminPagination page={page} pages={pages} onChange={setPage}/>}
  </div>;
}
