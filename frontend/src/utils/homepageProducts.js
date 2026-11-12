export function organizeHomepageSections(sections, flashSaleProducts) {
  const flashSaleIds = new Set((flashSaleProducts || []).map((product) => product?._id).filter(Boolean));
  const seen = new Set(flashSaleIds);

  return (sections || [])
    .map((section) => {
      const sectionSeen = new Set();
      const products = (section.products || []).filter((product) => {
        if (!product) return false;
        if (!product._id) return true;
        if (section.type === "badge") {
          if (sectionSeen.has(product._id)) return false;
          sectionSeen.add(product._id);
          seen.add(product._id);
          return true;
        }
        if (flashSaleIds.has(product._id)) return false;
        if (seen.has(product._id)) return false;
        seen.add(product._id);
        return true;
      });

      return { ...section, products };
    })
    .filter((section) => section.products.length > 0);
}
