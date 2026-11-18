"use client";

import { useEffect, useId, useRef, useState } from "react";
import { inputCls } from "./form-ui";

export type SuggestItem = { ref: string; label: string };
type Result = { available: boolean; total?: number; items: SuggestItem[] };

/**
 * Поле з випадним списком варіантів із сервера (відділення Нової пошти, вулиці).
 * Значення треба обрати зі списку (тоді є selectedRef). Якщо сервер повідомляє,
 * що довідник недоступний (available=false), поле працює як звичайне текстове.
 *
 * openOnFocus — показувати список одразу, без введення (усі відділення міста).
 */
export default function SuggestInput({
  id,
  value,
  selectedRef,
  url,
  minChars = 0,
  openOnFocus = false,
  placeholder,
  disabled,
  disabledText,
  emptyText,
  hint,
  error,
  label,
  onChange,
}: {
  id: string;
  value: string;
  selectedRef: string;
  /** Адреса запиту для введеного тексту; null — запитувати нічого (напр. місто ще не обрано) */
  url: (q: string) => string | null;
  minChars?: number;
  openOnFocus?: boolean;
  placeholder?: string;
  disabled?: boolean;
  disabledText?: string;
  emptyText: string;
  /** Підказка над списком, напр. «Усього 512 — введіть номер або вулицю» */
  hint?: (r: { total?: number; shown: number; query: string }) => string | null;
  error?: string;
  /** Підпис списку для читачів екрана */
  label: string;
  onChange: (text: string, ref: string) => void;
}) {
  const listId = useId();
  // Відповідь разом з адресою, для якої її отримано: інше місто — старий список не показуємо
  const [fetched, setFetched] = useState<{ base: string | null; data: Result } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  // Запит: коли відкрито список і змінився текст (обране значення не шукаємо)
  const query = selectedRef ? "" : value.trim();
  const requestUrl = disabled ? null : url(query);

  const base = disabled ? null : url("");
  const result = fetched && fetched.base === base ? fetched.data : null;
  useEffect(() => {
    if (!open || !requestUrl || query.length < minChars) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(requestUrl, { signal: ctrl.signal });
        if (res.ok) {
          const data: Result = await res.json();
          setFetched({ base, data });
          setActive(0);
          listRef.current?.scrollTo({ top: 0 });
        }
      } catch {
        /* скасовано або немає зв'язку — поле працює як звичайне */
      }
      setLoading(false);
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, requestUrl, query, minChars, base]);

  const pick = (s: SuggestItem) => {
    onChange(s.label, s.ref);
    setOpen(false);
  };

  const items = result?.items ?? [];
  const unavailable = result?.available === false;
  // Немає адреси запиту (напр. місто введено без вибору зі списку) — звичайне текстове поле
  const showList = open && !disabled && !!requestUrl && !unavailable && query.length >= minChars;
  const hintText = result && hint ? hint({ total: result.total, shown: items.length, query }) : null;

  return (
    <div className="relative">
      <input
        id={`field-${id}`}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && items[active] ? `${listId}-${active}` : undefined}
        aria-invalid={!!error}
        autoComplete="off"
        value={disabled ? "" : value}
        disabled={disabled}
        placeholder={disabled ? disabledText : placeholder}
        className={`${inputCls(error)} pr-10 disabled:cursor-not-allowed disabled:bg-[#f3f7fa]`}
        onChange={(e) => {
          onChange(e.target.value, "");
          setOpen(true);
        }}
        onFocus={() => (openOnFocus || value.trim().length >= minChars) && setOpen(true)}
        onClick={() => openOnFocus && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !showList) {
            setOpen(true);
            return;
          }
          if (!showList || !items.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + items.length) % items.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
        {selectedRef ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#1f9d55]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 5 5 9-10" />
          </svg>
        ) : (
          openOnFocus &&
          !disabled && (
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#8aa5b5]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          )
        )}
      </span>
      {showList && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border border-[#d5e5ef] bg-white shadow-[0_18px_40px_rgba(8,44,69,.14)]">
          {hintText && <p className="border-b border-[#eef3f7] px-4 py-2 text-xs font-bold text-[#527083]">{hintText}</p>}
          {items.length ? (
            <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto py-1.5">
              {items.map((s, i) => (
                <li
                  key={s.ref}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault(); // інакше blur закриє список раніше за клік
                    pick(s);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer px-4 py-2.5 text-sm leading-snug ${i === active ? "bg-[#eef6fb]" : ""}`}
                >
                  {s.label}
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} role="listbox" aria-label={label} className="px-4 py-3 text-sm text-[#527083]">
              {loading || !result ? "Завантажуємо…" : emptyText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
