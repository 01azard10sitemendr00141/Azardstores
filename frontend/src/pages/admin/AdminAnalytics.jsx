import { useEffect, useState } from "react";
import { TrendingUp, Package, Store } from "lucide-react";
import api from "../../api/client";
import AdminLoadError from "../../components/AdminLoadError";

// ─── Simple day-by-day revenue bars ──────────────────────────────────────────
// No charting library dependency — just proportionally-sized divs. Good
// enough for a trend at a glance; a real charting library is worth adding
// later if this needs to get more sophisticated (tooltips, zoom, etc.).
function RevenueTrend({ data }) {
  if (data.length === 0) {
    return <p className="text-cream/30 text-sm py-8 text-center">No orders in the last 30 days yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <>
      <div role="img" aria-label="Bar chart showing paid order revenue by date. Exact daily amounts are listed in the table below." className="flex h-40 items-end gap-1 overflow-x-auto pb-1">
        {data.map((d) => (
          <span
            key={d._id}
            className="w-6 shrink-0 rounded-t bg-mall-accent"
            style={{ height: `${Math.max(4, (d.revenue / max) * 140)}px` }}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-cream/45">Exact daily amounts:</p>
      <div role="region" aria-label="Daily paid order revenue details" tabIndex={0} className="mt-2 max-h-64 overflow-auto rounded-lg border border-cream/8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mall-accent focus-visible:outline-offset-2">
        <table className="w-full min-w-64 text-left text-xs">
          <caption className="bg-mall-900/60 px-3 py-2 text-left font-medium text-cream/70">Paid order revenue by date · last 30 days</caption>
          <thead className="sticky top-0 bg-mall-900 text-cream/55">
            <tr><th scope="col" className="px-3 py-2 font-medium">Date</th><th scope="col" className="px-3 py-2 text-right font-medium">Paid order revenue</th></tr>
          </thead>
          <tbody className="divide-y divide-cream/8">
            {data.map((day) => (
              <tr key={day._id} className="text-cream/75">
                <th scope="row" className="px-3 py-2 font-normal">{day._id}</th>
                <td className="px-3 py-2 text-right tabular-nums">KSh {day.revenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Horizontal ranked bar list (top products / top shops) ─────────────────
function RankedBars({ items, labelKey, valueKey, valueFormat }) {
  if (items.length === 0) {
    return <p className="text-cream/30 text-sm py-6 text-center">No data yet.</p>;
  }
  const max = Math.max(...items.map((i) => i[valueKey]), 1);

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-cream/70 truncate pr-2">{item[labelKey]}</span>
            <span className="text-cream/40 shrink-0">{valueFormat ? valueFormat(item[valueKey]) : item[valueKey]}</span>
          </div>
          <div className="h-1.5 bg-mall-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-mall-accent rounded-full"
              style={{ width: `${(item[valueKey] / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    api.get("/analytics/overview").then((res) => setData(res.data))
      .catch(() => setError("Analytics data could not be loaded."))
      .finally(() => setLoading(false));
  }, [attempt]);

  if (loading) {
    return (
      <div role="status" aria-label="Loading analytics" className="flex items-center justify-center gap-3 py-16 text-sm text-cream/45">
        <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-mall-accent/30 border-t-mall-accent" />
        Loading analytics…
      </div>
    );
  }

  if (error || !data) return <AdminLoadError message={error || "Analytics data is unavailable."} onRetry={() => setAttempt((n) => n + 1)} />;

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-cream/10">
        <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-0.5">Admin</p>
        <h1 className="font-display text-2xl text-cream">Analytics</h1>
        <p className="text-cream/40 text-sm mt-1">Last 30 days</p>
      </div>

      {/* Top-line stats */}
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
        <div className="min-w-0 bg-mall-800 border border-cream/8 rounded-xl p-3 sm:p-4">
          <p className="font-display text-xl sm:text-2xl text-cream mb-1 break-words">KSh {data.totalRevenue30d.toLocaleString()}</p>
          <p className="font-mono-tag text-[10px] leading-snug uppercase text-cream/40 tracking-widest">Paid Order Value</p>
        </div>
        <div className="min-w-0 bg-mall-800 border border-cream/8 rounded-xl p-3 sm:p-4">
          <p className="font-display text-xl sm:text-2xl text-cream mb-1 break-words">{data.totalOrders30d}</p>
          <p className="font-mono-tag text-[10px] leading-snug uppercase text-cream/40 tracking-widest">Paid Orders</p>
        </div>
        <div className="min-w-0 bg-mall-800 border border-cream/8 rounded-xl p-3 sm:p-4">
          <p className="font-display text-xl sm:text-2xl text-cream mb-1 break-words">KSh {data.avgOrderValue30d.toLocaleString()}</p>
          <p className="font-mono-tag text-[10px] leading-snug uppercase text-cream/40 tracking-widest">Avg Paid Order</p>
        </div>
      </div>

      {/* Revenue trend */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-mall-accent" />
          <h2 className="font-display text-lg text-cream">Paid Order Value Trend</h2>
        </div>
        <div className="bg-mall-800/50 border border-cream/8 rounded-2xl p-5">
          <RevenueTrend data={data.revenueByDay} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Top products */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Package size={15} className="text-mall-accent" />
            <h2 className="font-display text-lg text-cream">Products in Paid Orders</h2>
          </div>
          <div className="bg-mall-800/50 border border-cream/8 rounded-2xl p-5">
            <RankedBars items={data.topProducts} labelKey="name" valueKey="unitsSold" valueFormat={(v) => `${v} sold`} />
          </div>
        </div>

        {/* Top shops */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Store size={15} className="text-mall-accent" />
            <h2 className="font-display text-lg text-cream">Top Shops</h2>
          </div>
          <div className="bg-mall-800/50 border border-cream/8 rounded-2xl p-5">
            <RankedBars
              items={data.topShops}
              labelKey="name"
              valueKey="revenue"
              valueFormat={(v) => `KSh ${v.toLocaleString()}`}
            />
            <p className="mt-4 border-t border-cream/8 pt-3 text-xs leading-relaxed text-cream/45">
              Top Shops uses the shop saved with each order item. Legacy paid orders without that snapshot are excluded; KSh {(data.unattributedShopRevenue30d || 0).toLocaleString()} across {data.unattributedShopOrders30d || 0} order{data.unattributedShopOrders30d === 1 ? "" : "s"} in this period cannot be attributed to a shop.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
