"use client";

/* eslint-disable @next/next/no-img-element -- фото товарів з Unsplash, як і в каталозі */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./Auth";
import { useCatalog } from "./Catalog";
import Icon, { type IconName } from "./Icon";
import { useNotifications, type NotificationKind } from "./Notifications";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { Breadcrumbs } from "./catalog-ui";
import { formatPrice, plural } from "./catalog-data";
import { productUrl } from "./product-details";

const kinds: Record<NotificationKind, { icon: IconName; tone: string; label: string }> = {
  reply: { icon: "chat", tone: "bg-[#e1f0f9] text-[#067eb7]", label: "Відповідь" },
  stock: { icon: "package", tone: "bg-[#e7f7ee] text-[#1f9d55]", label: "Наявність" },
  order: { icon: "truck", tone: "bg-[#ede7fb] text-[#5b3cc4]", label: "Замовлення" },
  price: { icon: "heart", tone: "bg-[#fff4c2] text-[#8a6100]", label: "Знижка" },
};

const months = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
function when(iso: string) {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return `Сьогодні, ${time}`;
  if (same(d, yesterday)) return `Учора, ${time}`;
  return `${d.getDate()} ${months[d.getMonth()]}${d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : ""}, ${time}`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { status } = useAuth();
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
          <Breadcrumbs items={[{ label: "Головна", href: "/" }, { label: "Мій профіль", href: "/account" }, { label: "Сповіщення" }]} />
          {status === "loading" ? (
            <div className="mt-8 h-80 animate-pulse rounded-[24px] bg-white" aria-label="Завантаження" />
          ) : status === "guest" ? (
            <GuestPrompt />
          ) : (
            <Inbox />
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function GuestPrompt() {
  return (
    <div className="mx-auto mt-8 max-w-xl rounded-[28px] bg-white p-8 text-center shadow-[0_18px_52px_rgba(79,93,101,.1)] sm:p-10">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#fff4c2] text-[#8a6100]">
        <Icon name="bell" className="h-8 w-8" />
      </span>
      <h1 className="mt-5 text-3xl font-extrabold tracking-[-0.04em]">Сповіщення</h1>
      <p className="mt-3 text-[#3d5d70]">
        Увійдіть, щоб дізнаватися про відповіді на ваші звернення, статус замовлень, знижки на обране та появу товарів у наявності.
      </p>
      <Link
        href="/account?next=/notifications"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#ffd51f] px-7 py-3.5 font-extrabold transition hover:bg-[#ffe044]"
      >
        Увійти або зареєструватися <Icon name="arrow" className="h-5 w-5" />
      </Link>
    </div>
  );
}

function Inbox() {
  const n = useNotifications();
  const { notifications, unread, ready, markAllRead } = n;
  // Нові на момент відкриття — підсвічуємо до кінця візиту, хоча на сервері вони вже прочитані
  const [fresh, setFresh] = useState<Set<string> | null>(null);

  if (ready && fresh === null) setFresh(new Set(notifications.filter((x) => !x.read).map((x) => x.id)));

  // Відкрили сторінку — усі сповіщення прочитано (лічильник у шапці зникає)
  useEffect(() => {
    if (ready && unread > 0) markAllRead();
  }, [ready, unread, markAllRead]);

  return (
    <>
      <div className="mt-4">
        <h1 className="text-[clamp(2rem,4vw,2.9rem)] font-extrabold leading-[1.05] tracking-[-0.04em]">Сповіщення</h1>
        {ready && notifications.length > 0 && (
          <p className="mt-2 text-[#3d5d70]">
            {fresh && fresh.size > 0
              ? `${fresh.size} ${plural(fresh.size, ["нове", "нові", "нових"])} з ${notifications.length}`
              : `Усього: ${notifications.length}`}
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section aria-label="Список сповіщень">
          {!ready ? (
            <div className="h-64 animate-pulse rounded-[24px] bg-white" />
          ) : notifications.length === 0 ? (
            <div className="rounded-[24px] bg-white p-8 text-center shadow-[0_18px_52px_rgba(79,93,101,.08)]">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#eef6fb] text-[#067eb7]">
                <Icon name="bell" className="h-7 w-7" />
              </span>
              <p className="mt-4 text-lg font-extrabold">Поки що сповіщень немає</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#527083]">
                Тут з&apos;являтимуться відповіді на ваші звернення, зміни статусу замовлень, знижки на товари з обраного та
                повідомлення, коли очікуваний товар знову в наявності.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3" data-testid="notifications">
              {notifications.map((item) => {
                const k = kinds[item.kind];
                const isNew = fresh?.has(item.id);
                return (
                  <li
                    key={item.id}
                    className={`relative flex gap-4 rounded-[22px] bg-white p-4 shadow-[0_10px_30px_rgba(79,93,101,.08)] sm:p-5 ${isNew ? "ring-2 ring-[#ffd51f]" : ""}`}
                  >
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${k.tone}`}>
                      <Icon name={k.icon} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-extrabold uppercase tracking-[0.1em] text-[#527083]">{k.label}</span>
                        <time dateTime={item.createdAt} className="text-[#8aa5b5]">{when(item.createdAt)}</time>
                        {isNew && <span className="rounded-full bg-[#ffd51f] px-2 py-0.5 font-black text-[#082c45]">Нове</span>}
                      </div>
                      <p className="mt-1.5 font-extrabold leading-snug">{item.title}</p>
                      <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-[#3d5d70]">{item.text}</p>
                      {item.href && item.href !== "/notifications" && (
                        <Link href={item.href} className="mt-2 inline-flex items-center gap-1.5 text-sm font-extrabold text-[#098fd0] hover:underline">
                          {item.kind === "order" ? "До замовлень" : "Переглянути товар"} <Icon name="arrow" className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="grid gap-4 lg:sticky lg:top-28">
          <EmailSettings />
          <StockAlerts />
        </aside>
      </div>
    </>
  );
}

function EmailSettings() {
  const { emailNotifications, mailEnabled, setEmailNotifications, ready } = useNotifications();
  const { user } = useAuth();
  return (
    <section className="rounded-[22px] bg-white p-5 shadow-[0_10px_30px_rgba(79,93,101,.08)]">
      <h2 className="font-extrabold">Листи на пошту</h2>
      {mailEnabled ? (
        <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={emailNotifications}
            disabled={!ready}
            onChange={(e) => setEmailNotifications(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#098fd0]"
          />
          <span className="text-[#3d5d70]">
            Дублювати сповіщення на <b className="break-all text-[#082c45]">{user?.email}</b>
          </span>
        </label>
      ) : (
        <p className="mt-2 text-sm text-[#527083]">Усі сповіщення приходять сюди, на сайт. Нові позначаються лічильником біля дзвіночка.</p>
      )}
    </section>
  );
}

function StockAlerts() {
  const { stockAlerts, setStockAlert } = useNotifications();
  const { byId } = useCatalog();
  const items = stockAlerts.flatMap((id) => byId.get(id) ?? []);
  return (
    <section className="rounded-[22px] bg-white p-5 shadow-[0_10px_30px_rgba(79,93,101,.08)]" aria-labelledby="alerts-title">
      <h2 id="alerts-title" className="font-extrabold">Чекаю наявності</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[#527083]">
          На сторінці товару, якого немає на складі, натисніть «Повідомити про наявність» — і ми напишемо, щойно він з&apos;явиться.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <img src={p.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" loading="lazy" />
              <div className="min-w-0 flex-1">
                <Link href={productUrl(p)} className="line-clamp-2 text-sm font-bold leading-snug hover:text-[#098fd0]">{p.name}</Link>
                <p className="text-xs text-[#8aa5b5]">{p.inStock ? "Уже в наявності" : formatPrice(p.price)}</p>
              </div>
              <button
                onClick={() => setStockAlert(p.id, false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#8aa5b5] transition hover:bg-[#fdecec] hover:text-[#e5484d]"
                aria-label={`Не чекати ${p.name}`}
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
