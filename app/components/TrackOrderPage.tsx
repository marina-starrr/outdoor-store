"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { Breadcrumbs } from "./catalog-ui";
import { deliveryOptions, paymentTitle, shippingLabel } from "./cart-logic";
import { formatPrice } from "./catalog-data";
import { Field, FormError, SubmitButton, formatPhone, inputCls } from "./form-ui";
import { customerCanCancel, orderStatusInfo, orderSteps, type OrderStatusId } from "../lib/order-status";
import CancelOrder from "./CancelOrder";
import OrderPayment from "./OrderPayment";

type TrackedOrder = {
  number: string;
  createdAt: string;
  updatedAt?: string;
  confirmedAt?: string;
  status: OrderStatusId;
  lines: { id: string; name: string; price: number; qty: number }[];
  shipping: number;
  promoDiscount: number;
  total: number;
  delivery: { method: string; city?: string };
  payment: string;
};

/** Етапи для шкали прогресу (скасоване показується окремо); накладений платіж — без етапу «Оплачено» */
const stepsFor = (payment: string) => orderSteps.filter((s) => s !== "paid" || payment !== "cod");

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });

/** «Де моє замовлення?» — статус за номером і телефоном, без входу в акаунт */
export default function TrackOrderPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("+380 ");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  // Номер з посилання в листі: /orders/track?number=FC-…
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("number");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- одноразове читання URL після гідратації
    if (n) setNumber(n);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^FC-?\d{7}$/i.test(number.trim().replace(/\s/g, ""))) return setError("Номер замовлення має вигляд FC-1234567");
    if (phone.replace(/\D/g, "").length !== 12) return setError("Вкажіть телефон у форматі +380 XX XXX XX XX");
    setPending(true);
    try {
      const n = number.trim().replace(/\s/g, "").toUpperCase().replace(/^FC-?/, "FC-");
      const res = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: n, phone }),
      });
      const data = await res.json();
      if (data.order) setOrder(data.order);
      else setError(data.error ?? "Замовлення не знайдено");
    } catch {
      setError("Немає з'єднання з сервером. Спробуйте ще раз.");
    }
    setPending(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f7fafc] text-[#082c45]">
      <SiteHeader query={query} onQueryChange={setQuery} onSearchSubmit={(q) => router.push(`/catalog?q=${encodeURIComponent(q)}`)} />
      <main className="flex-1">
        <div className="mx-auto max-w-[1440px] px-5 pb-20 pt-6 lg:px-8">
          <Breadcrumbs items={[{ label: "Головна", href: "/" }, { label: "Де моє замовлення?" }]} />
          <div className="mx-auto mt-6 max-w-2xl">
            <h1 className="text-[clamp(2rem,4vw,2.9rem)] font-extrabold leading-[1.05] tracking-[-0.04em]">Де моє замовлення?</h1>
            <p className="mt-3 text-[#3d5d70]">
              Введіть номер замовлення з листа-підтвердження та телефон, вказаний при оформленні. Якщо у вас є акаунт — усі замовлення є в{" "}
              <Link href="/account" className="font-bold text-[#098fd0] hover:underline">профілі</Link>.
            </p>

            {order ? (
              <OrderStatus order={order} phone={phone} onCancelled={() => setOrder({ ...order, status: "cancelled" })} onBack={() => setOrder(null)} />
            ) : (
              <form onSubmit={submit} noValidate className="mt-6 grid gap-4 rounded-[24px] bg-white p-5 shadow-[0_18px_52px_rgba(79,93,101,.08)] sm:p-7">
                <FormError>{error}</FormError>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="track-number" label="Номер замовлення">
                    <input id="field-track-number" value={number} onChange={(e) => { setNumber(e.target.value); setError(""); }} className={`${inputCls()} uppercase placeholder:normal-case`} placeholder="FC-1234567" autoComplete="off" />
                  </Field>
                  <Field id="track-phone" label="Телефон">
                    <input id="field-track-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(formatPhone(e.target.value)); setError(""); }} className={inputCls()} />
                  </Field>
                </div>
                <SubmitButton pending={pending}>Перевірити статус</SubmitButton>
              </form>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function OrderStatus({
  order,
  phone,
  onCancelled,
  onBack,
}: {
  order: TrackedOrder;
  phone: string;
  onCancelled: () => void;
  onBack: () => void;
}) {
  const cancelled = order.status === "cancelled";
  const steps = stepsFor(order.payment);
  const reached = steps.indexOf(order.status);
  const delivery = deliveryOptions.find((d) => d.id === order.delivery.method)?.title;
  return (
    <section data-testid="tracked-order" className="mt-6 rounded-[24px] bg-white p-5 shadow-[0_18px_52px_rgba(79,93,101,.08)] sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xl font-extrabold">Замовлення {order.number}</p>
          <p className="text-sm text-[#527083]">від {date(order.createdAt)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${orderStatusInfo[order.status].tone}`}>
          {orderStatusInfo[order.status].customer}
        </span>
      </div>

      {cancelled ? (
        <p className="mt-5 rounded-2xl bg-[#fdecec] px-4 py-3 text-sm text-[#c53035]">
          Замовлення скасовано. Якщо це помилка — <Link href="/contacts" className="font-bold underline">напишіть нам</Link>.
        </p>
      ) : (
        <ol className={`mt-6 grid gap-1.5 sm:gap-2 ${steps.length === 5 ? "grid-cols-5" : "grid-cols-4"}`} aria-label="Етапи замовлення">
          {steps.map((s, i) => (
            <li key={s} className="text-center" aria-current={i === reached ? "step" : undefined}>
              <span className={`block h-2 rounded-full ${i <= reached ? "bg-[#ffd51f]" : "bg-[#e3edf3]"}`} />
              {/* На телефоні п’ять підписів не вміщуються — там лише поточний етап під шкалою */}
              <span className={`mt-2 hidden text-sm font-bold sm:block ${i <= reached ? "text-[#082c45]" : "text-[#8aa5b5]"}`}>
                {orderStatusInfo[s].step}
              </span>
            </li>
          ))}
        </ol>
      )}
      {!cancelled && reached >= 0 && (
        <p className="mt-2 text-sm font-bold sm:hidden">
          Етап {reached + 1} з {steps.length}: {orderStatusInfo[order.status].step.toLowerCase()}
          {reached + 1 < steps.length && (
            <span className="font-medium text-[#8aa5b5]"> · далі — {orderStatusInfo[steps[reached + 1]].step.toLowerCase()}</span>
          )}
        </p>
      )}

      {order.status === "confirmed" && order.payment === "invoice" && (
        <div className="mt-6">
          <OrderPayment order={order} />
        </div>
      )}

      <ul className="mt-6 divide-y divide-[#e3edf3] rounded-[20px] border border-[#e3edf3] text-sm">
        {order.lines.map((l) => (
          <li key={l.id} className="flex justify-between gap-4 px-5 py-3">
            <span className="min-w-0">{l.name} <span className="text-[#8aa5b5]">× {l.qty}</span></span>
            <b className="shrink-0">{formatPrice(l.price * l.qty)}</b>
          </li>
        ))}
        <li className="flex justify-between gap-4 px-5 py-3 text-[#527083]">
          <span>{delivery}{order.delivery.city ? `, ${order.delivery.city}` : ""}</span>
          <span className="shrink-0">{shippingLabel(order.shipping, formatPrice)}</span>
        </li>
        {order.promoDiscount > 0 && (
          <li className="flex justify-between gap-4 px-5 py-3 text-[#527083]">
            <span>Промокод</span>
            <span>−{formatPrice(order.promoDiscount)}</span>
          </li>
        )}
        <li className="flex justify-between gap-4 bg-[#f6fafd] px-5 py-4">
          <span className="font-bold">Разом · {paymentTitle(order.payment)}</span>
          <span className="shrink-0 whitespace-nowrap text-lg font-black">{formatPrice(order.total)}</span>
        </li>
      </ul>

      {customerCanCancel(order.status) && (
        <div className="mt-4 flex justify-end">
          <CancelOrder number={order.number} phone={phone} onCancelled={onCancelled} />
        </div>
      )}

      <button type="button" onClick={onBack} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#098fd0] hover:underline">
        <Icon name="arrow" className="h-4 w-4 rotate-180" /> Перевірити інше замовлення
      </button>
    </section>
  );
}
