"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useCart } from "./Cart";
import Icon from "./Icon";
import { cartTotals } from "./cart-logic";
import { CartItem, EmptyCart, FreeShippingBar } from "./cart-ui";
import { formatPrice, productsWord } from "./catalog-data";

/** Бокова панель кошика — відкривається з іконки в хедері */
export default function CartDrawer() {
  const { lines, count, isOpen, closeCart } = useCart();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const totals = cartTotals(lines);

  // Закриваємо при переході на іншу сторінку
  useEffect(() => {
    closeCart();
  }, [pathname, closeCart]);

  // Esc, блокування прокрутки та фокус на панелі
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeCart();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      prevFocus?.focus();
    };
  }, [isOpen, closeCart]);

  return (
    <div
      className={`fixed inset-0 z-[80] ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <button
        tabIndex={-1}
        aria-label="Закрити кошик"
        onClick={closeCart}
        className={`absolute inset-0 bg-[#082c45]/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Кошик"
        tabIndex={-1}
        inert={!isOpen}
        className={`absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col bg-white outline-none transition-[transform,visibility] duration-300 ease-out ${isOpen ? "visible translate-x-0 shadow-[0_0_60px_rgba(8,44,69,.25)]" : "invisible translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-[#e3edf3] px-5 py-4">
          <p className="flex items-center gap-2.5 text-lg font-extrabold">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#eef9ff] text-[#067eb7]">
              <Icon name="cart" className="h-5 w-5" />
            </span>
            Кошик
            {count > 0 && (
              <span className="text-sm font-semibold text-[#527083]">
                {count} {productsWord(count)}
              </span>
            )}
          </p>
          <button
            onClick={closeCart}
            className="grid h-10 w-10 place-items-center rounded-full bg-[#f3f9fd] transition hover:bg-[#e1f0f9]"
            aria-label="Закрити кошик"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyCart onNavigate={closeCart} />
          </div>
        ) : (
          <>
            <div className="px-5 pt-4">
              <FreeShippingBar subtotal={totals.subtotal} />
            </div>
            <ul className="flex-1 divide-y divide-[#e3edf3] overflow-y-auto px-5">
              {lines.map((line) => (
                <CartItem key={line.id} line={line} onNavigate={closeCart} />
              ))}
            </ul>
            <div className="border-t border-[#e3edf3] bg-[#fbfdfe] px-5 py-4">
              {totals.savings > 0 && (
                <p className="flex justify-between text-sm text-[#1f9d55]">
                  <span>Ви заощаджуєте</span>
                  <b>−{formatPrice(totals.savings)}</b>
                </p>
              )}
              <p className="mt-1 flex items-baseline justify-between">
                <span className="font-bold">Разом</span>
                <span className="text-2xl font-black tracking-[-0.02em]">
                  {formatPrice(totals.subtotal)}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-[#8aa5b5]">
                Вартість доставки розрахуємо на наступному кроці
              </p>
              <Link
                href="/cart"
                onClick={closeCart}
                className="mt-4 flex h-13 items-center justify-center gap-2 rounded-full bg-[#ffd51f] py-3.5 text-base font-extrabold shadow-[0_10px_26px_rgba(255,213,31,.35)] transition hover:bg-[#ffe044]"
              >
                Оформити замовлення <Icon name="arrow" className="h-5 w-5" />
              </Link>
              <button
                onClick={closeCart}
                className="mt-2 w-full py-2 text-sm font-bold text-[#264e65] transition hover:text-[#098fd0]"
              >
                Продовжити покупки
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
