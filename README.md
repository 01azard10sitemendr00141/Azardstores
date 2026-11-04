Configure the real domain, HTTPS, API URL, Socket.IO URL, and production environment variables.
Deploy the frontend and backend.
Connect MongoDB production database.
Configure Paystack/M-Pesa and test one complete payment.
Configure SMTP and test order, reset-password, and verification emails.
Test one full customer order from checkout to delivery/tracking.
Test cancellation, unavailable products, returns, and Store Balance.
Set up database backups and perform one restore test.
Submit the sitemap to Google Search Console.
Test the live site on mobile and desktop.
Run PageSpeed Insights and Google Rich Results Test.
Replace or verify all demo catalog content, images, prices, stock, and contact details.

## Product catalog assignments

Products belong to one shop. A shop belongs to one floor, so the product's floor is derived through its shop rather than stored twice. In Admin → Products, choose the floor first; the shop list is then limited to shops on that floor. Categories and subcategories are selected from the managed list and stored by ID, while their names remain available for existing storefront routes and filters.

CSV imports use the same assignments in the row review step. Choose a floor and then a shop for each row, check the managed category/subcategory mapping, and confirm the import. New CSV products start as drafts unless explicitly published. CSVs may include `Floor` (or `Floor Name` / `Floor Number`) and `Shop` (or `Shop Name`) columns; exact matches to active floors and shops are suggested in review. A shop name that matches more than one shop needs a floor to disambiguate it, and unmatched values must be resolved manually.

For larger imports, select rows and apply a shared floor/shop, or map a CSV category label to a managed category/subcategory across all matching rows. Category mappings can be reused for future imports in the same browser. Bulk actions only update the review; ambiguous locations still require manual selection and every row is validated before commit. Admin Products also supports floor and shop filters.

Existing products can be linked to managed category records with a dry run before writing anything. From the repository root, run:

```powershell
cd backend
npm run migrate:catalog-taxonomy
```

Review the unmatched products, back up the database, and then apply successful name matches with:

```powershell
npm run migrate:catalog-taxonomy -- --apply
```

The migration does not rename products or modify their category text. Products with ambiguous or unmatched taxonomy need manual review.

Brands use the same managed-reference model: products store `brandId` and retain the brand name as a compatibility value. New manual and CSV assignments must select a managed brand. Brand rename/delete is blocked while products still use that brand. The migration links exact managed-name matches and proposes managed brand records for distinct legacy names, without guessing through ambiguous names. Review its dry-run output and back up the database before applying:

```powershell
cd backend
npm run migrate:product-brands
npm run migrate:product-brands -- --apply
```

Inventory changes are recorded with the product (including variants) and the most recent 100 movements are retained. Existing products can be given a non-destructive starting baseline after reviewing the dry run:

```powershell
cd backend
npm run backfill:inventory-history
npm run backfill:inventory-history -- --apply
```

The history includes that baseline, initial stock, manual and bulk edits, CSV updates, order reservations, and stock releases/restorations. Admin Products can record a restock for a product or variant with a required quantity and reason. Each product and variant has a reorder level (default 5); the “At or below reorder level” filter includes confirmed zero stock. Product CSV exports include reorder levels, and imports can set them for products and variants. Unknown stock is not treated as zero.

Order cancellation releases stock only while the order's reservation is still held. Once inventory has been committed to fulfillment, a cancellation does not put shipped goods back into sellable stock. Record any received and inspected goods through the restock workflow with a clear reason. Return and cancellation payments are handled through the existing Store Balance workflow; cash refunds are not offered.

When completing an approved return or exchange, admins record how many units are sellable, damaged, or discarded. Only sellable units are added back to product or variant stock; the full inspection disposition is recorded in inventory history, and interrupted processing can be safely retried.

Admins can also create supplier purchase orders from Admin → Purchase Orders. Each order records its supplier, receiving shop, expected delivery, item quantities, and unit costs. Deliveries can be received in partial shipments; receiving updates only the selected product or variant at that shop and adds a purchase-order/receipt reference to inventory history. If a stock update is interrupted, retry the saved receipt instead of entering it again.

Products keep one customer-facing listing while stock can be held at multiple active shops. Checkout allocates confirmed stock primary-shop-first, then across other active locations; if a line spans shops, the order records separate fulfillment lines so reservation, cancellation, fulfillment, and return handling remain shop-specific. Storefront stock totals include only active shops, and unconfirmed stock is never treated as zero.

Admins can record a restock at a selected shop, transfer stock between shops, and reconcile a physical count in Admin → Stock Operations. Transfers write paired source/destination history entries. Counts use the expected quantity shown when the count was started and reject stale edits or locations with active reservations. Transfer and count idempotency keys are stored separately from bounded inventory history. These operations require MongoDB transaction support (a replica set or sharded cluster). Changing a product's catalog shop is blocked while any location has stock; transfer or reconcile inventory first.

Run the multi-shop database integration tests from the backend directory with `npm run test:integration`. They use an isolated in-memory MongoDB replica set, downloading the MongoDB binary on the first run; no production database is needed. The tests cover transfers, stock counts, durable idempotency, concurrent transfers and reservations, and secondary-shop variant reservation/release.

Admin Products flags products with incomplete publish requirements, possible same-name/same-brand duplicates in one shop, and drafts or confirmed out-of-stock listings for review. These are review suggestions only; products are never archived automatically.