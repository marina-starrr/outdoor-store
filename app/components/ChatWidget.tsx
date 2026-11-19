"use client";

import Link from "./NavLink";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./Auth";
import { useCatalog } from "./Catalog";
import Icon from "./Icon";
import { formatPrice } from "./catalog-data";
import { formatPhone, inputCls } from "./form-ui";
import { productUrl } from "./product-details";

/*
 * Чат з консультантом: кнопка в правому нижньому куті кожної сторінки.
 * Гість пише без реєстрації (ім'я + телефон або email у першому повідомленні),
 * з акаунтом — одразу. Поки вікно відкрите, нові відповіді підтягуються
 * кожні кілька секунд; закрите — рідше, лише щоб показати значок непрочитаних.
 *
 * Відкрити чат з будь-якого місця: openChat() або openChat({ productId }).
 */

type Message = { id: string; seq: number; createdAt: string; author: "customer" | "admin"; text: string; productId?: string };

const OPEN_EVENT = "fc:chat-open";
/** Позначка в браузері, що розмова вже є (щоб не питати сервер на кожній сторінці дарма) */
const HAS_CHAT_KEY = "family-camping-chat";
const MAX = 2000;

export function openChat(detail: { productId?: string } = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail }));
}

const time = (iso: string) =>
  new Date(iso).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const readFlag = () => {
  try {
    return localStorage.getItem(HAS_CHAT_KEY) === "1";
  } catch {
    return false;
  }
};
const writeFlag = () => {
  try {
    localStorage.setItem(HAS_CHAT_KEY, "1");
  } catch {
    /* приватний режим — нічого страшного */
  }
};

export default function ChatWidget() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { status, user } = useAuth();
  const { byId } = useCatalog();

  const [openState, setOpen] = useState(false);
  // Посилання з листа (?chat=1) відкриває чат одразу, доки покупець сам його не закриє
  const [linkClosed, setLinkClosed] = useState(false);
  const fromLink = params.get("chat") === "1";
  const open = openState || (fromLink && !linkClosed);
  const close = () => {
    setOpen(false);
    setLinkClosed(true);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasChat, setHasChat] = useState(false);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  const [productId, setProductId] = useState<string | undefined>();
  const [contact, setContact] = useState({ name: "", phone: "+380 ", email: "" });
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [sending, setSending] = useState(false);
  const lastSeq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const guest = status === "guest";
  const known = hasChat || status === "user";

  const load = useCallback(async (isOpen: boolean) => {
    try {
      const res = await fetch(`/api/chat?after=${lastSeq.current}${isOpen ? "&open=1" : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: { chat: unknown; messages: Message[]; unread: number } = await res.json();
      if (!data.chat) return;
      setHasChat(true);
      writeFlag();
      if (data.messages.length) {
        lastSeq.current = data.messages[data.messages.length - 1].seq;
        setMessages((m) => [...m, ...data.messages.filter((x) => !m.some((y) => y.id === x.id))]);
      }
      setUnread(data.unread);
    } catch {
      /* немає зв'язку — спробуємо наступного разу */
    }
  }, []);

  // Розмова вже є (позначка в браузері) або покупець з акаунтом — підтягуємо її
  useEffect(() => {
    if (status === "loading" || !(status === "user" || readFlag())) return;
    const t = setTimeout(() => void load(false), 0);
    return () => clearTimeout(t);
  }, [status, user?.id, load]);

  // Опитування: відкрите вікно — щокілька секунд, закрите — рідко (значок непрочитаних)
  useEffect(() => {
    if (!known) return;
    const tick = () => document.visibilityState === "visible" && load(open);
    const t = setInterval(tick, open ? 4000 : 30_000);
    return () => clearInterval(t);
  }, [known, open, load]);

  // Відкрито й є непрочитані відповіді — позначаємо прочитаними
  useEffect(() => {
    if (!open || !unread) return;
    void fetch("/api/chat/read", { method: "POST" })
      .then(() => setUnread(0))
      .catch(() => undefined);
  }, [open, unread]);

  // Нове повідомлення — прокручуємо донизу
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open, messages.length]);

  // Відкрити з будь-якого місця сайту (кнопка «Запитати про товар», посилання з листа ?chat=1)
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ productId?: string }>).detail;
      if (detail?.productId) setProductId(detail.productId);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setLinkClosed(true);
      requestAnimationFrame(() => buttonRef.current?.focus());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/admin")) return null;

  const needContact = guest && !hasChat;
  const product = productId ? byId.get(productId) : undefined;

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          productId: product?.id,
          website,
          ...(needContact ? { name: contact.name, phone: contact.phone, email: contact.email } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ text: data.error ?? "Не вдалося надіслати. Спробуйте ще раз.", field: data.field });
        return;
      }
      if (data.message) {
        lastSeq.current = Math.max(lastSeq.current, data.message.seq);
        setMessages((m) => [...m, data.message]);
      }
      setHasChat(true);
      writeFlag();
      setDraft("");
      setProductId(undefined);
    } catch {
      setError({ text: "Немає з'єднання. Спробуйте ще раз." });
    } finally {
      setSending(false);
    }
  };

  // На сторінці товару на телефоні знизу липка панель «В кошик» — кнопка чату вище
  const productPage = /^\/catalog\/[^/]+\/[^/]+/.test(pathname);
  const lift = productPage ? "bottom-24 lg:bottom-6" : "bottom-5 sm:bottom-6";

  return (
    <>
      {!open && (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={unread ? `Чат з консультантом, нових відповідей: ${unread}` : "Чат з консультантом"}
          className={`fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#00acff] text-white shadow-[0_12px_30px_rgba(0,140,210,.45)] transition hover:-translate-y-0.5 hover:bg-[#0aa0e8] sm:right-6 ${lift}`}
        >
          <Icon name="chat" className="h-7 w-7" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-6 min-w-6 place-items-center rounded-full bg-[#ffd51f] px-1 text-xs font-black text-[#082c45]">
              {unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Чат з консультантом"
          className="fixed inset-0 z-[70] flex flex-col bg-white sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(600px,calc(100vh-48px))] sm:w-[380px] sm:overflow-hidden sm:rounded-[24px] sm:shadow-[0_24px_70px_rgba(8,44,69,.28)]"
        >
          <header className="flex items-center gap-3 bg-[linear-gradient(135deg,#067eb7_0%,#1eb6ed_100%)] px-4 py-3.5 text-white">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20">
              <Icon name="headset" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold leading-tight">Чат з консультантом</p>
              <p className="text-xs text-white/85">Відповідаємо в робочий час, зазвичай протягом години</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Закрити чат"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 transition hover:bg-white/25"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-[#f5f9fc] px-4 py-4" aria-live="polite">
            <Bubble author="admin">
              Вітаємо{user?.firstName ? `, ${user.firstName}` : ""}! 👋 Підкажемо з вибором спорядження, доставкою чи
              замовленням. Напишіть своє питання.
            </Bubble>
            {/* Найчастіше питають про статус — його можна перевірити самому, без очікування відповіді */}
            <Link
              href={user ? "/account" : "/orders/track"}
              onClick={() => { setOpen(false); setLinkClosed(true); }}
              className="ml-1 inline-flex items-center gap-2 rounded-full border border-[#cfe3ef] bg-white px-4 py-2 text-sm font-bold text-[#067eb7] transition hover:bg-[#eef6fb]"
            >
              <Icon name="package" className="h-4 w-4" />
              Де моє замовлення?
            </Link>
            {messages.map((m) => {
              const p = m.productId ? byId.get(m.productId) : undefined;
              return (
                <Bubble key={m.id} author={m.author} time={time(m.createdAt)}>
                  {p && (
                    <Link href={productUrl(p)} className="mb-1.5 block rounded-xl bg-black/5 px-3 py-2 text-xs font-bold hover:underline">
                      {p.name} · {formatPrice(p.price)}
                    </Link>
                  )}
                  {m.text}
                </Bubble>
              );
            })}
          </div>

          <form
            className="border-t border-[#e3edf3] bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {needContact && (
              <div className="mb-2.5 grid gap-2">
                <p className="text-xs text-[#527083]">Як до вас звертатися і куди відповісти, якщо закриєте сайт:</p>
                <input
                  aria-label="Ваше ім'я"
                  placeholder="Ваше ім'я"
                  autoComplete="given-name"
                  value={contact.name}
                  onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                  className={`${inputCls(error?.field === "name" ? "x" : undefined)} !py-2.5`}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    aria-label="Телефон"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={contact.phone}
                    onChange={(e) => setContact((c) => ({ ...c, phone: formatPhone(e.target.value) }))}
                    className={`${inputCls(error?.field === "phone" ? "x" : undefined)} !py-2.5`}
                  />
                  <input
                    aria-label="Email"
                    type="email"
                    placeholder="або email"
                    autoComplete="email"
                    value={contact.email}
                    onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                    className={`${inputCls(error?.field === "email" ? "x" : undefined)} !py-2.5`}
                  />
                </div>
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="absolute -left-[9999px] h-0 w-0 opacity-0"
                />
              </div>
            )}
            {product && (
              <p className="mb-2 flex items-center gap-2 rounded-xl bg-[#eef6fb] px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  Питання про: <b>{product.name}</b>
                </span>
                <button type="button" onClick={() => setProductId(undefined)} aria-label="Не прикріплювати товар" className="shrink-0 text-[#527083] hover:text-[#c53035]">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </p>
            )}
            {error && (
              <p role="alert" className="mb-2 text-xs font-semibold text-[#c53035]">
                {error.text}
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                maxLength={MAX}
                aria-label="Повідомлення"
                placeholder="Напишіть повідомлення…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter — надіслати, Shift+Enter — новий рядок
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-[#d5e5ef] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#00acff] focus:ring-4 focus:ring-sky-100"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Надіслати"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ffd51f] text-[#082c45] transition hover:bg-[#ffe044] disabled:opacity-50"
              >
                <Icon name="arrow" className="h-5 w-5 -rotate-45" />
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}

function Bubble({ author, time, children }: { author: "customer" | "admin"; time?: string; children: React.ReactNode }) {
  const mine = author === "customer";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          mine ? "rounded-br-md bg-[#ffd51f] text-[#082c45]" : "rounded-bl-md bg-white text-[#264e65] shadow-[0_4px_14px_rgba(79,93,101,.08)]"
        }`}
      >
        {!mine && <p className="mb-0.5 text-xs font-extrabold text-[#067eb7]">Family Camping</p>}
        {children}
        {time && <p className={`mt-1 text-right text-xs ${mine ? "text-[#8a6d00]" : "text-[#8aa5b5]"}`}>{time}</p>}
      </div>
    </div>
  );
}
