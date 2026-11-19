import { describe, expect, it } from "vitest";
import { imageSrcSet, isUploadedPhoto, resizeImage, responsiveImage } from "../../app/components/photo";

const U = "https://images.unsplash.com/photo-1?auto=format&fit=crop&w=640&h=420&q=90";

describe("легші фото", () => {
  it("Unsplash: нова ширина, висота пропорційно, якість 70", () => {
    const u = new URL(resizeImage(U, 320));
    expect(u.searchParams.get("w")).toBe("320");
    expect(u.searchParams.get("h")).toBe("210");
    expect(u.searchParams.get("q")).toBe("70");
    expect(u.searchParams.get("fit")).toBe("crop");
    expect(u.searchParams.get("auto")).toBe("format");
  });

  it("інші адреси (фото з адмінки) не змінюються і без srcset", () => {
    const own = "https://example.com/tent.jpg?w=100";
    expect(resizeImage(own, 320)).toBe(own);
    expect(imageSrcSet(own, [320])).toBeUndefined();
    expect(responsiveImage(own, "100vw")).toEqual({ src: own });
    expect(resizeImage("/local.webp", 320)).toBe("/local.webp");
  });

  it("фото, завантажені в адмінці: зменшена копія 800 px для карток, 1600 — для великих екранів", () => {
    const full = "https://x.supabase.co/storage/v1/object/public/product-photos/m1-abc-1600.webp";
    const small = full.replace("-1600.", "-800.");
    expect(isUploadedPhoto(full)).toBe(true);
    expect(isUploadedPhoto("/api/uploads/m1-abc-1600.jpg")).toBe(true);
    expect(isUploadedPhoto("https://example.com/tent-1600.png")).toBe(false);
    expect(resizeImage(full, 240)).toBe(small);
    expect(resizeImage(full, 1200)).toBe(full);
    expect(responsiveImage(full, "50vw")).toEqual({ src: small, srcSet: `${small} 800w, ${full} 1600w`, sizes: "50vw" });
  });

  it("srcset з кількома ширинами і sizes", () => {
    const r = responsiveImage(U, "50vw", [320, 640, 960]);
    expect(r.srcSet?.split(", ").map((s) => s.split(" ")[1])).toEqual(["320w", "640w", "960w"]);
    expect(r.sizes).toBe("50vw");
    expect(new URL(r.src).searchParams.get("w")).toBe("960");
    // Картки — не ширше 640: на телефоні з екраном 2× більші файли не дають видимої різниці
    expect(responsiveImage(U, "92vw").srcSet).not.toContain("w=960");
  });
});
