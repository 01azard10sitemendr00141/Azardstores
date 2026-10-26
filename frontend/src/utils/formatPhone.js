// Formats a stored digits-only Kenyan number ("254140122685") into the
// display form used across the site ("+254 140 122 685"). Falls back to
// the raw value if it doesn't match the expected shape, rather than
// throwing on unexpected input.
export function formatPhoneDisplay(number) {
  if (!number) return "";
  const digits = String(number).replace(/\D/g, "");
  const match = digits.match(/^254(\d{3})(\d{3})(\d{3})$/);
  if (!match) return `+${digits}`;
  return `+254 ${match[1]} ${match[2]} ${match[3]}`;
}
