"use client";

import { UPLOAD_FULL, UPLOAD_SMALL } from "../photo";

/*
 * Підготовка фото в браузері адміністратора: знімок з телефона (5–10 МБ)
 * зменшується до 1600 і 800 px і стискається у WebP (Safari, що не вміє
 * WebP, — у JPEG). На сервер іде вже легкий файл.
 */

const MAX_BYTES = 2_000_000;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // Поворот за EXIF (фото з телефона «на боці») враховується автоматично
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

async function encode(source: ImageBitmap | HTMLImageElement, maxSide: number, type?: string): Promise<Blob> {
  const w0 = source.width;
  const h0 = source.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w0 * scale);
  canvas.height = Math.round(h0 * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Браузер не може обробити фото");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.82, 0.72, 0.6]) {
    let blob = await toBlob(canvas, type ?? "image/webp", quality);
    // Safari може повернути PNG замість WebP — тоді JPEG
    if (!blob || (blob.type !== "image/webp" && blob.type !== "image/jpeg")) blob = await toBlob(canvas, "image/jpeg", quality);
    if (!blob) break;
    if (blob.size <= MAX_BYTES || quality === 0.6) return blob;
  }
  throw new Error("Не вдалося стиснути фото");
}

/** Зменшує фото й завантажує на сервер; повертає адресу для товару */
export async function uploadProductPhoto(file: File): Promise<string> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    throw new Error(`«${file.name}»: формат не підтримується. Збережіть фото як JPG і спробуйте ще раз.`);
  }
  const full = await encode(source, UPLOAD_FULL);
  // Обидва розміри — одного формату (сервер це перевіряє)
  const small = await encode(source, UPLOAD_SMALL, full.type);
  if ("close" in source) source.close();

  const body = new FormData();
  body.append("full", full, "full");
  body.append("small", small, "small");
  let res: Response;
  try {
    res = await fetch("/api/admin/uploads", { method: "POST", body });
  } catch {
    throw new Error("Немає з'єднання з сервером");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Не вдалося завантажити фото");
  return data.url as string;
}
