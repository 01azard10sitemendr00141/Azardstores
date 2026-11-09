function cleanDescription(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/gi, (entity) => ({
      "&nbsp;": " ",
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
    })[entity.toLowerCase()])
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, code) => {
      const value = code[0].toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function getProductSeoDescription(product = {}) {
  const description = cleanDescription(product.description) || cleanDescription(product.longDescription);
  return (description || `Shop ${String(product.name || "this product").trim()} at Azard Stores, Kenya's digital mall.`).slice(0, 300);
}
