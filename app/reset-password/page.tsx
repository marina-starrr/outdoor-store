import type { Metadata } from "next";
import ResetPasswordPage from "../components/ResetPasswordPage";
import { NOINDEX } from "../lib/site";

export const metadata: Metadata = {
  robots: { ...NOINDEX, follow: false },
  title: "Новий пароль",
};

export default function ResetPassword() {
  return <ResetPasswordPage />;
}
