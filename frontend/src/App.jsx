import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import Layout from "./components/Layout";
import ScrollToTop from "./components/ScrollToTop";
import MaintenancePage from "./components/MaintenancePage";
import PageMetadata from "./components/PageMetadata";
import { useSettings } from "./context/SettingsContext";
const Home = lazy(() => import("./pages/Home"));
const Directory = lazy(() => import("./pages/Directory"));
const Floor = lazy(() => import("./pages/Floor"));
const Shop = lazy(() => import("./pages/Shop"));
const Product = lazy(() => import("./pages/Product"));
const Search = lazy(() => import("./pages/Search"));
const Cart = lazy(() => import("./pages/Cart"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const PaymentCallback = lazy(() => import("./pages/PaymentCallback"));
const TrackOrder = lazy(() => import("./pages/TrackOrder"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AttributeProducts = lazy(() => import("./pages/AttributeProducts"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Contact = lazy(() => import("./pages/Contact"));
const Returns = lazy(() => import("./pages/Returns"));
const Delivery = lazy(() => import("./pages/Delivery"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Cookies = lazy(() => import("./pages/Cookies"));
const NotFound = lazy(() => import("./pages/NotFound"));
import AdminRoute from "./components/AdminRoute";
import AdminLayout from "./components/AdminLayout";
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminFloors = lazy(() => import("./pages/admin/AdminFloors"));
const AdminShops = lazy(() => import("./pages/admin/AdminShops"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminBrands = lazy(() => import("./pages/admin/AdminBrands"));
const AdminBadges = lazy(() => import("./pages/admin/AdminBadges"));
const AdminHomeSections = lazy(() => import("./pages/admin/AdminHomeSections"));
const AdminHomepageStudio = lazy(() => import("./pages/admin/AdminHomepageStudio"));
const AdminHero = lazy(() => import("./pages/admin/AdminHero"));
const AdminHomeContent = lazy(() => import("./pages/admin/AdminHomeContent"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminDelivery = lazy(() => import("./pages/admin/AdminDelivery"));

function PublicLayout() {
  return <Layout><Outlet /></Layout>;
}

function LegacyTaxonomyRoute({ toPrefix }) {
  const { name = "" } = useParams();
  return <Navigate to={`${toPrefix}/${encodeURIComponent(name)}`} replace />;
}

export default function App() {
  const { settings } = useSettings();
  const location = useLocation();

  // Maintenance mode blocks every public route, but never the admin panel
  // or login — otherwise whoever turned it on would have no way back in.
  const isAdminOrLogin = location.pathname.startsWith("/admin") || location.pathname === "/login";
  if (settings.maintenanceMode && !isAdminOrLogin) {
    return <MaintenancePage />;
  }

  return (
    <>
      <PageMetadata />
      <ScrollToTop />
      <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-mall-accent/30 border-t-mall-accent" aria-label="Loading page" /></div>}>
      <Routes>
        <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/directory" element={<Directory />} />
        <Route path="/floor/:slug" element={<Floor />} />
        <Route path="/shop/:slug" element={<Shop />} />
        <Route path="/product/:slug" element={<Product />} />
        <Route path="/search" element={<Search />} />
        <Route path="/brand/:name" element={<AttributeProducts attribute="brand" label="Brand" />} />
        {/* Redirect older URLs to the explicit taxonomy routes. */}
        <Route path="/category/:name" element={<LegacyTaxonomyRoute toPrefix="/subcategory" />} />
        <Route path="/subcategory/:name" element={<AttributeProducts attribute="subcategory" label="Subcategory" />} />
        <Route path="/categories/:name" element={<AttributeProducts attribute="category" label="Category" />} />
        <Route path="/categories/:category/subcategories/:name" element={<AttributeProducts attribute="subcategory" parentAttribute="category" label="Subcategory" />} />
        <Route path="/collection/:name" element={<LegacyTaxonomyRoute toPrefix="/categories" />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/order-success" element={<OrderSuccess />} />
        <Route path="/payment/callback" element={<PaymentCallback />} />
        <Route path="/track-order" element={<TrackOrder />} />
        <Route path="/track-order/:id" element={<TrackOrder />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/wishlist" element={<Navigate to="/dashboard#wishlist" replace />} />
        <Route path="/account" element={<Navigate to="/dashboard#settings" replace />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/delivery" element={<Delivery />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="*" element={<NotFound />} />
        </Route>
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<AdminOverview />} />
          <Route path="floors" element={<AdminFloors />} />
          <Route path="shops" element={<AdminShops />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="brands" element={<AdminBrands />} />
          <Route path="badges" element={<AdminBadges />} />
          <Route path="homepage" element={<AdminHomepageStudio />} />
          <Route path="home-sections" element={<AdminHomeSections />} />
          <Route path="homepage/sections" element={<AdminHomeSections />} />
          <Route path="hero" element={<AdminHero />} />
          <Route path="home-content" element={<AdminHomeContent />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="delivery" element={<AdminDelivery />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="analytics" element={<AdminAnalytics />} />
        </Route>
      </Routes>
      </Suspense>
    </>
  );
}
