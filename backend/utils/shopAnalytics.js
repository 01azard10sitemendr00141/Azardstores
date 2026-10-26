function buildTopShopsPipeline(paidOrderMatch) {
  return [
    { $match: paidOrderMatch },
    { $unwind: "$items" },
    { $match: { "items.shopId": { $ne: null } } },
    {
      $group: {
        _id: "$items.shopId",
        name: { $first: "$items.shopName" },
        shopNumber: { $first: "$items.shopNumber" },
        revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, name: 1, shopNumber: 1, revenue: 1 } },
  ];
}

function buildUnattributedShopRevenuePipeline(paidOrderMatch) {
  return [
    { $match: paidOrderMatch },
    { $unwind: "$items" },
    { $match: { "items.shopId": null } },
    {
      $group: {
        _id: "$_id",
        revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
      },
    },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$revenue" },
        orderCount: { $sum: 1 },
      },
    },
    { $project: { _id: 0, revenue: 1, orderCount: 1 } },
  ];
}

module.exports = { buildTopShopsPipeline, buildUnattributedShopRevenuePipeline };
