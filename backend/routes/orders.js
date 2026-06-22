const express = require("express");
const { body, validationResult } = require("express-validator");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { protect, requireRole, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// POST /api/orders - create an order (works for logged-in users or guests)
router.post(
  "/",
  optionalAuth,
  [
    body("items").isArray({ min: 1 }).withMessage("Order must contain at least one item"),
    body("channel").isIn(["cart", "whatsapp"]).withMessage("Invalid order channel"),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { items, channel, deliveryAddress, guestInfo } = req.body;

      // Re-fetch real prices from DB rather than trusting client-sent prices
      const productIds = items.map((i) => i.productId);
      const products = await Product.find({ _id: { $in: productIds } });

      const orderItems = items.map((item) => {
        const product = products.find((p) => p._id.toString() === item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        return {
          product: product._id,
          name: product.name,
          price: product.price,
          quantity: item.quantity,
          image: product.images[0] || "",
        };
      });

      const totalAmount = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

      const order = await Order.create({
        user: req.user ? req.user._id : null,
        guestInfo: req.user ? undefined : guestInfo,
        items: orderItems,
        totalAmount,
        deliveryAddress,
        channel,
      });

      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/orders/my - logged-in user's own order history
router.get("/my", protect, async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders - admin only, all orders
router.get("/", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

// PUT /api/orders/:id/status - admin only
router.put("/:id/status", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
