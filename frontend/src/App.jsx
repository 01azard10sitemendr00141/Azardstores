import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Directory from "./pages/Directory";
import Floor from "./pages/Floor";
import Shop from "./pages/Shop";
import Product from "./pages/Product";
import Search from "./pages/Search";
import Cart from "./pages/Cart";
import OrderSuccess from "./pages/OrderSuccess";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/directory" element={<Directory />} />
        <Route path="/floor/:slug" element={<Floor />} />
        <Route path="/shop/:slug" element={<Shop />} />
        <Route path="/product/:slug" element={<Product />} />
        <Route path="/search" element={<Search />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/order-success" element={<OrderSuccess />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<p className="text-center py-16 text-mall-900/40">Page not found.</p>} />
      </Routes>
    </Layout>
  );
}
