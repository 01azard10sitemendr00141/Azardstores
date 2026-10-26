import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, MessageCircle } from "lucide-react";

const FAQS = [
  {
    q: "How is Azard Stores different from a regular online store?",
    a: "Azard Stores organizes products by shop in one catalog. You can add items from multiple shops to one cart; available delivery options and charges are shown before you place the order.",
  },
  {
    q: "Can I buy from more than one shop in a single order?",
    a: "Yes. Add products from different shops to your cart and check out once — no need to place separate orders per shop.",
  },
  {
    q: "How do I track my order?",
    a: "Visit Track My Order or your dashboard to see order status updates. This is order status tracking; carrier location tracking is not provided by the storefront.",
  },
  {
    q: "What payment methods are supported?",
    a: "Available methods are shown at checkout. Cash on delivery is limited to eligible Nairobi CBD orders. Card and M-Pesa payments are offered when enabled for the order. For those online payments, Azard Stores confirms product availability first; you can then pay from your order page.",
  },
  {
    q: "How long does delivery take?",
    a: "Timing depends on the delivery option and destination. Any configured parcel transit estimate appears with the selected route or on your order. See Delivery Info for how delivery and collection work.",
  },
  {
    q: "Can I return or exchange a product?",
    a: "Eligible items can be returned within the window and conditions on our Returns & Exchanges page. Approved returns are credited to Azard Store Balance. Check the product page for item-specific eligibility.",
  },
  {
    q: "Do I need an account to shop?",
    a: "No — you can browse, check out as a guest, and track your order without creating one. An account just makes it easier to see your full order history in one place across devices.",
  },
  {
    q: "Is Azard Stores available outside Kenya?",
    a: "Azard Stores currently operates out of Nairobi, Kenya, with delivery available across the regions our shops support. Reach out via Contact if you're unsure whether we deliver to you.",
  },
];

function FAQItem({ item, index, isOpen, onToggle }) {
  const buttonId = `faq-question-${index}`;
  const answerId = `faq-answer-${index}`;
  return (
    <div className="border-b border-cream/10">
      <button
        id={buttonId}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={answerId}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <span className="font-display text-cream text-base sm:text-lg group-hover:text-mall-accent transition">
          {item.q}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-mall-accent transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      <div id={answerId} role="region" aria-labelledby={buttonId} hidden={!isOpen} className="pb-5">
        <p className="text-cream/50 text-sm leading-relaxed pr-8">{item.a}</p>
      </div>
    </div>
  );
}

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="min-h-screen bg-mall-900 px-4 sm:px-6 py-16 sm:py-24">
      <div className="max-w-2xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-12 sm:mb-16">
          <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-3">
            Azard Stores
          </p>
          <h1 className="font-display text-3xl sm:text-5xl text-cream mb-4 leading-tight">
            Frequently asked questions
          </h1>
          <p className="text-cream/50 text-sm sm:text-base leading-relaxed">
            Everything you need to know before you start shopping.
          </p>
        </div>

        {/* Accordion */}
        <div className="bg-mall-800/40 border border-cream/10 rounded-2xl px-5 sm:px-6">
          {FAQS.map((item, i) => (
            <FAQItem
              key={item.q}
              item={item}
              index={i}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
            />
          ))}
        </div>

        {/* Still need help */}
        <div className="mt-10 sm:mt-14 flex flex-col sm:flex-row items-center justify-between gap-4 bg-mall-800/60 border border-cream/10 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-mall-accent/10 flex items-center justify-center shrink-0">
              <MessageCircle size={18} className="text-mall-accent" />
            </div>
            <div>
              <p className="text-cream text-sm font-medium">Still have questions?</p>
              <p className="text-cream/50 text-xs">We're happy to help directly.</p>
            </div>
          </div>
          <Link
            to="/contact"
            className="shrink-0 bg-mall-accent text-mall-900 font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-mall-accentDark transition"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}
