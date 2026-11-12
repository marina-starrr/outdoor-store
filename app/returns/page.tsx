import type { Metadata } from "next";
import Link from "next/link";
import Icon from "../components/Icon";
import InfoLayout from "../components/InfoLayout";
import { BannerStats, Callout, Faq, InfoCard, InfoTitle, Prose, Steps } from "../components/info-ui";
import { RETURN_DAYS } from "../components/cart-logic";
import { contacts } from "../components/data";

export const metadata: Metadata = {
  alternates: { canonical: "/returns" },
  title: "Обмін і повернення",
  description: `Повернення та обмін товару протягом ${RETURN_DAYS} днів відповідно до Закону України «Про захист прав споживачів». Умови та порядок дій.`,
};

const REFUND_DAYS = 7;

const canReturn = [
  "товар не був у використанні (намет не встановлювали на природі, спальник не використовували для сну)",
  "збережено товарний вигляд, споживчі властивості, пломби та ярлики",
  "є повна комплектація та оригінальне пакування",
  "є документ про покупку — чек або номер замовлення",
];

const cantReturn = [
  "товар зі слідами використання: бруд, запах диму, пошкодження",
  "газові балони та паливо — з міркувань безпеки перевезення",
  "товари, які за переліком Кабінету Міністрів України не підлягають обміну (напр. засоби особистої гігієни)",
];

export default function ReturnsPage() {
  return (
    <InfoLayout
      eyebrow="Покупцям"
      icon="return"
      title="Обмін"
      accent="і повернення"
      lead={`Не підійшов розмір чи передумали? Поверніть або обміняйте товар протягом ${RETURN_DAYS} днів — відповідно до Закону України «Про захист прав споживачів».`}
      aside={
        <BannerStats
          items={[
            { value: `${RETURN_DAYS}`, label: "днів на повернення" },
            { value: `${REFUND_DAYS}`, label: "днів на повернення коштів" },
            { value: "100%", label: "суми за товар" },
          ]}
        />
      }
    >
      <InfoCard>
        <InfoTitle icon="shield" eyebrow="Ваші права">Коротко про головне</InfoTitle>
        <Prose className="mt-4">
          <p>
            Ви можете повернути або обміняти <b>непродовольчий товар належної якості</b> протягом{" "}
            <b>{RETURN_DAYS} днів</b>, не враховуючи дня отримання, якщо він вам не підійшов за формою, розміром,
            фасоном, кольором чи з іншої причини.
          </p>
          <p>
            Якщо товар має <b>виробничий брак</b>, ви можете вимагати заміни, ремонту або повернення коштів протягом
            усього гарантійного строку. У такому разі доставку в обидва боки оплачуємо ми.
          </p>
        </Prose>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[20px] bg-[#e7f7ee] p-5">
            <p className="flex items-center gap-2 font-extrabold text-[#1f9d55]">
              <Icon name="shield" className="h-5 w-5" /> Приймаємо, якщо
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#3d5d70]">
              {canReturn.map((t) => (
                <li key={t} className="flex gap-2"><span className="text-[#1f9d55]">✓</span>{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[20px] bg-[#fdecec] p-5">
            <p className="flex items-center gap-2 font-extrabold text-[#c53035]">
              <Icon name="close" className="h-5 w-5" /> Не приймаємо
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#3d5d70]">
              {cantReturn.map((t) => (
                <li key={t} className="flex gap-2"><span className="text-[#c53035]">✕</span>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </InfoCard>

      <InfoCard id="steps">
        <InfoTitle icon="return" eyebrow="Порядок дій">Як повернути товар</InfoTitle>
        <Steps
          items={[
            {
              title: "Повідомте нас",
              text: <>Напишіть через <Link href="/contacts" className="font-bold text-[#098fd0] hover:underline">форму зворотного зв’язку</Link> (тема «Обмін або повернення») або зателефонуйте {contacts.phone}. Вкажіть номер замовлення та причину.</>,
            },
            { title: "Підготуйте посилку", text: "Упакуйте товар в оригінальне пакування з усіма ярликами, комплектацією та чеком або номером замовлення." },
            { title: "Відправте Новою поштою", text: "Ми надішлемо реквізити для відправлення. Повернення товару належної якості оплачує покупець за тарифами перевізника." },
            { title: "Отримайте кошти або обмін", text: `Після перевірки товару повернемо гроші на картку протягом ${REFUND_DAYS} днів або відправимо інший розмір чи модель.` },
          ]}
        />
        <div className="mt-5">
          <Callout icon="headset" title="Не впевнені, чи підлягає товар поверненню?">
            Напишіть нам до відправлення — підкажемо і заощадимо ваш час. Для авторизованих покупців усі замовлення
            видно в <Link href="/account">особистому кабінеті</Link>.
          </Callout>
        </div>
      </InfoCard>

      <InfoCard>
        <InfoTitle icon="card">Повернення коштів</InfoTitle>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { t: "Оплата карткою онлайн", d: "Кошти повертаємо на ту саму картку." },
            { t: "Накладений платіж", d: "Переказуємо на картку, реквізити якої ви вкажете у зверненні." },
            { t: "Оплата частинами", d: "Повертаємо банку — розстрочку закривають автоматично." },
          ].map((x) => (
            <div key={x.t} className="rounded-[20px] border border-[#e3edf3] p-5">
              <b className="block">{x.t}</b>
              <p className="mt-1 text-sm leading-relaxed text-[#527083]">{x.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-[#527083]">
          Вартість доставки замовлення до вас не повертається, якщо товар належної якості. Якщо ж ми помилилися чи товар
          має брак — повертаємо повну суму, включно з доставкою.
        </p>
      </InfoCard>

      <InfoCard>
        <InfoTitle icon="chat">Часті питання</InfoTitle>
        <Faq
          items={[
            { q: "Чи можна повернути намет, який розкладали вдома?", a: "Так. Пробне встановлення вдома для перевірки розміру — нормально. Головне, щоб намет був чистим, без пошкоджень і зі всіма ярликами та комплектацією." },
            { q: `З якого дня рахуються ${RETURN_DAYS} днів?`, a: "З наступного дня після отримання посилки у відділенні чи від кур’єра." },
            { q: "Що робити, якщо товар прийшов пошкодженим?", a: "Не забирайте посилку — складіть акт з працівником пошти у відділенні та напишіть нам. Ми відправимо новий товар за свій рахунок." },
            { q: "Чи можна обміняти на інший товар з доплатою?", a: "Так. Якщо новий товар дорожчий — доплатите різницю, якщо дешевший — повернемо різницю на картку." },
          ]}
        />
      </InfoCard>
    </InfoLayout>
  );
}
