export type Category = {
  name: string;
  meta: string;
  href: string;
  image: string;
  alt: string;
};

export type Product = {
  /** id товару в каталозі (catalog-data.ts) — для кошика та посилання */
  id: string;
  name: string;
  category: string;
  price: string;
  oldPrice?: string;
  badge?: string;
  image: string;
  alt: string;
};

export const navLinks = [
  { label: "Каталог", href: "/catalog" },
  { label: "Хіти", href: "/#products" },
  { label: "Про нас", href: "/#about" },
  { label: "Контакти", href: "#contacts" },
];

export const categories: Category[] = [
  {
    name: "Намети",
    meta: "від 2 490 ₴",
    href: "/catalog/tents",
    image:
      "https://images.unsplash.com/photo-1793441512351-2b385ad3e805?auto=format&fit=crop&w=700&q=90",
    alt: "Намети на зеленій галявині під блакитним небом",
  },
  {
    name: "Рюкзаки",
    meta: "від 1 290 ₴",
    href: "/catalog/backpacks",
    image:
      "https://images.unsplash.com/photo-1592388748465-8c4dca8dd703?auto=format&fit=crop&w=700&q=90",
    alt: "Туристичні рюкзаки зі спорядженням у горах",
  },
  {
    name: "Спальники",
    meta: "від 1 590 ₴",
    href: "/catalog/sleeping-bags",
    image:
      "https://images.unsplash.com/photo-1558477280-1bfed08ea5db?auto=format&fit=crop&w=700&q=90",
    alt: "Спальний мішок для походів",
  },
  {
    name: "Туристичний посуд",
    meta: "від 390 ₴",
    href: "/catalog/cookware",
    image:
      "https://images.unsplash.com/photo-1792513688573-d6c4ab91be76?auto=format&fit=crop&w=700&q=90",
    alt: "Туристичний посуд на столі серед зелених гір",
  },
];

export const products: Product[] = [
  {
    id: "np3",
    name: "Намет Nature Peak 3",
    category: "Намети",
    price: "4 890 ₴",
    oldPrice: "5 790 ₴",
    badge: "−15%",
    image:
      "https://images.unsplash.com/photo-1793441512351-2b385ad3e805?auto=format&fit=crop&w=900&q=88",
    alt: "Намети на зеленій галявині під ясним небом",
  },
  {
    id: "bp-trail45",
    name: "Рюкзак Tramp Trail Pro 45L",
    category: "Рюкзаки",
    price: "2 690 ₴",
    badge: "Хіт",
    image:
      "https://images.unsplash.com/photo-1625013964767-0e4b3c041607?auto=format&fit=crop&w=900&q=85",
    alt: "Синій туристичний рюкзак",
  },
  {
    id: "sb-alpine",
    name: "Спальник Nature Peak Alpine −5°C",
    category: "Спальники",
    price: "2 290 ₴",
    image:
      "https://images.unsplash.com/photo-1600382253494-d918ae84e35c?auto=format&fit=crop&w=900&q=88",
    alt: "Туристичний спальник на зеленій траві",
  },
  {
    id: "ck-set",
    name: "Набір посуду Tramp Camp Cook",
    category: "Туристичний посуд",
    price: "1 190 ₴",
    oldPrice: "1 490 ₴",
    badge: "Акція",
    image:
      "https://images.unsplash.com/photo-1682146258059-6a894a916862?auto=format&fit=crop&w=900&q=85",
    alt: "Туристичний чайник на камінні",
  },
];
