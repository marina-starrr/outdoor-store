"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useAuth } from "./Auth";
import { Field, FormError, PasswordInput, SubmitButton } from "./form-ui";
import Icon from "./Icon";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

const noSubscribe = () => () => {};

/** Сторінка з посилання в листі «Відновлення пароля»: /reset-password?token=… */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [query, setQuery] = useState("");
  // Токен читаємо в браузері: сторінка статична, а адреса з листа містить ?token= (на сервері — null)
  const token = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("token") ?? "",
    () => null,
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Щонайменше 8 символів");
    setPending(true);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Не вдалося змінити пароль. Спробуйте ще раз.");
        return;
      }
      // Пароль змінено — одразу входимо (кошик цього браузера додасться до акаунта)
      await login(data.email, password);
      setDone(true);
    } catch {
      setError("Немає з'єднання з сервером. Спробуйте ще раз.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f7fafc] text-[#082c45]">
      <SiteHeader query={query} onQueryChange={setQuery} onSearchSubmit={(q) => router.push(`/catalog?q=${encodeURIComponent(q)}`)} />
      <main className="flex-1 px-4 py-10 sm:px-5 sm:py-12">
        <div className="mx-auto max-w-lg rounded-[28px] bg-white p-6 shadow-[0_18px_52px_rgba(79,93,101,.1)] sm:p-10">
          {done ? (
            <div className="text-center" role="status">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e7f7ee] text-[#1f9d55]">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </span>
              <h1 className="mt-5 text-2xl font-extrabold">Пароль змінено</h1>
              <p className="mt-2 text-sm text-[#527083]">Ви вже увійшли. На інших пристроях потрібно буде увійти з новим паролем.</p>
              <Link href="/account" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-7 py-3.5 text-sm font-extrabold transition hover:bg-[#ffe044]">
                До профілю <Icon name="arrow" className="h-4 w-4" />
              </Link>
            </div>
          ) : token === "" ? (
            <div className="text-center">
              <h1 className="text-2xl font-extrabold">Посилання неповне</h1>
              <p className="mt-2 text-sm text-[#527083]">Відкрийте посилання з листа повністю або запросіть новий лист на сторінці входу.</p>
              <Link href="/account" className="mt-6 inline-flex rounded-full bg-[#eaf3f8] px-7 py-3.5 text-sm font-extrabold text-[#264e65] transition hover:bg-[#d8ecf7]">
                До входу
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="grid gap-4">
              <div>
                <h1 className="text-2xl font-extrabold">Новий пароль</h1>
                <p className="mt-1 text-sm text-[#527083]">Придумайте пароль, яким будете входити далі.</p>
              </div>
              <FormError>{error}</FormError>
              <Field id="reset-password" label="Новий пароль" hint="Щонайменше 8 символів">
                <PasswordInput id="field-reset-password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
              </Field>
              <SubmitButton pending={pending || token === null}>Зберегти пароль</SubmitButton>
              <Link href="/account" className="py-1.5 text-center text-sm font-bold text-[#098fd0] hover:underline">
                Запросити новий лист
              </Link>
            </form>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
