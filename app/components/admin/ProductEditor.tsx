"use client";

/* eslint-disable @next/next/no-img-element -- прев'ю фото з Unsplash */
import { useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "../Icon";
import { SortSelect } from "../catalog-ui";
import {
  categories,
  categoryPhotos,
  PHOTO_KEYS,
  photoUrl,
  type CategorySlug,
  type PhotoKey,
  type Product,
} from "../catalog-data";
import { inputCls } from "../form-ui";
import { validateProduct, type ProductErrors } from "../../lib/admin-product";
import { adminFetch, type ApiError } from "./api";

type Form = {
  id: string;
  name: string;
  brand: string;
  category: CategorySlug;
  price: string;
  oldPrice: string;
  stock: string;
  specs: string;
  capacity: string;
  photo: PhotoKey;
  customImage: string;
  description: string;
  hit: boolean;
  isNew: boolean;
  hidden: boolean;
  attrs: [string, string][];
};

const toForm = (p?: Product): Form => ({
  id: p?.id ?? "",
  name: p?.name ?? "",
  brand: p?.brand ?? "",
  category: p?.category ?? "tents",
  price: p ? String(p.price) : "",
  oldPrice: p?.oldPrice ? String(p.oldPrice) : "",
  stock: p ? String(p.stock) : "10",
  specs: p?.specs ?? "",
  capacity: p?.capacity ? String(p.capacity) : "",
  photo: p?.photo ?? categoryPhotos.tents[0],
  customImage: p?.customImage ?? "",
  description: p?.description ?? "",
  hit: !!p?.hit,
  isNew: p ? !!p.isNew : true,
  hidden: !!p?.hidden,
  // «Бренд» додається автоматично з поля бренду
  attrs: (p?.attrs ?? []).filter(([k]) => k !== "Бренд"),
});

/** Бокова панель створення / редагування товару */
export default function ProductEditor({
  product,
  onClose,
  onSaved,
}: {
  product?: Product;
  onClose: () => void;
  onSaved: (p: Product, created: boolean) => void;
}) {
  const creating = !product;
  const [form, setForm] = useState<Form>(() => toForm(product));
  const [errors, setErrors] = useState<ProductErrors>({});
  const [pending, setPending] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape закриває, фокус — у першому полі, фон не прокручується
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as keyof ProductErrors]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const payload = () => ({
    ...form,
    id: creating ? form.id.trim() || undefined : undefined,
    oldPrice: form.oldPrice.trim() || null,
    capacity: form.category === "tents" ? form.capacity.trim() || null : null,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: found } = validateProduct(payload());
    if (Object.keys(found).length) {
      setErrors(found);
      const first = Object.keys(found)[0];
      panelRef.current?.querySelector<HTMLElement>(`#pe-${first}`)?.focus();
      return;
    }
    setPending(true);
    try {
      const { product: saved } = await adminFetch<{ product: Product }>(
        creating ? "/api/admin/products" : `/api/admin/products/${product.id}`,
        { method: creating ? "POST" : "PATCH", body: payload() },
      );
      onSaved(saved, creating);
    } catch (err) {
      const e = err as ApiError;
      setErrors({ ...e.errors, form: e.message });
    } finally {
      setPending(false);
    }
  };

  // Фото з бібліотеки: спершу ті, що пасують до категорії
  const photoChoices = [...categoryPhotos[form.category], ...PHOTO_KEYS.filter((k) => !categoryPhotos[form.category].includes(k))];
  const preview = form.customImage.startsWith("https://") ? form.customImage : photoUrl(form.photo, 640, 420);

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={creating ? "Новий товар" : `Редагування: ${product.name}`}>
      <button aria-label="Закрити" className="absolute inset-0 bg-[#082c45]/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={panelRef} className="absolute inset-y-0 right-0 flex w-full max-w-[720px] flex-col bg-[#f7fafc] shadow-[-20px_0_60px_rgba(8,44,69,.2)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#e3edf3] bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#098fd0]">{creating ? "Новий товар" : "Редагування"}</p>
            <p className="truncate text-lg font-extrabold">{form.name || "Без назви"}</p>
          </div>
          <button onClick={onClose} aria-label="Закрити редактор" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eef6fb] text-[#264e65] transition hover:bg-[#dff4ff]">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        <form id="product-form" onSubmit={submit} noValidate className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <Section title="Основне">
            <F id="name" label="Назва" error={errors.name} className="sm:col-span-2">
              <input id="pe-name" value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls(errors.name)} placeholder="Намет Nature Peak 4" />
            </F>
            {creating && (
              <F id="id" label="Код товару (необов'язково)" error={errors.id} hint="Частина адреси сторінки. Порожньо — створиться з назви.">
                <input id="pe-id" value={form.id} onChange={(e) => set("id", e.target.value.toLowerCase())} className={`${inputCls(errors.id)} font-mono`} placeholder="np4" />
              </F>
            )}
            <F id="category" label="Категорія" error={errors.category}>
              <SortSelect
                label="Категорія товару"
                className="w-full [&>button]:w-full [&>button]:justify-between [&>button]:shadow-none [&>button]:ring-1 [&>button]:ring-[#d5e5ef]"
                value={form.category}
                options={categories.map((c) => ({ id: c.slug, label: c.name }))}
                onChange={(v) => set("category", v)}
              />
            </F>
            <F id="brand" label="Бренд" error={errors.brand}>
              <input id="pe-brand" value={form.brand} onChange={(e) => set("brand", e.target.value)} className={inputCls(errors.brand)} list="brand-list" />
              <datalist id="brand-list">
                {["Coleman", "Nature Peak", "Outventure", "Terra Incognita", "Tramp"].map((b) => <option key={b} value={b} />)}
              </datalist>
            </F>
            <F id="specs" label="Коротко під назвою" error={errors.specs} hint="Напр. «4 місця · 5,4 кг»">
              <input id="pe-specs" value={form.specs} onChange={(e) => set("specs", e.target.value)} className={inputCls(errors.specs)} />
            </F>
            {form.category === "tents" && (
              <F id="capacity" label="Місткість, осіб" error={errors.capacity} hint="Для фільтра «Місткість»">
                <input id="pe-capacity" inputMode="numeric" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className={inputCls(errors.capacity)} />
              </F>
            )}
          </Section>

          <Section title="Ціна та склад">
            <F id="price" label="Ціна, ₴" error={errors.price}>
              <input id="pe-price" inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} className={inputCls(errors.price)} />
            </F>
            <F id="oldPrice" label="Стара ціна, ₴" error={errors.oldPrice} hint="Заповніть, щоб показати знижку">
              <input id="pe-oldPrice" inputMode="numeric" value={form.oldPrice} onChange={(e) => set("oldPrice", e.target.value)} className={inputCls(errors.oldPrice)} />
            </F>
            <F id="stock" label="Залишок на складі, шт." error={errors.stock} hint="0 — «Очікується», купити не можна">
              <input id="pe-stock" inputMode="numeric" value={form.stock} onChange={(e) => set("stock", e.target.value)} className={inputCls(errors.stock)} />
            </F>
            <div className="flex flex-wrap items-end gap-x-5 gap-y-2 pb-2">
              <Toggle checked={form.hit} onChange={(v) => set("hit", v)}>Хіт</Toggle>
              <Toggle checked={form.isNew} onChange={(v) => set("isNew", v)}>Новинка</Toggle>
              <Toggle checked={form.hidden} onChange={(v) => set("hidden", v)}>Приховати з сайту</Toggle>
            </div>
          </Section>

          <Section title="Фото">
            <div className="sm:col-span-2">
              <img src={preview} alt="Прев'ю" className="aspect-[16/9] w-full rounded-[16px] object-cover" />
              <p className="mb-2 mt-4 text-sm font-bold">Бібліотека фото</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Фото з бібліотеки">
                {photoChoices.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={form.photo === k}
                    aria-label={`Фото ${k}`}
                    onClick={() => set("photo", k)}
                    className={`overflow-hidden rounded-[10px] border-2 transition ${form.photo === k ? "border-[#ffd51f] ring-2 ring-[#ffd51f]/50" : "border-transparent opacity-80 hover:opacity-100"}`}
                  >
                    <img src={photoUrl(k, 160, 110)} alt="" className="aspect-[16/11] w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
            <F id="customImage" label="Або власне фото (посилання https://)" error={errors.customImage} className="sm:col-span-2" hint="Буде головним фото товару">
              <input id="pe-customImage" value={form.customImage} onChange={(e) => set("customImage", e.target.value.trim())} className={inputCls(errors.customImage)} placeholder="https://…" />
            </F>
          </Section>

          <Section title="Опис і характеристики">
            <F id="description" label="Опис" className="sm:col-span-2" hint="Абзаци — через порожній рядок. Порожньо — опис складеться автоматично з характеристик.">
              <textarea id="pe-description" rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} className={`${inputCls()} resize-y`} />
            </F>
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-bold">Характеристики</p>
              <ul className="grid gap-2">
                {form.attrs.map(([k, v], i) => (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-2">
                    <input aria-label={`Назва характеристики ${i + 1}`} value={k} onChange={(e) => set("attrs", form.attrs.map((a, j) => (j === i ? [e.target.value, a[1]] : a)))} className={inputCls()} placeholder="Вага" />
                    <input aria-label={`Значення характеристики ${i + 1}`} value={v} onChange={(e) => set("attrs", form.attrs.map((a, j) => (j === i ? [a[0], e.target.value] : a)))} className={inputCls()} placeholder="3,1 кг" />
                    <button type="button" onClick={() => set("attrs", form.attrs.filter((_, j) => j !== i))} aria-label={`Видалити характеристику ${k || i + 1}`} className="grid h-11 w-11 place-items-center rounded-xl text-[#8aa5b5] transition hover:bg-[#fdecec] hover:text-[#e5484d]">
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => set("attrs", [...form.attrs, ["", ""]])} className="mt-2 text-sm font-extrabold text-[#098fd0] hover:underline">
                + Додати характеристику
              </button>
            </div>
          </Section>
        </form>

        <div className="flex flex-wrap items-center gap-3 border-t border-[#e3edf3] bg-white px-5 py-4 sm:px-6">
          {errors.form && <p role="alert" className="w-full text-sm font-semibold text-[#c53035]">{errors.form}</p>}
          <button
            type="submit"
            form="product-form"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-7 py-3 text-sm font-extrabold shadow-[0_8px_20px_rgba(255,213,31,.35)] transition hover:bg-[#ffe044] disabled:opacity-60"
          >
            {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#082c45] border-t-transparent" aria-hidden="true" />}
            {creating ? "Створити товар" : "Зберегти зміни"}
          </button>
          <button type="button" onClick={onClose} className="rounded-full px-5 py-3 text-sm font-bold text-[#527083] transition hover:bg-[#eef6fb]">
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="mb-5 rounded-[20px] bg-white p-5 shadow-[0_6px_20px_rgba(79,93,101,.06)]">
      <legend className="sr-only">{title}</legend>
      <p className="mb-4 text-base font-extrabold">{title}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function F({ id, label, error, hint, className = "", children }: { id: string; label: string; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={`pe-${id}`} className="mb-1.5 block text-sm font-bold">{label}</label>
      {children}
      {error ? <p className="mt-1.5 text-xs font-semibold text-[#e5484d]">{error}</p> : hint && <p className="mt-1.5 text-xs text-[#8aa5b5]">{hint}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold">
      <span className="relative inline-flex">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-[#d5e5ef] transition peer-checked:bg-[#098fd0] peer-focus-visible:ring-4 peer-focus-visible:ring-sky-200" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
      {children}
    </label>
  );
}
