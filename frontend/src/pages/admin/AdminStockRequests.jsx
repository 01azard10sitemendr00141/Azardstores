import { useEffect, useState } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import api from "../../api/client";
import AdminLoadError from "../../components/AdminLoadError";

export default function AdminStockRequests() {
  const [requests, setRequests] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [requestResponse, supplierResponse] = await Promise.all([
        api.get("/stock-requests/admin", { params: { status: status === "all" ? undefined : status, limit: 100 } }),
        api.get("/suppliers", { params: { limit: 100 } }),
      ]);
      setRequests(requestResponse.data.requests || []);
      setSuppliers(supplierResponse.data.suppliers || []);
    } catch {
      setLoadError("Stock requests could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [status]);

  async function confirmItem(requestId, item, fields) {
    setSavingId(`${requestId}:${item._id}`);
    setError("");
    try {
      await api.post(`/stock-requests/${requestId}/confirm-item`, {
        itemId: item._id,
        supplierId: fields.supplierId,
        confirmedQuantity: item.quantity,
        supplierUnitCost: fields.supplierUnitCost,
        confirmedCustomerPrice: fields.confirmedCustomerPrice,
        transferTimeHours: fields.transferTimeHours,
      });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The item could not be confirmed.");
    } finally {
      setSavingId("");
    }
  }

  async function action(requestId, name) {
    setSavingId(requestId);
    setError("");
    try {
      await api.post(`/stock-requests/${requestId}/${name}`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "The stock request could not be updated.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-cream/10 pb-4">
        <div><p className="mb-0.5 font-mono-tag text-[10px] uppercase tracking-widest text-mall-orange">Inventory verification</p><h1 className="font-display text-2xl text-cream">Stock Requests</h1></div>
        <button type="button" onClick={load} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cream/10 px-4 text-xs text-cream/70"><RefreshCw size={14} /> Refresh</button>
      </div>
      <p className="mb-5 max-w-3xl text-xs leading-relaxed text-cream/45">Confirm the supplier, price and exact quantity for each line. The 12-hour customer quote starts automatically when the final line is confirmed.</p>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-300/15 bg-red-300/5 p-3 text-xs text-red-200">{error}</p>}
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="mb-4 min-h-11 rounded-xl border border-cream/10 bg-mall-800 px-3 text-xs text-cream">
        <option value="all">All statuses</option><option value="checking">Checking</option><option value="partial">Partially confirmed</option><option value="quoted">Quote active</option><option value="expired">Expired</option><option value="released">Released</option><option value="cancelled">Cancelled</option><option value="converted">Converted to order</option>
      </select>
      {loading ? (
        <p className="py-16 text-center text-xs text-cream/40">Loading stock requests…</p>
      ) : loadError ? (
        <AdminLoadError message={loadError} onRetry={load} />
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cream/10 py-16 text-center"><Clock3 size={28} className="mx-auto mb-3 text-cream/20" /><p className="text-sm text-cream/60">No stock requests found</p></div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <article key={request._id} className="rounded-2xl border border-cream/8 bg-mall-800/40 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-mono-tag text-[10px] uppercase tracking-wider text-mall-orange">#{request._id.slice(-6).toUpperCase()} · {request.status}</p><h2 className="mt-1 font-display text-lg text-cream">{request.guestInfo?.name || "Registered customer"}</h2><p className="mt-1 text-xs text-cream/40">{request.guestInfo?.phone || ""}{request.guestInfo?.email ? ` · ${request.guestInfo.email}` : ""}</p></div>
                {request.quoteExpiresAt && <p className="text-xs text-cream/50">Quote expires {new Date(request.quoteExpiresAt).toLocaleString()}</p>}
              </div>
              <div className="mt-4 space-y-3">
                {request.items.map((item) => (
                  <ItemConfirmation
                    key={item._id}
                    request={request}
                    item={item}
                    suppliers={suppliers}
                    saving={savingId === `${request._id}:${item._id}`}
                    finalLine={request.items.filter((line) => line.confirmedQuantity !== line.quantity).length === 1 && item.confirmedQuantity !== item.quantity}
                    onConfirm={(fields) => confirmItem(request._id, item, fields)}
                  />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {["checking", "partial"].includes(request.status) && (() => {
                  const confirmedCount = request.items.filter((item) => item.confirmedQuantity === item.quantity).length;
                  return (
                    <p className="text-xs text-cream/55">
                      {confirmedCount === request.items.length
                        ? "Availability confirmed."
                        : `${confirmedCount} of ${request.items.length} lines confirmed.`}
                    </p>
                  );
                })()}
                {request.status === "quoted" && <button type="button" disabled={savingId === request._id} onClick={() => action(request._id, "extend")} className="min-h-10 rounded-lg border border-mall-accent/20 px-3 text-xs text-mall-accent disabled:opacity-50">Extend once</button>}
                {request.status === "quoted" && <button type="button" disabled={savingId === request._id} onClick={() => action(request._id, "expire")} className="min-h-10 rounded-lg border border-amber-300/20 px-3 text-xs text-amber-100 disabled:opacity-50">Expire quote</button>}
                {["expired", "cancelled"].includes(request.status) && <button type="button" disabled={savingId === request._id} onClick={() => action(request._id, "release")} className="min-h-10 rounded-lg border border-emerald-300/20 px-3 text-xs text-emerald-200 disabled:opacity-50">Confirm held stock released</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemConfirmation({ request, item, suppliers, saving, finalLine, onConfirm }) {
  const [fields, setFields] = useState({
    supplierId: item.supplier?._id || item.supplier || "",
    supplierUnitCost: item.supplierUnitCost ?? "",
    confirmedCustomerPrice: item.confirmedCustomerPrice ?? item.catalogPrice ?? "",
    transferTimeHours: item.transferTimeHours ?? "",
  });
  const confirmed = item.confirmedQuantity === item.quantity;
  const supplierName = suppliers.find((supplier) => String(supplier._id) === String(fields.supplierId))?.name;
  return (
    <div className="rounded-xl border border-cream/8 bg-mall-900/60 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-cream/80">{item.name}{item.variantName ? ` · ${item.variantName}` : ""}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-mall-orange">Set aside exactly {item.quantity} unit{item.quantity === 1 ? "" : "s"}</p>
        </div>
        <span className={`text-[10px] ${confirmed ? "text-emerald-300" : "text-amber-200"}`}>{confirmed ? "Set aside and confirmed" : "Waiting for staff confirmation"}</span>
      </div>
      {confirmed ? (
        <div className="grid gap-2 text-[11px] text-cream/55 sm:grid-cols-4">
          <p><span className="block text-[9px] uppercase tracking-wide text-cream/30">Supplier</span>{supplierName || "Confirmed supplier"}</p>
          <p><span className="block text-[9px] uppercase tracking-wide text-cream/30">Supplier cost</span>KSh {Number(item.supplierUnitCost || 0).toLocaleString()}</p>
          <p><span className="block text-[9px] uppercase tracking-wide text-cream/30">Customer price</span>KSh {Number(item.confirmedCustomerPrice || 0).toLocaleString()}</p>
          <p><span className="block text-[9px] uppercase tracking-wide text-cream/30">Transfer</span>{item.transferTimeHours} hour{Number(item.transferTimeHours) === 1 ? "" : "s"}</p>
        </div>
      ) : ["checking", "partial"].includes(request.status) && (
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-[10px] text-cream/45">Supplier<select value={fields.supplierId} onChange={(event) => setFields({ ...fields, supplierId: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-cream/10 bg-mall-800 px-2 text-xs text-cream"><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}</select></label>
          <label className="text-[10px] text-cream/45">Supplier cost<input type="number" min="0" step="0.01" value={fields.supplierUnitCost} onChange={(event) => setFields({ ...fields, supplierUnitCost: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-cream/10 bg-mall-800 px-2 text-xs text-cream" /></label>
          <label className="text-[10px] text-cream/45">Customer price<input type="number" min="0" step="0.01" value={fields.confirmedCustomerPrice} onChange={(event) => setFields({ ...fields, confirmedCustomerPrice: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-cream/10 bg-mall-800 px-2 text-xs text-cream" /></label>
          <label className="text-[10px] text-cream/45">Transfer hours<input type="number" min="1" step="1" value={fields.transferTimeHours} onChange={(event) => setFields({ ...fields, transferTimeHours: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-cream/10 bg-mall-800 px-2 text-xs text-cream" /></label>
          <button
            type="button"
            disabled={saving || !fields.supplierId || fields.supplierUnitCost === "" || fields.confirmedCustomerPrice === "" || fields.transferTimeHours === ""}
            onClick={() => onConfirm(fields)}
            className="min-h-11 rounded-lg border border-mall-accent/20 px-3 text-xs font-semibold text-mall-accent transition enabled:hover:border-mall-accent enabled:hover:bg-mall-accent/10 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-4"
          >
            {finalLine ? "Confirm & send 12-hour quote" : "Confirm availability"}
          </button>
        </div>
      )}
    </div>
  );
}
