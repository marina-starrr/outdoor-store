import Link from "./NavLink";
import Icon, { type IconName } from "./Icon";
import { BrandLogo } from "./SiteHeader";
import { contacts } from "./data";
import { SELLER, sellerCodeLabel, sellerTitle } from "../lib/seller";
import { returnsInfoEnabled } from "./shop-config";

const socials: { icon: IconName; label: string }[] = [
  { icon: "instagram", label: "Instagram" },
  { icon: "facebook", label: "Facebook" },
  { icon: "youtube", label: "YouTube" },
];

/** Єдиний футер для всіх сторінок сайту */
export default function SiteFooter() {
  return (
    <footer id="contacts" className="bg-white text-[#063e62]">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-x-6 gap-y-10 px-5 py-14 sm:gap-12 sm:py-16 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8 lg:py-20">
        <div className="col-span-2 sm:col-span-1">
          <Link href="/" className="group flex items-center gap-3">
            <BrandLogo size="lg" />
            <span className="text-lg font-black leading-[1.05]">
              family
              <br />
              <span className="text-[#00acff]">camping</span>
            </span>
          </Link>
          <p className="mt-6 max-w-sm text-sm leading-6 text-[#527083]">
            Онлайн-магазин спорядження для сімейного відпочинку на природі
            з доставкою по всій Україні.
          </p>
          <div className="mt-7 flex gap-3">
            {socials.map(({ icon, label }) => (
              <a
                key={icon}
                href="#"
                className="grid h-10 w-10 place-items-center rounded-full bg-[#eef9ff] text-[#067eb7] transition hover:bg-[#ffff00] hover:text-[#063e62]"
                aria-label={label}
              >
                <Icon name={icon} className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>
        <div>
          <h3 className="footer-title">Каталог</h3>
          <div className="footer-links">
            <Link href="/catalog/tents">Намети</Link>
            <Link href="/catalog/backpacks">Рюкзаки</Link>
            <Link href="/catalog/sleeping-bags">Спальники</Link>
            <Link href="/catalog/cookware">Посуд</Link>
            <Link href="/hits">Хіти продажу</Link>
            <Link href="/catalog">Усі категорії</Link>
          </div>
        </div>
        <div>
          <h3 className="footer-title">Покупцям</h3>
          <div className="footer-links">
            <Link href="/about">Про нас</Link>
            <Link href="/delivery">Доставка і оплата</Link>
            <Link href="/orders/track">Де моє замовлення?</Link>
            {returnsInfoEnabled() && <Link href="/returns">Обмін і повернення</Link>}
            <Link href="/favorites">Обране</Link>
            <Link href="/compare">Порівняння товарів</Link>
            <Link href="/contacts">Контакти</Link>
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <h3 className="footer-title">Ми на зв’язку</h3>
          <div className="footer-links">
            <a
              href={contacts.phoneHref}
              className="text-lg font-extrabold text-[#063e62]"
            >
              {contacts.phone}
            </a>
            <a href={contacts.emailHref}>{contacts.email}</a>
            <span>Замовлення приймаємо 24/7</span>
            <Link href="/contacts">Написати нам</Link>
          </div>
        </div>
      </div>
      <div className="bg-[#0b2c40]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 py-6 text-xs text-white/80 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span>
            © 2026 Спорядження для відпочинку · Онлайн-магазин
            {/* Реквізити продавця — вимога Закону «Про електронну комерцію» */}
            {SELLER && (
              <span className="mt-1 block text-white/65" data-testid="seller">
                {sellerTitle(SELLER)} · {sellerCodeLabel(SELLER)} {SELLER.code} · {SELLER.address}
              </span>
            )}
          </span>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacy" className="tap-y transition hover:text-white hover:underline">
              Політика конфіденційності
            </Link>
            {returnsInfoEnabled() && (
              <Link href="/returns" className="tap-y transition hover:text-white hover:underline">
                Умови повернення
              </Link>
            )}
            {SELLER && (
              <Link href="/offer" className="tap-y transition hover:text-white hover:underline">
                Публічна оферта
              </Link>
            )}
          </span>
        </div>
      </div>
    </footer>
  );
}
