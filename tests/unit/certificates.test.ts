import { describe, expect, it } from "vitest";
import type { Product } from "../../app/components/catalog-data";
import { detectCertificateType, isKnifeAccessory, isListed, matchCertificateFile, missingCertificate, needsCertificate } from "../../app/lib/certificates";

const p = (id: string, name: string, over: Partial<Product> = {}) =>
  ({ id, name, category: "knives", attrs: [], ...over }) as unknown as Product;

const catalog = [
  p("g618-gr", "Ніж складаний Ganzo G618-GR зелений"),
  p("g618-bk", "Ніж складаний Ganzo G618-BK чорний"),
  p("g6181", "Ніж складаний Ganzo G6181 440C"),
  p("fh925", "Ніж складаний Firebird FH925-BK (8.5 см) D2"),
  p("adimanti", "Нiж туристичний Adimanti by Ganzo (Skimen design) (8.5 см) S35VN / титан чорний", { attrs: [["Артикул", "SKIMEN-TI"]] }),
  p("sheath", "Чохол рулон для ножів Civivi CG-25B, чорний"),
  p("tent-g618", "Намет G618", { category: "tents" }),
];
const ids = (file: string) => matchCertificateFile(file, catalog).map((x) => x.id).sort();

describe("підбір ножів за назвою файлу сертифіката", () => {
  it("модель без кольору — усі кольори цієї моделі", () => {
    expect(ids("Ganzo G618.pdf")).toEqual(["g618-bk", "g618-gr"]);
    expect(ids("g618.PDF")).toEqual(["g618-bk", "g618-gr"]);
  });

  it("модель з кольором — лише цей колір", () => {
    expect(ids("G618-GR.pdf")).toEqual(["g618-gr"]);
    expect(ids("висновок_G618GR.pdf")).toEqual(["g618-gr"]);
  });

  it("схожа модель (G6181) не плутається з G618", () => {
    expect(ids("G6181.pdf")).toEqual(["g6181"]);
  });

  it("за артикулом", () => {
    expect(ids("SKIMEN-TI.pdf")).toEqual(["adimanti"]);
  });

  it("аксесуари й інші категорії не підбираються; без коду моделі — нічого", () => {
    expect(ids("CG-25B.pdf")).toEqual([]);
    expect(ids("сертифікат.pdf")).toEqual([]);
    expect(ids("scan 01.pdf")).toEqual([]);
  });
});

describe("хто потребує сертифіката", () => {
  it("ніж — так, чохол — ні, намет — ні", () => {
    expect(needsCertificate(catalog[0])).toBe(true);
    expect(isKnifeAccessory(catalog[5])).toBe(true);
    expect(needsCertificate(catalog[5])).toBe(false);
    expect(needsCertificate(catalog[6])).toBe(false);
  });

  it("власник може зняти вимогу; прихований товар не показується в будь-якому разі", () => {
    expect(needsCertificate({ ...catalog[0], certificateExempt: true })).toBe(false);
    expect(missingCertificate(catalog[0])).toBe(true);
    expect(isListed(catalog[0])).toBe(false);
    expect(isListed({ ...catalog[0], certificate: "https://x.supabase.co/a.pdf" })).toBe(true);
    expect(isListed({ ...catalog[0], certificate: "https://x.supabase.co/a.pdf", hidden: true })).toBe(false);
  });
});

describe("файли сертифікатів", () => {
  it("тип за вмістом", () => {
    expect(detectCertificateType(new Uint8Array([...Buffer.from("%PDF-1.4"), 0]))).toBe("pdf");
    expect(detectCertificateType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("jpg");
    expect(detectCertificateType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(detectCertificateType(new Uint8Array(Buffer.from("<html>pdf</html>")))).toBeNull();
  });
});
