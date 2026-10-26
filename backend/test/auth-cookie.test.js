const test = require("node:test");
const assert = require("node:assert/strict");
const { getAuthToken, setAuthCookie, clearAuthCookie } = require("../middleware/auth");

test("auth prefers bearer tokens and falls back to the HttpOnly session cookie", () => {
  assert.equal(getAuthToken({ headers: { authorization: "Bearer bearer-token", cookie: "azardstores_session=cookie-token" } }), "bearer-token");
  assert.equal(getAuthToken({ headers: { cookie: "theme=dark; azardstores_session=cookie-token" } }), "cookie-token");
});

test("auth cookie is configured as a protected session cookie", () => {
  const calls = [];
  const response = { cookie: (...args) => calls.push(["set", ...args]), clearCookie: (...args) => calls.push(["clear", ...args]) };
  setAuthCookie(response, "signed-token");
  clearAuthCookie(response);
  assert.equal(calls[0][0], "set");
  assert.equal(calls[0][1], "azardstores_session");
  assert.equal(calls[0][2], "signed-token");
  assert.equal(calls[0][3].httpOnly, true);
  assert.equal(calls[0][3].sameSite, "lax");
  assert.equal(calls[1][0], "clear");
  assert.equal(calls[1][1], "azardstores_session");
});
