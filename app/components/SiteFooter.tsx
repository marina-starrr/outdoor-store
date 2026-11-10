import Link from "next/link";
import Icon, { type IconName } from "./Icon";
import { BrandLogo } from "./SiteHeader";

const socials: { icon: IconName; label: string }[] = [
  { icon: "instagram", label: "Instagram" },
  { icon: "facebook", label: "Facebook" },
  { icon: "youtube", label: "YouTube" },
];

/** Єдиний футер для всіх сторінок сайту */
export default function SiteFooter() {
  return (
    <footer id="contacts" className="bg-white text-[#063e62]">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-16 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8 lg:py-20">
        <div>
          <Link href="/" className="group flex items-center gap-3">
            <BrandLogo size="lg" />
            <span className="text-lg font-black leading-[1.05]">
              family
              <br />
              <span className="text-[#00acff]">camping</span>
            </span>
          </Link>
          <p className="mt-6 max-w-sm text-sm leading-6 text-[#527083]">
            Допомагаємо відкривати Україну і світ з 2014 року. Спорядження,
            якому довіряємо самі.
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
            <Link href="/catalog">Усі категорії</Link>
          </div>
        </div>
        <div>
          <h3 className="footer-title">Покупцям</h3>
          <div className="footer-links">
            <Link href="/#about">Про нас</Link>
            <Link href="/favorites">Обране</Link>
            <Link href="/compare">Порівняння товарів</Link>
            <a href="#">Доставка й оплата</a>
            <a href="#">Обмін і повернення</a>
            <a href="#contacts">Контакти</a>
          </div>
        </div>
        <div>
          <h3 className="footer-title">Ми на зв’язку</h3>
          <div className="footer-links">
            <a
              href="tel:+380800330121"
              className="text-lg font-extrabold text-[#063e62]"
            >
              0 800 330 121
            </a>
            <a href="mailto:hello@outdoor.ua">hello@outdoor.ua</a>
            <span>Щодня, 09:00–20:00</span>
          </div>
        </div>
      </div>
      <div className="bg-[#0b2c40]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 py-6 text-xs text-white/80 sm:flex-row sm:justify-between lg:px-8">
          <span>© 2026 Спорядження для відпочинку</span>
          <span>Створено для тих, хто обирає шлях</span>
        </div>
      </div>
    </footer>
  );
}
