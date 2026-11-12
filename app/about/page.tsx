/* eslint-disable @next/next/no-img-element -- фото з Unsplash, як і на решті сайту */
import type { Metadata } from "next";
import Link from "next/link";
import Icon, { type IconName } from "../components/Icon";
import InfoLayout from "../components/InfoLayout";
import { BannerStats, InfoCard, InfoTitle, Prose } from "../components/info-ui";
import { brandsOf, categories, photoUrl } from "../components/catalog-data";
import { getPublicCatalog } from "../lib/server/catalog";
import { RETURN_DAYS } from "../components/cart-logic";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: "Про нас",
  description:
    "Family Camping — онлайн-магазин туристичного спорядження для сімейного відпочинку з 2014 року. Наша історія, цифри та цінності.",
};

const FOUNDED = 2014;
const years = 2026 - FOUNDED;

const historyFor = (count: number) => [
  { year: "2014", title: "Перший намет", text: "Двоє друзів-туристів почали возити якісні намети для знайомих, бо в Україні їх було складно знайти за адекватну ціну." },
  { year: "2017", title: "Власний сайт", text: "Запустили онлайн-магазин і першими додали до кожного товару чесні відгуки та справжні фото з походів." },
  { year: "2020", title: "Для всієї родини", text: "Зосередилися на сімейному кемпінгу: просторі намети, дитячі спальники, меблі й посуд для відпочинку з дітьми." },
  { year: "2026", title: "Сьогодні", text: `${count} перевірених товарів у ${categories.length} категоріях, доставка по всій Україні та прийом замовлень цілодобово.` },
];

const values: { icon: IconName; title: string; text: string }[] = [
  { icon: "tent", title: "Тестуємо самі", text: "Кожну модель команда бере в похід, перш ніж додати в каталог. Що не витримало вихідних — не продаємо." },
  { icon: "chat", title: "Чесні поради", text: "Порадимо дешевший намет, якщо дорогий вам не потрібен. Нам важливіше, щоб ви повернулися, ніж продати більше." },
  { icon: "shield", title: "Гарантія якості", text: `Офіційна гарантія виробника на все спорядження і ${RETURN_DAYS} днів на повернення без зайвих питань.` },
  { icon: "heart", title: "Природа після нас", text: "Пакуємо замовлення без пластику, коли це можливо, і підтримуємо прибирання туристичних стежок у Карпатах." },
];

const whyOnline: { icon: IconName; title: string; text: string }[] = [
  { icon: "card", title: "Нижчі ціни", text: "Без оренди шоуруму — економія йде у ваш кошик." },
  { icon: "clock", title: "Цілодобово", text: "Замовлення приймаємо й опрацьовуємо 24/7." },
  { icon: "truck", title: "По всій Україні", text: "Нова пошта та Укрпошта, відправка щодня." },
];

export default async function AboutPage() {
  const products = await getPublicCatalog();
  const reviews = products.reduce((s, p) => s + p.reviews, 0);
  const history = historyFor(products.length);
  const brands = brandsOf(products);
  return (
    <InfoLayout
      eyebrow="Про нас"
      icon="tent"
      title="Спорядження, якому"
      accent="довіряємо самі"
      lead={`Уже ${years} років допомагаємо родинам відкривати Україну і світ: підбираємо надійне туристичне спорядження та ділимося досвідом.`}
      aside={
        <BannerStats
          items={[
            { value: `${years}`, label: "років з вами" },
            { value: `${products.length}`, label: "товарів у каталозі" },
            { value: reviews.toLocaleString("uk-UA").replace(/\s/g, " "), label: "відгуків покупців" },
          ]}
        />
      }
    >
      {/* Історія */}
      <InfoCard className="overflow-hidden !p-0">
        <div className="grid lg:grid-cols-[1.05fr_1fr]">
          <div className="p-6 sm:p-8">
            <InfoTitle eyebrow="Наша історія">Від одного намету до сімейного магазину</InfoTitle>
            <Prose className="mt-4">
              <p>
                Family Camping почався у {FOUNDED} році з простої ідеї: відпочинок на природі має бути
                доступним і комфортним для всієї родини — від малюка до бабусі.
              </p>
              <p>
                Ми — <b>онлайн-магазин без фізичних точок</b>. Тому замість вітрин вкладаємося в те, що справді
                важливо: перевірку товарів, швидку доставку та консультації, які допомагають обрати саме те, що
                потрібно.
              </p>
            </Prose>
          </div>
          <img
            src={photoUrl("friendsFire", 900, 640)}
            alt="Друзі відпочивають біля вогнища в кемпінгу"
            loading="lazy"
            className="h-full max-h-[380px] w-full object-cover lg:max-h-none"
          />
        </div>
      </InfoCard>

      {/* Хронологія */}
      <InfoCard>
        <InfoTitle icon="clock">Як ми росли</InfoTitle>
        <ol className="relative mt-7 grid gap-6 md:grid-cols-4 md:gap-4">
          <span className="absolute left-[19px] top-2 h-[calc(100%-1rem)] w-0.5 bg-[#e3edf3] md:left-0 md:top-[19px] md:h-0.5 md:w-full" aria-hidden="true" />
          {history.map((h, i) => (
            <li key={h.year} className="relative flex gap-4 md:block">
              <span className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-black ring-4 ring-white ${i === history.length - 1 ? "bg-[#ffd51f] text-[#082c45]" : "bg-[#082c45] text-white"}`}>
                {h.year.slice(2)}
              </span>
              <span className="md:mt-4 md:block">
                <span className="text-sm font-black text-[#098fd0]">{h.year}</span>
                <b className="block text-lg">{h.title}</b>
                <span className="mt-1 block text-sm leading-relaxed text-[#527083]">{h.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </InfoCard>

      {/* Цінності */}
      <InfoCard>
        <InfoTitle icon="heart" eyebrow="У що ми віримо">Наші цінності</InfoTitle>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {values.map((v) => (
            <div key={v.title} className="rounded-[20px] bg-[#f7fafc] p-5 transition hover:bg-[#eef6fb]">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ffd51f] text-[#082c45]">
                <Icon name={v.icon} className="h-5 w-5" />
              </span>
              <b className="mt-4 block text-lg">{v.title}</b>
              <p className="mt-1 text-sm leading-relaxed text-[#527083]">{v.text}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* Чому онлайн + бренди */}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <InfoCard className="!bg-[#082c45] text-white">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3ed8ff]">Онлайн-магазин</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] sm:text-[1.7rem]">Чому ми працюємо лише онлайн</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {whyOnline.map((w) => (
              <li key={w.title}>
                <Icon name={w.icon} className="h-6 w-6 text-[#ffd51f]" />
                <b className="mt-3 block">{w.title}</b>
                <span className="mt-1 block text-sm text-white/70">{w.text}</span>
              </li>
            ))}
          </ul>
        </InfoCard>
        <InfoCard>
          <InfoTitle icon="package">Бренди в каталозі</InfoTitle>
          <ul className="mt-5 flex flex-wrap gap-2">
            {brands.map((b) => (
              <li key={b} className="rounded-full border border-[#d5e5ef] px-4 py-2 text-sm font-extrabold text-[#264e65]">
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-[#527083]">Працюємо напряму з виробниками та офіційними дистриб’юторами.</p>
        </InfoCard>
      </div>

      {/* CTA */}
      <section className="relative isolate overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#1eb6ed_0%,#65d6ff_100%)] p-8 text-white sm:p-10">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-2xl font-black tracking-[-0.04em] sm:text-3xl">Збирайте рюкзак. Решта — за нами.</h2>
            <p className="mt-2 font-medium text-white/85">Почніть з хітів, які найчастіше обирають родини.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/hits" className="inline-flex items-center gap-2 rounded-full bg-[#ffff04] px-6 py-3.5 text-sm font-extrabold text-[#063e62] transition hover:-translate-y-0.5">
              Хіти продажу <Icon name="arrow" className="h-4 w-4" />
            </Link>
            <Link href="/catalog" className="inline-flex items-center gap-2 rounded-full bg-white/20 px-6 py-3.5 text-sm font-extrabold ring-1 ring-white/40 transition hover:bg-white/30">
              Каталог
            </Link>
          </div>
        </div>
      </section>
    </InfoLayout>
  );
}
