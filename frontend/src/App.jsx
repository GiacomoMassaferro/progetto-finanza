import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Categories from "./pages/Categories.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Debts from "./pages/Debts.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Savings from "./pages/Savings.jsx";
import Transactions from "./pages/Transactions.jsx";

// Router: /login e /register pubbliche, il resto protetto.
function Private({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Private><Dashboard /></Private>} />
          <Route path="/debts" element={<Private><Debts /></Private>} />
          <Route path="/transactions" element={<Private><Transactions /></Private>} />
          <Route path="/savings" element={<Private><Savings /></Private>} />
          <Route path="/categories" element={<Private><Categories /></Private>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
