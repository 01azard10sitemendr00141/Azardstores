import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";

export default function Cart() {
  const { items, updateQuantity, removeItem, totalAmount, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  async function handleCheckout() {
    setError("");
    if (!address.trim()) {
      setError("Please enter a delivery address");
      return;
    }
    if (!user && (!guestName.trim() || !guestPhone.trim())) {
      setError("Please enter your name and phone number");
      return;
    }

    setPlacing(true);
    try {
      await api.post("/orders", {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        channel: "cart",
        deliveryAddress: address,
        guestInfo: user ? undefined : { name: guestName, phone: guestPhone },
      });
      clearCart();
      navigate("/order-success");
    } catch (err) {
      setError(err.response?.data?.message || "Could not place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-mall-900/60 mb-4">Your cart is empty.</p>
        <Link to="/directory" className="text-mall-accentDark hover:underline">
          Browse the mall directory
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl text-mall-900 mb-6">Your Cart</h1>

      <div className="space-y-3 mb-6">
        {items.map((item) => (
          <div key={item.productId} className="bg-white rounded-lg border border-mall-900/10 p-3 flex items-center gap-3">
            {item.image ? (
              <img src={item.image} alt={item.name} className="w-16 h-16 object-cover rounded-md" />
            ) : (
              <div className="w-16 h-16 bg-cream rounded-md" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-mall-900">{item.name}</p>
              <p className="text-sm text-mall-900/60">KSh {item.price.toLocaleString()}</p>
            </div>
            <input
              type="number"
              min="1"
              value={item.quantity}
              onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
              className="w-16 border border-mall-900/20 rounded-md px-2 py-1 text-center"
            />
            <button onClick={() => removeItem(item.productId)} className="text-mall-900/40 hover:text-red-500 text-sm">
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-mall-900/10 p-5 space-y-4">
        <div className="flex justify-between font-display text-xl text-mall-900">
          <span>Total</span>
          <span>KSh {totalAmount.toLocaleString()}</span>
        </div>

        {!user && (
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Your name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="border border-mall-900/20 rounded-md px-3 py-2 text-sm"
            />
            <input
              type="tel"
              placeholder="Phone number"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              className="border border-mall-900/20 rounded-md px-3 py-2 text-sm"
            />
          </div>
        )}

        <textarea
          placeholder="Delivery address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full border border-mall-900/20 rounded-md px-3 py-2 text-sm"
          rows={2}
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          onClick={handleCheckout}
          disabled={placing}
          className="w-full bg-mall-900 text-cream font-medium py-3 rounded-md hover:bg-mall-700 transition disabled:opacity-50"
        >
          {placing ? "Placing order..." : "Place Order"}
        </button>
      </div>
    </div>
  );
}
