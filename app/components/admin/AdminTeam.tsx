"use client";

import { useState } from "react";
import { inputCls } from "../form-ui";
import Icon from "../Icon";
import AdminShell, { LoadError, Panel } from "./AdminShell";
import { ApiError, adminFetch, useAdminData } from "./api";

type Member = {
  email: string;
  name?: string;
  role: "owner" | "admin";
  status: "active" | "unverified" | "invited";
};
type Team = { team: Member[]; canManage: boolean };

const statusInfo: Record<Member["status"], [string, string]> = {
  active: ["Має доступ", "bg-[#e7f7ee] text-[#1f9d55]"],
  unverified: ["Чекає підтвердження email", "bg-[#fff4c2] text-[#8a6100]"],
  invited: ["Ще не зареєструвався", "bg-[#eef6fb] text-[#527083]"],
};

export default function AdminTeam() {
  return (
    <AdminShell title="Адміністратори">
      <TeamView />
    </AdminShell>
  );
}

function TeamView() {
  const { data, error, reload, setData } = useAdminData<Team>("/api/admin/team");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return <Panel><p className="text-sm text-[#527083]">Завантаження…</p></Panel>;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) return setNotice({ ok: false, text: "Перевірте email" });
    setBusy("add");
    setNotice(null);
    try {
      const r = await adminFetch<Team & { registered: boolean; mailed: boolean }>("/api/admin/team", { method: "POST", body: { email: value } });
      setData({ team: r.team, canManage: r.canManage });
      setEmail("");
      setNotice({
        ok: true,
        text:
          (r.registered
            ? `${value} тепер адміністратор. Доступ відкриється, щойно цей email буде підтверджено.`
            : `${value} ще не має акаунта — права з'являться, коли людина зареєструється з цією адресою й підтвердить її.`) +
          (r.mailed ? " Ми надіслали лист з інструкцією." : " Лист не надіслано (пошта не налаштована) — повідомте людину самі."),
      });
    } catch (err) {
      setNotice({ ok: false, text: (err as ApiError).message });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (m: Member) => {
    setBusy(m.email);
    setNotice(null);
    try {
      const r = await adminFetch<Team>(`/api/admin/team?email=${encodeURIComponent(m.email)}`, { method: "DELETE" });
      setData(r);
      setNotice({ ok: true, text: `${m.email} більше не адміністратор` });
    } catch (err) {
      setNotice({ ok: false, text: (err as ApiError).message });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <div className="grid gap-5">
      {data.canManage ? (
        <Panel>
          <h2 className="text-lg font-extrabold">Додати адміністратора</h2>
          <p className="mt-1 text-sm text-[#527083]">
            Вкажіть email людини. Якщо в неї ще немає акаунта — хай зареєструється на сайті саме з цією адресою.
            Адмін-панель відкриється після підтвердження email за посиланням з листа.
          </p>
          <form onSubmit={add} noValidate className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label htmlFor="team-email" className="sr-only">Email нового адміністратора</label>
            <input
              id="team-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setNotice(null); }}
              placeholder="name@example.com"
              className={`${inputCls()} sm:flex-1`}
            />
            <button
              type="submit"
              disabled={busy === "add"}
              className="rounded-full bg-[#ffd51f] px-7 py-3 text-sm font-extrabold transition hover:bg-[#ffe044] disabled:opacity-60"
            >
              {busy === "add" ? "Додаємо…" : "Додати"}
            </button>
          </form>
        </Panel>
      ) : (
        <Panel>
          <p className="text-sm text-[#527083]">Додавати й прибирати адміністраторів може лише власник магазину.</p>
        </Panel>
      )}

      {notice && (
        <p role="status" className={`rounded-2xl px-4 py-3 text-sm font-semibold ${notice.ok ? "bg-[#e7f7ee] text-[#1f7a45]" : "bg-[#fdecec] text-[#c53035]"}`}>
          {notice.text}
        </p>
      )}

      <Panel>
        <h2 className="text-lg font-extrabold">Хто має доступ</h2>
        <ul className="mt-4 divide-y divide-[#e3edf3]">
          {data.team.map((m) => {
            const [label, cls] = statusInfo[m.status];
            return (
              <li key={m.email} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eef6fb] text-[#067eb7]">
                  <Icon name={m.role === "owner" ? "shield" : "user"} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{m.name ?? m.email}</p>
                  {m.name && <p className="truncate text-sm text-[#527083]">{m.email}</p>}
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 pl-14 sm:w-auto sm:pl-0">
                  {m.role === "owner" && <span className="rounded-full bg-[#082c45] px-2.5 py-1 text-xs font-bold text-white">Власник</span>}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{label}</span>
                  {data.canManage && m.role === "admin" && (
                    confirming === m.email ? (
                      <span className="flex items-center gap-1.5">
                        <button type="button" onClick={() => remove(m)} disabled={busy === m.email} className="rounded-full bg-[#e5484d] px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-[#c53035] disabled:opacity-60">
                          Так, прибрати
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="rounded-full px-3 py-2 text-xs font-bold text-[#527083] hover:bg-[#eef6fb]">
                          Ні
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirming(m.email)} className="rounded-full px-3.5 py-2 text-xs font-bold text-[#c53035] transition hover:bg-[#fdecec]">
                        Прибрати
                      </button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-[#8aa5b5]">
          Власника задано в налаштуваннях сайту (Vercel → ADMIN_EMAILS) — з панелі його не прибрати. Інші адміністратори керують товарами,
          замовленнями, чатом і відгуками, але не можуть додавати адміністраторів.
        </p>
      </Panel>
    </div>
  );
}
