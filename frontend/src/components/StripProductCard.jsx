import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, ShoppingBasket, Heart } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useSettings } from "../context/SettingsContext";
import { useState, useEffect } from "react";
import { getStartingPrice } from "../utils/productPricing";
import { getWishlist, subscribeToWishlist, toggleWishlist } from "../utils/wishlist";
import { useAuth } from "../context/AuthContext";
import { productImageUrl } from "../utils/productImageUrl";

function WhatsAppIcon({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: size, height: size, flexShrink: 0 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.127 1.532 5.86L.057 23.857l6.174-1.448A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.001-1.366l-.36-.214-3.664.86.876-3.565-.233-.375A9.818 9.818 0 1112 21.818z"/>
    </svg>
  );
}

// ─── Wishlist helpers ─────────────────────────────────────────────────────────
export default function StripProductCard({ product, size = "default", priority = false }) {
  const isLarge = size === "large";
  const navigate = useNavigate();
  const { addItem, items } = useCart();
  const { settings } = useSettings();
  const { user, loading: authLoading, wishlistError, wishlistLoading } = useAuth();
  const WHATSAPP_NUMBER = settings.whatsappNumber;
  const hasVariants = product.variants?.length > 0;
  const displayPrice = getStartingPrice(product);
  const stockValues = hasVariants ? product.variants.map((variant) => variant.stock) : [product.stock];
  const confirmedStocks = stockValues.filter((stock) => stock !== undefined && stock !== null && Number.isInteger(Number(stock))).map(Number);
  const stockIsConfirmed = confirmedStocks.length > 0 && (!hasVariants || confirmedStocks.length === stockValues.length);
  const hasAvailableStock = hasVariants ? confirmedStocks.some((stock) => stock > 0) : confirmedStocks[0] > 0;
  const cartQuantity = !hasVariants
    ? items.find((item) => item.productId === product._id && !item.variantId)?.quantity || 0
    : 0;
  const cartLimitReached = !hasVariants && hasAvailableStock && cartQuantity >= confirmedStocks[0];
  const orderUnavailable = !hasVariants && stockIsConfirmed && !hasAvailableStock;
  const hasDiscount = product.compareAtPrice && product.compareAtPrice > displayPrice;
  const [wishlisted, setWishlisted] = useState(false);
  const [wishlistNotice, setWishlistNotice] = useState("");
  const [imageFailed, setImageFailed] = useState(false);

  // Check wishlist state on mount
  useEffect(() => {
    setWishlisted(getWishlist().includes(product.slug));
    return subscribeToWishlist((slugs) => setWishlisted(slugs.includes(product.slug)));
  }, [product.slug]);
  useEffect(() => {
    if (user && wishlistError) setWishlistNotice(wishlistError);
  }, [user, wishlistError]);
  useEffect(() => setImageFailed(false), [product.images?.[0]]);

  const whatsappMsg = encodeURIComponent(
    `Hello Azard Stores, is this product available?\n\nProduct: ${product.name}\nPrice shown: ${displayPrice ? `${hasVariants ? "from " : ""}KSh ${displayPrice.toLocaleString()}` : "Please confirm the current price"}\nShop: ${product.shop?.shopNumber ?? "-"}\n\nPlease confirm current availability before I place an order.`
  );

  function handleAddToCart(e) {
    e.preventDefault();
    e.stopPropagation();
    if (hasVariants) {
      navigate(`/product/${product.slug}`);
      return;
    }
    if (!stockIsConfirmed) {
      navigate(`/product/${product.slug}`);
      return;
    }
    if (!hasAvailableStock || cartLimitReached) return;
    addItem(product);
  }

  function handleWishlist(e) {
    e.preventDefault();
    e.stopPropagation();
    const result = toggleWishlist(product.slug);
    setWishlisted(result.added);
    setWishlistNotice(result.limitReached ? "Wishlist is full. Remove an item before saving another." : !result.persisted && !user ? "Wishlist updated for this visit, but this browser could not save it." : user && wishlistError ? wishlistError : "");
  }

  return (
    <article className={`group relative shrink-0 ${isLarge ? "w-[76vw] max-w-[19rem] sm:w-64 md:w-72 border border-cream/10" : "w-36 sm:w-40 md:w-44"} overflow-hidden rounded-xl bg-mall-800 transition flex flex-col hover:ring-2 hover:ring-mall-accent`}>
      {/* ── Image ─────────────────────────────────────────────────── */}
      <div className="aspect-square overflow-hidden bg-mall-700 relative">
        <Link to={`/product/${product.slug}`} aria-label={`View ${product.name}`} className="absolute inset-0 z-0">
          {product.images?.[0] && !imageFailed ? (
          <img
            src={productImageUrl(product.images[0], { width: isLarge ? 480 : 320, quality: 72 })}
            alt=""
            width={isLarge ? 480 : 320}
            height={isLarge ? 480 : 320}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            onError={() => setImageFailed(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
          />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ShoppingBasket size={28} className="text-cream/20" />
            </div>
          )}
        </Link>

        {/* Badge — top left */}
        {product.badge && (
          <span className="absolute top-2 left-2 font-mono-tag text-[9px] uppercase bg-mall-accent text-mall-900 px-1.5 py-0.5 rounded-full font-semibold z-10">
            {product.badge.replace(/-/g, " ")}
          </span>
        )}

        {/* Wishlist heart — top right */}
        <button
          onClick={handleWishlist}
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wishlisted}
          disabled={authLoading || Boolean(user && wishlistLoading)}
          title={wishlistNotice || undefined}
          className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition disabled:cursor-wait disabled:opacity-60 ${
            wishlisted
              ? "bg-red-500 text-white"
              : "bg-mall-900/60 backdrop-blur-sm text-cream/60 hover:text-red-400"
          }`}
        >
          <Heart size={12} fill={wishlisted ? "currentColor" : "none"} />
        </button>
        {wishlistNotice && <span role="status" className="absolute top-10 right-2 z-20 max-w-40 rounded-lg bg-mall-900/95 px-2 py-1 text-[9px] text-cream shadow-lg">{wishlistNotice}</span>}

        {/* Cart icon — bottom right of image */}
        <button
          onClick={handleAddToCart}
          aria-label={hasVariants ? "Choose an option" : orderUnavailable ? "Out of stock" : cartLimitReached ? "Available quantity already in cart" : stockIsConfirmed ? "Add to cart" : "Check availability"}
          disabled={orderUnavailable || cartLimitReached}
          className="absolute bottom-2 right-2 z-10 w-8 h-8 rounded-full bg-mall-900/80 backdrop-blur-sm text-cream hover:bg-mall-accent hover:text-mall-900 flex items-center justify-center transition shadow-lg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-mall-900/80 disabled:hover:text-cream"
        >
          <ShoppingBag size={14} />
        </button>
      </div>

      {/* ── Info ──────────────────────────────────────────────────── */}
      <Link to={`/product/${product.slug}`} className={`${isLarge ? "p-3.5 sm:p-4" : "p-2.5 sm:p-3"} flex flex-col gap-1 flex-1`}>
        {/* Brand */}
        {product.brand && (
          <p className={`font-mono-tag ${isLarge ? "text-[10px]" : "text-[9px]"} uppercase text-mall-accent/70 tracking-wide leading-none`}>
            {product.brand}
          </p>
        )}

        {/* Name */}
        <p className={`text-cream ${isLarge ? "text-sm sm:text-base" : "text-[11px] sm:text-xs"} font-medium line-clamp-2 leading-tight`}>
          {product.name}
        </p>

        {/* Shop tag */}
        {product.shop && (
          <p className={`${isLarge ? "text-cream/50 text-[10px]" : "text-cream/30 text-[9px]"} font-mono-tag leading-none`}>
            Shop #{product.shop.shopNumber} · Floor {product.shop.floor?.floorNumber}
          </p>
        )}

        {/* Price */}
        <div className="mt-0.5">
          <span className={`font-display ${isLarge ? "text-base sm:text-lg" : "text-sm"} text-cream`}>
            {displayPrice ? `${hasVariants ? "From " : ""}KSh ${displayPrice.toLocaleString()}` : "Price unavailable"}
          </span>
          {hasDiscount && (
            <span className={`ml-1.5 text-cream/50 ${isLarge ? "text-[10px]" : "text-[9px]"} line-through`}>
              {product.compareAtPrice?.toLocaleString()}
            </span>
          )}
        </div>

      </Link>

      {/* Actions stay outside the product link so they remain independent controls. */}
      <div className={`grid grid-cols-2 ${isLarge ? "gap-2 p-3 pt-0 sm:p-4 sm:pt-0" : "gap-1.5 p-2.5 pt-0 sm:p-3 sm:pt-0"} mt-auto`}>
          <button
            onClick={handleAddToCart}
            disabled={orderUnavailable || cartLimitReached}
            className={`flex items-center justify-center gap-1 bg-mall-accent text-mall-900 ${isLarge ? "text-[11px] sm:text-xs py-2" : "text-[10px] py-1.5"} font-semibold rounded-lg hover:bg-mall-accentDark transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-mall-accent`}
          >
            <ShoppingBag size={isLarge ? 12 : 10} /> {hasVariants ? "Choose option" : orderUnavailable ? "Out of stock" : cartLimitReached ? "In cart" : stockIsConfirmed ? "Order" : "Check availability"}
          </button>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMsg}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`flex items-center justify-center gap-1 bg-[#25D366]/15 text-[#25D366] ${isLarge ? "text-[11px] sm:text-xs py-2" : "text-[10px] py-1.5"} font-semibold rounded-lg hover:bg-[#25D366] hover:text-white transition`}
          >
            <WhatsAppIcon size={isLarge ? 12 : 10} /> WhatsApp
          </a>
      </div>
    </article>
  );
}
