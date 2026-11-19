/*
 * Легші фото без сервера оптимізації. Фото з Unsplash (imgix) ріже й стискає
 * сам CDN за параметрами адреси, тож браузеру достатньо дати srcset з кількома
 * ширинами — телефон завантажить картинку на 480 px замість 1200.
 * Фото з інших сайтів (посилання з адмін-панелі) лишаються як є.
 */

const UNSPLASH = "images.unsplash.com";
/** Якість JPEG/WebP від Unsplash: 70 майже не відрізнити від 90, а файл утричі менший */
const QUALITY = 70;

/*
 * Фото, завантажені в адмін-панелі, зберігаються у двох розмірах:
 * «…-1600.webp» (адреса в базі) і «…-800.webp» поруч — для карток і телефонів.
 */
export const UPLOAD_FULL = 1600;
export const UPLOAD_SMALL = 800;
const OWN = new RegExp(`-${UPLOAD_FULL}\\.(webp|jpg)$`);

/** Власне завантажене фото (є зменшена копія) */
export const isUploadedPhoto = (src: string) => OWN.test(src.split("?")[0]);
const smallCopy = (src: string) => src.replace(OWN, `-${UPLOAD_SMALL}.$1`);

/** Та сама фотографія потрібної ширини (висота кадру — пропорційно) */
export function resizeImage(src: string, width: number): string {
  if (isUploadedPhoto(src)) return width <= UPLOAD_SMALL ? smallCopy(src) : src;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }
  if (url.hostname !== UNSPLASH) return src;
  const w = Number(url.searchParams.get("w"));
  const h = Number(url.searchParams.get("h"));
  url.searchParams.set("w", String(width));
  if (w && h) url.searchParams.set("h", String(Math.round((h * width) / w)));
  url.searchParams.set("q", String(QUALITY));
  url.searchParams.set("auto", "format");
  return url.toString();
}

/** srcset для фото з Unsplash; для інших адрес — undefined (браузер візьме src) */
export function imageSrcSet(src: string, widths: readonly number[]): string | undefined {
  if (isUploadedPhoto(src)) return `${smallCopy(src)} ${UPLOAD_SMALL}w, ${src} ${UPLOAD_FULL}w`;
  if (!src.includes(UNSPLASH)) return undefined;
  return widths.map((w) => `${resizeImage(src, w)} ${w}w`).join(", ");
}

/** Готові атрибути <img>: src (запасний), srcSet і sizes */
export function responsiveImage(src: string, sizes: string, widths: readonly number[] = [320, 480, 640]) {
  const srcSet = imageSrcSet(src, widths);
  if (srcSet && isUploadedPhoto(src)) return { src: smallCopy(src), srcSet, sizes };
  return srcSet ? { src: resizeImage(src, widths[Math.min(2, widths.length - 1)]), srcSet, sizes } : { src };
}

/** Розміри карток товарів у сітках каталогу (1 / 2 / 3 / 4 колонки) */
export const CARD_SIZES = "(min-width: 1280px) 340px, (min-width: 1024px) 31vw, (min-width: 480px) 48vw, 92vw";
