import { beforeAll, describe, expect, it } from "vitest";
import * as ordersItem from "../../app/api/admin/orders/[number]/route";
import * as reviewItem from "../../app/api/admin/reviews/[id]/route";
import * as adminReviews from "../../app/api/admin/reviews/route";
import * as summary from "../../app/api/admin/summary/route";
import * as register from "../../app/api/auth/register/route";
import * as orders from "../../app/api/orders/route";
import * as productReviews from "../../app/api/products/[id]/reviews/route";
import { loadCatalog } from "../../app/lib/server/catalog";
import { call, markEmailVerified, sessionCookie, uniqueEmail } from "./helpers";

const ADMIN_EMAIL = "reviews-owner@example.com";
process.env.ADMIN_EMAILS = ADMIN_EMAIL;

const withParams = <P extends Record<string, string>>(
  handler: (req: never, ctx: { params: Promise<P> }) => Promise<Response>,
  params: P,
) => ((req: never) => handler(req, { params: Promise.resolve(params) })) as Parameters<typeof call>[0];

const PRODUCT = "hm-double";
const reviewsOf = (id: string, cookie?: string) => call(withParams(productReviews.GET, { id }), { method: "GET", cookie });
const postReview = (id: string, body: object, cookie?: string) => call(withParams(productReviews.POST, { id }), { body, cookie });
const moderate = (id: string, status: string, cookie: string) =>
  call(withParams(reviewItem.PATCH, { id }), { method: "PATCH", body: { status }, cookie });
const productStats = async (id: string) => (await loadCatalog()).find((p) => p.id === id)!;

const newUser = async (firstName: string, lastName = "") =>
  sessionCookie((await call(register.POST, { body: { firstName, lastName, email: uniqueEmail(), phone: "", password: "camping2026" } })).res);

let admin = "";
let buyer = "";
let visitor = "";

beforeAll(async () => {
  admin = sessionCookie((await call(register.POST, { body: { firstName: "Власник", email: ADMIN_EMAIL, phone: "", password: "camping2026" } })).res);
  await markEmailVerified(ADMIN_EMAIL);
  buyer = await newUser("Олена", "Коваль");
  visitor = await newUser("Ігор");

  // Олена купує гамак, замовлення відправлене — це підтверджена покупка
  const r = await call(orders.POST, {
    cookie: buyer,
    body: {
      lines: [{ id: PRODUCT, qty: 2 }],
      contact: { firstName: "Олена", lastName: "Коваль", phone: "+380 50 111 22 33" },
      delivery: { method: "np-branch", city: "Київ", branch: "1" },
      payment: "invoice",
      agreed: true,
    },
  });
  const number = r.data.order.number;
  for (const status of ["confirmed", "paid", "shipped"])
    await call(withParams(ordersItem.PATCH, { number }), { method: "PATCH", cookie: admin, body: { status } });
});

describe("відгуки на сайті", () => {
  it("спочатку відгуків немає; гість бачить, що треба увійти", async () => {
    const r = await reviewsOf(PRODUCT);
    expect(r.data).toEqual({ reviews: [], mine: null, verifiedBuyer: false, loggedIn: false });
    expect((await productStats(PRODUCT)).reviews).toBe(0);
  });

  it("писати можуть лише покупці з акаунтом; перевірка оцінки й тексту", async () => {
    expect((await postReview(PRODUCT, { rating: 5, text: "Чудовий гамак, рекомендую!" })).status).toBe(401);
    expect((await postReview(PRODUCT, { rating: 6, text: "Чудовий гамак, рекомендую!" }, visitor)).status).toBe(400);
    expect((await postReview(PRODUCT, { rating: 4, text: "Коротко" }, visitor)).status).toBe(400);
    expect((await postReview("no-such", { rating: 4, text: "Чудовий гамак, рекомендую!" }, visitor)).status).toBe(404);
  });

  it("новий відгук — на модерації: на сайті його ще немає, автор бачить статус", async () => {
    const r = await postReview(PRODUCT, { rating: 5, text: "Висить між соснами вже третій тиждень, діти в захваті." }, buyer);
    expect(r.status).toBe(200);
    expect(r.data.mine.status).toBe("pending");

    const own = await reviewsOf(PRODUCT, buyer);
    expect(own.data).toMatchObject({ reviews: [], mine: { status: "pending", rating: 5 }, verifiedBuyer: true, loggedIn: true });
    expect((await reviewsOf(PRODUCT)).data.reviews).toEqual([]);
    expect((await productStats(PRODUCT)).reviews).toBe(0);
  });

  it("«Підтверджена покупка» — лише в того, хто купував", async () => {
    await postReview(PRODUCT, { rating: 3, text: "Не купував, але бачив у друзів — так собі." }, visitor);
    const list = (await call(adminReviews.GET, { method: "GET", cookie: admin })).data.reviews;
    const olena = list.find((r: { author: string }) => r.author === "Олена К.");
    const ihor = list.find((r: { author: string }) => r.author === "Ігор");
    expect(olena).toMatchObject({ verified: true, status: "pending", product: { name: "Гамак Nature Peak Double" } });
    expect(ihor).toMatchObject({ verified: false, status: "pending" });
    // Повне прізвище і email на сайті не показуються
    expect(olena.author).toBe("Олена К.");
  });

  it("після схвалення відгук на сайті, рейтинг рахується лише зі схвалених", async () => {
    const list = (await call(adminReviews.GET, { method: "GET", cookie: admin })).data.reviews;
    const olena = list.find((r: { author: string }) => r.author === "Олена К.");
    const ihor = list.find((r: { author: string }) => r.author === "Ігор");

    expect((await moderate(olena.id, "approved", admin)).status).toBe(200);
    expect((await moderate(ihor.id, "rejected", admin)).status).toBe(200);

    const pub = (await reviewsOf(PRODUCT)).data.reviews;
    expect(pub).toHaveLength(1);
    expect(pub[0]).toMatchObject({ author: "Олена К.", rating: 5, verified: true });
    expect(Object.keys(pub[0]).sort()).toEqual(["author", "createdAt", "id", "rating", "text", "verified"]);
    expect(await productStats(PRODUCT)).toMatchObject({ rating: 5, reviews: 1 });

    // Відхилений автор бачить свій статус
    expect((await reviewsOf(PRODUCT, visitor)).data.mine.status).toBe("rejected");
  });

  it("змінений відгук знову проходить модерацію й випадає з рейтингу", async () => {
    await postReview(PRODUCT, { rating: 4, text: "Додам: через місяць тканина трохи вигоріла." }, buyer);
    expect((await reviewsOf(PRODUCT)).data.reviews).toEqual([]);
    expect(await productStats(PRODUCT)).toMatchObject({ rating: 0, reviews: 0 });
    // Один відгук на товар — не дублюється
    const mine = (await call(adminReviews.GET, { method: "GET", cookie: admin })).data.reviews.filter((r: { author: string }) => r.author === "Олена К.");
    expect(mine).toHaveLength(1);
    await moderate(mine[0].id, "approved", admin);
    expect(await productStats(PRODUCT)).toMatchObject({ rating: 4, reviews: 1 });
  });

  it("модерація — лише для адміністратора; зведення рахує відгуки на модерації", async () => {
    const list = (await call(adminReviews.GET, { method: "GET", cookie: admin })).data.reviews;
    expect((await call(adminReviews.GET, { method: "GET", cookie: visitor })).status).toBe(403);
    expect((await moderate(list[0].id, "approved", visitor)).status).toBe(403);
    expect((await moderate("nope", "approved", admin)).status).toBe(404);
    expect((await moderate(list[0].id, "bogus", admin)).status).toBe(400);

    await postReview("hm-single", { rating: 5, text: "Легкий і зручний гамак для поїздок." }, visitor);
    const s = await call(summary.GET, { method: "GET", cookie: admin });
    expect(s.data.reviews.pending).toBeGreaterThanOrEqual(1);
  });

  it("видалення відгуку", async () => {
    const list = (await call(adminReviews.GET, { method: "GET", cookie: admin })).data.reviews;
    const target = list.find((r: { productId: string }) => r.productId === "hm-single");
    expect((await call(withParams(reviewItem.DELETE, { id: target.id }), { method: "DELETE", cookie: admin })).status).toBe(200);
    expect((await call(withParams(reviewItem.DELETE, { id: target.id }), { method: "DELETE", cookie: admin })).status).toBe(404);
  });
});

describe("продажі в каталозі", () => {
  it("рахуються з замовлень; скасоване не враховується", async () => {
    const before = (await productStats("li-head")).sold ?? 0;
    const place = async () =>
      (await call(orders.POST, {
        cookie: visitor,
        body: {
          lines: [{ id: "li-head", qty: 3 }],
          contact: { firstName: "Ігор", lastName: "Тест", phone: "+380 50 111 22 33" },
          delivery: { method: "np-branch", city: "Київ", branch: "1" },
          payment: "invoice",
          agreed: true,
        },
      })).data.order.number as string;
    await place();
    const cancelled = await place();
    expect((await productStats("li-head")).sold).toBe(before + 6);
    await call(withParams(ordersItem.PATCH, { number: cancelled }), { method: "PATCH", cookie: admin, body: { status: "cancelled" } });
    expect((await productStats("li-head")).sold).toBe(before + 3);
  });
});
