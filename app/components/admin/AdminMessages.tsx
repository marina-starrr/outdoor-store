"use client";

import { useMemo, useState } from "react";
import Icon from "../Icon";
import AdminShell, { LoadError, Panel } from "./AdminShell";
import { adminFetch, shortDate, useAdminData } from "./api";

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
  const { data, error, reload, setData } = useAdminData<{ messages: Message[] }>("/api/admin/messages");
  const [filter, setFilter] = useState<Filter>("new");
  const messages = useMemo(() => data?.messages ?? [], [data]);
  const visible = messages.filter((m) => filter === "all" || (filter === "done" ? m.done : !m.done));

  const toggle = async (m: Message) => {
    const { message } = await adminFetch<{ message: Message }>(`/api/admin/messages/${m.id}`, { method: "PATCH", body: { done: !m.done } });
    setData((d) => d && { messages: d.messages.map((x) => (x.id === m.id ? message : x)) });
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
            <li key={m.id} className={`rounded-[22px] bg-white p-5 shadow-[0_10px_30px_rgba(79,93,101,.08)] ${m.done ? "opacity-75" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-[#eef6fb] px-2.5 py-1 text-xs font-extrabold text-[#067eb7]">{m.topic}</span>
                  <p className="mt-2 font-extrabold">{m.name}</p>
                  <p className="text-sm text-[#527083]">
                    <a href={`mailto:${m.email}`} className="text-[#098fd0] hover:underline">{m.email}</a>
                    {m.phone && <> · <a href={`tel:${m.phone.replace(/\s/g, "")}`} className="hover:underline">{m.phone}</a></>}
                    {m.order && <> · замовлення <b className="text-[#082c45]">{m.order}</b></>}
                  </p>
                </div>
                <span className="text-xs text-[#8aa5b5]">{shortDate(m.createdAt)}</span>
              </div>
              <p className="mt-3 whitespace-pre-line rounded-2xl bg-[#f7fafc] p-4 text-sm leading-relaxed text-[#264e65]">{m.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topic} — Family Camping`)}`}
                  className="inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-4 py-2 text-sm font-extrabold transition hover:bg-[#ffe044]"
                >
                  <Icon name="mail" className="h-4 w-4" /> Відповісти
                </a>
                <button onClick={() => toggle(m)} className="rounded-full bg-[#eef6fb] px-4 py-2 text-sm font-extrabold text-[#067eb7] transition hover:bg-[#dff4ff]">
                  {m.done ? "Повернути в нові" : "Позначити опрацьованим"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
