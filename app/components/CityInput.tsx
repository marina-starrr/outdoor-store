"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DeliveryId } from "./cart-logic";
import { inputCls } from "./form-ui";
import { normalizeCity } from "../lib/city-search";

type Suggestion = { ref: string; label: string };
type Result = { available: boolean; fuzzy: boolean; cities: Suggestion[] };

/** Назва населеного пункту з підпису «м. Полтава, Полтавська обл.» */
const nameOf = (label: string) => normalizeCity(label.split(",")[0]);

/**
 * Поле «Місто» з підказками з довідника Нової пошти. Населений пункт треба
 * обрати зі списку (тоді є cityRef); якщо довідник недоступний — вільний текст
 */
export default function CityInput({
  value,
  cityRef,
  method,
  error,
  onChange,
}: {
  value: string;
  cityRef: string;
  method: DeliveryId;
  error?: string;
  onChange: (text: string, ref: string) => void;
}) {
  const listId = useId();
  const [result, setResult] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const typed = useRef(false);

  // Підказки з затримкою, поки людина друкує
  useEffect(() => {
    if (!typed.current || cityRef || value.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/cities?q=${encodeURIComponent(value.trim())}&method=${method}`, { signal: ctrl.signal });
        if (res.ok) {
          const data: Result = await res.json();
          setResult(data);
          setActive(0);
          setOpen(data.available);
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
  }, [value, cityRef, method]);

  const pick = (s: Suggestion) => {
    onChange(s.label, s.ref);
    setOpen(false);
  };

  // Ввели назву повністю і не клікнули — якщо збіг один, обираємо його самі
  const resolveOnBlur = () => {
    setOpen(false);
    if (cityRef || !result?.available || result.fuzzy) return;
    const q = normalizeCity(value);
    const exact = result.cities.filter((s) => nameOf(s.label) === q);
    if (exact.length === 1) onChange(exact[0].label, exact[0].ref);
  };

  const options = result?.cities ?? [];
  const showList = open && value.trim().length >= 2 && !cityRef;

  return (
    <div className="relative">
      <input
        id="field-city"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
        aria-invalid={!!error}
        autoComplete="off"
        value={value}
        placeholder="Почніть вводити, напр. Полтава"
        className={inputCls(error)}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value, "");
        }}
        onFocus={() => result && !cityRef && setOpen(true)}
        onBlur={resolveOnBlur}
        onKeyDown={(e) => {
          if (!showList || !options.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + options.length) % options.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {cityRef && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#1f9d55]" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 5 5 9-10" />
          </svg>
        </span>
      )}
      {showList && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border border-[#d5e5ef] bg-white shadow-[0_18px_40px_rgba(8,44,69,.14)]">
          {result?.fuzzy && <p className="px-4 pt-3 text-xs font-bold text-[#c27c00]">Можливо, ви мали на увазі:</p>}
          {options.length ? (
            <ul id={listId} role="listbox" aria-label="Населені пункти" className="max-h-72 overflow-y-auto py-1.5">
              {options.map((s, i) => (
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
                  className={`cursor-pointer px-4 py-2.5 text-sm ${i === active ? "bg-[#eef6fb]" : ""}`}
                >
                  {s.label}
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} role="listbox" aria-label="Населені пункти" className="px-4 py-3 text-sm text-[#527083]">
              {loading ? "Шукаємо…" : "Нічого не знайдено — перевірте написання"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
