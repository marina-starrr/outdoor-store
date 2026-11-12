"use client";

/* eslint-disable @next/next/no-img-element -- фото товарів з Unsplash, як і в каталозі */
import Link from "next/link";
import { useCart } from "./Cart";
import Icon from "./Icon";
import { FREE_SHIPPING_FROM, MAX_QTY, maxQtyFor, type ResolvedLine } from "./cart-logic";
import { categoryBySlug, formatPrice } from "./catalog-data";
import { productUrl } from "./product-details";

export function QtyStepper({
  value,
  onChange,
  size = "md",
  label,
  max = MAX_QTY,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: "sm" | "md";
  label: string;
  /** Верхня межа (залишок на складі) */
  max?: number;
}) {
  const btn = `grid place-items-center rounded-full font-bold text-[#264e65] transition hover:bg-white disabled:opacity-35 disabled:hover:bg-transparent ${size === "sm" ? "h-7 w-7 text-base" : "h-9 w-9 text-lg"}`;
  return (
    <div
      role="group"
      aria-label={`Кількість: ${label}`}
      className={`inline-flex items-center rounded-full bg-[#eef6fb] ${size === "sm" ? "gap-0.5 p-1" : "gap-1 p-1.5"}`}
    >
      <button className={btn} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Зменшити кількість">
        −
      </button>
      <span className={`text-center font-extrabold ${size === "sm" ? "w-6 text-sm" : "w-8"}`} aria-live="polite">
        {value}
      </span>
      <button className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Збільшити кількість">
        +
      </button>
    </div>
  );
}

export function FreeShippingBar({ subtotal }: { subtotal: number }) {
  const left = Math.max(0, FREE_SHIPPING_FROM - subtotal);
  return (
    <div className="rounded-2xl bg-[#f3f9fd] px-4 py-3 text-sm">
      {left > 0 ? (
        <p>
          До <b>безкоштовної доставки</b> ще{" "}
          <b className="text-[#067eb7]">{formatPrice(left)}</b>
        </p>
      ) : (
        <p className="flex items-center gap-2 font-bold text-[#1f9d55]">
          <Icon name="truck" className="h-4 w-4" />
          Безкоштовна доставка Новою поштою та Укрпоштою
        </p>
      )}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-[#ffd51f] transition-[width] duration-300"
          style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING_FROM) * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Рядок товару в кошику (панель і сторінка кошика) */
export function CartItem({
  line,
  onNavigate,
  variant = "compact",
}: {
  line: ResolvedLine;
  onNavigate?: () => void;
  variant?: "compact" | "wide";
}) {
  const { setQty, remove } = useCart();
  const { product, qty } = line;
  const href = productUrl(product);
  const wide = variant === "wide";

  return (
    <li className={`flex gap-4 ${wide ? "py-5" : "py-4"}`}>
      <Link
        href={href}
        onClick={onNavigate}
        tabIndex={-1}
        aria-hidden="true"
        className={`shrink-0 overflow-hidden rounded-[14px] bg-sky-50 ${wide ? "h-24 w-32 sm:h-28 sm:w-40" : "h-20 w-24"}`}
      >
        <img src={product.image} alt="" className="h-full w-full object-cover" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#098fd0]">
              {categoryBySlug[product.category].name}
            </p>
            <Link
              href={href}
              onClick={onNavigate}
              className={`mt-0.5 line-clamp-2 font-extrabold leading-snug transition hover:text-[#098fd0] ${wide ? "text-base" : "text-sm"}`}
            >
              {product.name}
            </Link>
            {wide && <p className="mt-1 text-xs text-[#527083]">{product.specs}</p>}
          </div>
          <button
            onClick={() => remove(product.id)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#8aa5b5] transition hover:bg-[#fdecec] hover:text-[#e5484d]"
            aria-label={`Видалити ${product.name} з кошика`}
          >
            <TrashIcon />
          </button>
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-3">
          <QtyStepper
            value={qty}
            onChange={(v) => setQty(product.id, v)}
            size={wide ? "md" : "sm"}
            label={product.name}
            max={Math.max(1, maxQtyFor(product))}
          />
          {product.stock <= 5 && (
            <span className="w-full text-[11px] font-bold text-[#c27c00]">
              {product.stock > 0 ? `Залишилось ${product.stock} шт.` : "Закінчився — приберіть з кошика"}
            </span>
          )}
          <div className="text-right">
            {qty > 1 && (
              <p className="text-[11px] text-[#8aa5b5]">
                {formatPrice(product.price)} × {qty}
              </p>
            )}
            <p className="flex items-baseline justify-end gap-2">
              {product.oldPrice && (
                <span className="text-xs font-semibold text-slate-400 line-through">
                  {formatPrice(product.oldPrice * qty)}
                </span>
              )}
              <span className={`font-black ${wide ? "text-lg" : "text-base"}`}>
                {formatPrice(product.price * qty)}
              </span>
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

export function EmptyCart({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-20 w-20 place-items-center rounded-full bg-[#eef9ff] text-[#067eb7]">
        <Icon name="cart" className="h-9 w-9" />
      </span>
      <p className="mt-5 text-xl font-extrabold">Кошик поки порожній</p>
      <p className="mt-2 max-w-xs text-sm text-[#527083]">
        Загляньте в каталог — там намети, спальники та все для відпочинку на природі.
      </p>
      <Link
        href="/catalog"
        onClick={onNavigate}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-6 py-3 text-sm font-extrabold transition hover:bg-[#ffe044]"
      >
        Перейти до каталогу <Icon name="arrow" className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}
