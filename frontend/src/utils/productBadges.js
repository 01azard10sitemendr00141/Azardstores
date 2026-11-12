export const MAX_PRODUCT_BADGES = 3;

export function getProductBadges(product) {
  const values = [
    ...(Array.isArray(product?.badges) ? product.badges : []),
    product?.badge,
  ];
  return [...new Set(values
    .filter((badge) => typeof badge === "string")
    .map((badge) => badge.trim())
    .filter(Boolean))];
}
