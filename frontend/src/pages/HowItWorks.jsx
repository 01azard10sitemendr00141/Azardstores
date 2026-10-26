import { Link } from "react-router-dom";
import { Compass, Search, ShoppingBag, Truck, CheckCircle2, ArrowRight } from "lucide-react";

const STEPS = [
  {
    icon: Compass,
    title: "Browse the Mall",
    body: "Explore products organized by shop, category, and brand in one catalog.",
  },
  {
    icon: Search,
    title: "Find a Product",
    body: "Search the catalog or browse by shop and category to find products that suit you.",
  },
  {
    icon: ShoppingBag,
    title: "One Cart. One Checkout.",
    body: "Add products from different shops to one cart. Checkout shows the available delivery option and its charge before you place the order.",
  },
  {
    icon: Truck,
    title: "Order Status and Delivery",
    body: "Check your order status on Track My Order or in your dashboard. Delivery options depend on your destination; parcel orders include collection details when recorded.",
  },
];

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-mall-900 px-4 sm:px-6 py-16 sm:py-24">
      <div className="max-w-3xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-14 sm:mb-20">
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-3">
            Azard Stores
          </p>
          <h1 className="font-display text-3xl sm:text-5xl text-cream mb-4 leading-tight">
            How it works
          </h1>
          <p className="text-cream/50 text-sm sm:text-base leading-relaxed max-w-lg mx-auto">
            Browse products, place one order, and follow its status online.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4 sm:space-y-5">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="flex gap-4 sm:gap-5 bg-mall-800/60 border border-cream/10 rounded-2xl p-5 sm:p-6"
              >
                <div className="shrink-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-mall-accent/10 flex items-center justify-center">
                    <Icon size={20} className="text-mall-accent" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono-tag text-[10px] text-mall-orange">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display text-cream text-lg sm:text-xl">{step.title}</h3>
                  </div>
                  <p className="text-cream/50 text-sm leading-relaxed">{step.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust strip */}
        <div className="mt-10 sm:mt-14 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8 bg-mall-800/40 border border-cream/5 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2 text-cream/60 text-sm">
            <CheckCircle2 size={16} className="text-mall-accent shrink-0" />
            Products organized by shop
          </div>
          <div className="flex items-center gap-2 text-cream/60 text-sm">
            <CheckCircle2 size={16} className="text-mall-accent shrink-0" />
            Order status updates
          </div>
          <div className="flex items-center gap-2 text-cream/60 text-sm">
            <CheckCircle2 size={16} className="text-mall-accent shrink-0" />
            Browse the catalog online
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 sm:mt-14 text-center">
          <Link
            to="/directory"
            className="inline-flex items-center gap-2 bg-mall-accent text-mall-900 font-semibold px-6 py-3.5 rounded-full hover:bg-mall-accentDark transition text-sm"
          >
            Enter the Mall
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
