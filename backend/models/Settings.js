const mongoose = require("mongoose");

const deliveryRouteSchema = new mongoose.Schema({
  county: { type: String, required: true, trim: true, maxlength: 100 },
  town: { type: String, required: true, trim: true, maxlength: 100 },
  serviceType: { type: String, enum: ["direct", "parcel"], default: "parcel" },
  carrier: { type: String, trim: true, maxlength: 100, default: "" },
  officeName: { type: String, trim: true, maxlength: 160, default: "" },
  officeAddress: { type: String, trim: true, maxlength: 500, default: "" },
  fee: { type: Number, required: true, min: 0 },
  estimatedDays: { type: Number, min: 1, max: 30, default: null },
  active: { type: Boolean, default: true },
});

// Deliberately a singleton — there's only ever one settings document for
// the whole mall. All fields here are live: the frontend reads them via
// SettingsContext (GET /api/settings) and the admin panel writes them via
// PUT /api/settings — no page still has its own hardcoded copy of these.
const settingsSchema = new mongoose.Schema(
  {
    whatsappNumber: { type: String, default: "254140122685" },
    contactEmail: { type: String, default: "hello@azardstores.co.ke" },
    deliveryFee: { type: Number, default: 0 },
    freeDeliveryThreshold: { type: Number, default: 0 },
    deliveryCounties: { type: [String], default: [] },
    deliveryTowns: { type: [{ county: { type: String, required: true, trim: true, maxlength: 100 }, town: { type: String, required: true, trim: true, maxlength: 100 } }], default: [{ county: "Nairobi", town: "Nairobi CBD" }] },
    deliveryRoutes: { type: [deliveryRouteSchema], default: [] },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
