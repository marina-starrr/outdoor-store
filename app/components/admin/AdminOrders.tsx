"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import { deliveryOptions, paymentOptions } from "../cart-logic";
import { formatPrice } from "../catalog-data";
import { nextStatuses, orderStatusInfo, type OrderStatusId } from "../../lib/order-status";
import AdminShell, { LoadError, Panel } from "./AdminShell";
import { StatusPill } from "./AdminDashboard";
import { adminFetch, shortDate, useAdminData, type ApiError } from "./api";

export type AdminOrder = {
  number: string;
  createdAt: string;
  updatedAt?: string;
  status: OrderStatusId;
  lines: { id: string; name: string; price: number; qty: number }[];
  subtotal: number;
  promo?: string;
  promoDiscount: number;
  shipping: number;
  total: number;
  delivery: { method: string; city?: string; branch?: string; address?: string };
  payment: string;
  contact: { firstName: string; lastName: string; phone: string; email?: string };
  comment?: string;
  noCall: boolean;
  customer: { id: string; email: string; name: string };
};

/** Підписи кнопок переходу статусу */
const actionLabel: Record<OrderStatusId, string> = {
  new: "",
  confirmed: "Підтвердити",
  shipped: "Відправлено",
  done: "Виконано",
  cancelled: "Скасувати",
};

type Filter = OrderStatusId | "all";

export default function AdminOrders() {
  return (
    <AdminShell title="Замовлення">
      <Orders />
    </AdminShell>
  );
}

function Orders() {
  const { data, error, reload, setData } = useAdminData<{ orders: AdminOrder[] }>("/api/admin/orders");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  // Фільтри з адреси (/admin/orders?status=new, ?q=FC-…)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const s = sp.get("status");
    /* eslint-disable react-hooks/set-state-in-effect -- одноразове читання URL після гідратації */
    if (s && s in orderStatusInfo) setFilter(s as OrderStatusId);
    const q = sp.get("q");
    if (q) {
      setQuery(q);
      setOpen(q);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const orders = useMemo(() => data?.orders ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (filter === "all" || o.status === filter) &&
        (!q ||
          [o.number, o.contact.firstName, o.contact.lastName, o.contact.phone.replace(/\s/g, ""), o.customer.email]
            .join(" ")
            .toLowerCase()
            .includes(q.replace(/\s/g, ""))),
    );
  }, [orders, filter, query]);

  const changeStatus = async (number: string, status: OrderStatusId) => {
    setBusy(number);
    setNotice("");
    try {
      const { order } = await adminFetch<{ order: AdminOrder }>(`/api/admin/orders/${number}`, { method: "PATCH", body: { status } });
      setData((d) => d && { orders: d.orders.map((o) => (o.number === number ? { ...o, ...order } : o)) });
      setNotice(
        status === "cancelled"
          ? `Замовлення ${number} скасовано, товари повернено на склад`
          : `Замовлення ${number}: ${orderStatusInfo[status].label.toLowerCase()}`,
      );
    } catch (e) {
      setNotice((e as ApiError).message);
    } finally {
      setBusy(null);
      setConfirmCancel(null);
    }
  };

  if (error) return <LoadError message={error} onRetry={reload} />;

  const filters: Filter[] = ["all", "new", "confirmed", "shipped", "done", "cancelled"];

  return (
    <div className="grid gap-4">
      <Panel className="!p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Статус">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-3.5 py-2 text-sm font-bold transition ${filter === f ? "bg-[#082c45] text-white" : "bg-[#eef6fb] text-[#264e65] hover:bg-[#dff4ff]"}`}
              >
                {f === "all" ? "Усі" : orderStatusInfo[f].label}
                <span className={`ml-1.5 text-xs ${filter === f ? "text-[#ffd51f]" : "text-[#8aa5b5]"}`}>{counts[f] ?? 0}</span>
              </button>
            ))}
          </div>
          <label className="relative lg:ml-auto lg:w-72">
            <span className="sr-only">Пошук замовлень</span>
            <Icon name="search" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#067eb7]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Номер, ім'я, телефон, email"
              className="w-full rounded-full border border-[#d5e5ef] bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#0aa4e8] focus:ring-4 focus:ring-sky-100"
            />
          </label>
        </div>
      </Panel>

      {notice && (
        <p role="status" className="rounded-2xl bg-[#e1f0f9] px-4 py-3 text-sm font-semibold text-[#067eb7]">
          {notice}
        </p>
      )}

      {!data ? (
        <div className="h-64 animate-pulse rounded-[22px] bg-white" />
      ) : visible.length === 0 ? (
        <Panel className="text-center">
          <p className="font-extrabold">Замовлень не знайдено</p>
          <p className="mt-1 text-sm text-[#527083]">{orders.length ? "Змініть фільтр або пошук." : "Щойно покупці оформлять замовлення, вони з'являться тут."}</p>
        </Panel>
      ) : (
        <ul className="grid gap-3" data-testid="admin-orders">
          {visible.map((o) => {
            const expanded = open === o.number;
            const delivery = deliveryOptions.find((d) => d.id === o.delivery.method)?.title ?? "Самовивіз";
            const where = [o.delivery.city, o.delivery.branch && `№ ${o.delivery.branch}`, o.delivery.address].filter(Boolean).join(", ");
            return (
              <li key={o.number} className="rounded-[22px] bg-white shadow-[0_10px_30px_rgba(79,93,101,.08)]">
                <button
                  onClick={() => setOpen(expanded ? null : o.number)}
                  aria-expanded={expanded}
                  className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 p-4 text-left sm:p-5"
                >
                  <span className="min-w-[120px]">
                    <b className="block">{o.number}</b>
                    <span className="text-xs text-[#527083]">{shortDate(o.createdAt)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{o.contact.firstName} {o.contact.lastName}</span>
                    <span className="block truncate text-xs text-[#527083]">{o.contact.phone} · {o.lines.reduce((s, l) => s + l.qty, 0)} шт.</span>
                  </span>
                  <b className="text-base">{formatPrice(o.total)}</b>
                  <StatusPill status={o.status} />
                  <Icon name="arrow" className={`h-4 w-4 text-[#8aa5b5] transition ${expanded ? "-rotate-90" : "rotate-90"}`} />
                </button>

                {expanded && (
                  <div className="grid gap-5 border-t border-[#e3edf3] p-4 sm:p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8aa5b5]">Товари</p>
                      <ul className="mt-2 divide-y divide-[#e3edf3] text-sm">
                        {o.lines.map((l) => (
                          <li key={l.id} className="flex justify-between gap-3 py-2">
                            <span>{l.name} <span className="text-[#8aa5b5]">× {l.qty}</span></span>
                            <b>{formatPrice(l.price * l.qty)}</b>
                          </li>
                        ))}
                      </ul>
                      <dl className="mt-2 space-y-1 text-sm text-[#527083]">
                        {o.promoDiscount > 0 && <div className="flex justify-between"><dt>Промокод {o.promo}</dt><dd>−{formatPrice(o.promoDiscount)}</dd></div>}
                        <div className="flex justify-between"><dt>Доставка</dt><dd>{o.shipping ? formatPrice(o.shipping) : "Безкоштовно"}</dd></div>
                        <div className="flex justify-between font-extrabold text-[#082c45]"><dt>Разом</dt><dd>{formatPrice(o.total)}</dd></div>
                      </dl>
                    </div>
                    <div className="grid content-start gap-3 text-sm">
                      <Info label="Покупець">
                        {o.contact.firstName} {o.contact.lastName}
                        <br />
                        <a href={`tel:${o.contact.phone.replace(/\s/g, "")}`} className="font-bold text-[#098fd0] hover:underline">{o.contact.phone}</a>
                        {" · "}
                        <a href={`mailto:${o.contact.email || o.customer.email}`} className="text-[#098fd0] hover:underline">{o.contact.email || o.customer.email}</a>
                        {o.noCall && <span className="mt-1 block text-xs font-bold text-[#c27c00]">Просить не телефонувати</span>}
                      </Info>
                      <Info label="Доставка">{delivery}{where && <><br />{where}</>}</Info>
                      <Info label="Оплата">{paymentOptions.find((p) => p.id === o.payment)?.title ?? o.payment}</Info>
                      {o.comment && <Info label="Коментар">{o.comment}</Info>}

                      {nextStatuses[o.status].length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {nextStatuses[o.status].map((s) =>
                            s === "cancelled" ? (
                              confirmCancel === o.number ? (
                                <span key={s} className="flex items-center gap-2 rounded-full bg-[#fdecec] px-3 py-1.5 text-xs">
                                  Скасувати й повернути товари на склад?
                                  <button onClick={() => changeStatus(o.number, s)} disabled={busy === o.number} className="font-extrabold text-[#c53035] hover:underline">Так</button>
                                  <button onClick={() => setConfirmCancel(null)} className="font-extrabold text-[#264e65] hover:underline">Ні</button>
                                </span>
                              ) : (
                                <button key={s} onClick={() => setConfirmCancel(o.number)} className="rounded-full px-4 py-2 text-sm font-extrabold text-[#c53035] transition hover:bg-[#fdecec]">
                                  {actionLabel[s]}
                                </button>
                              )
                            ) : (
                              <button
                                key={s}
                                onClick={() => changeStatus(o.number, s)}
                                disabled={busy === o.number}
                                className="rounded-full bg-[#ffd51f] px-4 py-2 text-sm font-extrabold transition hover:bg-[#ffe044] disabled:opacity-60"
                              >
                                {actionLabel[s]}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-[#8aa5b5]">
        Покупець бачить статус у <Link href="/account" className="font-bold hover:underline">профілі</Link>. Скасування повертає товари на склад.
      </p>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8aa5b5]">{label}</p>
      <p className="mt-0.5 leading-relaxed">{children}</p>
    </div>
  );
}
