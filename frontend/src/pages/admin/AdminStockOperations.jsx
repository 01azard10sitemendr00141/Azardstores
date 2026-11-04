import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, ClipboardCheck, RefreshCw } from "lucide-react";
import api from "../../api/client";

function idOf(reference) {
  return String(reference?._id || reference || "");
}

function stockAt(product, shopId, variantId) {
  if (!product || !shopId) return undefined;
  if (String(idOf(product.shop)) === String(shopId)) {
    return variantId
      ? product.variants?.find((variant) => idOf(variant) === variantId)?.stock
      : product.stock;
  }
  const location = product.inventoryLocations?.find((entry) => idOf(entry.shop) === shopId);
  if (!location) return undefined;
  return variantId
    ? location.variants?.find((variant) => idOf(variant.variantId) === variantId)?.stock
    : location.stock;
}

function assignedShopIds(product) {
  return [...new Set([idOf(product?.shop), ...(product?.inventoryLocations || []).map((location) => idOf(location.shop))].filter(Boolean))];
}

const fieldClass = "mt-1 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-900 px-3 text-sm text-cream outline-none focus:border-mall-accent";

export default function AdminStockOperations() {
  const [products, setProducts] = useState([]);
  const [visibleProductIds, setVisibleProductIds] = useState([]);
  const [shops, setShops] = useState([]);
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [fromShopId, setFromShopId] = useState("");
  const [toShopId, setToShopId] = useState("");
  const [countShopId, setCountShopId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expectedStock, setExpectedStock] = useState("");
  const [countedStock, setCountedStock] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [countReason, setCountReason] = useState("");
  const [transferId, setTransferId] = useState(() => crypto.randomUUID());
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async (query = search) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/products/admin/list", { params: { search: query || undefined, status: "all", page: 1, limit: 100 } });
      const matches = data.products || [];
      setProducts((current) => {
        const byId = new Map(current.map((product) => [String(product._id), product]));
        matches.forEach((product) => byId.set(String(product._id), product));
        return [...byId.values()];
      });
      setVisibleProductIds(matches.map((product) => String(product._id)));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Inventory data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(() => load(), 200);
    return () => clearTimeout(timeout);
  }, [load]);
  useEffect(() => {
    let active = true;
    async function loadShops() {
      try {
        const first = await api.get("/shops/admin/list", { params: { page: 1, limit: 100 } });
        const pages = Array.from({ length: Math.max(0, first.data.pages - 1) }, (_, index) => index + 2);
        const remaining = await Promise.all(pages.map((page) => api.get("/shops/admin/list", { params: { page, limit: 100 } })));
        if (active) setShops([...(first.data.shops || []), ...remaining.flatMap((response) => response.data.shops || [])]);
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || "Shops could not be loaded.");
      }
    }
    loadShops();
    return () => { active = false; };
  }, []);

  const selectedProduct = products.find((product) => String(product._id) === productId);
  const assignedShops = useMemo(() => {
    const assigned = new Set(assignedShopIds(selectedProduct));
    return shops.filter((shop) => assigned.has(String(shop._id)));
  }, [selectedProduct, shops]);
  const filteredProducts = useMemo(() => products.filter((product) => visibleProductIds.includes(String(product._id))), [products, visibleProductIds]);

  function chooseProduct(nextProductId) {
    const nextProduct = products.find((product) => String(product._id) === nextProductId);
    const nextVariantId = nextProduct?.variants?.length ? idOf(nextProduct.variants[0]) : "";
    const primaryShopId = idOf(nextProduct?.shop);
    setProductId(nextProductId);
    setTransferId(crypto.randomUUID());
    setOperationId(crypto.randomUUID());
    setVariantId(nextVariantId);
    setTransferId(crypto.randomUUID());
    setOperationId(crypto.randomUUID());
    setFromShopId(primaryShopId);
    setCountShopId(primaryShopId);
    setToShopId(shops.find((shop) => String(shop._id) !== primaryShopId)?._id || "");
    setExpectedStock(Number.isInteger(stockAt(nextProduct, primaryShopId, nextVariantId)) ? String(stockAt(nextProduct, primaryShopId, nextVariantId)) : "");
    setCountedStock("");
  }

  function chooseVariant(nextVariantId) {
    setVariantId(nextVariantId);
    const current = stockAt(selectedProduct, countShopId, nextVariantId);
    setExpectedStock(Number.isInteger(current) ? String(current) : "");
    setCountedStock("");
  }

  function chooseCountShop(nextShopId) {
    setCountShopId(nextShopId);
    setOperationId(crypto.randomUUID());
    const current = stockAt(selectedProduct, nextShopId, variantId);
    setExpectedStock(Number.isInteger(current) ? String(current) : "");
    setCountedStock("");
  }

  async function recordTransfer(event) {
    event.preventDefault();
    if (!selectedProduct) return;
    setBusy("transfer");
    setError("");
    setSuccess("");
    try {
      await api.post(`/products/admin/${selectedProduct._id}/stock-transfer`, {
        fromShopId,
        toShopId,
        variantId: variantId || undefined,
        quantity: Number(quantity),
        transferId,
        reason: transferReason,
      });
      setSuccess("Stock transferred and both locations were recorded in inventory history.");
      setQuantity("");
      setTransferReason("");
      setTransferId(crypto.randomUUID());
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Stock transfer could not be completed.");
    } finally {
      setBusy("");
    }
  }

  async function recordCount(event) {
    event.preventDefault();
    if (!selectedProduct) return;
    setBusy("count");
    setError("");
    setSuccess("");
    try {
      await api.post(`/products/admin/${selectedProduct._id}/stock-count`, {
        shopId: countShopId,
        variantId: variantId || undefined,
        expectedStock: expectedStock === "" ? null : Number(expectedStock),
        countedStock: Number(countedStock),
        operationId,
        reason: countReason,
      });
      setSuccess("Stock count reconciled and recorded in inventory history.");
      setCountReason("");
      setOperationId(crypto.randomUUID());
      await load();
      setExpectedStock(String(countedStock));
      setCountedStock("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Stock count could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  const destinationShops = shops.filter((shop) => shop.isActive && String(shop._id) !== String(fromShopId));
  const availableForTransfer = stockAt(selectedProduct, fromShopId, variantId);

  return <div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-cream/10 pb-4">
      <div><p className="mb-0.5 font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Inventory operations</p><h1 className="font-display text-2xl text-cream">Stock Operations</h1></div>
      <button type="button" onClick={load} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cream/10 px-3 text-xs text-cream/60 disabled:opacity-40"><RefreshCw size={13}/> Refresh</button>
    </div>
    <p className="mb-5 max-w-3xl text-xs leading-relaxed text-cream/45">Transfer stock between active shops or reconcile a physical count. Every change is audited; counts use a compare-and-set check so a concurrent order cannot be overwritten.</p>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-300/15 bg-red-300/5 p-3 text-xs text-red-200">{error}</p>}
    {success && <p role="status" className="mb-4 rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-3 text-xs text-emerald-200">{success}</p>}
    <section className="mb-5 rounded-2xl border border-cream/10 bg-mall-800/40 p-4 sm:p-5">
      <h2 className="font-display text-lg text-cream">Select catalog item</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-cream/55">Find product<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or SKU" className={fieldClass}/></label>
        <label className="text-xs text-cream/55">Product<select value={productId} onChange={(event) => chooseProduct(event.target.value)} className={fieldClass}><option value="">Select product</option>{filteredProducts.map((product) => <option key={product._id} value={product._id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label>
        {selectedProduct?.variants?.length > 0 && <label className="text-xs text-cream/55">Option<select value={variantId} onChange={(event) => chooseVariant(event.target.value)} className={fieldClass}>{selectedProduct.variants.map((variant) => <option key={variant._id} value={variant._id}>{variant.name || "Unnamed option"}{variant.sku ? ` · ${variant.sku}` : ""}</option>)}</select></label>}
      </div>
      {!loading && !filteredProducts.length && <p className="mt-3 text-xs text-cream/40">No products match this search.</p>}
    </section>

    {selectedProduct && <>
      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={recordTransfer} className="rounded-2xl border border-cream/10 bg-mall-800/40 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2"><ArrowRightLeft size={16} className="text-mall-accent"/><h2 className="font-display text-lg text-cream">Transfer stock</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-cream/55">From shop<select required value={fromShopId} onChange={(event) => {
              const nextSource = event.target.value;
              setTransferId(crypto.randomUUID());
              setFromShopId(nextSource);
              if (nextSource === toShopId) setToShopId(shops.find((shop) => String(shop._id) !== nextSource)?._id || "");
            }} className={fieldClass}><option value="">Select source</option>{assignedShops.map((shop) => <option key={shop._id} value={shop._id}>{shop.name}</option>)}</select></label>
            <label className="text-xs text-cream/55">To shop<select required value={toShopId} onChange={(event) => { setTransferId(crypto.randomUUID()); setToShopId(event.target.value); }} className={fieldClass}><option value="">Select destination</option>{destinationShops.map((shop) => <option key={shop._id} value={shop._id}>{shop.name}</option>)}</select></label>
            <label className="text-xs text-cream/55">Quantity<input required type="number" min="1" max="1000000" step="1" value={quantity} onChange={(event) => { setTransferId(crypto.randomUUID()); setQuantity(event.target.value); }} className={fieldClass}/></label>
            <div className="self-end pb-3 text-xs text-cream/45">{Number.isInteger(availableForTransfer) ? `${availableForTransfer} confirmed at source` : "Source stock is unconfirmed"}</div>
            <label className="text-xs text-cream/55 sm:col-span-2">Reason<input required minLength="5" maxLength="500" value={transferReason} onChange={(event) => { setTransferId(crypto.randomUUID()); setTransferReason(event.target.value); }} className={fieldClass}/></label>
          </div>
          <button type="submit" disabled={busy !== "" || !Number.isInteger(availableForTransfer)} className="mt-4 min-h-11 rounded-xl bg-mall-accent px-4 text-xs font-semibold text-mall-900 disabled:opacity-40">{busy === "transfer" ? "Transferring…" : "Record transfer"}</button>
        </form>

        <form onSubmit={recordCount} className="rounded-2xl border border-cream/10 bg-mall-800/40 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2"><ClipboardCheck size={16} className="text-mall-accent"/><h2 className="font-display text-lg text-cream">Reconcile stock count</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-cream/55">Shop<select required value={countShopId} onChange={(event) => chooseCountShop(event.target.value)} className={fieldClass}><option value="">Select shop</option>{assignedShops.map((shop) => <option key={shop._id} value={shop._id}>{shop.name}</option>)}</select></label>
            <label className="text-xs text-cream/55">Expected stock<input type="number" min="0" max="1000000" step="1" value={expectedStock} onChange={(event) => { setOperationId(crypto.randomUUID()); setExpectedStock(event.target.value); }} placeholder="Leave blank if unconfirmed" className={fieldClass}/></label>
            <label className="text-xs text-cream/55">Physical count<input required type="number" min="0" max="1000000" step="1" value={countedStock} onChange={(event) => { setOperationId(crypto.randomUUID()); setCountedStock(event.target.value); }} className={fieldClass}/></label>
            <label className="text-xs text-cream/55">Reason<input required minLength="5" maxLength="500" value={countReason} onChange={(event) => { setOperationId(crypto.randomUUID()); setCountReason(event.target.value); }} className={fieldClass}/></label>
          </div>
          <button type="submit" disabled={busy !== "" || countedStock === ""} className="mt-4 min-h-11 rounded-xl bg-mall-accent px-4 text-xs font-semibold text-mall-900 disabled:opacity-40">{busy === "count" ? "Saving count…" : "Record stock count"}</button>
        </form>
      </div>
    </>}
  </div>;
}
