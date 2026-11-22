import type { Metadata } from "next";
import Link from "next/link";
import ChatButton from "../components/ChatButton";
import Icon, { type IconName } from "../components/Icon";
import InfoLayout from "../components/InfoLayout";
import { Faq, InfoCard, InfoTitle } from "../components/info-ui";
import { contacts, socialLinks } from "../components/data";
import { RETURN_DAYS } from "../components/cart-logic";
import { returnsInfoEnabled } from "../components/shop-config";

export const metadata: Metadata = {
  alternates: { canonical: "/contacts" },
  title: "Контакти",
  description:
    `Зв'яжіться з Family Camping: телефон ${contacts.phone}, email ${contacts.email}. Замовлення на сайті приймаємо цілодобово.`,
};

const channels: { icon: IconName; title: string; value: string; href?: string; note: string }[] = [
  { icon: "phone", title: "Телефон", value: contacts.phone, href: contacts.phoneHref, note: "Дзвінки за тарифами вашого оператора" },
  { icon: "mail", title: "Email", value: contacts.email, href: contacts.emailHref, note: "Відповідаємо в робочий час" },
  { icon: "clock", title: "Замовлення на сайті", value: "Цілодобово, 24/7", note: "Підтверджуємо в робочий час" },
];


export default function ContactsPage() {
  return (
    <InfoLayout
      eyebrow="Контакти"
      icon="headset"
      title="Ми на"
      accent="зв’язку"
      lead={`Допоможемо обрати спорядження, відстежити замовлення${returnsInfoEnabled() ? " чи оформити повернення" : ""}. Замовлення на сайті приймаємо цілодобово.`}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {channels.map((c) => {
          const body = (
            <>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#ffd51f] text-[#082c45]">
                <Icon name={c.icon} className="h-6 w-6" />
              </span>
              <span className="mt-4 block text-xs font-black uppercase tracking-[0.14em] text-[#8aa5b5]">{c.title}</span>
              <span className="mt-1 block text-xl font-extrabold tracking-[-0.02em] break-words">{c.value}</span>
              <span className="mt-1 block text-sm text-[#527083]">{c.note}</span>
            </>
          );
          const cls = "block rounded-[24px] bg-white p-6 shadow-[0_18px_52px_rgba(79,93,101,.08)]";
          return c.href ? (
            <a key={c.title} href={c.href} className={`${cls} transition hover:-translate-y-1 hover:shadow-[0_22px_56px_rgba(79,93,101,.14)]`}>
              {body}
            </a>
          ) : (
            <div key={c.title} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
        <InfoCard>
          <InfoTitle icon="chat" eyebrow="Чат з консультантом">Напишіть нам</InfoTitle>
          <p className="mt-3 text-[15px] leading-relaxed text-[#3d5d70]">
            Найшвидше — у чаті: допоможемо обрати намет чи спальник, підкажемо щодо доставки та оплати{returnsInfoEnabled() ? " або повернення" : ""}.
            Реєстрація не потрібна. Уся переписка зберігається — повернутися до неї можна з будь-якої сторінки
            сайту через кнопку чату в правому нижньому куті.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[#3d5d70]">
            {["Відповідаємо в робочий час, зазвичай протягом години", "Якщо закриєте сайт — продублюємо відповідь на email", "Можна запитати про конкретний товар прямо з його сторінки"].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-[#1f9d55]">✓</span>
                {t}
              </li>
            ))}
          </ul>
          <ChatButton className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-[#ffd51f] px-7 py-4 text-base font-extrabold text-[#082c45] shadow-[0_10px_26px_rgba(255,213,31,.4)] transition hover:-translate-y-0.5 hover:bg-[#ffe044]">
            Відкрити чат
          </ChatButton>
        </InfoCard>

        <div className="grid gap-6">
          <InfoCard className="!bg-[#082c45] text-white">
            <p className="flex items-center gap-2.5 text-lg font-extrabold">
              <Icon name="truck" className="h-6 w-6 text-[#ffd51f]" /> Лише онлайн
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              У нас немає фізичного магазину чи пункту самовивозу — доставляємо Новою поштою та Укрпоштою по всій
              Україні. Так ми тримаємо ціни нижчими.
            </p>
            <Link href="/delivery" className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-[#ffd51f] hover:underline">
              Умови доставки <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </InfoCard>
          <InfoCard>
            <p className="text-lg font-extrabold">Ми в соцмережах</p>
            <p className="mt-1 text-sm text-[#527083]">Огляди спорядження, маршрути й розіграші.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2.5 rounded-full bg-[#eef9ff] py-1.5 pl-1.5 pr-5 text-sm font-extrabold text-[#067eb7] transition hover:bg-[#ffff00] hover:text-[#063e62]"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white">
                    <Icon name={s.icon} className="h-5 w-5" />
                  </span>
                  {s.label}
                </a>
              ))}
            </div>
          </InfoCard>
        </div>
      </div>

      <InfoCard>
        <InfoTitle icon="headset">Часті питання</InfoTitle>
        <Faq
          items={[
            { q: "Як дізнатися, де моє замовлення?", a: <>Статус перевірте на сторінці <Link href="/orders/track" className="font-bold text-[#098fd0] hover:underline">«Де моє замовлення?»</Link> за номером замовлення й телефоном. Якщо у вас є акаунт — усі замовлення є в <Link href="/account" className="font-bold text-[#098fd0] hover:underline">особистому кабінеті</Link>.</> },
            { q: "Чи можна оформити замовлення вночі?", a: "Так. Сайт приймає замовлення цілодобово — менеджер підтвердить його в робочий час." },
            { q: "Чи можна забрати товар самостійно?", a: "Ні, ми працюємо лише онлайн і не маємо пункту видачі. Найшвидший варіант — Нова пошта: 1–3 дні у відділення, поштомат або кур’єром." },
            ...(returnsInfoEnabled() ? [{ q: "Як повернути товар?", a: <>Протягом {RETURN_DAYS} днів з дня отримання. Покрокова інструкція — на сторінці <Link href="/returns" className="font-bold text-[#098fd0] hover:underline">Обмін і повернення</Link>.</> }] : []),
          ]}
        />
      </InfoCard>
    </InfoLayout>
  );
}
