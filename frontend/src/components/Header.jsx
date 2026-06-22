import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { totalItems } = useCart();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/search?q=${encodeURIComponent(search.trim())}`);
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-mall-900 text-cream border-b border-mall-700">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
        <Link to="/" className="font-display text-2xl font-bold tracking-tight whitespace-nowrap">
          ShopRight <span className="text-mall-accent">Mall</span>
        </Link>

        <Link to="/directory" className="hidden md:inline text-sm font-medium hover:text-mall-accent transition">
          Mall Directory
        </Link>

        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the whole mall..."
            className="w-full px-4 py-2 rounded-full bg-mall-800 text-cream placeholder-cream/50 text-sm outline-none focus-visible:ring-2 focus-visible:ring-mall-accent"
          />
        </form>

        <div className="flex items-center gap-4 ml-auto">
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <Link to="/dashboard" className="hover:text-mall-accent transition">
                Hi, {user.name.split(" ")[0]}
              </Link>
              <button onClick={logout} className="text-cream/60 hover:text-mall-accent transition">
                Log out
              </button>
            </div>
          ) : (
            <Link to="/login" className="text-sm font-medium hover:text-mall-accent transition">
              Log in
            </Link>
          )}

          <Link to="/cart" className="relative">
            <span aria-hidden="true" className="text-xl">🛍️</span>
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-mall-accent text-mall-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
