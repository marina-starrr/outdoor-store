"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import type { Product } from "../catalog-data";
import { MAX_CERTIFICATE_BYTES, matchCertificateFile, missingCertificate, needsCertificate } from "../../lib/certificates";

/*
 * Сертифікати на ножі в адмін-панелі:
 * - uploadCertificate — один файл для одного чи кількох товарів;
 * - CertificatesPanel — кілька файлів одразу: товари підбираються за назвою файлу
 *   («Ganzo G618.pdf» → усі кольори G618), власник перевіряє й зберігає.
 */

export const CERTIFICATE_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

const mb = (bytes: number) =>
  bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} КБ` : `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} МБ`;

/** Завантажує файл і прив'язує до товарів; повертає оновлені товари */
export async function uploadCertificate(file: File, ids: string[]): Promise<Product[]> {
  if (file.size > MAX_CERTIFICATE_BYTES) throw new Error(`«${file.name}» — ${mb(file.size)}, а можна до 4 МБ. Стисніть PDF (напр., ilovepdf.com).`);
  const body = new FormData();
  body.append("file", file);
  for (const id of ids) body.append("id", id);
  let res: Response;
  try {
    res = await fetch("/api/admin/certificates", { method: "POST", body });
  } catch {
    throw new Error("Немає з'єднання з сервером");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Не вдалося завантажити файл");
  return data.products as Product[];
}

/** Прибрати документ або змінити «документ не потрібен» */
export async function patchCertificate(body: { id: string; certificate?: null; exempt?: boolean }): Promise<Product[]> {
  let res: Response;
  try {
    res = await fetch("/api/admin/certificates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Немає з'єднання з сервером");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Щось пішло не так");
  return data.products as Product[];
}

const skuOf = (p: Product) => p.attrs.find(([k]) => k === "Артикул")?.[1];

type Row = {
  key: string;
  file: File;
  selected: string[];
  status: "ready" | "saving" | "done" | "error";
  message?: string;
};

/** Масове завантаження сертифікатів */
export function CertificatesPanel({
  products,
  onUpdated,
  onClose,
}: {
  products: Product[];
  onUpdated: (updated: Product[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const knives = useMemo(() => products.filter(needsCertificate).sort((a, b) => a.name.localeCompare(b.name, "uk")), [products]);
  const missing = useMemo(() => knives.filter((p) => !p.hidden && missingCertificate(p)), [knives]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, saving]);

  const addFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    setRows((prev) => [
      ...prev.filter((r) => r.status !== "done"),
      ...files.map((file, i) => ({
        key: `${Date.now()}-${i}-${file.name}`,
        file,
        // Підбір за назвою файлу; ті, що вже мають документ, — не відмічаємо (лише за бажанням)
        selected: matchCertificateFile(file.name, products).filter((p) => !p.certificate).map((p) => p.id),
        status: "ready" as const,
      })),
    ]);
  };

  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const toggle = (row: Row, id: string) =>
    update(row.key, { selected: row.selected.includes(id) ? row.selected.filter((x) => x !== id) : [...row.selected, id] });

  const ready = rows.filter((r) => r.status !== "done" && r.selected.length);

  const saveAll = async () => {
    setSaving(true);
    for (const row of ready) {
      update(row.key, { status: "saving", message: undefined });
      try {
        const updated = await uploadCertificate(row.file, row.selected);
        onUpdated(updated);
        update(row.key, { status: "done" });
      } catch (e) {
        update(row.key, { status: "error", message: (e as Error).message });
      }
    }
    setSaving(false);
  };

  const copyMissing = async () => {
    const text = missing.map((p) => `${p.name}${skuOf(p) ? ` — арт. ${skuOf(p)}` : ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* без доступу до буфера — список і так видно на екрані */
    }
  };

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Сертифікати ножів">
      <button aria-label="Закрити" className="absolute inset-0 bg-[#082c45]/40 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div ref={panelRef} className="absolute inset-y-0 right-0 flex w-full max-w-[760px] flex-col bg-[#f7fafc] shadow-[-20px_0_60px_rgba(8,44,69,.2)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#e3edf3] bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#098fd0]">Документи</p>
            <p className="truncate text-lg font-extrabold">Сертифікати ножів</p>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Закрити вікно сертифікатів" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eef6fb] text-[#264e65] transition hover:bg-[#dff4ff] disabled:opacity-50">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <section className="rounded-[20px] bg-white p-5 shadow-[0_6px_20px_rgba(79,93,101,.06)]">
            <p className="text-sm text-[#264e65]">
              Ніж без висновку експерта («не є холодною зброєю») покупці не бачать. Оберіть файли від постачальника (PDF, JPG чи PNG, до 4 МБ кожен).
              Сайт сам знайде ножі за моделлю в назві файлу: <b>«Ganzo G618.pdf»</b> — усі кольори G618, <b>«G618-GR.pdf»</b> — лише зелений.
            </p>
            <label className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[16px] border-2 border-dashed border-[#d5e5ef] px-4 py-6 text-center text-sm font-bold text-[#527083] transition hover:border-[#098fd0] hover:text-[#098fd0] focus-within:ring-4 focus-within:ring-sky-200 ${saving ? "pointer-events-none opacity-60" : ""}`}>
              <span className="text-2xl leading-none" aria-hidden="true">+</span>
              Обрати файли сертифікатів
              <input
                ref={inputRef}
                type="file"
                accept={CERTIFICATE_ACCEPT}
                multiple
                disabled={saving}
                onChange={(e) => addFiles(e.target.files)}
                className="sr-only"
                aria-label="Файли сертифікатів"
              />
            </label>
          </section>

          {rows.length > 0 && (
            <ul className="mt-4 grid gap-3" aria-label="Обрані файли">
              {rows.map((row) => (
                <CertificateRow
                  key={row.key}
                  row={row}
                  matches={matchCertificateFile(row.file.name, products)}
                  knives={knives}
                  byId={byId}
                  disabled={saving || row.status === "done"}
                  onToggle={(id) => toggle(row, id)}
                  onRemove={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                />
              ))}
            </ul>
          )}

          <section className="mt-4 rounded-[20px] bg-white p-5 shadow-[0_6px_20px_rgba(79,93,101,.06)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-extrabold">
                {missing.length ? `Без сертифіката: ${missing.length} — не показуються на сайті` : "Усі ножі мають сертифікат"}
              </p>
              {missing.length > 0 && (
                <button type="button" onClick={copyMissing} className="rounded-full bg-[#eef6fb] px-3.5 py-2 text-xs font-extrabold text-[#067eb7] transition hover:bg-[#dff4ff]">
                  {copied ? "Скопійовано" : "Скопіювати список для постачальника"}
                </button>
              )}
            </div>
            {missing.length > 0 && (
              <ul className="mt-3 max-h-72 divide-y divide-[#eef3f7] overflow-y-auto text-sm" data-testid="missing-certificates">
                {missing.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">{p.name}</span>
                    {skuOf(p) && <span className="shrink-0 font-mono text-xs text-[#8aa5b5]">{skuOf(p)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[#e3edf3] bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={saveAll}
            disabled={saving || !ready.length}
            className="inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-7 py-3 text-sm font-extrabold shadow-[0_8px_20px_rgba(255,213,31,.35)] transition hover:bg-[#ffe044] disabled:opacity-50"
          >
            {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#082c45] border-t-transparent" aria-hidden="true" />}
            {ready.length ? `Зберегти сертифікати (${ready.length})` : "Зберегти сертифікати"}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-full px-5 py-3 text-sm font-bold text-[#527083] transition hover:bg-[#eef6fb] disabled:opacity-50">
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

function CertificateRow({
  row,
  matches,
  knives,
  byId,
  disabled,
  onToggle,
  onRemove,
}: {
  row: Row;
  matches: Product[];
  knives: Product[];
  byId: Map<string, Product>;
  disabled: boolean;
  onToggle: (id: string) => void;
  onRemove: () => void;
}) {
  // Знайдені за назвою + обрані вручну
  const shown = [...matches, ...row.selected.map((id) => byId.get(id)).filter((p): p is Product => !!p && !matches.includes(p))];
  const others = knives.filter((p) => !shown.includes(p));
  return (
    <li className="rounded-[20px] bg-white p-4 shadow-[0_6px_20px_rgba(79,93,101,.06)] sm:p-5" data-testid="certificate-file">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-extrabold">{row.file.name}</p>
          <p className={`text-xs ${row.file.size > MAX_CERTIFICATE_BYTES ? "font-bold text-[#c53035]" : "text-[#8aa5b5]"}`}>
            {mb(row.file.size)}
            {row.file.size > MAX_CERTIFICATE_BYTES && " — завеликий, до 4 МБ"}
          </p>
        </div>
        {row.status === "done" ? (
          <span className="shrink-0 rounded-full bg-[#e7f7ee] px-3 py-1 text-xs font-extrabold text-[#1f9d55]" role="status">Збережено</span>
        ) : row.status === "saving" ? (
          <span className="shrink-0 text-xs font-bold text-[#527083]" role="status">Завантажуємо…</span>
        ) : (
          <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Прибрати файл ${row.file.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#8aa5b5] transition hover:bg-[#fdecec] hover:text-[#e5484d]">
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
      </div>

      {shown.length ? (
        <ul className="mt-3 grid gap-1.5">
          {shown.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-1.5 text-sm hover:bg-[#f6fafd]">
                <input type="checkbox" checked={row.selected.includes(p.id)} disabled={disabled} onChange={() => onToggle(p.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#098fd0]" />
                <span className="min-w-0">
                  {p.name}
                  {p.certificate && <span className="ml-1.5 whitespace-nowrap rounded-full bg-[#eef6fb] px-2 py-0.5 text-[11px] font-bold text-[#527083]">уже є документ — замінити</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl bg-[#fff7d6] px-3 py-2 text-sm text-[#6b5800]">За назвою файлу ножа не знайдено — оберіть його нижче.</p>
      )}

      {!disabled && others.length > 0 && (
        <select
          aria-label={`Додати товар до файлу ${row.file.name}`}
          value=""
          onChange={(e) => e.target.value && onToggle(e.target.value)}
          className="mt-3 w-full rounded-xl border border-[#d5e5ef] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0aa4e8] focus:ring-4 focus:ring-sky-100"
        >
          <option value="">+ Додати ніж вручну…</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.certificate ? "✓ " : ""}{p.name}
            </option>
          ))}
        </select>
      )}
      {row.message && <p role="alert" className="mt-2 text-sm font-semibold text-[#e5484d]">{row.message}</p>}
    </li>
  );
}
