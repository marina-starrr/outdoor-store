/* ---------- Типи ---------- */

export type CategorySlug =
  | "tents"
  | "backpacks"
  | "sleeping-bags"
  | "cookware"
  | "furniture"
  | "lighting"
  | "grills"
  | "hammocks"
  | "accessories";

export type CategoryInfo = {
  slug: CategorySlug;
  name: string;
  title: string;
  subtitle: string;
  image: string;
  /** Порядок у сортуванні «Популярні» */
  popularity: number;
};

export type Product = {
  id: string;
  name: string;
  category: CategorySlug;
  brand: string;
  price: number;
  oldPrice?: number;
  hit?: boolean;
  isNew?: boolean;
  rating: number;
  reviews: number;
  /** Похідне від stock: stock > 0 (рахується при читанні з бази) */
  inStock: boolean;
  /** Залишок на складі, шт. */
  stock: number;
  /** Прихований адміністратором — не показується в каталозі, але лишається в історії замовлень */
  hidden?: boolean;
  /** Власний опис з адмін-панелі (абзаци через порожній рядок); без нього — згенерований */
  description?: string;
  /** Власне фото (https-посилання) замість фото з бібліотеки */
  customImage?: string;
  /** Остання зміна в адмін-панелі (ISO) — для sitemap */
  updatedAt?: string;
  /** Порядок у сортуванні «Популярні» — менше значення = вище */
  popularity: number;
  /** Короткі характеристики під назвою, напр. «3 місця · 3,1 кг» */
  specs: string;
  /** Лише для наметів — для фільтра «Місткість» */
  capacity?: number;
  image: string;
  /** Ключ фото — для галереї у більшому розмірі */
  photo: PhotoKey;
  /** Повна таблиця характеристик: [назва, значення] */
  attrs: [string, string][];
};

/* ---------- Фото ---------- */

const unsplash = (id: string, w = 640, h = 420) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

const photo = {
  // намети
  meadow: "1793441512351-2b385ad3e805",
  mountains: "1445308394109-4ec2920981b1",
  lake: "1471115853179-bb1d604434e0",
  forestNight: "1487730116645-74489c95b41b",
  orange: "1496080174650-637e3f22fa03",
  starry: "1500581276021-a4bbcd0050c5",
  inside: "1504280390367-361c6d9f38f4",
  sunset: "1510312305653-8ed496efae75",
  milkyWay: "1517824806704-9040b037703b",
  view: "1532339142463-fd0a8979791a",
  rocks: "1484960055659-a39d25adcb3c",
  glowTent: "1517823382935-51bfcb0ec6bc",
  // рюкзаки
  backpackTrail: "1592388748465-8c4dca8dd703",
  backpackGreen: "1622260614153-03223fb72052",
  backpackGear: "1625013964767-0e4b3c041607",
  backpackCity: "1553062407-98eeb64c6a62",
  hikers: "1501554728187-ce583db33af7",
  // спальники
  sleepingBlue: "1558477280-1bfed08ea5db",
  sleepingGrass: "1600382253494-d918ae84e35c",
  sleepingCar: "1563299796-17596ed6b017",
  // посуд
  cookStove: "1792513688573-d6c4ab91be76",
  kettle: "1682146258059-6a894a916862",
  campfire: "1486915309851-b0cc1f8a0084",
  mug: "1539183204366-63a0589187ab",
  // меблі, гриль, гамаки
  campChairs: "1525811902-f2342640856e",
  campTable: "1523987355523-c7b5b0dd90a7",
  friendsFire: "1530541930197-ff16ac917b0e",
  skewers: "1555939594-58d7cb561ad1",
  steak: "1558030006-450675393462",
  ribs: "1529193591184-b1d58069ecdd",
  hammockCabin: "1499696010180-025ef6e1a8f9",
  hammockTent: "1537225228614-56cc3556d7ed",
};

export type PhotoKey = keyof typeof photo;
const img = (key: PhotoKey) => unsplash(photo[key]);
export const photoUrl = (key: PhotoKey, w: number, h: number) =>
  unsplash(photo[key], w, h);

/** Фото, з яких збирається галерея товару (крім основного) */
export const categoryPhotos: Record<CategorySlug, PhotoKey[]> = {
  tents: ["meadow", "inside", "lake", "starry", "sunset", "forestNight"],
  backpacks: ["backpackTrail", "backpackGreen", "hikers", "backpackGear", "backpackCity"],
  "sleeping-bags": ["sleepingBlue", "sleepingGrass", "sleepingCar", "inside"],
  cookware: ["cookStove", "kettle", "campfire", "mug"],
  furniture: ["campChairs", "campTable", "friendsFire", "campfire"],
  lighting: ["glowTent", "forestNight", "starry", "milkyWay"],
  grills: ["skewers", "steak", "ribs", "campfire"],
  hammocks: ["hammockCabin", "hammockTent", "view", "meadow"],
  accessories: ["backpackGear", "hikers", "mug", "backpackGreen"],
};

/* ---------- Категорії ---------- */

export const categories: CategoryInfo[] = [
  { slug: "tents", name: "Намети", title: "Намети для всієї родини", subtitle: "Обирайте комфортне житло для ваших мандрівок.", image: unsplash(photo.mountains, 720, 360), popularity: 1 },
  { slug: "backpacks", name: "Рюкзаки", title: "Туристичні рюкзаки", subtitle: "Від легких штурмових до місткових експедиційних.", image: unsplash(photo.backpackTrail, 720, 360), popularity: 2 },
  { slug: "sleeping-bags", name: "Спальники", title: "Спальні мішки", subtitle: "Теплий сон у будь-яку пору року.", image: unsplash(photo.sleepingBlue, 720, 360), popularity: 3 },
  { slug: "cookware", name: "Туристичний посуд", title: "Туристичний посуд", subtitle: "Пальники, казанки та чашки для смачних привалів.", image: unsplash(photo.cookStove, 720, 360), popularity: 4 },
  { slug: "furniture", name: "Кемпінгові меблі", title: "Кемпінгові меблі", subtitle: "Крісла, столи та стільці — затишок навіть у лісі.", image: unsplash(photo.campChairs, 720, 360), popularity: 5 },
  { slug: "lighting", name: "Освітлення та ліхтарі", title: "Освітлення та ліхтарі", subtitle: "Налобні ліхтарі, кемпінгові лампи та гірлянди.", image: unsplash(photo.glowTent, 720, 360), popularity: 6 },
  { slug: "grills", name: "Мангали та гриль", title: "Мангали та гриль", subtitle: "Усе для пікніка та смаженого на вогні.", image: unsplash(photo.skewers, 720, 360), popularity: 7 },
  { slug: "hammocks", name: "Гамаки", title: "Гамаки", subtitle: "Найкращий спосіб відпочити між соснами.", image: unsplash(photo.hammockCabin, 720, 360), popularity: 8 },
  { slug: "accessories", name: "Аксесуари", title: "Туристичні аксесуари", subtitle: "Корисні дрібниці, без яких не обійтися в поході.", image: unsplash(photo.backpackGear, 720, 360), popularity: 9 },
];

export const categoryBySlug = Object.fromEntries(
  categories.map((c) => [c.slug, c]),
) as Record<CategorySlug, CategoryInfo>;

/* ---------- Товари ---------- */

type TentInput = Omit<Product, "category" | "specs" | "image" | "photo" | "attrs" | "stock"> & {
  capacity: number;
  weight: number;
  image: PhotoKey;
};

const tentInputs: TentInput[] = [
  { id: "np3", name: "Намет Nature Peak 3", brand: "Nature Peak", capacity: 3, price: 4890, oldPrice: 5790, weight: 3.1, rating: 4.8, reviews: 64, inStock: true, popularity: 1, image: "mountains" },
  { id: "ov4", name: "Сімейний намет Outventure 4", brand: "Outventure", capacity: 4, price: 6200, oldPrice: 7290, weight: 5.4, rating: 4.7, reviews: 41, inStock: true, popularity: 2, image: "meadow" },
  { id: "ch3", name: "Кемпінговий намет Coleman Horizon", brand: "Coleman", capacity: 3, price: 6200, hit: true, weight: 4.2, rating: 4.9, reviews: 112, inStock: true, popularity: 3, image: "lake" },
  { id: "ch5", name: "Кемпінговий намет Coleman Horizon 5", brand: "Coleman", capacity: 5, price: 8400, hit: true, weight: 6.8, rating: 4.8, reviews: 57, inStock: true, popularity: 4, image: "forestNight" },
  { id: "np2", name: "Намет Nature Peak 2 Lite", brand: "Nature Peak", capacity: 2, price: 3490, oldPrice: 4100, weight: 2.2, rating: 4.6, reviews: 38, inStock: true, popularity: 5, image: "sunset" },
  { id: "ti-family", name: "Намет Terra Incognita Family 6", brand: "Terra Incognita", capacity: 6, price: 12900, isNew: true, weight: 9.6, rating: 4.9, reviews: 12, inStock: true, popularity: 6, image: "inside" },
  { id: "tr-lite", name: "Намет Tramp Lite 2", brand: "Tramp", capacity: 2, price: 4990, weight: 1.9, rating: 4.7, reviews: 29, inStock: true, popularity: 7, image: "orange" },
  { id: "ov-ar", name: "Сімейний намет Outventure Avalon 4", brand: "Outventure", capacity: 4, price: 7600, hit: true, weight: 6.1, rating: 4.8, reviews: 73, inStock: false, popularity: 8, image: "view" },
  { id: "ti-wonder", name: "Намет Terra Incognita Wonder 2", brand: "Terra Incognita", capacity: 2, price: 5390, weight: 2.6, rating: 4.5, reviews: 18, inStock: true, popularity: 9, image: "starry" },
  { id: "tr-sphinx", name: "Намет Tramp Sphinx 3", brand: "Tramp", capacity: 3, price: 7290, oldPrice: 8590, weight: 3.4, rating: 4.8, reviews: 46, inStock: true, popularity: 10, image: "rocks" },
  { id: "np-base", name: "Намет-шатро Nature Peak Base Camp 8", brand: "Nature Peak", capacity: 8, price: 23000, isNew: true, weight: 14.5, rating: 5, reviews: 7, inStock: true, popularity: 11, image: "meadow" },
  { id: "ch-tasman", name: "Намет Coleman Tasman 2", brand: "Coleman", capacity: 2, price: 3990, weight: 2.8, rating: 4.4, reviews: 22, inStock: true, popularity: 12, image: "milkyWay" },
  { id: "ti-platou", name: "Намет Terra Incognita Platou 4", brand: "Terra Incognita", capacity: 4, price: 9890, oldPrice: 11290, weight: 5.9, rating: 4.7, reviews: 31, inStock: true, popularity: 13, image: "lake" },
  { id: "tr-bell", name: "Намет-купол Tramp Bell 3", brand: "Tramp", capacity: 3, price: 5890, weight: 3.8, rating: 4.6, reviews: 15, inStock: true, popularity: 14, image: "mountains" },
  { id: "ov-camp", name: "Кемпінговий намет Outventure Camp 3", brand: "Outventure", capacity: 3, price: 4890, oldPrice: 5490, weight: 3.9, rating: 4.5, reviews: 26, inStock: true, popularity: 15, image: "sunset" },
  { id: "ch-ridgeline", name: "Намет Coleman Ridgeline 4 Plus", brand: "Coleman", capacity: 4, price: 10490, weight: 7.2, rating: 4.8, reviews: 49, inStock: true, popularity: 16, image: "forestNight" },
  { id: "np-trek", name: "Трекінговий намет Nature Peak Trek 1", brand: "Nature Peak", capacity: 1, price: 2490, weight: 1.4, rating: 4.3, reviews: 19, inStock: true, popularity: 17, image: "orange" },
  { id: "ti-minima", name: "Намет Terra Incognita Minima 3", brand: "Terra Incognita", capacity: 3, price: 6690, hit: true, weight: 3.3, rating: 4.9, reviews: 88, inStock: true, popularity: 18, image: "view" },
];

const places = (n: number) =>
  n === 1 ? "місце" : n >= 2 && n <= 4 ? "місця" : "місць";

const kg = (w: number) => `${String(w).replace(".", ",")} кг`;
const persons = (n: number) =>
  `${n} ${n === 1 ? "особа" : n <= 4 ? "особи" : "осіб"}`;

const tents: Product[] = tentInputs.map(({ weight, image, ...t }) => {
  const alu = t.brand === "Tramp" || t.brand === "Terra Incognita";
  const big = t.capacity >= 6;
  return {
    ...t,
    stock: seedStock(t.id, t.inStock),
    category: "tents",
    specs: `${t.capacity} ${places(t.capacity)} · ${kg(weight)}`,
    image: img(image),
    photo: image,
    attrs: [
      ["Бренд", t.brand],
      ["Місткість", persons(t.capacity)],
      ["Вага", kg(weight)],
      ["Водостійкість тенту", alu ? "5000 мм" : big ? "4000 мм" : "3000 мм"],
      ["Водостійкість дна", alu ? "10 000 мм" : "6000 мм"],
      ["Кількість входів", t.capacity >= 3 ? "2" : "1"],
      ["Кількість тамбурів", t.capacity >= 3 ? "2" : "1"],
      ["Каркас", alu ? "Алюміній 7001" : "Склопластик 8,5 мм"],
      ["Сезонність", big ? "3–4 сезони" : "3 сезони"],
      ["Розмір у чохлі", big ? "70 × 30 × 30 см" : t.capacity >= 4 ? "60 × 25 × 25 см" : "48 × 18 × 18 см"],
      ["Москітна сітка", "Так, на всіх входах"],
      ["Гарантія", "12 місяців"],
    ],
  };
});

type Input = Omit<Product, "category" | "image" | "popularity" | "photo" | "attrs" | "stock"> & {
  image: PhotoKey;
};

/** Початковий залишок: детермінований, 6–29 шт. для товарів у наявності */
function seedStock(id: string, inStock: boolean) {
  if (!inStock) return 0;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 6 + (h % 24);
}

function make(category: CategorySlug, list: Input[]): Product[] {
  return list.map((p, i) => ({
    ...p,
    stock: seedStock(p.id, p.inStock),
    category,
    popularity: i + 1,
    image: img(p.image),
    photo: p.image,
    attrs: [
      ["Бренд", p.brand],
      ...(otherAttrs[p.id] ?? []),
      ["Гарантія", category === "accessories" ? "6 місяців" : "12 місяців"],
    ],
  }));
}

/** Характеристики товарів (крім наметів — їх розраховано вище) */
const otherAttrs: Record<string, [string, string][]> = {
  // рюкзаки
  "bp-trail45": [["Об'єм", "45 л"], ["Вага", "1,4 кг"], ["Спинка", "Вентильована, регульована"], ["Матеріал", "Нейлон 420D Ripstop"], ["Чохол від дощу", "Так"], ["Зріст", "165–190 см"]],
  "bp-np65": [["Об'єм", "65 л (+10 л)"], ["Вага", "2,1 кг"], ["Спинка", "Алюмінієва рама, регульована"], ["Матеріал", "Поліестер 600D"], ["Чохол від дощу", "Так"], ["Зріст", "170–195 см"]],
  "bp-ov30": [["Об'єм", "30 л"], ["Вага", "0,8 кг"], ["Спинка", "Сітчаста"], ["Матеріал", "Поліестер 300D"], ["Відділ для ноутбука", "До 15,6″"]],
  "bp-ti55": [["Об'єм", "55 л"], ["Вага", "1,8 кг"], ["Спинка", "Регульована, EVA-піна"], ["Матеріал", "Cordura 500D"], ["Чохол від дощу", "Так"], ["Зріст", "165–190 см"]],
  "bp-kids": [["Об'єм", "18 л"], ["Вага", "0,5 кг"], ["Вік", "6–12 років"], ["Світловідбивні елементи", "Так"], ["Матеріал", "Поліестер 300D"]],
  "bp-ch40": [["Об'єм", "40 л"], ["Вага", "1,2 кг"], ["Спинка", "Вентильована"], ["Матеріал", "Нейлон 210D"], ["Чохол від дощу", "Так"]],
  // спальники
  "sb-alpine": [["Температура комфорту", "−5°C"], ["Екстремальна температура", "−15°C"], ["Вага", "1,6 кг"], ["Форма", "Кокон"], ["Утеплювач", "Hollow Fiber 4 шари"], ["Розмір", "220 × 80 см"]],
  "sb-summer": [["Температура комфорту", "+10°C"], ["Екстремальна температура", "+3°C"], ["Вага", "1,1 кг"], ["Форма", "Ковдра з капюшоном"], ["Утеплювач", "Hollow Fiber"], ["Розмір", "220 × 75 см"]],
  "sb-double": [["Температура комфорту", "+3°C"], ["Екстремальна температура", "−6°C"], ["Вага", "3,2 кг"], ["Форма", "Двомісна ковдра"], ["Розмір", "220 × 150 см"], ["Можна розстебнути на два", "Так"]],
  "sb-winter": [["Температура комфорту", "−15°C"], ["Екстремальна температура", "−30°C"], ["Вага", "2,4 кг"], ["Форма", "Кокон"], ["Утеплювач", "Пух / перо 90/10"], ["Розмір", "225 × 85 см"]],
  "sb-kids": [["Температура комфорту", "+5°C"], ["Вага", "0,9 кг"], ["Форма", "Ковдра"], ["Зріст дитини", "до 150 см"], ["Розмір", "170 × 70 см"]],
  // посуд
  "ck-set": [["Кількість предметів", "6"], ["Вага", "0,7 кг"], ["Матеріал", "Анодований алюміній"], ["Об'єм казанка", "1,8 л"], ["Чохол", "Так"]],
  "ck-kettle": [["Об'єм", "1,2 л"], ["Вага", "0,3 кг"], ["Матеріал", "Анодований алюміній"], ["Складана ручка", "Так"]],
  "ck-burner": [["Потужність", "2800 Вт"], ["Вага", "0,35 кг"], ["Підпал", "П'єзо"], ["Тип газу", "Різьбовий балон"], ["Час закипання 1 л", "3,5 хв"]],
  "ck-pot": [["Об'єм", "4 л"], ["Вага", "0,6 кг"], ["Матеріал", "Алюміній"], ["Кришка-сковорідка", "Так"]],
  "ck-mug": [["Об'єм", "350 мл"], ["Вага", "0,25 кг"], ["Матеріал", "Нержавіюча сталь"], ["Тримає тепло", "до 6 год"]],
  // меблі
  "fu-chair": [["Макс. навантаження", "120 кг"], ["Вага", "3,5 кг"], ["Каркас", "Сталь"], ["Підлокітники", "Так, зі столиком"], ["Розмір у складеному вигляді", "85 × 15 × 15 см"]],
  "fu-table": [["Розмір стільниці", "120 × 70 см"], ["Вага", "4,8 кг"], ["Висота", "40 / 70 см"], ["Стільниця", "Алюмінієві рейки"]],
  "fu-set": [["Комплектація", "Стіл + 4 стільці"], ["Вага", "9,5 кг"], ["Розмір столу", "120 × 60 см"], ["Складається у валізу", "Так"]],
  "fu-stool": [["Макс. навантаження", "100 кг"], ["Вага", "0,9 кг"], ["Висота", "42 см"], ["Чохол", "Так"]],
  // освітлення
  "li-head": [["Яскравість", "400 лм"], ["Дальність", "до 120 м"], ["Живлення", "Акумулятор, USB-C"], ["Час роботи", "до 40 год"], ["Захист", "IPX4"]],
  "li-lantern": [["Яскравість", "600 лм"], ["Режими", "3 + червоне світло"], ["Живлення", "4 × AA"], ["Час роботи", "до 75 год"]],
  "li-garland": [["Довжина", "5 м"], ["Кількість LED", "50"], ["Живлення", "Сонячна панель / USB"], ["Захист", "IP65"]],
  "li-hand": [["Яскравість", "300 лм"], ["Дальність", "до 200 м"], ["Живлення", "18650, USB"], ["Захист", "IPX6"]],
  // мангали
  "gr-mangal": [["Кількість шампурів", "6"], ["Товщина металу", "3 мм"], ["Вага", "4,2 кг"], ["Розмір", "60 × 30 × 15 см"]],
  "gr-gas": [["Потужність", "2200 Вт"], ["Вага", "7 кг"], ["Поверхня", "Чавунна решітка 48 × 30 см"], ["Підпал", "П'єзо"]],
  "gr-skewers": [["Кількість", "6 шт"], ["Довжина", "60 см"], ["Матеріал", "Нержавіюча сталь"], ["Ручка", "Дерев'яна"]],
  "gr-grid": [["Розмір", "30 × 40 см"], ["Матеріал", "Нержавіюча сталь"], ["Антипригарне покриття", "Так"]],
  // гамаки
  "hm-single": [["Макс. навантаження", "150 кг"], ["Вага", "0,5 кг"], ["Розмір", "270 × 140 см"], ["Матеріал", "Парашутний нейлон"], ["Кріплення", "Стропи в комплекті"]],
  "hm-double": [["Макс. навантаження", "200 кг"], ["Вага", "0,8 кг"], ["Розмір", "300 × 200 см"], ["Матеріал", "Парашутний нейлон"], ["Кріплення", "Стропи в комплекті"]],
  "hm-net": [["Макс. навантаження", "150 кг"], ["Вага", "0,9 кг"], ["Розмір", "275 × 140 см"], ["Москітна сітка", "Так, знімна"]],
  // аксесуари
  "ac-mat": [["Товщина", "5 см"], ["Вага", "1,2 кг"], ["Розмір", "190 × 60 см"], ["R-value", "3,5"]],
  "ac-poles": [["Матеріал", "Алюміній 7075"], ["Довжина", "110–135 см"], ["Вага пари", "0,5 кг"], ["Фіксатор", "Клямка"]],
  "ac-flask": [["Об'єм", "1 л"], ["Тримає тепло", "24 год"], ["Матеріал", "Нержавіюча сталь"], ["Вага", "0,6 кг"]],
  "ac-carabiner": [["Матеріал", "Алюміній"], ["Навантаження", "до 10 кг"], ["Призначення", "Побутовий, не для страхування"]],
  "ac-raincover": [["Об'єм рюкзака", "50–70 л"], ["Матеріал", "Поліестер з PU-покриттям"], ["Колір", "Помаранчевий"]],
};

const others: Product[] = [
  ...make("backpacks", [
    { id: "bp-trail45", name: "Рюкзак Tramp Trail Pro 45L", brand: "Tramp", price: 2690, hit: true, rating: 4.8, reviews: 96, inStock: true, specs: "45 л · 1,4 кг", image: "backpackTrail" },
    { id: "bp-np65", name: "Рюкзак Nature Peak Expedition 65L", brand: "Nature Peak", price: 4390, oldPrice: 5190, rating: 4.7, reviews: 34, inStock: true, specs: "65 л · 2,1 кг", image: "backpackGreen" },
    { id: "bp-ov30", name: "Рюкзак Outventure Day 30L", brand: "Outventure", price: 1290, rating: 4.5, reviews: 58, inStock: true, specs: "30 л · 0,8 кг", image: "backpackCity" },
    { id: "bp-ti55", name: "Рюкзак Terra Incognita Mountain 55L", brand: "Terra Incognita", price: 3590, rating: 4.8, reviews: 27, inStock: true, specs: "55 л · 1,8 кг", image: "hikers" },
    { id: "bp-kids", name: "Дитячий рюкзак Outventure Junior 18L", brand: "Outventure", price: 890, isNew: true, rating: 4.6, reviews: 11, inStock: true, specs: "18 л · 0,5 кг", image: "backpackGear" },
    { id: "bp-ch40", name: "Рюкзак Coleman Voyager 40L", brand: "Coleman", price: 2190, oldPrice: 2590, rating: 4.4, reviews: 19, inStock: false, specs: "40 л · 1,2 кг", image: "backpackTrail" },
  ]),
  ...make("sleeping-bags", [
    { id: "sb-alpine", name: "Спальник Nature Peak Alpine −5°C", brand: "Nature Peak", price: 2290, hit: true, rating: 4.8, reviews: 71, inStock: true, specs: "комфорт −5°C · 1,6 кг", image: "sleepingBlue" },
    { id: "sb-summer", name: "Спальник-ковдра Outventure Summer +10°C", brand: "Outventure", price: 1590, rating: 4.5, reviews: 44, inStock: true, specs: "комфорт +10°C · 1,1 кг", image: "sleepingGrass" },
    { id: "sb-double", name: "Двомісний спальник Coleman Duo", brand: "Coleman", price: 3890, oldPrice: 4490, rating: 4.7, reviews: 23, inStock: true, specs: "комфорт +3°C · 3,2 кг", image: "sleepingCar" },
    { id: "sb-winter", name: "Спальник Terra Incognita Siberia −15°C", brand: "Terra Incognita", price: 5490, isNew: true, rating: 4.9, reviews: 9, inStock: true, specs: "комфорт −15°C · 2,4 кг", image: "sleepingBlue" },
    { id: "sb-kids", name: "Дитячий спальник Tramp Kids", brand: "Tramp", price: 1790, rating: 4.6, reviews: 16, inStock: true, specs: "комфорт +5°C · 0,9 кг", image: "sleepingGrass" },
  ]),
  ...make("cookware", [
    { id: "ck-set", name: "Набір посуду Tramp Camp Cook", brand: "Tramp", price: 1190, oldPrice: 1490, rating: 4.7, reviews: 83, inStock: true, specs: "6 предметів · 0,7 кг", image: "cookStove" },
    { id: "ck-kettle", name: "Чайник Nature Peak Trek 1,2 л", brand: "Nature Peak", price: 690, hit: true, rating: 4.8, reviews: 102, inStock: true, specs: "1,2 л · алюміній", image: "kettle" },
    { id: "ck-burner", name: "Газовий пальник Coleman FyreStorm", brand: "Coleman", price: 1890, rating: 4.6, reviews: 37, inStock: true, specs: "2 800 Вт · п'єзопідпал", image: "cookStove" },
    { id: "ck-pot", name: "Казанок Terra Incognita Pot 4 л", brand: "Terra Incognita", price: 990, rating: 4.5, reviews: 21, inStock: true, specs: "4 л · з кришкою", image: "campfire" },
    { id: "ck-mug", name: "Термочашка Outventure 350 мл", brand: "Outventure", price: 390, isNew: true, rating: 4.7, reviews: 48, inStock: true, specs: "350 мл · сталь", image: "mug" },
  ]),
  ...make("furniture", [
    { id: "fu-chair", name: "Крісло розкладне Coleman Deck", brand: "Coleman", price: 1690, hit: true, rating: 4.8, reviews: 66, inStock: true, specs: "до 120 кг · 3,5 кг", image: "campChairs" },
    { id: "fu-table", name: "Стіл розкладний Tramp Roll 120", brand: "Tramp", price: 2390, oldPrice: 2790, rating: 4.6, reviews: 29, inStock: true, specs: "120×70 см · 4,8 кг", image: "campTable" },
    { id: "fu-set", name: "Набір меблів Outventure Picnic 4+1", brand: "Outventure", price: 4990, rating: 4.7, reviews: 18, inStock: true, specs: "стіл + 4 стільці", image: "friendsFire" },
    { id: "fu-stool", name: "Стілець Nature Peak Compact", brand: "Nature Peak", price: 490, rating: 4.4, reviews: 41, inStock: true, specs: "до 100 кг · 0,9 кг", image: "campChairs" },
  ]),
  ...make("lighting", [
    { id: "li-head", name: "Налобний ліхтар Nature Peak Beam 400", brand: "Nature Peak", price: 790, hit: true, rating: 4.8, reviews: 118, inStock: true, specs: "400 лм · USB-C", image: "glowTent" },
    { id: "li-lantern", name: "Кемпінгова лампа Coleman Northstar", brand: "Coleman", price: 1490, rating: 4.7, reviews: 32, inStock: true, specs: "600 лм · 3 режими", image: "forestNight" },
    { id: "li-garland", name: "LED-гірлянда Outventure Camp 5 м", brand: "Outventure", price: 450, isNew: true, rating: 4.6, reviews: 25, inStock: true, specs: "5 м · сонячна панель", image: "glowTent" },
    { id: "li-hand", name: "Ручний ліхтар Tramp Hunter", brand: "Tramp", price: 590, oldPrice: 720, rating: 4.5, reviews: 19, inStock: true, specs: "300 лм · IPX6", image: "starry" },
  ]),
  ...make("grills", [
    { id: "gr-mangal", name: "Мангал-валіза Tramp Steel 6", brand: "Tramp", price: 1290, hit: true, rating: 4.7, reviews: 54, inStock: true, specs: "6 шампурів · 3 мм", image: "skewers" },
    { id: "gr-gas", name: "Газовий гриль Coleman Fold N Go", brand: "Coleman", price: 6490, oldPrice: 7290, rating: 4.8, reviews: 21, inStock: true, specs: "2 200 Вт · 7 кг", image: "steak" },
    { id: "gr-skewers", name: "Набір шампурів Nature Peak 6 шт", brand: "Nature Peak", price: 350, rating: 4.5, reviews: 38, inStock: true, specs: "60 см · нержавійка", image: "skewers" },
    { id: "gr-grid", name: "Решітка-гриль Outventure BBQ", brand: "Outventure", price: 420, rating: 4.4, reviews: 14, inStock: true, specs: "30×40 см", image: "ribs" },
  ]),
  ...make("hammocks", [
    { id: "hm-single", name: "Гамак Tramp Relax Single", brand: "Tramp", price: 990, rating: 4.6, reviews: 27, inStock: true, specs: "до 150 кг · 0,5 кг", image: "hammockCabin" },
    { id: "hm-double", name: "Гамак Nature Peak Double", brand: "Nature Peak", price: 1590, oldPrice: 1890, hit: true, rating: 4.8, reviews: 42, inStock: true, specs: "до 200 кг · 0,8 кг", image: "hammockTent" },
    { id: "hm-net", name: "Гамак з москітною сіткою Terra Incognita", brand: "Terra Incognita", price: 2190, isNew: true, rating: 4.7, reviews: 8, inStock: true, specs: "до 150 кг · сітка", image: "hammockCabin" },
  ]),
  ...make("accessories", [
    { id: "ac-mat", name: "Самонадувний килимок Tramp Comfort", brand: "Tramp", price: 1890, hit: true, rating: 4.8, reviews: 77, inStock: true, specs: "5 см · 1,2 кг", image: "backpackGear" },
    { id: "ac-poles", name: "Трекінгові палиці Nature Peak (пара)", brand: "Nature Peak", price: 1190, rating: 4.6, reviews: 33, inStock: true, specs: "алюміній · 110–135 см", image: "hikers" },
    { id: "ac-flask", name: "Термос Coleman 1 л", brand: "Coleman", price: 890, oldPrice: 1050, rating: 4.7, reviews: 51, inStock: true, specs: "1 л · 24 год тепла", image: "mug" },
    { id: "ac-carabiner", name: "Карабін Outventure Clip", brand: "Outventure", price: 100, rating: 4.3, reviews: 12, inStock: true, specs: "алюміній · до 10 кг", image: "backpackGear" },
    { id: "ac-raincover", name: "Чохол на рюкзак Terra Incognita 50–70 л", brand: "Terra Incognita", price: 350, rating: 4.5, reviews: 17, inStock: true, specs: "водовідштовхувальний", image: "backpackGreen" },
  ]),
];

/**
 * Початковий каталог. При першому запуску переноситься в базу даних
 * (.data/db.json), далі товари, ціни й залишки змінюються в адмін-панелі.
 * На сайті товари беруться з бази: на сервері — getCatalog(), у браузері — useCatalog().
 */
export const seedProducts: Product[] = [...tents, ...others];

export const PHOTO_KEYS = Object.keys(photo) as PhotoKey[];
export const isPhotoKey = (v: unknown): v is PhotoKey => typeof v === "string" && v in photo;
export const isCategorySlug = (v: unknown): v is CategorySlug => typeof v === "string" && v in categoryBySlug;

/** Похідні поля товару (фото, наявність) — рахуються однаково на сервері й у браузері */
export function withDerived(p: Product): Product {
  return {
    ...p,
    image: p.customImage || img(p.photo),
    inStock: p.stock > 0,
  };
}

/** Бренди зі списку товарів (для фільтрів) */
export const brandsOf = (list: Product[]) => Array.from(new Set(list.map((p) => p.brand))).sort();

/** Скільки товарів на складі вважається «закінчується» */
export const LOW_STOCK = 5;

/* ---------- Фільтри / сортування ---------- */

export const capacityOptions = [
  { id: "1-2", label: "1–2-місні", test: (c: number) => c <= 2 },
  { id: "3", label: "3-місні", test: (c: number) => c === 3 },
  { id: "4+", label: "4-місні+", test: (c: number) => c >= 4 },
] as const;

export type CapacityId = (typeof capacityOptions)[number]["id"];

export const productSortOptions = [
  { id: "popular", label: "Спочатку популярні" },
  { id: "cheap", label: "Спочатку дешевші" },
  { id: "expensive", label: "Спочатку дорожчі" },
  { id: "discount", label: "Найбільша знижка" },
  { id: "rating", label: "За рейтингом" },
] as const;

export type ProductSortId = (typeof productSortOptions)[number]["id"];

export function priceBounds(list: Product[]): [number, number] {
  if (!list.length) return [0, 0];
  const prices = list.map((p) => p.price);
  return [Math.min(...prices), Math.max(...prices)];
}

/** Округлення меж повзунка до «красивих» значень */
export function roundBounds([min, max]: [number, number]): [number, number] {
  return [Math.floor(min / 100) * 100, Math.ceil(max / 1000) * 1000];
}

/* ---------- Утиліти ---------- */

/** Форматування без Intl, щоб сервер і браузер дали однаковий рядок */
export function formatPrice(value: number) {
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₴`;
}

export function discountPercent(p: Product) {
  return p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
}

export function plural(n: number, [one, few, many]: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const productsWord = (n: number) =>
  plural(n, ["товар", "товари", "товарів"]);
