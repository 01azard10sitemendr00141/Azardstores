import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function CustomerAccountRoute({ children }) {
  const { user } = useAuth();

  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  return children;
}
