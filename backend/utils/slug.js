const slugify = require("slugify");

function makeSlug(text, suffix = "") {
  const base = slugify(text, { lower: true, strict: true });
  return suffix ? `${base}-${suffix}` : base;
}

module.exports = { makeSlug };