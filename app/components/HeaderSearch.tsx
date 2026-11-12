"use client";

/* eslint-disable @next/next/no-img-element -- мініатюри товарів з Unsplash, як і в каталозі */
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";
import { useCatalog } from "./Catalog";
import { categoryBySlug, formatPrice } from "./catalog-data";
import { productUrl } from "./product-details";
import { normalize, searchProducts } from "./search";

const POPULAR = ["Намет", "Спальник", "Рюкзак", "Ліхтар", "Мангал", "Гамак"];

/** Підсвічує в назві слова із запиту */
function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const tokens = normalize(query).split(" ").filter((t) => t.length > 1);
  if (!tokens.length) return text;
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "giu");
  return text.split(re).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="rounded bg-[#fff4c2] px-0.5 text-inherit">{part}</mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/**
 * Пошук у шапці з миттєвими підказками: товари з фото й ціною прямо під час
 * набору, керування з клавіатури, перехід до всіх результатів у каталозі.
 */
export default function HeaderSearch({
  query,
  onQueryChange,
  onFocus,
  onSubmit,
  variant = "desktop",
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onFocus?: () => void;
  /** Enter без вибраної підказки; за замовчуванням — сторінка каталогу з результатами */
  onSubmit?: (q: string) => void;
  variant?: "desktop" | "mobile";
}) {
  const router = useRouter();
  const { products } = useCatalog();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  const q = query.trim();
  const result = useMemo(() => searchProducts(products, q, 6), [products, q]);
  const hasQuery = normalize(q).length >= 2;
  // Пункти для клавіатури: товари + «Усі результати»
  const optionCount = hasQuery && result.total ? result.items.length + 1 : 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const goToResults = (text = q) => {
    setOpen(false);
    inputRef.current?.blur();
    const value = result.corrected && text === q ? result.corrected : text;
    if (onSubmit) onSubmit(value);
    else router.push(`/catalog?q=${encodeURIComponent(value)}`);
  };

  const openOption = (i: number) => {
    if (i < result.items.length) {
      setOpen(false);
      router.push(productUrl(result.items[i]));
    } else goToResults();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (!optionCount) return;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % optionCount : (a - 1 + optionCount) % optionCount));
    } else if (e.key === "Enter") {
      if (active >= 0 && active < optionCount) {
        e.preventDefault();
        openOption(active);
      } else if (q) goToResults();
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else onQueryChange("");
    }
  };

  const listId = `${uid}-results`;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const showPanel = open;

  return (
    <div ref={rootRef} className="relative w-full">
      <label className="relative block">
        <span className="sr-only">Пошук товарів</span>
        <Icon name="search" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#067eb7]" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            onFocus?.();
          }}
          onKeyDown={onKeyDown}
          className={
            variant === "desktop"
              ? "w-full rounded-full border border-sky-100 bg-[#f1f8fc] py-3 pl-12 pr-5 text-sm outline-none transition focus:border-[#0aa4e8] focus:bg-white focus:ring-4 focus:ring-sky-100"
              : "w-full rounded-full bg-[#f1f8fc] py-3 pl-12 pr-5 text-sm outline-none focus:ring-4 focus:ring-sky-100"
          }
          placeholder={variant === "desktop" ? "Що шукаєте?" : "Пошук товарів"}
        />
      </label>

      {showPanel && (
        <div
          className={`z-50 overflow-hidden rounded-[22px] border border-[#e3edf3] bg-white text-[#082c45] shadow-[0_24px_60px_rgba(8,44,69,.18)] ${
            variant === "desktop" ? "absolute left-0 right-0 top-[calc(100%+10px)] min-w-[360px]" : "mt-2"
          }`}
          data-testid="search-panel"
        >
          {!hasQuery ? (
            <div className="p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8aa5b5]">Часто шукають</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {POPULAR.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => {
                      onQueryChange(w);
                      setActive(-1);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full bg-[#eef6fb] px-3.5 py-1.5 text-sm font-bold text-[#264e65] transition hover:bg-[#dff4ff]"
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          ) : result.total === 0 ? (
            <div className="p-5 text-center" role="status">
              <p className="font-extrabold">Нічого не знайдено за «{q}»</p>
              <p className="mt-1 text-sm text-[#527083]">Спробуйте інше слово або перегляньте категорії.</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {POPULAR.slice(0, 4).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => onQueryChange(w)}
                    className="rounded-full bg-[#eef6fb] px-3.5 py-1.5 text-sm font-bold text-[#264e65] transition hover:bg-[#dff4ff]"
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {result.corrected && (
                <p className="border-b border-[#e3edf3] px-4 py-2.5 text-xs text-[#527083]">
                  Показуємо результати для «<b className="text-[#082c45]">{result.corrected}</b>»
                </p>
              )}
              <ul id={listId} role="listbox" aria-label="Знайдені товари" className="max-h-[min(60vh,440px)] overflow-y-auto p-1.5">
                {result.items.map((p, i) => (
                  <li
                    key={p.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={active === i}
                    onPointerEnter={() => setActive(i)}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => openOption(i)}
                    className={`flex cursor-pointer items-center gap-3 rounded-[14px] p-2 transition-colors ${active === i ? "bg-[#eef6fb]" : ""}`}
                  >
                    <img src={p.image} alt="" className="h-12 w-16 shrink-0 rounded-[10px] object-cover" loading="lazy" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-extrabold">
                        <Highlight text={p.name} query={result.corrected ?? q} />
                      </span>
                      <span className="line-clamp-1 text-xs text-[#527083]">
                        {categoryBySlug[p.category].name} · {p.specs}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-black">{formatPrice(p.price)}</span>
                      {p.inStock ? (
                        p.oldPrice && <span className="block text-[11px] text-slate-400 line-through">{formatPrice(p.oldPrice)}</span>
                      ) : (
                        <span className="block text-[11px] font-bold text-[#c2780a]">Очікується</span>
                      )}
                    </span>
                  </li>
                ))}
                <li
                  id={optionId(result.items.length)}
                  role="option"
                  aria-selected={active === result.items.length}
                  onPointerEnter={() => setActive(result.items.length)}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => goToResults()}
                  className={`mt-1 flex cursor-pointer items-center justify-between rounded-[14px] px-3 py-3 text-sm font-extrabold text-[#098fd0] transition-colors ${active === result.items.length ? "bg-[#eef6fb]" : ""}`}
                >
                  Усі результати ({result.total})
                  <Icon name="arrow" className="h-4 w-4" />
                </li>
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
