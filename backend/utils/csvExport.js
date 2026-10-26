// Minimal, dependency-free CSV writer for admin exports. Only needs to
// handle our own data going OUT (not parsing arbitrary CSVs coming in,
// which is what csv-parse is for) — so a simple RFC4180-style quoting
// function is enough without pulling in another library.
function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Spreadsheet programs may execute cells beginning with formula markers.
  // Prefix an apostrophe when user-controlled text starts with a marker,
  // including after whitespace/control characters, before applying CSV quoting.
  if (/^[\u0000-\u0020]*[=+\-@]/.test(str)) str = `'${str}`;
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvField(typeof c.value === "function" ? c.value(row) : row[c.value])).join(",")
  );
  return [header, ...lines].join("\r\n");
}

module.exports = { toCsv };
