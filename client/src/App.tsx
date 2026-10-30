import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { AdminPoliciesPage } from "./pages/AdminPoliciesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DpoConsolePage } from "./pages/DpoConsolePage";
import HistoryPage from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PolicyPage } from "./pages/PolicyPage";
import { RegisterPage } from "./pages/RegisterPage";

/** Routes. Each screen is guarded by role; the API checks the role again on every request. */
export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth roles={["USER"]}>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/history"
            element={
              <RequireAuth roles={["USER"]}>
                <HistoryPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth roles={["ADMIN"]}>
                <AdminPoliciesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/policy"
            element={
              <RequireAuth>
                <PolicyPage />
              </RequireAuth>
            }
          />
          <Route
            path="/dpo"
            element={
              <RequireAuth roles={["DPO"]}>
                <DpoConsolePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}

