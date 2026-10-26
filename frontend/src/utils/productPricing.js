export function getStartingPrice(product) {
  if (!product) return undefined;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length) {
    const price = Number(product.price);
    return Number.isFinite(price) && price > 0 ? price : undefined;
  }

  const prices = variants
    .map((variant) => Number(variant.price ?? product.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  return prices.length ? Math.min(...prices) : undefined;
}
