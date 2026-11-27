import type { CategorySlug, Product } from "../components/catalog-data";
import { KNIFE_ACCESSORIES, typeOf } from "../components/catalog-facets";

/*
 * Сертифікати на ножі — висновок експертного дослідження (НДЕКЦ МВС), що ніж
 * не є холодною зброєю. Рішення власника: ніж без такого документа на сайті
 * не показується. Документи дає постачальник (PDF на кожну модель), власник
 * завантажує їх в адмін-панелі («Товари» → «Сертифікати ножів» або картка товару).
 *
 * Спільне для сервера й браузера.
 */

/** Категорії, де товар без сертифіката не показується покупцям */
export const CERTIFICATE_CATEGORIES: readonly CategorySlug[] = ["knives"];

/**
 * Аксесуари в категорії «Ножі» (чохол, кліпса, темляк…) — не ножі, документ їм не
 * потрібен. Ті самі правила, що для фільтра «Тип» у каталозі
 */
export const isKnifeAccessory = (p: Pick<Product, "category" | "name">) =>
  p.category === "knives" && typeOf(p) === KNIFE_ACCESSORIES;

type CertFields = Pick<Product, "category" | "name" | "certificate" | "certificateExempt">;

/**
 * Чи потрібен товару сертифікат, щоб його бачили покупці. Власник може зняти вимогу
 * в картці товару («документ не потрібен») — напр., для точильного каменю в «Ножах»
 */
export const needsCertificate = (p: Pick<Product, "category" | "name" | "certificateExempt">) =>
  CERTIFICATE_CATEGORIES.includes(p.category) && !p.certificateExempt && !isKnifeAccessory(p);

/** Потрібен, але ще не завантажений — товар не показується */
export const missingCertificate = (p: CertFields) => needsCertificate(p) && !p.certificate;

/** Чи показується товар покупцям: не прихований і, якщо це ніж, — із сертифікатом */
export const isListed = (p: CertFields & Pick<Product, "hidden">) => !p.hidden && !missingCertificate(p);

/* ---------- Файли ---------- */

/** Найбільший файл. Vercel приймає запит до 4,5 МБ — скан на 2–3 сторінки зазвичай 0,5–3 МБ */
export const MAX_CERTIFICATE_BYTES = 4_000_000;

export type CertificateType = "pdf" | "jpg" | "png";

/** Тип файлу за вмістом, а не за назвою */
export function detectCertificateType(bytes: Uint8Array): CertificateType | null {
  if (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf"; // %PDF
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  return null;
}

/* ---------- Пошук товарів за назвою файлу ---------- */

/** Коди моделі з тексту: «Ganzo G618-GR 8Cr14» → G618-GR, G618, 8CR14 (лише слова з цифрою, від 3 символів) */
function modelCodes(text: string, withBase: boolean): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toUpperCase().split(/[\s_.,;:()[\]{}«»"'/\\+]+/)) {
    const word = raw.replace(/^-+|-+$/g, "");
    if (word.length < 3 || !/\d/.test(word) || !/^[\p{L}\d-]+$/u.test(word)) continue;
    out.add(word);
    out.add(word.replace(/-/g, ""));
    // G618-GR — колір моделі G618: файл «G618.pdf» підходить усім кольорам
    const base = word.split("-")[0];
    if (withBase && base.length >= 3 && /\d/.test(base)) out.add(base);
  }
  return out;
}

const skuOf = (p: Product) => p.attrs.find(([k]) => k === "Артикул")?.[1]?.trim().toUpperCase();

/**
 * Товари, яким підходить файл: модель або артикул з назви файлу є в назві
 * чи артикулі товару. Шукає лише серед тих, кому сертифікат потрібен.
 * «Ganzo G618.pdf» → усі кольори G618; «G618-GR.pdf» → лише G618-GR.
 * Адмін бачить результат і підтверджує його перед збереженням
 */
export function matchCertificateFile(fileName: string, products: Product[]): Product[] {
  const stem = fileName.replace(/\.[a-z0-9]{2,4}$/i, "");
  const fileCodes = modelCodes(stem, false);
  // Артикул буває й без цифр — порівнюємо з будь-яким словом назви файлу
  const fileWords = new Set(stem.toUpperCase().split(/[\s_.,;:()[\]{}«»"'/\\+]+/).filter((w) => w.length >= 3));
  if (!fileCodes.size && !fileWords.size) return [];
  return products.filter((p) => {
    if (!needsCertificate(p)) return false;
    const sku = skuOf(p);
    if (sku && sku.length >= 3 && fileWords.has(sku)) return true;
    const codes = modelCodes(p.name, true);
    return [...fileCodes].some((c) => codes.has(c));
  });
}
