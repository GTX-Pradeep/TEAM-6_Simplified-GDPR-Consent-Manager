import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { describeError } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { homeFor } from "../auth/roles";
import { AuthCard, FormAlert } from "../components/AuthCard";
import { FormField } from "../components/FormField";

type Fields = { name: string; email: string; password: string; confirm: string };
type Errors = Partial<Record<keyof Fields, string>>;

/** Same rules as the API (SEC-1), checked here first for quick feedback. */
export function validate(f: Fields): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = "Name is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Enter a valid e-mail address";
  if (f.password.length < 8) e.password = "Password must be at least 8 characters";
  if (f.confirm !== f.password) e.confirm = "Passwords do not match";
  return e;
}

/** FR-1: self-registration; every new account gets the User role. */
export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState<Fields>({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const set = (k: keyof Fields) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    const found = validate(f);
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const u = await register(f.name.trim(), f.email.trim(), f.password);
      navigate(homeFor(u.role), { replace: true });
    } catch (err) {
      const { message, fields } = describeError(err);
      setErrors(fields as Errors);
      setAlert(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="You decide which processing purposes you agree to. Nothing is pre-selected."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {alert && <FormAlert message={alert} />}
        <FormField label="Full name" autoComplete="name" value={f.name} onChange={set("name")} error={errors.name} />
        <FormField
          label="E-mail address"
          type="email"
          autoComplete="email"
          value={f.email}
          onChange={set("email")}
          error={errors.email}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={f.password}
          onChange={set("password")}
          error={errors.password}
          hint="At least 8 characters"
        />
        <FormField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={f.confirm}
          onChange={set("confirm")}
          error={errors.confirm}
        />
        <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
          {busy ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthCard>
  );
}
