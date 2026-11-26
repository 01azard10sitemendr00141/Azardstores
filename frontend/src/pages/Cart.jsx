import { Link } from "react-router-dom";
import { ArrowRight, Minus, Package, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "../context/CartContext";

export default function Cart() {
  const { items, updateQuantity, removeItem, totalAmount } = useCart();
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);

  if (!items.length) {
    return (
      <main className="flex min-h-[65vh] flex-col items-center justify-center gap-4 bg-mall-900 px-4 text-center">
        <ShoppingBag size={44} className="text-cream/30" aria-hidden="true" />
        <p className="font-display text-3xl text-cream">Your cart is empty</p>
        <p className="max-w-sm text-sm leading-relaxed text-cream/80">Find something you love across the Azard Stores digital mall, then come back here to review your order.</p>
        <Link to="/directory" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg bg-mall-orange px-5 text-sm font-semibold text-mall-900 transition hover:bg-mall-orangeDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-orange">
          Browse the mall <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-mall-900">
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-cream/15 pb-5 sm:mb-9 sm:pb-6">
          <div>
            <p className="mb-1 font-mono-tag text-[10px] uppercase tracking-[0.18em] text-mall-orange">Azard Stores · Step 1 of 2</p>
            <h1 className="font-display text-3xl text-cream sm:text-4xl">Your Cart</h1>
          </div>
          <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-end">
            <p className="text-sm text-cream/65">{itemCount} {itemCount === 1 ? "item" : "items"}</p>
            <Link to="/directory" className="inline-flex min-h-11 items-center gap-1.5 rounded text-sm text-mall-accent transition hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent">
              Continue shopping <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:gap-10">
          <section aria-label="Cart items" className="divide-y divide-cream/10 border-y border-cream/10">
            {items.map((item) => {
              const maxQuantity = Math.min(99, Number.isFinite(Number(item.availableStock)) ? Number(item.availableStock) : 99);
              return (
                <article key={`${item.productId}::${item.variantId || ""}`} className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 py-5 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-5 sm:py-6">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-mall-800 ring-1 ring-cream/10 sm:h-[88px] sm:w-[88px]">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"><Package size={22} className="text-cream/30" aria-hidden="true" /></div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="break-words text-sm font-medium leading-snug text-cream sm:text-base">{item.name}</h2>
                    {item.variantName && <p className="mt-1 break-words text-sm text-cream/65">{item.variantName}</p>}
                    <p className="mt-2 font-display text-lg text-mall-accent">KSh {item.price.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-cream/65">Line subtotal · KSh {(item.price * item.quantity).toLocaleString()}</p>
                    {item.stockUnconfirmed && <p role="alert" className="mt-2 text-xs leading-relaxed text-amber-200">Availability has not been confirmed. Contact Azard Stores before ordering.</p>}
                    {!item.stockUnconfirmed && item.availableStock != null && Number.isFinite(Number(item.availableStock)) && item.quantity > Number(item.availableStock) && <p role="alert" className="mt-2 text-xs leading-relaxed text-amber-200">Your quantity exceeds the last shown stock. Reduce it before checkout.</p>}
                  </div>

                  <div className="col-span-2 flex w-full items-center justify-between sm:col-span-1 sm:w-auto sm:flex-col sm:items-end sm:gap-2">
                    <div className="flex items-center gap-1.5" aria-label={`Quantity controls for ${item.name}`}>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, Math.max(1, item.quantity - 1), item.variantId)}
                        aria-label={`Decrease quantity of ${item.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-cream/20 bg-mall-800 text-cream transition hover:border-mall-orange hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-orange"
                      >
                        <Minus size={13} aria-hidden="true" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium text-cream" aria-label={`Quantity ${item.quantity}`}>{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.quantity + 1, item.variantId)}
                        disabled={item.stockUnconfirmed || item.quantity >= maxQuantity}
                        aria-label={`Increase quantity of ${item.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-cream/20 bg-mall-800 text-cream transition hover:border-mall-orange hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-orange disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Plus size={13} aria-hidden="true" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId, item.variantId)}
                      className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded px-2 text-xs text-cream/75 transition hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-orange"
                    >
                      <Trash2 size={13} aria-hidden="true" /> Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </section>

          <aside aria-labelledby="cart-summary-heading" className="rounded-2xl border border-cream/15 bg-mall-800 p-5 sm:p-6 lg:sticky lg:top-24">
            <p className="font-mono-tag text-[10px] uppercase tracking-[0.18em] text-mall-orange">Order summary</p>
            <h2 id="cart-summary-heading" className="mt-1 font-display text-2xl text-cream">A quick review</h2>
            <div className="mt-5 space-y-4 border-y border-cream/10 py-4">
              <div className="flex items-start justify-between gap-4 text-sm">
                <span className="text-cream/70">Items subtotal <span className="text-cream/50">({itemCount})</span></span>
                <span className="text-cream">KSh {totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-start justify-between gap-4 text-sm">
                <span className="text-cream/70">Delivery</span>
                <span className="max-w-[55%] text-right text-cream/80">Choose destination at checkout</span>
              </div>
              <div className="flex items-start justify-between gap-4 pt-1">
                <span className="text-sm font-semibold text-cream">Total</span>
                <span className="max-w-[55%] text-right font-display text-lg leading-snug text-cream">Calculated with delivery</span>
              </div>
            </div>
            <p className="my-4 text-xs leading-relaxed text-cream/80">Your delivery options and final total will be shown after you choose a destination. Submitting checkout requests an availability check; no payment is taken then.</p>
            <Link to="/stock-check" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-mall-orange px-4 py-3 text-sm font-semibold text-mall-900 transition hover:bg-mall-orangeDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-orange">
              Continue to checkout <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link to="/directory" className="mt-3 flex min-h-10 items-center justify-center rounded text-xs text-cream/60 transition hover:text-mall-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mall-accent">
              Continue shopping
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}
