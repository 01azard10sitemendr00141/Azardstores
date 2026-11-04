require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Product = require("../models/Product");
const { createInitialInventoryHistory } = require("./inventoryHistory");

async function backfillInventoryHistory({ apply = false } = {}) {
  const products = await Product.find()
    .select("stock variants._id variants.name variants.stock updatedAt +inventoryHistory")
    .lean();
  const operations = [];
  let noConfirmedStock = 0;

  for (const product of products) {
    if (product.inventoryHistory?.length) continue;
    const entries = createInitialInventoryHistory(product, "baseline", "history-backfill");
    if (!entries.length) {
      noConfirmedStock += 1;
      continue;
    }
    operations.push({
      updateOne: {
        filter: {
          _id: product._id,
          updatedAt: product.updatedAt,
          $or: [{ inventoryHistory: { $exists: false } }, { inventoryHistory: { $size: 0 } }],
        },
        update: { $set: { inventoryHistory: entries } },
      },
    });
  }

  let updated = operations.length;
  if (apply && operations.length) {
    const result = await Product.bulkWrite(operations, { ordered: false });
    updated = result.modifiedCount;
  }
  return { apply, scanned: products.length, updated, noConfirmedStock };
}

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();
  const result = await backfillInventoryHistory({ apply });
  console.log(`${result.apply ? "Applied" : "Dry run"}: scanned ${result.scanned} products; ${result.updated} history baselines ${result.apply ? "written" : "to write"}; ${result.noConfirmedStock} products have no confirmed stock.`);
  if (!apply) console.log("No changes were made. Run with --apply to record current inventory as the tracking baseline.");
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error("Inventory history backfill failed:", error.message);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { backfillInventoryHistory };
