"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "./Auth";
import AuthForms from "./AuthForms";
import { useCart } from "./Cart";
import { useCatalog } from "./Catalog";
import Icon from "./Icon";
import { Field, PasswordInput, formatPhone, inputCls } from "./form-ui";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import RecentlyViewed from "./RecentlyViewed";
import { Breadcrumbs, ProductCard } from "./catalog-ui";
import { contacts } from "./data";
import { SELLER } from "../lib/seller";
import { PAYMENT_DAYS } from "../lib/order-status";
import { CartItem, EmptyCart, ShippingNote, TrashIcon } from "./cart-ui";
import { ORDER_CLAIMS_STORAGE_KEY, readIds, writeIds } from "./cart-storage";
import CityInput from "./CityInput";
import SuggestInput from "./SuggestInput";
import {
  cartRecommendations,
  cartTotals,
  SHIPPING_BY_CARRIER,
  deliveryOptions,
  isDeliveryId,
  paymentOptions,
  promoCodes,
  type DeliveryId,
  type PaymentId,
} from "./cart-logic";
import { formatPrice, productsWord } from "./catalog-data";
import { discountsEnabled } from "./shop-config";

type Form = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city: string;
  /** Ref населеного пункту, обраного з підказок (порожній — введено вручну) */
  cityRef: string;
  /** Нова пошта — відділення зі списку (branchRef); Укрпошта — індекс */
  branch: string;
  branchRef: string;
  /** Кур'єр: вулиця зі списку, будинок, квартира */
  street: string;
  streetRef: string;
  house: string;
  flat: string;
  comment: string;
  noCall: boolean;
};

const emptyForm: Form = {
  firstName: "",
  lastName: "",
  phone: "+380 ",
  email: "",
  city: "",
  cityRef: "",
  branch: "",
  branchRef: "",
  street: "",
  streetRef: "",
  house: "",
  flat: "",
  comment: "",
  noCall: false,
};

type Errors = Partial<Record<keyof Form, string>>;

type PlacedOrder = {
  number: string;
  lines: { id: string; name: string; price: number; qty: number }[];
  total: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  delivery: DeliveryId;
  payment: PaymentId;
  noCall: boolean;
  /** Оформлено без акаунта */
  guest: boolean;
};

/** Відповідь сервера на оформлення замовлення */
type OrderResponse = {
  order?: {
    number: string;
    lines: { id: string; name: string; price: number; qty: number }[];
    total: number;
  };
  /** Лише для гостя: за ним замовлення перейде в акаунт після входу чи реєстрації */
  claimToken?: string;
  error?: string;
  /** Поле, до якого стосується помилка (напр. «city») */
  field?: keyof Form;
};

function validate(form: Form, delivery: DeliveryId, guest: boolean): Errors {
  const errors: Errors = {};
  if (form.firstName.trim().length < 2) errors.firstName = "Вкажіть ім'я";
  if (form.lastName.trim().length < 2) errors.lastName = "Вкажіть прізвище";
  if (form.phone.replace(/\D/g, "").length !== 12) errors.phone = "Номер у форматі +380 XX XXX XX XX";
  if (guest && !form.email.trim()) errors.email = "Вкажіть email — надішлемо підтвердження";
  else if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = "Перевірте email";
  if (form.city.trim().length < 2) errors.city = "Вкажіть місто";
  if (delivery === "np-branch" && !form.branch.trim()) errors.branch = "Оберіть відділення або поштомат";
  if (delivery === "ukrposhta" && !/^\d{5}$/.test(form.branch.replace(/\s/g, "")))
    errors.branch = "Вкажіть індекс відділення — 5 цифр";
  if (delivery === "np-courier") {
    if (form.street.trim().length < 2) errors.street = "Вкажіть вулицю";
    if (!form.house.trim()) errors.house = "Вкажіть будинок";
  }
  return errors;
}

export default function CartPage() {
  const router = useRouter();
  const { lines, count, ready, clear, add } = useCart();
  const { status, user, refresh } = useAuth();
  const { products: catalog } = useCatalog();

  const [query, setQuery] = useState("");
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [delivery, setDelivery] = useState<DeliveryId>("np-branch");
  const [payment, setPayment] = useState<PaymentId>(paymentOptions[0].id);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string>();
  const [promoError, setPromoError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [pending, setPending] = useState(false);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState(false);
  /** Пастка для ботів — приховане поле, людина його не бачить */
  const [website, setWebsite] = useState("");
  const guest = status === "guest";

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
      cityRef: f.city ? f.cityRef : d?.cityRef || "",
      // Відділення й адреса — з того самого минулого замовлення, лише якщо місто теж звідти
      ...(f.city
        ? {}
        : {
            branch: d?.branch || "",
            branchRef: d?.branchRef || "",
            street: d?.street || "",
            streetRef: d?.streetRef || "",
            house: d?.house || "",
            flat: d?.flat || "",
          }),
    }));
    // Старі замовлення могли мати спосіб, якого вже немає (самовивіз)
    if (d && isDeliveryId(d.method)) setDelivery(d.method);
  }

  const totals = cartTotals(lines, delivery, promo);
  // Довідник Нової пошти — лише для населеного пункту з її Ref (не з пошуку для Укрпошти)
  const npCityRef = form.cityRef && !form.cityRef.startsWith("s:") ? form.cityRef : "";
  // Спосіб з мінімальною сумою (напр. «частинами») недоступний для меншого замовлення
  const paymentAllowed = (o: (typeof paymentOptions)[number]) => !o.minTotal || totals.total >= o.minTotal;
  const effectivePayment = paymentOptions.some((o) => o.id === payment && paymentAllowed(o)) ? payment : paymentOptions[0].id;

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
    if (status === "loading") return;
    const found = validate(form, delivery, guest);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      document.getElementById(`field-${firstInvalid}`)?.focus();
      return;
    }
    if (!agreed) {
      setAgreeError(true);
      document.getElementById("field-agree")?.focus();
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
            email: form.email.trim(),
          },
          delivery: {
            method: delivery,
            city: form.city,
            cityRef: form.cityRef,
            ...(delivery === "np-courier"
              ? { street: form.street, streetRef: form.streetRef, house: form.house, flat: form.flat }
              : { branch: form.branch, branchRef: delivery === "np-branch" ? form.branchRef : "" }),
          },
          payment: effectivePayment,
          promo,
          comment: form.comment,
          noCall: form.noCall,
          agreed,
          website,
        }),
      });
      data = await res.json();
    } catch {
      data = { error: "Немає з'єднання з сервером. Спробуйте ще раз." };
    }
    setPending(false);

    if (!data.order) {
      if (data.field) {
        // Помилка конкретного поля (напр. місто не знайдено) — показуємо під ним
        setErrors((e) => ({ ...e, [data.field!]: data.error }));
        document.getElementById(`field-${data.field}`)?.focus();
      } else setSubmitError(data.error ?? "Не вдалося оформити замовлення");
      return;
    }
    // Гість: запам'ятовуємо токен — після входу чи реєстрації замовлення перейде в акаунт
    if (data.claimToken) writeIds(ORDER_CLAIMS_STORAGE_KEY, [...readIds(ORDER_CLAIMS_STORAGE_KEY), data.claimToken]);
    setOrder({
      number: data.order.number,
      lines: data.order.lines,
      total: data.order.total,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone,
      email: form.email.trim() || user?.email || "",
      delivery,
      payment: effectivePayment,
      noCall: form.noCall,
      guest: !!data.claimToken,
    });
    clear();
    if (!data.claimToken) refresh(); // оновлює збережену адресу доставки в профілі
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const recommendations = cartRecommendations(catalog, lines);

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
                      <ShippingNote />
                    </div>
                    <ul className="mt-2 divide-y divide-[#e3edf3]">
                      {lines.map((line) => (
                        <CartItem key={line.id} line={line} variant="wide" />
                      ))}
                    </ul>
                  </Card>

                  {status === "loading" ? (
                    <div className="h-72 animate-pulse rounded-[24px] bg-white" aria-label="Завантаження" />
                  ) : (
                  <>
                  {/* Поза формою оформлення: у AuthForms власні <form>, вкладати форми не можна */}
                  {guest && <CheckoutLoginHint />}
                  <form id="checkout" onSubmit={submit} noValidate className="grid gap-6">
                  {/* Пастка для ботів — приховане від людей поле */}
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden="true" />
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
                      <Field id="email" label="Email" optional={!guest} error={errors.email}>
                        <input id="field-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls(errors.email)} placeholder={guest ? "надішлемо підтвердження і статус" : "для електронного чека"} />
                      </Field>
                    </div>
                  </Card>

                  {/* Доставка */}
                  <Card>
                    <CardTitle step={3}>Доставка</CardTitle>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {deliveryOptions.map((o) => {
                        return (
                          <OptionCard
                            key={o.id}
                            name="delivery"
                            checked={delivery === o.id}
                            onChange={() => {
                              // Відділення Нової пошти й індекс Укрпошти — різні поля, старе значення не підходить
                              if ((delivery === "ukrposhta") !== (o.id === "ukrposhta")) setForm((f) => ({ ...f, branch: "", branchRef: "" }));
                              setDelivery(o.id);
                              // Населений пункт без Нової пошти (з пошуку для Укрпошти) — обрати заново
                              if (o.id !== "ukrposhta" && form.cityRef.startsWith("s:")) setForm((f) => ({ ...f, cityRef: "" }));
                            }}
                            title={o.title}
                            text={o.text}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <Field id="city" label="Місто або село" error={errors.city}>
                          <CityInput
                            value={form.city}
                            cityRef={form.cityRef}
                            method={delivery}
                            error={errors.city}
                            onChange={(text, ref) => {
                              // Інше місто — відділення й вулиця з попереднього не підходять
                              setForm((f) =>
                                ref === f.cityRef
                                  ? { ...f, city: text }
                                  : { ...f, city: text, cityRef: ref, branch: f.branchRef ? "" : f.branch, branchRef: "", street: f.streetRef ? "" : f.street, streetRef: "" },
                              );
                              if (errors.city) setErrors((e) => ({ ...e, city: undefined }));
                            }}
                          />
                        </Field>
                        {delivery === "np-branch" && (
                          <Field id="branch" label="Відділення або поштомат" error={errors.branch}>
                            <SuggestInput
                              id="branch"
                              label="Відділення й поштомати"
                              value={form.branch}
                              selectedRef={form.branchRef}
                              url={(q) => (npCityRef ? `/api/warehouses?cityRef=${encodeURIComponent(npCityRef)}&q=${encodeURIComponent(q)}` : null)}
                              openOnFocus
                              disabled={!form.city.trim()}
                              disabledText="Спершу оберіть місто"
                              placeholder={npCityRef ? "Номер або вулиця, напр. 12" : "Номер відділення"}
                              emptyText="Не знайшли — спробуйте номер або назву вулиці"
                              hint={({ total, shown, query }) =>
                                !total ? null : query ? (shown >= 100 ? "Показано перші 100 — уточніть пошук" : null) : `Усього ${total} — введіть номер чи вулицю, щоб знайти швидше`
                              }
                              error={errors.branch}
                              onChange={(text, ref) => {
                                setForm((f) => ({ ...f, branch: text, branchRef: ref }));
                                if (errors.branch) setErrors((e) => ({ ...e, branch: undefined }));
                              }}
                            />
                          </Field>
                        )}
                        {delivery === "ukrposhta" && (
                          <Field id="branch" label="Індекс відділення Укрпошти" error={errors.branch}>
                            <input id="field-branch" inputMode="numeric" maxLength={5} autoComplete="postal-code" value={form.branch} onChange={(e) => set("branch", e.target.value.replace(/\D/g, ""))} className={inputCls(errors.branch)} placeholder="Напр. 36000" />
                            <span className="mt-1.5 block text-xs text-[#8aa5b5]">
                              5 цифр. Індекс свого відділення можна знайти на{" "}
                              <a href="https://www.ukrposhta.ua/" target="_blank" rel="noopener noreferrer" className="font-bold text-[#098fd0] hover:underline">сайті Укрпошти</a>
                            </span>
                          </Field>
                        )}
                        {delivery === "np-courier" && (
                          <Field id="street" label="Вулиця" error={errors.street}>
                            <SuggestInput
                              id="street"
                              label="Вулиці"
                              value={form.street}
                              selectedRef={form.streetRef}
                              url={(q) => (npCityRef ? `/api/streets?cityRef=${encodeURIComponent(npCityRef)}&q=${encodeURIComponent(q)}` : null)}
                              minChars={2}
                              disabled={!form.city.trim()}
                              disabledText="Спершу оберіть місто"
                              placeholder="Почніть вводити, напр. Соборна"
                              emptyText="Немає в довіднику Нової пошти — можна залишити як написали, кур'єр знайде"
                              error={errors.street}
                              onChange={(text, ref) => {
                                setForm((f) => ({ ...f, street: text, streetRef: ref }));
                                if (errors.street) setErrors((e) => ({ ...e, street: undefined }));
                              }}
                            />
                          </Field>
                        )}
                    </div>
                    {delivery === "np-courier" && (
                      <div className="mt-4 grid grid-cols-2 gap-4 sm:ml-auto sm:w-1/2 sm:pl-2">
                        <Field id="house" label="Будинок" error={errors.house}>
                          <input id="field-house" value={form.house} onChange={(e) => set("house", e.target.value)} className={inputCls(errors.house)} placeholder="Напр. 5А" />
                        </Field>
                        <Field id="flat" label="Квартира">
                          <input id="field-flat" value={form.flat} onChange={(e) => set("flat", e.target.value)} className={inputCls()} placeholder="Необов'язково" />
                        </Field>
                      </div>
                    )}
                    <p className="mt-4 text-xs text-[#8aa5b5]">
                      Відправляємо щодня. Детальніше про строки й вартість —{" "}
                      <Link href="/delivery" target="_blank" className="font-bold text-[#098fd0] hover:underline">
                        Доставка і оплата
                      </Link>
                    </p>
                  </Card>

                  {/* Оплата */}
                  <Card>
                    <CardTitle step={4}>Оплата</CardTitle>
                    <div className={`mt-5 grid gap-3 ${paymentOptions.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                      {paymentOptions.map((o) => {
                        const disabled = !paymentAllowed(o);
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
                  </>
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
                      <Row label="Доставка" value={SHIPPING_BY_CARRIER} />
                    </dl>

                    {/* Промокод — лише коли знижки ввімкнено (зараз вимкнено, див. shop-config) */}
                    {discountsEnabled() && (
                    <div className="mt-5">
                      {promo ? (
                        <p className="flex items-center justify-between rounded-2xl bg-[#e7f7ee] px-4 py-3 text-sm">
                          <span>
                            <b className="text-[#1f9d55]">{promo}</b>{" "}
                            <span className="text-[#3d5d70]">{promoCodes[promo].label}</span>
                            {totals.promoExcluded && (
                              <span className="mt-1 block text-xs text-[#527083]">
                                {totals.promoDiscount > 0
                                  ? "Не діє на товари з фіксованою ціною виробника."
                                  : "На товари в кошику промокод не діє: у них фіксована ціна виробника."}
                              </span>
                            )}
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
                    )}

                    <div className="mt-5 flex items-baseline justify-between border-t border-[#e3edf3] pt-4">
                      <span className="font-bold">До сплати</span>
                      <span className="text-3xl font-black tracking-[-0.03em]">{formatPrice(totals.total)}</span>
                    </div>

                    {submitError && (
                      <p role="alert" className="mt-4 rounded-xl bg-[#fdecec] px-4 py-3 text-sm font-semibold text-[#c53035]">
                        {submitError}
                      </p>
                    )}
                    {status !== "loading" && (
                      <div className="mt-5">
                        <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
                          <input
                            id="field-agree"
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => { setAgreed(e.target.checked); setAgreeError(false); }}
                            aria-invalid={agreeError}
                            aria-describedby={agreeError ? "agree-error" : undefined}
                            className={`mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#ffd51f] ${agreeError ? "outline outline-2 outline-offset-1 outline-[#e5484d]" : ""}`}
                          />
                          <span className="text-[#3d5d70]">
                            Погоджуюсь з{" "}
                            {SELLER && (
                              <>
                                <Link href="/offer" target="_blank" className="font-bold text-[#098fd0] hover:underline">публічною офертою</Link>,{" "}
                              </>
                            )}
                            <Link href="/delivery" target="_blank" className="font-bold text-[#098fd0] hover:underline">умовами доставки й оплати</Link>,{" "}
                            <Link href="/returns" target="_blank" className="font-bold text-[#098fd0] hover:underline">умовами повернення</Link>{" "}
                            та{" "}
                            <Link href="/privacy" target="_blank" className="font-bold text-[#098fd0] hover:underline">політикою конфіденційності</Link>
                          </span>
                        </label>
                        {agreeError && (
                          <p id="agree-error" className="mt-1.5 pl-7 text-xs font-semibold text-[#e5484d]">
                            Підтвердьте згоду, щоб оформити замовлення
                          </p>
                        )}
                      </div>
                    )}
                    <button
                      type="submit"
                      form="checkout"
                      disabled={pending || status === "loading"}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#ffd51f] py-4 text-base font-extrabold shadow-[0_10px_26px_rgba(255,213,31,.4)] transition hover:-translate-y-0.5 hover:bg-[#ffe044] disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0"
                    >
                      {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#082c45] border-t-transparent" aria-hidden="true" />}
                      Підтвердити замовлення
                    </button>
                    {guest && (
                      <p className="mt-3 text-center text-xs text-[#527083]">Реєстрація не потрібна — достатньо контактів і адреси доставки</p>
                    )}
                  </Card>

                  <ul className="mt-4 grid gap-3 px-2 text-sm text-[#3d5d70]">
                    <li className="flex items-center gap-3"><Icon name="shield" className="h-5 w-5 text-[#067eb7]" /> Гарантія якості на все спорядження</li>
                    <li className="flex items-center gap-3"><Icon name="return" className="h-5 w-5 text-[#067eb7]" /> Обмін і повернення протягом 14 днів</li>
                    <li className="flex items-center gap-3"><Icon name="headset" className="h-5 w-5 text-[#067eb7]" /> Допомога з вибором: {contacts.phone}</li>
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

          {!order && <RecentlyViewed />}
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
          ? "Ми повідомимо, щойно відправимо посилку."
          : `Менеджер зв’яжеться з вами за номером ${order.phone}, щоб підтвердити замовлення.`}
      </p>
      {order.payment === "invoice" && (
        <p data-testid="payment-email-note" className="mx-auto mt-4 max-w-md rounded-2xl bg-[#fffbe6] px-5 py-4 text-sm leading-relaxed text-[#3d5d70]">
          <b className="text-[#082c45]">Як оплатити:</b> щойно менеджер підтвердить замовлення, товар буде заброньовано
          за вами, а на {order.email ? <b className="text-[#082c45]">{order.email}</b> : "ваш email"} прийде лист із
          реквізитами для оплати. Оплатити потрібно протягом {PAYMENT_DAYS} днів.
        </p>
      )}

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

      {order.guest && (
        <>
          <p className="mt-6 text-sm text-[#3d5d70]">
            Статус можна перевірити будь-коли на сторінці{" "}
            <Link href={`/orders/track?number=${encodeURIComponent(order.number)}`} className="font-bold text-[#098fd0] hover:underline">
              «Де моє замовлення?»
            </Link>{" "}
            — за номером замовлення і телефоном.
          </p>
          <GuestAccountOffer order={order} />
        </>
      )}

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

/* ---------- Акаунт після замовлення (гість) ---------- */

/**
 * Одне поле — пароль: решту даних покупець уже ввів. Після реєстрації
 * Auth переносить замовлення в акаунт за збереженим токеном
 */
function GuestAccountOffer({ order }: { order: PlacedOrder }) {
  const { register, status } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [exists, setExists] = useState(false);

  if (status === "user")
    return (
      <p role="status" className="mt-6 rounded-2xl bg-[#e7f7ee] px-5 py-4 text-sm font-semibold text-[#1f7a45]">
        Готово! Замовлення збережено у вашому{" "}
        <Link href="/account" className="font-extrabold underline">профілі</Link>.
      </p>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Щонайменше 8 символів");
    setPending(true);
    const result = await register({
      firstName: order.firstName,
      lastName: order.lastName,
      email: order.email,
      phone: order.phone,
      password,
    });
    setPending(false);
    if (result.error) {
      setError(result.error);
      setExists(/уже існує/.test(result.error));
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-6 rounded-[20px] bg-[#f3f9fd] p-5 text-left">
      <p className="font-extrabold">Збережіть замовлення в акаунті</p>
      <p className="mt-1 text-sm text-[#527083]">
        Придумайте пароль — і статус, історія покупок та швидке оформлення будуть під рукою. Акаунт створимо на {order.email}.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <label htmlFor="field-guest-password" className="sr-only">Пароль</label>
          <PasswordInput
            id="field-guest-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            error={error || undefined}
            placeholder="Пароль (від 8 символів)"
          />
        </div>
        <button type="submit" disabled={pending} className="shrink-0 rounded-full bg-[#082c45] px-6 py-3.5 text-sm font-extrabold text-white transition hover:bg-[#0b3a5a] disabled:opacity-60">
          Створити акаунт
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-[#e5484d]">
          {error}{" "}
          {exists && (
            <Link href="/account" className="font-extrabold text-[#098fd0] hover:underline">
              Увійти — замовлення перейде в акаунт
            </Link>
          )}
        </p>
      )}
    </form>
  );
}

/* ---------- Вхід для тих, хто вже має акаунт (необов'язково) ---------- */

function CheckoutLoginHint() {
  const [open, setOpen] = useState(false);
  return (
    <Card id="checkout-login">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#3d5d70]">
          <b className="text-[#082c45]">Вже маєте акаунт?</b> Увійдіть — контакти й адреса підставляться самі.
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-full bg-[#eaf3f8] px-5 py-2.5 text-sm font-extrabold text-[#264e65] transition hover:bg-[#d8ecf7]"
        >
          <Icon name="user" className="h-4 w-4" />
          {open ? "Згорнути" : "Увійти"}
        </button>
      </div>
      {open && (
        <div className="mx-auto mt-5 max-w-md">
          <AuthForms initialMode="login" />
        </div>
      )}
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
