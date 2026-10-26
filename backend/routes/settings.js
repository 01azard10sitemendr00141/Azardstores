const express = require("express");
const Settings = require("../models/Settings");
const { protect, requireRole } = require("../middleware/auth");
const { isPaystackConfigured, isPaystackMpesaConfigured } = require("../utils/paystack");
const { isEmailDeliveryConfigured } = require("../config/verification");
const { getPublicDeliveryCounties } = require("../utils/publicDeliveryOptions");

const router = express.Router();

// There's only ever one settings document. Create it with defaults the
// first time anything asks for it, rather than requiring a manual seed step.
async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  return settings;
}

function deliveryTownOptions(settings) {
  const destinations = [
    { county: "Nairobi", town: "Nairobi CBD" },
    ...(settings.deliveryTowns || []).map((destination) => ({ county: destination.county, town: destination.town })),
    ...(settings.deliveryRoutes || []).filter((route) => route.active).map((route) => ({ county: route.county, town: route.town })),
  ];
  return [...new Map(destinations.map((destination) => [`${destination.county.toLowerCase()}|${destination.town.toLowerCase()}`, destination])).values()];
}

// GET /api/settings - public. Only exposes what the storefront actually
// needs (WhatsApp number, contact email, delivery fee info, which payment
// methods are actually live) — not every internal field.
router.get("/", async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({
      whatsappNumber: settings.whatsappNumber,
      contactEmail: settings.contactEmail,
      deliveryFee: settings.deliveryFee,
      freeDeliveryThreshold: settings.freeDeliveryThreshold,
      deliveryCounties: getPublicDeliveryCounties(settings),
      // Keep explicitly configured destinations visible, but don't advertise
      // destinations that exist only on disabled routes.
      deliveryTowns: deliveryTownOptions(settings),
      deliveryRoutes: (settings.deliveryRoutes || []).filter((route) => route.active),
      paymentMethods: { mpesa: isPaystackMpesaConfigured(), paystack: isPaystackConfigured() },
      emailDeliveryConfigured: isEmailDeliveryConfigured(),
      maintenanceMode: settings.maintenanceMode,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/settings/admin - admin only, full record
router.get("/admin", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ ...settings.toObject(), deliveryTowns: deliveryTownOptions(settings) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings - admin only
router.put("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ message: "Settings must be submitted as an object" });
    }
    const settings = await getOrCreateSettings();
    const { whatsappNumber, contactEmail, deliveryFee, freeDeliveryThreshold, deliveryCounties, deliveryTowns, deliveryRoutes, maintenanceMode } = req.body;

    let normalizedWhatsappNumber;
    if (whatsappNumber !== undefined) {
      if (typeof whatsappNumber !== "string") return res.status(400).json({ message: "WhatsApp number must be entered as digits in international format (254 followed by 9 digits)" });
      normalizedWhatsappNumber = whatsappNumber.trim();
      if (!/^254\d{9}$/.test(normalizedWhatsappNumber)) return res.status(400).json({ message: "WhatsApp number must be 254 followed by 9 mobile digits, with no spaces or symbols" });
    }

    let normalizedContactEmail;
    if (contactEmail !== undefined) {
      if (typeof contactEmail !== "string") return res.status(400).json({ message: "Enter a valid contact email address" });
      normalizedContactEmail = contactEmail.trim().toLowerCase();
      if (normalizedContactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedContactEmail)) return res.status(400).json({ message: "Enter a valid contact email address" });
    }

    for (const [name, value] of [["Delivery fee", deliveryFee], ["Free delivery threshold", freeDeliveryThreshold]]) {
      if (value !== undefined && ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0)) {
        return res.status(400).json({ message: `${name} must be a non-negative number` });
      }
    }
    if (maintenanceMode !== undefined && typeof maintenanceMode !== "boolean") {
      return res.status(400).json({ message: "Maintenance mode must be true or false" });
    }

    if (normalizedWhatsappNumber !== undefined) settings.whatsappNumber = normalizedWhatsappNumber;
    if (normalizedContactEmail !== undefined) settings.contactEmail = normalizedContactEmail;
    if (deliveryFee !== undefined) settings.deliveryFee = Number(deliveryFee);
    if (freeDeliveryThreshold !== undefined) settings.freeDeliveryThreshold = Number(freeDeliveryThreshold);
    if (deliveryCounties !== undefined) {
      if (!Array.isArray(deliveryCounties) || deliveryCounties.some((county) => typeof county !== "string" || !county.trim() || county.trim().length > 100)) return res.status(400).json({ message: "Enter valid county names" });
      settings.deliveryCounties = [...new Set(deliveryCounties.map((county) => county.trim()))];
    }
    if (deliveryTowns !== undefined) {
      if (!Array.isArray(deliveryTowns) || deliveryTowns.some((destination) => !destination || typeof destination.county !== "string" || !destination.county.trim() || destination.county.length > 100 || typeof destination.town !== "string" || !destination.town.trim() || destination.town.length > 100)) return res.status(400).json({ message: "Enter valid county and town names" });
      settings.deliveryTowns = [...new Map(deliveryTowns.map((destination) => [`${destination.county.trim().toLowerCase()}|${destination.town.trim().toLowerCase()}`, { county: destination.county.trim(), town: destination.town.trim() }]))].map(([, destination]) => destination);
    }
    if (deliveryRoutes !== undefined) {
      if (!Array.isArray(deliveryRoutes) || deliveryRoutes.some((route) => !route || typeof route !== "object" || Array.isArray(route))) return res.status(400).json({ message: "Delivery routes must be a list of valid route objects" });
      for (const route of deliveryRoutes) {
        if (!['direct', 'parcel'].includes(route.serviceType)) return res.status(400).json({ message: "Each delivery route must be direct or parcel service" });
        if (route.active !== undefined && typeof route.active !== "boolean") return res.status(400).json({ message: "Each delivery route must have a true or false active setting" });
        const serviceType = route.serviceType;
        if (![route.county, route.town].every((value) => typeof value === "string" && value.trim())) return res.status(400).json({ message: "Each delivery zone needs a county and town or area" });
        if (serviceType === "direct" && route.county.trim().toLowerCase() !== "nairobi") return res.status(400).json({ message: "Direct delivery zones can only be configured within Nairobi County" });
        if (serviceType === "parcel" && (![route.carrier, route.officeName, route.officeAddress].every((value) => typeof value === "string" && value.trim()) || route.officeAddress.trim().length < 8)) return res.status(400).json({ message: "Parcel routes need a carrier, collection office, and complete office address" });
        if (((typeof route.fee !== "number" && typeof route.fee !== "string") || String(route.fee).trim() === "" || !Number.isFinite(Number(route.fee))) || Number(route.fee) < 0) return res.status(400).json({ message: "Each route needs a valid delivery charge" });
        if (route.estimatedDays !== null && route.estimatedDays !== undefined && ((typeof route.estimatedDays !== "number" && typeof route.estimatedDays !== "string") || String(route.estimatedDays).trim() === "" || !Number.isInteger(Number(route.estimatedDays)) || Number(route.estimatedDays) < 1 || Number(route.estimatedDays) > 30)) {
          return res.status(400).json({ message: "Estimated delivery must be between 1 and 30 days" });
        }
      }
      settings.deliveryRoutes = deliveryRoutes.map((route) => ({
        _id: route._id,
        county: route.county.trim(), town: route.town.trim(), serviceType: route.serviceType,
        carrier: String(route.carrier || "").trim(), officeName: String(route.officeName || "").trim(), officeAddress: String(route.officeAddress || "").trim(),
        fee: Number(route.fee), estimatedDays: route.estimatedDays ? Number(route.estimatedDays) : null,
        active: route.active !== false,
      }));
    }
    if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;

    await settings.save();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
