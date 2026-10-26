const MAX_PAGE = 10_000;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 100;

function boundedInteger(value, fallback, maximum) {
  const parsed = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function queryText(value, maxLength = MAX_SEARCH_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseListQuery(query = {}) {
  return {
    page: boundedInteger(query.page, 1, MAX_PAGE),
    limit: boundedInteger(query.limit, 20, MAX_LIMIT),
    search: queryText(query.search),
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { parseListQuery, queryText, escapeRegex, MAX_PAGE, MAX_LIMIT, MAX_SEARCH_LENGTH };
