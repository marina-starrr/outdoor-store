"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth, type AuthUser } from "./Auth";
import AuthForms from "./AuthForms";
import { useCart } from "./Cart";
import Icon, { type IconName } from "./Icon";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { Breadcrumbs } from "./catalog-ui";
import { deliveryOptions, paymentOptions } from "./cart-logic";
import { formatPrice, productsWord } from "./catalog-data";
import { Field, FormError, PasswordInput, SubmitButton, formatPhone, inputCls, isPhoneComplete } from "./form-ui";

type Order = {
  number: string;
  createdAt: string;
  status: "new" | "confirmed" | "shipped" | "done";
  lines: { id: string; name: string; price: number; qty: number }[];
  total: number;
  shipping: number;
  promoDiscount: number;
  delivery: { method: string; city?: string; branch?: string; address?: string };
  payment: string;
};

const statusLabel: Record<Order["status"], [string, string]> = {
  new: ["Прийнято", "bg-[#eaf6fd] text-[#067eb7]"],
  confirmed: ["Підтверджено", "bg-[#fff4c2] text-[#8a6100]"],
  shipped: ["Відправлено", "bg-[#efe9fd] text-[#6941c6]"],
  done: ["Отримано", "bg-[#e7f7ee] text-[#1f9d55]"],
};

const months = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Безпечна адреса повернення після входу (лише внутрішні сторінки) */
function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

type Section = "orders" | "profile";

export default function AccountPage() {
  const router = useRouter();
  const { status, user } = useAuth();
  const [query, setQuery] = useState("");

  return (
    <div className="flex min-h-screen flex-col bg-[#f7fafc] text-[#082c45]">
      <SiteHeader
        query={query}
        onQueryChange={setQuery}
        onSearchSubmit={(q) => router.push(`/catalog?q=${encodeURIComponent(q)}`)}
      />
      <main className="flex-1">
        <div className="mx-auto max-w-[1440px] px-5 pb-20 pt-6 lg:px-8">
          <Breadcrumbs items={[{ label: "Головна", href: "/" }, { label: user ? "Мій профіль" : "Вхід" }]} />
          {status === "loading" ? (
            <div className="mt-8 h-80 animate-pulse rounded-[24px] bg-white" aria-label="Завантаження" />
          ) : user ? (
            <Dashboard user={user} />
          ) : (
            <GuestView onSuccess={() => { const next = nextPath(); if (next) router.push(next); }} />
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/* ---------- Гість ---------- */

function GuestView({ onSuccess }: { onSuccess: () => void }) {
  const perks: [IconName, string, string][] = [
    ["cart", "Кошик завжди з вами", "Товари зберігаються в акаунті — відкривайте їх з будь-якого пристрою"],
    ["package", "Історія замовлень", "Статуси, склад і суми всіх ваших покупок в одному місці"],
    ["truck", "Швидке оформлення", "Контакти та адреса доставки підставляються автоматично"],
  ];
  return (
    <div className="mx-auto mt-8 grid max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-[0_18px_52px_rgba(79,93,101,.1)] lg:grid-cols-[1fr_1.1fr]">
      <div className="relative isolate overflow-hidden bg-[linear-gradient(135deg,#067eb7_0%,#1eb6ed_100%)] p-8 text-white sm:p-10">
        <div className="pointer-events-none absolute -bottom-24 -right-24 -z-10 h-72 w-72 rounded-full bg-[#ffd51f]/25 blur-3xl" aria-hidden="true" />
        <p className="text-xs font-black uppercase tracking-[0.16em] text-white/80">Family Camping</p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-4xl">
          Увійдіть, щоб мандрувати зручніше
        </h1>
        <ul className="mt-8 grid gap-5">
          {perks.map(([icon, title, text]) => (
            <li key={title} className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15">
                <Icon name={icon} className="h-5 w-5" />
              </span>
              <span>
                <b className="block">{title}</b>
                <span className="text-sm text-white/80">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-white/80">
          Переглядати каталог і додавати товари в кошик можна й без акаунта.
        </p>
      </div>
      <div className="p-6 sm:p-10">
        <AuthForms onSuccess={onSuccess} />
      </div>
    </div>
  );
}

/* ---------- Кабінет ---------- */

function Dashboard({ user }: { user: AuthUser }) {
  const { logout } = useAuth();
  const { count } = useCart();
  const [section, setSection] = useState<Section>("orders");

  const nav: { id: Section; label: string; icon: IconName }[] = [
    { id: "orders", label: "Мої замовлення", icon: "package" },
    { id: "profile", label: "Особисті дані", icon: "user" },
  ];

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[#ffd51f] text-2xl font-black">
          {user.firstName.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-extrabold leading-tight tracking-[-0.04em]">
            Привіт, {user.firstName}!
          </h1>
          <p className="text-sm text-[#527083]">{user.email}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        <aside className="grid gap-4 lg:sticky lg:top-28">
          <nav className="grid gap-1 rounded-[22px] bg-white p-2 shadow-[0_18px_52px_rgba(79,93,101,.08)]" aria-label="Розділи профілю">
            {nav.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                aria-current={section === item.id ? "page" : undefined}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
                  section === item.id ? "bg-[#fffbe6] text-[#082c45]" : "text-[#264e65] hover:bg-[#f3f9fd]"
                }`}
              >
                <Icon name={item.icon} className={`h-5 w-5 ${section === item.id ? "text-[#c29200]" : "text-[#067eb7]"}`} />
                {item.label}
              </button>
            ))}
            <button
              onClick={logout}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-[#8aa5b5] transition hover:bg-[#fdecec] hover:text-[#e5484d]"
            >
              <Icon name="logout" className="h-5 w-5" />
              Вийти
            </button>
          </nav>
          <Link
            href="/cart"
            className="flex items-center justify-between gap-3 rounded-[22px] bg-[#082c45] px-5 py-4 text-white transition hover:bg-[#0b3a5a]"
          >
            <span className="flex items-center gap-3 text-sm font-bold">
              <Icon name="cart" className="h-5 w-5 text-[#ffd51f]" />
              {count ? `У кошику ${count} ${productsWord(count)}` : "Кошик порожній"}
            </span>
            <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </aside>

        <div className="min-w-0">
          {section === "orders" ? <Orders /> : <ProfileForm user={user} />}
        </div>
      </div>
    </>
  );
}

function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-[24px] bg-white p-5 shadow-[0_18px_52px_rgba(79,93,101,.08)] sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-[-0.02em]">{title}</h2>
        {aside}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/* ---------- Замовлення ---------- */

function Orders() {
  const { add, openCart } = useCart();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => !cancelled && setOrders(data.orders))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // «Повторити замовлення» — усі товари знову в кошик
  const repeat = (order: Order) => {
    order.lines.forEach((l) => add(l.id, l.qty));
    openCart();
  };

  return (
    <Panel title="Мої замовлення" aside={orders && orders.length > 0 ? <span className="text-sm text-[#527083]">Усього: {orders.length}</span> : null}>
      {failed ? (
        <FormError>Не вдалося завантажити замовлення. Оновіть сторінку.</FormError>
      ) : !orders ? (
        <div className="grid gap-3">
          {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-[#f3f9fd]" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[#eef9ff] text-[#067eb7]">
            <Icon name="package" className="h-8 w-8" />
          </span>
          <p className="mt-4 text-lg font-extrabold">Замовлень поки немає</p>
          <p className="mt-1 text-sm text-[#527083]">Час обрати спорядження для наступної мандрівки!</p>
          <Link href="/catalog" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-6 py-3 text-sm font-extrabold transition hover:bg-[#ffe044]">
            Перейти до каталогу <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4">
          {orders.map((order) => {
            const [label, cls] = statusLabel[order.status];
            const delivery = deliveryOptions.find((o) => o.id === order.delivery.method)?.title;
            const payment = paymentOptions.find((o) => o.id === order.payment)?.title;
            const where = [order.delivery.city, order.delivery.branch && `№ ${order.delivery.branch}`, order.delivery.address].filter(Boolean).join(", ");
            return (
              <li key={order.number} className="rounded-2xl border border-[#e3edf3] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-extrabold">№ {order.number}</p>
                    <p className="text-xs text-[#8aa5b5]">{formatDate(order.createdAt)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${cls}`}>{label}</span>
                </div>
                <ul className="mt-4 grid gap-1.5 text-sm">
                  {order.lines.map((l) => (
                    <li key={l.id} className="flex justify-between gap-4">
                      <span className="min-w-0 truncate">{l.name} <span className="text-[#8aa5b5]">× {l.qty}</span></span>
                      <span className="shrink-0 font-bold">{formatPrice(l.price * l.qty)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[#e3edf3] pt-4">
                  <p className="text-xs leading-relaxed text-[#527083]">
                    {delivery}{where && ` · ${where}`}
                    <br />
                    {payment}
                    {order.promoDiscount > 0 && ` · знижка ${formatPrice(order.promoDiscount)}`}
                  </p>
                  <div className="flex items-center gap-4">
                    <button onClick={() => repeat(order)} className="rounded-full bg-[#eaf3f8] px-4 py-2 text-xs font-extrabold text-[#264e65] transition hover:bg-[#d8ecf7]">
                      Повторити замовлення
                    </button>
                    <span className="text-xl font-black">{formatPrice(order.total)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Особисті дані ---------- */

function ProfileForm({ user }: { user: AuthUser }) {
  const { updateProfile } = useAuth();
  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone || "+380 ",
    currentPassword: "",
    newPassword: "",
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError("");
    setSaved(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.firstName.trim().length < 2) return setError("Вкажіть ім'я");
    const phone = form.phone.replace(/\D/g, "").length > 3 ? form.phone : "";
    if (phone && !isPhoneComplete(phone)) return setError("Номер у форматі +380 XX XXX XX XX");
    if (form.newPassword && form.newPassword.length < 8) return setError("Новий пароль — щонайменше 8 символів");
    setPending(true);
    const result = await updateProfile({ ...form, phone });
    setPending(false);
    if (result.error) return setError(result.error);
    setSaved(true);
    setForm((f) => ({ ...f, currentPassword: "", newPassword: "" }));
  };

  return (
    <Panel title="Особисті дані">
      <form onSubmit={submit} noValidate className="grid max-w-2xl gap-5">
        <FormError>{error}</FormError>
        {saved && (
          <p role="status" className="rounded-xl bg-[#e7f7ee] px-4 py-3 text-sm font-semibold text-[#1f9d55]">
            Зміни збережено
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="p-firstName" label="Ім'я">
            <input id="field-p-firstName" autoComplete="given-name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls()} />
          </Field>
          <Field id="p-lastName" label="Прізвище">
            <input id="field-p-lastName" autoComplete="family-name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls()} />
          </Field>
          <Field id="p-phone" label="Телефон">
            <input id="field-p-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} className={inputCls()} />
          </Field>
          <Field id="p-email" label="Email" hint="Email використовується для входу і не змінюється">
            <input id="field-p-email" value={user.email} readOnly className={`${inputCls()} cursor-not-allowed bg-[#f6fafd] text-[#527083]`} />
          </Field>
        </div>

        <fieldset className="rounded-2xl bg-[#f6fafd] p-5">
          <legend className="sr-only">Зміна пароля</legend>
          <p className="font-extrabold">Зміна пароля</p>
          <p className="mt-1 text-xs text-[#527083]">Залиште порожнім, якщо не хочете змінювати.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="p-current" label="Поточний пароль">
              <PasswordInput id="field-p-current" autoComplete="current-password" value={form.currentPassword} onChange={(e) => set("currentPassword", e.target.value)} />
            </Field>
            <Field id="p-new" label="Новий пароль">
              <PasswordInput id="field-p-new" autoComplete="new-password" value={form.newPassword} onChange={(e) => set("newPassword", e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <SubmitButton pending={pending} className="sm:w-auto sm:px-10">Зберегти зміни</SubmitButton>
        <p className="text-xs text-[#8aa5b5]">Акаунт створено {formatDate(user.createdAt).split(",")[0]}</p>
      </form>
    </Panel>
  );
}
