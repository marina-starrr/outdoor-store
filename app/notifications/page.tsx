import type { Metadata } from "next";
import { NOINDEX } from "../lib/site";
import NotificationsPage from "../components/NotificationsPage";

export const metadata: Metadata = {
  alternates: { canonical: "/notifications" },
  robots: NOINDEX,
  title: "Сповіщення",
};

export default function Notifications() {
  return <NotificationsPage />;
}
