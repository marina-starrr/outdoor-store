import type { Metadata } from "next";
import Link from "next/link";
import Icon, { type IconName } from "../components/Icon";
import InfoLayout from "../components/InfoLayout";
import { BannerStats, Callout, Faq, InfoCard, InfoTitle, Steps } from "../components/info-ui";
import {
  FREE_SHIPPING_FROM,
  PARCEL_STORAGE_DAYS,
  deliveryOptions,
  paymentOptions,
  type PaymentId,
} from "../components/cart-logic";
import { formatPrice } from "../components/catalog-data";

export const metadata: Metadata = {
  alternates: { canonical: "/delivery" },
  title: "Доставка і оплата",
  description: `Доставка Новою поштою та Укрпоштою по всій Україні, безкоштовно від ${formatPrice(FREE_SHIPPING_FROM)}. Оплата карткою, накладеним платежем або частинами.`,
};

const minPrice = Math.min(...deliveryOptions.map((o) => o.price));

const deliveryIcon: Record<string, IconName> = { "np-branch": "package", "np-courier": "truck", ukrposhta: "mail" };
const paymentIcon: Record<PaymentId, IconName> = { card: "card", cod: "package", parts: "clock" };

export default function DeliveryPage() {
  return (
    <InfoLayout
      eyebrow="Покупцям"
      icon="truck"
      title="Доставка"
      accent="і оплата"
      lead={`Відправляємо щодня по всій Україні. Замовлення від ${formatPrice(FREE_SHIPPING_FROM)} у відділення чи поштомат доставляємо безкоштовно.`}
      aside={
        <BannerStats
          items={[
            { value: "1–3", label: "дні доставки" },
            { value: `${minPrice} ₴`, label: "мін. вартість" },
            { value: "24/7", label: "приймаємо замовлення" },
          ]}
        />
      }
    >
      {/* Безкоштовна доставка */}
      <section className="flex flex-col gap-5 rounded-[24px] bg-[#ffd51f] p-6 sm:flex-row sm:items-center sm:p-8">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white text-[#082c45]">
          <Icon name="truck" className="h-8 w-8" />
        </span>
        <div className="flex-1">
          <p className="text-2xl font-black tracking-[-0.03em]">Безкоштовна доставка від {formatPrice(FREE_SHIPPING_FROM)}</p>
          <p className="mt-1 font-medium text-[#264e65]">
            Діє для відділень і поштоматів Нової пошти та для Укрпошти. Сума рахується після всіх знижок на товари.
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
                      <b className="block text-[15px]">{formatPrice(o.price)}</b>
                      {o.freeAbove ? (
                        <span className="text-xs font-bold text-[#1f9d55]">0 ₴ від {formatPrice(FREE_SHIPPING_FROM)}</span>
                      ) : (
                        <span className="text-xs text-[#8aa5b5]">за будь-якої суми</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Callout tone="blue" icon="clock" title="Коли відправимо">
            Замовлення приймаємо й опрацьовуємо <b>цілодобово</b>. Оформлені до 15:00 відправляємо того ж дня, пізніші —
            наступного. Номер ТТН надішлемо в SMS.
          </Callout>
          <Callout tone="blue" icon="package" title="Зберігання посилки">
            Посилка чекає у відділенні {PARCEL_STORAGE_DAYS} робочих днів. Огляньте товар перед оплатою — якщо щось не так,
            просто відмовтеся від отримання.
          </Callout>
        </div>
      </InfoCard>

      {/* Оплата */}
      <InfoCard id="payment">
        <InfoTitle icon="card" eyebrow="Оплата">Способи оплати</InfoTitle>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
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
          Онлайн-оплата проходить на захищеній сторінці платіжного сервісу — дані картки ми не бачимо й не зберігаємо.
          Фіскальний чек надсилаємо на email або в SMS.
        </p>
      </InfoCard>

      {/* Як отримати */}
      <InfoCard>
        <InfoTitle icon="package">Як оформити й отримати замовлення</InfoTitle>
        <Steps
          items={[
            { title: "Додайте товари в кошик", text: "Ціна доставки й прогрес до безкоштовної доставки видно одразу в кошику." },
            { title: "Увійдіть і заповніть дані", text: "Місто, відділення чи адреса запам’ятовуються в профілі для наступних замовлень." },
            { title: "Оберіть оплату", text: "Карткою онлайн, при отриманні або частинами — як зручніше." },
            { title: "Отримайте посилку", text: "SMS із номером ТТН прийде в день відправлення. Огляньте товар у відділенні." },
          ]}
        />
      </InfoCard>

      <InfoCard>
        <InfoTitle icon="chat">Часті питання</InfoTitle>
        <Faq
          items={[
            { q: "Чи можна забрати замовлення самостійно?", a: "Ні, ми онлайн-магазин без пункту видачі. Найшвидше — Нова пошта: поштомати працюють цілодобово." },
            { q: "Чому кур’єрська доставка платна навіть від 3 000 ₴?", a: `Безкоштовна доставка діє для відділень і поштоматів. Адресна доставка Новою поштою коштує ${formatPrice(deliveryOptions.find((o) => o.id === "np-courier")?.price ?? 0)} за будь-якої суми замовлення.` },
            { q: "Хто платить комісію за накладений платіж?", a: "Комісію за грошовий переказ стягує перевізник за своїми тарифами. Щоб її уникнути, оплатіть замовлення карткою онлайн." },
            { q: "Доставляєте за кордон?", a: "Поки що лише по Україні. Слідкуйте за новинами в наших соцмережах." },
          ]}
        />
      </InfoCard>
    </InfoLayout>
  );
}
