import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import Breadcrumbs from "../components/Breadcrumbs";
import { useCart } from "../context/CartContext";

const WHATSAPP_NUMBER = "254742606408";

export default function Product() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const { addItem } = useCart();

  useEffect(() => {
    api.get(`/products/${slug}`).then((res) => setProduct(res.data));
  }, [slug]);

  if (!product) return <p className="text-center py-16 text-mall-900/40">Loading product...</p>;

  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;

  function whatsappLink() {
    const msg = `Hi! I'm interested in "${product.name}" (KSh ${product.price.toLocaleString()}) from Shop ${
      product.shop?.shopNumber ?? ""
    }. Is it available?`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  }

  function handleAdd() {
    addItem(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Breadcrumbs
        crumbs={[
          { label: "Mall Directory", to: "/directory" },
          ...(product.shop?.floor ? [{ label: `Floor ${product.shop.floor.floorNumber}`, to: `/floor/${product.shop.floor.slug}` }] : []),
          ...(product.shop ? [{ label: `Shop #${product.shop.shopNumber}`, to: `/shop/${product.shop.slug}` }] : []),
          { label: product.name },
        ]}
      />

      <div className="grid md:grid-cols-2 gap-8">
        <div className="aspect-square bg-white rounded-xl border border-mall-900/10 overflow-hidden flex items-center justify-center">
          {product.images?.[0] ? (
            <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-mall-900/30 text-sm">No image yet</span>
          )}
        </div>

        <div>
          {product.shop && (
            <p className="font-mono-tag text-xs uppercase text-mall-700/60 mb-2">
              Shop #{product.shop.shopNumber} · {product.shop.name}
            </p>
          )}
          <h1 className="font-display text-3xl text-mall-900 mb-2">{product.name}</h1>

          <div className="flex items-baseline gap-3 mb-4">
            <span className="font-display text-2xl text-mall-900">KSh {product.price.toLocaleString()}</span>
            {hasDiscount && (
              <span className="text-mall-900/40 line-through">KSh {product.compareAtPrice.toLocaleString()}</span>
            )}
          </div>

          <p className="text-mall-900/70 mb-6">{product.description}</p>

          <p className="text-sm text-mall-900/60 mb-4">
            {product.stock > 0 ? `${product.stock} in stock` : "Currently out of stock"}
          </p>

          <div className="flex items-center gap-3 mb-4">
            <label htmlFor="qty" className="text-sm text-mall-900/70">Quantity</label>
            <input
              id="qty"
              type="number"
              min="1"
              max={product.stock || 99}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              className="w-20 border border-mall-900/20 rounded-md px-2 py-1"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={product.stock === 0}
              className="flex-1 bg-mall-900 text-cream font-medium py-3 rounded-md hover:bg-mall-700 transition disabled:opacity-40"
            >
              {added ? "Added ✓" : "Add to Cart"}
            </button>
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-[#25D366] text-white font-medium py-3 rounded-md text-center hover:opacity-90 transition"
            >
              Order via WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
