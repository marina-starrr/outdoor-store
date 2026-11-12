"use client";

/* eslint-disable @next/next/no-img-element -- фото товарів з Unsplash з CSS-фільтрами, як на головній */
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";
import { useLists } from "./Lists";
import { productUrl } from "./product-details";
import {
  categoryBySlug,
  discountPercent,
  formatPrice,
  productsWord,
  type Product,
} from "./catalog-data";

/* ---------- Синхронізація стану з адресним рядком ---------- */

/**
 * Читає параметри з URL після гідратації (сторінка лишається статичною,
 * без Suspense) — так посиланням з фільтрами можна поділитися.
 */
export function readSearchParams() {
  return new URLSearchParams(window.location.search);
}

export function writeSearchParams(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value) sp.set(key, value);
  const qs = sp.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  if (url !== `${window.location.pathname}${window.location.search}`)
    window.history.replaceState(null, "", url);
}

export const listParam = (sp: URLSearchParams, key: string) =>
  sp.get(key)?.split(",").filter(Boolean) ?? [];

export const numParam = (sp: URLSearchParams, key: string) => {
  const v = Number(sp.get(key));
  return Number.isFinite(v) && v > 0 ? v : undefined;
};

/* ---------- Пагінація з «Показати більше» ---------- */

/** Сторінки [from..to] показуються разом: «Показати більше» збільшує `to` */
export function usePaging(total: number, pageSize: number, resetKey: string) {
  const [range, setRange] = useState({ from: 1, to: 1, key: resetKey });
  // Скидаємо на першу сторінку, коли змінились фільтри/сортування
  if (range.key !== resetKey) setRange({ from: 1, to: 1, key: resetKey });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const to = Math.min(range.to, totalPages);
  const from = Math.min(range.from, to);

  return {
    from,
    to,
    totalPages,
    start: (from - 1) * pageSize,
    end: to * pageSize,
    goTo: (p: number) => setRange({ from: p, to: p, key: resetKey }),
    showMore: () => setRange({ from, to: to + 1, key: resetKey }),
  };
}

export function Pagination({
  from,
  to,
  totalPages,
  remaining,
  onPage,
  onMore,
}: {
  from: number;
  to: number;
  totalPages: number;
  remaining: number;
  onPage: (p: number) => void;
  onMore: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
      {to < totalPages && (
        <button
          onClick={onMore}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#eaf3f8] px-6 text-sm font-extrabold text-[#264e65] transition hover:bg-[#d8ecf7]"
        >
          Показати більше
          <span className="text-xs font-semibold text-[#527083]">
            ще {remaining}
          </span>
        </button>
      )}
      <nav aria-label="Сторінки" className="flex items-center gap-2">
        {pageList(to, totalPages).map((p, i) =>
          p === "…" ? (
            <span
              key={`gap-${i}`}
              className="grid h-11 w-11 place-items-center rounded-full bg-[#eaf3f8] font-bold text-[#527083]"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-label={`Сторінка ${p}`}
              aria-current={p === to ? "page" : undefined}
              className={`grid h-11 w-11 place-items-center rounded-full text-sm font-extrabold transition ${
                p >= from && p <= to
                  ? "bg-[#ffd51f] text-[#082c45] shadow-[0_8px_20px_rgba(255,213,31,.35)]"
                  : "bg-[#eaf3f8] text-[#264e65] hover:bg-[#d8ecf7]"
              }`}
            >
              {p}
            </button>
          ),
        )}
      </nav>
    </div>
  );
}

/** Номери сторінок з «…», напр. [1, 2, 3, "…", 12] */
function pageList(current: number, total: number): (number | "…")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 2, total - 1].forEach((p) => pages.add(p));
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  return sorted.flatMap((p, i) =>
    i > 0 && p - sorted[i - 1] > 1 ? (["…", p] as const) : [p],
  );
}

/* ---------- Елементи фільтрів ---------- */

export function PriceRange({
  bounds,
  value,
  step = 100,
  onChange,
}: {
  bounds: [number, number];
  value: [number, number];
  step?: number;
  onChange: (value: [number, number]) => void;
}) {
  const [lo, hi] = bounds;
  const [min, max] = value;
  const pct = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;

  return (
    <fieldset>
      <legend className="text-base font-extrabold">Ціна, ₴</legend>
      <div className="price-range relative mt-4 h-5">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#ffd51f]"
          style={{ left: `${pct(min)}%`, right: `${100 - pct(max)}%` }}
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={min}
          aria-label="Мінімальна ціна"
          onChange={(e) =>
            onChange([Math.min(Number(e.target.value), max - step), max])
          }
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={max}
          aria-label="Максимальна ціна"
          onChange={(e) =>
            onChange([min, Math.max(Number(e.target.value), min + step)])
          }
        />
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#3d5d70]">
        <PriceInput
          label="Ціна від"
          value={min}
          onCommit={(v) => onChange([clamp(v, lo, max - step), max])}
        />
        <span className="text-[#8aa5b5]">—</span>
        <PriceInput
          label="Ціна до"
          value={max}
          onCommit={(v) => onChange([min, clamp(v, min + step, hi)])}
        />
      </div>
    </fieldset>
  );
}

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** Поле для точного введення ціни — застосовується по Enter або при втраті фокусу */
function PriceInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = Number(draft?.replace(/\D/g, ""));
    if (draft !== null && n > 0) onCommit(n);
    setDraft(null);
  };
  return (
    <input
      inputMode="numeric"
      aria-label={label}
      value={draft ?? String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className="w-full min-w-0 rounded-[10px] border border-transparent bg-white px-2.5 py-1.5 text-center outline-none transition focus:border-[#0aa4e8]"
    />
  );
}

export function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="mt-6">
      <legend className="text-base font-extrabold">{title}</legend>
      <div className="mt-3 grid gap-2.5">{children}</div>
    </fieldset>
  );
}

export function Checkbox({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  const disabled = count === 0 && !checked;
  return (
    <label
      className={`group flex items-center gap-2.5 text-sm ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border border-[#b9d3e2] bg-white transition peer-checked:border-[#ffd51f] peer-checked:bg-[#ffd51f] peer-focus-visible:ring-4 peer-focus-visible:ring-sky-200 group-hover:border-[#098fd0]">
        {checked && (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#082c45" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12 5 5 9-10" />
          </svg>
        )}
      </span>
      <span className="flex-1 text-[#264e65]">{label}</span>
      {count !== undefined && (
        <span className="text-xs font-semibold text-[#8aa5b5]">{count}</span>
      )}
    </label>
  );
}

export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-6 w-full rounded-full bg-white py-3 text-sm font-extrabold shadow-[0_4px_14px_rgba(79,93,101,.08)] transition hover:bg-[#fffbe0]"
    >
      Скинути фільтри
    </button>
  );
}

export type Chip = { key: string; label: string; remove: () => void };

export function ActiveChips({
  total,
  query,
  chips,
}: {
  total: number;
  query?: string;
  chips: Chip[];
}) {
  return (
    <div className="mb-4 flex min-h-8 flex-wrap items-center gap-2 text-sm">
      <span className="mr-1 text-[#527083]" aria-live="polite">
        Знайдено <b className="text-[#082c45]">{total}</b>{" "}
        {query !== undefined ? productsWord(total) : categoriesWord(total)}
        {query && <> за запитом «{query}»</>}
      </span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={chip.remove}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf6fd] py-1.5 pl-3 pr-2 text-xs font-bold text-[#067eb7] transition hover:bg-[#d8effb]"
          aria-label={`Прибрати фільтр ${chip.label}`}
        >
          {chip.label}
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

const categoriesWord = (n: number) =>
  n % 10 === 1 && n % 100 !== 11
    ? "категорію"
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
      ? "категорії"
      : "категорій";

/* ---------- Мобільна панель фільтрів ---------- */

export function MobileFiltersButton({
  activeCount,
  onClick,
}: {
  activeCount: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold shadow-[0_6px_20px_rgba(79,93,101,.1)] lg:hidden"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
      Фільтри
      {activeCount > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#ffd51f] px-1 text-[11px] font-black">
          {activeCount}
        </span>
      )}
    </button>
  );
}

export function FilterDrawer({
  open,
  onClose,
  resultLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  resultLabel: string;
  children: ReactNode;
}) {
  // Блокуємо прокрутку сторінки, поки відкрита панель; Esc закриває
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Фільтри">
      <button
        className="absolute inset-0 bg-[#082c45]/40 backdrop-blur-sm"
        aria-label="Закрити фільтри"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 flex w-[min(340px,88vw)] flex-col bg-[#f7fafc] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-lg font-extrabold">Фільтри</p>
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full bg-white"
            aria-label="Закрити фільтри"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        <div className="border-t border-sky-100 bg-white p-4">
          <button
            onClick={onClose}
            className="w-full rounded-full bg-[#ffd51f] py-3.5 text-sm font-extrabold transition hover:bg-[#ffe044]"
          >
            {resultLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Сортування ---------- */

export function SortSelect<T extends string>({
  value,
  options,
  onChange,
  label = "Сортування",
  className = "ml-auto",
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
  /** Підпис для екранних читачів; той самий випадний список — і для інших фільтрів */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId();
  const current = options.find((o) => o.id === value) ?? options[0];

  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.id === value)));
    setOpen(true);
  };
  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };
  const choose = (i: number) => {
    onChange(options[i].id);
    close();
  };

  // Фокус на список при відкритті; закриття кліком поза компонентом
  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onListKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    const moves: Record<string, () => number> = {
      ArrowDown: () => Math.min(last, active + 1),
      ArrowUp: () => Math.max(0, active - 1),
      Home: () => 0,
      End: () => last,
    };
    if (moves[e.key]) {
      e.preventDefault();
      setActive(moves[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-label={`${label}: ${current.label}`}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
        }}
        className={`flex items-center gap-2.5 rounded-full bg-white py-2.5 pl-4 pr-3.5 text-sm font-bold shadow-[0_6px_20px_rgba(79,93,101,.1)] outline-none transition hover:shadow-[0_8px_24px_rgba(79,93,101,.16)] focus-visible:ring-4 focus-visible:ring-sky-100 ${open ? "ring-4 ring-sky-100" : ""}`}
      >
        {label === "Сортування" && <SortIcon />}
        <span className="whitespace-nowrap">{current.label}</span>
        <Chevron className={`h-4 w-4 text-[#067eb7] transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={`${uid}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${uid}-opt-${active}`}
          onKeyDown={onListKey}
          className="absolute right-0 top-[calc(100%+8px)] z-40 min-w-full w-max overflow-hidden rounded-[18px] border border-[#e3edf3] bg-white p-1.5 shadow-[0_20px_50px_rgba(8,44,69,.16)] outline-none"
        >
          {options.map((o, i) => {
            const selected = o.id === value;
            return (
              <li
                key={o.id}
                id={`${uid}-opt-${i}`}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-center justify-between gap-6 rounded-xl px-3.5 py-2.5 text-sm transition-colors ${
                  i === active ? "bg-[#eef6fb]" : ""
                } ${selected ? "font-extrabold text-[#082c45]" : "font-semibold text-[#3d5d70]"}`}
              >
                {o.label}
                <svg viewBox="0 0 24 24" className={`h-4 w-4 text-[#098fd0] ${selected ? "" : "invisible"}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#067eb7]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h11M4 12h7M4 18h4M17 8v12m0 0-3-3m3 3 3-3" />
    </svg>
  );
}

/* ---------- Хлібні крихти ---------- */

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Хлібні крихти" className="text-sm text-[#527083]">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-1.5">
            {i > 0 && <Chevron />}
            {item.href ? (
              <Link href={item.href} className="transition hover:text-[#098fd0]">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-semibold text-[#082c45]">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ---------- Картка товару ---------- */

/** Кнопки «в обране» та «порівняти» поверх фото товару */
export function CardActions({ productId, productName }: { productId: string; productName: string }) {
  const { isFavorite, toggleFavorite, isCompared, toggleCompare } = useLists();
  const fav = isFavorite(productId);
  const cmp = isCompared(productId);
  const btn =
    "grid h-9 w-9 place-items-center rounded-full shadow-[0_4px_14px_rgba(8,44,69,.18)] backdrop-blur transition hover:scale-110";
  return (
    <div className="absolute right-3 top-3 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => toggleFavorite(productId)}
        aria-pressed={fav}
        aria-label={fav ? `Прибрати ${productName} з обраного` : `Додати ${productName} в обране`}
        title={fav ? "В обраному" : "В обране"}
        className={`${btn} ${fav ? "bg-white text-[#e5484d]" : "bg-white/85 text-[#264e65] hover:text-[#e5484d]"}`}
      >
        <Icon name="heart" filled={fav} className="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        onClick={() => toggleCompare(productId)}
        aria-pressed={cmp}
        aria-label={cmp ? `Прибрати ${productName} з порівняння` : `Додати ${productName} до порівняння`}
        title={cmp ? "У порівнянні" : "Порівняти"}
        className={`${btn} ${cmp ? "bg-[#098fd0] text-white" : "bg-white/85 text-[#264e65] hover:text-[#098fd0]"}`}
      >
        <Icon name="compare" className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}

export function ProductCard({
  product,
  onAdd,
  showCategory = false,
}: {
  product: Product;
  onAdd: () => void;
  /** На сторінці категорії підпис — назва категорії; при пошуку — посилання на неї */
  showCategory?: boolean;
}) {
  const discount = discountPercent(product);
  const badge = discount
    ? `−${discount}%`
    : product.hit
      ? "Хіт"
      : product.isNew
        ? "Новинка"
        : null;
  const category = categoryBySlug[product.category];

  return (
    <article className="product-card group flex flex-col !rounded-[22px] !p-2">
      <div className="relative">
      <Link
        href={productUrl(product)}
        tabIndex={-1}
        aria-hidden="true"
        className="relative block aspect-[16/10] overflow-hidden rounded-[16px] bg-sky-50"
      >
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className={`h-full w-full object-cover brightness-[1.05] saturate-[1.1] transition duration-700 group-hover:scale-105 ${product.inStock ? "" : "grayscale-[60%]"}`}
        />
        {badge && (
          <span
            className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-black ${badge === "Новинка" ? "bg-[#00acff] text-white" : "bg-[#ffd51f] text-[#082c45]"}`}
          >
            {badge}
          </span>
        )}
        {!product.inStock && (
          <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-[#527083]">
            Очікується
          </span>
        )}
      </Link>
      <CardActions productId={product.id} productName={product.name} />
      </div>

      <div className="flex flex-1 flex-col px-2 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          {showCategory ? (
            <Link
              href={`/catalog/${category.slug}`}
              className="truncate text-[11px] font-bold uppercase tracking-[0.1em] text-[#098fd0] hover:underline"
            >
              {category.name}
            </Link>
          ) : (
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.1em] text-[#098fd0]">
              {category.name}
            </p>
          )}
          <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#527083]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#f5ad00]" fill="currentColor" aria-hidden="true">
              <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
            </svg>
            {product.rating.toFixed(1)}
            <span className="font-medium text-[#8aa5b5]">({product.reviews})</span>
          </span>
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-[15px] font-extrabold leading-snug">
          <Link
            href={productUrl(product)}
            className="transition hover:text-[#098fd0]"
          >
            {product.name}
          </Link>
        </h3>
        <p className="mt-1 text-xs text-[#527083]">{product.specs}</p>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-black">{formatPrice(product.price)}</span>
            {product.oldPrice && (
              <span className="text-xs font-semibold text-slate-400 line-through">
                {formatPrice(product.oldPrice)}
              </span>
            )}
          </div>
          <button
            onClick={onAdd}
            disabled={!product.inStock}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[#ffd51f] text-[#082c45] shadow-[0_8px_20px_rgba(255,213,31,.3)] transition hover:-translate-y-0.5 hover:bg-[#ffe044] disabled:cursor-not-allowed disabled:bg-[#e6eef3] disabled:text-[#8aa5b5] disabled:shadow-none disabled:hover:translate-y-0"
            aria-label={
              product.inStock
                ? `Додати ${product.name} у кошик`
                : `${product.name} немає в наявності`
            }
          >
            <Icon name="cart" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </article>
  );
}

/* ---------- Порожній стан ---------- */

export function EmptyState({
  title,
  text,
  onReset,
}: {
  title: string;
  text: string;
  onReset: () => void;
}) {
  return (
    <div className="rounded-[24px] bg-white px-6 py-16 text-center shadow-[0_18px_52px_rgba(79,93,101,.1)]">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#eef9ff] text-[#067eb7]">
        <Icon name="tent" className="h-8 w-8" />
      </span>
      <p className="mt-5 text-xl font-extrabold">{title}</p>
      <p className="mt-2 text-sm text-[#527083]">{text}</p>
      <button
        onClick={onReset}
        className="mt-6 rounded-full bg-[#ffd51f] px-6 py-3 text-sm font-extrabold transition hover:bg-[#ffe044]"
      >
        Скинути фільтри
      </button>
    </div>
  );
}

export function Chevron({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export const scrollToId = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
