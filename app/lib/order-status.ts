/** Статуси замовлення та дозволені переходи — спільні для адмін-панелі, API і профілю покупця */

export type OrderStatusId = "new" | "confirmed" | "shipped" | "done" | "cancelled";

export const orderStatusInfo: Record<OrderStatusId, { label: string; tone: string }> = {
  new: { label: "Нове", tone: "bg-[#fff4c2] text-[#8a6100]" },
  confirmed: { label: "Підтверджене", tone: "bg-[#e1f0f9] text-[#067eb7]" },
  shipped: { label: "Відправлене", tone: "bg-[#ede7fb] text-[#5b3cc4]" },
  done: { label: "Виконане", tone: "bg-[#e7f7ee] text-[#1f9d55]" },
  cancelled: { label: "Скасоване", tone: "bg-[#fdecec] text-[#c53035]" },
};

/** Куди можна перевести замовлення з поточного статусу */
export const nextStatuses: Record<OrderStatusId, OrderStatusId[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["done"],
  done: [],
  cancelled: [],
};

export const canTransition = (from: OrderStatusId, to: OrderStatusId) => nextStatuses[from].includes(to);
