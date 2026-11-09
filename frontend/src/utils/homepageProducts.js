export function organizeHomepageSections(sections, flashSaleProducts) {
  const seen = new Set((flashSaleProducts || []).map((product) => product?._id).filter(Boolean));

  return (sections || [])
    .map((section) => {
      const products = (section.products || []).filter((product) => {
        if (!product) return false;
        if (!product._id) return true;
        if (seen.has(product._id)) return false;
        seen.add(product._id);
        return true;
      });

      return { ...section, products };
    })
    .filter((section) => section.products.length > 0);
}
