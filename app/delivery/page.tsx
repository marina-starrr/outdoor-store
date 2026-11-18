import type { Metadata } from "next";
import Link from "next/link";
import Icon, { type IconName } from "../components/Icon";
import { formatPrice } from "../components/catalog-data";
import InfoLayout from "../components/InfoLayout";
import { BannerStats, Callout, Faq, InfoCard, InfoTitle, Steps } from "../components/info-ui";
import {
  PARCEL_STORAGE_DAYS,
  deliveryOptions,
  paymentOptions,
  type PaymentId,
} from "../components/cart-logic";
import { PAYMENT_DAYS } from "../lib/order-status";

export const metadata: Metadata = {
  alternates: { canonical: "/delivery" },
  title: "Доставка і оплата",
  description: "Доставка Новою поштою та Укрпоштою по всій Україні за тарифами перевізника. Оплата на рахунок після підтвердження замовлення.",
};

const deliveryIcon: Record<string, IconName> = { "np-branch": "package", "np-courier": "truck", ukrposhta: "mail" };
const paymentIcon: Record<PaymentId, IconName> = { card: "card", cod: "package", parts: "clock", invoice: "mail" };

export default function DeliveryPage() {
  return (
    <InfoLayout
      eyebrow="Покупцям"
      icon="truck"
      title="Доставка"
      accent="і оплата"
      lead="Відправляємо по всій Україні Новою поштою та Укрпоштою. Вартість доставки — за тарифами перевізника, її сплачуєте при отриманні посилки."
      aside={
        <BannerStats
          items={[
            { value: "1–3", label: "дні доставки" },
            { value: "3", label: "способи доставки" },
            { value: "24/7", label: "приймаємо замовлення" },
          ]}
        />
      }
    >
      {/* Вартість доставки */}
      <section className="flex flex-col gap-5 rounded-[24px] bg-[#ffd51f] p-6 sm:flex-row sm:items-center sm:p-8">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white text-[#082c45]">
          <Icon name="truck" className="h-8 w-8" />
        </span>
        <div className="flex-1">
          <p className="text-2xl font-black tracking-[-0.03em]">Доставка — за тарифами перевізника</p>
          <p className="mt-1 font-medium text-[#264e65]">
            Вартість залежить від ваги, розміру посилки та способу доставки. Її сплачуєте Новій пошті чи Укрпошті при
            отриманні — у суму замовлення вона не входить.
          </p>
        </div>
        <Link href="/catalog" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#082c45] px-6 py-3.5 text-sm font-extrabold text-white transition hover:bg-[#0b3a5a]">
          До каталогу <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </section>

      {/* Способи доставки */}
      <InfoCard id="delivery">
        <InfoTitle icon="truck" eyebrow="Доставка">Способи доставки</InfoTitle>
        <div className="mt-6 overflow-hidden rounded-[20px] border border-[#e3edf3]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f3f9fd] text-xs font-black uppercase tracking-[0.1em] text-[#527083]">
              <tr>
                <th scope="col" className="px-5 py-3.5">Спосіб</th>
                <th scope="col" className="hidden px-5 py-3.5 sm:table-cell">Строк</th>
                <th scope="col" className="px-5 py-3.5 text-right">Вартість</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3edf3]">
              {deliveryOptions.map((o) => {
                const [term, ...rest] = o.text.split(", ");
                return (
                  <tr key={o.id}>
                    <td className="px-5 py-4">
                      <span className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eef6fb] text-[#067eb7]">
                          <Icon name={deliveryIcon[o.id] ?? "truck"} className="h-5 w-5" />
                        </span>
                        <span>
                          <b className="block text-[15px]">{o.title}</b>
                          <span className="text-[#527083]">
                            <span className="sm:hidden">{term}, </span>
                            {rest.join(", ")}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden px-5 py-4 font-bold sm:table-cell">{term}</td>
                    <td className="px-5 py-4 text-right">
                      <b className="block text-[15px]">За тарифом</b>
                      <span className="text-xs text-[#8aa5b5]">при отриманні</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Callout tone="blue" icon="clock" title="Коли відправимо">
            Замовлення на сайті приймаємо <b>цілодобово</b>. Оплачені до 15:00 відправляємо того ж дня, пізніші —
            наступного. Коли посилку відправимо, статус замовлення зміниться на «Відправлене».
          </Callout>
          <Callout tone="blue" icon="package" title="Зберігання посилки">
            Посилка чекає у відділенні {PARCEL_STORAGE_DAYS} робочих днів. Огляньте її при отриманні — якщо упаковку
            чи товар пошкоджено, складіть акт з працівником пошти і напишіть нам.
          </Callout>
        </div>
      </InfoCard>

      {/* Оплата */}
      <InfoCard id="payment">
        <InfoTitle icon="card" eyebrow="Оплата">Способи оплати</InfoTitle>
        <div className={`mt-6 grid gap-4 ${paymentOptions.length > 2 ? "md:grid-cols-3" : paymentOptions.length > 1 ? "md:grid-cols-2" : ""}`}>
          {paymentOptions.map((o) => (
            <div key={o.id} className="rounded-[20px] border border-[#e3edf3] p-5">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ffd51f] text-[#082c45]">
                <Icon name={paymentIcon[o.id]} className="h-5 w-5" />
              </span>
              <b className="mt-4 block text-lg">{o.title}</b>
              <p className="mt-1 text-sm leading-relaxed text-[#527083]">{o.text}.</p>
              {o.minTotal ? (
                <p className="mt-3 inline-block rounded-full bg-[#eef6fb] px-3 py-1 text-xs font-bold text-[#067eb7]">
                  Від {formatPrice(o.minTotal)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-5 flex items-start gap-2.5 text-sm text-[#527083]">
          <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-[#067eb7]" />
          Оплату карткою онлайн підключимо найближчим часом. Поки що — оплата на рахунок.
        </p>
        <div className="mt-6">
          <Steps
            items={[
              { title: "Оформіть замовлення", text: "Менеджер перевірить наявність і підтвердить замовлення." },
              { title: "Товар бронюється за вами", text: `Після підтвердження надішлемо реквізити на email; вони є і на сторінці замовлення. Товар чекає на вас ${PAYMENT_DAYS} дні.` },
              { title: "Оплатіть на рахунок", text: "З банківського застосунку чи у відділенні банку. У призначенні платежу вкажіть номер замовлення." },
              { title: "Відправляємо", text: "Щойно оплата надійде, статус зміниться на «Оплачено», а потім — «Відправлено»." },
            ]}
          />
        </div>
      </InfoCard>

      {/* Як отримати */}
      <InfoCard>
        <InfoTitle icon="package">Як оформити й отримати замовлення</InfoTitle>
        <Steps
          items={[
            { title: "Додайте товари в кошик", text: "Сума замовлення — це вартість товарів; доставку оплачуєте перевізнику при отриманні." },
            { title: "Заповніть дані", text: "Реєстрація не обов’язкова. З акаунтом місто й відділення запам’ятовуються для наступних замовлень." },
            { title: "Оплатіть на рахунок", text: `Після підтвердження замовлення — протягом ${PAYMENT_DAYS} днів, реквізити надішлемо на email.` },
            { title: "Отримайте посилку", text: "Статус замовлення — у профілі або на сторінці «Де моє замовлення?». Огляньте товар у відділенні." },
          ]}
        />
      </InfoCard>

      <InfoCard>
        <InfoTitle icon="chat">Часті питання</InfoTitle>
        <Faq
          items={[
            { q: "Чи можна забрати замовлення самостійно?", a: "Ні, ми онлайн-магазин без пункту видачі. Найшвидше — Нова пошта: поштомати працюють цілодобово." },
            { q: "Скільки коштує доставка?", a: "За тарифами Нової пошти чи Укрпошти — залежно від ваги, розміру й способу доставки. Розрахувати точну суму можна в калькуляторі на сайті перевізника. Оплачуєте її при отриманні посилки." },
            { q: "Що буде, якщо не встигну оплатити?", a: `Замовлення автоматично скасується через ${PAYMENT_DAYS} дні після підтвердження, а товар повернеться в продаж. Якщо потрібно більше часу — напишіть нам.` },
            { q: "Чи можна оплатити при отриманні?", a: "Ні, накладеним платежем ми не відправляємо: посилку відправляємо після оплати на рахунок." },
            { q: "Доставляєте за кордон?", a: "Поки що лише по Україні. Слідкуйте за новинами в наших соцмережах." },
          ]}
        />
      </InfoCard>
    </InfoLayout>
  );
}
