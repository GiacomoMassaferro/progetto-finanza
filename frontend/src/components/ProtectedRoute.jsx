import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext.jsx";

// Avvolge le pagine private: senza utente (e finito il loading)
// rimanda al login, altrimenti mostra la pagina.
export default function ProtectedRoute({ children }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  if (loading) {
    return <p className="font-body-md text-body-md text-on-surface-variant p-margin">{t("common.loading")}</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
