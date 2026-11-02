const test = require("node:test");
const assert = require("node:assert/strict");
const { getCbdDeliveryFee } = require("../utils/deliveryPricing");
const { normalizePhone } = require("../utils/normalizePhone");
const { toCsv } = require("../utils/csvExport");
const { digestOtp, verifyOtp } = require("../utils/otp");
const { productStatus, productSkus, validatePublishable } = require("../utils/productLifecycle");
const Product = require("../models/Product");
const { mapWooCommerceRows, suggestImportPlacement } = require("../utils/wooCommerceImport");
const { getPort } = require("../config/runtime");
const { parseListQuery, queryText, escapeRegex } = require("../utils/listQuery");
const { buildAdminProductQuery, isValidExpectedProductCount, matchesExpectedProductCount } = require("../utils/adminProductQuery");
const { customerOrderView } = require("../utils/customerOrderView");
const { buildTopShopsPipeline, buildUnattributedShopRevenuePipeline } = require("../utils/shopAnalytics");
const { getPublicDeliveryCounties } = require("../utils/publicDeliveryOptions");
const Order = require("../models/Order");

test("admin list queries cap pagination and treat search as literal text", () => {
  assert.deepEqual(parseListQuery({ page: "-4", limit: "999999", search: "  chair  " }), { page: 1, limit: 100, search: "chair" });
  assert.deepEqual(parseListQuery({ page: "90000", limit: "0", search: ["a", "b"] }), { page: 10000, limit: 20, search: "" });
  assert.equal(queryText(["shop-a", "shop-b"]), "");
  assert.equal(queryText("  a long filter value  ", 8), "a long f");
  assert.equal(escapeRegex(".*(chair)+"), "\\.\\*\\(chair\\)\\+");
});

test("admin product filters compose consistently for listing and all-matching archive", () => {
  const { filter, search, status, category } = buildAdminProductQuery({
    search: "  chair.*  ",
    status: "published",
    category: "Home (Decor)",
  });

  assert.equal(search, "chair.*");
  assert.equal(status, "published");
  assert.equal(category, "Home (Decor)");
  assert.equal(filter.$and.length, 3);
  assert.deepEqual(filter.$and[0], {
    isActive: true,
    $or: [{ status: "published" }, { status: { $exists: false } }],
  });
  assert.equal(filter.$and[1].category.test("home (decor)"), true);
  assert.equal(filter.$and[1].category.test("Home Decor"), false);
  assert.equal(filter.$and[2].$or[0].name.test("Chair.*"), true);
  assert.equal(filter.$and[2].$or[0].name.test("ChairX"), false);
  assert.equal(filter.$and[2].$or[2]["variants.sku"].test("chair.*"), true);
});

test("admin product matching supports all status and category filters and rejects invalid statuses", () => {
  const all = buildAdminProductQuery({ status: "all", category: "Shoes" });
  assert.deepEqual(Object.keys(all.filter), ["category"]);
  assert.equal(all.filter.category.test("shoes"), true);
  assert.deepEqual(buildAdminProductQuery({ status: "archived" }).filter, { status: "archived" });
  assert.throws(() => buildAdminProductQuery({ status: "anything" }), /valid product status filter/);
});

test("admin inventory filters distinguish confirmed stock levels for simple and variant products", () => {
  const all = buildAdminProductQuery({ inventory: "all" });
  assert.deepEqual(all.filter, {});
  assert.equal(all.inventory, "all");

  const low = buildAdminProductQuery({ inventory: "low_stock" });
  assert.equal(low.filter.$or[0].$and[1].stock.$gte, 1);
  assert.equal(low.filter.$or[0].$and[1].stock.$lte, 5);
  assert.deepEqual(low.filter.$or[1], { variants: { $elemMatch: { stock: { $gte: 1, $lte: 5 } } } });

  const inStock = buildAdminProductQuery({ inventory: "in_stock" });
  assert.equal(inStock.filter.$or[0].$and[1].stock.$gt, 5);
  assert.equal(inStock.filter.$or[1].$and[0].variants.$elemMatch.stock.$gt, 5);
  assert.equal(inStock.filter.$or[1].$and[1].variants.$not.$elemMatch.stock.$lte, 5);
  assert.equal(inStock.filter.$or[1].$and[2].variants.$not.$elemMatch.stock.$exists, false);

  const outOfStock = buildAdminProductQuery({ inventory: "out_of_stock" });
  assert.equal(outOfStock.filter.$or[0].$and[1].stock, 0);
  assert.equal(outOfStock.filter.$or[1].$and[1].variants.$not.$elemMatch.stock.$ne, 0);
  assert.throws(() => buildAdminProductQuery({ inventory: "unknown" }), /valid product inventory filter/);
});

test("inventory composes identically with product search, status, and category filters", () => {
  const input = { search: "shoe", status: "published", category: "Shoes", inventory: "low_stock" };
  const listQuery = buildAdminProductQuery(input);
  const archiveQuery = buildAdminProductQuery(input);

  assert.deepEqual(archiveQuery.filter, listQuery.filter);
  assert.equal(listQuery.filter.$and.length, 4);
  assert.equal(listQuery.inventory, "low_stock");
});

test("all-matching archive requires a positive exact count and detects stale confirmations", () => {
  assert.equal(isValidExpectedProductCount(4), true);
  assert.equal(isValidExpectedProductCount(0), false);
  assert.equal(isValidExpectedProductCount("4"), false);
  assert.equal(isValidExpectedProductCount(Number.MAX_SAFE_INTEGER + 1), false);
  assert.equal(matchesExpectedProductCount(4, 4), true);
  assert.equal(matchesExpectedProductCount(4, 3), false);
});

test("customer order responses omit internal references, claim tokens, and admin notes", () => {
  const view = customerOrderView({
    paymentReminders: [{ claimToken: "secret" }],
    paymentInitiationAt: new Date(),
      paymentTestStatus: "succeeded",
      refundReference: "private-refund-reference",
    paystackReference: "private-provider-reference",
    adminCorrections: [{ reason: "internal note" }],
    paymentAttempts: [{ reference: "visible-for-retry", phone: "254700000000", status: "pending" }],
    additionalPaymentRefunds: [{ reference: "private-ref", refundReference: "refund-ref", amount: 10, status: "refund_pending" }],
    deliveryCorrection: { address: "New address", reason: "internal reason", actor: "admin-id" },
    events: [{ type: "customer_details_corrected", note: "internal change details", actor: "admin-id" }],
  });

  assert.equal("paymentReminders" in view, false);
    assert.equal("paymentTestStatus" in view, false);
    assert.equal("refundReference" in view, false);
  assert.equal("paystackReference" in view, false);
  assert.equal("adminCorrections" in view, false);
  assert.equal(view.paymentAttempts[0].reference, "visible-for-retry");
  assert.equal("phone" in view.paymentAttempts[0], false);
  assert.equal("reference" in view.additionalPaymentRefunds[0], false);
  assert.equal(view.deliveryCorrection.address, "New address");
  assert.equal("reason" in view.deliveryCorrection, false);
  assert.equal(view.events[0].note, "");
  assert.equal("actor" in view.events[0], false);
});

test("shop analytics uses immutable order-item attribution and counts legacy revenue once per order", () => {
  const itemSchema = Order.schema.path("items").schema;
  assert.equal(itemSchema.path("shopId").instance, "ObjectId");
  assert.equal(itemSchema.path("shopId").options.ref, "Shop");
  assert.equal(itemSchema.path("shopId").options.immutable, true);
  assert.equal(itemSchema.path("shopName").options.immutable, true);

  const paidOrderMatch = { paymentStatus: "paid", status: { $nin: ["cancelled"] } };
  const topShopsPipeline = buildTopShopsPipeline(paidOrderMatch);
  assert.deepEqual(topShopsPipeline[0], { $match: paidOrderMatch });
  assert.deepEqual(topShopsPipeline[2], { $match: { "items.shopId": { $ne: null } } });
  assert.equal(topShopsPipeline.some((stage) => stage.$lookup?.from === "products"), false);
  assert.equal(topShopsPipeline.some((stage) => stage.$lookup?.from === "shops"), false);
  assert.equal(topShopsPipeline[3].$group._id, "$items.shopId");
  assert.equal(topShopsPipeline[3].$group.name.$first, "$items.shopName");

  const unattributedPipeline = buildUnattributedShopRevenuePipeline(paidOrderMatch);
  assert.deepEqual(unattributedPipeline[2], { $match: { "items.shopId": null } });
  assert.equal(unattributedPipeline[3].$group._id, "$_id");
  assert.equal(unattributedPipeline[4].$group.orderCount.$sum, 1);
});

test("public checkout destinations omit counties available only through disabled routes", () => {
  assert.deepEqual(getPublicDeliveryCounties({
    deliveryCounties: ["Configured County"],
    deliveryRoutes: [
      { county: "Active County", active: true },
      { county: "Disabled County", active: false },
    ],
  }), ["Nairobi", "Configured County", "Active County"]);
});

test("CBD delivery fee honors the configured free-delivery threshold", () => {
  assert.equal(getCbdDeliveryFee(499, { deliveryFee: 100, freeDeliveryThreshold: 500 }), 100);
  assert.equal(getCbdDeliveryFee(500, { deliveryFee: 100, freeDeliveryThreshold: 500 }), 0);
  assert.equal(getCbdDeliveryFee(5000, { deliveryFee: 100, freeDeliveryThreshold: 0 }), 100);
});

test("invalid negative delivery settings cannot produce a negative fee", () => {
  assert.equal(getCbdDeliveryFee(0, { deliveryFee: -5, freeDeliveryThreshold: -1 }), 0);
});

test("API port defaults safely and rejects invalid listener values", () => {
  assert.equal(getPort(undefined), 5000);
  assert.equal(getPort("8080"), 8080);
  assert.throws(() => getPort("named-pipe"), /PORT must be an integer/);
  assert.throws(() => getPort("70000"), /PORT must be an integer/);
});

test("Kenyan mobile number formats normalize consistently", () => {
  assert.equal(normalizePhone("0712 345 678"), "254712345678");
  assert.equal(normalizePhone("+254 712-345-678"), "254712345678");
  assert.equal(normalizePhone("712345678"), "254712345678");
});

test("CSV exports quote fields and neutralize spreadsheet formulas", () => {
  const csv = toCsv([{ name: '=HYPERLINK("https://example.com")', note: "A, B" }], [
    { label: "Name", value: "name" },
    { label: "Note", value: "note" },
  ]);
  assert.equal(csv, 'Name,Note\r\n"\'=HYPERLINK(""https://example.com"")","A, B"');
});

test("verification-code digests require the configured secret and reject mismatches", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-only-secret-for-otp-unit-checks";
  try {
    const digest = digestOtp("123456");
    assert.equal(verifyOtp("123456", digest), true);
    assert.equal(verifyOtp("654321", digest), false);
    assert.equal(verifyOtp("123456", "not-a-digest"), false);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("publishable products require valid category, image, price, SKU, and stock", () => {
  const product = {
    name: "Everyday bag",
    shop: "shop-id",
    category: "Accessories",
    subcategory: "Bags",
    images: ["https://cdn.example.com/bag.jpg"],
    sku: "BAG-001",
    price: 2500,
    stock: 0,
  };
  assert.deepEqual(validatePublishable(product), []);
  assert.deepEqual(productSkus({ sku: "bag-001", variants: [{ sku: " bag-002 " }] }), ["BAG-001", "BAG-002"]);
  assert.equal(productStatus({ isActive: false }), "draft");
  assert.ok(validatePublishable({ ...product, images: ["javascript:alert(1)"], price: 0, stock: -1 }).length >= 3);
});

test("product schema accepts up to 12 gallery images and rejects larger galleries", async () => {
  const imagePath = Product.schema.path("images");
  const validate = (images) => new Promise((resolve) => imagePath.doValidate(images, (error) => resolve(error || null)));
  assert.equal(await validate(Array.from({ length: 12 }, (_, index) => `https://cdn.example.com/${index}.jpg`)), null);
  assert.match((await validate(Array.from({ length: 13 }, (_, index) => `https://cdn.example.com/${index}.jpg`))).message, /up to 12/);
});

test("product schema exposes managed category and subcategory references", () => {
  assert.equal(Product.schema.path("categoryId").options.ref, "Category");
  assert.equal(Product.schema.path("subcategoryId").instance, "ObjectId");
  assert.equal(Product.schema.path("category").instance, "String");
  assert.equal(Product.schema.path("subcategory").instance, "String");
});

test("WooCommerce product image lists are preserved for review when they exceed the gallery limit", () => {
  const images = Array.from({ length: 13 }, (_, index) => `https://cdn.example.com/${index}.jpg`).join(", ");
  const [entry] = mapWooCommerceRows([{ Name: "Imported item", SKU: "IMPORT-1", Images: images }]);
  assert.equal(entry.product.images.length, 13);
  assert.equal(Product.schema.path("images").validators.some(({ validator }) => validator(entry.product.images)), false);
});

test("WooCommerce imports preserve short and long descriptions separately", () => {
  const [entry] = mapWooCommerceRows([{
    Name: "Imported item",
    "Short description": "<p>Compact summary</p>",
    Description: "<p>Full product details</p><ul><li>First feature</li></ul>",
  }]);
  assert.equal(entry.product.description, "Compact summary");
  assert.equal(entry.product.longDescription, "Full product details First feature");
  assert.equal(Product.schema.path("longDescription").instance, "String");

  const [longOnlyEntry] = mapWooCommerceRows([{
    Name: "Long-only item",
    Description: "<p>Full product details</p>",
  }]);
  assert.equal(longOnlyEntry.product.description, "");
  assert.equal(longOnlyEntry.product.longDescription, "Full product details");
});

test("WooCommerce imports read floor and shop columns for review", () => {
  const [entry] = mapWooCommerceRows([{
    Name: "Wireless speaker",
    floor: "2",
    "Shop Name": "Audio",
  }]);
  assert.deepEqual(entry.product.sourcePlacement, { floor: "2", shop: "Audio" });
});

test("CSV placement suggestions match floor/shop safely and leave ambiguous assignments unresolved", () => {
  const floors = [
    { _id: "floor-1", floorNumber: 1, name: "Fashion" },
    { _id: "floor-2", floorNumber: 2, name: "Electronics" },
  ];
  const shops = [
    { _id: "shop-audio", shopNumber: 1, name: "Audio", floor: { _id: "floor-2" } },
    { _id: "shop-fashion", shopNumber: 1, name: "Audio", floor: { _id: "floor-1" } },
    { _id: "shop-unique", shopNumber: 2, name: "Mobile Zone", floor: { _id: "floor-2" } },
  ];

  assert.deepEqual(suggestImportPlacement({ floor: "Floor 2", shop: "Audio" }, floors, shops), {
    floorId: "floor-2",
    shopId: "shop-audio",
    issue: "",
  });
  assert.deepEqual(suggestImportPlacement({ floor: "", shop: "Mobile Zone" }, floors, shops), {
    floorId: "floor-2",
    shopId: "shop-unique",
    issue: "",
  });
  const ambiguous = suggestImportPlacement({ floor: "", shop: "Audio" }, floors, shops);
  assert.equal(ambiguous.floorId, "");
  assert.equal(ambiguous.shopId, "");
  assert.match(ambiguous.issue, /more than one shop/);

  const mismatch = suggestImportPlacement({ floor: "Unknown floor", shop: "Audio" }, floors, shops);
  assert.equal(mismatch.floorId, "");
  assert.equal(mismatch.shopId, "");
  assert.match(mismatch.issue, /not matched/);
});
