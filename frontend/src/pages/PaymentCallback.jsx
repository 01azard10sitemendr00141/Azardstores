import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { XCircle } from "lucide-react";
import api from "../api/client";
import { useCart } from "../context/CartContext";

// Paystack redirects the browser back here after the customer finishes (or
// abandons) its hosted checkout page, with ?reference=... in the URL. This
// verifies the payment directly rather than waiting on the webhook, so the
// customer sees a result immediately instead of a blank wait.
export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [status, setStatus] = useState("checking"); // checking | success | failed
  const [order, setOrder] = useState(null);
  const trackingContact = searchParams.get("contact") || "";

  useEffect(() => {
    let active = true;
    const reference = searchParams.get("reference");
    if (!reference) { setStatus("failed"); return () => { active = false; }; }

    const contact = searchParams.get("contact") || "";
    const callbackToken = searchParams.get("access") || "";
    api.get(`/payments/paystack/verify/${encodeURIComponent(reference)}`, {
      params: { contact, callbackToken },
      timeout: 20_000,
    }).then((res) => {
      if (!active) return;
      setOrder(res.data.order);
      if (res.data.paymentStatus === "paid") {
        clearCart();
        navigate("/order-success", { state: { order: res.data.order }, replace: true });
      } else {
        setStatus("failed");
      }
    }).catch(() => { if (active) setStatus("failed"); });
    return () => { active = false; };
  }, [searchParams]);

  const reservationDeadline = order?.stockReservedUntil ? new Date(order.stockReservedUntil) : null;
  const reservationActive = order?.status === "confirmed"
    && (!reservationDeadline || reservationDeadline.getTime() > Date.now());
  const orderDestination = order?.user ? "My Orders" : "Track Order";
  const failureMessage = !order
    ? "We couldn't confirm this payment yet. Check Track Order with your order number and checkout contact for the latest status. If you have an account, you can also check My Orders. If your payment provider charged you, contact Azard Stores with your order number."
    : reservationActive && order.paymentStatus === "failed"
      ? `The payment provider confirmed that the payment did not complete. Your order remains active${reservationDeadline ? ` until ${reservationDeadline.toLocaleString("en-KE")}` : ""}; you can try again from ${orderDestination}.`
      : reservationActive
        ? `Payment has not been confirmed yet. Your order is reserved${reservationDeadline ? ` until ${reservationDeadline.toLocaleString("en-KE")}` : ""}. Check its status before starting another payment.`
        : "Payment has not been confirmed and this order is no longer active. Check the order updates for its current status. If your payment provider charged you, contact Azard Stores with your order number.";

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-mall-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-mall-accent/30 border-t-mall-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-cream/50 text-sm">Confirming your payment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mall-900 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <XCircle size={40} className="text-red-400 mx-auto mb-4" />
        <p className="font-display text-xl text-cream mb-2">Payment not confirmed</p>
        <p className="text-cream/50 text-sm mb-6 leading-relaxed">{failureMessage}</p>
        <Link
          to={order ? `/track-order/${order._id}` : "/track-order"}
          state={trackingContact ? { contact: trackingContact } : undefined}
          className="inline-block bg-mall-accent text-mall-900 font-semibold px-6 py-3 rounded-xl text-sm hover:bg-mall-accentDark transition"
        >
          {order ? "Check order status" : "Track an order"}
        </Link>
      </div>
    </div>
  );
}
