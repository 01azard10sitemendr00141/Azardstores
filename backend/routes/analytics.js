const express = require("express");
const Order = require("../models/Order");
const { protect, requireRole } = require("../middleware/auth");
const { buildTopShopsPipeline, buildUnattributedShopRevenuePipeline } = require("../utils/shopAnalytics");

const router = express.Router();
const paidOrderMatch = {
  paymentStatus: "paid",
  status: { $nin: ["cancelled", "unavailable", "expired"] },
  storeBalanceCreditedAt: null,
};

// GET /api/analytics/overview - admin only. Paid order value and top sellers
// are scoped to the last 30 days and exclude unpaid or fully credited orders.
router.get("/overview", protect, requireRole("admin"), async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [revenueByDay, topProducts, topShops, unattributedShopRevenue, totals] = await Promise.all([
      Order.aggregate([
        { $match: { ...paidOrderMatch, createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            revenue: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Order.aggregate([
        { $match: { ...paidOrderMatch, createdAt: { $gte: thirtyDaysAgo } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product",
            name: { $first: "$items.name" },
            unitsSold: { $sum: "$items.quantity" },
            revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          },
        },
        { $sort: { unitsSold: -1 } },
        { $limit: 5 },
      ]),

      Order.aggregate(buildTopShopsPipeline({ ...paidOrderMatch, createdAt: { $gte: thirtyDaysAgo } })),

      Order.aggregate(buildUnattributedShopRevenuePipeline({ ...paidOrderMatch, createdAt: { $gte: thirtyDaysAgo } })),

      Order.aggregate([
        { $match: { ...paidOrderMatch, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" }, totalOrders: { $sum: 1 } } },
      ]),
    ]);

    const totalsDoc = totals[0] || { totalRevenue: 0, totalOrders: 0 };

    res.json({
      revenueByDay,
      topProducts,
      topShops,
      unattributedShopRevenue30d: unattributedShopRevenue[0]?.revenue || 0,
      unattributedShopOrders30d: unattributedShopRevenue[0]?.orderCount || 0,
      totalRevenue30d: totalsDoc.totalRevenue,
      totalOrders30d: totalsDoc.totalOrders,
      avgOrderValue30d: totalsDoc.totalOrders > 0 ? Math.round(totalsDoc.totalRevenue / totalsDoc.totalOrders) : 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
