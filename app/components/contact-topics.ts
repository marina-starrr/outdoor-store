/** Теми звернень — спільні для форми та перевірки на сервері */
export const contactTopics = [
  { id: "advice", label: "Допомога з вибором" },
  { id: "order", label: "Питання щодо замовлення" },
  { id: "return", label: "Обмін або повернення" },
  { id: "partner", label: "Співпраця" },
  { id: "other", label: "Інше" },
] as const;

export type ContactTopic = (typeof contactTopics)[number]["id"];

export const MESSAGE_MAX = 1000;

/** Найдовша відповідь адміністратора на звернення */
export const REPLY_MAX = 3000;
