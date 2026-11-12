import { describe, expect, it } from "vitest";
import { formatPhone, isPhoneComplete } from "../../app/components/form-ui";
import { isSamePageLink } from "../../app/components/nav-utils";
import { RECENT_LIMIT, parseRecent, pushRecent } from "../../app/components/recently-viewed";

describe("нещодавно переглянуті", () => {
  it("новий перегляд стає першим", () => {
    expect(pushRecent(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  });

  it("повторний перегляд переносить товар на початок без дублікатів", () => {
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });

  it("зберігає не більше ліміту", () => {
    const many = Array.from({ length: RECENT_LIMIT }, (_, i) => `p${i}`);
    const next = pushRecent(many, "new");
    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe("new");
    expect(next).not.toContain(`p${RECENT_LIMIT - 1}`);
  });

  it("parseRecent витримує зіпсовані дані", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent('["a", 1, null, "b", "a"]')).toEqual(["a", "b"]);
  });
});

describe("посилання на поточну сторінку (прокрутка нагору)", () => {
  it("та сама сторінка", () => {
    expect(isSamePageLink("/delivery", "/delivery")).toBe(true);
    expect(isSamePageLink("/catalog?q=x", "/catalog")).toBe(true);
    expect(isSamePageLink("/", "/")).toBe(true);
    expect(isSamePageLink("/about/", "/about")).toBe(true);
  });

  it("інша сторінка або якір — звичайний перехід", () => {
    expect(isSamePageLink("/about", "/delivery")).toBe(false);
    expect(isSamePageLink("/catalog", "/catalog/tents")).toBe(false);
    expect(isSamePageLink("/#about", "/")).toBe(false);
    expect(isSamePageLink("#contacts", "/")).toBe(false);
    expect(isSamePageLink("tel:+380800330121", "/")).toBe(false);
  });
});

describe("телефон", () => {
  it("formatPhone приводить номер до +380 XX XXX XX XX", () => {
    expect(formatPhone("0501112233")).toBe("+380 50 111 22 33");
    expect(formatPhone("+380501112233")).toBe("+380 50 111 22 33");
    expect(formatPhone("380 50 111 22 33 99")).toBe("+380 50 111 22 33");
    expect(formatPhone("")).toBe("+380 ");
  });

  it("isPhoneComplete — рівно 12 цифр", () => {
    expect(isPhoneComplete("+380 50 111 22 33")).toBe(true);
    expect(isPhoneComplete("+380 50 111")).toBe(false);
  });
});
