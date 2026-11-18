/* eslint-disable @next/next/no-img-element -- фото з Unsplash, як і на решті сайту */
import type { Metadata } from "next";
import Link from "next/link";
import Icon, { type IconName } from "../components/Icon";
import InfoLayout from "../components/InfoLayout";
import { BannerStats, InfoCard, InfoTitle, Prose } from "../components/info-ui";
import { brandsOf, categories, photoUrl } from "../components/catalog-data";
import { getPublicCatalog } from "../lib/server/catalog";
import { RETURN_DAYS } from "../components/cart-logic";
import { responsiveImage } from "../components/photo";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: "Про нас",
  description:
    "Family Camping — онлайн-магазин туристичного спорядження для сімейного відпочинку: намети, спальники, посуд і кемпінгові меблі з доставкою по Україні.",
};

/*
 * Лише те, що можна підтвердити: дані каталогу та умови магазину.
 * Історію магазину (рік заснування, команду) додайте, коли будуть реальні факти.
 */

const promises: { icon: IconName; title: string; text: string }[] = [
  { icon: "tent", title: "Для всієї родини", text: "Підбираємо спорядження для сімейного кемпінгу: просторі намети, теплі спальники, посуд і меблі для відпочинку з дітьми." },
  { icon: "chat", title: "Допомога з вибором", text: "Напишіть нам — підкажемо модель під ваш склад сім’ї, сезон і бюджет." },
  { icon: "return", title: `${RETURN_DAYS} днів на повернення`, text: `Обмін і повернення протягом ${RETURN_DAYS} днів за Законом «Про захист прав споживачів».` },
  { icon: "shield", title: "Гарантія", text: "Гарантійні зобов’язання — відповідно до умов виробника та законодавства України." },
];

const whyOnline: { icon: IconName; title: string; text: string }[] = [
  { icon: "card", title: "Без шоуруму", text: "Ми працюємо лише онлайн, без витрат на оренду торгових залів." },
  { icon: "clock", title: "Замовлення 24/7", text: "Оформити замовлення на сайті можна будь-коли." },
  { icon: "truck", title: "По всій Україні", text: "Доставляємо Новою поштою та Укрпоштою." },
];

export default async function AboutPage() {
  const products = await getPublicCatalog();
  const brands = brandsOf(products);
  return (
    <InfoLayout
      eyebrow="Про нас"
      icon="tent"
      title="Спорядження для"
      accent="сімейного відпочинку"
      lead="Підбираємо туристичне спорядження, з яким відпочинок на природі зручний для всієї родини — від малюка до бабусі."
      aside={
        <BannerStats
          items={[
            { value: `${products.length}`, label: "товарів у каталозі" },
            { value: `${categories.length}`, label: "категорій" },
            { value: `${brands.length}`, label: "брендів" },
          ]}
        />
      }
    >
      {/* Хто ми */}
      <InfoCard className="overflow-hidden !p-0">
        <div className="grid lg:grid-cols-[1.05fr_1fr]">
          <div className="p-6 sm:p-8">
            <InfoTitle eyebrow="Хто ми">Сімейний кемпінг — наша спеціалізація</InfoTitle>
            <Prose className="mt-4">
              <p>
                Family Camping — онлайн-магазин спорядження для відпочинку на природі з родиною: намети, спальники,
                туристичний посуд, кемпінгові меблі, освітлення та аксесуари.
              </p>
              <p>
                Ми — <b>онлайн-магазин без фізичних точок</b>: оформлюйте замовлення на сайті, а ми доставимо його
                Новою поштою чи Укрпоштою в будь-який населений пункт України.
              </p>
            </Prose>
          </div>
          <img
            {...responsiveImage(photoUrl("friendsFire", 900, 640), "(min-width: 1024px) 45vw, 92vw", [480, 640, 900])}
            alt="Друзі відпочивають біля вогнища в кемпінгу"
            loading="lazy"
            className="h-full max-h-[380px] w-full object-cover lg:max-h-none"
          />
        </div>
      </InfoCard>

      {/* Що ми гарантуємо */}
      <InfoCard>
        <InfoTitle icon="heart" eyebrow="Для покупців">Що ми гарантуємо</InfoTitle>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {promises.map((v) => (
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
