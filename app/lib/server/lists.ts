import "server-only";
import type { CartLine } from "../../components/cart-logic";
import { db, num, type Queryable } from "./db";

/*
 * Списки покупця в акаунті: кошик, обране, «повідомити про наявність».
 * Кошик і обране браузер надсилає цілим списком — замінюємо повністю, зберігаючи порядок.
 */

export async function getCart(userId: string, q: Queryable = db): Promise<CartLine[]> {
  const rows = await q.query("select product_id, qty from cart_items where user_id = $1 order by position", [userId]);
  return rows.map((r) => ({ id: r.product_id, qty: num(r.qty) }));
}

/**
 * Блокує рядок користувача до кінця транзакції — щоб два одночасні запити
 * одного покупця (напр. дві вкладки) не замінювали той самий список паралельно
 */
const lockUser = (q: Queryable, userId: string) => q.query("select 1 from users where id = $1 for update", [userId]);

/** Замінює кошик (викликати в транзакції — tx) */
export async function setCart(userId: string, lines: CartLine[], q: Queryable) {
  await lockUser(q, userId);
  await q.query("delete from cart_items where user_id = $1", [userId]);
  if (!lines.length) return;
  await q.query(
    `insert into cart_items (user_id, product_id, qty, position)
     select $1, x.id, x.qty, x.pos - 1
     from unnest($2::text[], $3::int[]) with ordinality as x(id, qty, pos)`,
    [userId, lines.map((l) => l.id), lines.map((l) => l.qty)],
  );
}

export async function getFavorites(userId: string, q: Queryable = db): Promise<string[]> {
  const rows = await q.query("select product_id from favorites where user_id = $1 order by position", [userId]);
  return rows.map((r) => r.product_id);
}

/** Замінює список обраного (викликати в транзакції — tx) */
export async function setFavorites(userId: string, ids: string[], q: Queryable) {
  await lockUser(q, userId);
  await q.query("delete from favorites where user_id = $1", [userId]);
  if (!ids.length) return;
  await q.query(
    `insert into favorites (user_id, product_id, position)
     select $1, x.id, x.pos - 1 from unnest($2::text[]) with ordinality as x(id, pos)`,
    [userId, ids],
  );
}

/** Підписки «повідомити про наявність», найстаріші першими */
export async function getStockAlerts(userId: string, q: Queryable = db): Promise<string[]> {
  const rows = await q.query("select product_id from stock_alerts where user_id = $1 order by created_at, product_id", [userId]);
  return rows.map((r) => r.product_id);
}
