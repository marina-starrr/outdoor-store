"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCatalog } from "../Catalog";
import Icon from "../Icon";
import { formatPrice } from "../catalog-data";
import { productUrl } from "../product-details";
import AdminShell, { LoadError, Panel } from "./AdminShell";
import { ApiError, adminFetch, shortDate } from "./api";

type Message = { id: string; seq: number; createdAt: string; author: "customer" | "admin"; text: string; productId?: string };

type ChatSummary = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  guest: boolean;
  lastMessageAt: string;
  customerSeenAt?: string;
  unread: number;
  last: Message | null;
};

/** Покупець «зараз у чаті», якщо заглядав за останні 2 хвилини */
const isOnline = (seen?: string) => !!seen && Date.now() - new Date(seen).getTime() < 2 * 60_000;

export default function AdminChats() {
  return (
    <AdminShell title="Чат з покупцями">
      <Chats />
    </AdminShell>
  );
}

function Chats() {
  const router = useRouter();
  const selected = useSearchParams().get("id");
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState("");

  const loadList = useCallback(async () => {
    try {
      const data = await adminFetch<{ chats: ChatSummary[] }>("/api/admin/chats");
      setChats(data.chats);
      setError("");
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);

  // Список оновлюється сам — нові розмови й повідомлення видно без перезавантаження
  useEffect(() => {
    const first = setTimeout(loadList, 0);
    const t = setInterval(() => document.visibilityState === "visible" && loadList(), 8000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadList]);

  if (error && !chats) return <LoadError message={error} onRetry={loadList} />;
  const open = (id: string | null) => router.replace(id ? `/admin/chats?id=${id}` : "/admin/chats", { scroll: false });

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
      <Panel className={`min-w-0 overflow-hidden !p-2 ${selected ? "hidden lg:block" : ""}`}>
        {!chats ? (
          <div className="grid gap-2 p-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-[#f3f9fd]" />)}
          </div>
        ) : chats.length === 0 ? (
          <p className="p-6 text-center text-sm text-[#527083]">
            Поки ніхто не писав. Щойно покупець напише в чат на сайті — розмова з’явиться тут, а вам прийде сповіщення в Telegram.
          </p>
        ) : (
          <ul className="grid min-w-0 gap-1" data-testid="admin-chats">
            {chats.map((c) => (
              <li key={c.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => open(c.id)}
                  aria-current={c.id === selected ? "true" : undefined}
                  className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${c.id === selected ? "bg-[#eef6fb]" : "hover:bg-[#f6fafd]"}`}
                >
                  <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#082c45] text-sm font-black text-white">
                    {(c.name || "?").slice(0, 1).toUpperCase()}
                    {isOnline(c.customerSeenAt) && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#1f9d55]" aria-label="зараз у чаті" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <b className="min-w-0 truncate text-sm">{c.name || "Покупець"}</b>
                      {c.guest && <span className="shrink-0 rounded-full bg-[#eef6fb] px-2 py-0.5 text-xs font-bold text-[#527083]">Гість</span>}
                      <span className="ml-auto shrink-0 text-xs text-[#8aa5b5]">{shortDate(c.lastMessageAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-sm ${c.unread ? "font-bold text-[#082c45]" : "text-[#527083]"}`}>
                        {c.last ? `${c.last.author === "admin" ? "Ви: " : ""}${c.last.text}` : ""}
                      </span>
                      {c.unread > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#ffd51f] px-1.5 text-xs font-black">{c.unread}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {selected ? (
        <Thread key={selected} id={selected} onBack={() => open(null)} onActivity={loadList} />
      ) : (
        <Panel className="hidden min-h-[420px] place-items-center text-center text-sm text-[#527083] lg:grid">
          <span>
            <Icon name="chat" className="mx-auto mb-3 h-10 w-10 text-[#b6cfdd]" />
            Оберіть розмову зліва
          </span>
        </Panel>
      )}
    </div>
  );
}

function Thread({ id, onBack, onActivity }: { id: string; onBack: () => void; onActivity: () => void }) {
  const { byId } = useCatalog();
  const [chat, setChat] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const lastSeq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminFetch<{ chat: ChatSummary; messages: Message[] }>(`/api/admin/chats/${id}?after=${lastSeq.current}`);
      setChat(data.chat);
      if (data.messages.length) {
        lastSeq.current = data.messages[data.messages.length - 1].seq;
        setMessages((m) => [...m, ...data.messages.filter((x) => !m.some((y) => y.id === x.id))]);
        onActivity();
      }
      setError("");
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, [id, onActivity]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(() => document.visibilityState === "visible" && load(), 4000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setNotice("");
    try {
      const r = await adminFetch<{ message: Message; notified: boolean }>(`/api/admin/chats/${id}`, { method: "POST", body: { text } });
      lastSeq.current = Math.max(lastSeq.current, r.message.seq);
      setMessages((m) => [...m, r.message]);
      setDraft("");
      if (r.notified) setNotice("Покупця зараз немає в чаті — відповідь продубльовано на email або в сповіщеннях на сайті");
      onActivity();
    } catch (e) {
      setNotice((e as ApiError).message);
    } finally {
      setSending(false);
    }
  };

  if (error && !chat) return <LoadError message={error} onRetry={load} />;

  return (
    <Panel className="flex min-h-[520px] flex-col !p-0 lg:h-[calc(100vh-170px)]">
      <div className="flex items-center gap-3 border-b border-[#e3edf3] px-4 py-3">
        <button type="button" onClick={onBack} aria-label="До списку розмов" className="grid h-9 w-9 place-items-center rounded-full bg-[#eef6fb] lg:hidden">
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-extrabold">
            <span className="truncate">{chat?.name || "Покупець"}</span>
            {chat && (
              <span className={`shrink-0 text-xs font-bold ${isOnline(chat.customerSeenAt) ? "text-[#1f9d55]" : "text-[#8aa5b5]"}`}>
                {isOnline(chat.customerSeenAt) ? "● зараз у чаті" : chat.guest ? "гість" : "з акаунтом"}
              </span>
            )}
          </p>
          <p className="truncate text-sm text-[#527083]">
            {chat?.phone && <a href={`tel:${chat.phone.replace(/\s/g, "")}`} className="text-[#098fd0] hover:underline">{chat.phone}</a>}
            {chat?.phone && chat?.email && " · "}
            {chat?.email && <a href={`mailto:${chat.email}`} className="text-[#098fd0] hover:underline">{chat.email}</a>}
            {chat && !chat.phone && !chat.email && "контактів немає"}
          </p>
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-[#f5f9fc] px-4 py-4">
        {messages.map((m) => {
          const p = m.productId ? byId.get(m.productId) : undefined;
          const mine = m.author === "admin";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${mine ? "rounded-br-md bg-[#082c45] text-white" : "rounded-bl-md bg-white text-[#264e65] shadow-[0_4px_14px_rgba(79,93,101,.08)]"}`}>
                {p && (
                  <Link href={productUrl(p)} target="_blank" className={`mb-1.5 block rounded-xl px-3 py-2 text-xs font-bold hover:underline ${mine ? "bg-white/10" : "bg-[#eef6fb]"}`}>
                    {p.name} · {formatPrice(p.price)} · залишок {p.stock}
                  </Link>
                )}
                {m.text}
                <p className={`mt-1 text-right text-xs ${mine ? "text-white/60" : "text-[#8aa5b5]"}`}>{shortDate(m.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>

      <form
        className="border-t border-[#e3edf3] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {notice && <p role="status" className="mb-2 text-xs font-semibold text-[#067eb7]">{notice}</p>}
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            maxLength={2000}
            aria-label="Відповідь покупцю"
            placeholder="Відповідь…"
            title="Enter — надіслати, Shift+Enter — новий рядок"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            className="max-h-40 flex-1 resize-none rounded-2xl border border-[#d5e5ef] px-4 py-2.5 text-sm outline-none transition focus:border-[#00acff] focus:ring-4 focus:ring-sky-100"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="h-11 shrink-0 rounded-full bg-[#ffd51f] px-5 text-sm font-extrabold transition hover:bg-[#ffe044] disabled:opacity-50"
          >
            Надіслати
          </button>
        </div>
      </form>
    </Panel>
  );
}
