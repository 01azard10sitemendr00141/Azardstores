import { useBadges } from "../context/BadgesContext";

export default function Badge({ badge }) {
  const { badgesBySlug } = useBadges();
  if (!badge) return null;
  return (
    <span className="absolute top-2 left-2 bg-mall-accent text-mall-900 text-xs font-mono-tag font-semibold uppercase px-2 py-1 rounded">
      {badgesBySlug[badge]?.chipLabel || badge}
    </span>
  );
}
