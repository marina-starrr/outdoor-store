"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "./Auth";
import AuthForms from "./AuthForms";
import { useCart } from "./Cart";
import Icon from "./Icon";
import { Field, formatPhone, inputCls } from "./form-ui";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { Breadcrumbs, ProductCard } from "./catalog-ui";
import { CartItem, EmptyCart, FreeShippingBar, TrashIcon } from "./cart-ui";
import {
  cartRecommendations,
  cartTotals,
  deliveryOptions,
  deliveryPrice,
  paymentOptions,
  promoCodes,
  type DeliveryId,
  type PaymentId,
} from "./cart-logic";
import { formatPrice, productsWord } from "./catalog-data";

type Form = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city: string;
  branch: string;
  address: string;
  comment: string;
  noCall: boolean;
};

const emptyForm: Form = {
  firstName: "",
  lastName: "",
  phone: "+380 ",
  email: "",
  city: "",
  branch: "",
  address: "",
  comment: "",
  noCall: false,
};

type Errors = Partial<Record<keyof Form, string>>;

type PlacedOrder = {
  number: string;
  lines: { id: string; name: string; price: number; qty: number }[];
  total: number;
  firstName: string;
  phone: string;
  delivery: DeliveryId;
  noCall: boolean;
};

/** Відповідь сервера на оформлення замовлення */
type OrderResponse = {
  order?: {
    number: string;
    lines: { id: string; name: string; price: number; qty: number }[];
    total: number;
  };
  error?: string;
};

function validate(form: Form, delivery: DeliveryId): Errors {
  const errors: Errors = {};
  if (form.firstName.trim().length < 2) errors.firstName = "Вкажіть ім'я";
  if (form.lastName.trim().length < 2) errors.lastName = "Вкажіть прізвище";
  if (form.phone.replace(/\D/g, "").length !== 12) errors.phone = "Номер у форматі +380 XX XXX XX XX";
  if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errors.email = "Перевірте email";
  if (delivery !== "pickup" && form.city.trim().length < 2) errors.city = "Вкажіть місто";
  if ((delivery === "np-branch" || delivery === "ukrposhta") && !form.branch.trim())
    errors.branch = "Вкажіть номер відділення";
  if (delivery === "np-courier" && form.address.trim().length < 5)
    errors.address = "Вкажіть вулицю, будинок і квартиру";
  return errors;
}

export default function CartPage() {
  const router = useRouter();
  const { lines, count, ready, clear, add } = useCart();
  const { status, user, refresh } = useAuth();

  const [query, setQuery] = useState("");
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [delivery, setDelivery] = useState<DeliveryId>("np-branch");
  const [payment, setPayment] = useState<PaymentId>("card");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string>();
  const [promoError, setPromoError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [pending, setPending] = useState(false);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);

  // Після входу підставляємо контакти та останню адресу доставки з профілю
  // (лише в порожні поля — те, що користувач уже ввів, не перезаписуємо)
  if (user && prefilledFor !== user.id) {
    setPrefilledFor(user.id);
    const d = user.lastDelivery;
    setForm((f) => ({
      ...f,
      firstName: f.firstName || user.firstName,
      lastName: f.lastName || user.lastName,
      phone: f.phone.replace(/\D/g, "").length > 3 ? f.phone : user.phone || f.phone,
      email: f.email || user.email,
      city: f.city || d?.city || "",
      branch: f.branch || d?.branch || "",
      address: f.address || d?.address || "",
    }));
    if (d) setDelivery(d.method);
  }

  const totals = cartTotals(lines, delivery, promo);
  const partsAllowed = totals.total >= (paymentOptions.find((p) => p.id === "parts")?.minTotal ?? 0);
  const effectivePayment = payment === "parts" && !partsAllowed ? "card" : payment;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    if (promoCodes[code]) {
      setPromo(code);
      setPromoError("");
    } else {
      setPromo(undefined);
      setPromoError("Такого промокоду не існує");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "user") {
      document.getElementById("checkout-login")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const found = validate(form, delivery);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      document.getElementById(`field-${firstInvalid}`)?.focus();
      return;
    }

    setPending(true);
    setSubmitError("");
    let data: OrderResponse;
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map(({ id, qty }) => ({ id, qty })),
          contact: {
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone,
            email: form.email,
          },
          delivery: { method: delivery, city: form.city, branch: form.branch, address: form.address },
          payment: effectivePayment,
          promo,
          comment: form.comment,
          noCall: form.noCall,
        }),
      });
      data = await res.json();
      // Сесія закінчилась — оновлюємо стан, щоб показати форму входу
      if (res.status === 401) await refresh();
    } catch {
      data = { error: "Немає з'єднання з сервером. Спробуйте ще раз." };
    }
    setPending(false);

    if (!data.order) {
      setSubmitError(data.error ?? "Не вдалося оформити замовлення");
      return;
    }
    setOrder({
      number: data.order.number,
      lines: data.order.lines,
      total: data.order.total,
      firstName: form.firstName.trim(),
      phone: form.phone,
      delivery,
      noCall: form.noCall,
    });
    clear();
    refresh(); // оновлює збережену адресу доставки в профілі
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const recommendations = cartRecommendations(lines);

  return (
    <div className="flex min-h-screen flex-col bg-[#f7fafc] text-[#082c45]">
      <SiteHeader
        query={query}
        onQueryChange={setQuery}
        onSearchSubmit={(q) => router.push(`/catalog?q=${encodeURIComponent(q)}`)}
      />

      <main className="flex-1">
        <div className="mx-auto max-w-[1440px] px-5 pb-20 pt-6 lg:px-8">
          <Breadcrumbs items={[{ label: "Головна", href: "/" }, { label: order ? "Замовлення оформлено" : "Кошик" }]} />

          {order ? (
            <OrderSuccess order={order} />
          ) : !ready ? (
            <div className="mt-8 h-64 animate-pulse rounded-[24px] bg-white" aria-label="Завантаження кошика" />
          ) : lines.length === 0 ? (
            <>
              <h1 className="mt-4 text-[clamp(2rem,4vw,2.9rem)] font-extrabold tracking-[-0.04em]">Кошик</h1>
              <div className="mt-6 rounded-[24px] bg-white shadow-[0_18px_52px_rgba(79,93,101,.08)]">
                <EmptyCart />
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <h1 className="text-[clamp(2rem,4vw,2.9rem)] font-extrabold leading-[1.05] tracking-[-0.04em]">
                  Оформлення замовлення
                </h1>
                <Link href="/catalog" className="inline-flex items-center gap-2 text-sm font-bold text-[#098fd0] hover:underline">
                  <Icon name="arrow" className="h-4 w-4 rotate-180" /> Продовжити покупки
                </Link>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
                <div className="grid gap-6">
                  {/* Товари */}
                  <Card>
                    <div className="flex items-center justify-between gap-4">
                      <CardTitle step={1}>
                        Товари <span className="text-base font-semibold text-[#527083]">· {count} {productsWord(count)}</span>
                      </CardTitle>
                      {confirmClear ? (
                        <span className="flex items-center gap-2 text-sm">
                          <span className="text-[#527083]">Очистити кошик?</span>
                          <button type="button" onClick={() => { clear(); setConfirmClear(false); }} className="font-bold text-[#e5484d] hover:underline">
                            Так
                          </button>
                          <button type="button" onClick={() => setConfirmClear(false)} className="font-bold text-[#264e65] hover:underline">
                            Ні
                          </button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirmClear(true)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#8aa5b5] transition hover:text-[#e5484d]">
                          <TrashIcon /> Очистити
                        </button>
                      )}
                    </div>
                    <div className="mt-4">
                      <FreeShippingBar subtotal={totals.subtotal} />
                    </div>
                    <ul className="mt-2 divide-y divide-[#e3edf3]">
                      {lines.map((line) => (
                        <CartItem key={line.id} line={line} variant="wide" />
                      ))}
                    </ul>
                  </Card>

                  {status === "loading" ? (
                    <div className="h-72 animate-pulse rounded-[24px] bg-white" aria-label="Завантаження" />
                  ) : status === "guest" ? (
                    <CheckoutLogin />
                  ) : (
                  <form id="checkout" onSubmit={submit} noValidate className="grid gap-6">
                  {/* Контакти */}
                  <Card>
                    <CardTitle step={2}>Контактні дані</CardTitle>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <Field id="firstName" label="Ім'я" error={errors.firstName}>
                        <input id="field-firstName" autoComplete="given-name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls(errors.firstName)} />
                      </Field>
                      <Field id="lastName" label="Прізвище" error={errors.lastName}>
                        <input id="field-lastName" autoComplete="family-name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls(errors.lastName)} />
                      </Field>
                      <Field id="phone" label="Телефон" error={errors.phone}>
                        <input id="field-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} className={inputCls(errors.phone)} />
                      </Field>
                      <Field id="email" label="Email" optional error={errors.email}>
                        <input id="field-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls(errors.email)} placeholder="для електронного чека" />
                      </Field>
                    </div>
                  </Card>

                  {/* Доставка */}
                  <Card>
                    <CardTitle step={3}>Доставка</CardTitle>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {deliveryOptions.map((o) => {
                        const price = deliveryPrice(o.id, totals.subtotal);
                        return (
                          <OptionCard
                            key={o.id}
                            name="delivery"
                            checked={delivery === o.id}
                            onChange={() => setDelivery(o.id)}
                            title={o.title}
                            text={o.text}
                            aside={price === 0 ? "Безкоштовно" : formatPrice(price)}
                            asideAccent={price === 0}
                          />
                        );
                      })}
                    </div>
                    {delivery !== "pickup" ? (
                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <Field id="city" label="Місто" error={errors.city}>
                          <input id="field-city" autoComplete="address-level2" value={form.city} onChange={(e) => set("city", e.target.value)} className={inputCls(errors.city)} placeholder="Наприклад, Київ" list="cities" />
                          <datalist id="cities">
                            {["Київ", "Львів", "Одеса", "Дніпро", "Харків", "Вінниця", "Івано-Франківськ", "Ужгород", "Полтава", "Чернігів"].map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                        </Field>
                        {delivery === "np-courier" ? (
                          <Field id="address" label="Адреса" error={errors.address}>
                            <input id="field-address" autoComplete="street-address" value={form.address} onChange={(e) => set("address", e.target.value)} className={inputCls(errors.address)} placeholder="Вулиця, будинок, квартира" />
                          </Field>
                        ) : (
                          <Field id="branch" label={delivery === "ukrposhta" ? "Індекс або номер відділення" : "Відділення / поштомат №"} error={errors.branch}>
                            <input id="field-branch" value={form.branch} onChange={(e) => set("branch", e.target.value)} className={inputCls(errors.branch)} placeholder={delivery === "ukrposhta" ? "01001" : "12"} />
                          </Field>
                        )}
                      </div>
                    ) : (
                      <p className="mt-5 flex items-start gap-3 rounded-2xl bg-[#f3f9fd] p-4 text-sm text-[#3d5d70]">
                        <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-[#067eb7]" />
                        Замовлення буде готове до видачі протягом 2 годин у магазині за адресою
                        Київ, вул. Туристична, 12 (щодня 09:00–20:00). Ми надішлемо SMS, коли все буде зібрано.
                      </p>
                    )}
                  </Card>

                  {/* Оплата */}
                  <Card>
                    <CardTitle step={4}>Оплата</CardTitle>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      {paymentOptions.map((o) => {
                        const disabled = o.id === "parts" && !partsAllowed;
                        return (
                          <OptionCard
                            key={o.id}
                            name="payment"
                            checked={effectivePayment === o.id}
                            disabled={disabled}
                            onChange={() => setPayment(o.id)}
                            title={o.title}
                            text={disabled ? `Доступно від ${formatPrice(o.minTotal ?? 0)}` : o.text}
                          />
                        );
                      })}
                    </div>
                    <Field id="comment" label="Коментар до замовлення" optional className="mt-5">
                      <textarea id="field-comment" rows={3} value={form.comment} onChange={(e) => set("comment", e.target.value)} className={`${inputCls()} resize-y`} placeholder="Наприклад, зручний час для дзвінка" />
                    </Field>
                    <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm">
                      <input type="checkbox" checked={form.noCall} onChange={(e) => set("noCall", e.target.checked)} className="h-[18px] w-[18px] accent-[#ffd51f]" />
                      Не телефонуйте мені — я впевнений у замовленні
                    </label>
                  </Card>
                  </form>
                  )}
                </div>

                {/* Підсумок */}
                <aside className="lg:sticky lg:top-28">
                  <Card>
                    <p className="text-xl font-extrabold">Ваше замовлення</p>
                    <dl className="mt-4 space-y-2.5 text-sm">
                      <Row label={`${count} ${productsWord(count)} на суму`} value={formatPrice(totals.subtotal + totals.savings)} />
                      {totals.savings > 0 && <Row label="Знижка за акціями" value={`−${formatPrice(totals.savings)}`} accent />}
                      {totals.promoDiscount > 0 && <Row label={`Промокод ${promo}`} value={`−${formatPrice(totals.promoDiscount)}`} accent />}
                      <Row label="Доставка" value={totals.shipping === 0 ? "Безкоштовно" : formatPrice(totals.shipping)} accent={totals.shipping === 0} />
                    </dl>

                    {/* Промокод */}
                    <div className="mt-5">
                      {promo ? (
                        <p className="flex items-center justify-between rounded-2xl bg-[#e7f7ee] px-4 py-3 text-sm">
                          <span>
                            <b className="text-[#1f9d55]">{promo}</b>{" "}
                            <span className="text-[#3d5d70]">{promoCodes[promo].label}</span>
                          </span>
                          <button type="button" onClick={() => { setPromo(undefined); setPromoInput(""); }} className="grid h-7 w-7 place-items-center rounded-full text-[#527083] hover:bg-white" aria-label="Скасувати промокод">
                            <Icon name="close" className="h-4 w-4" />
                          </button>
                        </p>
                      ) : (
                        <>
                          <div className="flex gap-2">
                            <input
                              value={promoInput}
                              onChange={(e) => { setPromoInput(e.target.value); setPromoError(""); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } }}
                              placeholder="Промокод"
                              aria-label="Промокод"
                              className={`${inputCls(promoError)} uppercase placeholder:normal-case`}
                            />
                            <button type="button" onClick={applyPromo} className="shrink-0 rounded-xl bg-[#082c45] px-4 text-sm font-extrabold text-white transition hover:bg-[#0b3a5a]">
                              Застосувати
                            </button>
                          </div>
                          {promoError && <p className="mt-1.5 text-xs font-semibold text-[#e5484d]">{promoError}</p>}
                        </>
                      )}
                    </div>

                    <div className="mt-5 flex items-baseline justify-between border-t border-[#e3edf3] pt-4">
                      <span className="font-bold">До сплати</span>
                      <span className="text-3xl font-black tracking-[-0.03em]">{formatPrice(totals.total)}</span>
                    </div>

                    {submitError && (
                      <p role="alert" className="mt-4 rounded-xl bg-[#fdecec] px-4 py-3 text-sm font-semibold text-[#c53035]">
                        {submitError}
                      </p>
                    )}
                    {status === "user" ? (
                      <button
                        type="submit"
                        form="checkout"
                        disabled={pending}
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#ffd51f] py-4 text-base font-extrabold shadow-[0_10px_26px_rgba(255,213,31,.4)] transition hover:-translate-y-0.5 hover:bg-[#ffe044] disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0"
                      >
                        {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#082c45] border-t-transparent" aria-hidden="true" />}
                        Підтвердити замовлення
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={status === "loading"}
                        onClick={() => {
                          const el = document.getElementById("checkout-login");
                          el?.scrollIntoView({ behavior: "smooth", block: "center" });
                          el?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
                        }}
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#082c45] py-4 text-base font-extrabold text-white transition hover:bg-[#0b3a5a] disabled:opacity-60"
                      >
                        <Icon name="user" className="h-5 w-5" />
                        Увійдіть, щоб оформити
                      </button>
                    )}
                    <p className="mt-3 text-center text-xs leading-relaxed text-[#8aa5b5]">
                      Натискаючи кнопку, ви погоджуєтесь з умовами обробки персональних даних та
                      правилами повернення товару.
                    </p>
                  </Card>

                  <ul className="mt-4 grid gap-3 px-2 text-sm text-[#3d5d70]">
                    <li className="flex items-center gap-3"><Icon name="shield" className="h-5 w-5 text-[#067eb7]" /> Гарантія якості на все спорядження</li>
                    <li className="flex items-center gap-3"><Icon name="return" className="h-5 w-5 text-[#067eb7]" /> Обмін і повернення протягом 14 днів</li>
                    <li className="flex items-center gap-3"><Icon name="headset" className="h-5 w-5 text-[#067eb7]" /> Допомога з вибором: 0 800 330 121</li>
                  </ul>
                </aside>
              </div>
            </>
          )}

          {/* Рекомендації */}
          {ready && recommendations.length > 0 && (
            <section className="mt-16" aria-labelledby="reco-title">
              <p className="eyebrow">{lines.length ? "Не забудьте взяти" : "Популярне зараз"}</p>
              <h2 id="reco-title" className="mt-1.5 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">
                {lines.length ? "Вам також знадобиться" : "Хіти продажу"}
              </h2>
              <div className="mt-5 grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-4">
                {recommendations.map((p) => (
                  <ProductCard key={p.id} product={p} showCategory onAdd={() => add(p.id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/* ---------- Успішне замовлення ---------- */

function OrderSuccess({ order }: { order: PlacedOrder }) {
  const deliveryTitle = deliveryOptions.find((o) => o.id === order.delivery)?.title;
  return (
    <div className="mx-auto mt-8 max-w-2xl rounded-[28px] bg-white p-8 text-center shadow-[0_18px_52px_rgba(79,93,101,.1)] sm:p-12">
      <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#ffd51f]">
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="#082c45" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 12 5 5 9-10" />
        </svg>
      </span>
      <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
        Дякуємо, {order.firstName}!
      </h1>
      <p className="mt-3 text-[#3d5d70]">
        Замовлення <b className="text-[#082c45]">№ {order.number}</b> прийнято.{" "}
        {order.noCall
          ? "Ми надішлемо SMS з номером ТТН, щойно відправимо посилку."
          : `Менеджер зателефонує на ${order.phone} протягом 15 хвилин для підтвердження.`}
      </p>

      <ul className="mt-8 divide-y divide-[#e3edf3] rounded-[20px] border border-[#e3edf3] text-left">
        {order.lines.map((line) => (
          <li key={line.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
            <span className="min-w-0 truncate">
              {line.name} <span className="text-[#8aa5b5]">× {line.qty}</span>
            </span>
            <b className="shrink-0">{formatPrice(line.price * line.qty)}</b>
          </li>
        ))}
        <li className="flex items-center justify-between px-5 py-3 text-sm">
          <span className="text-[#527083]">{deliveryTitle}</span>
        </li>
        <li className="flex items-center justify-between bg-[#f6fafd] px-5 py-4">
          <span className="font-bold">Разом</span>
          <span className="text-xl font-black">{formatPrice(order.total)}</span>
        </li>
      </ul>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/catalog" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#ffd51f] px-7 py-3.5 text-sm font-extrabold transition hover:bg-[#ffe044]">
          Повернутися до каталогу <Icon name="arrow" className="h-4 w-4" />
        </Link>
        <Link href="/" className="inline-flex items-center justify-center rounded-full bg-[#eaf3f8] px-7 py-3.5 text-sm font-extrabold text-[#264e65] transition hover:bg-[#d8ecf7]">
          На головну
        </Link>
      </div>
    </div>
  );
}

/* ---------- Вхід перед оформленням ---------- */

function CheckoutLogin() {
  return (
    <Card id="checkout-login">
      <CardTitle step={2}>Увійдіть, щоб оформити замовлення</CardTitle>
      <div className="mt-5 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ul className="grid content-start gap-4 text-sm text-[#3d5d70]">
          <li className="flex gap-3">
            <Icon name="cart" className="mt-0.5 h-5 w-5 shrink-0 text-[#067eb7]" />
            <span><b className="text-[#082c45]">Кошик збережеться</b> — товари, які ви вже обрали, перейдуть в акаунт.</span>
          </li>
          <li className="flex gap-3">
            <Icon name="truck" className="mt-0.5 h-5 w-5 shrink-0 text-[#067eb7]" />
            <span><b className="text-[#082c45]">Дані підставляться самі</b> — наступного разу не доведеться вводити адресу.</span>
          </li>
          <li className="flex gap-3">
            <Icon name="package" className="mt-0.5 h-5 w-5 shrink-0 text-[#067eb7]" />
            <span><b className="text-[#082c45]">Статус замовлення</b> — завжди під рукою в особистому кабінеті.</span>
          </li>
        </ul>
        <AuthForms initialMode="register" />
      </div>
    </Card>
  );
}

/* ---------- Дрібні елементи форми ---------- */

function Card({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-[24px] bg-white p-5 shadow-[0_18px_52px_rgba(79,93,101,.08)] sm:p-7">
      {children}
    </section>
  );
}

function CardTitle({ step, children }: { step: number; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-xl font-extrabold tracking-[-0.02em]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ffd51f] text-sm font-black">
        {step}
      </span>
      <span>{children}</span>
    </h2>
  );
}

function OptionCard({
  name,
  checked,
  disabled,
  onChange,
  title,
  text,
  aside,
  asideAccent,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  text: string;
  aside?: string;
  asideAccent?: boolean;
}) {
  return (
    <label
      className={`relative flex gap-3 rounded-2xl border-2 p-4 transition ${
        disabled
          ? "cursor-not-allowed border-[#e3edf3] opacity-50"
          : checked
            ? "cursor-pointer border-[#ffd51f] bg-[#fffbe6]"
            : "cursor-pointer border-[#e3edf3] hover:border-[#b9d3e2]"
      }`}
    >
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" />
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 peer-focus-visible:ring-4 peer-focus-visible:ring-sky-200 ${checked ? "border-[#082c45]" : "border-[#b9d3e2]"}`}>
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-[#082c45]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <b className="text-sm">{title}</b>
          {aside && <span className={`text-sm font-bold ${asideAccent ? "text-[#1f9d55]" : "text-[#264e65]"}`}>{aside}</span>}
        </span>
        <span className="mt-0.5 block text-xs text-[#527083]">{text}</span>
      </span>
    </label>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#527083]">{label}</dt>
      <dd className={`font-bold ${accent ? "text-[#1f9d55]" : ""}`}>{value}</dd>
    </div>
  );
}
