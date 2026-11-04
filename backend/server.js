require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const { getAuthToken } = require("./middleware/auth");

const { connectDB } = require("./config/db");
const { seedDefaultBadgesIfEmpty } = require("./utils/seedDefaultBadges");
const { seedDefaultHomeSectionsIfEmpty } = require("./utils/seedDefaultHomeSections");
const { seedDefaultHeroSlidesIfEmpty } = require("./utils/seedDefaultHeroSlides");
const { seedHomepageContentIfEmpty } = require("./utils/seedHomepageContent");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { startPaymentReminderWorker } = require("./utils/paymentReminderWorker");
const { startEmailOutboxWorker } = require("./utils/emailOutboxWorker");
const { getPort } = require("./config/runtime");
const { getVerificationCapabilities } = require("./config/verification");
const { isPaystackConfigured, isPaystackMpesaConfigured } = require("./utils/paystack");

const authRoutes = require("./routes/auth");
const floorRoutes = require("./routes/floors");
const shopRoutes = require("./routes/shops");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const webhookRoutes = require("./routes/webhooks");
const contactRoutes = require("./routes/contact");
const categoriesRoutes = require("./routes/categories");
const brandRoutes = require("./routes/brands");
const settingsRoutes = require("./routes/settings");
const analyticsRoutes = require("./routes/analytics");

const app = express();
const server = http.createServer(app);
const trustProxyHopsValue = process.env.TRUST_PROXY_HOPS?.trim();
if (trustProxyHopsValue) {
  const trustProxyHops = Number(trustProxyHopsValue);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 1 || trustProxyHops > 10) {
    throw new Error("TRUST_PROXY_HOPS must be an integer from 1 to 10 when configured");
  }
  app.set("trust proxy", trustProxyHops);
}
const clientOrigin = process.env.CLIENT_URL?.trim()
  ? new URL(process.env.CLIENT_URL.trim()).origin
  : "*";
const io = new Server(server, {
  cors: { origin: clientOrigin, credentials: true },
});

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
  next();
});

// Make io available in routes/controllers if needed later, e.g. live stock updates
app.set("io", io);

// Keep guest sockets available for public order tracking, but give live order
// events only to sockets authenticated as the order owner or an admin.
io.use(async (socket, next) => {
  const token = String(socket.handshake.auth?.token || getAuthToken({ headers: socket.handshake.headers }) || "").trim();
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("_id role +tokenVersion");
    if (user && Number(decoded.tokenVersion || 0) === Number(user.tokenVersion || 0)) {
      socket.data.userId = String(user._id);
      socket.data.role = user.role;
    }
  } catch {
    // An invalid or expired token receives no private rooms. API requests
    // remain responsible for returning the normal authentication error.
  }

  next();
});

app.use(cors({ origin: clientOrigin, credentials: true }));

// Capture the raw request body alongside the parsed JSON — the WhatsApp
// webhook needs the exact original bytes to verify Meta's signature header,
// which a re-serialized JSON object won't reliably match byte-for-byte.
app.use(express.json({ limit: "100kb", verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: "100kb", parameterLimit: 100 }));

app.get("/api/health", (req, res) => {
  const databaseReady = require("mongoose").connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? "ok" : "degraded",
    database: databaseReady ? "connected" : "disconnected",
    providers: {
      email: getVerificationCapabilities().email ? "configured" : "not_configured",
      sms: getVerificationCapabilities().sms ? "configured" : "not_configured",
      whatsapp: getVerificationCapabilities().whatsapp ? "configured" : "not_configured",
      paystack: isPaystackConfigured() ? "configured" : "not_configured",
      paystackMpesa: isPaystackMpesaConfigured() ? "configured" : "not_configured",
    },
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/floors", floorRoutes);
app.use("/api/shops", shopRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/purchase-orders", require("./routes/purchaseOrders"));
app.use("/api/webhooks", webhookRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/badges", require("./routes/badges"));
app.use("/api/home-sections", require("./routes/homeSections"));
app.use("/api/hero-slides", require("./routes/heroSlides"));
app.use("/api/homepage-content", require("./routes/homepageContent"));
app.use("/api/settings", settingsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/payments", require("./routes/payments"));

io.on("connection", (socket) => {
  if (socket.data.userId) socket.join(`user:${socket.data.userId}`);
  if (socket.data.role === "admin") socket.join("admins");
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

app.use(notFound);
app.use(errorHandler);

const PORT = getPort(process.env.PORT);
const workerIntervals = [];
let shutdownPromise;

async function shutdown(signal) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    console.log(`${signal} received; shutting down Azard Stores API`);
    workerIntervals.forEach((interval) => clearInterval(interval));
    const forceExit = setTimeout(() => {
      console.error("Graceful shutdown timed out; forcing process exit");
      process.exit(1);
    }, 10_000);

    try {
      await new Promise((resolve) => io.close(resolve));
      await require("mongoose").disconnect();
      console.log("API shutdown complete");
    } catch (error) {
      console.error("API shutdown failed:", error.message);
      process.exitCode = 1;
    } finally {
      clearTimeout(forceExit);
    }
  })();
  return shutdownPromise;
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function startServer() {
  try {
    const jwtSecret = process.env.JWT_SECRET?.trim();
    if (!jwtSecret || jwtSecret.length < 32 || jwtSecret === "replace-with-a-long-random-secret") {
      throw new Error("JWT_SECRET must be a private random value with at least 32 characters");
    }
    if (process.env.NODE_ENV === "production") {
      const configuredClientUrl = process.env.CLIENT_URL?.trim();
      if (!configuredClientUrl) {
        throw new Error("CLIENT_URL must be set to the public storefront origin in production");
      }
      let storefrontUrl;
      try {
        storefrontUrl = new URL(configuredClientUrl);
      } catch {
        throw new Error("CLIENT_URL must be a valid HTTPS storefront origin in production");
      }
      if (storefrontUrl.protocol !== "https:" || storefrontUrl.username || storefrontUrl.password ||
          storefrontUrl.pathname !== "/" || storefrontUrl.search || storefrontUrl.hash || configuredClientUrl !== storefrontUrl.origin) {
        throw new Error("CLIENT_URL must be the exact HTTPS storefront origin, without a trailing slash, path, or credentials in production");
      }
    }
    await connectDB();
    await seedDefaultBadgesIfEmpty();
    await seedDefaultHomeSectionsIfEmpty();
    await seedDefaultHeroSlidesIfEmpty();
    await seedHomepageContentIfEmpty();
    await new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      server.once("error", onError);
      server.listen(PORT, () => {
        server.off("error", onError);
        resolve();
      });
    });
    console.log(`Azard Stores API running on port ${PORT}`);
    try { workerIntervals.push(startPaymentReminderWorker(io)); }
    catch (workerError) { console.error("Payment reminder worker failed to start:", workerError.message); }
    try { workerIntervals.push(startEmailOutboxWorker()); }
    catch (workerError) { console.error("Email outbox worker failed to start:", workerError.message); }
  } catch (err) {
    console.error("Backend startup failed:", err.message);
    await require("mongoose").disconnect().catch(() => {});
    process.exitCode = 1;
  }
}

startServer();
