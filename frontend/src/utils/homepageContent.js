const LEGACY_CLOSING_HEADLINE = "The standard";
const LEGACY_CLOSING_ACCENT = "has changed.";

export function normalizeHomepageContent(content) {
  if (
    content?.closingHeadline !== LEGACY_CLOSING_HEADLINE ||
    content?.closingAccent !== LEGACY_CLOSING_ACCENT
  ) {
    return content;
  }

  return {
    ...content,
    closingHeadline: "Discover more.",
    closingAccent: "Shop it all.",
  };
}
