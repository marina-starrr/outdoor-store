/**
 * Статуси замовлення та дозволені переходи — спільні для адмін-панелі, API і профілю покупця.
 *
 * Шлях замовлення:
 *   оплата на рахунок: нове → підтверджене (товар заброньовано, чекаємо оплату) → оплачене → відправлене → виконане;
 *   накладений платіж: нове → підтверджене (готуємо до відправки) → відправлене → виконане.
 * Скасувати можна до відправлення. Підтверджене, але не оплачене за PAYMENT_DAYS дні,
 * скасовується автоматично, а товар повертається на склад.
 */

export type OrderStatusId = "new" | "confirmed" | "paid" | "shipped" | "done" | "cancelled";

/** Скільки днів покупець має на оплату після підтвердження */
export const PAYMENT_DAYS = 3;

export const orderStatusInfo: Record<
  OrderStatusId,
  {
    /** Для адміністратора */
    label: string;
    /** Для покупця: що зараз відбувається із замовленням */
    customer: string;
    /** Коротко — для шкали етапів */
    step: string;
    tone: string;
  }
> = {
  new: { label: "Нове", customer: "Очікує підтвердження", step: "Прийнято", tone: "bg-[#fff4c2] text-[#8a6100]" },
  confirmed: { label: "Чекає оплату", customer: "Очікує оплату", step: "Підтверджено", tone: "bg-[#e1f0f9] text-[#067eb7]" },
  paid: { label: "Оплачене", customer: "Оплачено", step: "Оплачено", tone: "bg-[#e6f6f4] text-[#0f7b6c]" },
  shipped: { label: "Відправлене", customer: "Відправлено", step: "Відправлено", tone: "bg-[#ede7fb] text-[#5b3cc4]" },
  done: { label: "Виконане", customer: "Отримано", step: "Отримано", tone: "bg-[#e7f7ee] text-[#1f9d55]" },
  cancelled: { label: "Скасоване", customer: "Скасовано", step: "Скасовано", tone: "bg-[#fdecec] text-[#c53035]" },
};

/** Етапи для шкали прогресу (без скасування) */
export const orderSteps: OrderStatusId[] = ["new", "confirmed", "paid", "shipped", "done"];

/** Куди можна перевести замовлення з поточного статусу */
export const nextStatuses: Record<OrderStatusId, OrderStatusId[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["paid", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: ["done"],
  done: [],
  cancelled: [],
};

/**
 * Накладений платіж: оплата при отриманні, тож підтверджене замовлення не «чекає
 * оплату», а готується до відправки. Назви статусу з урахуванням способу оплати
 */
const codConfirmed = { label: "Готується до відправки", customer: "Готуємо до відправки" };

export const statusLabel = (status: OrderStatusId, payment?: string) =>
  status === "confirmed" && payment === "cod" ? codConfirmed.label : orderStatusInfo[status].label;

export const customerStatus = (status: OrderStatusId, payment?: string) =>
  status === "confirmed" && payment === "cod" ? codConfirmed.customer : orderStatusInfo[status].customer;

/**
 * Переходи з урахуванням оплати: замовлення з накладеним платежем оплачуються
 * при отриманні — їх відправляють без «оплачене»
 */
export function nextStatusesFor(status: OrderStatusId, payment?: string): OrderStatusId[] {
  if (status === "confirmed" && payment === "cod") return ["shipped", "cancelled"];
  return nextStatuses[status];
}

export const canTransition = (from: OrderStatusId, to: OrderStatusId, payment?: string) =>
  nextStatusesFor(from, payment).includes(to);

/** Покупець може сам скасувати замовлення, доки його не оплатив */
export const customerCanCancel = (status: OrderStatusId) => status === "new" || status === "confirmed";

/** Хто/чому скасував — для тексту сповіщення */
export type CancelReason = "unpaid" | "customer";

/** До якого часу треба оплатити підтверджене замовлення */
export const paymentDue = (confirmedAt: string) =>
  new Date(new Date(confirmedAt).getTime() + PAYMENT_DAYS * 86_400_000).toISOString();
