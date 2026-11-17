import type { NextRequest } from "next/server";
import { withDerived, type Product } from "../../../../components/catalog-data";
import { applyProductInput, validateProduct } from "../../../../lib/admin-product";
import { error, json, requireAdmin } from "../../../../lib/server/auth";
import { ensureCatalog, invalidateCatalog, loadCatalog, lockProduct, updateProduct } from "../../../../lib/server/catalog";
import { tx } from "../../../../lib/server/db";
import { sendMails, type Mail } from "../../../../lib/server/mail";
import { productEvents, snapshot } from "../../../../lib/server/notifications";

/**
 * Зміна товару.
 * - повне редагування: усі поля форми (як при створенні);
 * - швидкі дії зі списку: лише { stock }, { price }, { hidden } — без решти полів
 */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/products/[id]">) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const quickKeys = ["stock", "price", "hidden"];
  const isQuick = Object.keys(body).length > 0 && Object.keys(body).every((k) => quickKeys.includes(k));

  await ensureCatalog();
  const mails: Mail[] = [];
  const result = await tx(async (q) => {
    // Рядок заблоковано до кінця транзакції — паралельне замовлення чекає
    const product = await lockProduct(q, id);
    if (!product) return { notFound: true as const };
    const before = snapshot(product);

    // Повні дані для перевірки: поточний товар + зміни
    const merged = { ...product, oldPrice: product.oldPrice ?? null, capacity: product.capacity ?? null, ...body, id: undefined };
    // Швидка зміна ціни сама прибирає неактуальну стару ціну (див. нижче)
    if (isQuick) merged.oldPrice = null;
    const { data, errors } = validateProduct(merged);
    if (!data) return { errors };

    if (isQuick) {
      if ("stock" in body) product.stock = data.stock;
      if ("price" in body) {
        product.price = data.price;
        // Нова ціна не менша за стару — знижки більше немає
        if (product.oldPrice && product.oldPrice <= data.price) delete product.oldPrice;
      }
      if ("hidden" in body) {
        if (data.hidden) product.hidden = true;
        else delete product.hidden;
      }
      product.updatedAt = new Date().toISOString();
    } else {
      applyProductInput(product as Partial<Product>, data);
    }
    const updated = withDerived(product);
    await updateProduct(q, updated);
    // Сповіщення: «з'явився в наявності» підписникам, «знижка» — тим, у кого в обраному
    await productEvents(q, updated, before, mails);
    return { ok: true as const };
  });

  if ("notFound" in result) return error("Товар не знайдено", 404);
  if ("errors" in result) return json({ error: "Перевірте поля форми", errors: result.errors }, 400);
  invalidateCatalog();
  await sendMails(mails);
  // Товар з рейтингом і продажами — як у списку адмін-панелі
  const product = (await loadCatalog()).find((p) => p.id === id);
  return json({ product });
}
