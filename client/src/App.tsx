import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

/**
 * Routes. Feature pages are added during the sprints:
 * /login, /register (FR-1, FR-2) · /dashboard (FR-4, FR-7, FR-8) · /policy (FR-5)
 * /history (FR-12) · /admin/* (FR-6, FR-13, FR-14, SEC-4) · /dpo/* (FR-18 to FR-20)
 */
export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}
