import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, CheckCircle2, ChevronDown, ChevronUp, FileSpreadsheet, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { useBadges } from "../../context/BadgesContext";
import { buildImportSkuIndex, getImportCounts, getImportReviewStatus, prepareImportProduct, validateImportItem } from "../../utils/productImportReview";
import { MAX_PRODUCT_BADGES } from "../../utils/productBadges";

const FIELD_CLASS = "w-full min-h-11 bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/25 outline-none focus:border-mall-accent transition disabled:opacity-50";
const LABEL_CLASS = "mb-1.5 block font-mono-tag text-[9px] uppercase tracking-widest text-cream/45";
const PAGE_SIZE = 20;
const FILTERS = [
  ["all", "All rows"],
  ["attention", "Needs attention"],
  ["ready", "Ready"],
  ["skipped", "Skipped"],
  ["matches", "Existing matches"],
];

function localDateToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function loadSavedCategoryMappings() {
  try {
    const stored = window.localStorage.getItem("admin-product-import-category-mappings");
    const parsed = stored ? JSON.parse(stored) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { mappings: {}, error: "Saved category mappings are invalid and were ignored." };
    }
    const mappings = Object.fromEntries(Object.entries(parsed).filter(([, mapping]) => (
      mapping && typeof mapping.categoryId === "string" && typeof mapping.subcategoryId === "string"
    )));
    return { mappings, error: "" };
  } catch {
    return { mappings: {}, error: "Saved category mappings could not be read from this browser." };
  }
}

function SummaryMetric({ label, value, tone = "text-cream" }) {
  return <div className="min-w-0 border-l border-cream/10 pl-3 first:border-0 first:pl-0">
    <p className="font-mono-tag text-[9px] uppercase tracking-widest text-cream/40">{label}</p>
    <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
  </div>;
}

function ReviewBadge({ children, tone = "neutral" }) {
  const tones = {
    ready: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
    attention: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    error: "border-red-300/25 bg-red-300/10 text-red-200",
    mapped: "border-sky-300/20 bg-sky-300/10 text-sky-100",
    neutral: "border-cream/10 bg-cream/5 text-cream/60",
  };
  return <span className={`inline-flex min-h-6 items-center rounded-md border px-2 py-1 text-[9px] font-mono-tag uppercase tracking-wider ${tones[tone]}`}>{children}</span>;
}

export default function ProductImportPanel({ floors = [], shops, categories, brands = [], onDone, onCancel }) {
  const { badges, loading: badgesLoading, error: badgesError, retry: retryBadges } = useBadges();
  const [file, setFile] = useState(null);
  const [items, setItems] = useState([]);
  const [previewHash, setPreviewHash] = useState("");
  const [result, setResult] = useState(null);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [batchFloorId, setBatchFloorId] = useState("");
  const [batchShopId, setBatchShopId] = useState("");
  const [categorySource, setCategorySource] = useState("");
  const [mappedCategoryId, setMappedCategoryId] = useState("");
  const [mappedSubcategoryId, setMappedSubcategoryId] = useState("");
  const [storedMappings, setStoredMappings] = useState(loadSavedCategoryMappings);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [skuGenerating, setSkuGenerating] = useState("");
  const counts = useMemo(() => getImportCounts(items), [items]);
  const skuIndex = useMemo(() => buildImportSkuIndex(items), [items]);
  const issuesByIndex = useMemo(() => new Map(items.map((item) => [
    item.index,
    validateImportItem(item, items, categories, shops, brands, skuIndex),
  ])), [items, categories, shops, brands, skuIndex]);
  const reviewCounts = useMemo(() => ({
    attention: items.filter((item) => ["blocked", "attention"].includes(getImportReviewStatus(item, issuesByIndex.get(item.index)))).length,
    ready: items.filter((item) => getImportReviewStatus(item, issuesByIndex.get(item.index)) === "ready").length,
    matches: items.filter((item) => item.candidates?.length).length,
    mappedCategories: items.filter((item) => item.sourceCategory && item.category).length,
  }), [items, issuesByIndex]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const issues = issuesByIndex.get(item.index) || [];
      const status = getImportReviewStatus(item, issues);
      const matchesFilter = filter === "all"
        || (filter === "attention" && (status === "blocked" || status === "attention"))
        || (filter === "ready" && status === "ready")
        || (filter === "skipped" && status === "skipped")
        || (filter === "matches" && Boolean(item.candidates?.length));
      const searchText = [item.index + 1, item.product?.name, item.product?.sku, item.category, item.subcategory, item.sourceCategory]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      return matchesFilter && (!query || searchText.includes(query));
    });
  }, [items, search, filter, issuesByIndex]);
  const pageItems = visibleItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.ceil(visibleItems.length / PAGE_SIZE);
  const sourceCategories = [...new Set(items.map((item) => item.sourceCategory?.trim()).filter(Boolean))];
  const mappedCategory = categories.find((entry) => String(entry._id) === mappedCategoryId);
  const savedCategoryMappings = storedMappings.mappings;
  const batchShops = shops.filter((shop) => String(shop.floor?._id || shop.floor || "") === batchFloorId);
  const selectableVisibleRows = visibleItems.filter((item) => item.product && item.action !== "skip");
  const itemByIndex = new Map(items.map((item) => [item.index, item]));
  const selectedCount = selectedRows.filter((index) => {
    const item = itemByIndex.get(index);
    return item?.product && item.action !== "skip";
  }).length;
  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  function updateItem(rowIndex, changes) {
    setItems((current) => current.map((item) => item.index === rowIndex ? { ...item, ...changes } : item));
  }

  function applyPlacementToSelected() {
    const selected = new Set(selectedRows);
    setItems((current) => current.map((item) => selected.has(item.index) && item.product && item.action !== "skip"
      ? { ...item, floorId: batchFloorId, shopId: batchShopId, placementIssue: "" }
      : item));
  }

  function applyCategoryMapping() {
    const category = categories.find((entry) => String(entry._id) === mappedCategoryId);
    const subcategory = category?.subcategories?.find((entry) => String(entry._id) === mappedSubcategoryId);
    if (!category || !subcategory || !categorySource) return;
    const sourceKey = categorySource.trim().toLocaleLowerCase();
    const mappings = {
      ...savedCategoryMappings,
      [sourceKey]: { categoryId: String(category._id), subcategoryId: String(subcategory._id) },
    };
    setStoredMappings({ mappings, error: "" });
    try {
      window.localStorage.setItem("admin-product-import-category-mappings", JSON.stringify(mappings));
    } catch {
      setStoredMappings({ mappings, error: "This mapping was applied to the current import but could not be saved in this browser." });
    }
    setItems((current) => current.map((item) => item.sourceCategory?.trim().toLocaleLowerCase() === sourceKey
      ? {
        ...item,
        categoryId: String(category._id),
        subcategoryId: String(subcategory._id),
        category: category.name,
        subcategory: subcategory.name,
      }
      : item));
  }

  function toggleVisibleRows() {
    const visibleIndexes = selectableVisibleRows.map((item) => item.index);
    const visibleSet = new Set(visibleIndexes);
    const selectedSet = new Set(selectedRows);
    const allSelected = visibleIndexes.length > 0 && visibleIndexes.every((index) => selectedSet.has(index));
    setSelectedRows((current) => allSelected
      ? current.filter((index) => !visibleSet.has(index))
      : [...new Set([...current, ...visibleIndexes])]);
  }

  function updateProduct(rowIndex, changes) {
    setItems((current) => current.map((item) => item.index === rowIndex
      ? { ...item, product: { ...item.product, ...changes } }
      : item));
  }

  function updateVariant(rowIndex, variantIndex, changes) {
    const item = items.find((entry) => entry.index === rowIndex);
    if (!item) return;
    updateProduct(rowIndex, {
      variants: item.product.variants.map((variant, index) => index === variantIndex ? { ...variant, ...changes } : variant),
    });
  }

  async function generateSku(rowIndex, variantIndex = null) {
    const item = items.find((entry) => entry.index === rowIndex);
    if (!item?.product) return;
    const variant = variantIndex === null ? null : item.product.variants[variantIndex];
    const name = variant ? `${item.product.name} ${variant.name || ""}` : item.product.name;
    const key = `${rowIndex}-${variantIndex === null ? "product" : variantIndex}`;
    const reservedSkus = [];
    items.forEach((entry) => {
      if (!entry.product) return;
      if (entry.index !== rowIndex || variantIndex !== null) reservedSkus.push(entry.product.sku);
      entry.product.variants.forEach((option, index) => {
        if (entry.index !== rowIndex || variantIndex !== index) reservedSkus.push(option.sku);
      });
    });
    setSkuGenerating(key);
    setError("");
    try {
      const { data } = await api.post("/products/admin/sku-suggestion", { name, reservedSkus });
      if (variantIndex === null) {
        updateProduct(rowIndex, { sku: data.sku });
        updateItem(rowIndex, { generatedSkus: { ...item.generatedSkus, product: true } });
      } else {
        updateVariant(rowIndex, variantIndex, { sku: data.sku });
        const generatedVariants = new Set(item.generatedSkus?.variants || []);
        generatedVariants.add(variantIndex);
        updateItem(rowIndex, { generatedSkus: { ...item.generatedSkus, variants: [...generatedVariants] } });
      }
    } catch (err) {
      setError(err.response?.data?.message || `Could not generate an available SKU for CSV row ${rowIndex + 1}.`);
    } finally {
      setSkuGenerating("");
    }
  }

  async function analyze(event) {
    event.preventDefault();
    setError("");
    if (!file) return setError("Choose a WooCommerce CSV file first.");
    setBusy(true);
    try {
      const body = new FormData();
      body.append("csv", file);
      const response = await api.post("/products/bulk-import/preview", body);
      setPreviewHash(response.data.fileHash || "");
      const nextItems = (response.data.items || []).map((item) => {
        const source = String(item.sourceCategory || "").trim().toLowerCase();
        const categoryMatch = categories.find((entry) => entry.name.toLowerCase() === source
          || entry.subcategories?.some((sub) => sub.name.toLowerCase() === source));
        const subcategoryMatch = categoryMatch?.subcategories?.find((sub) => sub.name.toLowerCase() === source);
        const savedMapping = savedCategoryMappings[source];
        const savedCategory = categories.find((entry) => String(entry._id) === String(savedMapping?.categoryId || ""));
        const savedSubcategory = savedCategory?.subcategories?.find((sub) => String(sub._id) === String(savedMapping?.subcategoryId || ""));
        const matchingBrands = brands.filter((entry) => entry.name.trim().toLocaleLowerCase() === String(item.product?.brand || "").trim().toLocaleLowerCase());
        const brandMatch = matchingBrands.length === 1 ? matchingBrands[0] : null;
        const singleMatch = item.candidates?.length === 1 ? item.candidates[0] : null;
        return {
          ...item,
          product: item.product ? prepareImportProduct({ ...item.product, brandId: brandMatch?._id || "" }) : null,
          sourcePlacement: item.product?.sourcePlacement || { floor: "", shop: "" },
          action: item.product ? (item.candidates?.length ? "skip" : "create") : "skip",
          productId: "",
          status: "draft",
          floorId: item.placementSuggestion?.floorId || "",
          shopId: item.placementSuggestion?.shopId || "",
          placementIssue: item.placementSuggestion?.issue || "",
          categoryId: savedSubcategory ? savedCategory._id : categoryMatch?._id || "",
          subcategoryId: savedSubcategory?._id || "",
          category: savedSubcategory ? savedCategory.name : categoryMatch?.name || "",
          subcategory: savedSubcategory?.name || "",
          preferredMatch: singleMatch,
        };
      });
      setItems(nextItems);
      setSelectedRows([]);
      setExpandedIndex(nextItems.find((item) => item.product)?.index ?? null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not analyze this CSV.");
    } finally {
      setBusy(false);
    }
  }

  async function commit(event) {
    event?.preventDefault();
    setError("");
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const firstInvalid = items.find((item) => (issuesByIndex.get(item.index) || []).length);
    if (firstInvalid) {
      setExpandedIndex(firstInvalid.index);
      setError(`Review the highlighted details for CSV row ${firstInvalid.index + 1} before importing.`);
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append("csv", file);
      body.append("previewHash", previewHash);
      body.append("plan", JSON.stringify(items.map((item) => ({
        index: item.index,
        action: item.action,
        ...(item.action === "skip" ? {} : {
          productId: item.productId,
          status: item.status,
          floorId: item.floorId,
          shopId: item.shopId,
          categoryId: item.categoryId,
          subcategoryId: item.subcategoryId,
          category: item.category,
          subcategory: item.subcategory,
          product: {
            ...item.product,
            flashSaleEndsAt: localDateToIso(item.product.flashSaleEndsAt),
          },
        }),
      }))));
      setResult((await api.post("/products/bulk-import", body)).data);
    } catch (err) {
      setError(err.response?.data?.message || "Import could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function startConfirmation(event) {
    event.preventDefault();
    setError("");
    setConfirming(true);
  }

  if (result) {
    const published = result.results?.filter((entry) => entry.status !== "failed" && entry.status !== "skipped" && entry.productStatus === "published").length || 0;
    const drafts = result.results?.filter((entry) => entry.status !== "failed" && entry.status !== "skipped" && entry.productStatus === "draft").length || 0;
    return <section className="mb-4 rounded-2xl border border-cream/10 bg-mall-800/50 p-4 sm:p-5" aria-live="polite">
      <div className="mb-4 flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-400" /><h2 className="text-sm font-semibold text-cream">Import results</h2></div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <SummaryMetric label="Created" value={result.created} tone="text-emerald-300" />
        <SummaryMetric label="Overwritten" value={result.overwritten} tone="text-sky-300" />
        <SummaryMetric label="Skipped" value={result.skipped} tone="text-cream/70" />
        <SummaryMetric label="Published" value={published} tone="text-mall-accent" />
        <SummaryMetric label="Drafts" value={drafts} tone="text-amber-200" />
        <SummaryMetric label="Failed" value={result.failed} tone="text-red-300" />
      </div>
      {result.results?.filter((entry) => entry.status === "failed").map((entry) => <div key={entry.index} className="mb-2 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200">
        <p className="font-medium">CSV row {entry.index + 1}: {entry.message}</p>
        {entry.issues?.map((issue, index) => <p key={index} className="ml-3 mt-1 text-red-200/75">• {issue}</p>)}
      </div>)}
      <button type="button" onClick={onDone} className="mt-2 flex min-h-11 items-center gap-1.5 rounded-lg bg-mall-accent px-4 py-2 text-xs font-semibold text-mall-900"><Check size={13} /> Done</button>
    </section>;
  }

  if (!items.length) return <section className="mb-4 rounded-2xl border border-cream/10 bg-mall-800/50 p-4 sm:p-5">
    <form onSubmit={analyze}>
      <label className={LABEL_CLASS} htmlFor="woocommerce-import-file">WooCommerce CSV export</label>
      <input id="woocommerce-import-file" type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} className={`${FIELD_CLASS} min-w-0 file:mr-2 file:max-w-full file:rounded-lg file:border-0 file:bg-mall-accent file:px-2 file:py-2.5 file:text-xs file:font-semibold file:text-mall-900`} />
      <p className="mt-2 text-xs text-cream/45">Preview first, then edit every product or explicitly skip it. Nothing is saved until you confirm.</p>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-mall-accent px-4 py-2 text-xs font-semibold text-mall-900 disabled:opacity-50 sm:w-auto"><FileSpreadsheet size={13} />{busy ? "Analyzing…" : "Analyze CSV"}</button>
        <button type="button" onClick={onCancel} className="min-h-11 w-full rounded-lg border border-cream/15 px-4 py-2 text-xs text-cream/60 sm:w-auto">Cancel</button>
      </div>
    </form>
  </section>;

  return <section className="mb-4 rounded-2xl border border-cream/10 bg-mall-800/50 p-3 sm:p-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-cream/10 pb-4">
      <div className="min-w-0"><p className="mb-1 font-mono-tag text-[9px] uppercase tracking-[0.18em] text-mall-accent">CSV import · review workspace</p><h2 className="text-base font-semibold text-cream">Review {items.length} mapped rows</h2><p className="mt-1 max-w-2xl truncate text-xs text-cream/55" title={file?.name}>{file?.name} · {items.length} rows · Review each action before importing.</p></div>
      <button type="button" onClick={() => { setItems([]); setPreviewHash(""); setResult(null); setFile(null); }} className="min-h-10 rounded-lg border border-cream/15 px-3 text-xs text-cream/65 transition hover:border-cream/30 hover:text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-mall-accent">Choose another CSV</button>
    </div>

    <div className="mb-4 rounded-xl border border-cream/10 bg-mall-900/45 p-3 sm:p-4" aria-label="Review progress">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono-tag text-[9px] uppercase tracking-[0.16em] text-cream/55">Review signal</p>
        <p className="text-[11px] tabular-nums text-cream/55">{reviewCounts.ready} ready · {reviewCounts.attention} need attention · {counts.skipped} skipped</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryMetric label="Needs attention" value={reviewCounts.attention} tone={reviewCounts.attention ? "text-amber-200" : "text-emerald-300"} />
        <SummaryMetric label="Ready to import" value={reviewCounts.ready} tone="text-emerald-300" />
        <SummaryMetric label="Existing matches" value={reviewCounts.matches} tone={reviewCounts.matches ? "text-amber-200" : "text-cream/70"} />
        <SummaryMetric label="Category mapped" value={`${reviewCounts.mappedCategories}/${items.filter((item) => item.sourceCategory).length}`} tone="text-sky-200" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-cream/10 pt-3" aria-label="Value provenance">
        <ReviewBadge tone="mapped">CSV values</ReviewBadge>
        <ReviewBadge tone="mapped">Mapped category: {reviewCounts.mappedCategories}</ReviewBadge>
        <ReviewBadge tone="attention">Shop selection required</ReviewBadge>
        <ReviewBadge tone="neutral">New products start as draft</ReviewBadge>
      </div>
    </div>

    <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-cream/10 bg-mall-900/35 p-3 sm:grid-cols-5 sm:p-4" aria-label="Import plan summary">
      <SummaryMetric label="Create" value={counts.create} tone="text-emerald-300" />
      <SummaryMetric label="Overwrite" value={counts.overwrite} tone="text-sky-300" />
      <SummaryMetric label="Skip" value={counts.skipped} tone="text-cream/65" />
      <SummaryMetric label="Publish" value={counts.publish} tone="text-mall-accent" />
      <SummaryMetric label="Save as draft" value={counts.draft} tone="text-amber-200" />
    </div>

    <div className="mb-4 space-y-3 rounded-xl border border-cream/10 bg-mall-900/35 p-3">
      <label className="relative block">
        <span className="sr-only">Search imported products</span>
        <Search size={16} aria-hidden="true" className="absolute left-3 top-3.5 text-cream/40" />
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search name, SKU, category or row…" className={`${FIELD_CLASS} pl-9`} />
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter imported products">
        {FILTERS.map(([value, label]) => {
          const filterCount = items.filter((item) => {
            const issues = issuesByIndex.get(item.index) || [];
            const status = getImportReviewStatus(item, issues);
            return value === "all"
              || (value === "attention" && (status === "blocked" || status === "attention"))
              || (value === "ready" && status === "ready")
              || (value === "skipped" && status === "skipped")
              || (value === "matches" && Boolean(item.candidates?.length));
          }).length;
          return <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }} className={`min-h-10 rounded-lg border px-3 text-xs transition ${filter === value ? "border-mall-accent/50 bg-mall-accent/10 text-mall-accent" : "border-cream/10 text-cream/65 hover:text-cream"}`}>{label} <span className="ml-1 tabular-nums">{filterCount}</span></button>;
        })}
      </div>
      <p className="text-xs text-cream/55" aria-live="polite">Showing {visibleItems.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, visibleItems.length)} of {visibleItems.length} filtered rows · {items.length} total rows. Counts above always include all rows.</p>
      <div className="grid gap-3 border-t border-cream/10 pt-3 lg:grid-cols-2">
        <section className="space-y-2 rounded-lg border border-cream/10 p-3" aria-label="Apply a location to selected rows">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-cream">Assign location to selected rows</p>
            <label className="flex min-h-10 items-center gap-2 text-[11px] text-cream/60">
              <input type="checkbox" checked={selectableVisibleRows.length > 0 && selectableVisibleRows.every((item) => selectedRows.includes(item.index))} onChange={toggleVisibleRows} className="h-4 w-4 accent-mall-accent" />
              Select filtered rows
            </label>
          </div>
          <p className="text-[11px] text-cream/50">{selectedCount} eligible row{selectedCount === 1 ? "" : "s"} selected. Location assignments remain subject to review.</p>
          {selectedRows.length > 0 && <button type="button" onClick={() => setSelectedRows([])} className="min-h-9 text-left text-[11px] text-cream/60 underline underline-offset-2">Clear selection</button>}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select aria-label="Floor to apply to selected rows" value={batchFloorId} onChange={(event) => { setBatchFloorId(event.target.value); setBatchShopId(""); }} className={FIELD_CLASS}>
              <option value="">Choose floor</option>
              {floors.filter((floor) => floor.isActive !== false).map((floor) => <option key={floor._id} value={floor._id}>Floor {floor.floorNumber}: {floor.name}</option>)}
            </select>
            <select aria-label="Shop to apply to selected rows" value={batchShopId} disabled={!batchFloorId} onChange={(event) => setBatchShopId(event.target.value)} className={FIELD_CLASS}>
              <option value="">Choose shop</option>
              {batchShops.map((shop) => <option key={shop._id} value={shop._id}>#{shop.shopNumber} {shop.name}</option>)}
            </select>
            <button type="button" disabled={!selectedCount || !batchFloorId || !batchShopId} onClick={applyPlacementToSelected} className="min-h-11 rounded-xl bg-mall-accent px-3 text-xs font-semibold text-mall-900 disabled:opacity-40">Apply location</button>
          </div>
        </section>
        <section className="space-y-2 rounded-lg border border-cream/10 p-3" aria-label="Map CSV categories">
          <p className="text-xs font-semibold text-cream">Reusable category mapping</p>
          <p className="text-[11px] text-cream/50">Map one source label to a managed category and subcategory across every matching row in this import.</p>
          <p className="text-[10px] text-cream/45">Saved mappings are reused for future imports in this browser; uncertain rows remain editable.</p>
          {storedMappings.error && <p className="text-[10px] text-amber-100" role="status">{storedMappings.error}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <select aria-label="CSV category label" value={categorySource} onChange={(event) => setCategorySource(event.target.value)} className={FIELD_CLASS}>
              <option value="">Choose CSV category label</option>
              {sourceCategories.map((source) => <option key={source} value={source}>{source}</option>)}
            </select>
            <select aria-label="Managed category for CSV mapping" value={mappedCategoryId} onChange={(event) => { setMappedCategoryId(event.target.value); setMappedSubcategoryId(""); }} className={FIELD_CLASS}>
              <option value="">Choose managed category</option>
              {categories.map((entry) => <option key={entry._id} value={entry._id}>{entry.name}</option>)}
            </select>
            <select aria-label="Managed subcategory for CSV mapping" value={mappedSubcategoryId} disabled={!mappedCategory} onChange={(event) => setMappedSubcategoryId(event.target.value)} className={FIELD_CLASS}>
              <option value="">Choose managed subcategory</option>
              {(mappedCategory?.subcategories || []).map((entry) => <option key={entry._id} value={entry._id}>{entry.name}</option>)}
            </select>
            <button type="button" disabled={!categorySource || !mappedCategoryId || !mappedSubcategoryId} onClick={applyCategoryMapping} className="min-h-11 rounded-xl border border-cream/15 px-3 text-xs text-cream/75 disabled:opacity-40">Save &amp; map rows</button>
          </div>
        </section>
      </div>
    </div>

    {confirming ? <section className="rounded-xl border border-mall-accent/30 bg-mall-accent/5 p-4 sm:p-5" aria-labelledby="final-import-heading">
      <h3 id="final-import-heading" className="text-base font-semibold text-cream">Final import confirmation</h3>
      <p className="mt-1 text-sm text-cream/65">Review the complete plan. The request may partially succeed if products change or a server-side safety check fails.</p>
      <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryMetric label="Create" value={counts.create} tone="text-emerald-300" />
        <SummaryMetric label="Overwrite" value={counts.overwrite} tone="text-sky-300" />
        <SummaryMetric label="Skip" value={counts.skipped} tone="text-cream/65" />
        <SummaryMetric label="Draft" value={counts.draft} tone="text-amber-200" />
        <SummaryMetric label="Publish" value={counts.publish} tone="text-mall-accent" />
      </div>
      {(() => {
        const unresolved = items.flatMap((item) => item.action === "skip" ? [] : (issuesByIndex.get(item.index) || []).map((issue) => ({ index: item.index, issue })));
        return unresolved.length
          ? <div className="mb-3 rounded-lg border border-amber-300/25 bg-amber-300/5 p-3" role="alert">
            <p className="mb-1 text-sm font-semibold text-amber-100">Unresolved issues: {unresolved.length}</p>
            <ul className="max-h-40 list-disc overflow-auto pl-5 text-xs text-amber-100/80">{unresolved.map(({ index, issue }) => <li key={`${index}-${issue}`}>CSV row {index + 1}: {issue}</li>)}</ul>
          </div>
          : <p className="mb-3 text-sm font-medium text-emerald-200">Unresolved issues: none. All non-skipped rows passed review validation.</p>;
      })()}
      {counts.overwrite > 0 && <div className="mb-3 rounded-lg border border-sky-300/20 bg-sky-300/5 p-3"><p className="mb-1 text-xs font-semibold text-sky-100">Products to overwrite</p><ul className="max-h-32 list-disc overflow-auto pl-5 text-xs text-cream/75">{items.filter((item) => item.action === "overwrite").map((item) => <li key={item.index}>CSV row {item.index + 1}: {item.product?.name}</li>)}</ul></div>}
      {counts.publish > 0 && <div className="mb-4 rounded-lg border border-mall-accent/20 bg-mall-accent/5 p-3"><p className="mb-1 text-xs font-semibold text-mall-accent">Products to publish</p><ul className="max-h-32 list-disc overflow-auto pl-5 text-xs text-cream/75">{items.filter((item) => item.action !== "skip" && item.status === "published").map((item) => <li key={item.index}>CSV row {item.index + 1}: {item.product?.name} ({item.action})</li>)}</ul></div>}
      {error && <p role="alert" className="mb-3 text-xs text-red-300">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-cream/15 px-4 py-2 text-xs text-cream/70 disabled:opacity-50">Back to editing</button>
        <button type="button" disabled={busy || items.some((item) => item.action !== "skip" && (issuesByIndex.get(item.index) || []).length > 0)} onClick={commit} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-mall-accent px-4 py-2 text-xs font-semibold text-mall-900 disabled:opacity-50"><Upload size={13} />{busy ? "Importing…" : "Confirm import"}</button>
      </div>
    </section> : <form onSubmit={startConfirmation} className="space-y-2.5">
      {pageItems.length === 0 && <p className="rounded-xl border border-cream/10 p-6 text-center text-sm text-cream/55">No products match this search and filter.</p>}
      {pageItems.map((item) => {
        const product = item.product;
        const expanded = expandedIndex === item.index;
        const itemIssues = issuesByIndex.get(item.index) || [];
        const status = getImportReviewStatus(item, itemIssues);
        const hasMatchSuggestion = Boolean(item.candidates?.length);
        const rowState = status === "blocked" ? "Cannot map" : status === "skipped" ? "Skipped" : status === "attention" ? "Needs review" : "Ready";
        const fieldIssue = (field) => itemIssues.find((issue) => ({
          name: issue.startsWith("Add a product name") || issue.startsWith("Product name"),
          sku: issue.includes("product SKU") || issue.includes("Product SKU") || issue.includes("SKU codes") || issue.includes("SKU also appears"),
          price: issue.startsWith("Price ") || issue.includes("price greater than zero") || issue.includes("Compare-at price"),
          floor: issue.includes("floor"),
          shop: issue.includes("shop"),
          category: issue.includes("category"),
          subcategory: issue.includes("subcategory"),
          stock: issue.startsWith("Stock ") || issue.includes("Confirm stock"),
          images: issue.includes("image") || issue.includes("gallery image"),
        }[field]));
        const fieldAttributes = (field) => {
          const issue = fieldIssue(field);
          const id = `import-${item.index}-${field}-error`;
          return {
            "aria-invalid": issue ? "true" : undefined,
            "aria-describedby": issue ? id : undefined,
            className: `${FIELD_CLASS}${issue ? " border-red-400/70 focus:border-red-300" : ""}`,
          };
        };
        const fieldMessage = (field) => {
          const issue = fieldIssue(field);
          return issue ? <p id={`import-${item.index}-${field}-error`} className="mt-1 text-xs text-red-200">{issue}</p> : null;
        };
        const category = categories.find((entry) => String(entry._id) === String(item.categoryId || "")
          || entry.name === item.category);
        const rowShops = shops.filter((shop) => String(shop.floor?._id || shop.floor || "") === String(item.floorId || ""));
        const blocked = !product;
        return <article key={item.index} className={`overflow-hidden rounded-xl border ${status === "blocked" || status === "attention" ? "border-amber-300/25" : "border-cream/10"} bg-mall-900/35`}>
          <div className="flex min-w-0 flex-wrap items-center gap-3 p-3 sm:flex-nowrap sm:p-4">
            <label className="flex h-10 w-8 shrink-0 items-center justify-center">
              <input type="checkbox" aria-label={`Select CSV row ${item.index + 1}`} disabled={!item.product || item.action === "skip"} checked={selectedRows.includes(item.index)} onChange={() => setSelectedRows((current) => current.includes(item.index) ? current.filter((index) => index !== item.index) : [...current, item.index])} className="h-4 w-4 accent-mall-accent disabled:opacity-30" />
            </label>
            {product?.images?.[0] && <img src={product.images[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-mall-800 object-cover sm:h-14 sm:w-14" />}
            <button type="button" aria-expanded={expanded} onClick={() => setExpandedIndex(expanded ? null : item.index)} className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-mall-accent">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="max-w-full truncate text-sm font-semibold text-cream">{product?.name || `CSV row ${item.index + 1}`}</span>
                <ReviewBadge tone={status === "blocked" ? "error" : status === "attention" ? "attention" : status === "ready" ? "ready" : "neutral"}>{rowState}</ReviewBadge>
                {hasMatchSuggestion && <ReviewBadge tone="attention">Match suggestion</ReviewBadge>}
                {item.sourcePublished && <ReviewBadge tone="mapped">CSV: published</ReviewBadge>}
              </span>
              <span className="mt-1 block truncate text-[11px] text-cream/60">{product?.sku ? `SKU ${product.sku}` : "SKU missing"}{product?.price !== "" && product?.price != null ? ` · KSh ${Number(product.price).toLocaleString()}` : " · Price not set"}{product?.variants?.length ? ` · ${product.variants.length} options` : ""}{product?.variants?.length ? "" : ` · Stock ${product?.stock === "" || product?.stock == null ? "unconfirmed" : product?.stock}`}</span>
              <span className="mt-1 block truncate text-[10px] text-cream/50">{item.category ? `Mapped from CSV: ${item.sourceCategory || "category not provided"} → ${item.category}${item.subcategory ? ` / ${item.subcategory}` : ""}` : item.sourceCategory ? `Unmapped CSV category: ${item.sourceCategory}` : "Category not selected"}</span>
              {(item.sourcePlacement?.floor || item.sourcePlacement?.shop) && <span className="mt-1 block truncate text-[10px] text-cream/50">CSV location: {[item.sourcePlacement.floor, item.sourcePlacement.shop].filter(Boolean).join(" · ")}</span>}
            </button>
            <label className="sr-only" htmlFor={`import-action-${item.index}`}>Decision for CSV row {item.index + 1}</label>
            <select id={`import-action-${item.index}`} value={item.action} onChange={(event) => updateItem(item.index, { action: event.target.value })} className="order-last min-h-10 w-full shrink-0 rounded-lg border border-cream/15 bg-mall-800 px-2 text-xs text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-mall-accent sm:order-none sm:w-40" aria-label={`Decision for CSV row ${item.index + 1}`}>
              <option value="create" disabled={blocked}>Create new</option>
              {item.candidates?.length > 0 && <option value="overwrite">Overwrite match</option>}
              <option value="skip">Skip this product</option>
            </select>
            <button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} CSV row ${item.index + 1}`} onClick={() => setExpandedIndex(expanded ? null : item.index)} className="flex h-10 w-8 shrink-0 items-center justify-center text-cream/55 hover:text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-mall-accent">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
          </div>

          {itemIssues.length > 0 && <div className="px-3 pb-3 sm:px-4" role="status"><p className="flex items-center gap-1.5 text-[11px] text-amber-200"><AlertCircle size={13} />{itemIssues.length} review {itemIssues.length === 1 ? "item" : "items"}</p></div>}

          {expanded && <div className="space-y-4 border-t border-cream/10 p-3 sm:p-4">
            {blocked ? <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200"><p className="font-medium">This CSV row could not be mapped to a product.</p>{item.errors?.map((message, index) => <p key={index} className="mt-1">{message}</p>)}<p className="mt-2 text-cream/55">{status === "skipped" ? "This row will be skipped and counted in the import plan." : "Skip this row to account for it in the import plan."}</p></div> : <>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cream/10 bg-mall-800/35 p-3">
                <span className="mr-1 text-[10px] text-cream/55">Value source</span>
                <ReviewBadge tone="mapped">Imported fields · WooCommerce CSV</ReviewBadge>
                {(item.generatedSkus?.product || item.generatedSkus?.variants?.length > 0) && <ReviewBadge tone="mapped">SKU suggestions generated · verify before import</ReviewBadge>}
                {item.category && <ReviewBadge tone="mapped">Category mapped to {item.category}</ReviewBadge>}
                {item.placementSuggestion?.floorId && item.placementSuggestion?.shopId && <ReviewBadge tone="mapped">CSV floor and shop matched</ReviewBadge>}
                {item.placementIssue && <ReviewBadge tone="attention">Review CSV floor/shop match</ReviewBadge>}
                {!item.floorId && <ReviewBadge tone="attention">Choose a floor</ReviewBadge>}
                {!item.shopId && <ReviewBadge tone="attention">Choose a shop</ReviewBadge>}
                {(!product.variants.length && (product.stock === "" || product.stock == null)) && <ReviewBadge tone="attention">Stock unconfirmed</ReviewBadge>}
                <ReviewBadge tone="neutral">{item.status === "draft" ? "Safe default · draft" : "Admin selected · publish"}</ReviewBadge>
              </div>
              {item.candidates?.length > 0 && <div className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-3">
                <p className="mb-2 text-xs font-semibold text-amber-100">Possible existing matches · verify before overwrite</p>
                <div className="space-y-2">
                  {item.candidates.map((candidate) => <label key={candidate.id} className="flex min-h-11 items-center gap-2 text-xs text-cream/75">
                    <input type="radio" name={`candidate-${item.index}`} checked={item.productId === String(candidate.id)} onChange={() => updateItem(item.index, { productId: String(candidate.id), floorId: candidate.shop?.floor?.id || "", shopId: candidate.shop?.id || "" })} className="accent-mall-accent" />
                    <span>{candidate.name} · {candidate.sku || "no SKU"}{candidate.shop?.name ? ` · ${candidate.shop.name}` : ""}{candidate.shop?.floor?.name ? ` · Floor ${candidate.shop.floor.floorNumber}: ${candidate.shop.floor.name}` : ""} · {candidate.status}</span>
                  </label>)}
                </div>
              </div>}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="sm:col-span-2"><span className={LABEL_CLASS}>Product name</span><input value={product.name} onChange={(event) => updateProduct(item.index, { name: event.target.value })} {...fieldAttributes("name")} />{fieldMessage("name")}</label>
                <div>
                  <label htmlFor={`import-${item.index}-sku`} className={LABEL_CLASS}>Product SKU{item.generatedSkus?.product ? " · suggested" : ""}</label>
                  <div className="flex gap-2">
                    <input id={`import-${item.index}-sku`} value={product.sku} onChange={(event) => updateProduct(item.index, { sku: event.target.value.toUpperCase() })} {...fieldAttributes("sku")} />
                    <button type="button" disabled={Boolean(skuGenerating)} onClick={() => generateSku(item.index)} className="min-h-11 shrink-0 rounded-xl border border-cream/15 px-3 text-[10px] text-cream/70 hover:text-cream disabled:opacity-50">{skuGenerating === `${item.index}-product` ? "Generating…" : product.sku ? "Suggest replacement" : "Generate SKU"}</button>
                  </div>
                  {item.generatedSkus?.product && <p className="mt-1 text-[10px] text-sky-100/70">Generated from the product name. Editable; uniqueness is checked again when saved.</p>}
                  {fieldMessage("sku")}
                </div>
                <label><span className={LABEL_CLASS}>Brand</span><select value={product.brandId} onChange={(event) => {
                  const brand = brands.find((entry) => String(entry._id) === event.target.value);
                  updateProduct(item.index, { brandId: brand?._id || "", brand: brand?.name || "" });
                }} className={FIELD_CLASS}><option value="">No brand / choose a managed match</option>{brands.map((brand) => <option key={brand._id} value={brand._id}>{brand.name}</option>)}</select>{product.brand && !product.brandId && <p className="mt-1 text-[10px] text-amber-100">CSV brand “{product.brand}” is not managed; map it or clear it before import.</p>}</label>
                <label><span className={LABEL_CLASS}>Price (KSh)</span><input type="number" min="0" step="any" value={product.price} onChange={(event) => updateProduct(item.index, { price: event.target.value })} {...fieldAttributes("price")} />{fieldMessage("price")}</label>
                <label><span className={LABEL_CLASS}>Compare-at price</span><input type="number" min="0" step="any" value={product.compareAtPrice} onChange={(event) => updateProduct(item.index, { compareAtPrice: event.target.value })} className={FIELD_CLASS} /></label>
                <label><span className={LABEL_CLASS}>Floor</span><select value={item.floorId} onChange={(event) => updateItem(item.index, { floorId: event.target.value, shopId: "", placementIssue: "" })} className={FIELD_CLASS}><option value="">Choose floor first</option>{floors.filter((floor) => floor.isActive !== false).map((floor) => <option key={floor._id} value={floor._id}>Floor {floor.floorNumber}: {floor.name}</option>)}</select>{item.placementIssue && <p className="mt-1 text-xs text-amber-100">{item.placementIssue}</p>}{fieldMessage("floor")}</label>
                <label><span className={LABEL_CLASS}>Shop</span><select value={item.shopId} disabled={!item.floorId} onChange={(event) => updateItem(item.index, { shopId: event.target.value, placementIssue: "" })} {...fieldAttributes("shop")}><option value="">{item.floorId ? "Choose shop on this floor" : "Choose a floor first"}</option>{rowShops.map((shop) => <option key={shop._id} value={shop._id}>#{shop.shopNumber} {shop.name}</option>)}</select>{fieldMessage("shop")}</label>
                <label><span className={LABEL_CLASS}>Category</span><select value={item.categoryId} onChange={(event) => {
                  const selected = categories.find((entry) => entry._id === event.target.value);
                  updateItem(item.index, { categoryId: selected?._id || "", subcategoryId: "", category: selected?.name || "", subcategory: "" });
                }} {...fieldAttributes("category")}><option value="">Choose category</option>{categories.map((entry) => <option key={entry._id} value={entry._id}>{entry.name}</option>)}</select>{fieldMessage("category")}</label>
                <label><span className={LABEL_CLASS}>Subcategory</span><select value={item.subcategoryId} disabled={!category} onChange={(event) => {
                  const selected = category?.subcategories?.find((entry) => entry._id === event.target.value);
                  updateItem(item.index, { subcategoryId: selected?._id || "", subcategory: selected?.name || "" });
                }} {...fieldAttributes("subcategory")}><option value="">Choose subcategory</option>{(category?.subcategories || []).map((sub) => <option key={sub._id} value={sub._id}>{sub.name}</option>)}</select>{fieldMessage("subcategory")}</label>
                <label><span className={LABEL_CLASS}>Stock quantity</span><input type="number" min="0" step="1" value={product.stock} onChange={(event) => updateProduct(item.index, { stock: event.target.value })} {...fieldAttributes("stock")} placeholder="Leave blank if unconfirmed" />{fieldMessage("stock")}</label>
                {!product.variants.length && <label><span className={LABEL_CLASS}>Reorder at or below <span className="text-cream/35">(blank = default 5)</span></span><input type="number" min="0" max="1000000" step="1" value={product.reorderLevel} onChange={(event) => updateProduct(item.index, { reorderLevel: event.target.value })} className={FIELD_CLASS} /></label>}
                <label><span className={LABEL_CLASS}>Return eligibility</span><select value={product.returnEligibility} onChange={(event) => updateProduct(item.index, { returnEligibility: event.target.value })} className={FIELD_CLASS}><option value="standard">Standard</option><option value="final_sale">Final sale</option><option value="perishable">Perishable</option><option value="digital_product">Digital product</option></select></label>
                <fieldset className="sm:col-span-2"><legend className={LABEL_CLASS}>Badges · up to {MAX_PRODUCT_BADGES}</legend><div className="grid gap-2 rounded-xl border border-cream/10 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {badgesLoading && <p className="text-xs text-cream/45">Loading badges…</p>}
                  {!badgesLoading && badgesError && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-red-200">
                    <span>{badgesError}</span>
                    <button type="button" onClick={retryBadges} className="min-h-8 rounded-md border border-red-200/20 px-2 text-red-100 hover:bg-red-200/5">Retry</button>
                  </div>}
                  {!badgesLoading && !badgesError && badges.map((badge) => <label key={badge._id} className="flex min-h-9 items-center gap-2 text-xs text-cream/70"><input type="checkbox" checked={(product.badges || []).includes(badge.slug)} disabled={!(product.badges || []).includes(badge.slug) && (product.badges || []).length >= MAX_PRODUCT_BADGES} onChange={() => {
                  const currentBadges = product.badges || [];
                  if (!currentBadges.includes(badge.slug) && currentBadges.length >= MAX_PRODUCT_BADGES) return;
                  const nextBadges = currentBadges.includes(badge.slug) ? currentBadges.filter((value) => value !== badge.slug) : [...currentBadges, badge.slug];
                  updateProduct(item.index, { badges: nextBadges, badge: nextBadges[0] || "" });
                }} className="h-4 w-4 accent-mall-accent disabled:opacity-40" /><span>{badge.chipLabel}</span></label>)}
                  {!badgesLoading && !badgesError && !badges.length && <p className="text-xs text-cream/55">No badges yet. <Link to="/admin/badges" className="text-mall-accent underline underline-offset-2">Create one in Badge management</Link>.</p>}
                </div><p className="mt-1 text-[10px] text-cream/40">Selected: {(product.badges || []).length}/{MAX_PRODUCT_BADGES}. Flash Sale is managed separately.</p></fieldset>
                <label><span className={LABEL_CLASS}>Save as</span><select value={item.status} onChange={(event) => updateItem(item.index, { status: event.target.value })} className={FIELD_CLASS}><option value="draft">Draft</option><option value="published">Published</option></select></label>
                <label><span className={LABEL_CLASS}>Flash sale ends</span><input type="datetime-local" value={product.flashSaleEndsAt} onChange={(event) => updateProduct(item.index, { flashSaleEndsAt: event.target.value })} className={FIELD_CLASS} /></label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className={LABEL_CLASS}>Short description</span><textarea rows="3" value={product.description} onChange={(event) => updateProduct(item.index, { description: event.target.value })} className={`${FIELD_CLASS} resize-y`} /></label>
                <label><span className={LABEL_CLASS}>Long description</span><textarea rows="3" value={product.longDescription} onChange={(event) => updateProduct(item.index, { longDescription: event.target.value })} className={`${FIELD_CLASS} resize-y`} /></label>
                <label><span className={LABEL_CLASS}>Gallery images · one HTTPS URL per line (up to 12)</span><textarea rows="3" value={product.images.join("\n")} onChange={(event) => updateProduct(item.index, { images: event.target.value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean) })} {...fieldAttributes("images")} className={`${FIELD_CLASS} resize-y font-mono text-xs`} />{fieldMessage("images")}</label>
                <div>
                  <span className={LABEL_CLASS}>Product tags</span>
                  <div className="flex min-h-11 flex-wrap gap-2 pt-1">
                    {["work", "gaming", "travel", "home", "fitness"].map((tag) => <label key={tag} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-cream/10 px-2 text-xs text-cream/70">
                      <input type="checkbox" checked={product.purposeTags.includes(tag)} onChange={(event) => updateProduct(item.index, { purposeTags: event.target.checked ? [...product.purposeTags, tag] : product.purposeTags.filter((value) => value !== tag) })} className="accent-mall-accent" />{tag}
                    </label>)}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-cream/10 bg-mall-800/35 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xs font-semibold text-cream">Product options</h3><p className="mt-0.5 text-[10px] text-cream/40">Each option has its own SKU, price, stock and reorder level.</p></div><button type="button" onClick={() => updateProduct(item.index, { variants: [...product.variants, { name: "", sku: "", price: "", compareAtPrice: "", stock: "", reorderLevel: 5, image: "" }] })} className="flex min-h-10 items-center gap-1 rounded-lg border border-cream/15 px-3 text-xs text-cream/70 hover:text-cream"><Plus size={13} /> Add option</button></div>
                {product.variants.length === 0 && <p className="py-2 text-xs text-cream/35">No product options</p>}
                <div className="space-y-3">
                  {product.variants.map((variant, index) => <div key={`${item.index}-variant-${index}`} className="rounded-lg border border-cream/10 p-3">
                    <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-mono-tag uppercase tracking-widest text-cream/45">Option {index + 1}</p><button type="button" onClick={() => updateProduct(item.index, { variants: product.variants.filter((_, variantIndex) => variantIndex !== index) })} aria-label={`Remove option ${index + 1}`} className="flex h-9 w-9 items-center justify-center text-cream/45 hover:text-red-300"><Trash2 size={14} /></button></div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      <label><span className={LABEL_CLASS}>Option name</span><input value={variant.name} onChange={(event) => updateVariant(item.index, index, { name: event.target.value })} className={FIELD_CLASS} /></label>
                      <div>
                        <label htmlFor={`import-${item.index}-variant-${index}-sku`} className={LABEL_CLASS}>Option SKU{item.generatedSkus?.variants?.includes(index) ? " · suggested" : ""}</label>
                        <div className="flex gap-2">
                          <input id={`import-${item.index}-variant-${index}-sku`} value={variant.sku} onChange={(event) => updateVariant(item.index, index, { sku: event.target.value.toUpperCase() })} className={FIELD_CLASS} />
                          <button type="button" disabled={Boolean(skuGenerating)} onClick={() => generateSku(item.index, index)} className="min-h-11 shrink-0 rounded-xl border border-cream/15 px-3 text-[10px] text-cream/70 hover:text-cream disabled:opacity-50">{skuGenerating === `${item.index}-${index}` ? "Generating…" : variant.sku ? "Suggest replacement" : "Generate SKU"}</button>
                        </div>
                      </div>
                      <label><span className={LABEL_CLASS}>Price</span><input type="number" min="0" step="any" value={variant.price} onChange={(event) => updateVariant(item.index, index, { price: event.target.value })} className={FIELD_CLASS} /></label>
                      <label><span className={LABEL_CLASS}>Compare-at price</span><input type="number" min="0" step="any" value={variant.compareAtPrice} onChange={(event) => updateVariant(item.index, index, { compareAtPrice: event.target.value })} className={FIELD_CLASS} /></label>
                      <label><span className={LABEL_CLASS}>Stock</span><input type="number" min="0" step="1" value={variant.stock} onChange={(event) => updateVariant(item.index, index, { stock: event.target.value })} className={FIELD_CLASS} /></label>
                      <label><span className={LABEL_CLASS}>Reorder at or below <span className="text-cream/35">(blank = default 5)</span></span><input type="number" min="0" max="1000000" step="1" value={variant.reorderLevel} onChange={(event) => updateVariant(item.index, index, { reorderLevel: event.target.value })} className={FIELD_CLASS} /></label>
                      <label><span className={LABEL_CLASS}>Option image URL</span><input value={variant.image} onChange={(event) => updateVariant(item.index, index, { image: event.target.value })} className={FIELD_CLASS} /></label>
                    </div>
                  </div>)}
                </div>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-xs text-cream/70"><input type="checkbox" checked={product.isFlashSale} onChange={(event) => updateProduct(item.index, { isFlashSale: event.target.checked })} className="accent-mall-accent" />Mark as a flash sale</label>
            </>}

            {itemIssues.length > 0 && <div className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-3" role="alert">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-100"><AlertCircle size={13} />Needs review</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-100/80">{itemIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </div>}
            {!blocked && item.errors?.length > 0 && <details className="text-[11px] text-cream/45"><summary className="cursor-pointer">Original CSV notes ({item.errors.length})</summary><ul className="mt-1 list-disc space-y-0.5 pl-5">{item.errors.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
          </div>}
        </article>;
      })}

      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <div className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-xl border border-cream/10 bg-mall-900/95 p-3 shadow-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button type="button" disabled={page === 0 || busy} onClick={() => setPage((current) => current - 1)} className="min-h-10 rounded-lg border border-cream/15 px-3 text-xs text-cream/70 disabled:opacity-40">Previous</button>
          <span className="text-xs text-cream/55">{pageCount ? `Page ${page + 1} of ${pageCount}` : "No results"}</span>
          <button type="button" disabled={page + 1 >= pageCount || busy} onClick={() => setPage((current) => current + 1)} className="min-h-10 rounded-lg border border-cream/15 px-3 text-xs text-cream/70 disabled:opacity-40">Next</button>
        </div>
        <p className="text-[11px] text-cream/55">All {items.length} rows · {counts.create} create · {counts.overwrite} overwrite · {counts.skipped} skip</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={busy} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-mall-accent px-4 py-2 text-xs font-semibold text-mall-900 disabled:cursor-not-allowed disabled:opacity-45"><Check size={13} />Review final plan</button>
          <button type="button" disabled={busy} onClick={onCancel} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-cream/15 px-4 py-2 text-xs text-cream/60 disabled:opacity-40"><X size={13} />Cancel</button>
        </div>
      </div>
    </form>}
  </section>;
}
