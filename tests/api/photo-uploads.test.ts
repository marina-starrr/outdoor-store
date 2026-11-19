import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import * as productItem from "../../app/api/admin/products/[id]/route";
import * as uploads from "../../app/api/admin/uploads/route";
import * as register from "../../app/api/auth/register/route";
import * as served from "../../app/api/uploads/[name]/route";
import { productGallery } from "../../app/components/product-details";
import { detectPhotoType } from "../../app/lib/server/photo-storage";
import { ORIGIN, call, markEmailVerified, sessionCookie, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = "photo-owner@example.com";
process.env.ADMIN_EMAILS = ADMIN_EMAIL;

/** РќР°Р№РїСЂРѕСЃС‚С–С€РёР№ В«С„Р°Р№Р»В» Р· РїС–РґРїРёСЃРѕРј WebP / JPEG / PNG вЂ” СЃРµСЂРІРµСЂ РїРµСЂРµРІС–СЂСЏС” СЃР°РјРµ РїС–РґРїРёСЃ */
const webp = (n = 64) => new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 "), ...new Array(n).fill(7)]);
const jpeg = (n = 64) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(n).fill(1)]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]);

function upload(files: Record<string, Uint8Array>, cookie?: string, origin = ORIGIN) {
  const form = new FormData();
  for (const [k, v] of Object.entries(files)) form.append(k, new Blob([new Uint8Array(v)]), k);
  const headers = new Headers({ host: new URL(ORIGIN).host, origin });
  if (cookie) headers.set("cookie", cookie);
  return uploads.POST(new NextRequest(`${ORIGIN}/api/admin/uploads`, { method: "POST", headers, body: form }));
}

const serve = (name: string) => served.GET(new NextRequest(`${ORIGIN}/api/uploads/${name}`), { params: Promise.resolve({ name }) });
const patchProduct = (id: string, body: unknown, cookie: string) =>
  call((req) => productItem.PATCH(req, { params: Promise.resolve({ id }) }), { method: "PATCH", body, cookie });

let admin = "";
let customer = "";

beforeAll(async () => {
  admin = sessionCookie((await call(register.POST, { body: { firstName: "Р’Р»Р°СЃРЅРёРє", email: ADMIN_EMAIL, phone: "", password: "camping2026" } })).res);
  await markEmailVerified(ADMIN_EMAIL);
  customer = sessionCookie((await call(register.POST, { body: { firstName: "РџРѕРєСѓРїРµС†СЊ", email: uniqueEmail(), phone: "", password: "camping2026" } })).res);
});

describe("Р·Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ С„РѕС‚Рѕ РІ Р°РґРјС–РЅ-РїР°РЅРµР»С–", () => {
  it("Р»РёС€Рµ Р°РґРјС–РЅС–СЃС‚СЂР°С‚РѕСЂ", async () => {
    expect((await upload({ full: webp(), small: webp() })).status).toBe(401);
    expect((await upload({ full: webp(), small: webp() }, customer)).status).toBe(403);
    expect((await upload({ full: webp(), small: webp() }, admin, "http://evil.example")).status).toBe(403);
    expect((await call(uploads.GET, { method: "GET", cookie: customer })).status).toBe(403);
  });

  it("Сѓ С‚РµСЃС‚Р°С… СЃС…РѕРІРёС‰Рµ вЂ” С‚РёРјС‡Р°СЃРѕРІР° С‚РµРєР° (РЅРµ Supabase)", async () => {
    expect((await call(uploads.GET, { method: "GET", cookie: admin })).data).toEqual({ enabled: true });
  });

  it("Р·Р±РµСЂС–РіР°С” РґРІР° СЂРѕР·РјС–СЂРё Р№ РІС–РґРґР°С” С—С…", async () => {
    const res = await upload({ full: webp(200), small: webp(50) }, admin);
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).toMatch(/^\/api\/uploads\/[a-z0-9]+-[a-f0-9]{12}-1600\.webp$/);

    const name = url.split("/").pop()!;
    const full = await serve(name);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("image/webp");
    expect(full.headers.get("cache-control")).toContain("immutable");
    expect((await full.arrayBuffer()).byteLength).toBe(webp(200).length);
    expect((await serve(name.replace("-1600.", "-800."))).status).toBe(200);
  });

  it("JPEG С‚РµР¶ РїСЂРёР№РјР°С”С‚СЊСЃСЏ", async () => {
    const res = await upload({ full: jpeg(), small: jpeg() }, admin);
    expect((await res.json()).url).toMatch(/-1600\.jpg$/);
  });

  it("РЅРµ С„РѕС‚Рѕ, СЂС–Р·РЅС– С„РѕСЂРјР°С‚Рё С‡Рё РЅРµРїРѕРІРЅРёР№ Р·Р°РїРёС‚ вЂ” РІС–РґС…РёР»СЏСЋС‚СЊСЃСЏ", async () => {
    expect((await upload({ full: png(), small: png() }, admin)).status).toBe(400);
    expect((await upload({ full: webp(), small: jpeg() }, admin)).status).toBe(400);
    expect((await upload({ full: webp() }, admin)).status).toBe(400);
    expect((await upload({ full: new Uint8Array(2_600_000).fill(1), small: webp() }, admin)).status).toBe(400);
  });

  it("/api/uploads РЅРµ РІС–РґРґР°С” С‡СѓР¶С– С„Р°Р№Р»Рё", async () => {
    for (const name of ["..%2F..%2Fpackage.json", "outbox.json", "nope-1600.webp"]) expect((await serve(name)).status).toBe(404);
  });

  it("РїС–РґРїРёСЃ С„Р°Р№Р»Сѓ РІРёР·РЅР°С‡Р°С”С‚СЊСЃСЏ Р·Р° РІРјС–СЃС‚РѕРј", () => {
    expect(detectPhotoType(webp())).toBe("webp");
    expect(detectPhotoType(jpeg())).toBe("jpg");
    expect(detectPhotoType(png())).toBeNull();
    expect(detectPhotoType(new Uint8Array())).toBeNull();
  });
});

describe("РІР»Р°СЃРЅС– С„РѕС‚Рѕ С‚РѕРІР°СЂСѓ", () => {
  it("Р·Р±РµСЂС–РіР°СЋС‚СЊСЃСЏ РІ С‚РѕРІР°СЂС–; РіР°Р»РµСЂРµСЏ вЂ” Р»РёС€Рµ РІРѕРЅРё, Р±РµР· С„РѕС‚Рѕ Р· Р±С–Р±Р»С–РѕС‚РµРєРё", async () => {
    const urls: string[] = [];
    for (let i = 0; i < 2; i++) urls.push((await (await upload({ full: webp(), small: webp() }, admin)).json()).url);

    const r = await patchProduct("np3", { images: urls }, admin);
    expect(r.status).toBe(200);
    expect(r.data.product.images).toEqual(urls);
    // Р“РѕР»РѕРІРЅРµ С„РѕС‚Рѕ РІ РєР°СЂС‚РєР°С… вЂ” РїРµСЂС€Рµ РІР»Р°СЃРЅРµ
    expect(r.data.product.image).toBe(urls[0]);
    const gallery = productGallery(r.data.product);
    expect(gallery.map((g) => g.full)).toEqual(urls);
    expect(gallery[0].thumb).toBe(urls[0].replace("-1600.", "-800."));

    // РџРѕСЂСЏРґРѕРє Р·РјС–РЅСЋС”С‚СЊСЃСЏ (РЅРѕРІРµ РіРѕР»РѕРІРЅРµ)
    const swapped = await patchProduct("np3", { images: [urls[1], urls[0]] }, admin);
    expect(swapped.data.product.image).toBe(urls[1]);

    // РЈСЃС– РІРёРґР°Р»РµРЅРѕ вЂ” Р·РЅРѕРІСѓ С„РѕС‚Рѕ Р· Р±С–Р±Р»С–РѕС‚РµРєРё
    const cleared = await patchProduct("np3", { images: [] }, admin);
    expect(cleared.data.product.images).toBeUndefined();
    expect(cleared.data.product.image).toContain("images.unsplash.com");
  });

  it("РЅРµ Р±С–Р»СЊС€Рµ 8 С„РѕС‚Рѕ С– Р»РёС€Рµ СЃРїСЂР°РІР¶РЅС– Р°РґСЂРµСЃРё", async () => {
    const many = Array.from({ length: 9 }, (_, i) => `https://example.supabase.co/storage/v1/object/public/product-photos/a${i}-1600.webp`);
    const tooMany = await patchProduct("np3", { images: many }, admin);
    expect(tooMany.status).toBe(400);
    expect(tooMany.data.errors.images).toContain("8");
    for (const bad of ["javascript:alert(1)", "http://insecure.example/a.jpg", "/api/uploads/../../x.webp"])
      expect((await patchProduct("np3", { images: [bad] }, admin)).status).toBe(400);
  });
});
