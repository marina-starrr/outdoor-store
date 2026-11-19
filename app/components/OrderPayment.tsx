"use client";

import { useState } from "react";
import { formatPrice } from "./catalog-data";
import { paymentDetails, paymentPurpose } from "../lib/payment";
import { paymentDue } from "../lib/order-status";

/**
 * Блок «Оплатіть замовлення» для підтвердженого замовлення: сума, строк і
 * реквізити (з кнопками «Копіювати»). Поки IBAN продавця не заповнено —
 * повідомлення, що реквізити надішле менеджер
 */
export default function OrderPayment({
  order,
  email,
}: {
  order: { number: string; total: number; confirmedAt?: string };
  /** Куди надіслано реквізити (у профілі — email покупця; на «Де моє замовлення?» невідомий) */
  email?: string;
}) {
  const to = email ? <b>{email}</b> : "email, вказаний при оформленні";
  const details = paymentDetails(order);
  const due = order.confirmedAt
    ? new Date(paymentDue(order.confirmedAt)).toLocaleString("uk-UA", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Kyiv",
      })
    : null;

  return (
    <div data-testid="order-payment" className="rounded-[20px] bg-[#fffbe6] p-5 text-sm text-[#3d5d70]">
      <p className="text-base font-extrabold text-[#082c45]">
        Оплатіть {formatPrice(order.total)}
        {due && <> до {due}</>}
      </p>
      <p className="mt-1">
        Товар заброньовано за вами. Щойно оплата надійде, ми відправимо посилку. Без оплати замовлення скасується
        автоматично.
      </p>
      {details ? (
        <>
        <p className="mt-1">Ці ж реквізити ми надіслали листом на {to}.</p>
        <dl className="mt-4 grid gap-2">
          <Row label="Отримувач" value={details.recipient} />
          <Row label={details.codeLabel} value={details.code} copy />
          <Row label="IBAN" value={details.iban} copy />
          {details.bank && <Row label="Банк" value={details.bank} />}
          <Row label="Сума" value={String(details.amount)} display={formatPrice(details.amount)} copy />
          <Row label="Призначення" value={details.purpose} copy />
        </dl>
        </>
      ) : (
        <p className="mt-3 rounded-xl bg-white px-4 py-3">
          Реквізити для оплати надішлемо листом на {to} — перевірте також папку «Спам». У призначенні платежу вкажіть:{" "}
          <b>«{paymentPurpose(order.number)}»</b>.
        </p>
      )}
    </div>
  );
}

function Row({ label, value, display, copy }: { label: string; value: string; display?: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-white px-4 py-2.5">
      <dt className="text-xs font-bold uppercase tracking-[0.08em] text-[#8aa5b5]">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 font-bold text-[#082c45]">
        <span className="break-all">{display ?? value}</span>
        {copy && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(value).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }, () => undefined);
            }}
            className="shrink-0 rounded-full bg-[#eef6fb] px-3 py-1.5 text-xs font-extrabold text-[#067eb7] transition hover:bg-[#e1f0f9]"
            aria-label={`Копіювати: ${label}`}
          >
            {copied ? "Скопійовано" : "Копіювати"}
          </button>
        )}
      </dd>
    </div>
  );
}
