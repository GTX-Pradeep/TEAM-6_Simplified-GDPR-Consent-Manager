import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { describeError } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { homeFor } from "../auth/roles";
import { AuthCard, FormAlert } from "../components/AuthCard";
import { FormField } from "../components/FormField";

/** FR-2: log in with e-mail and password, then open the home screen of the user's role. */
export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your e-mail address and password.");
      return;
    }
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      navigate(from && from !== "/login" ? from : homeFor(u.role), { replace: true });
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Log in"
      subtitle="Manage your consent choices, policies or audits."
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <FormAlert message={error} />}
        <FormField
          label="E-mail address"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
          {busy ? "Logging in..." : "Log in"}
        </button>
      </form>
    </AuthCard>
  );
}
