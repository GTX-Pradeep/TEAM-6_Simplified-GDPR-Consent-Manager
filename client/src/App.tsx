import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RegisterPage } from "./pages/RegisterPage";
import { RoleHomePage } from "./pages/RoleHomePage";

/**
 * Routes. Still to come: /policy (FR-5) · /history (FR-12) · /admin/* (FR-6, FR-13, FR-14, SEC-4)
 * · /dpo/* (FR-18 to FR-20)
 */
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
                <RoleHomePage title="Welcome" comingIn="issue #9 (Consent Dashboard)" />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth roles={["ADMIN"]}>
                <RoleHomePage title="Admin console" comingIn="issue #12 (policy editor)" />
              </RequireAuth>
            }
          />
          <Route
            path="/dpo"
            element={
              <RequireAuth roles={["DPO"]}>
                <RoleHomePage title="DPO console" comingIn="Sprint 2 (issue #22)" />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}
