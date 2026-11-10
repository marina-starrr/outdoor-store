import type { Metadata } from "next";
import AccountPage from "../components/AccountPage";

export const metadata: Metadata = {
  title: "Мій профіль — Family Camping",
  robots: { index: false },
};

export default function Account() {
  return <AccountPage />;
}
