import type { Metadata } from "next";
import { NOINDEX } from "../lib/site";
import AccountPage from "../components/AccountPage";

export const metadata: Metadata = {
  alternates: { canonical: "/account" },
  robots: NOINDEX,
  title: "Мій профіль",
};

export default function Account() {
  return <AccountPage />;
}
