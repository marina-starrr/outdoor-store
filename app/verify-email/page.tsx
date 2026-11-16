import type { Metadata } from "next";
import VerifyEmailPage from "../components/VerifyEmailPage";
import { NOINDEX } from "../lib/site";

export const metadata: Metadata = {
  robots: { ...NOINDEX, follow: false },
  title: "Підтвердження email",
};

export default function VerifyEmail() {
  return <VerifyEmailPage />;
}
