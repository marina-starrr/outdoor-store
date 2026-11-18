import type { Metadata } from "next";
import { notFound } from "next/navigation";
import InfoLayout from "../components/InfoLayout";
import OfferContent from "../components/OfferContent";
import { SELLER, sellerTitle } from "../lib/seller";

export const metadata: Metadata = {
  alternates: { canonical: "/offer" },
  title: "Публічна оферта",
  description: "Договір публічної оферти інтернет-магазину Family Camping: оформлення замовлення, оплата, доставка, повернення, реквізити продавця.",
};

/** Дата поточної редакції — змінюйте разом з текстом оферти */
const UPDATED = "18 листопада 2026";

export default function OfferPage() {
  // Без реквізитів продавця оферта неповна — сторінки поки немає (див. app/lib/seller.ts)
  if (!SELLER) notFound();
  return (
    <InfoLayout
      eyebrow="Юридична інформація"
      icon="shield"
      title="Публічна"
      accent="оферта"
      lead={`Договір купівлі-продажу товарів дистанційним способом між ${sellerTitle(SELLER)} і покупцем. Оформлюючи замовлення, ви погоджуєтесь з цими умовами.`}
      updated={UPDATED}
    >
      <OfferContent seller={SELLER} />
    </InfoLayout>
  );
}
