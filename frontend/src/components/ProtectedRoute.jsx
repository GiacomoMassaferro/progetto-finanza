import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

// Avvolge le pagine private: senza utente (e finito il loading)
// rimanda al login, altrimenti mostra la pagina.
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <p className="font-body-md text-body-md text-on-surface-variant p-margin">Caricamento…</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
