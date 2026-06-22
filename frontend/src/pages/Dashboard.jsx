import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";

const STATUS_COLORS = {
  pending: "text-mall-accentDark",
  confirmed: "text-blue-600",
  shipped: "text-purple-600",
  delivered: "text-green-600",
  cancelled: "text-red-600",
};

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.get("/orders/my").then((res) => {
      setOrders(res.data);
      setLoading(false);
    });
  }, [user]);

  if (authLoading) return <p className="text-center py-16 text-mall-900/40">Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl text-mall-900 mb-2">Hi, {user.name}</h1>
      <p className="text-mall-900/60 mb-8">Here's your order history at ShopRight Mall.</p>

      {loading ? (
        <p className="text-mall-900/40">Loading orders...</p>
      ) : orders.length === 0 ? (
        <p className="text-mall-900/50">No orders yet.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order._id} className="bg-white border border-mall-900/10 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-mono-tag text-xs text-mall-900/40">
                    Order #{order._id.slice(-6).toUpperCase()}
                  </p>
                  <p className="text-sm text-mall-900/60">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`text-sm font-medium uppercase ${STATUS_COLORS[order.status]}`}>
                  {order.status}
                </span>
              </div>
              <ul className="text-sm text-mall-900/80 mb-2">
                {order.items.map((item, i) => (
                  <li key={i}>
                    {item.quantity}× {item.name}
                  </li>
                ))}
              </ul>
              <p className="font-display text-lg text-mall-900">KSh {order.totalAmount.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
