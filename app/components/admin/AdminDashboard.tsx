"use client";

import Link from "next/link";
import { useState } from "react";
import Icon, { type IconName } from "../Icon";
import { categoryBySlug, formatPrice } from "../catalog-data";
import { orderStatusInfo, statusLabel, type OrderStatusId } from "../../lib/order-status";
import AdminShell, { LoadError, Panel, type AdminSummary } from "./AdminShell";
import { adminFetch, shortDate, useAdminData } from "./api";
import type { AdminOrder } from "./AdminOrders";

export default function AdminDashboard() {
  return (
    <AdminShell title="Огляд">
      <Dashboard />
    </AdminShell>
  );
}

function Dashboard() {
  const summary = useAdminData<AdminSummary>("/api/admin/summary");
  const orders = useAdminData<{ orders: AdminOrder[] }>("/api/admin/orders");
  const [restocking, setRestocking] = useState<string | null>(null);

  if (summary.error) return <LoadError message={summary.error} onRetry={summary.reload} />;
  const s = summary.data;

  const restock = async (id: string, current: number) => {
    setRestocking(id);
    try {
      await adminFetch(`/api/admin/products/${id}`, { method: "PATCH", body: { stock: current + 10 } });
      summary.reload();
    } finally {
      setRestocking(null);
    }
  };

  const stats: { icon: IconName; label: string; value: string; note: string; href: string; accent?: boolean }[] = s
    ? [
        { icon: "package", label: "Нові замовлення", value: String(s.orders.byStatus.new ?? 0), note: `усього ${s.orders.total}`, href: "/admin/orders?status=new", accent: (s.orders.byStatus.new ?? 0) > 0 },
        { icon: "card", label: "Виручка за 30 днів", value: formatPrice(s.revenue.last30), note: `${s.revenue.count30} замовлень`, href: "/admin/orders" },
        { icon: "tent", label: "Товари на сайті", value: String(s.products.visible), note: `${s.products.outOfStock} немає в наявності`, href: "/admin/products" },
        { icon: "chat", label: "Нові звернення", value: String(s.messages.unread), note: `покупців: ${s.customers}`, href: "/admin/messages", accent: s.messages.unread > 0 },
      ]
    : [];

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {s
          ? stats.map((st) => (
              <Link
                key={st.label}
                href={st.href}
                className={`group rounded-[22px] p-5 shadow-[0_10px_30px_rgba(79,93,101,.08)] transition hover:-translate-y-0.5 ${st.accent ? "bg-[#ffd51f]" : "bg-white"}`}
              >
                <span className={`grid h-11 w-11 place-items-center rounded-2xl ${st.accent ? "bg-white text-[#082c45]" : "bg-[#eef6fb] text-[#067eb7]"}`}>
                  <Icon name={st.icon} className="h-5 w-5" />
                </span>
                <span className="mt-4 block text-sm font-bold text-[#527083] group-hover:text-[#082c45]">{st.label}</span>
                <span className="mt-1 block text-3xl font-black tracking-[-0.03em]" data-testid={`stat-${st.label}`}>{st.value}</span>
                <span className="mt-1 block text-xs text-[#527083]">{st.note}</span>
              </Link>
            ))
          : Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[158px] animate-pulse rounded-[22px] bg-white" />)}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold">Закінчуються на складі</h2>
            <Link href="/admin/products?stock=low" className="text-sm font-bold text-[#098fd0] hover:underline">Усі</Link>
          </div>
          {s && s.products.lowStock.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-[#e7f7ee] px-4 py-3 text-sm font-semibold text-[#1f9d55]">
              <Icon name="shield" className="h-5 w-5" /> Усіх товарів достатньо
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#e3edf3]">
              {s?.products.lowStock.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <Link href={`/admin/products?edit=${p.id}`} className="line-clamp-1 text-sm font-bold hover:text-[#098fd0]">{p.name}</Link>
                    <span className="text-xs text-[#527083]">{categoryBySlug[p.category as keyof typeof categoryBySlug]?.name}</span>
                  </span>
                  <span className="rounded-full bg-[#fff4c2] px-2.5 py-1 text-xs font-black text-[#8a6100]">{p.stock} шт.</span>
                  <button
                    onClick={() => restock(p.id, p.stock)}
                    disabled={restocking === p.id}
                    className="rounded-full bg-[#eef6fb] px-3 py-1.5 text-xs font-extrabold text-[#067eb7] transition hover:bg-[#dff4ff] disabled:opacity-50"
                  >
                    +10 шт.
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold">Останні замовлення</h2>
            <Link href="/admin/orders" className="text-sm font-bold text-[#098fd0] hover:underline">Усі замовлення</Link>
          </div>
          {orders.data && orders.data.orders.length === 0 ? (
            <p className="mt-4 text-sm text-[#527083]">Замовлень поки немає.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#e3edf3]">
              {orders.data?.orders.slice(0, 6).map((o) => (
                <li key={o.number} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                  <Link href={`/admin/orders?q=${o.number}`} className="font-extrabold hover:text-[#098fd0]">{o.number}</Link>
                  <span className="text-[#527083]">{shortDate(o.createdAt)}</span>
                  <span className="min-w-0 flex-1 truncate">{o.contact.firstName} {o.contact.lastName}</span>
                  <b>{formatPrice(o.total)}</b>
                  <StatusPill status={o.status} payment={o.payment} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <MailCheck />
    </div>
  );
}

type MailTestResult = { ok: boolean; error?: string; hint?: string; to?: string; from?: string | null };

/** Перевірка пошти: тестовий лист на адресу адміністратора і причина, якщо не дійшов */
function MailCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MailTestResult | null>(null);
  const check = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await adminFetch<MailTestResult>("/api/admin/mail-test", { method: "POST" }));
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Листи покупцям</h2>
          <p className="mt-1 text-sm text-[#527083]">Надішліть тестовий лист собі — так видно, чи доходять листи про замовлення.</p>
        </div>
        <button
          onClick={check}
          disabled={busy}
          className="rounded-full bg-[#ffd51f] px-5 py-2.5 text-sm font-extrabold transition hover:bg-[#ffe044] disabled:opacity-60"
        >
          {busy ? "Надсилаємо…" : "Надіслати тестовий лист"}
        </button>
      </div>
      {result && (
        <div
          role="status"
          data-testid="mail-check"
          className={`mt-4 rounded-2xl px-4 py-3 text-sm ${result.ok ? "bg-[#e7f7ee] text-[#1f6b3d]" : "bg-[#fdecec] text-[#8f2428]"}`}
        >
          {result.ok ? (
            <p>
              <b>Лист надіслано</b> на {result.to}
              {result.from ? <> з {result.from}</> : null}. Якщо його немає у «Вхідних» за кілька хвилин — перевірте «Спам».
            </p>
          ) : (
            <>
              <p><b>Лист не надіслано.</b> {result.hint}</p>
              {result.error && <p className="mt-1 break-words font-mono text-xs opacity-80">{result.error}</p>}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

export function StatusPill({ status, payment }: { status: OrderStatusId; payment?: string }) {
  const info = orderStatusInfo[status];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${info.tone}`}>{statusLabel(status, payment)}</span>;
}
