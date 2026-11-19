import { formatPrice } from "../components/catalog-data";
import { PAYEE, sellerTitle } from "./seller";

/*
 * Реквізити для оплати замовлення на рахунок — для листа, сторінки
 * відстеження й профілю покупця. Беруться з PAYEE (app/lib/seller.ts);
 * без IBAN реквізитів немає — їх надсилає менеджер.
 */

export type PaymentDetails = {
  recipient: string;
  codeLabel: string;
  code: string;
  iban: string;
  bank?: string;
  amount: number;
  purpose: string;
};

export const paymentPurpose = (number: string) => `Оплата замовлення ${number}`;

export function paymentDetails(order: { number: string; total: number }): PaymentDetails | null {
  if (!PAYEE?.iban) return null;
  return {
    recipient: sellerTitle(PAYEE),
    codeLabel: PAYEE.kind === "fop" ? "РНОКПП" : "ЄДРПОУ",
    code: PAYEE.code,
    iban: PAYEE.iban,
    bank: PAYEE.bank,
    amount: order.total,
    purpose: paymentPurpose(order.number),
  };
}

/** Реквізити текстом (для листа) */
export function paymentDetailsText(order: { number: string; total: number }): string {
  const d = paymentDetails(order);
  if (!d)
    return `Реквізити для оплати менеджер надішле окремим листом на цю адресу. У призначенні платежу вкажіть: «${paymentPurpose(order.number)}».`;
  return [
    "Реквізити для оплати:",
    `Отримувач: ${d.recipient}`,
    `${d.codeLabel}: ${d.code}`,
    `IBAN: ${d.iban}`,
    d.bank ? `Банк: ${d.bank}` : null,
    `Сума: ${formatPrice(d.amount)}`,
    `Призначення платежу: ${d.purpose}`,
  ]
    .filter(Boolean)
    .join("\n");
}
