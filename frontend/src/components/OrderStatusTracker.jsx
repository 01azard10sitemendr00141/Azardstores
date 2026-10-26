import { Clock, CheckCircle, Truck, Package, XCircle } from "lucide-react";

const STEPS = ["pending", "confirmed", "shipped", "ready_for_collection", "collected"];

const STEP_CONFIG = {
  pending:   { label: "Availability Check", icon: Clock },
  confirmed: { label: "Stock Confirmed",    icon: CheckCircle },
  shipped:   { label: "Sent to parcel service",      icon: Truck },
  ready_for_collection: { label: "Ready to collect", icon: Package },
  collected: { label: "Collected", icon: CheckCircle },
  delivered: { label: "Delivered", icon: Package },
};

// Shows a product/order's journey through pending -> confirmed -> shipped ->
// delivered. Cancelled is a separate terminal state, shown on its own.
export default function OrderStatusTracker({ status, deliveryArea, paymentMethod, paymentStatus, storeBalanceApplied = 0, totalAmount = 0 }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2.5 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
        <XCircle size={16} className="text-red-400 shrink-0" />
        <span className="text-red-400 text-sm font-medium">This order was cancelled</span>
      </div>
    );
  }
  if (status === "expired") {
    return <div className="flex items-center gap-2.5 bg-amber-300/10 border border-amber-300/20 rounded-xl px-4 py-3"><Clock size={16} className="text-amber-200 shrink-0" /><span className="text-amber-100 text-sm font-medium">This order expired after the payment window ended</span></div>;
  }
  if (status === "unavailable") {
    return <div className="flex items-center gap-2.5 bg-amber-300/10 border border-amber-300/20 rounded-xl px-4 py-3"><XCircle size={16} className="text-amber-200 shrink-0" /><span className="text-amber-100 text-sm font-medium">We could not supply one or more items. Choose how you would like us to follow up below.</span></div>;
  }

  const directDelivery = deliveryArea === "nairobi-cbd" || deliveryArea === "nairobi-direct";
  const paymentRequired = ["mpesa", "paystack"].includes(paymentMethod);
  const fullyCoveredByBalance = Number(totalAmount) > 0 && Number(storeBalanceApplied) >= Number(totalAmount);
  const paymentDue = status !== "pending" && paymentRequired && paymentStatus !== "paid";
  const paymentStepLabel = paymentStatus === "paid"
    ? "Paid"
    : fullyCoveredByBalance
      ? status === "pending" ? "Balance reserved" : "Store Balance"
    : status === "pending"
      ? "Pay after confirmation"
      : "Payment due";
  const directPaymentFlow = directDelivery && paymentRequired;
  const paymentConfirmedPreparation = status === "confirmed" && paymentRequired && paymentStatus === "paid";
  const visibleSteps = directDelivery
    ? directPaymentFlow ? ["pending", "confirmed", "payment", "preparing", "delivered"] : ["pending", "confirmed", "delivered"]
    : ["pending", "confirmed", "payment", "preparing", "shipped", "ready_for_collection", "collected"];
  const stepConfig = directDelivery
    ? {
        ...STEP_CONFIG,
        confirmed: { ...STEP_CONFIG.confirmed, label: status === "pending" || directPaymentFlow ? "Availability confirmed" : "Preparing" },
        payment: { label: paymentStepLabel, icon: paymentStatus === "paid" ? CheckCircle : Clock },
        preparing: { label: "Preparing", icon: Package },
        delivered: { ...STEP_CONFIG.delivered, label: "Delivered" },
      }
    : {
        ...STEP_CONFIG,
        confirmed: { ...STEP_CONFIG.confirmed, label: status === "pending" || paymentDue ? "Availability confirmed" : "Stock confirmed" },
        payment: { label: paymentStepLabel, icon: paymentStatus === "paid" ? CheckCircle : Clock },
        preparing: { label: "Preparing", icon: Package },
      };
  const statusIndex = visibleSteps.indexOf(status);
  const currentIndex = status === "confirmed" && paymentRequired
    ? visibleSteps.indexOf(paymentConfirmedPreparation ? "preparing" : "payment")
    : statusIndex;

  return (
    <ol aria-label="Order status progress" className="flex flex-col md:flex-row md:items-start">
      {visibleSteps.map((step, i) => {
        const { label, icon: Icon } = stepConfig[step];
        const active = i === currentIndex;
        const done = (step === "payment" && paymentStatus === "paid") || i < currentIndex || (active && step !== "payment");
        return (
          <li key={step} className="relative flex min-h-10 items-center gap-3 md:flex-1 md:min-h-0 md:flex-col md:items-center md:gap-0">
            {i > 0 && (
              <div
                aria-hidden="true"
                className={`absolute -top-5 left-4 h-10 w-0.5 md:left-auto md:right-1/2 md:top-4 md:h-0.5 md:w-full ${done ? "bg-mall-accent" : "bg-cream/10"}`}
              />
            )}
            <div
              className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition ${
                done ? "bg-mall-accent border-mall-accent text-mall-900" : active ? "bg-mall-900 border-mall-accent text-mall-accent" : "bg-mall-900 border-cream/15 text-cream/30"
              }`}
            >
              <Icon size={14} />
            </div>
            <p className={`text-xs font-mono-tag uppercase tracking-wide text-left leading-tight md:mt-2 md:text-[9px] md:text-center ${done || active ? "text-cream" : "text-cream/50"}`}>
              {label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
