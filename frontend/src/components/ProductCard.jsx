import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import Badge from "./Badge";

const WHATSAPP_NUMBER = "254742606408";

export default function ProductCard({ product }) {
  const { addItem } = useCart();
  const image = product.images?.[0];
  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;

  function whatsappLink() {
    const msg = `Hi! I'm interested in "${product.name}" (KSh ${product.price.toLocaleString()}) from Shop ${
      product.shop?.shopNumber ?? ""
    }. Is it available?`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  }

  return (
    <div className="bg-white rounded-xl border border-mall-900/10 overflow-hidden flex flex-col group">
      <Link to={`/product/${product.slug}`} className="relative block aspect-square bg-cream overflow-hidden">
        <Badge badge={product.badge} />
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-mall-900/30 text-sm">
            No image yet
          </div>
        )}
      </Link>

      <div className="p-3 flex flex-col gap-1 flex-1">
        {product.shop && (
          <span className="font-mono-tag text-[10px] uppercase text-mall-700/60">
            Shop {product.shop.shopNumber} · {product.shop.name}
          </span>
        )}
        <Link to={`/product/${product.slug}`} className="font-medium text-sm text-mall-900 line-clamp-2 hover:text-mall-accentDark transition">
          {product.name}
        </Link>

        <div className="flex items-baseline gap-2 mt-1">
          <span className="font-display text-lg text-mall-900">KSh {product.price.toLocaleString()}</span>
          {hasDiscount && (
            <span className="text-xs text-mall-900/40 line-through">
              KSh {product.compareAtPrice.toLocaleString()}
            </span>
          )}
        </div>

        <div className="mt-auto pt-3 flex gap-2">
          <button
            onClick={() => addItem(product)}
            className="flex-1 bg-mall-900 text-cream text-xs font-medium py-2 rounded-md hover:bg-mall-700 transition"
          >
            Add to Cart
          </button>
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-[#25D366] text-white text-xs font-medium py-2 rounded-md text-center hover:opacity-90 transition"
          >
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
