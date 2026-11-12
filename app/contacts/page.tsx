import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "../components/ContactForm";
import Icon, { type IconName } from "../components/Icon";
import InfoLayout from "../components/InfoLayout";
import { Faq, InfoCard, InfoTitle } from "../components/info-ui";
import { contacts } from "../components/data";
import { RETURN_DAYS } from "../components/cart-logic";

export const metadata: Metadata = {
  alternates: { canonical: "/contacts" },
  title: "Контакти",
  description:
    "Зв'яжіться з Family Camping: безкоштовна лінія 0 800 330 121, email hello@outdoor.ua. Замовлення приймаємо й опрацьовуємо цілодобово.",
};

const channels: { icon: IconName; title: string; value: string; href?: string; note: string }[] = [
  { icon: "phone", title: "Телефон", value: contacts.phone, href: contacts.phoneHref, note: "Безкоштовно з усіх номерів України" },
  { icon: "mail", title: "Email", value: contacts.email, href: contacts.emailHref, note: "Відповідаємо протягом 2 годин" },
  { icon: "clock", title: "Графік роботи", value: "Цілодобово, 24/7", note: "Замовлення опрацьовуємо без вихідних" },
];

const socials: { icon: IconName; label: string }[] = [
  { icon: "instagram", label: "Instagram" },
  { icon: "facebook", label: "Facebook" },
  { icon: "youtube", label: "YouTube" },
];

export default function ContactsPage() {
  return (
    <InfoLayout
      eyebrow="Контакти"
      icon="headset"
      title="Ми на"
      accent="зв’язку 24/7"
      lead="Допоможемо обрати спорядження, відстежити замовлення чи оформити повернення. Пишіть або телефонуйте будь-коли — замовлення приймаємо й опрацьовуємо цілодобово."
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
          <InfoTitle icon="chat" eyebrow="Зворотний зв’язок">Напишіть нам</InfoTitle>
          <p className="mb-6 mt-3 text-[15px] text-[#3d5d70]">
            Заповніть форму — менеджер відповість на email або передзвонить, якщо залишите номер.
          </p>
          <ContactForm />
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
            <div className="mt-4 flex gap-3">
              {socials.map((s) => (
                <a key={s.label} href="#" aria-label={s.label} className="grid h-11 w-11 place-items-center rounded-full bg-[#eef9ff] text-[#067eb7] transition hover:bg-[#ffff00] hover:text-[#063e62]">
                  <Icon name={s.icon} className="h-5 w-5" />
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
            { q: "Як дізнатися, де моє замовлення?", a: <>Номер ТТН надсилаємо в SMS у день відправлення. Усі замовлення та їхні статуси також є в <Link href="/account" className="font-bold text-[#098fd0] hover:underline">особистому кабінеті</Link>.</> },
            { q: "Чи можна оформити замовлення вночі?", a: "Так. Замовлення приймаємо й опрацьовуємо цілодобово, а відправляємо щодня." },
            { q: "Чи можна забрати товар самостійно?", a: "Ні, ми працюємо лише онлайн і не маємо пункту видачі. Найшвидший варіант — Нова пошта: 1–3 дні у відділення, поштомат або кур’єром." },
            { q: "Як повернути товар?", a: <>Протягом {RETURN_DAYS} днів з дня отримання. Покрокова інструкція — на сторінці <Link href="/returns" className="font-bold text-[#098fd0] hover:underline">Обмін і повернення</Link>.</> },
          ]}
        />
      </InfoCard>
    </InfoLayout>
  );
}
