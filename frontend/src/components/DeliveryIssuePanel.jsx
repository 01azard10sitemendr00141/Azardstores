import { useState } from "react";
import { AlertCircle } from "lucide-react";
import api from "../api/client";

const ISSUE_STATUS = { open: "Under review", investigating: "Being checked", resolved: "Resolved" };

function canReportDeliveryIssue(order) {
  const status = order?.status;
  const serviceType = order?.deliveryRoute?.serviceType;
  if (serviceType === "parcel") return ["shipped", "ready_for_collection", "collected", "delivered"].includes(status);
  if (serviceType === "direct") return ["shipped", "delivered"].includes(status);
  return false;
}

export default function DeliveryIssuePanel({ order, contact = "", onUpdate }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const issues = order?.deliveryIssueRequests || [];
  const hasOpenIssue = issues.some((issue) => ["open", "investigating"].includes(issue.status));
  const canReport = canReportDeliveryIssue(order);
  if (!canReport && !issues.length) return null;

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await api.post(`/orders/${order._id}/delivery-issues`, { reason, contact });
      setReason("");
      onUpdate?.(response.data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not send the delivery report. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 space-y-3" aria-live="polite">
    <div><p className="text-sm font-semibold text-amber-100">Delivery and collection support</p><p className="mt-1 text-xs text-cream/50">Report a delay, a missing parcel, a collection problem, or an order marked delivered that you did not receive. Azard Stores will review the handover details and contact the carrier when needed.</p></div>
    {issues.map((issue) => <div key={issue._id} className={`rounded-lg px-3 py-3 text-xs ${issue.status === "resolved" ? "border border-emerald-300/15 bg-emerald-300/5" : "bg-mall-900/50"}`}>
      <div className="flex items-center justify-between gap-3"><p className={`font-semibold ${issue.status === "resolved" ? "text-emerald-200" : "text-amber-100"}`}>{ISSUE_STATUS[issue.status] || "Under review"}</p>{issue.status === "resolved" && issue.resolvedAt && <p className="text-[10px] text-cream/35">Resolved {new Date(issue.resolvedAt).toLocaleString("en-KE")}</p>}</div>
      {issue.status === "open" && <p className="mt-1 text-cream/40">Azard Stores received your report and will review it.</p>}
      {issue.status === "investigating" && <p className="mt-1 text-cream/40">Azard Stores is checking the delivery details and will update you.</p>}
      {issue.status === "resolved" && <p className="mt-1 text-cream/40">Azard Stores marked this report as resolved. If the problem is still ongoing, send a follow-up below.</p>}
      <p className="mt-2 text-cream/60">Your report: {issue.reason}</p>
      {issue.response && <p className="mt-2 border-t border-cream/8 pt-2 text-cream/70"><span className="font-medium text-cream/80">Azard Stores update:</span> {issue.response}</p>}
      <p className="mt-2 text-[10px] text-cream/30">Reported {new Date(issue.requestedAt).toLocaleString("en-KE")}{issue.updatedAt && issue.status !== "resolved" ? ` · Updated ${new Date(issue.updatedAt).toLocaleString("en-KE")}` : ""}</p>
    </div>)}
    {canReport && !hasOpenIssue && <form onSubmit={submit} className="space-y-2">
      <label htmlFor={`delivery-issue-${order._id}`} className="block text-xs text-cream/65">What went wrong?</label>
      <textarea id={`delivery-issue-${order._id}`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={1000} required rows={3} placeholder="Tell us what happened, including when you checked the delivery or collection." className="w-full resize-y rounded-lg border border-cream/10 bg-mall-900/70 px-3 py-2 text-xs text-cream placeholder:text-cream/25 outline-none focus:border-mall-accent" />
      <button type="submit" disabled={saving || reason.trim().length < 8} className="inline-flex items-center gap-2 rounded-lg border border-amber-200/20 px-3 py-2 text-xs text-amber-100 disabled:opacity-50"><AlertCircle size={13}/>{saving ? "Sending report…" : "Report delivery problem"}</button>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </form>}
  </section>;
}
