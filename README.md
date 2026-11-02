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