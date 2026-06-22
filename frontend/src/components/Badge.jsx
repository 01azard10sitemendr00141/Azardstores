const BADGE_LABELS = {
  "best-seller": "Best Seller",
  "hot-deal": "Hot Deal",
  "new-arrival": "New Arrival",
  exclusive: "Exclusive",
  trending: "Trending",
  "limited-stock": "Limited Stock",
};

export default function Badge({ badge }) {
  if (!badge) return null;
  return (
    <span className="absolute top-2 left-2 bg-mall-accent text-mall-900 text-xs font-mono-tag font-semibold uppercase px-2 py-1 rounded">
      {BADGE_LABELS[badge] || badge}
    </span>
  );
}
