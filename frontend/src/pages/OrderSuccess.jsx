import { Link } from "react-router-dom";

export default function OrderSuccess() {
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4">✅</div>
      <h1 className="font-display text-2xl text-mall-900 mb-2">Order placed!</h1>
      <p className="text-mall-900/60 mb-6">
        Thank you for shopping at ShopRight Mall. We'll be in touch about delivery shortly.
      </p>
      <Link to="/directory" className="text-mall-accentDark hover:underline">
        Continue browsing the mall
      </Link>
    </div>
  );
}
