import { useEffect, useId, useRef, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Package, Upload, CheckCircle2, AlertCircle, FileSpreadsheet, Download, Archive, ArchiveRestore, Eye, ArrowUp, ArrowDown, History } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import AdminPagination from "../../components/AdminPagination";
import AdminConfirmDialog from "../../components/admin/AdminConfirmDialog";
import ProductImportPanel from "../../components/admin/ProductImportPanel";
import AdminLoadError from "../../components/AdminLoadError";
import { downloadCsv } from "../../utils/downloadCsv";
import { useBadges } from "../../context/BadgesContext";
import { getStartingPrice } from "../../utils/productPricing";
import { clearHomeCache } from "../../utils/homeCache";
import { productImageUrl } from "../../utils/productImageUrl";
import { getProductBadges, MAX_PRODUCT_BADGES } from "../../utils/productBadges";
import useModalAccessibility from "../../hooks/useModalAccessibility";

const PURPOSES = ["work", "gaming", "travel", "home", "fitness"];
const DEFAULT_REORDER_LEVEL = 5;
const EMPTY = { name: "", sku: "", description: "", longDescription: "", price: "", compareAtPrice: "", images: "", shop: "", categoryId: "", subcategoryId: "", category: "", subcategory: "", brandId: "", brand: "", stock: "", reorderLevel: DEFAULT_REORDER_LEVEL, badge: "", badges: [], returnEligibility: "standard", isFlashSale: false, purposeTags: [], variants: [], status: "draft" };

async function loadAllAdminShops() {
  const first = await api.get("/shops/admin/list", { params: { page: 1, limit: 100 } });
  const pages = Array.from({ length: Math.max(0, first.data.pages - 1) }, (_, index) => index + 2);
  const rest = await Promise.all(pages.map((page) => api.get("/shops/admin/list", { params: { page, limit: 100 } })));
  return [...(first.data.shops || []), ...rest.flatMap((response) => response.data.shops || [])];
}

function getStockLabel(product) {
  const locations = product.inventoryLocations || [];
  if (product.variants?.length) {
    if (!product.variants.every((variant) => Number.isInteger(variant.stock))) return "Not fully confirmed across options";
    const primaryTotal = product.variants.reduce((total, variant) => total + variant.stock, 0);
    if (!locations.length) return `${primaryTotal.toLocaleString()} in primary shop`;
    const secondaryStocks = locations.flatMap((location) => location.variants || []);
    if (secondaryStocks.length !== locations.length * product.variants.length || secondaryStocks.some((variant) => !Number.isInteger(variant.stock))) {
      return `${primaryTotal.toLocaleString()} in primary shop · other shop stock unconfirmed`;
    }
    const secondaryTotal = secondaryStocks.reduce((total, variant) => total + variant.stock, 0);
    return `${primaryTotal.toLocaleString()} primary · ${secondaryTotal.toLocaleString()} in ${locations.length} other shop${locations.length === 1 ? "" : "s"}`;
  }
  const primaryStock = Number.isInteger(product.stock) ? `${product.stock.toLocaleString()} primary` : "Primary stock unconfirmed";
  if (!locations.length) return primaryStock;
  if (locations.some((location) => !Number.isInteger(location.stock))) return `${primaryStock} · other shop stock unconfirmed`;
  const secondaryTotal = locations.reduce((total, location) => total + location.stock, 0);
  return `${primaryStock} · ${secondaryTotal.toLocaleString()} in ${locations.length} other shop${locations.length === 1 ? "" : "s"}`;
}

function getLowStockWarning(product) {
  const locations = [
    { shop: product.shop, stock: product.stock, variants: product.variants, primary: true },
    ...(product.inventoryLocations || []),
  ];
  if (product.variants?.length) {
    const low = locations.flatMap((location) => (location.variants || []).flatMap((entry) => {
      const variant = location.primary
        ? entry
        : product.variants.find((candidate) => String(candidate._id) === String(entry.variantId));
      const level = variant?.reorderLevel ?? DEFAULT_REORDER_LEVEL;
      if (!variant || !Number.isInteger(entry.stock) || entry.stock > level) return [];
      const shopName = location.primary ? "Primary shop" : location.shop?.name || "Other shop";
      return [`${shopName} · ${variant.name || "Option"}: ${entry.stock} left (reorder at ${level})`];
    }));
    return low.length ? `Needs restock · ${low.join(", ")}` : "";
  }
  const level = product.reorderLevel ?? DEFAULT_REORDER_LEVEL;
  const low = locations.filter((location) => Number.isInteger(location.stock) && location.stock <= level)
    .map((location) => `${location.primary ? "Primary shop" : location.shop?.name || "Other shop"}: ${location.stock} left (reorder at ${level})`);
  return low.length ? `Needs restock · ${low.join(", ")}` : "";
}

function ProductRestockForm({ product, shops, onSubmit, onCancel }) {
  const dialogRef = useRef(null);
  const [variantId, setVariantId] = useState("");
  const [shopId, setShopId] = useState(String(product.shop?._id || product.shop || ""));
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isPrimaryShop = shopId === String(product.shop?._id || product.shop || "");
  const location = isPrimaryShop ? product : product.inventoryLocations?.find((entry) => String(entry.shop?._id || entry.shop) === shopId);
  const variant = isPrimaryShop
    ? product.variants?.find((entry) => String(entry._id) === variantId)
    : location?.variants?.find((entry) => String(entry.variantId) === variantId);
  const isAssigned = isPrimaryShop || Boolean(location);
  const currentStock = isAssigned ? (variant ? variant.stock : location?.stock) : 0;
  const hasVariants = Boolean(product.variants?.length);
  useModalAccessibility(dialogRef, onCancel, saving);

  async function submit(event) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) return setError("Enter a whole-number quantity greater than zero.");
    if (!Number.isInteger(currentStock)) return setError("Confirm current stock in the product editor before recording a restock.");
    if (reason.trim().length < 5) return setError("Add a reason for this stock receipt.");
    setSaving(true);
    setError("");
    try {
      await onSubmit({ variantId, shopId, quantity: parsedQuantity, reason: reason.trim() });
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Could not record this restock.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="presentation">
    <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="product-restock-title" className="w-full max-w-lg rounded-t-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3"><div><p className="font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Inventory receipt</p><h2 id="product-restock-title" className="mt-1 font-display text-2xl text-cream">Restock {product.name}</h2></div><button type="button" onClick={onCancel} disabled={saving} aria-label="Close" className="rounded-lg p-2 text-cream/50 hover:bg-cream/5 disabled:opacity-40"><X size={18}/></button></div>
      <label className="mb-4 block text-xs text-cream/65">Receiving shop<select value={shopId} onChange={(event) => setShopId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-800 px-3 text-sm text-cream outline-none focus:border-mall-accent"><option value="">Choose a shop</option>{shops.map((shop) => <option key={shop._id} value={shop._id}>{shop.name}</option>)}</select></label>
      {hasVariants && <label className="mb-4 block text-xs text-cream/65">Product option<select data-dialog-initial-focus value={variantId} onChange={(event) => setVariantId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-800 px-3 text-sm text-cream outline-none focus:border-mall-accent"><option value="">Choose an option</option>{product.variants.map((entry) => {
        const optionStock = isAssigned
          ? isPrimaryShop
            ? entry.stock
            : location?.variants?.find((locationVariant) => String(locationVariant.variantId) === String(entry._id))?.stock
          : 0;
        return <option key={entry._id} value={entry._id}>{entry.name || "Unnamed option"} · {Number.isInteger(optionStock) ? `${optionStock} at this shop` : "stock unconfirmed"}</option>;
      })}</select></label>}
      {!hasVariants && <p className="mb-4 rounded-lg bg-mall-800 p-3 text-xs text-cream/65">Current quantity: {Number.isInteger(currentStock) ? currentStock : "Not confirmed"}</p>}
      {hasVariants && variant && <p className="mb-4 rounded-lg bg-mall-800 p-3 text-xs text-cream/65">Current quantity: {Number.isInteger(currentStock) ? currentStock : "Not confirmed"}</p>}
      <label className="mb-4 block text-xs text-cream/65">Quantity received<input data-dialog-initial-focus={!hasVariants} type="number" min="1" max="1000000" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-cream/10 bg-mall-800 px-3 text-sm text-cream outline-none focus:border-mall-accent" /></label>
      <label className="block text-xs text-cream/65">Reason<textarea required minLength="5" maxLength="500" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: supplier delivery, inspected customer return" className="mt-2 w-full resize-y rounded-xl border border-cream/10 bg-mall-800 px-3 py-3 text-sm text-cream outline-none focus:border-mall-accent" /></label>
      {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
      <div className="mt-5 flex gap-3"><button type="button" onClick={onCancel} disabled={saving} className="flex-1 rounded-xl border border-cream/10 px-4 py-3 text-sm text-cream/65 disabled:opacity-40">Cancel</button><button type="submit" disabled={saving || (hasVariants && !variantId)} className="flex-1 rounded-xl bg-mall-accent px-4 py-3 text-sm font-semibold text-mall-900 disabled:opacity-50">{saving ? "Recording…" : "Record stock received"}</button></div>
    </form>
  </div>;
}

function ProductInventoryHistory({ product }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (entries.length || loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/products/admin/${product._id}/inventory-history`);
      setEntries(data.entries || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Inventory history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <button type="button" aria-expanded={open} aria-label={`View stock history for ${product.name}`} onClick={toggle} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-mall-800 px-2 text-cream/65 transition hover:text-mall-accent xl:w-11 xl:flex-none xl:px-0">
      <History size={13} /><span className="text-[11px] xl:hidden">History</span>
    </button>
    {open && <section className="mt-2 rounded-xl border border-cream/10 bg-mall-900/50 p-3" aria-label={`Stock history for ${product.name}`}>
      <h3 className="text-xs font-semibold text-cream">Inventory history</h3>
      {loading && <p className="mt-2 text-xs text-cream/55" role="status">Loading stock changes…</p>}
      {error && <p className="mt-2 text-xs text-red-200" role="alert">{error}</p>}
      {!loading && !error && !entries.length && <p className="mt-2 text-xs text-cream/55">No stock changes have been recorded yet.</p>}
      {entries.length > 0 && <ol className="mt-2 space-y-2">
        {entries.map((entry, index) => {
          const label = entry.type === "restock" ? "Stock received"
            : entry.type === "purchase_order_received" ? "Supplier delivery received"
              : entry.type === "return_inspected" ? "Return inspected"
              : entry.type === "stock_count" ? "Stock count reconciled"
                : entry.type === "transfer_in" ? "Stock transfer received"
                  : entry.type === "transfer_out" ? "Stock transfer sent"
            : entry.type === "order_reserved" ? "Order reserved"
            : entry.type === "order_released" ? "Reservation released"
              : entry.type === "legacy_order_restored" ? "Order stock restored"
                : entry.type === "csv_import" ? "CSV stock update"
                  : entry.type === "bulk_adjustment" ? "Bulk stock update"
                    : entry.type === "initial" ? "Initial stock" : "Manual stock update";
          const eventLabel = entry.type === "baseline" ? "History tracking started" : label;
          const quantity = Number.isInteger(entry.stock)
            ? `${Number.isInteger(entry.previousStock) ? entry.previousStock : "Unconfirmed"} → ${entry.stock}`
            : Number.isInteger(entry.delta) ? `${entry.delta > 0 ? "+" : ""}${entry.delta}` : "Stock confirmation changed";
          const shopLabel = entry.shopId?.name ? ` · ${entry.shopId.name}` : "";
          return <li key={`${entry.changedAt}-${index}`} className="flex flex-wrap justify-between gap-2 border-t border-cream/5 pt-2 text-[11px]">
            <span className="text-cream/75">{eventLabel}{shopLabel}{entry.variantName ? ` · ${entry.variantName}` : ""} · {quantity}{entry.reason ? ` · ${entry.reason}` : ""}</span>
            <time className="text-cream/40" dateTime={entry.changedAt}>{new Date(entry.changedAt).toLocaleString()}</time>
          </li>;
        })}
      </ol>}
    </section>}
  </>;
}

function ProductForm({ initial, floors, shops, categories, brands, onSave, onCancel }) {
  const { badges, loading: badgesLoading, error: badgesError, retry: retryBadges } = useBadges();
  const formId = useId().replace(/:/g, "");
  const fieldId = (name) => `${formId}-${name}`;
  const [form, setForm] = useState(initial
    ? { ...initial, badges: Array.isArray(initial.badges) && initial.badges.length ? initial.badges : initial.badge ? [initial.badge] : [], reorderLevel: initial.reorderLevel ?? DEFAULT_REORDER_LEVEL, images: initial.images?.join(", ") || "", purposeTags: initial.purposeTags || [], variants: (initial.variants || []).map((variant) => ({ ...variant, reorderLevel: variant.reorderLevel ?? DEFAULT_REORDER_LEVEL })) }
    : EMPTY);
  const [floorId, setFloorId] = useState(String(initial?.shop?.floor?._id || initial?.shop?.floor || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [publishIssues, setPublishIssues] = useState(initial?.publishIssues || []);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [skuGenerating, setSkuGenerating] = useState("");
  const skuRequests = useRef(new Map());

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function generateSku(name, apply, key = "product", reservedSkusOverride) {
    if (!String(name || "").trim()) {
      setError("Add a product or option name before generating an SKU.");
      return Promise.resolve("");
    }
    const existingRequest = skuRequests.current.get(key);
    if (existingRequest) {
      if (existingRequest.name === name) return existingRequest.promise;
      return existingRequest.promise.then(() => generateSku(name, apply, key, reservedSkusOverride));
    }
    setSkuGenerating(key);
    setError("");
    const request = (async () => {
      try {
        const reservedSkus = reservedSkusOverride || [form.sku, ...form.variants.map((variant) => variant.sku)].filter(Boolean);
        const { data } = await api.post("/products/admin/sku-suggestion", { name, reservedSkus });
        apply(data.sku);
        return data.sku;
      } catch (err) {
        setError(err.response?.data?.message || "Could not generate an available SKU.");
        return "";
      } finally {
        setSkuGenerating("");
        if (skuRequests.current.get(key)?.promise === request) skuRequests.current.delete(key);
      }
    })();
    skuRequests.current.set(key, { name, promise: request });
    return request;
  }
  function autoSuggestProductSku() {
    if (!initial && form.name.trim() && !form.variants.length && !form.sku?.trim()) {
      const requestedName = form.name;
      generateSku(requestedName, (sku) => setForm((current) => (
        current.name === requestedName && !current.sku?.trim() ? { ...current, sku } : current
      )));
    }
  }
  function autoSuggestVariantSku(index) {
    const variant = form.variants[index];
    if (!variant?.sku?.trim() && form.name.trim()) {
      const requestedName = `${form.name} ${variant?.name || ""}`;
      const requestedVariantName = variant?.name || "";
      generateSku(requestedName, (sku) => setForm((current) => (
        current.name === form.name && current.variants[index]?.name === requestedVariantName && !current.variants[index]?.sku?.trim()
          ? {
            ...current,
            variants: current.variants.map((entry, variantIndex) => (
              variantIndex === index ? { ...entry, sku } : entry
            )),
          }
          : current
      )), `variant-${index}`);
    }
  }
  function togglePurpose(tag) {
    setForm((f) => ({
      ...f,
      purposeTags: f.purposeTags.includes(tag) ? f.purposeTags.filter((t) => t !== tag) : [...f.purposeTags, tag],
    }));
  }
  function toggleBadge(slug) {
    setForm((current) => {
      const currentBadges = current.badges || [];
      if (!currentBadges.includes(slug) && currentBadges.length >= MAX_PRODUCT_BADGES) return current;
      const badges = currentBadges.includes(slug)
        ? currentBadges.filter((badge) => badge !== slug)
        : [...currentBadges, slug];
      return { ...current, badges, badge: badges[0] || "" };
    });
  }

  function addVariant() {
    setForm((f) => ({ ...f, variants: [...f.variants, { name: "", sku: "", price: "", compareAtPrice: "", stock: "", reorderLevel: DEFAULT_REORDER_LEVEL, image: "" }] }));
  }
  function updateVariant(index, key, value) {
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, i) => (i === index ? { ...v, [key]: value } : v)),
    }));
  }
  function removeVariant(index) {
    setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== index) }));
  }
  function imageUrls() {
    return form.images.split(",").map((url) => url.trim()).filter(Boolean);
  }
  function updateImages(urls) {
    set("images", urls.join(", "));
  }
  function addImageUrl() {
    const value = imageUrlInput.trim();
    let parsed;
    try { parsed = new URL(value); } catch { setError("Enter a complete HTTPS image URL."); return; }
    if (parsed.protocol !== "https:") { setError("Product image URLs must use HTTPS."); return; }
    const urls = imageUrls();
    if (urls.length >= 12) { setError("A product can have up to 12 gallery images."); return; }
    if (urls.includes(value)) { setError("That image URL is already in the gallery."); return; }
    setError("");
    updateImages([...urls, value]);
    setImageUrlInput("");
  }
  function moveImage(index, direction) {
    const urls = imageUrls();
    const destination = index + direction;
    if (destination < 0 || destination >= urls.length) return;
    [urls[index], urls[destination]] = [urls[destination], urls[index]];
    updateImages(urls);
  }

  const selectedCategory = categories.find((category) => String(category._id) === String(form.categoryId || "")
    || category.name.trim().toLocaleLowerCase() === String(form.category || "").trim().toLocaleLowerCase());
  const selectedBrand = brands.find((brand) => String(brand._id) === String(form.brandId || "")
    || brand.name.trim().toLocaleLowerCase() === String(form.brand || "").trim().toLocaleLowerCase());
  const selectedSubcategory = selectedCategory?.subcategories?.find((subcategory) => String(subcategory._id) === String(form.subcategoryId || "")
    || subcategory.name.trim().toLocaleLowerCase() === String(form.subcategory || "").trim().toLocaleLowerCase());
  const floorShops = shops.filter((shop) => String(shop.floor?._id || shop.floor || "") === floorId);

  async function handleSave(e, requestedStatus = "draft") {
    e?.preventDefault();
    setError("");
    setSaving(true);
    try {
      let saveForm = { ...form, variants: [...form.variants] };
      if (!initial && saveForm.name.trim() && saveForm.variants.length) {
        const reservedSkus = [saveForm.sku, ...saveForm.variants.map((variant) => variant.sku)].filter(Boolean);
        for (let index = 0; index < saveForm.variants.length; index += 1) {
          if (saveForm.variants[index].sku?.trim()) continue;
          const sku = await generateSku(`${saveForm.name} ${saveForm.variants[index].name || ""}`, () => {}, `variant-${index}`, reservedSkus);
          if (!sku) return;
          saveForm.variants[index] = { ...saveForm.variants[index], sku };
          reservedSkus.push(sku);
        }
      } else if (!initial && saveForm.name.trim() && !saveForm.variants.length && !saveForm.sku?.trim()) {
        const sku = await generateSku(saveForm.name, () => {}, "product");
        if (!sku) return;
        saveForm.sku = sku;
      }
      setForm(saveForm);
      const variants = saveForm.variants;
      const issues = [];
      if (!saveForm.name.trim()) issues.push("Add a product name.");
      if (!saveForm.shop?._id && !saveForm.shop) issues.push("Choose a shop.");
      if (!selectedCategory) issues.push("Choose a category from the managed category list.");
      if (!selectedSubcategory) issues.push("Choose a subcategory from the selected category.");
      if (!saveForm.images.split(",").map((s) => s.trim()).filter(Boolean).length) issues.push("Add at least one product image URL.");
      if (variants.length) variants.forEach((v, index) => {
        const label = v.name?.trim() || `Option ${index + 1}`;
        if (!v.name?.trim()) issues.push(`${label}: add a customer-facing option name.`);
        if (!v.sku?.trim()) issues.push(`${label}: add a unique SKU.`);
        const effectivePrice = v.price === "" || v.price === undefined || v.price === null ? saveForm.price : v.price;
        if (!Number.isFinite(Number(effectivePrice)) || Number(effectivePrice) <= 0) issues.push(`${label}: add a price greater than zero.`);
        if (v.stock === "" || v.stock === undefined || v.stock === null || !Number.isInteger(Number(v.stock)) || Number(v.stock) < 0) issues.push(`${label}: confirm a whole-number stock quantity (zero is allowed).`);
        if (v.reorderLevel === "" || !Number.isInteger(Number(v.reorderLevel ?? DEFAULT_REORDER_LEVEL)) || Number(v.reorderLevel ?? DEFAULT_REORDER_LEVEL) < 0 || Number(v.reorderLevel ?? DEFAULT_REORDER_LEVEL) > 1000000) issues.push(`${label}: set a whole-number reorder level from 0 to 1,000,000.`);
        const effectiveCompareAt = v.compareAtPrice === "" || v.compareAtPrice === undefined || v.compareAtPrice === null ? saveForm.compareAtPrice : v.compareAtPrice;
        if (effectiveCompareAt && Number(effectiveCompareAt) > 0 && Number(effectiveCompareAt) <= Number(effectivePrice)) issues.push(`${label}: compare-at price must be higher than its selling price.`);
      });
      else {
        if (!saveForm.sku?.trim()) issues.push("Add a unique product SKU.");
        if (!(Number(saveForm.price) > 0)) issues.push("Add a price greater than zero.");
        if (saveForm.stock === "" || saveForm.stock === undefined || !Number.isInteger(Number(saveForm.stock)) || Number(saveForm.stock) < 0) issues.push("Confirm a whole-number stock quantity (zero is allowed).");
      }
      if (saveForm.reorderLevel === "" || !Number.isInteger(Number(saveForm.reorderLevel)) || Number(saveForm.reorderLevel) < 0 || Number(saveForm.reorderLevel) > 1000000) issues.push("Set a whole-number reorder level from 0 to 1,000,000.");
      if ((saveForm.badges || []).length > MAX_PRODUCT_BADGES) issues.push(`Choose no more than ${MAX_PRODUCT_BADGES} badges.`);
      setPublishIssues(issues);
      if ((saveForm.badges || []).length > MAX_PRODUCT_BADGES) return;
      if (requestedStatus === "published" && issues.length) return;
      const payload = {
        ...saveForm,
        status: requestedStatus,
        shop: saveForm.shop?._id || saveForm.shop,
        brandId: selectedBrand?._id || "",
        brand: selectedBrand?.name || saveForm.brand,
        floorId,
        categoryId: selectedCategory?._id || "",
        subcategoryId: selectedSubcategory?._id || "",
        category: selectedCategory?.name || saveForm.category,
        subcategory: selectedSubcategory?.name || saveForm.subcategory,
        badges: saveForm.badges || [],
        badge: saveForm.badges?.[0] || "",
        images: saveForm.images ? saveForm.images.split(",").map((s) => s.trim()).filter(Boolean) : [],
        price: saveForm.price === "" || saveForm.price === undefined ? null : Number(saveForm.price),
        compareAtPrice: saveForm.compareAtPrice ? Number(saveForm.compareAtPrice) : null,
        stock: saveForm.stock === "" || saveForm.stock === undefined ? null : Number(saveForm.stock),
        reorderLevel: Number(saveForm.reorderLevel),
        variants: saveForm.variants
          .map((v) => ({
            ...(v._id ? { _id: v._id } : {}),
            name: v.name.trim(),
            sku: v.sku || "",
            price: v.price !== "" && v.price !== undefined ? Number(v.price) : null,
            compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : null,
            stock: v.stock === "" || v.stock === undefined ? null : Number(v.stock),
            reorderLevel: Number(v.reorderLevel ?? DEFAULT_REORDER_LEVEL),
            image: v.image || "",
          })),
      };
      await onSave(payload);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save product");
      if (err.response?.data?.issues) setPublishIssues(err.response.data.issues);
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full min-h-11 sm:min-h-0 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/40 outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition";

  return (
    <form onSubmit={handleSave} className="mb-4 rounded-2xl border border-cream/10 bg-mall-800/50 p-3 shadow-lg shadow-black/10 sm:p-5">
      <div className="mb-5 border-b border-cream/10 pb-4">
        <p className="font-mono-tag text-[10px] uppercase tracking-[0.18em] text-mall-accent">{initial ? "Product editor" : "New catalog entry"}</p>
        <h2 className="mt-1 font-display text-xl text-cream">{initial ? "Edit product" : "Add product"}</h2>
      </div>
      <section className="mb-4" aria-labelledby={fieldId("identity-heading")}>
        <div className="mb-4 border-l-2 border-mall-accent/70 pl-3">
          <h2 id={fieldId("identity-heading")} className="text-[15px] font-semibold text-cream">Product identity</h2>
          <p className="mt-0.5 text-xs text-cream/60">Name and customer-facing copy</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={fieldId("name")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Product Name</label>
          <input id={fieldId("name")} value={form.name} onChange={(e) => set("name", e.target.value)} onBlur={autoSuggestProductSku} placeholder="e.g. Oraimo AirBuds Pro" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={fieldId("description")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Short Description</label>
          <textarea id={fieldId("description")} value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={fieldId("long-description")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Long Description</label>
          <textarea id={fieldId("long-description")} value={form.longDescription || ""} onChange={(e) => set("longDescription", e.target.value)} rows={5} className={`${inputClass} resize-y`} />
        </div>
        </div>
      </section>

      <section className="mb-4 border-t border-cream/10 pt-4" aria-labelledby={fieldId("pricing-heading")}>
        <div className="mb-4 border-l-2 border-mall-accent/70 pl-3">
          <h2 id={fieldId("pricing-heading")} className="text-[15px] font-semibold text-cream">SKU, pricing & inventory</h2>
          <p className="mt-0.5 text-xs text-cream/60">Set the product identifier, price and confirmed stock</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={fieldId("sku")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">SKU {form.variants.length ? "(optional group code)" : ""}</label>
          <div className="flex gap-2">
            <input id={fieldId("sku")} value={form.sku || ""} onChange={(e) => set("sku", e.target.value.toUpperCase())} placeholder={form.variants.length ? "Optional parent code" : "Generated from product name"} className={inputClass} />
            <button type="button" disabled={Boolean(skuGenerating)} onClick={() => generateSku(form.name, (sku) => set("sku", sku))} className="min-h-11 shrink-0 rounded-xl border border-cream/15 px-3 text-xs text-cream/70 hover:text-cream disabled:opacity-50">{skuGenerating === "product" ? "Generating…" : form.sku ? "New SKU" : "Generate"}</button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-cream/60">Suggested from the product name, editable, and checked for availability before saving.</p>
        </div>
        <div>
          <label htmlFor={fieldId("price")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Price (KSh)</label>
          <input id={fieldId("price")} type="number" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="3499" className={inputClass} />
        </div>
        <div>
          <label htmlFor={fieldId("compare-price")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Compare At Price</label>
          <input id={fieldId("compare-price")} type="number" value={form.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} placeholder="4500" className={inputClass} />
        </div>
        <div>
          <label htmlFor={fieldId("stock")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Stock</label>
          <input id={fieldId("stock")} type="number" min="0" step="1" value={form.stock ?? ""} onChange={(e) => set("stock", e.target.value)} placeholder="Enter confirmed whole-number stock" className={inputClass} />
        </div>
        <div>
          <label htmlFor={fieldId("reorder-level")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Reorder when at or below</label>
          <input id={fieldId("reorder-level")} type="number" min="0" max="1000000" step="1" value={form.reorderLevel ?? DEFAULT_REORDER_LEVEL} onChange={(e) => set("reorderLevel", e.target.value)} className={inputClass} />
        </div>
        <p className="sm:col-span-2 -mt-2 text-[11px] text-cream/45">Set per product. For products with options, set the level on each option below. A level of 0 flags only out-of-stock items.</p>
        </div>
      </section>

      <section className="mb-4 border-t border-cream/10 pt-4" aria-labelledby={fieldId("placement-heading")}>
        <div className="mb-4 border-l-2 border-mall-accent/70 pl-3">
          <h2 id={fieldId("placement-heading")} className="text-[15px] font-semibold text-cream">Placement & merchandising</h2>
          <p className="mt-0.5 text-xs text-cream/60">Choose where the product appears and how it is presented</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={fieldId("floor")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Floor</label>
          <select
            id={fieldId("floor")}
            value={floorId}
            onChange={(e) => {
              const nextFloorId = e.target.value;
              setFloorId(nextFloorId);
              const currentShopId = String(form.shop?._id || form.shop || "");
              if (!shops.some((shop) => String(shop._id) === currentShopId && String(shop.floor?._id || shop.floor || "") === nextFloorId)) set("shop", "");
            }}
            className={inputClass}
          >
            <option value="">Select floor first</option>
            {floors.map((floor) => <option key={floor._id} value={floor._id} disabled={floor.isActive === false && String(floor._id) !== floorId}>Floor {floor.floorNumber}: {floor.name}{floor.isActive === false ? " (Inactive)" : ""}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={fieldId("shop")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Shop</label>
          <select id={fieldId("shop")} value={form.shop?._id || form.shop} onChange={(e) => set("shop", e.target.value)} disabled={!floorId} className={`${inputClass} disabled:opacity-40`}>
            <option value="">{floorId ? "Select shop on this floor" : "Choose a floor first"}</option>
            {form.shop?._id && !floorShops.some((shop) => String(shop._id) === String(form.shop._id)) && <option value={form.shop._id} disabled>#{form.shop.shopNumber} {form.shop.name} (inactive)</option>}
            {floorShops.map((s) => <option key={s._id} value={s._id}>#{s.shopNumber} {s.name}</option>)}
          </select>
          {form.shop?.isActive === false && <p className="mt-1 text-[10px] text-amber-200/80">This shop is inactive, so the product is hidden from shoppers. Move it to an active shop before publishing.</p>}
        </div>
        <div>
          <label htmlFor={fieldId("brand")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Brand</label>
          <select id={fieldId("brand")} value={selectedBrand?._id || ""} onChange={(e) => {
            const brand = brands.find((entry) => String(entry._id) === e.target.value);
            setForm((current) => ({ ...current, brandId: brand?._id || "", brand: brand?.name || "" }));
          }} className={inputClass}>
            <option value="">No brand</option>
            {brands.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
          {form.brand && !selectedBrand && <p className="mt-1 text-[10px] text-amber-200/80">Legacy brand “{form.brand}” is not linked. Choose a managed brand or clear this value before saving.</p>}
        </div>
        <div>
          <label htmlFor={fieldId("return-eligibility")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Return eligibility</label>
          <select id={fieldId("return-eligibility")} value={form.returnEligibility || "standard"} onChange={(e) => set("returnEligibility", e.target.value)} className={inputClass}>
            <option value="standard">Standard · eligible under return policy</option>
            <option value="final_sale">Final sale · no return or exchange</option>
            <option value="perishable">Perishable · no return or exchange</option>
            <option value="digital_product">Digital product or gift card · no return or exchange</option>
          </select>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest mb-1.5">Badges</legend>
          <div className="grid gap-2 rounded-xl border border-cream/10 bg-mall-900/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {badgesLoading && <p className="text-xs text-cream/45">Loading badges…</p>}
            {!badgesLoading && badgesError && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-red-200">
              <span>{badgesError}</span>
              <button type="button" onClick={retryBadges} className="min-h-8 rounded-md border border-red-200/20 px-2 text-red-100 hover:bg-red-200/5">Retry</button>
            </div>}
            {!badgesLoading && !badgesError && badges.map((badge) => (
              <label key={badge._id} className="flex min-h-9 items-center gap-2 text-sm text-cream/75">
                <input type="checkbox" checked={(form.badges || []).includes(badge.slug)} disabled={!(form.badges || []).includes(badge.slug) && (form.badges || []).length >= MAX_PRODUCT_BADGES} onChange={() => toggleBadge(badge.slug)} className="h-4 w-4 accent-mall-accent disabled:opacity-40" />
                <span>{badge.chipLabel}</span>
              </label>
            ))}
            {!badgesLoading && !badgesError && !badges.length && <p className="text-xs text-cream/55">No badges yet. <Link to="/admin/badges" className="text-mall-accent underline underline-offset-2 hover:text-cream">Create one in Badge management</Link>.</p>}
          </div>
          <p className="mt-1 text-[10px] text-cream/45">Select up to {MAX_PRODUCT_BADGES} badges. Flash Sale is managed separately.</p>
        </fieldset>
        <div>
          <label htmlFor={fieldId("category")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Category</label>
          <select
            id={fieldId("category")}
            value={selectedCategory?._id || ""}
            onChange={(e) => {
              const category = categories.find((entry) => entry._id === e.target.value);
              setForm((current) => ({ ...current, categoryId: category?._id || "", category: category?.name || "", subcategoryId: "", subcategory: "" }));
            }}
            className={inputClass}
          >
            <option value="">Select category</option>
            {form.category && !selectedCategory && <option value="" disabled>{form.category} (not managed)</option>}
            {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={fieldId("subcategory")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Subcategory</label>
          <select
            id={fieldId("subcategory")}
            value={selectedSubcategory?._id || ""}
            onChange={(e) => {
              const subcategory = selectedCategory?.subcategories?.find((entry) => entry._id === e.target.value);
              setForm((current) => ({ ...current, subcategoryId: subcategory?._id || "", subcategory: subcategory?.name || "" }));
            }}
            disabled={!selectedCategory}
            className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <option value="">{selectedCategory ? "Select subcategory" : "Pick a managed category first"}</option>
            {form.subcategory && selectedCategory && !selectedSubcategory && <option value="" disabled>{form.subcategory} (not in this category)</option>}
            {(selectedCategory?.subcategories || []).map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input type="checkbox" id={fieldId("flash-sale")} checked={form.isFlashSale} onChange={(e) => set("isFlashSale", e.target.checked)} className="h-4 w-4 accent-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2" />
          <label htmlFor={fieldId("flash-sale")} className="text-cream/80 text-sm">Flash Sale</label>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest mb-2">Purpose Tags</legend>
          <div className="flex gap-2 flex-wrap">
            {PURPOSES.map((tag) => (
              <button key={tag} type="button" aria-pressed={form.purposeTags.includes(tag)} onClick={() => togglePurpose(tag)}
                className={`font-mono-tag min-h-11 text-[9px] uppercase px-3 rounded-full border transition sm:min-h-0 sm:px-2.5 sm:py-1 ${
                  form.purposeTags.includes(tag) ? "bg-mall-accent text-mall-900 border-mall-accent" : "border-cream/15 text-cream/50 hover:text-cream"
                }`}>
                {tag}
              </button>
            ))}
          </div>
        </fieldset>
        </div>
      </section>

      <section className="mb-4 border-t border-cream/10 pt-4" aria-labelledby={fieldId("media-heading")}>
        <div className="mb-4 border-l-2 border-mall-accent/70 pl-3">
          <h2 id={fieldId("media-heading")} className="text-[15px] font-semibold text-cream">Product media</h2>
          <p className="mt-0.5 text-xs text-cream/60">Add up to 12 secure image URLs and set their storefront order</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={fieldId("image-url")} className="font-mono-tag text-[10px] uppercase text-cream/65 tracking-widest block mb-1.5">Product gallery images (HTTPS URLs, up to 12)</label>
          <div className="flex min-w-0 gap-2">
            <input id={fieldId("image-url")} type="url" value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImageUrl(); } }} placeholder="https://example.com/product-image.jpg" className={`${inputClass} min-w-0 flex-1`} />
            <button type="button" onClick={addImageUrl} disabled={imageUrls().length >= 12} className="h-11 w-11 shrink-0 rounded-xl bg-mall-accent text-mall-900 disabled:opacity-40" aria-label="Add image to gallery"><Plus size={16} /></button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-cream/60">The first image is the main product image. Reorder images to change the storefront gallery order.</p>
          <div className="mt-3 space-y-2">
            {imageUrls().map((url, index, urls) => (
              <div key={`${url}-${index}`} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-cream/10 bg-mall-900/40 p-2 sm:flex">
                <img src={productImageUrl(url, { width: 128, quality: 70 })} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                <p className="min-w-0 flex-1 truncate text-xs text-cream/80" title={url}>{index === 0 ? "Main image · " : `Image ${index + 1} · `}{url}</p>
                <div className="col-span-2 flex justify-end sm:ml-auto">
                  <button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0} aria-label={`Move image ${index + 1} earlier`} className="flex h-11 w-11 items-center justify-center rounded text-cream/60 hover:text-cream disabled:opacity-25 sm:h-8 sm:w-8"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => moveImage(index, 1)} disabled={index === urls.length - 1} aria-label={`Move image ${index + 1} later`} className="flex h-11 w-11 items-center justify-center rounded text-cream/60 hover:text-cream disabled:opacity-25 sm:h-8 sm:w-8"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => updateImages(urls.filter((_, imageIndex) => imageIndex !== index))} aria-label={`Remove image ${index + 1}`} className="flex h-11 w-11 items-center justify-center rounded text-cream/60 hover:text-red-300 sm:h-8 sm:w-8"><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </section>

      {/* Variants — optional. A product with none behaves exactly as before,
          using its own top-level price/stock. */}
      <section className="mb-4 border-t border-cream/10 pt-4" aria-labelledby={fieldId("options-heading")}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="border-l-2 border-mall-accent/70 pl-3">
            <h2 id={fieldId("options-heading")} className="text-[15px] font-semibold text-cream">Options & variants</h2>
            <p className="mt-0.5 text-xs text-cream/60">Optional sizes or colors, with their own SKU, price and stock</p>
          </div>
          <button type="button" onClick={addVariant}
            className="flex min-h-11 items-center gap-1 text-mall-accent text-xs font-medium hover:text-mall-accentDark transition sm:min-h-0">
            <Plus size={11} /> Add Variant
          </button>
        </div>
        {form.variants.length === 0 ? (
          <p className="text-cream/60 text-xs">No variants — this product uses its own price and stock above.</p>
        ) : (
          <div className="space-y-3">
            {form.variants.map((variant, i) => (
              <div key={i} className="bg-mall-900/40 rounded-lg p-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={variant.name}
                    onChange={(e) => updateVariant(i, "name", e.target.value)}
                    onBlur={() => autoSuggestVariantSku(i)}
                    placeholder="e.g. Red / Large"
                    aria-label={`Name for variant ${i + 1}`}
                    className="min-h-11 flex-1 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/40 outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition sm:min-h-0"
                  />
                  <input
                    value={variant.sku || ""}
                    onChange={(e) => updateVariant(i, "sku", e.target.value.toUpperCase())}
                    placeholder="Variant SKU (required to publish)"
                    aria-label={`SKU for ${variant.name || `variant ${i + 1}`}`}
                    className="min-h-11 w-full sm:min-h-0 sm:w-48 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/40 outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition"
                  />
                  <button type="button" disabled={Boolean(skuGenerating)} onClick={() => generateSku(`${form.name} ${variant.name || ""}`, (sku) => updateVariant(i, "sku", sku), `variant-${i}`)} className="min-h-9 rounded-lg border border-cream/15 px-3 text-[11px] text-cream/80 hover:text-cream disabled:opacity-50 sm:min-h-0">{skuGenerating === `variant-${i}` ? "Generating…" : variant.sku ? "New SKU" : "Generate SKU"}</button>
                  <button type="button" aria-label={`Remove variant ${i + 1}`} onClick={() => removeVariant(i)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-cream/65 hover:text-red-400 transition sm:h-7 sm:w-7">
                    <X size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 gap-2">
                  <input
                    type="number"
                    value={variant.price ?? ""}
                    onChange={(e) => updateVariant(i, "price", e.target.value)}
                    placeholder="Price (blank = default)"
                    aria-label={`Price for variant ${i + 1}`}
                    className="min-h-11 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/40 outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition sm:min-h-0"
                  />
                  <input
                    type="number"
                    value={variant.compareAtPrice ?? ""}
                    onChange={(e) => updateVariant(i, "compareAtPrice", e.target.value)}
                    placeholder="Compare at (optional)"
                    aria-label={`Compare-at price for variant ${i + 1}`}
                    className="min-h-11 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/40 outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition sm:min-h-0"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={variant.stock ?? ""}
                    onChange={(e) => updateVariant(i, "stock", e.target.value)}
                    placeholder="Stock"
                    aria-label={`Stock for variant ${i + 1}`}
                    className="min-h-11 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/40 outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition sm:min-h-0"
                  />
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    value={variant.reorderLevel ?? DEFAULT_REORDER_LEVEL}
                    onChange={(e) => updateVariant(i, "reorderLevel", e.target.value)}
                    aria-label={`Reorder level for variant ${i + 1}`}
                    placeholder={`Reorder at (${DEFAULT_REORDER_LEVEL})`}
                    className="min-h-11 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/40 outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition sm:min-h-0"
                  />
                  <input
                    value={variant.image || ""}
                    onChange={(e) => updateVariant(i, "image", e.target.value)}
                    placeholder="Image URL (optional)"
                    aria-label={`Image URL for variant ${i + 1}`}
                    className="min-h-11 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/40 outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition sm:min-h-0"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {publishIssues.length > 0 && <div role="alert" className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3"><p className="text-red-300 text-xs font-medium mb-1">Cannot publish yet. Fix these details:</p><ul className="list-disc pl-4 space-y-0.5">{publishIssues.map((issue, index) => <li key={index} className="text-red-300/80 text-xs">{issue}</li>)}</ul></div>}
      {error && <p role="alert" className="text-red-400 text-xs mb-3">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={saving} onClick={(e) => handleSave(e, "draft")} className="flex min-h-11 w-full items-center justify-center gap-1.5 border border-cream/20 text-cream font-semibold text-xs px-4 py-2 rounded-lg hover:bg-cream/5 transition disabled:opacity-50 sm:min-h-0 sm:w-auto">
          <Check size={13} /> {saving ? "Saving..." : "Save only"}
        </button>
        <button type="button" disabled={saving} onClick={(e) => handleSave(e, "published")} className="flex min-h-11 w-full items-center justify-center gap-1.5 bg-mall-accent text-mall-900 font-semibold text-xs px-4 py-2 rounded-lg hover:bg-mall-accentDark transition disabled:opacity-50 sm:min-h-0 sm:w-auto">
          <Eye size={13} /> {saving ? "Saving..." : "Save and publish"}
        </button>
        <button type="button" onClick={onCancel} className="flex min-h-11 w-full items-center justify-center gap-1.5 border border-cream/15 text-cream/50 text-xs px-4 py-2 rounded-lg hover:text-cream transition sm:min-h-0 sm:w-auto">
          <X size={13} /> Cancel
        </button>
      </div>
    </form>
  );
}

// â”€â”€â”€ Bulk CSV import â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Currently supports WooCommerce product exports (see utils/wooCommerceImport.js
// on the backend for the field mapping). Two-step flow: first analyze the
// file, then review each row's floor, shop, and managed category assignment
// before any products are written.
function BulkEditPanel({ count, floors, shops, categories, brands, selectionHasVariants, onApply, onCancel }) {
  const { badges, loading: badgesLoading, error: badgesError, retry: retryBadges } = useBadges();
  const [shop, setShop] = useState("");
  const [floorId, setFloorId] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [badgesSelected, setBadgesSelected] = useState([]);
  const [badgesTouched, setBadgesTouched] = useState(false);
  const [stock, setStock] = useState("");
  const [priceType, setPriceType] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  async function handleApply(e) {
    e.preventDefault();
    setError("");

    const set = {};
    if (floorId && !shop) {
      setError("Choose a shop on the selected floor.");
      return;
    }
    if (shop) set.shop = shop;
    if (category) {
      if (!subcategory) {
        setError("Choose a subcategory for the selected category.");
        return;
      }
      set.categoryId = category;
      set.subcategoryId = subcategory;
    }
    if (badgesTouched) {
      if (badgesSelected.length > MAX_PRODUCT_BADGES) {
        setError(`Choose no more than ${MAX_PRODUCT_BADGES} badges.`);
        return;
      }
      set.badges = badgesSelected;
      set.badge = badgesSelected[0] || "";
    }
    if (stock !== "") set.stock = Number(stock);

    const priceAdjustment = priceType && priceValue !== "" ? { type: priceType, value: priceValue } : null;

    if (Object.keys(set).length === 0 && !priceAdjustment) {
      setError("Change at least one field before applying");
      return;
    }

    setApplying(true);
    try {
      await onApply({ set, priceAdjustment });
    } catch (err) {
      setError(err.response?.data?.message || "Bulk edit failed");
    } finally {
      setApplying(false);
    }
  }

  const inputClass = "w-full min-h-11 sm:min-h-0 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition";
  const selectedCategory = categories.find((entry) => entry._id === category);
  const floorShops = shops.filter((entry) => String(entry.floor?._id || entry.floor || "") === floorId);

  return (
    <div className="border border-mall-accent/30 rounded-2xl p-3 sm:p-5 bg-mall-accent/5 mb-4">
      <p className="text-cream text-sm font-medium mb-4">
        Editing {count} product{count !== 1 ? "s" : ""} — only filled-in fields will change
      </p>
      <form onSubmit={handleApply}>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Move to Floor</label>
            <select value={floorId} onChange={(e) => { setFloorId(e.target.value); setShop(""); }} className={inputClass}>
              <option value="">Don't change floor/shop</option>
              {floors.filter((floor) => floor.isActive !== false).map((floor) => <option key={floor._id} value={floor._id}>Floor {floor.floorNumber}: {floor.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Move to Shop</label>
            <select value={shop} onChange={(e) => setShop(e.target.value)} disabled={!floorId} className={`${inputClass} disabled:opacity-40`}>
              <option value="">{floorId ? "Choose shop on this floor" : "Choose a floor first"}</option>
              {floorShops.map((s) => <option key={s._id} value={s._id}>#{s.shopNumber} {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Set Category</label>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(""); }} className={inputClass}>
              <option value="">Don't change</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Set Subcategory</label>
            <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} disabled={!selectedCategory} className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}>
              <option value="">{selectedCategory ? "Choose subcategory" : "Choose a category first"}</option>
              {(selectedCategory?.subcategories || []).map((entry) => <option key={entry._id} value={entry._id}>{entry.name}</option>)}
            </select>
          </div>
          <fieldset>
            <legend className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest mb-1.5">Set Badges</legend>
            <div className="grid max-h-36 gap-1 overflow-y-auto rounded-xl border border-cream/10 p-2 sm:grid-cols-2">
              {badgesLoading && <p className="text-xs text-cream/45">Loading badges…</p>}
              {!badgesLoading && badgesError && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-red-200">
                <span>{badgesError}</span>
                <button type="button" onClick={retryBadges} className="min-h-8 rounded-md border border-red-200/20 px-2 text-red-100 hover:bg-red-200/5">Retry</button>
              </div>}
              {!badgesLoading && !badgesError && badges.map((badge) => (
                <label key={badge._id} className="flex items-center gap-2 py-1 text-xs text-cream/70">
                  <input type="checkbox" checked={badgesSelected.includes(badge.slug)} disabled={!badgesSelected.includes(badge.slug) && badgesSelected.length >= MAX_PRODUCT_BADGES} onChange={() => {
                    setBadgesTouched(true);
                    setBadgesSelected((current) => current.includes(badge.slug) ? current.filter((value) => value !== badge.slug) : [...current, badge.slug]);
                  }} className="h-4 w-4 accent-mall-accent disabled:opacity-40" />
                  <span>{badge.chipLabel}</span>
                </label>
              ))}
            </div>
            {!badgesLoading && !badgesError && !badges.length && <p className="mt-1 text-xs text-cream/55">No badges yet. <Link to="/admin/badges" className="text-mall-accent underline underline-offset-2">Create one in Badge management</Link>.</p>}
            <p className="mt-1 text-[10px] text-cream/40">{badgesTouched ? `Selected badges will replace the current set (${badgesSelected.length}/${MAX_PRODUCT_BADGES}).` : `Select up to ${MAX_PRODUCT_BADGES} badges to replace the current set.`}</p>
          </fieldset>
          <div>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Set Stock</label>
            <input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} placeholder={selectionHasVariants ? "Edit variants individually" : "Don't change"} disabled={selectionHasVariants} className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`} />
          </div>
          <div>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Price Adjustment</label>
            <select value={priceType} onChange={(e) => setPriceType(e.target.value)} disabled={selectionHasVariants} className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}>
              <option value="">Don't change</option>
              <option value="percent">Adjust by %</option>
              <option value="flat">Adjust by flat KSh amount</option>
              <option value="set">Set exact price</option>
            </select>
          </div>
          <div>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">
              {priceType === "percent" ? "% (e.g. 10 or -10)" : priceType === "flat" ? "KSh amount (e.g. -200)" : "New price (KSh)"}
            </label>
            <input
              type="number"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              disabled={!priceType || selectionHasVariants}
              className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}
            />
          </div>
        </div>
        {selectionHasVariants && <p className="mb-3 text-xs text-amber-200/80">This selection includes variable products. Bulk price and stock edits are disabled because those values belong to each option. Edit those products individually.</p>}
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={applying} className="flex min-h-11 w-full items-center justify-center gap-1.5 bg-mall-accent text-mall-900 font-semibold text-xs px-4 py-2 rounded-lg hover:bg-mall-accentDark transition disabled:opacity-50 sm:min-h-0 sm:w-auto">
            <Check size={13} /> {applying ? "Applying..." : `Apply to ${count} product${count !== 1 ? "s" : ""}`}
          </button>
          <button type="button" onClick={onCancel} className="flex min-h-11 w-full items-center justify-center gap-1.5 border border-cream/15 text-cream/50 text-xs px-4 py-2 rounded-lg hover:text-cream transition sm:min-h-0 sm:w-auto">
            <X size={13} /> Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminProducts() {
  const { badgesBySlug } = useBadges();
  const [products, setProducts] = useState([]);
  const [floors, setFloors] = useState([]);
  const [shops, setShops] = useState([]);
  const [allShops, setAllShops] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("");
  const [shopFilter, setShopFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showMatchingArchiveConfirm, setShowMatchingArchiveConfirm] = useState(false);
  const [restockTarget, setRestockTarget] = useState(null);
  const [matchingArchiveBusy, setMatchingArchiveBusy] = useState(false);
  const [matchingArchiveError, setMatchingArchiveError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataError, setMetadataError] = useState("");
  const [metadataAttempt, setMetadataAttempt] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Reference data for the form's dropdowns — fetched once, not paginated
  // (these lists are small and needed in full regardless of which page of
  // products is currently showing).
  useEffect(() => {
    let active = true;
    setMetadataLoading(true);
    setMetadataError("");
    Promise.all([api.get("/floors/admin/list"), api.get("/shops"), loadAllAdminShops(), api.get("/categories"), api.get("/brands")])
      .then(([floorsRes, shopsRes, adminShops, catRes, brandRes]) => {
        if (!active) return;
        setFloors(floorsRes.data);
        setShops(shopsRes.data);
        setAllShops(adminShops);
        setCategories(catRes.data);
        setBrands(brandRes.data);
      })
      .catch(() => { if (active) setMetadataError("Product form options could not be loaded."); })
      .finally(() => { if (active) setMetadataLoading(false); });
    return () => { active = false; };
  }, [metadataAttempt]);

  function load() {
    setLoading(true);
    setLoadError("");
    api.get("/products/admin/list", { params: { search: search || undefined, status: statusFilter, category: categoryFilter || undefined, inventory: inventoryFilter, floor: floorFilter || undefined, shop: shopFilter || undefined, page, limit: 20 } })
      .then((res) => {
        setProducts(res.data.products);
        setPages(res.data.pages);
        setTotal(res.data.total);
      })
      .catch(() => setLoadError("Products could not be loaded."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [search, page, statusFilter, categoryFilter, inventoryFilter, floorFilter, shopFilter, loadAttempt]);
  // Keep selection scoped to the current query/page unless the admin
  // explicitly opts into the all-matching archive selection.
  useEffect(() => {
    setSelectedIds([]);
    setAllMatchingSelected(false);
    setShowBulkEdit(false);
  }, [search, page, statusFilter, categoryFilter, inventoryFilter, floorFilter, shopFilter]);

  async function handleAdd(form) { await api.post("/products", form); clearHomeCache(); setShowAdd(false); load(); }
  async function handleEdit(id, form) { await api.put(`/products/${id}`, form); clearHomeCache(); setEditId(null); load(); }
  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.delete(`/products/${deleteTarget._id}`);
      clearHomeCache();
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Could not delete this product.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleArchive(product) {
    try {
      await api.patch(`/products/${product._id}/archive`);
      clearHomeCache();
      load();
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Could not archive this product.");
    }
  }

  async function handleRestore(product) {
    try {
      await api.patch(`/products/${product._id}/restore`);
      clearHomeCache();
      load();
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Could not restore this product.");
    }
  }

  async function handleBulkEdit(changes) {
    await api.patch("/products/bulk-edit", { ids: selectedIds, ...changes });
    clearHomeCache();
    setSelectedIds([]);
    setShowBulkEdit(false);
    load();
  }

  async function handleRestock(payload) {
    await api.post(`/products/admin/${restockTarget._id}/restock`, payload);
    clearHomeCache();
    setRestockTarget(null);
    load();
  }

  async function handleArchiveAllMatching() {
    setMatchingArchiveBusy(true);
    setMatchingArchiveError("");
    try {
      await api.post("/products/admin/archive-matching", {
        search,
        status: statusFilter,
        category: categoryFilter,
        inventory: inventoryFilter,
        floor: floorFilter,
        shop: shopFilter,
        expectedCount: total,
      });
      clearHomeCache();
      setShowMatchingArchiveConfirm(false);
      setAllMatchingSelected(false);
      setSelectedIds([]);
      setDeleteError("");
      if (page !== 1) setPage(1);
      else setLoadAttempt((attempt) => attempt + 1);
    } catch (err) {
      const message = err.response?.data?.message || "Matching products could not be archived.";
      if (err.response?.status === 409) {
        setShowMatchingArchiveConfirm(false);
        setAllMatchingSelected(false);
        setSelectedIds([]);
        setDeleteError(message);
        if (page !== 1) setPage(1);
        else setLoadAttempt((attempt) => attempt + 1);
      } else {
        setMatchingArchiveError(message);
      }
    } finally {
      setMatchingArchiveBusy(false);
    }
  }

  function handleSearchChange(value) {
    setSearch(value);
    setPage(1);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => prev.length === filtered.length ? [] : filtered.map((p) => p._id));
  }

  function toggleAllMatching() {
    setSelectedIds([]);
    setAllMatchingSelected(true);
    setShowBulkEdit(false);
  }

  const filtered = products;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-cream/10 pb-4">
        <div>
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">Admin</p>
          <h1 className="font-display text-2xl text-cream">Products</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => downloadCsv(api, "/products/export", "products-export.csv")}
            className="flex min-h-11 items-center justify-center gap-1.5 border border-cream/15 text-cream/70 font-semibold text-xs px-4 py-2.5 rounded-xl hover:text-cream hover:border-cream/30 transition sm:min-h-0">
            <Download size={13} /> Export CSV
          </button>
          <button type="button" onClick={() => { setShowImport(true); setShowAdd(false); setEditId(null); }}
            disabled={metadataLoading || Boolean(metadataError)}
            className="flex min-h-11 items-center justify-center gap-1.5 border border-cream/15 text-cream/70 font-semibold text-xs px-4 py-2.5 rounded-xl hover:text-cream hover:border-cream/30 transition disabled:opacity-40 disabled:cursor-not-allowed sm:min-h-0">
            <FileSpreadsheet size={13} /> Import CSV
          </button>
          <button type="button" onClick={() => { setShowAdd(true); setShowImport(false); setEditId(null); }}
            disabled={metadataLoading || Boolean(metadataError)}
            className="flex min-h-11 items-center justify-center gap-1.5 bg-mall-accent text-mall-900 font-semibold text-xs px-4 py-2.5 rounded-xl hover:bg-mall-accentDark transition disabled:opacity-40 disabled:cursor-not-allowed sm:min-h-0">
            <Plus size={13} /> Add Product
          </button>
        </div>
      </div>

      {metadataLoading && <p className="mb-4 text-xs text-cream/45" role="status">Loading product form options…</p>}
      {metadataError && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3">
          <p className="text-sm text-red-200">{metadataError} Add and import are paused until the options are available.</p>
          <button onClick={() => setMetadataAttempt((attempt) => attempt + 1)} className="shrink-0 text-sm text-mall-accent hover:underline">Retry</button>
        </div>
      )}

      {deleteError && <p role="alert" className="mb-4 text-sm text-red-400">{deleteError}</p>}
      {showImport && (
        <ProductImportPanel
          floors={floors}
          shops={shops}
          categories={categories}
          brands={brands}
          onDone={() => { clearHomeCache(); setShowImport(false); load(); }}
          onCancel={() => setShowImport(false)}
        />
      )}

      {showAdd && <ProductForm floors={floors} shops={shops} categories={categories} brands={brands} onSave={handleAdd} onCancel={() => setShowAdd(false)} />}

      <div className="mb-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="Product status">
        {[ ["all", "All products"], ["published", "Published"], ["draft", "Drafts"], ["archived", "Archived"] ].map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={statusFilter === value} onClick={() => { setStatusFilter(value); setPage(1); }}
            className={`min-h-11 whitespace-nowrap rounded-full px-3.5 py-3 text-xs font-medium transition sm:min-h-0 sm:py-2 ${statusFilter === value ? "bg-mall-accent text-mall-900" : "border border-cream/10 text-cream/55 hover:text-cream"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mb-5 rounded-2xl border border-cream/10 bg-mall-900/35 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <label htmlFor="product-search" className="sr-only">Search products</label>
          <input
            id="product-search"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search products..."
            className="min-h-11 w-full min-w-0 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/35 outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition"
          />
          <label htmlFor="product-category-filter" className="sr-only">Filter products by category</label>
          <select
            id="product-category-filter"
            aria-label="Filter products by category"
            value={categoryFilter}
            onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}
            className="min-h-11 w-full min-w-0 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition"
          >
            <option value="">All categories</option>
            {categories.map((category) => <option key={category._id} value={category.name}>{category.name}</option>)}
          </select>
          <label htmlFor="product-inventory-filter" className="sr-only">Filter products by inventory</label>
          <select
            id="product-inventory-filter"
            aria-label="Filter products by inventory"
            value={inventoryFilter}
            onChange={(event) => { setInventoryFilter(event.target.value); setPage(1); }}
            className="min-h-11 w-full min-w-0 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition"
          >
            <option value="all">All inventory</option>
            <option value="in_stock">In stock · more than 5</option>
            <option value="low_stock">Low stock · 1–5</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="needs_restock">At or below reorder level</option>
          </select>
          <label htmlFor="product-floor-filter" className="sr-only">Filter products by floor</label>
          <select
            id="product-floor-filter"
            aria-label="Filter products by floor"
            value={floorFilter}
            onChange={(event) => { setFloorFilter(event.target.value); setShopFilter(""); setPage(1); }}
            className="min-h-11 w-full min-w-0 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition"
          >
            <option value="">All floors</option>
            {floors.map((floor) => <option key={floor._id} value={floor._id}>Floor {floor.floorNumber}: {floor.name}</option>)}
          </select>
          <label htmlFor="product-shop-filter" className="sr-only">Filter products by shop</label>
          <select
            id="product-shop-filter"
            aria-label="Filter products by shop"
            value={shopFilter}
            onChange={(event) => { setShopFilter(event.target.value); setPage(1); }}
            className="min-h-11 w-full min-w-0 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm outline-none focus:border-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2 transition"
          >
            <option value="">All shops</option>
            {allShops.filter((shop) => !floorFilter || String(shop.floor?._id || shop.floor || "") === floorFilter).map((shop) => <option key={shop._id} value={shop._id}>#{shop.shopNumber} {shop.name}{shop.isActive === false ? " (inactive)" : ""}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-cream/10 pb-3">
        <div>
          <p className="font-mono-tag text-[9px] uppercase tracking-[0.18em] text-cream/35">Catalog results</p>
          <p className="mt-0.5 text-sm font-medium text-cream/80">{total.toLocaleString()} product{total === 1 ? "" : "s"} <span className="text-xs font-normal text-cream/40">· page {page} of {pages}</span></p>
        </div>
        {(search || categoryFilter || inventoryFilter !== "all" || statusFilter !== "all" || floorFilter || shopFilter) && (
          <div className="flex flex-wrap gap-1.5 text-[10px] text-cream/50">
            {search && <span className="max-w-full break-words rounded-full border border-cream/10 px-2 py-1">Search: {search}</span>}
            {categoryFilter && <span className="max-w-full break-words rounded-full border border-cream/10 px-2 py-1">{categoryFilter}</span>}
            {inventoryFilter !== "all" && <span className="rounded-full border border-mall-accent/20 bg-mall-accent/5 px-2 py-1 text-mall-accent">{inventoryFilter === "in_stock" ? "In stock >5" : inventoryFilter === "low_stock" ? "Low stock 1–5" : inventoryFilter === "needs_restock" ? "At or below reorder level" : "Out of stock"}</span>}
            {floorFilter && <span className="rounded-full border border-cream/10 px-2 py-1">{floors.find((floor) => String(floor._id) === floorFilter)?.name || "Selected floor"}</span>}
            {shopFilter && <span className="rounded-full border border-cream/10 px-2 py-1">{allShops.find((shop) => String(shop._id) === shopFilter)?.name || "Selected shop"}</span>}
            {statusFilter !== "all" && <span className="rounded-full border border-cream/10 px-2 py-1">{statusFilter}</span>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Package size={32} className="text-cream/15 mx-auto mb-3" />
          <p className="text-cream/30 text-sm">No products found.</p>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-h-11 items-center gap-2 text-cream/50 text-xs cursor-pointer">
              <input
                type="checkbox"
                aria-label="Select all products on this page"
                checked={allMatchingSelected || (filtered.length > 0 && selectedIds.length === filtered.length)}
                onChange={() => {
                  if (allMatchingSelected) {
                    setAllMatchingSelected(false);
                    setSelectedIds([]);
                  } else {
                    toggleSelectAll();
                  }
                }}
                className="w-5 h-5 accent-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2"
              />
              {allMatchingSelected
                ? `${total.toLocaleString()} matching products selected across all pages`
                : selectedIds.length > 0
                  ? `${selectedIds.length} selected on this page`
                  : `${total.toLocaleString()} products`}
            </label>
            {allMatchingSelected ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <button type="button" onClick={() => { setAllMatchingSelected(false); setSelectedIds([]); }} className="min-h-11 w-full rounded-lg border border-cream/15 px-3 py-2 text-xs text-cream/65 hover:text-cream transition sm:w-auto">
                  Clear selection
                </button>
                {statusFilter !== "archived" && (
                  <button type="button" onClick={() => { setMatchingArchiveError(""); setShowMatchingArchiveConfirm(true); }} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-400 sm:w-auto">
                    <Archive size={13} /> Archive all {total.toLocaleString()} matching
                  </button>
                )}
              </div>
            ) : selectedIds.length > 0 && !showBulkEdit && (
              <button onClick={() => setShowBulkEdit(true)}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 bg-mall-accent text-mall-900 font-semibold text-xs px-4 py-2 rounded-lg hover:bg-mall-accentDark transition sm:w-auto">
                <Pencil size={13} /> Bulk Edit
              </button>
            )}
          </div>

          {selectedIds.length > 0 && selectedIds.length === filtered.length && statusFilter !== "archived" && !allMatchingSelected && (
            <div className="mb-4 flex flex-col items-stretch gap-2 rounded-xl border border-mall-accent/25 bg-mall-accent/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-cream/65">{total > filtered.length ? "You selected every product on this page." : `All ${total.toLocaleString()} matching products fit on this page.`}</p>
              <button type="button" onClick={toggleAllMatching} className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-mall-accent underline decoration-mall-accent/40 underline-offset-4 hover:text-cream transition sm:w-auto sm:text-right">
                {total > filtered.length ? `Select all ${total.toLocaleString()} matching products across all pages` : `Select all ${total.toLocaleString()} matching products`}
              </button>
            </div>
          )}

          {showBulkEdit && selectedIds.length > 0 && !allMatchingSelected && (
            <BulkEditPanel
              count={selectedIds.length}
              floors={floors}
              shops={shops}
              categories={categories}
              brands={brands}
              selectionHasVariants={products.some((product) => selectedIds.includes(product._id) && product.variants?.length > 0)}
              onApply={handleBulkEdit}
              onCancel={() => setShowBulkEdit(false)}
            />
          )}

          <div className="space-y-2">
            {filtered.map((product) => (
              <div key={product._id}>
                {editId === product._id ? (
                  <div className="py-3">
                    <ProductForm initial={product} floors={floors} shops={shops} categories={categories} brands={brands} onSave={(form) => handleEdit(product._id, form)} onCancel={() => setEditId(null)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 rounded-xl border border-cream/10 bg-mall-900/35 p-3 transition-colors hover:bg-mall-900/55 xl:grid-cols-[auto_auto_minmax(0,1.35fr)_minmax(10rem,0.8fr)_minmax(9rem,0.75fr)_auto] xl:gap-4 xl:p-4">
                    <label className="flex h-11 w-11 shrink-0 items-center justify-center sm:h-5 sm:w-5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${product.name}`}
                        checked={allMatchingSelected || selectedIds.includes(product._id)}
                        disabled={allMatchingSelected}
                        onChange={() => toggleSelect(product._id)}
                        className="h-5 w-5 accent-mall-accent focus-visible:!outline-2 focus-visible:!outline-[#1683FF] focus-visible:!outline-offset-2"
                      />
                    </label>
                    {product.images?.[0] ? (
                      <img src={productImageUrl(product.images[0], { width: 128, quality: 70 })} alt={product.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-mall-800 flex items-center justify-center shrink-0">
                        <Package size={16} className="text-cream/20" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        {product.brand && <p className="font-mono-tag text-[9px] uppercase text-mall-accent tracking-widest">{product.brand}</p>}
                        {getProductBadges(product).slice(0, 2).map((badge) => <span key={badge} className="font-mono-tag text-[9px] uppercase text-cream/30">{badgesBySlug[badge]?.chipLabel || badge}</span>)}
                        {getProductBadges(product).length > 2 && <span className="font-mono-tag text-[9px] uppercase text-cream/30">+{getProductBadges(product).length - 2}</span>}
                      </div>
                      <p className="w-full break-words text-cream text-[15px] font-semibold leading-snug">{product.name}</p>
                      <p className="mt-1 break-words font-mono-tag text-[11px] tracking-wide text-cream/65">{product.sku || "SKU not set"}</p>
                    </div>
                    <div className="col-span-3 grid min-w-0 grid-cols-2 gap-3 border-t border-cream/10 pt-2.5 xl:col-span-1 xl:block xl:border-t-0 xl:pt-0">
                      <div className="min-w-0">
                        <p className="font-mono-tag text-[10px] uppercase tracking-widest text-cream/60">Price</p>
                        <p className="font-display mt-0.5 break-words text-base text-cream/90">{getStartingPrice(product) ? `${product.variants?.length ? "From " : ""}KSh ${getStartingPrice(product).toLocaleString()}` : "Price not set"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono-tag text-[10px] uppercase tracking-widest text-cream/60">Stock</p>
                        <p className="mt-0.5 break-words text-[13px] text-cream/70">{getStockLabel(product)}</p>
                        {getLowStockWarning(product) && <p className="mt-1 text-[10px] font-medium text-amber-200" role="status">{getLowStockWarning(product)}</p>}
                      </div>
                    </div>
                    <div className="col-span-3 min-w-0 border-t border-cream/10 pt-2.5 xl:col-span-1 xl:border-t-0 xl:pt-0">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${product.status === "published" ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-300" : product.status === "archived" ? "border-red-300/30 bg-red-400/15 text-red-200" : "border-amber-300/20 bg-amber-500/10 text-amber-200"}`}>{product.status === "archived" ? "Archived" : (product.status || (product.isActive ? "published" : "draft"))}</span>
                      {product.shop && <p className="mt-0.5 break-words text-cream/60 text-[11px]">Shop #{product.shop.shopNumber} · {product.shop.name}</p>}
                      {product.shop?.isActive === false && <p className="mt-0.5 text-amber-200/80 text-[10px]">Shop inactive · hidden from storefront and new checkout</p>}
                      {product.publishIssues?.length > 0 && <p className="mt-1 text-[10px] text-red-300">{product.publishIssues.length} publication requirement{product.publishIssues.length === 1 ? "" : "s"} incomplete</p>}
                      {product.publishIssues?.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-[10px] text-red-300/70">View required details</summary><ul className="mt-1 list-disc space-y-0.5 pl-4">{product.publishIssues.map((issue, index) => <li key={index} className="text-[10px] text-red-200/70">{issue}</li>)}</ul></details>}
                      {product.catalogReview?.duplicateSiblings?.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-[10px] text-amber-200">Possible duplicate · {product.catalogReview.duplicateSiblings.length} match{product.catalogReview.duplicateSiblings.length === 1 ? "" : "es"}</summary><ul className="mt-1 list-disc space-y-0.5 pl-4">{product.catalogReview.duplicateSiblings.map((sibling) => <li key={sibling._id} className="text-[10px] text-amber-100/70">{sibling.name}{sibling.brand ? ` · ${sibling.brand}` : ""} · same shop</li>)}</ul></details>}
                      {product.catalogReview?.archiveReview && <p className="mt-1 text-[10px] text-amber-100/75">Review: {product.catalogReview.archiveReview}</p>}
                    </div>
                    <div className="col-span-3 flex w-full items-center justify-end gap-2 border-t border-cream/10 pt-2.5 xl:col-auto xl:ml-0 xl:w-auto xl:border-t-0 xl:pt-0">
                      <button type="button" aria-label={`Restock ${product.name}`} title="Record stock received" onClick={() => setRestockTarget(product)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-mall-800 px-2 text-cream/65 transition hover:text-mall-accent xl:w-11 xl:flex-none xl:px-0"><Plus size={13} /><span className="text-[11px] xl:hidden">Restock</span></button>
                      <ProductInventoryHistory product={product} />
                      <button type="button" aria-label={`Edit ${product.name}`} title={`Edit ${product.name}`} onClick={() => { setEditId(product._id); setShowAdd(false); }} disabled={metadataLoading || Boolean(metadataError)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-mall-800 px-2 text-cream/65 transition hover:text-cream disabled:opacity-30 disabled:cursor-not-allowed xl:min-h-11 xl:w-11 xl:flex-none xl:px-0">
                        <Pencil size={13} /><span className="text-[11px] xl:hidden">Edit</span>
                      </button>
                      {product.status === "archived" ? (
                        <>
                          <button type="button" aria-label={`Restore ${product.name} as draft`} title="Restore as draft" onClick={() => handleRestore(product)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-mall-800 px-2 text-cream/65 transition hover:text-emerald-300 xl:w-11 xl:flex-none xl:px-0"><ArchiveRestore size={13} /><span className="text-[11px] xl:hidden">Restore</span></button>
                          <button type="button" aria-label={`Permanently delete ${product.name}`} title="Permanently delete" onClick={() => { setDeleteError(""); setDeleteTarget(product); }} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-mall-800 px-2 text-cream/65 transition hover:text-red-400 xl:w-11 xl:flex-none xl:px-0"><Trash2 size={13} /><span className="text-[11px] xl:hidden">Delete</span></button>
                        </>
                      ) : (
                        <button type="button" aria-label={`Archive ${product.name}`} title="Archive product" onClick={() => handleArchive(product)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-mall-800 px-2 text-cream/65 transition hover:text-amber-300 xl:w-11 xl:flex-none xl:px-0"><Archive size={13} /><span className="text-[11px] xl:hidden">Archive</span></button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <AdminPagination page={page} pages={pages} onChange={setPage} />
      {restockTarget && <ProductRestockForm product={restockTarget} shops={shops} onSubmit={handleRestock} onCancel={() => setRestockTarget(null)} />}
      {deleteTarget && <AdminConfirmDialog title={`Permanently delete ${deleteTarget.name}?`} description="This cannot be undone. Products with order history or active reservations cannot be permanently deleted; archive them instead." busy={deleting} onClose={() => !deleting && setDeleteTarget(null)} onConfirm={handleDelete} />}
      {showMatchingArchiveConfirm && <AdminConfirmDialog
        title="Archive all matching products?"
        description={`Archive exactly ${total.toLocaleString()} products matching the current search and filters across all pages? Archived products can be restored as drafts.`}
        confirmLabel={`Archive ${total.toLocaleString()} products`}
        busy={matchingArchiveBusy}
        busyLabel="Archiving…"
        error={matchingArchiveError}
        onClose={() => !matchingArchiveBusy && setShowMatchingArchiveConfirm(false)}
        onConfirm={handleArchiveAllMatching}
      />}
    </div>
  );
}
