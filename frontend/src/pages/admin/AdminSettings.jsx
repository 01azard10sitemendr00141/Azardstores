import { useEffect, useState } from "react";
import { Check, CreditCard, Mail, RefreshCw, Smartphone, Truck } from "lucide-react";
import api from "../../api/client";
import AdminLoadError from "../../components/AdminLoadError";
import { useSettings } from "../../context/SettingsContext";

export default function AdminSettings() {
  const { settings: publicSettings, loading: publicSettingsLoading, updateSettings } = useSettings();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [emailQueue, setEmailQueue] = useState(null);
  const [emailQueueLoading, setEmailQueueLoading] = useState(true);
  const [emailQueueError, setEmailQueueError] = useState("");
  const [retryingEmail, setRetryingEmail] = useState("");

  async function loadEmailQueue() {
    setEmailQueueError("");
    try {
      const res = await api.get("/notifications/email-outbox");
      setEmailQueue(res.data);
    } catch (err) {
      setEmailQueueError(err.response?.data?.message || "Email delivery status could not be loaded.");
    } finally {
      setEmailQueueLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    api.get("/settings/admin").then((res) => setForm(res.data))
      .catch(() => setError("Settings could not be loaded."))
      .finally(() => setLoading(false));
  }, [loadAttempt]);

  useEffect(() => {
    loadEmailQueue();
  }, []);

  async function retryEmail(id) {
    setRetryingEmail(id);
    setEmailQueueError("");
    try {
      await api.post(`/notifications/email-outbox/${id}/retry`);
      await loadEmailQueue();
    } catch (err) {
      setEmailQueueError(err.response?.data?.message || "Could not retry this email.");
    } finally {
      setRetryingEmail("");
    }
  }

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await api.put("/settings", { whatsappNumber: form.whatsappNumber, contactEmail: form.contactEmail, maintenanceMode: form.maintenanceMode });
      updateSettings(res.data);
      setForm(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full bg-mall-800 border border-cream/10 rounded-xl px-3 py-2.5 text-cream text-sm placeholder-cream/20 outline-none focus:border-mall-accent transition";
  const activeDeliveryRoutes = (form?.deliveryRoutes || []).filter((route) => route.active !== false).length;
  const readinessItems = [
    {
      icon: Mail,
      label: "Email delivery",
      value: emailQueueLoading ? "Checking" : emailQueueError ? "Status unavailable" : emailQueue?.deliveryConfigured ? "SMTP credentials present" : "SMTP not configured",
      ready: Boolean(emailQueue?.deliveryConfigured),
      detail: "A successful send test is still needed.",
    },
    {
      icon: CreditCard,
      label: "Card payments",
      value: publicSettingsLoading ? "Checking" : publicSettings.paymentMethods?.paystack ? "Live credentials present" : "Not configured",
      ready: Boolean(publicSettings.paymentMethods?.paystack),
      detail: "Complete a provider test before accepting live payments.",
    },
    {
      icon: Smartphone,
      label: "M-Pesa payments",
      value: publicSettingsLoading ? "Checking" : publicSettings.paymentMethods?.mpesa ? "Enabled by operator" : "Not enabled",
      ready: Boolean(publicSettings.paymentMethods?.mpesa),
      detail: "Confirm M-Pesa is active on the Paystack account.",
    },
    {
      icon: Truck,
      label: "Delivery coverage",
      value: `${activeDeliveryRoutes} additional route${activeDeliveryRoutes === 1 ? "" : "s"} active`,
      ready: activeDeliveryRoutes > 0,
      detail: "Nairobi CBD direct delivery remains available; review every route, fee, and office in Delivery.",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !form) return <AdminLoadError message={error || "Settings are unavailable."} onRetry={() => setLoadAttempt((n) => n + 1)} />;

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-cream/10">
        <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">Admin</p>
        <h1 className="font-display text-2xl text-cream">Settings</h1>
      </div>

      <div className="flex items-start gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-6 max-w-2xl">
        <Check size={15} className="text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-cream/70 text-xs leading-relaxed">
          Everything below is live: WhatsApp number, contact email, and maintenance mode all
          take effect across the site as soon as you save.
        </p>
      </div>

      <section className="mb-8 max-w-3xl rounded-2xl border border-cream/10 bg-mall-800/40 p-4 sm:p-5" aria-labelledby="readiness-heading">
        <div className="mb-4">
          <p className="font-mono-tag text-[9px] uppercase tracking-widest text-cream/35">Operations</p>
          <h2 id="readiness-heading" className="mt-1 font-display text-lg text-cream">Launch configuration</h2>
          <p className="mt-1 text-xs leading-relaxed text-cream/40">This checks whether settings are present. It does not replace live provider and delivery tests.</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {readinessItems.map((item) => {
            const Icon = item.icon;
            return <li key={item.label} className="rounded-xl border border-cream/8 bg-mall-900/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-xs font-medium text-cream/75"><Icon size={14} className="text-mall-accent"/>{item.label}</span>
                <span className={`text-[10px] ${item.ready ? "text-emerald-300" : "text-amber-200"}`}>{item.value}</span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-cream/35">{item.detail}</p>
            </li>;
          })}
        </ul>
      </section>

      <form onSubmit={handleSave} className="max-w-lg space-y-5">
        <div>
          <label htmlFor="settings-whatsapp" className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">WhatsApp Number</label>
          <input
            id="settings-whatsapp"
            type="tel"
            value={form.whatsappNumber || ""}
            onChange={(e) => set("whatsappNumber", e.target.value)}
            placeholder="254700000000"
            inputMode="numeric"
            autoComplete="tel"
            pattern="254[0-9]{9}"
            maxLength={12}
            required
            className={inputClass}
          />
          <p className="text-cream/25 text-[10px] mt-1">No + or spaces — digits only.</p>
        </div>

        <div>
          <label htmlFor="settings-contact-email" className="font-mono-tag text-[9px] uppercase text-cream/40 tracking-widest block mb-1.5">Contact Email</label>
          <input
            id="settings-contact-email"
            type="email"
            value={form.contactEmail || ""}
            onChange={(e) => set("contactEmail", e.target.value)}
            placeholder="hello@azardstores.com"
            autoComplete="email"
            maxLength={254}
            required
            className={inputClass}
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <input
            type="checkbox"
            id="maintenanceMode"
            checked={form.maintenanceMode || false}
            onChange={(e) => set("maintenanceMode", e.target.checked)}
            className="w-4 h-4 accent-mall-accent"
          />
          <label htmlFor="maintenanceMode" className="text-cream/70 text-sm">
            Maintenance mode <span className="text-cream/30 text-xs">(blocks the storefront for everyone except admins when on)</span>
          </label>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button type="submit" disabled={saving}
          className="flex items-center gap-2 bg-mall-accent text-mall-900 font-semibold py-2.5 px-5 rounded-xl hover:bg-mall-accentDark transition disabled:opacity-50 text-sm">
          <Check size={14} /> {saving ? "Saving..." : saved ? "Saved" : "Save Settings"}
        </button>
      </form>

      <section className="mt-10 max-w-3xl border-t border-cream/10 pt-6" aria-labelledby="email-delivery-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono-tag text-[9px] uppercase tracking-widest text-cream/35">Operations</p>
            <h2 id="email-delivery-heading" className="mt-1 flex items-center gap-2 font-display text-xl text-cream"><Mail size={17} className="text-mall-accent"/>Email delivery</h2>
            <p className="mt-1 text-xs text-cream/40">Order emails are queued and retried if delivery fails. Message contents are hidden here.</p>
          </div>
          <button type="button" onClick={loadEmailQueue} disabled={emailQueueLoading} className="inline-flex items-center gap-2 rounded-lg border border-cream/10 px-3 py-2 text-xs text-cream/65 hover:border-cream/25 disabled:opacity-50"><RefreshCw size={13}/>Refresh</button>
        </div>

        {emailQueueError && <p role="alert" className="mt-4 rounded-lg border border-red-300/15 bg-red-300/5 px-3 py-2 text-xs text-red-200">{emailQueueError}</p>}
        {emailQueueLoading && !emailQueue ? <p className="mt-4 text-xs text-cream/40">Loading email queue…</p> : emailQueue && <>
          {!emailQueue.deliveryConfigured && <p role="status" className="mt-4 rounded-lg border border-amber-300/15 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">SMTP is not configured. Order emails remain queued until EMAIL_USER and EMAIL_PASS are set on the backend.</p>}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['Queued', emailQueue.counts.queued], ['Sending', emailQueue.counts.sending], ['Failed', emailQueue.counts.failed], ['Sent', emailQueue.counts.sent]].map(([label, count]) => <div key={label} className="rounded-xl border border-cream/8 bg-mall-800/60 px-3 py-3"><p className="font-mono-tag text-[9px] uppercase tracking-widest text-cream/35">{label}</p><p className="mt-1 font-display text-xl text-cream">{Number(count || 0).toLocaleString()}</p></div>)}
          </div>
          <div className="mt-4 divide-y divide-cream/8 rounded-xl border border-cream/8 bg-mall-800/40">
            {emailQueue.messages.length === 0 ? <p className="px-4 py-5 text-center text-xs text-cream/35">No email records yet.</p> : emailQueue.messages.map((message) => <div key={message._id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-cream/80">{message.subject}</p>
                <p className="mt-1 truncate text-[11px] text-cream/40">{message.to} · {new Date(message.createdAt).toLocaleString("en-KE")}</p>
                <p className="mt-1 text-[10px] text-cream/35">{message.status} · {Number(message.attempts || 0)} attempt{Number(message.attempts || 0) === 1 ? "" : "s"}{message.sentAt ? ` · sent ${new Date(message.sentAt).toLocaleString("en-KE")}` : ""}</p>
                {message.lastError && <p className="mt-1 break-words text-[10px] text-red-200/70">{message.lastError}</p>}
              </div>
              {message.status === "failed" && <button type="button" onClick={() => retryEmail(message._id)} disabled={retryingEmail === message._id} className="shrink-0 rounded-lg border border-amber-200/20 px-3 py-2 text-[11px] text-amber-100 disabled:opacity-50">{retryingEmail === message._id ? "Requeuing…" : "Retry email"}</button>}
            </div>)}
          </div>
        </>}
      </section>
    </div>
  );
}
