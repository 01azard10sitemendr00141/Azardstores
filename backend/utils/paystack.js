const crypto = require("crypto");

const PAYSTACK_BASE = "https://api.paystack.co";
const PAYMENT_REQUEST_TIMEOUT_MS = 15_000;
const CALLBACK_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function createPaymentCallbackToken(reference, now = Date.now()) {
  const expiresAt = now + CALLBACK_TOKEN_TTL_MS;
  const signature = crypto
    .createHmac("sha256", process.env.JWT_SECRET || "")
    .update(`${reference}:${expiresAt}`)
    .digest("base64url");
  return `${expiresAt}.${signature}`;
}

function isValidPaymentCallbackToken(reference, token, now = Date.now()) {
  if (typeof reference !== "string" || typeof token !== "string" || !process.env.JWT_SECRET) return false;
  const [expiresAtText, signature, ...extra] = token.split(".");
  const expiresAt = Number(expiresAtText);
  if (extra.length || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + CALLBACK_TOKEN_TTL_MS + 60_000 ||
      !/^[A-Za-z0-9_-]{43}$/.test(signature || "")) return false;
  const expected = crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${reference}:${expiresAt}`)
    .digest();
  const supplied = Buffer.from(signature, "base64url");
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function isPaystackConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") && process.env.CLIENT_URL);
}

// Live Paystack credentials don't prove that the merchant's account has
// M-Pesa enabled. Require an explicit operator confirmation before offering
// the channel at checkout.
function isPaystackMpesaConfigured() {
  return isPaystackConfigured() && String(process.env.PAYSTACK_MPESA_ENABLED || "").trim().toLowerCase() === "true";
}

function expectedPaystackDomain() {
  return isPaystackConfigured() ? "live" : null;
}

function isVerifiedPayment(verified, reference, expectedAmountKsh) {
  const amountSubunit = Math.round(Number(expectedAmountKsh) * 100);
  const expectedDomain = expectedPaystackDomain();
  return Boolean(
    verified?.status === "success" &&
    verified.reference === reference &&
    Number.isSafeInteger(verified.amountSubunit) &&
    verified.amountSubunit === amountSubunit &&
    verified.currency === "KES" &&
    expectedDomain && verified.domain === expectedDomain
  );
}

async function initializeTransaction({ email, amount, reference, callbackUrl, metadata }) {
  const amountSubunit = Math.round(Number(amount) * 100);
  if (!email || !Number.isSafeInteger(amountSubunit) || amountSubunit <= 0 || !reference) {
    throw new Error("Invalid Paystack transaction details");
  }

  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountSubunit,
      currency: "KES",
      reference,
      callback_url: callbackUrl,
      metadata,
    }),
    signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS),
  });
  const data = await res.json();
  if (!res.ok || !data.status || !data.data) {
    throw new Error(data.message || "Paystack initialization failed");
  }

  const authorizationUrl = new URL(data.data.authorization_url || "");
  if (authorizationUrl.protocol !== "https:" || authorizationUrl.hostname !== "checkout.paystack.com") {
    throw new Error("Paystack returned an invalid checkout URL");
  }
  if (data.data.reference !== reference) {
    throw new Error("Paystack returned an unexpected transaction reference");
  }
  return { authorizationUrl: authorizationUrl.toString(), reference: data.data.reference };
}

async function initiateMpesaCharge({ email, phone, amount, reference, metadata }) {
  const amountSubunit = Math.round(Number(amount) * 100);
  if (!email || !phone || !Number.isSafeInteger(amountSubunit) || amountSubunit <= 0 || !reference) {
    throw new Error("Invalid Paystack M-Pesa charge details");
  }

  const res = await fetch(`${PAYSTACK_BASE}/charge`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountSubunit,
      currency: "KES",
      reference,
      mobile_money: { phone, provider: "mpesa" },
      metadata,
    }),
    signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS),
  });
  const data = await res.json();
  if (!res.ok || !data.status || !data.data) {
    throw new Error(data.message || "Paystack could not start the M-Pesa charge");
  }
  if (data.data.reference !== reference) {
    throw new Error("Paystack returned an unexpected M-Pesa reference");
  }
  return {
    reference: data.data.reference,
    status: data.data.status,
    displayText: data.data.display_text || "Approve the M-Pesa payment prompt on your phone.",
  };
}

async function checkCharge(reference) {
  const res = await fetch(`${PAYSTACK_BASE}/charge/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS),
  });
  const data = await res.json();
  if (!res.ok || !data.status || !data.data) {
    throw new Error(data.message || "Paystack could not check the M-Pesa request");
  }
  return {
    status: data.data.status,
    reference: data.data.reference,
    message: data.data.message || data.data.gateway_response || "",
  };
}

async function verifyTransaction(reference) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS),
  });
  const data = await res.json();
  if (!res.ok || !data.status || !data.data) {
    throw new Error(data.message || "Paystack verification failed");
  }
  return {
    status: data.data.status,
    amountSubunit: Number(data.data.amount),
    currency: data.data.currency,
    reference: data.data.reference,
    domain: data.data.domain,
    customerEmail: data.data.customer?.email || "",
    metadataOrderId: data.data.metadata?.orderId || "",
    paidAt: data.data.paid_at,
    gatewayResponse: data.data.gateway_response || "",
  };
}

// Paystack signs the exact raw webhook bytes with HMAC-SHA512. Compare
// buffers with timingSafeEqual so signature checking does not leak a
// character-by-character timing signal.
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!rawBody || !signatureHeader || !process.env.PAYSTACK_SECRET_KEY) return false;
  if (!/^[a-f\d]{128}$/i.test(signatureHeader)) return false;
  const expected = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest();
  const supplied = Buffer.from(signatureHeader, "hex");
  return supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
}

module.exports = {
  isPaystackConfigured,
  isPaystackMpesaConfigured,
  initializeTransaction,
  initiateMpesaCharge,
  checkCharge,
  verifyTransaction,
  verifyWebhookSignature,
  isVerifiedPayment,
  createPaymentCallbackToken,
  isValidPaymentCallbackToken,
};
