import { AlertCircle, ChevronDown, RefreshCw } from "lucide-react";
import { paymentFailureGroups, paymentFailureMessage } from "../utils/paymentFailureMessage";

function formatAttemptTime(value) {
  return value ? new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "Time unavailable";
}

export default function PaymentFailurePanel({ order, onRetry, retrying = false }) {
  const groups = paymentFailureGroups(order);
  const attemptCount = groups.reduce((total, group) => total + group.count, 0);
  const providerLabel = order.paymentMethod === "mpesa" ? "M-Pesa" : "card";
  const deadline = order.stockReservedUntil ? formatAttemptTime(order.stockReservedUntil) : "the end of the 5-day payment window";

  return (
    <section className="rounded-2xl border border-red-300/20 bg-red-300/[0.045] p-4 sm:p-5" aria-labelledby={`payment-failed-${order._id}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-300/10 text-red-200">
          <AlertCircle size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`payment-failed-${order._id}`} className="text-sm font-semibold text-cream">Payment not completed</h3>
            <span className="rounded-full bg-red-300/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-red-200">{providerLabel}</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-cream/70">{paymentFailureMessage(order)}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-cream/45">Your order is still active and your stock is reserved until <span className="text-cream/65">{deadline}</span>. Retry before then.</p>
          {onRetry && (
            <button type="button" onClick={onRetry} disabled={retrying} className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-mall-accent px-3.5 py-2.5 text-xs font-semibold text-mall-900 transition hover:bg-mall-accentDark disabled:cursor-wait disabled:opacity-60">
              <RefreshCw size={13} className={retrying ? "animate-spin" : ""} />
              {retrying ? "Starting payment…" : `Retry ${providerLabel}`}
            </button>
          )}
        </div>
      </div>

      {attemptCount > 0 && (
        <details className="group mt-4 border-t border-cream/10 pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-cream/50 hover:text-cream/75 [&::-webkit-details-marker]:hidden">
            <span>{attemptCount} payment {attemptCount === 1 ? "attempt" : "attempts"}</span>
            <ChevronDown size={14} className="transition group-open:rotate-180" />
          </summary>
          <div className="mt-3 space-y-3">
            {groups.map((group) => (
              <div key={group.message} className="flex items-start justify-between gap-4 text-[11px]">
                <div>
                  <p className="text-cream/65">{group.message}</p>
                  {group.count > 1 && <p className="mt-0.5 text-cream/35">Repeated {group.count} times</p>}
                </div>
                <time className="shrink-0 text-right text-cream/35">{formatAttemptTime(group.timestamps[0])}</time>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
