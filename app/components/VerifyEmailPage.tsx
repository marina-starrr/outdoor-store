"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./Auth";
import Icon from "./Icon";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

type State = { kind: "pending" } | { kind: "ok"; isAdmin: boolean } | { kind: "error"; message: string };

/** Сторінка з посилання в листі: /verify-email?token=… */
export default function VerifyEmailPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ kind: "pending" });
  // Токен одноразовий — не надсилаємо двічі (React у розробці запускає ефекти двічі)
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then(async (data) => {
        if (data.user) {
          await refresh();
          setState({ kind: "ok", isAdmin: !!data.user.isAdmin });
        } else setState({ kind: "error", message: data.error ?? "Не вдалося підтвердити email" });
      })
      .catch(() => setState({ kind: "error", message: "Немає з'єднання з сервером. Оновіть сторінку." }));
  }, [refresh]);

  return (
    <div className="flex min-h-screen flex-col bg-[#f7fafc] text-[#082c45]">
      <SiteHeader query={query} onQueryChange={setQuery} onSearchSubmit={(q) => router.push(`/catalog?q=${encodeURIComponent(q)}`)} />
      <main className="flex-1 px-5 py-12">
        <div className="mx-auto max-w-lg rounded-[28px] bg-white p-8 text-center shadow-[0_18px_52px_rgba(79,93,101,.1)] sm:p-10" role="status">
          {state.kind === "pending" ? (
            <>
              <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-[#ffd51f] border-t-transparent" aria-hidden="true" />
              <h1 className="mt-5 text-2xl font-extrabold">Підтверджуємо email…</h1>
            </>
          ) : state.kind === "ok" ? (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e7f7ee] text-[#1f9d55]">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </span>
              <h1 className="mt-5 text-2xl font-extrabold">Email підтверджено</h1>
              <Link
                href={state.isAdmin ? "/admin" : "/account"}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-7 py-3.5 text-sm font-extrabold transition hover:bg-[#ffe044]"
              >
                {state.isAdmin ? "До адмін-панелі" : "До профілю"} <Icon name="arrow" className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#fdecec] text-[#c53035]">
                <Icon name="close" className="h-8 w-8" />
              </span>
              <h1 className="mt-5 text-2xl font-extrabold">Не вдалося підтвердити</h1>
              <p className="mt-2 text-sm text-[#527083]">{state.message}</p>
              <Link href="/account" className="mt-6 inline-flex rounded-full bg-[#eaf3f8] px-7 py-3.5 text-sm font-extrabold text-[#264e65] transition hover:bg-[#d8ecf7]">
                До профілю
              </Link>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
