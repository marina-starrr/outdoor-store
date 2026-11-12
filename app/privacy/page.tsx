import type { Metadata } from "next";
import Link from "next/link";
import Icon, { type IconName } from "../components/Icon";
import InfoLayout from "../components/InfoLayout";
import { Callout, InfoCard, InfoTitle, Prose, Toc } from "../components/info-ui";
import { contacts } from "../components/data";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  title: "Політика конфіденційності",
  description:
    "Які персональні дані збирає Family Camping (акаунт, замовлення, cookie сесії), навіщо і як ми їх зберігаємо та захищаємо.",
};

const sections = [
  { id: "data", label: "Які дані ми збираємо" },
  { id: "cookies", label: "Cookie та локальне сховище" },
  { id: "purpose", label: "Навіщо нам ці дані" },
  { id: "storage", label: "Як ми зберігаємо й захищаємо дані" },
  { id: "sharing", label: "Кому передаємо дані" },
  { id: "rights", label: "Ваші права" },
];

const collected: { icon: IconName; title: string; items: string[] }[] = [
  { icon: "user", title: "Акаунт", items: ["ім’я та прізвище", "email", "номер телефону", "пароль — лише у вигляді захищеного хешу"] },
  { icon: "package", title: "Замовлення", items: ["склад і сума замовлення", "контакти отримувача", "місто, відділення або адреса доставки", "спосіб оплати й коментар"] },
  { icon: "heart", title: "Ваші списки", items: ["кошик", "обране", "остання адреса доставки — щоб не вводити її знову"] },
  { icon: "chat", title: "Звернення", items: ["ім’я, email і телефон з форми контактів", "текст повідомлення та номер замовлення"] },
];

export default function PrivacyPage() {
  return (
    <InfoLayout
      eyebrow="Юридична інформація"
      icon="lock"
      title="Політика"
      accent="конфіденційності"
      lead="Пояснюємо простими словами, які дані ми збираємо, навіщо, як їх захищаємо і як ви можете ними керувати."
      updated="12 листопада 2026"
    >
      <Callout tone="green" icon="shield" title="Коротко">
        Ми збираємо лише те, що потрібно для доставки замовлення й роботи акаунта. <b>Не продаємо</b> ваші дані,{" "}
        <b>не використовуємо рекламні cookie</b> і <b>не зберігаємо дані банківських карток</b>.
      </Callout>

      <Toc items={sections} />

      <InfoCard id="data">
        <InfoTitle icon="user" eyebrow="Розділ 1">Які дані ми збираємо</InfoTitle>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {collected.map((c) => (
            <div key={c.title} className="rounded-[20px] bg-[#f7fafc] p-5">
              <p className="flex items-center gap-2.5 font-extrabold">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#067eb7]">
                  <Icon name={c.icon} className="h-[18px] w-[18px]" />
                </span>
                {c.title}
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-[#3d5d70]">
                {c.items.map((i) => (
                  <li key={i} className="flex gap-2"><span className="text-[#1eb6ed]">•</span>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Prose className="mt-5">
          <p>
            Переглядати каталог, додавати товари в кошик, обране й порівняння можна <b>без реєстрації</b> — тоді жодні
            персональні дані на сервер не передаються. Акаунт потрібен лише для оформлення замовлення.
          </p>
        </Prose>
      </InfoCard>

      <InfoCard id="cookies">
        <InfoTitle icon="lock" eyebrow="Розділ 2">Cookie та локальне сховище</InfoTitle>
        <div className="mt-6 overflow-x-auto rounded-[20px] border border-[#e3edf3]">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-[#f3f9fd] text-xs font-black uppercase tracking-[0.1em] text-[#527083]">
              <tr>
                <th scope="col" className="px-5 py-3.5">Назва</th>
                <th scope="col" className="px-5 py-3.5">Для чого</th>
                <th scope="col" className="px-5 py-3.5">Строк</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3edf3] text-[#3d5d70]">
              <tr>
                <td className="px-5 py-4 font-mono text-[13px] font-bold text-[#082c45]">fc_session</td>
                <td className="px-5 py-4">Cookie сесії: тримає вас у акаунті після входу. Містить лише випадковий токен, недоступний для JavaScript (HttpOnly) і не надсилається на інші сайти (SameSite).</td>
                <td className="whitespace-nowrap px-5 py-4">30 днів або до виходу</td>
              </tr>
              <tr>
                <td className="px-5 py-4 font-mono text-[13px] font-bold text-[#082c45]">family-camping-*</td>
                <td className="px-5 py-4">Локальне сховище браузера: кошик, обране та список порівняння. Зберігаються лише на вашому пристрої.</td>
                <td className="whitespace-nowrap px-5 py-4">Доки не очистите</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-[#527083]">
          Аналітичних, рекламних чи сторонніх cookie ми не використовуємо, тому окремий банер згоди не показуємо. Cookie
          сесії є технічно необхідним для входу в акаунт.
        </p>
      </InfoCard>

      <InfoCard id="purpose">
        <InfoTitle icon="package" eyebrow="Розділ 3">Навіщо нам ці дані</InfoTitle>
        <Prose className="mt-4">
          <ul>
            <li>оформити, доставити замовлення та зв’язатися з вами щодо нього;</li>
            <li>зберігати ваш кошик, обране та історію замовлень між пристроями;</li>
            <li>надіслати фіскальний чек і повідомлення про статус замовлення;</li>
            <li>відповісти на ваше звернення, опрацювати обмін чи повернення;</li>
            <li>захистити акаунт від зламу (наприклад, обмежити кількість спроб входу).</li>
          </ul>
          <p>
            Ми обробляємо дані відповідно до Закону України «Про захист персональних даних» — на підставі вашої згоди та
            для виконання договору купівлі-продажу. Розсилок без вашої окремої згоди не надсилаємо.
          </p>
        </Prose>
      </InfoCard>

      <InfoCard id="storage">
        <InfoTitle icon="shield" eyebrow="Розділ 4">Як ми зберігаємо й захищаємо дані</InfoTitle>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { t: "Паролі не зберігаються", d: "Зберігаємо лише стійкий криптографічний хеш (scrypt) з унікальною «сіллю». Навіть ми не знаємо ваш пароль." },
            { t: "Токени сесій — у хеші", d: "На сервері зберігається тільки хеш токена з cookie, тож витік бази не дає змоги увійти у ваш акаунт." },
            { t: "Захищене з’єднання", d: "Сайт працює через HTTPS, а зміни даних приймаються лише з нашого сайту — це захищає від підробних запитів." },
          ].map((x) => (
            <div key={x.t} className="rounded-[20px] border border-[#e3edf3] p-5">
              <b className="block">{x.t}</b>
              <p className="mt-1 text-sm leading-relaxed text-[#527083]">{x.d}</p>
            </div>
          ))}
        </div>
        <Prose className="mt-5">
          <p>
            <b>Строк зберігання.</b> Дані акаунта зберігаємо, доки акаунт існує. Історію замовлень — стільки, скільки
            вимагає податкове законодавство для первинних документів. Звернення з форми контактів — до 1 року. Після
            цього дані видаляємо або знеособлюємо.
          </p>
        </Prose>
      </InfoCard>

      <InfoCard id="sharing">
        <InfoTitle icon="truck" eyebrow="Розділ 5">Кому передаємо дані</InfoTitle>
        <Prose className="mt-4">
          <p>Лише тим, без кого неможливо виконати замовлення, і лише в потрібному обсязі:</p>
          <ul>
            <li><b>службам доставки</b> (Нова пошта, Укрпошта) — ім’я, телефон, місто та відділення або адресу;</li>
            <li><b>платіжному сервісу та банку</b> — суму та номер замовлення для онлайн-оплати чи оплати частинами;</li>
            <li><b>державним органам</b> — лише на законну вимогу.</li>
          </ul>
          <p>Ми ніколи не продаємо й не передаємо ваші дані для реклами.</p>
        </Prose>
      </InfoCard>

      <InfoCard id="rights">
        <InfoTitle icon="user" eyebrow="Розділ 6">Ваші права</InfoTitle>
        <Prose className="mt-4">
          <p>Ви можете в будь-який момент:</p>
          <ul>
            <li>переглянути та змінити свої дані й пароль в <Link href="/account">особистому кабінеті</Link>;</li>
            <li>дізнатися, які саме дані про вас ми зберігаємо;</li>
            <li>вимагати виправлення або видалення даних і акаунта;</li>
            <li>відкликати згоду на обробку даних.</li>
          </ul>
          <p>
            Для цього напишіть на <a href={contacts.emailHref}>{contacts.email}</a> або через{" "}
            <Link href="/contacts">форму зворотного зв’язку</Link> — відповімо протягом 30 днів, як передбачає закон.
          </p>
        </Prose>
      </InfoCard>
    </InfoLayout>
  );
}
