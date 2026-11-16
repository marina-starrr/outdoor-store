import type { Metadata } from "next";
import TrackOrderPage from "../../components/TrackOrderPage";
import { NOINDEX } from "../../lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/orders/track" },
  robots: NOINDEX,
  title: "Де моє замовлення?",
  description: "Статус замовлення Family Camping за номером і телефоном — без входу в акаунт.",
};

export default function TrackOrder() {
  return <TrackOrderPage />;
}
