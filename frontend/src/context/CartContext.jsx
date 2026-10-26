import { createContext, useContext, useState, useEffect } from "react";

const CartContext = createContext(null);
const CART_STORAGE_KEY = "azardstores_cart";

function readStoredCart() {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object" || typeof item.productId !== "string" || !item.productId) return [];
      const price = Number(item.price);
      const quantity = Number(item.quantity);
      if (!Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return [];
      return [{
        ...item,
        variantId: typeof item.variantId === "string" && item.variantId ? item.variantId : null,
        variantName: typeof item.variantName === "string" ? item.variantName : "",
        name: typeof item.name === "string" && item.name ? item.name : "Product",
        price,
        image: typeof item.image === "string" ? item.image : "",
        quantity,
      }];
    });
  } catch {
    return [];
  }
}

// A cart line is uniquely identified by product + variant (not just product),
// so two variants of the same product sit as separate lines. Products with
// no variant selected use variantId: null, same as before this existed.
function sameLine(item, productId, variantId) {
  return item.productId === productId && (item.variantId || null) === (variantId || null);
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readStoredCart);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // The in-memory cart remains usable if browser storage is unavailable.
    }
  }, [items]);

  // `variant`, when provided, is the selected variant subdocument
  // ({ _id, name, price, stock, image, ... }) — its own price/image
  // override the product's if set, matching how the backend prices it.
  function addItem(product, quantity = 1, variant = null) {
    const variantId = variant?._id || null;
    const stockValue = Number(variant?.stock ?? product.stock);
    const availableStock = Number.isInteger(stockValue) ? Math.max(0, stockValue) : 0;
    const requestedQuantity = Math.min(99, Math.max(1, Math.floor(Number(quantity) || 1)));
    setItems((prev) => {
      const existing = prev.find((i) => sameLine(i, product._id, variantId));
      const previousQuantity = existing?.quantity || 0;
      const nextQuantity = Math.min(availableStock, previousQuantity + requestedQuantity);
      if (nextQuantity <= previousQuantity) return prev;
      if (existing) {
        return prev.map((i) =>
          sameLine(i, product._id, variantId) ? { ...i, quantity: nextQuantity, availableStock } : i
        );
      }
      return [
        ...prev,
        {
          productId: product._id,
          variantId,
          variantName: variant?.name || "",
          name: product.name,
          price: variant?.price ?? product.price,
          image: variant?.image || product.images?.[0] || "",
          quantity: nextQuantity,
          availableStock,
        },
      ];
    });
  }

  function removeItem(productId, variantId = null) {
    setItems((prev) => prev.filter((i) => !sameLine(i, productId, variantId)));
  }

  function updateQuantity(productId, quantity, variantId = null) {
    if (quantity < 1) return removeItem(productId, variantId);
    setItems((prev) => prev.flatMap((item) => {
      if (!sameLine(item, productId, variantId)) return [item];
      const requested = Math.min(99, Math.floor(quantity));
      const stockKnown = item.availableStock != null && Number.isFinite(Number(item.availableStock));
      const maxAllowed = stockKnown ? Number(item.availableStock) : item.stockUnconfirmed ? item.quantity : 99;
      const nextQuantity = Math.min(requested, maxAllowed);
      return nextQuantity > 0 ? [{ ...item, quantity: nextQuantity }] : [];
    }));
  }

  function updateItemSnapshot(productId, variantId, snapshot) {
    setItems((prev) => prev.map((item) => (
      sameLine(item, productId, variantId)
        ? { ...item, ...snapshot }
        : item
    )));
  }

  function clearCart() {
    setItems([]);
  }

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, updateItemSnapshot, clearCart, totalItems, totalAmount }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
