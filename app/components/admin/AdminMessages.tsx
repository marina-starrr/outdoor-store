"use client";

import { useMemo, useState } from "react";
import { REPLY_MAX } from "../contact-topics";
import Icon from "../Icon";
import AdminShell, { LoadError, Panel } from "./AdminShell";
import { ApiError, adminFetch, shortDate, useAdminData } from "./api";

type Reply = { id: string; createdAt: string; text: string; onSite: boolean; emailed: boolean };

type Message = {
  id: string;
  createdAt: string;
  topic: string;
  name: string;
  email: string;
  phone?: string;
  order?: string;
  message: string;
  done?: boolean;
  replies?: Reply[];
  /** Покупець має акаунт — побачить відповідь у сповіщеннях на сайті */
  hasAccount?: boolean;
};

type Filter = "new" | "done" | "all";

export default function AdminMessages() {
  return (
    <AdminShell title="Звернення">
      <Messages />
    </AdminShell>
  );
}

function Messages() {
  const { data, error, reload, setData } = useAdminData<{ messages: Message[]; mailEnabled: boolean }>("/api/admin/messages");
  const [filter, setFilter] = useState<Filter>("new");
  const messages = useMemo(() => data?.messages ?? [], [data]);
  const visible = messages.filter((m) => filter === "all" || (filter === "done" ? m.done : !m.done));

  const [flash, setFlash] = useState("");
  const replace = (message: Message) =>
    setData((d) => d && { ...d, messages: d.messages.map((x) => (x.id === message.id ? { ...x, ...message } : x)) });

  const toggle = async (m: Message) => {
    const { message } = await adminFetch<{ message: Message }>(`/api/admin/messages/${m.id}`, { method: "PATCH", body: { done: !m.done } });
    replace(message);
  };

  if (error) return <LoadError message={error} onRetry={reload} />;
  const count = (f: Filter) => messages.filter((m) => f === "all" || (f === "done" ? m.done : !m.done)).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Фільтр звернень">
        {(["new", "done", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${filter === f ? "bg-[#082c45] text-white" : "bg-white text-[#264e65] shadow-[0_6px_20px_rgba(79,93,101,.08)] hover:bg-[#eef6fb]"}`}
          >
            {f === "new" ? "Нові" : f === "done" ? "Опрацьовані" : "Усі"}
            <span className={`ml-1.5 text-xs ${filter === f ? "text-[#ffd51f]" : "text-[#8aa5b5]"}`}>{count(f)}</span>
          </button>
        ))}
      </div>

      {flash && (
        <p className="flex items-start justify-between gap-3 rounded-2xl bg-[#e7f7ee] px-4 py-3 text-sm font-bold text-[#1f9d55]" role="status">
          {flash}
          <button onClick={() => setFlash("")} aria-label="Закрити" className="shrink-0">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </p>
      )}

      {!data ? (
        <div className="h-48 animate-pulse rounded-[22px] bg-white" />
      ) : visible.length === 0 ? (
        <Panel className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#e7f7ee] text-[#1f9d55]">
            <Icon name="shield" className="h-7 w-7" />
          </span>
          <p className="mt-3 font-extrabold">{filter === "new" ? "Усі звернення опрацьовано" : "Звернень немає"}</p>
        </Panel>
      ) : (
        <ul className="grid gap-3" data-testid="admin-messages">
          {visible.map((m) => (
            <MessageCard
              key={m.id}
              m={m}
              mailEnabled={data.mailEnabled}
              onToggle={() => toggle(m)}
              onReplied={(message, note) => {
                replace(message);
                setFlash(`${m.name}: ${note}`);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Лист у Gmail з уже заповненими адресою, темою і текстом — коли автоматично відповідь не дійде */
const gmailUrl = (m: Message, body: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(m.email)}&su=${encodeURIComponent(`Re: ${m.topic} — Family Camping`)}&body=${encodeURIComponent(body)}`;

function MessageCard({
  m,
  mailEnabled,
  onToggle,
  onReplied,
}: {
  m: Message;
  mailEnabled: boolean;
  onToggle: () => void;
  onReplied: (m: Message, note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  // Куди дійде відповідь, надіслана з адмін-панелі
  const onSite = !!m.hasAccount;
  const canDeliver = onSite || mailEnabled;
  const routes = [onSite && "у сповіщення на сайті", mailEnabled && `листом на ${m.email}`].filter(Boolean).join(" і ");

  const send = async () => {
    if (text.trim().length < 2) {
      setErr("Напишіть відповідь");
      return;
    }
    setPending(true);
    setErr("");
    try {
      const { message, reply } = await adminFetch<{ message: Message; reply: Reply }>(`/api/admin/messages/${m.id}/reply`, {
        method: "POST",
        body: { text },
      });
      setText("");
      setOpen(false);
      onReplied(
        { ...message, hasAccount: m.hasAccount },
        reply.onSite || reply.emailed
          ? `відповідь надіслано ${[reply.onSite && "у сповіщення на сайті", reply.emailed && "на email"].filter(Boolean).join(" і ")}`
          : "відповідь збережено, але автоматично вона не дійшла — надішліть її зі своєї пошти",
      );
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Не вдалося надіслати");
    }
    setPending(false);
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(m.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* буфер обміну недоступний — email видно на картці */
    }
  };

  return (
    <li className={`rounded-[22px] bg-white p-5 shadow-[0_10px_30px_rgba(79,93,101,.08)] ${m.done && !open ? "opacity-75" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#eef6fb] px-2.5 py-1 text-xs font-extrabold text-[#067eb7]">{m.topic}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${m.hasAccount ? "bg-[#e7f7ee] text-[#1f9d55]" : "bg-[#f3f5f7] text-[#527083]"}`}>
              {m.hasAccount ? "Має акаунт" : "Без акаунта"}
            </span>
          </div>
          <p className="mt-2 font-extrabold">{m.name}</p>
          <p className="break-words text-sm text-[#527083]">
            <a href={`mailto:${m.email}`} className="text-[#098fd0] hover:underline">{m.email}</a>
            {m.phone && <> · <a href={`tel:${m.phone.replace(/\s/g, "")}`} className="hover:underline">{m.phone}</a></>}
            {m.order && <> · замовлення <b className="text-[#082c45]">{m.order}</b></>}
          </p>
        </div>
        <span className="text-xs text-[#8aa5b5]">{shortDate(m.createdAt)}</span>
      </div>
      <p className="mt-3 whitespace-pre-line break-words rounded-2xl bg-[#f7fafc] p-4 text-sm leading-relaxed text-[#264e65]">{m.message}</p>

      {/* Історія відповідей */}
      {m.replies && m.replies.length > 0 && (
        <ul className="mt-3 grid gap-2" aria-label="Відповіді">
          {m.replies.map((r) => (
            <li key={r.id} className="ml-4 rounded-2xl border-l-4 border-[#ffd51f] bg-[#fffbe6] p-4 text-sm sm:ml-8">
              <p className="flex flex-wrap gap-x-3 text-xs text-[#8a6100]">
                <b>Ваша відповідь</b>
                <span>{shortDate(r.createdAt)}</span>
                <span>
                  {[r.onSite && "на сайті", r.emailed && "на email"].filter(Boolean).join(" · ") || "не доставлено автоматично"}
                </span>
              </p>
              <p className="mt-1.5 whitespace-pre-line break-words leading-relaxed text-[#264e65]">{r.text}</p>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-sm font-bold">Відповідь для {m.name}</span>
            <textarea
              autoFocus
              rows={5}
              maxLength={REPLY_MAX}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (err) setErr("");
              }}
              className="w-full resize-y rounded-2xl border border-[#d5e5ef] bg-white px-4 py-3 text-sm outline-none focus:border-[#0aa4e8] focus:ring-4 focus:ring-sky-100"
              placeholder="Вітаємо! Дякуємо за звернення…"
            />
          </label>
          {canDeliver ? (
            <p className="text-xs text-[#527083]">Відповідь прийде {routes}.</p>
          ) : (
            <p className="rounded-2xl bg-[#fff4e5] px-4 py-3 text-sm text-[#8a4b00]">
              У покупця немає акаунта, а відправку листів із сайту ще не налаштовано — тож відповідь не дійде автоматично.
              Надішліть її зі своєї пошти: кнопка нижче відкриє готовий лист у Gmail.
            </p>
          )}
          {err && <p className="text-sm font-bold text-[#e5484d]" role="alert">{err}</p>}
          <div className="flex flex-wrap gap-2">
            {canDeliver ? (
              <button
                onClick={send}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-5 py-2.5 text-sm font-extrabold transition hover:bg-[#ffe044] disabled:opacity-60"
              >
                <Icon name="mail" className="h-4 w-4" /> {pending ? "Надсилаємо…" : "Надіслати відповідь"}
              </button>
            ) : (
              <>
                <a
                  href={gmailUrl(m, text)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-5 py-2.5 text-sm font-extrabold transition hover:bg-[#ffe044]"
                >
                  <Icon name="mail" className="h-4 w-4" /> Відкрити лист у Gmail
                </a>
                <button
                  onClick={copyEmail}
                  className="rounded-full bg-[#eef6fb] px-4 py-2.5 text-sm font-extrabold text-[#067eb7] transition hover:bg-[#dff4ff]"
                >
                  {copied ? "Скопійовано ✓" : "Скопіювати email"}
                </button>
              </>
            )}
            <button
              onClick={() => {
                setOpen(false);
                setErr("");
              }}
              className="rounded-full px-4 py-2.5 text-sm font-bold text-[#527083] transition hover:bg-[#f3f5f7]"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      {!open && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-4 py-2 text-sm font-extrabold transition hover:bg-[#ffe044]"
          >
            <Icon name="mail" className="h-4 w-4" /> {m.replies?.length ? "Відповісти ще" : "Відповісти"}
          </button>
          <button onClick={onToggle} className="rounded-full bg-[#eef6fb] px-4 py-2 text-sm font-extrabold text-[#067eb7] transition hover:bg-[#dff4ff]">
            {m.done ? "Повернути в нові" : "Позначити опрацьованим"}
          </button>
        </div>
      )}
    </li>
  );
}
