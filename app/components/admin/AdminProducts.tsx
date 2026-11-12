"use client";

/* eslint-disable @next/next/no-img-element -- мініатюри товарів з Unsplash, як і в каталозі */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import { SortSelect } from "../catalog-ui";
import { categories, categoryBySlug, formatPrice, LOW_STOCK, type Product } from "../catalog-data";
import { productUrl } from "../product-details";
import { matchesSearch } from "../search";
import AdminShell, { LoadError } from "./AdminShell";
import ProductEditor from "./ProductEditor";
import { adminFetch, type ApiError, useAdminData } from "./api";

type StockFilter = "all" | "low" | "out" | "hidden";

const stockFilters: { id: StockFilter; label: string }[] = [
  { id: "all", label: "Усі" },
  { id: "low", label: "Закінчуються" },
  { id: "out", label: "Немає в наявності" },
  { id: "hidden", label: "Приховані" },
];

const categoryOptions = [{ id: "all", label: "Усі категорії" }, ...categories.map((c) => ({ id: c.slug as string, label: c.name }))];

export default function AdminProducts() {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  return (
    <AdminShell
      title="Товари"
      actions={
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-5 py-2.5 text-sm font-extrabold shadow-[0_8px_20px_rgba(255,213,31,.35)] transition hover:bg-[#ffe044]"
        >
          <span className="text-lg leading-none">+</span> Додати товар
        </button>
      }
    >
      <Products editing={editing} setEditing={setEditing} />
    </AdminShell>
  );
}

function Products({ editing, setEditing }: { editing: string | "new" | null; setEditing: (v: string | "new" | null) => void }) {
  const { data, error, reload, setData } = useAdminData<{ products: Product[] }>("/api/admin/products");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [stock, setStock] = useState<StockFilter>("all");
  const [notice, setNotice] = useState("");

  // ?edit=id — відкрити товар одразу (посилання з огляду); ?stock=low — фільтр
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- одноразове читання URL після гідратації */
    const edit = sp.get("edit");
    if (edit) setEditing(edit);
    const s = sp.get("stock");
    if (stockFilters.some((f) => f.id === s)) setStock(s as StockFilter);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [setEditing]);

  const products = useMemo(() => data?.products ?? [], [data]);
  const visible = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === "all" || p.category === category) &&
          (stock === "all" ||
            (stock === "low" && !p.hidden && p.stock > 0 && p.stock <= LOW_STOCK) ||
            (stock === "out" && !p.hidden && p.stock === 0) ||
            (stock === "hidden" && p.hidden)) &&
          (!query.trim() || matchesSearch(p, query) || p.id.includes(query.trim().toLowerCase())),
      ),
    [products, category, stock, query],
  );

  const replace = (product: Product) =>
    setData((d) => d && { products: d.products.some((p) => p.id === product.id) ? d.products.map((p) => (p.id === product.id ? product : p)) : [...d.products, product] });

  const quickUpdate = async (p: Product, patch: Partial<Pick<Product, "stock" | "price" | "hidden">>) => {
    setNotice("");
    try {
      const { product } = await adminFetch<{ product: Product }>(`/api/admin/products/${p.id}`, { method: "PATCH", body: patch });
      replace(product);
      return true;
    } catch (e) {
      setNotice((e as ApiError).message);
      return false;
    }
  };

  if (error) return <LoadError message={error} onRetry={reload} />;
  const current = editing && editing !== "new" ? products.find((p) => p.id === editing) : undefined;

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 rounded-[22px] bg-white p-4 shadow-[0_10px_30px_rgba(79,93,101,.08)] xl:flex-row xl:items-center">
        <label className="relative xl:w-80">
          <span className="sr-only">Пошук товарів</span>
          <Icon name="search" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#067eb7]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Назва, бренд або код"
            className="w-full rounded-full border border-[#d5e5ef] bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#0aa4e8] focus:ring-4 focus:ring-sky-100"
          />
        </label>
        <SortSelect label="Категорія" className="" value={category} options={categoryOptions} onChange={setCategory} />
        <div className="flex flex-wrap gap-2 xl:ml-auto" role="group" aria-label="Наявність">
          {stockFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setStock(f.id)}
              aria-pressed={stock === f.id}
              className={`rounded-full px-3.5 py-2 text-sm font-bold transition ${stock === f.id ? "bg-[#082c45] text-white" : "bg-[#eef6fb] text-[#264e65] hover:bg-[#dff4ff]"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {notice && <p role="alert" className="rounded-2xl bg-[#fdecec] px-4 py-3 text-sm font-semibold text-[#c53035]">{notice}</p>}

      {!data ? (
        <div className="h-96 animate-pulse rounded-[22px] bg-white" />
      ) : (
        <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_10px_30px_rgba(79,93,101,.08)]">
          <p className="border-b border-[#e3edf3] px-5 py-3 text-sm text-[#527083]" aria-live="polite">
            Показано <b className="text-[#082c45]">{visible.length}</b> з {products.length}
          </p>
          {visible.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#527083]">Нічого не знайдено — змініть фільтри.</p>
          ) : (
            <ul className="divide-y divide-[#e3edf3]" data-testid="admin-products">
              {visible.map((p) => (
                <ProductRow key={p.id} product={p} onEdit={() => setEditing(p.id)} onQuick={(patch) => quickUpdate(p, patch)} />
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && (editing === "new" || current) && (
        <ProductEditor
          product={current}
          onClose={() => setEditing(null)}
          onSaved={(product, created) => {
            replace(product);
            setEditing(null);
            setNotice("");
            if (created) setQuery("");
          }}
        />
      )}
    </div>
  );
}

function ProductRow({
  product: p,
  onEdit,
  onQuick,
}: {
  product: Product;
  onEdit: () => void;
  onQuick: (patch: Partial<Pick<Product, "stock" | "price" | "hidden">>) => Promise<boolean>;
}) {
  const stockTone = p.stock === 0 ? "text-[#c53035]" : p.stock <= LOW_STOCK ? "text-[#c27c00]" : "text-[#1f9d55]";
  return (
    <li className={`grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5 lg:grid-cols-[64px_minmax(0,1fr)_200px_150px_auto] ${p.hidden ? "bg-[#f7fafc]" : ""}`} data-testid={`admin-product-${p.id}`}>
      <img src={p.image} alt="" className={`h-12 w-16 rounded-[10px] object-cover ${p.hidden ? "opacity-40 grayscale" : ""}`} loading="lazy" />
      <div className="min-w-0">
        <button onClick={onEdit} className="line-clamp-1 text-left text-sm font-extrabold hover:text-[#098fd0]">{p.name}</button>
        <p className="truncate text-xs text-[#527083]">
          {categoryBySlug[p.category].name} · {p.brand} · <span className="font-mono">{p.id}</span>
          {p.hidden && <span className="ml-2 rounded-full bg-[#e3edf3] px-2 py-0.5 font-bold text-[#527083]">Прихований</span>}
        </p>
      </div>
      <div className="col-span-2 flex items-center gap-2 lg:col-span-1">
        <span className="w-16 text-xs text-[#8aa5b5] lg:hidden">Ціна</span>
        <InlineNumber label={`Ціна ${p.name}`} value={p.price} suffix="₴" onSave={(price) => onQuick({ price })} />
        {p.oldPrice && <span className="whitespace-nowrap text-xs text-slate-400 line-through">{formatPrice(p.oldPrice)}</span>}
      </div>
      <div className="col-span-2 flex items-center gap-2 lg:col-span-1">
        <span className="w-16 text-xs text-[#8aa5b5] lg:hidden">Залишок</span>
        <button onClick={() => onQuick({ stock: Math.max(0, p.stock - 1) })} disabled={p.stock === 0} aria-label={`Зменшити залишок ${p.name}`} className="grid h-8 w-8 place-items-center rounded-full bg-[#eef6fb] font-bold text-[#264e65] disabled:opacity-35">−</button>
        <InlineNumber label={`Залишок ${p.name}`} value={p.stock} suffix="шт." onSave={(stock) => onQuick({ stock })} className={stockTone} />
        <button onClick={() => onQuick({ stock: p.stock + 1 })} aria-label={`Збільшити залишок ${p.name}`} className="grid h-8 w-8 place-items-center rounded-full bg-[#eef6fb] font-bold text-[#264e65]">+</button>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-1.5 lg:col-span-1 lg:justify-end">
        <button onClick={onEdit} className="rounded-full bg-[#eef6fb] px-3.5 py-2 text-xs font-extrabold text-[#067eb7] transition hover:bg-[#dff4ff]">Редагувати</button>
        <button
          onClick={() => onQuick({ hidden: !p.hidden })}
          className="rounded-full px-3.5 py-2 text-xs font-extrabold text-[#527083] transition hover:bg-[#eef6fb]"
        >
          {p.hidden ? "Показати" : "Приховати"}
        </button>
        {!p.hidden && (
          <Link href={productUrl(p)} target="_blank" aria-label={`Відкрити ${p.name} на сайті`} className="grid h-8 w-8 place-items-center rounded-full text-[#8aa5b5] transition hover:bg-[#eef6fb] hover:text-[#098fd0]">
            <Icon name="arrow" className="h-4 w-4 -rotate-45" />
          </Link>
        )}
      </div>
    </li>
  );
}

/** Число, яке можна змінити прямо в списку: збереження по Enter або при виході з поля */
function InlineNumber({
  value,
  onSave,
  label,
  suffix,
  className = "",
}: {
  value: number;
  onSave: (v: number) => Promise<boolean>;
  label: string;
  suffix: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const commit = async () => {
    if (draft === null) return;
    const n = Number(draft.replace(/\s/g, ""));
    if (!Number.isInteger(n) || n < 0 || n === value) {
      setDraft(null);
      return;
    }
    setState("saving");
    const ok = await onSave(n);
    setState(ok ? "saved" : "error");
    setDraft(null);
    window.setTimeout(() => setState("idle"), 1500);
  };

  return (
    <span className="relative inline-flex items-center">
      <input
        inputMode="numeric"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(null);
        }}
        className={`w-20 rounded-[10px] border bg-white px-2.5 py-1.5 text-right text-sm font-extrabold outline-none transition focus:border-[#0aa4e8] focus:ring-4 focus:ring-sky-100 ${
          state === "saved" ? "border-[#1f9d55]" : state === "error" ? "border-[#e5484d]" : "border-[#d5e5ef]"
        } ${className}`}
      />
      <span className="ml-1.5 text-xs text-[#8aa5b5]">{suffix}</span>
      {state === "saved" && <span className="sr-only" role="status">Збережено</span>}
    </span>
  );
}
