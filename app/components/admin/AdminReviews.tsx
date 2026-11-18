"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "../Icon";
import AdminShell, { LoadError, Panel } from "./AdminShell";
import { ApiError, adminFetch, shortDate, useAdminData } from "./api";

type Status = "pending" | "approved" | "rejected";

type Review = {
  id: string;
  productId: string;
  author: string;
  email: string;
  rating: number;
  text: string;
  createdAt: string;
  status: Status;
  verified: boolean;
  product: { name: string; category: string };
};

const filters: { id: Status | "all"; label: string }[] = [
  { id: "pending", label: "На модерації" },
  { id: "approved", label: "Схвалені" },
  { id: "rejected", label: "Відхилені" },
  { id: "all", label: "Усі" },
];

const statusInfo: Record<Status, [string, string]> = {
  pending: ["На модерації", "bg-[#fff4c2] text-[#8a6100]"],
  approved: ["Схвалено", "bg-[#e7f7ee] text-[#1f9d55]"],
  rejected: ["Відхилено", "bg-[#fdecec] text-[#c53035]"],
};

export default function AdminReviews() {
  return (
    <AdminShell title="Відгуки">
      <Reviews />
    </AdminShell>
  );
}

function Reviews() {
  const { data, error, reload, setData } = useAdminData<{ reviews: Review[] }>("/api/admin/reviews");
  const [filter, setFilter] = useState<Status | "all">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const reviews = useMemo(() => data?.reviews ?? [], [data]);
  const visible = reviews.filter((r) => filter === "all" || r.status === filter);
  const count = (f: Status | "all") => reviews.filter((r) => f === "all" || r.status === f).length;

  const setStatus = async (r: Review, status: Status) => {
    setBusy(r.id);
    setNotice("");
    try {
      await adminFetch(`/api/admin/reviews/${r.id}`, { method: "PATCH", body: { status } });
      setData((d) => d && { reviews: d.reviews.map((x) => (x.id === r.id ? { ...x, status } : x)) });
      setNotice(status === "approved" ? `Відгук ${r.author} опубліковано на сайті` : status === "rejected" ? `Відгук ${r.author} відхилено` : "Відгук повернуто на модерацію");
    } catch (e) {
      setNotice((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: Review) => {
    setBusy(r.id);
    try {
      await adminFetch(`/api/admin/reviews/${r.id}`, { method: "DELETE" });
      setData((d) => d && { reviews: d.reviews.filter((x) => x.id !== r.id) });
      setNotice(`Відгук ${r.author} видалено`);
    } catch (e) {
      setNotice((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <LoadError message={error} onRetry={reload} />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Фільтр відгуків">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${filter === f.id ? "bg-[#082c45] text-white" : "bg-white text-[#264e65] shadow-[0_6px_20px_rgba(79,93,101,.08)] hover:bg-[#eef6fb]"}`}
          >
            {f.label}
            <span className={`ml-1.5 text-xs ${filter === f.id ? "text-[#ffd51f]" : "text-[#8aa5b5]"}`}>{count(f.id)}</span>
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="rounded-2xl bg-[#e1f0f9] px-4 py-3 text-sm font-semibold text-[#067eb7]">
          {notice}
        </p>
      )}

      {!data ? (
        <div className="h-48 animate-pulse rounded-[22px] bg-white" />
      ) : visible.length === 0 ? (
        <Panel className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#fff4c2] text-[#c29200]">
            <Icon name="star" className="h-7 w-7" />
          </span>
          <p className="mt-3 font-extrabold">{filter === "pending" ? "Нових відгуків немає" : "Відгуків немає"}</p>
          <p className="mt-1 text-sm text-[#527083]">Покупці з акаунтом пишуть відгуки на сторінці товару. На сайті вони з’являються після вашого схвалення.</p>
        </Panel>
      ) : (
        <ul className="grid gap-3" data-testid="admin-reviews">
          {visible.map((r) => (
            <li key={r.id} className="rounded-[22px] bg-white p-4 shadow-[0_10px_30px_rgba(79,93,101,.08)] sm:p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[#f5ad00]" aria-label={`Оцінка ${r.rating} з 5`}>
                  {"★".repeat(r.rating)}
                  <span className="text-[#dbe6ee]">{"★".repeat(5 - r.rating)}</span>
                </span>
                <b>{r.author}</b>
                <span className="text-xs text-[#527083]">{r.email} · {shortDate(r.createdAt)}</span>
                {r.verified && <span className="rounded-full bg-[#e7f7ee] px-2 py-0.5 text-xs font-bold text-[#1f9d55]">Підтверджена покупка</span>}
                <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-extrabold ${statusInfo[r.status][1]}`}>{statusInfo[r.status][0]}</span>
              </div>
              <p className="mt-1 text-sm">
                про{" "}
                <Link href={`/catalog/${r.product.category}/${r.productId}`} target="_blank" className="font-bold text-[#098fd0] hover:underline">
                  {r.product.name}
                </Link>
              </p>
              <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-[#264e65]">{r.text}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {r.status !== "approved" && (
                  <button onClick={() => setStatus(r, "approved")} disabled={busy === r.id} className="rounded-full bg-[#ffd51f] px-4 py-2 text-sm font-extrabold transition hover:bg-[#ffe044] disabled:opacity-60">
                    Опублікувати
                  </button>
                )}
                {r.status !== "rejected" && (
                  <button onClick={() => setStatus(r, "rejected")} disabled={busy === r.id} className="rounded-full bg-[#eef6fb] px-4 py-2 text-sm font-extrabold text-[#264e65] transition hover:bg-[#dff4ff] disabled:opacity-60">
                    Відхилити
                  </button>
                )}
                <button onClick={() => remove(r)} disabled={busy === r.id} className="rounded-full px-4 py-2 text-sm font-extrabold text-[#c53035] transition hover:bg-[#fdecec] disabled:opacity-60">
                  Видалити
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
