/**
 * Чи веде посилання на ту саму сторінку, де користувач уже є.
 * Посилання з якорем (/#about, #contacts) — це перехід до розділу, тож ні.
 */
export function isSamePageLink(href: string, currentPath: string) {
  if (!href.startsWith("/") || href.includes("#")) return false;
  const path = href.split("?")[0];
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  return norm(path) === norm(currentPath);
}
