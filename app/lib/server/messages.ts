import "server-only";
import { write, type StoredMessage } from "./db";

/*
 * Звернення з форми «Контакти» зберігаються в базі (db.json → messages)
 * і опрацьовуються в адмін-панелі (розділ «Звернення»).
 */

export type ContactMessage = StoredMessage;

export function saveMessage(msg: ContactMessage) {
  return write((db) => {
    (db.messages ??= []).push(msg);
  });
}

/** Не більше 3 звернень за 10 хвилин з однієї IP-адреси */
const hits = new Map<string, number[]>();

export function contactRateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 3) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}
