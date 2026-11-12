import { isCategorySlug, isPhotoKey, type CategorySlug, type PhotoKey, type Product } from "../components/catalog-data";

/*
 * Перевірка даних товару з адмін-панелі. Спільна для сервера (API) і
 * браузера (форма показує ті самі помилки ще до відправлення).
 */

export type ProductInput = {
  id?: string;
  name: string;
  brand: string;
  category: CategorySlug;
  price: number;
  oldPrice?: number | null;
  stock: number;
  specs: string;
  capacity?: number | null;
  photo: PhotoKey;
  customImage?: string;
  description?: string;
  hit?: boolean;
  isNew?: boolean;
  hidden?: boolean;
  attrs: [string, string][];
};

export type ProductErrors = Partial<Record<keyof ProductInput | "form", string>>;

const LIMITS = { name: 120, brand: 60, specs: 120, description: 4000, attrKey: 60, attrValue: 160, attrs: 30, price: 1_000_000, stock: 100_000 };

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const int = (v: unknown) => (v === "" || v === null || v === undefined ? NaN : Number(v));

/** Транслітерація для коду товару в адресі: «Намет Nature Peak» → «namet-nature-peak» */
export function slugify(s: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
    ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", "'": "", "’": "", "ʼ": "",
  };
  return s
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export const isValidId = (id: string) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(id);

/** Перевіряє повний набір полів товару. Повертає дані або помилки за полями */
export function validateProduct(body: Record<string, unknown>): { data?: ProductInput; errors: ProductErrors } {
  const errors: ProductErrors = {};
  const name = str(body.name, LIMITS.name);
  const brand = str(body.brand, LIMITS.brand);
  const specs = str(body.specs, LIMITS.specs);
  const price = int(body.price);
  const oldPrice = int(body.oldPrice);
  const stock = int(body.stock);
  const capacity = int(body.capacity);
  const customImage = str(body.customImage, 500);
  const description = String(body.description ?? "").trim().slice(0, LIMITS.description);

  if (name.length < 3) errors.name = "Назва — щонайменше 3 символи";
  if (brand.length < 2) errors.brand = "Вкажіть бренд";
  if (!isCategorySlug(body.category)) errors.category = "Оберіть категорію";
  if (!Number.isInteger(price) || price < 1 || price > LIMITS.price) errors.price = "Ціна — ціле число від 1 до 1 000 000 ₴";
  if (!Number.isNaN(oldPrice) && (!Number.isInteger(oldPrice) || oldPrice <= price))
    errors.oldPrice = "Стара ціна має бути більшою за поточну (або порожньою)";
  if (!Number.isInteger(stock) || stock < 0 || stock > LIMITS.stock) errors.stock = "Залишок — ціле число від 0";
  if (!Number.isNaN(capacity) && (!Number.isInteger(capacity) || capacity < 1 || capacity > 20))
    errors.capacity = "Місткість — від 1 до 20 осіб";
  if (!isPhotoKey(body.photo)) errors.photo = "Оберіть фото";
  if (customImage && !/^https:\/\/[^\s"'<>]+$/i.test(customImage)) errors.customImage = "Посилання на фото має починатися з https://";
  if (specs.length < 2) errors.specs = "Короткий опис під назвою, напр. «3 місця · 3,1 кг»";

  const rawAttrs = Array.isArray(body.attrs) ? body.attrs : [];
  const attrs = rawAttrs
    .map((a) => (Array.isArray(a) ? [str(a[0], LIMITS.attrKey), str(a[1], LIMITS.attrValue)] : ["", ""]) as [string, string])
    .filter(([k, v]) => k && v)
    .slice(0, LIMITS.attrs);

  const id = body.id === undefined ? undefined : str(body.id, 40).toLowerCase();
  if (id !== undefined && id !== "" && !isValidId(id)) errors.id = "Код: латинські літери, цифри й дефіс (2–40 символів)";

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    data: {
      id: id || undefined,
      name,
      brand,
      category: body.category as CategorySlug,
      price,
      oldPrice: Number.isNaN(oldPrice) ? null : oldPrice,
      stock,
      specs,
      capacity: Number.isNaN(capacity) ? null : capacity,
      photo: body.photo as PhotoKey,
      customImage: customImage || undefined,
      description: description || undefined,
      hit: body.hit === true,
      isNew: body.isNew === true,
      hidden: body.hidden === true,
      attrs,
    },
  };
}

/** Застосовує перевірені дані до товару (новий або наявний) */
export function applyProductInput(target: Partial<Product>, d: ProductInput): void {
  Object.assign(target, {
    name: d.name,
    brand: d.brand,
    category: d.category,
    price: d.price,
    stock: d.stock,
    inStock: d.stock > 0,
    specs: d.specs,
    photo: d.photo,
    hit: d.hit || undefined,
    isNew: d.isNew || undefined,
    hidden: d.hidden || undefined,
    // «Бренд» у характеристиках завжди відповідає полю бренду
    attrs: [["Бренд", d.brand], ...d.attrs.filter(([k]) => k !== "Бренд")],
    updatedAt: new Date().toISOString(),
  });
  // Необов'язкові поля: порожнє значення — прибрати
  if (d.oldPrice) target.oldPrice = d.oldPrice;
  else delete target.oldPrice;
  if (d.capacity) target.capacity = d.capacity;
  else delete target.capacity;
  if (d.customImage) target.customImage = d.customImage;
  else delete target.customImage;
  if (d.description) target.description = d.description;
  else delete target.description;
}
