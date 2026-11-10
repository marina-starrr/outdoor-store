"use client";

import { useState } from "react";
import { useAuth } from "./Auth";
import {
  Field,
  FormError,
  PasswordInput,
  SubmitButton,
  formatPhone,
  inputCls,
  isPhoneComplete,
} from "./form-ui";

type Mode = "login" | "register";

/** Вкладки «Вхід» / «Реєстрація». Використовуються в профілі та при оформленні замовлення */
export default function AuthForms({
  initialMode = "login",
  onSuccess,
}: {
  initialMode?: Mode;
  onSuccess?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div>
      <div role="tablist" aria-label="Вхід або реєстрація" className="grid grid-cols-2 rounded-full bg-[#eef6fb] p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full py-2.5 text-sm font-extrabold transition ${
              mode === m ? "bg-white text-[#082c45] shadow-[0_4px_14px_rgba(79,93,101,.12)]" : "text-[#527083] hover:text-[#082c45]"
            }`}
          >
            {m === "login" ? "Вхід" : "Реєстрація"}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {mode === "login" ? (
          <LoginForm onSuccess={onSuccess} onSwitch={() => setMode("register")} />
        ) : (
          <RegisterForm onSuccess={onSuccess} onSwitch={() => setMode("login")} />
        )}
      </div>
    </div>
  );
}

function LoginForm({ onSuccess, onSwitch }: { onSuccess?: () => void; onSwitch: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError("Введіть email і пароль");
    setPending(true);
    const result = await login(email.trim(), password);
    setPending(false);
    if (result.error) setError(result.error);
    else onSuccess?.();
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <FormError>{error}</FormError>
      <Field id="login-email" label="Email">
        <input id="field-login-email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} className={inputCls()} placeholder="you@example.com" />
      </Field>
      <Field id="login-password" label="Пароль">
        <PasswordInput id="field-login-password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
      </Field>
      <SubmitButton pending={pending}>Увійти</SubmitButton>
      <p className="text-center text-sm text-[#527083]">
        Ще немає акаунта?{" "}
        <button type="button" onClick={onSwitch} className="font-bold text-[#098fd0] hover:underline">
          Зареєструватися
        </button>
      </p>
    </form>
  );
}

function RegisterForm({
  onSuccess,
  onSwitch,
}: {
  onSuccess?: () => void;
  onSwitch: () => void;
}) {
  const { register } = useAuth();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "+380 ", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (form.firstName.trim().length < 2) found.firstName = "Вкажіть ім'я";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) found.email = "Перевірте email";
    if (!isPhoneComplete(form.phone)) found.phone = "Номер у форматі +380 XX XXX XX XX";
    if (form.password.length < 8) found.password = "Щонайменше 8 символів";
    setErrors(found);
    if (Object.keys(found).length) return;

    setPending(true);
    const result = await register({ ...form, email: form.email.trim() });
    setPending(false);
    if (result.error) setError(result.error);
    else onSuccess?.();
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <FormError>{error}</FormError>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="reg-firstName" label="Ім'я" error={errors.firstName}>
          <input id="field-reg-firstName" autoComplete="given-name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls(errors.firstName)} />
        </Field>
        <Field id="reg-lastName" label="Прізвище" optional>
          <input id="field-reg-lastName" autoComplete="family-name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls()} />
        </Field>
      </div>
      <Field id="reg-email" label="Email" error={errors.email}>
        <input id="field-reg-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls(errors.email)} placeholder="you@example.com" />
      </Field>
      <Field id="reg-phone" label="Телефон" error={errors.phone}>
        <input id="field-reg-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} className={inputCls(errors.phone)} />
      </Field>
      <Field id="reg-password" label="Пароль" error={errors.password} hint="Щонайменше 8 символів">
        <PasswordInput id="field-reg-password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} error={errors.password} />
      </Field>
      <SubmitButton pending={pending}>Створити акаунт</SubmitButton>
      <p className="text-center text-sm text-[#527083]">
        Вже маєте акаунт?{" "}
        <button type="button" onClick={onSwitch} className="font-bold text-[#098fd0] hover:underline">
          Увійти
        </button>
      </p>
    </form>
  );
}
