import { useEffect, useId, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Package, Upload, CheckCircle2, AlertCircle, FileSpreadsheet, Download, Archive, ArchiveRestore, Eye, ArrowUp, ArrowDown } from "lucide-react";
import api from "../../api/client";
import AdminPagination from "../../components/AdminPagination";
import AdminConfirmDialog from "../../components/admin/AdminConfirmDialog";
import AdminLoadError from "../../components/AdminLoadError";
import { downloadCsv } from "../../utils/downloadCsv";
import { useBadges } from "../../context/BadgesContext";
import { getStartingPrice } from "../../utils/productPricing";
import { clearHomeCache } from "../../utils/homeCache";
import { productImageUrl } from "../../utils/productImageUrl";

const PURPOSES = ["work", "gaming", "travel", "home", "fitness"];
const EMPTY = { name: "", sku: "", description: "", longDescription: "", price: "", compareAtPrice: "", images: "", shop: "", category: "", subcategory: "", brand: "", stock: "", badge: "", returnEligibility: "standard", isFlashSale: false, purposeTags: [], variants: [], status: "draft" };

function ProductForm({ initial, shops, categories, brands, onSave, onCancel }) {
  const { badges } = useBadges();
  const formId = useId().replace(/:/g, "");
  const fieldId = (name) => `${formId}-${name}`;
  const [form, setForm] = useState(initial
    ? { ...initial, images: initial.images?.join(", ") || "", purposeTags: initial.purposeTags || [], variants: initial.variants || [] }
    : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [publishIssues, setPublishIssues] = useState(initial?.publishIssues || []);
  const [imageUrlInput, setImageUrlInput] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function togglePurpose(tag) {
    setForm((f) => ({
      ...f,
      purposeTags: f.purposeTags.includes(tag) ? f.purposeTags.filter((t) => t !== tag) : [...f.purposeTags, tag],
    }));
  }

  function addVariant() {
    setForm((f) => ({ ...f, variants: [...f.variants, { name: "", sku: "", price: "", compareAtPrice: "", stock: "", image: "" }] }));
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

  const selectedCategory = categories.find((category) => category.name.trim().toLocaleLowerCase() === String(form.category || "").trim().toLocaleLowerCase());
  const selectedSubcategory = selectedCategory?.subcategories?.find((subcategory) => subcategory.name.trim().toLocaleLowerCase() === String(form.subcategory || "").trim().toLocaleLowerCase());

  async function handleSave(e, requestedStatus = "draft") {
    e?.preventDefault();
    setError("");
    const variants = form.variants;
    const issues = [];
    if (!form.name.trim()) issues.push("Add a product name.");
    if (!form.shop?._id && !form.shop) issues.push("Choose a shop.");
    if (!selectedCategory) issues.push("Choose a category from the managed category list.");
    if (!selectedSubcategory) issues.push("Choose a subcategory from the selected category.");
    if (!form.images.split(",").map((s) => s.trim()).filter(Boolean).length) issues.push("Add at least one product image URL.");
    if (variants.length) variants.forEach((v, index) => {
      const label = v.name?.trim() || `Option ${index + 1}`;
      if (!v.name?.trim()) issues.push(`${label}: add a customer-facing option name.`);
      if (!v.sku?.trim()) issues.push(`${label}: add a unique SKU.`);
      const effectivePrice = v.price === "" || v.price === undefined || v.price === null ? form.price : v.price;
      if (!Number.isFinite(Number(effectivePrice)) || Number(effectivePrice) <= 0) issues.push(`${label}: add a price greater than zero.`);
      if (v.stock === "" || v.stock === undefined || v.stock === null || !Number.isInteger(Number(v.stock)) || Number(v.stock) < 0) issues.push(`${label}: confirm a whole-number stock quantity (zero is allowed).`);
      const effectiveCompareAt = v.compareAtPrice === "" || v.compareAtPrice === undefined || v.compareAtPrice === null ? form.compareAtPrice : v.compareAtPrice;
      if (effectiveCompareAt && Number(effectiveCompareAt) > 0 && Number(effectiveCompareAt) <= Number(effectivePrice)) issues.push(`${label}: compare-at price must be higher than its selling price.`);
    });
    else {
      if (!form.sku?.trim()) issues.push("Add a unique product SKU.");
      if (!(Number(form.price) > 0)) issues.push("Add a price greater than zero.");
      if (form.stock === "" || form.stock === undefined || !Number.isInteger(Number(form.stock)) || Number(form.stock) < 0) issues.push("Confirm a whole-number stock quantity (zero is allowed).");
    }
    setPublishIssues(issues);
    if (requestedStatus === "published" && issues.length) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        status: requestedStatus,
        shop: form.shop?._id || form.shop,
        images: form.images ? form.images.split(",").map((s) => s.trim()).filter(Boolean) : [],
        price: form.price === "" || form.price === undefined ? null : Number(form.price),
        compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
        stock: form.stock === "" || form.stock === undefined ? null : Number(form.stock),
        variants: form.variants
          .map((v) => ({
            ...(v._id ? { _id: v._id } : {}),
            name: v.name.trim(),
            sku: v.sku || "",
            price: v.price !== "" && v.price !== undefined ? Number(v.price) : null,
            compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : null,
            stock: v.stock === "" || v.stock === undefined ? null : Number(v.stock),
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

  const inputClass = "w-full min-h-11 sm:min-h-0 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition";

  return (
    <form onSubmit={handleSave} className="border border-cream/10 rounded-2xl p-3 sm:p-5 bg-mall-800/50 mb-4">
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div className="sm:col-span-2">
          <label htmlFor={fieldId("name")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Product Name</label>
          <input id={fieldId("name")} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Oraimo AirBuds Pro" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={fieldId("description")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Short Description</label>
          <textarea id={fieldId("description")} value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={fieldId("long-description")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Long Description</label>
          <textarea id={fieldId("long-description")} value={form.longDescription || ""} onChange={(e) => set("longDescription", e.target.value)} rows={5} className={`${inputClass} resize-y`} />
        </div>
        <div>
          <label htmlFor={fieldId("sku")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">SKU {form.variants.length ? "(optional group code)" : ""}</label>
          <input id={fieldId("sku")} value={form.sku || ""} onChange={(e) => set("sku", e.target.value.toUpperCase())} placeholder={form.variants.length ? "Optional parent code" : "e.g. JBL-CLIP4-BLK"} className={inputClass} />
        </div>
        <div>
          <label htmlFor={fieldId("price")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Price (KSh)</label>
          <input id={fieldId("price")} type="number" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="3499" className={inputClass} />
        </div>
        <div>
          <label htmlFor={fieldId("compare-price")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Compare At Price</label>
          <input id={fieldId("compare-price")} type="number" value={form.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} placeholder="4500" className={inputClass} />
        </div>
        <div>
          <label htmlFor={fieldId("shop")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Shop</label>
          <select id={fieldId("shop")} value={form.shop?._id || form.shop} onChange={(e) => set("shop", e.target.value)} className={inputClass}>
            <option value="">Select shop</option>
            {form.shop?._id && !shops.some((shop) => shop._id === form.shop._id) && <option value={form.shop._id} disabled>#{form.shop.shopNumber} {form.shop.name} (inactive)</option>}
            {shops.map((s) => <option key={s._id} value={s._id}>#{s.shopNumber} {s.name}</option>)}
          </select>
          {form.shop?.isActive === false && <p className="mt-1 text-[10px] text-amber-200/80">This shop is inactive, so the product is hidden from shoppers. Move it to an active shop before publishing.</p>}
        </div>
        <div>
          <label htmlFor={fieldId("brand")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Brand</label>
          <select id={fieldId("brand")} value={form.brand} onChange={(e) => set("brand", e.target.value)} className={inputClass}>
            <option value="">Select brand</option>
            {brands.map((b) => <option key={b._id} value={b.name}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={fieldId("stock")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Stock</label>
          <input id={fieldId("stock")} type="number" min="0" step="1" value={form.stock ?? ""} onChange={(e) => set("stock", e.target.value)} placeholder="Enter confirmed whole-number stock" className={inputClass} />
        </div>
        <div>
          <label htmlFor={fieldId("return-eligibility")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Return eligibility</label>
          <select id={fieldId("return-eligibility")} value={form.returnEligibility || "standard"} onChange={(e) => set("returnEligibility", e.target.value)} className={inputClass}>
            <option value="standard">Standard · eligible under return policy</option>
            <option value="final_sale">Final sale · no return or exchange</option>
            <option value="perishable">Perishable · no return or exchange</option>
            <option value="digital_product">Digital product or gift card · no return or exchange</option>
          </select>
        </div>
        <div>
          <label htmlFor={fieldId("badge")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Badge</label>
          <select id={fieldId("badge")} value={form.badge} onChange={(e) => set("badge", e.target.value)} className={inputClass}>
            <option value="">None</option>
            {badges.map((b) => <option key={b._id} value={b.slug}>{b.chipLabel}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={fieldId("category")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Category</label>
          <select
            id={fieldId("category")}
            value={selectedCategory?.name || form.category}
            onChange={(e) => { set("category", e.target.value); set("subcategory", ""); }}
            className={inputClass}
          >
            <option value="">Select category</option>
            {form.category && !selectedCategory && <option value={form.category} disabled>{form.category} (not managed)</option>}
            {categories.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={fieldId("subcategory")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Subcategory</label>
          <select
            id={fieldId("subcategory")}
            value={selectedSubcategory?.name || form.subcategory}
            onChange={(e) => set("subcategory", e.target.value)}
            disabled={!selectedCategory}
            className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <option value="">{selectedCategory ? "Select subcategory" : "Pick a managed category first"}</option>
            {form.subcategory && selectedCategory && !selectedSubcategory && <option value={form.subcategory} disabled>{form.subcategory} (not in this category)</option>}
            {(selectedCategory?.subcategories || []).map((s) => (
              <option key={s._id} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input type="checkbox" id={fieldId("flash-sale")} checked={form.isFlashSale} onChange={(e) => set("isFlashSale", e.target.checked)} className="accent-mall-accent" />
          <label htmlFor={fieldId("flash-sale")} className="text-cream/60 text-sm">Flash Sale</label>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={fieldId("image-url")} className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Product gallery images (HTTPS URLs, up to 12)</label>
          <div className="flex min-w-0 gap-2">
            <input id={fieldId("image-url")} type="url" value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImageUrl(); } }} placeholder="https://example.com/product-image.jpg" className={`${inputClass} min-w-0 flex-1`} />
            <button type="button" onClick={addImageUrl} disabled={imageUrls().length >= 12} className="h-11 w-11 shrink-0 rounded-xl bg-mall-accent text-mall-900 disabled:opacity-40" aria-label="Add image to gallery"><Plus size={16} /></button>
          </div>
          <p className="mt-1 text-[10px] text-cream/35">The first image is the main product image. Reorder images to change the storefront gallery order.</p>
          <div className="mt-3 space-y-2">
            {imageUrls().map((url, index, urls) => (
              <div key={`${url}-${index}`} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-cream/10 bg-mall-900/40 p-2 sm:flex">
                <img src={productImageUrl(url, { width: 128, quality: 70 })} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                <p className="min-w-0 flex-1 truncate text-xs text-cream/70" title={url}>{index === 0 ? "Main image · " : `Image ${index + 1} · `}{url}</p>
                <div className="col-span-2 flex justify-end sm:ml-auto">
                  <button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0} aria-label={`Move image ${index + 1} earlier`} className="flex h-11 w-11 items-center justify-center rounded text-cream/60 hover:text-cream disabled:opacity-25 sm:h-8 sm:w-8"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => moveImage(index, 1)} disabled={index === urls.length - 1} aria-label={`Move image ${index + 1} later`} className="flex h-11 w-11 items-center justify-center rounded text-cream/60 hover:text-cream disabled:opacity-25 sm:h-8 sm:w-8"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => updateImages(urls.filter((_, imageIndex) => imageIndex !== index))} aria-label={`Remove image ${index + 1}`} className="flex h-11 w-11 items-center justify-center rounded text-cream/60 hover:text-red-300 sm:h-8 sm:w-8"><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <fieldset className="sm:col-span-2">
            <legend className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest mb-2">Purpose Tags</legend>
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

      {/* Variants — optional. A product with none behaves exactly as before,
          using its own top-level price/stock. */}
      <div className="mb-4 pt-4 border-t border-cream/10">
        <div className="flex flex-col gap-2 mb-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest">
            Variants (optional — e.g. sizes or colors)
          </p>
          <button type="button" onClick={addVariant}
            className="flex min-h-11 items-center gap-1 text-mall-accent text-xs font-medium hover:text-mall-accentDark transition sm:min-h-0">
            <Plus size={11} /> Add Variant
          </button>
        </div>
        {form.variants.length === 0 ? (
          <p className="text-cream/25 text-xs">No variants — this product uses its own price and stock above.</p>
        ) : (
          <div className="space-y-3">
            {form.variants.map((variant, i) => (
              <div key={i} className="bg-mall-900/40 rounded-lg p-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={variant.name}
                    onChange={(e) => updateVariant(i, "name", e.target.value)}
                    placeholder="e.g. Red / Large"
                    aria-label={`Name for variant ${i + 1}`}
                    className="min-h-11 flex-1 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/20 outline-none focus:border-mall-accent transition sm:min-h-0"
                  />
                  <input
                    value={variant.sku || ""}
                    onChange={(e) => updateVariant(i, "sku", e.target.value)}
                    placeholder="Variant SKU (required to publish)"
                    aria-label={`SKU for ${variant.name || `variant ${i + 1}`}`}
                    className="min-h-11 w-full sm:min-h-0 sm:w-48 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/20 outline-none focus:border-mall-accent transition"
                  />
                  <button type="button" aria-label={`Remove variant ${i + 1}`} onClick={() => removeVariant(i)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-cream/30 hover:text-red-400 transition sm:h-7 sm:w-7">
                    <X size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 gap-2">
                  <input
                    type="number"
                    value={variant.price ?? ""}
                    onChange={(e) => updateVariant(i, "price", e.target.value)}
                    placeholder="Price (blank = default)"
                    aria-label={`Price for variant ${i + 1}`}
                    className="min-h-11 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/20 outline-none focus:border-mall-accent transition sm:min-h-0"
                  />
                  <input
                    type="number"
                    value={variant.compareAtPrice ?? ""}
                    onChange={(e) => updateVariant(i, "compareAtPrice", e.target.value)}
                    placeholder="Compare at (optional)"
                    aria-label={`Compare-at price for variant ${i + 1}`}
                    className="min-h-11 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/20 outline-none focus:border-mall-accent transition sm:min-h-0"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={variant.stock ?? ""}
                    onChange={(e) => updateVariant(i, "stock", e.target.value)}
                    placeholder="Stock"
                    aria-label={`Stock for variant ${i + 1}`}
                    className="min-h-11 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/20 outline-none focus:border-mall-accent transition sm:min-h-0"
                  />
                  <input
                    value={variant.image || ""}
                    onChange={(e) => updateVariant(i, "image", e.target.value)}
                    placeholder="Image URL (optional)"
                    aria-label={`Image URL for variant ${i + 1}`}
                    className="min-h-11 bg-mall-800 border border-cream/10 rounded-lg px-2 py-1.5 text-cream text-xs placeholder-cream/20 outline-none focus:border-mall-accent transition sm:min-h-0"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
// file to see which categories it contains, then map each category to a
// shop (or leave it on the default) before actually importing anything.
function ImportPanel({ shops, categories, onDone, onCancel }) {
  const [file, setFile] = useState(null);
  const [items, setItems] = useState([]);
  const [previewHash, setPreviewHash] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputClass = "w-full min-h-11 sm:min-h-0 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition";
  const updateItem = (rowIndex, changes) => setItems((current) => current.map((item) => item.index === rowIndex ? { ...item, ...changes } : item));

  async function analyze(event) {
    event.preventDefault(); setError("");
    if (!file) return setError("Choose a WooCommerce CSV file first.");
    setBusy(true);
    try {
      const body = new FormData(); body.append("csv", file);
      const response = await api.post("/products/bulk-import/preview", body);
      setPreviewHash(response.data.fileHash || "");
      setItems((response.data.items || []).map((item) => {
        const source = String(item.sourceCategory || "").trim().toLowerCase();
        const categoryMatch = categories.find((entry) => entry.name.toLowerCase() === source || entry.subcategories?.some((sub) => sub.name.toLowerCase() === source));
        const subcategoryMatch = categoryMatch?.subcategories?.find((sub) => sub.name.toLowerCase() === source);
        const singleMatch = item.candidates?.length === 1 ? item.candidates[0] : null;
        return { ...item,
          action: item.product ? (item.candidates?.length ? "skip" : "create") : "skip",
          productId: singleMatch ? String(singleMatch.id) : "",
          status: "draft", shopId: singleMatch?.shop?.id || "",
          category: subcategoryMatch ? categoryMatch.name : categoryMatch?.name || "",
          subcategory: subcategoryMatch?.name || "",
          stock: item.product?.stock ?? "", variantStock: item.product?.variants?.map((variant) => variant.stock ?? "") || [],
        };
      }));
    } catch (err) { setError(err.response?.data?.message || "Could not analyze this CSV."); }
    finally { setBusy(false); }
  }

  async function commit(event) {
    event.preventDefault(); setError("");
    for (const item of items.filter((entry) => entry.action !== "skip")) {
      if (!item.shopId) return setError(`Choose a shop for ${item.product.name}.`);
      if (item.status === "published" && (!item.category || !item.subcategory)) return setError(`Choose a category and subcategory for ${item.product.name} before publishing.`);
      if (item.action === "overwrite" && !item.productId) return setError(`Choose the existing product to overwrite for ${item.product.name}.`);
      const invalidStock = item.product.variants?.length
        ? item.variantStock.some((stock) => stock !== "" && (!Number.isInteger(Number(stock)) || Number(stock) < 0))
        : item.stock !== "" && (!Number.isInteger(Number(item.stock)) || Number(item.stock) < 0);
      if (invalidStock) return setError(`Stock for ${item.product.name} must use whole numbers of zero or more.`);
      if (item.status === "published") {
        const missingStock = item.product.variants?.length
          ? item.variantStock.some((stock) => stock === "" || !Number.isInteger(Number(stock)) || Number(stock) < 0)
          : item.stock === "" || !Number.isInteger(Number(item.stock)) || Number(item.stock) < 0;
        if (missingStock) return setError(`Confirm stock for ${item.product.name} before publishing.`);
      }
    }
    setBusy(true);
    try {
      const body = new FormData(); body.append("csv", file);
      body.append("previewHash", previewHash);
      body.append("plan", JSON.stringify(items.map(({ index, action, productId, status, shopId, category, subcategory, stock, variantStock }) => ({ index, action, productId, status, shopId, category, subcategory, stock, variantStock }))));
      setResult((await api.post("/products/bulk-import", body)).data);
    } catch (err) { setError(err.response?.data?.message || "Import could not be completed."); }
    finally { setBusy(false); }
  }

  if (result) return <div className="mb-4 rounded-2xl border border-cream/10 bg-mall-800/50 p-3 sm:p-5">
    <div className="mb-3 flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-400" /><p className="text-sm font-medium text-cream">Import finished: {result.created} added · {result.overwritten} overwritten · {result.skipped} skipped · {result.failed} need attention</p></div>
    {result.results?.filter((entry) => entry.status === "failed").map((entry) => <div key={entry.index} className="mb-2 text-xs text-red-300"><p>CSV row {entry.index + 1}: {entry.message}</p>{entry.issues?.map((issue, index) => <p key={index} className="ml-3 mt-0.5 text-red-200/70">• {issue}</p>)}</div>)}
    <button type="button" onClick={onDone} className="mt-3 flex min-h-11 items-center gap-1.5 rounded-lg bg-mall-accent px-4 py-2 text-xs font-semibold text-mall-900"><Check size={13} /> Done</button>
  </div>;

  if (!items.length) return <div className="mb-4 rounded-2xl border border-cream/10 bg-mall-800/50 p-3 sm:p-5"><form onSubmit={analyze}>
    <label className="mb-1.5 block font-mono-tag text-[9px] uppercase tracking-widest text-cream/40">WooCommerce CSV export</label>
    <input type="file" accept=".csv" onChange={(event) => setFile(event.target.files?.[0] || null)} className={`${inputClass} min-w-0 file:mr-2 file:max-w-full file:rounded-lg file:border-0 file:bg-mall-accent file:px-2 file:py-2.5 file:text-xs file:font-semibold file:text-mall-900`} />
    <p className="mt-2 text-xs text-cream/40">The file is previewed first. Products are saved only after you review and confirm.</p>
    {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    <div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-mall-accent px-4 py-2 text-xs font-semibold text-mall-900 disabled:opacity-50 sm:w-auto"><FileSpreadsheet size={13} />{busy ? "Analyzing…" : "Analyze CSV"}</button><button type="button" onClick={onCancel} className="min-h-11 w-full rounded-lg border border-cream/15 px-4 py-2 text-xs text-cream/60 sm:w-auto">Cancel</button></div>
  </form></div>;

  return <div className="mb-4 rounded-2xl border border-cream/10 bg-mall-800/50 p-3 sm:p-5">
    <div className="mb-4"><h2 className="text-sm font-semibold text-cream">Review {items.length} product rows</h2><p className="mt-1 text-xs text-cream/40">Missing stock stays blank. Choose how each product is saved before confirming.</p></div>
    <form onSubmit={commit} className="space-y-3">
      {items.map((item) => {
        const product = item.product;
        const category = categories.find((entry) => entry.name === item.category);
        return <section key={item.index} className="rounded-xl border border-cream/10 bg-mall-900/40 p-3">
          <div className="flex min-w-0 gap-3">{product?.images?.[0] && <img src={product.images[0]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-cream">{product?.name || `CSV row ${item.index + 1}`}</p><p className="mt-0.5 break-words text-[11px] text-cream/45">{product?.sku ? `SKU ${product.sku} · ` : "SKU missing · "}{product?.price ? `KSh ${Number(product.price).toLocaleString()}` : "Price missing"}{product?.variants?.length ? ` · ${product.variants.length} variants` : ""}</p>{item.sourceCategory && <p className="mt-0.5 break-words text-[10px] text-cream/35">CSV category: {item.sourceCategory}</p>}</div></div>
          {item.errors?.map((warning, index) => <p key={index} className="mt-2 flex items-center gap-1.5 text-[11px] text-red-300"><AlertCircle size={12} />{warning}</p>)}
          {!!item.candidates?.length && <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-2"><p className="mb-1 text-[11px] text-amber-200">Possible existing match — review before overwriting.</p>{item.candidates.map((candidate) => <label key={candidate.id} className="flex min-h-11 items-center gap-2 break-words py-1 text-[11px] text-cream/70"><input type="radio" name={`match-${item.index}`} checked={item.productId === String(candidate.id)} onChange={() => updateItem(item.index, { productId: String(candidate.id), shopId: item.shopId || candidate.shop?.id || "" })} />{candidate.name} · {candidate.sku || "no SKU"}{candidate.shop?.name ? ` · ${candidate.shop.name}` : ""} · {candidate.status}</label>)}</div>}
          {product && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select value={item.action} onChange={(event) => updateItem(item.index, { action: event.target.value })} className={inputClass}>{!item.candidates?.length && <option value="create">Add as new product</option>}{item.candidates?.length > 0 && <option value="overwrite">Overwrite selected match</option>}<option value="skip">Skip this row</option></select>
            <select value={item.status} onChange={(event) => updateItem(item.index, { status: event.target.value })} disabled={item.action === "skip"} className={inputClass}><option value="draft">Save only (draft)</option><option value="published">Save and publish</option></select>
            <select value={item.shopId} onChange={(event) => updateItem(item.index, { shopId: event.target.value })} disabled={item.action === "skip"} className={inputClass}><option value="">Choose shop</option>{shops.map((shop) => <option key={shop._id} value={shop._id}>#{shop.shopNumber} {shop.name}</option>)}</select>
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2"><select value={item.category} onChange={(event) => updateItem(item.index, { category: event.target.value, subcategory: "" })} disabled={item.action === "skip"} className={inputClass}><option value="">Category</option>{categories.map((entry) => <option key={entry._id} value={entry.name}>{entry.name}</option>)}</select><select value={item.subcategory} onChange={(event) => updateItem(item.index, { subcategory: event.target.value })} disabled={item.action === "skip" || !category} className={inputClass}><option value="">Subcategory</option>{(category?.subcategories || []).map((sub) => <option key={sub._id} value={sub.name}>{sub.name}</option>)}</select></div>
            {product.variants?.length ? product.variants.map((variant, variantIndex) => <label key={variantIndex} className="text-[10px] text-cream/55">{variant.name || `Option ${variantIndex + 1}`} stock<input type="number" min="0" step="1" value={item.variantStock[variantIndex]} disabled={item.action === "skip"} onChange={(event) => updateItem(item.index, { variantStock: item.variantStock.map((value, i) => i === variantIndex ? event.target.value : value) })} className={`${inputClass} mt-1`} /></label>) : <label className="text-[10px] text-cream/55">Stock<input type="number" min="0" step="1" value={item.stock} disabled={item.action === "skip"} onChange={(event) => updateItem(item.index, { stock: event.target.value })} className={`${inputClass} mt-1`} /></label>}
          </div>}
        </section>;
      })}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row"><button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-mall-accent px-4 py-2 text-xs font-semibold text-mall-900 disabled:opacity-50 sm:w-auto"><Upload size={13} />{busy ? "Saving reviewed products…" : "Confirm import"}</button><button type="button" onClick={onCancel} className="min-h-11 w-full rounded-lg border border-cream/15 px-4 py-2 text-xs text-cream/60 sm:w-auto">Cancel</button></div>
    </form>
  </div>;
}

function BulkEditPanel({ count, shops, categories, brands, selectionHasVariants, onApply, onCancel }) {
  const { badges } = useBadges();
  const [shop, setShop] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [badge, setBadge] = useState("");
  const [stock, setStock] = useState("");
  const [priceType, setPriceType] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  async function handleApply(e) {
    e.preventDefault();
    setError("");

    const set = {};
    if (shop) set.shop = shop;
    if (category) {
      if (!subcategory) {
        setError("Choose a subcategory for the selected category.");
        return;
      }
      set.category = category;
      set.subcategory = subcategory;
    }
    if (badge) set.badge = badge;
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

  const inputClass = "w-full min-h-11 sm:min-h-0 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition";
  const selectedCategory = categories.find((entry) => entry.name === category);

  return (
    <div className="border border-mall-accent/30 rounded-2xl p-3 sm:p-5 bg-mall-accent/5 mb-4">
      <p className="text-cream text-sm font-medium mb-4">
        Editing {count} product{count !== 1 ? "s" : ""} — only filled-in fields will change
      </p>
      <form onSubmit={handleApply}>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Move to Shop</label>
            <select value={shop} onChange={(e) => setShop(e.target.value)} className={inputClass}>
              <option value="">Don't change</option>
              {shops.map((s) => <option key={s._id} value={s._id}>#{s.shopNumber} {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Set Category</label>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(""); }} className={inputClass}>
              <option value="">Don't change</option>
              {categories.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Set Subcategory</label>
            <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} disabled={!selectedCategory} className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}>
              <option value="">{selectedCategory ? "Choose subcategory" : "Choose a category first"}</option>
              {(selectedCategory?.subcategories || []).map((entry) => <option key={entry._id} value={entry.name}>{entry.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Set Badge</label>
            <select value={badge} onChange={(e) => setBadge(e.target.value)} className={inputClass}>
              <option value="">Don't change</option>
              {badges.map((b) => <option key={b._id} value={b.slug}>{b.chipLabel}</option>)}
            </select>
          </div>
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
  const [products, setProducts] = useState([]);
  const [shops, setShops] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
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
    Promise.all([api.get("/shops"), api.get("/categories"), api.get("/brands")])
      .then(([shopsRes, catRes, brandRes]) => {
        if (!active) return;
        setShops(shopsRes.data);
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
    api.get("/products/admin/list", { params: { search: search || undefined, status: statusFilter, page, limit: 20 } })
      .then((res) => {
        setProducts(res.data.products);
        setPages(res.data.pages);
      })
      .catch(() => setLoadError("Products could not be loaded."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [search, page, statusFilter, loadAttempt]);
  // A search or page change means the on-screen product set has changed —
  // clear any selection so Bulk Edit can never silently apply to products
  // that are no longer even visible.
  useEffect(() => { setSelectedIds([]); setShowBulkEdit(false); }, [search, page, statusFilter]);

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
        <ImportPanel
          shops={shops}
          categories={categories}
          onDone={() => { clearHomeCache(); setShowImport(false); load(); }}
          onCancel={() => setShowImport(false)}
        />
      )}

      {showAdd && <ProductForm shops={shops} categories={categories} brands={brands} onSave={handleAdd} onCancel={() => setShowAdd(false)} />}

      <div className="mb-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="Product status">
        {[ ["all", "All products"], ["published", "Published"], ["draft", "Drafts"], ["archived", "Archived"] ].map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={statusFilter === value} onClick={() => { setStatusFilter(value); setPage(1); }}
            className={`min-h-11 whitespace-nowrap rounded-full px-3.5 py-3 text-xs font-medium transition sm:min-h-0 sm:py-2 ${statusFilter === value ? "bg-mall-accent text-mall-900" : "border border-cream/10 text-cream/55 hover:text-cream"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-5">
        <label htmlFor="product-search" className="sr-only">Search products</label>
        <input
          id="product-search"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search products..."
          className="w-full sm:w-72 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition"
        />
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
          <div className="flex items-center justify-between mb-4">
            <label className="flex min-h-11 items-center gap-2 text-cream/50 text-xs cursor-pointer">
              <input
                type="checkbox"
                aria-label="Select all products"
                checked={filtered.length > 0 && selectedIds.length === filtered.length}
                onChange={toggleSelectAll}
                className="w-5 h-5 accent-mall-accent"
              />
              {selectedIds.length > 0 ? `${selectedIds.length} selected` : `${filtered.length} products`}
            </label>
            {selectedIds.length > 0 && !showBulkEdit && (
              <button onClick={() => setShowBulkEdit(true)}
                className="flex min-h-11 items-center gap-1.5 bg-mall-accent text-mall-900 font-semibold text-xs px-4 py-2 rounded-lg hover:bg-mall-accentDark transition">
                <Pencil size={13} /> Bulk Edit
              </button>
            )}
          </div>

          {showBulkEdit && selectedIds.length > 0 && (
            <BulkEditPanel
              count={selectedIds.length}
              shops={shops}
              categories={categories}
              brands={brands}
              selectionHasVariants={products.some((product) => selectedIds.includes(product._id) && product.variants?.length > 0)}
              onApply={handleBulkEdit}
              onCancel={() => setShowBulkEdit(false)}
            />
          )}

          <div className="divide-y divide-cream/8">
            {filtered.map((product) => (
              <div key={product._id}>
                {editId === product._id ? (
                  <div className="py-3">
                    <ProductForm initial={product} shops={shops} categories={categories} brands={brands} onSave={(form) => handleEdit(product._id, form)} onCancel={() => setEditId(null)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 py-4 sm:flex sm:gap-4">
                    <label className="flex h-11 w-11 shrink-0 items-center justify-center sm:h-5 sm:w-5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${product.name}`}
                        checked={selectedIds.includes(product._id)}
                        onChange={() => toggleSelect(product._id)}
                        className="h-5 w-5 accent-mall-accent"
                      />
                    </label>
                    {product.images?.[0] ? (
                      <img src={productImageUrl(product.images[0], { width: 128, quality: 70 })} alt={product.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-mall-800 flex items-center justify-center shrink-0">
                        <Package size={16} className="text-cream/20" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        {product.brand && <p className="font-mono-tag text-[9px] uppercase text-mall-accent tracking-widest">{product.brand}</p>}
                        {product.badge && <span className="font-mono-tag text-[9px] uppercase text-cream/30">{product.badge}</span>}
                      </div>
                      <p className="text-cream text-sm font-medium line-clamp-1">{product.name}</p>
                      <p className="break-words text-cream/40 text-xs">{product.sku ? `${product.sku} · ` : ""}{getStartingPrice(product) ? `${product.variants?.length ? "From " : ""}KSh ${getStartingPrice(product).toLocaleString()}` : "Price not set"} · Stock: {product.stock ?? "Not confirmed"}</p>
                      {product.shop && <p className="mt-0.5 break-words text-cream/35 text-[10px]">Shop #{product.shop.shopNumber} · {product.shop.name}</p>}
                      {product.shop?.isActive === false && <p className="mt-0.5 text-amber-200/80 text-[10px]">Shop inactive · hidden from storefront and new checkout</p>}
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide ${product.status === "published" ? "bg-emerald-500/10 text-emerald-300" : product.status === "archived" ? "bg-cream/10 text-cream/40" : "bg-amber-500/10 text-amber-300"}`}>{product.status || (product.isActive ? "published" : "draft")}</span>
                      {product.publishIssues?.length > 0 && <p className="mt-1 text-[10px] text-red-300">{product.publishIssues.length} publication requirement{product.publishIssues.length === 1 ? "" : "s"} incomplete</p>}
                      {product.publishIssues?.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-[10px] text-red-300/70">View required details</summary><ul className="mt-1 list-disc space-y-0.5 pl-4">{product.publishIssues.map((issue, index) => <li key={index} className="text-[10px] text-red-200/70">{issue}</li>)}</ul></details>}
                    </div>
                    <div className="col-span-3 flex items-center justify-end gap-2 shrink-0 sm:col-auto sm:ml-auto">
                      <button type="button" aria-label={`Edit ${product.name}`} title={`Edit ${product.name}`} onClick={() => { setEditId(product._id); setShowAdd(false); }} disabled={metadataLoading || Boolean(metadataError)}
                        className="h-11 w-11 rounded-lg bg-mall-800 text-cream/50 hover:text-cream flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed sm:h-8 sm:w-8">
                        <Pencil size={13} />
                      </button>
                      {product.status === "archived" ? (
                        <>
                          <button type="button" aria-label={`Restore ${product.name} as draft`} title="Restore as draft" onClick={() => handleRestore(product)} className="h-11 w-11 rounded-lg bg-mall-800 text-cream/50 hover:text-emerald-300 flex items-center justify-center transition sm:h-8 sm:w-8"><ArchiveRestore size={13} /></button>
                          <button type="button" aria-label={`Permanently delete ${product.name}`} title="Permanently delete" onClick={() => { setDeleteError(""); setDeleteTarget(product); }} className="h-11 w-11 rounded-lg bg-mall-800 text-cream/50 hover:text-red-400 flex items-center justify-center transition sm:h-8 sm:w-8"><Trash2 size={13} /></button>
                        </>
                      ) : (
                        <button type="button" aria-label={`Archive ${product.name}`} title="Archive product" onClick={() => handleArchive(product)} className="h-11 w-11 rounded-lg bg-mall-800 text-cream/50 hover:text-amber-300 flex items-center justify-center transition sm:h-8 sm:w-8"><Archive size={13} /></button>
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
      {deleteTarget && <AdminConfirmDialog title={`Permanently delete ${deleteTarget.name}?`} description="This cannot be undone. Products with order history or active reservations cannot be permanently deleted; archive them instead." busy={deleting} onClose={() => !deleting && setDeleteTarget(null)} onConfirm={handleDelete} />}
    </div>
  );
}
