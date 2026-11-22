import { SELLER } from "../lib/seller";
import { returnsInfoEnabled } from "./shop-config";

export type Category = {
  name: string;
  href: string;
  image: string;
  alt: string;
};

export const navLinks = [
  { label: "Каталог", href: "/catalog" },
  { label: "Хіти", href: "/hits" },
  { label: "Доставка і оплата", href: "/delivery" },
  { label: "Про нас", href: "/about" },
  { label: "Контакти", href: "/contacts" },
];

/** Контакти магазину (онлайн-магазин без фізичної адреси) */
export const contacts = {
  phone: "075 912 76 65",
  /** Міжнародний формат — для посилань tel: і мікророзмітки */
  phoneIntl: "+380759127665",
  phoneHref: "tel:+380759127665",
  email: "familycamping.ua@gmail.com",
  emailHref: "mailto:familycamping.ua@gmail.com",
  schedule: "Замовлення на сайті приймаємо цілодобово",
};

/**
 * Сторінки магазину в соцмережах (лише справжні — іконка без сторінки нікуди не веде).
 * Instagram і YouTube додати сюди, коли з'являться
 */
export const socialLinks: { icon: "facebook" | "instagram" | "youtube"; label: string; href: string }[] = [
  { icon: "facebook", label: "Facebook", href: "https://www.facebook.com/share/1D3RsQUZik/" },
];

/** Інформаційні сторінки — бічна навігація та футер */
export const infoLinks = [
  { label: "Про нас", href: "/about" },
  { label: "Контакти", href: "/contacts" },
  { label: "Доставка і оплата", href: "/delivery" },
  ...(returnsInfoEnabled() ? [{ label: "Обмін і повернення", href: "/returns" }] : []),
  { label: "Політика конфіденційності", href: "/privacy" },
  // Оферта — лише коли заповнено реквізити продавця (app/lib/seller.ts)
  ...(SELLER ? [{ label: "Публічна оферта", href: "/offer" }] : []),
];

export const categories: Category[] = [
  {
    name: "Намети",
    href: "/catalog/tents",
    image:
      "https://images.unsplash.com/photo-1793441512351-2b385ad3e805?auto=format&fit=crop&w=700&q=90",
    alt: "Намети на зеленій галявині під блакитним небом",
  },
  {
    name: "Рюкзаки",
    href: "/catalog/backpacks",
    image:
      "https://images.unsplash.com/photo-1592388748465-8c4dca8dd703?auto=format&fit=crop&w=700&q=90",
    alt: "Туристичні рюкзаки зі спорядженням у горах",
  },
  {
    name: "Спальники",
    href: "/catalog/sleeping-bags",
    image:
      "https://images.unsplash.com/photo-1558477280-1bfed08ea5db?auto=format&fit=crop&w=700&q=90",
    alt: "Спальний мішок для походів",
  },
  {
    name: "Туристичний посуд",
    href: "/catalog/cookware",
    image:
      "https://images.unsplash.com/photo-1792513688573-d6c4ab91be76?auto=format&fit=crop&w=700&q=90",
    alt: "Туристичний посуд на столі серед зелених гір",
  },
];
