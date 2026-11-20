"use client";

import { useState } from "react";
import { categories } from "../catalog-data";
import { inputCls } from "../form-ui";
import AdminShell, { LoadError, Panel } from "./AdminShell";
import { ApiError, adminFetch, shortDate, useAdminData } from "./api";

type FeedCategory = { id: string; name: string; inStock: number };
type Supplier = {
  id: string;
  name: string;
  feedUrl: string;
  categoryMap: Record<string, string>;
  feedCategories: FeedCategory[];
  lastSyncAt?: string;
  lastSyncOk?: boolean;
  lastSyncMessage?: string;
  products: number;
};
type SyncResult = { created: number; updated: number; outOfStock: number; skippedNoPhoto: number; skippedUnmapped: number; skippedNotInStock: number };

export default function AdminSuppliers() {
  return (
    <AdminShell title="Постачальники">
      <SuppliersView />
    </AdminShell>
  );
}

function SuppliersView() {
  const { data, error, reload, setData } = useAdminData<{ suppliers: Supplier[] }>("/api/admin/suppliers");
  const [form, setForm] = useState({ name: "", feedUrl: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return <Panel><p className="text-sm text-[#527083]">Завантаження…</p></Panel>;

  const replace = (s: Supplier) => setData((d) => d && { suppliers: d.suppliers.some((x) => x.id === s.id) ? d.suppliers.map((x) => (x.id === s.id ? s : x)) : [...d.suppliers, s] });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const { supplier } = await adminFetch<{ supplier: Supplier }>("/api/admin/suppliers", { method: "POST", body: form });
      replace(supplier);
      setForm({ name: "", feedUrl: "" });
      setNotice({ ok: true, text: `Файл ${supplier.name} прочитано. Перевірте відповідність категорій нижче й натисніть «Оновити зараз».` });
    } catch (err) {
      setNotice({ ok: false, text: (err as ApiError).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <Panel>
        <h2 className="text-lg font-extrabold">Додати постачальника</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[#527083]">
          <li>Вставте посилання на XML-файл постачальника (формат для Prom / Rozetka).</li>
          <li>Оберіть, у яку нашу категорію потрапляють товари з кожної їхньої.</li>
          <li>Натисніть «Оновити зараз» — додадуться товари в наявності з фото. Далі ціни (РРЦ) і залишки оновлюються щодня самі.</li>
        </ol>
        <form onSubmit={add} noValidate className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
          <label className="sr-only" htmlFor="sup-name">Назва постачальника</label>
          <input id="sup-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Назва, напр. Ranger" className={inputCls()} />
          <label className="sr-only" htmlFor="sup-url">Посилання на XML-файл</label>
          <input id="sup-url" value={form.feedUrl} onChange={(e) => setForm({ ...form, feedUrl: e.target.value.trim() })} placeholder="https://…/feed.xml" className={inputCls()} />
          <button type="submit" disabled={busy} className="rounded-full bg-[#ffd51f] px-7 py-3 text-sm font-extrabold transition hover:bg-[#ffe044] disabled:opacity-60">
            {busy ? "Читаємо файл…" : "Додати"}
          </button>
        </form>
      </Panel>

      {notice && (
        <p role="status" className={`rounded-2xl px-4 py-3 text-sm font-semibold ${notice.ok ? "bg-[#e7f7ee] text-[#1f7a45]" : "bg-[#fdecec] text-[#c53035]"}`}>{notice.text}</p>
      )}

      {data.suppliers.length === 0 ? (
        <Panel><p className="text-center text-sm text-[#527083]">Постачальників ще немає.</p></Panel>
      ) : (
        data.suppliers.map((s) => (
          <SupplierCard key={s.id} supplier={s} onChange={replace} onDeleted={() => setData((d) => d && { suppliers: d.suppliers.filter((x) => x.id !== s.id) })} />
        ))
      )}
    </div>
  );
}

function SupplierCard({ supplier: s, onChange, onDeleted }: { supplier: Supplier; onChange: (s: Supplier) => void; onDeleted: () => void }) {
  const [map, setMap] = useState(s.categoryMap);
  const [busy, setBusy] = useState<"sync" | "save" | "delete" | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = JSON.stringify(map) !== JSON.stringify(s.categoryMap);
  const sorted = [...s.feedCategories].sort((a, b) => b.inStock - a.inStock);
  const willImport = sorted.filter((c) => map[c.id]).reduce((n, c) => n + c.inStock, 0);

  const save = async () => {
    setBusy("save");
    setNotice(null);
    try {
      const { supplier } = await adminFetch<{ supplier: Supplier }>(`/api/admin/suppliers/${s.id}`, { method: "PATCH", body: { categoryMap: map } });
      onChange(supplier);
      setMap(supplier.categoryMap);
      setNotice({ ok: true, text: "Категорії збережено" });
    } catch (e) {
      setNotice({ ok: false, text: (e as ApiError).message });
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy("sync");
    setNotice(null);
    try {
      if (dirty) await adminFetch(`/api/admin/suppliers/${s.id}`, { method: "PATCH", body: { categoryMap: map } });
      const { result, supplier } = await adminFetch<{ result: SyncResult; supplier: Supplier }>(`/api/admin/suppliers/${s.id}/sync`, { method: "POST" });
      onChange(supplier);
      setMap(supplier.categoryMap);
      const skipped = [
        result.skippedUnmapped && `без категорії — ${result.skippedUnmapped}`,
        result.skippedNoPhoto && `без фото — ${result.skippedNoPhoto}`,
      ].filter(Boolean);
      setNotice({
        ok: true,
        text: `Готово: додано ${result.created}, оновлено ${result.updated}, закінчилось ${result.outOfStock}.` + (skipped.length ? ` Не додано: ${skipped.join(", ")}.` : ""),
      });
    } catch (e) {
      setNotice({ ok: false, text: (e as ApiError).message });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await adminFetch(`/api/admin/suppliers/${s.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setNotice({ ok: false, text: (e as ApiError).message });
      setBusy(null);
    }
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold">{s.name}</h2>
          <p className="mt-0.5 break-all text-xs text-[#8aa5b5]">{s.feedUrl}</p>
          <p className="mt-2 text-sm text-[#527083]">
            На сайті: <b className="text-[#082c45]">{s.products}</b> товарів
            {s.lastSyncAt && (
              <>
                {" · "}оновлено {shortDate(s.lastSyncAt)}
                {s.lastSyncOk === false && <span className="font-semibold text-[#c53035]"> — помилка</span>}
              </>
            )}
          </p>
          {s.lastSyncMessage && <p className={`mt-1 text-xs ${s.lastSyncOk === false ? "text-[#c53035]" : "text-[#8aa5b5]"}`}>{s.lastSyncMessage}</p>}
        </div>
        <button type="button" onClick={sync} disabled={!!busy} className="inline-flex items-center gap-2 rounded-full bg-[#082c45] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#0b3a5a] disabled:opacity-60">
          {busy === "sync" && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />}
          {busy === "sync" ? "Оновлюємо…" : "Оновити зараз"}
        </button>
      </div>

      {notice && (
        <p role="status" className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${notice.ok ? "bg-[#e7f7ee] text-[#1f7a45]" : "bg-[#fdecec] text-[#c53035]"}`}>{notice.text}</p>
      )}

      <div className="mt-5 border-t border-[#e3edf3] pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-extrabold">Категорії постачальника → наші</h3>
          <p className="text-xs text-[#527083]">У наявності в обраних категоріях: <b className="text-[#082c45]">{willImport}</b></p>
        </div>
        <ul className="mt-3 divide-y divide-[#eef3f7]">
          {sorted.map((c) => (
            <li key={c.id} className="grid grid-cols-1 gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center">
              <label htmlFor={`map-${s.id}-${c.id}`} className="min-w-0 text-sm">
                <span className="font-bold">{c.name}</span>{" "}
                <span className={c.inStock ? "text-[#1f9d55]" : "text-[#8aa5b5]"}>· {c.inStock} в наявності</span>
              </label>
              <select
                id={`map-${s.id}-${c.id}`}
                value={map[c.id] ?? ""}
                onChange={(e) => setMap({ ...map, [c.id]: e.target.value })}
                className={`${inputCls()} py-2.5 ${map[c.id] ? "" : "text-[#8aa5b5]"}`}
              >
                <option value="">Не імпортувати</option>
                {categories.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={!dirty || !!busy} className="rounded-full bg-[#ffd51f] px-6 py-3 text-sm font-extrabold transition hover:bg-[#ffe044] disabled:opacity-50">
            {busy === "save" ? "Зберігаємо…" : "Зберегти категорії"}
          </button>
          <p className="text-xs text-[#8aa5b5]">Уже додані товари не переносяться — змінюється лише, куди потраплять нові.</p>
          {confirmDelete ? (
            <span className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={remove} disabled={!!busy} className="rounded-full bg-[#e5484d] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#c53035] disabled:opacity-60">Так, видалити</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-full px-3 py-2.5 text-xs font-bold text-[#527083] hover:bg-[#eef6fb]">Ні</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="ml-auto rounded-full px-4 py-2.5 text-xs font-bold text-[#c53035] transition hover:bg-[#fdecec]" title="Товари лишаться на сайті, але більше не оновлюватимуться">
              Видалити постачальника
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
