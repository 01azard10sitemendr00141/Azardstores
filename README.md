# ShopRight Mall

A digital shopping mall, structured like a real one: **Floors → Shops → Products**.
Single owner (you) for now — built to later seed Click Haven Mall (multi-vendor) when you're ready.

## Project structure

```
shopright/
  backend/    Express + MongoDB API
  frontend/   React + Vite + Tailwind storefront
```

## 1. Backend setup

```bash
cd backend
cp .env.example .env       # then fill in MONGO_URI and JWT_SECRET
npm install
npm run seed                # populates 10 floors, 5 shops, 6 sample products + admin user
npm run dev                 # starts API on http://localhost:5000
```

Default admin login (created by the seed script):
- Email: `admin@shopright.co.ke`
- Password: `Admin123!`

You'll need either a local MongoDB running (`mongodb://localhost:27017/shopright`) or a free
MongoDB Atlas connection string pasted into `MONGO_URI`.

## 2. Frontend setup

```bash
cd frontend
npm install
npm run dev                 # starts the storefront on http://localhost:5173
```

The frontend proxies `/api` and `/uploads` requests to `http://localhost:5000` automatically
(see `vite.config.js`), so just make sure the backend is running first.

## What's built so far

- **Backend**: Floor, Shop, Product, User, Order models. Full auth (signup/login/forgot/reset
  password, JWT). Product filtering by shop/floor/purpose/badge/flash-sale/search. Order creation
  for both logged-in users and guests, with WhatsApp or cart as the channel. Image upload via
  multer. Role-protected admin routes.
- **Frontend**: Homepage (hero, flash sale, best sellers, browse-by-floor), Mall Directory page,
  Floor pages, Shop storefront pages, Product detail pages, mall-wide Search, Cart + checkout
  (guest or logged-in), Login/Signup/Forgot/Reset password, customer Dashboard (order history).

## Not yet built

- Admin dashboard UI (the API routes exist — `POST/PUT/DELETE` on `/api/floors`, `/api/shops`,
  `/api/products` — but there's no admin-facing screen yet to use them from)
- Email sending for password reset (currently just logs the token to the server console)
- Live socket.io features (wired up in `server.js` but not yet used anywhere)

## Notes

- Product images: until you upload real images via the (future) admin panel, products will show
  a "No image yet" placeholder. You can also `POST` directly to `/api/products` with `admin`
  credentials and image files to test uploads now.
- Shop numbers are unique **per floor**, not mall-wide — Shop #1 can exist on multiple floors.
- WhatsApp number is currently a placeholder (`254742606408`) — update it in
  `frontend/src/components/ProductCard.jsx` and `frontend/src/pages/Product.jsx`, and in
  `backend/.env.example` for reference.
