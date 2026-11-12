import type { Metadata } from "next";
import { NOINDEX } from "../lib/site";

export const metadata: Metadata = {
  title: { default: "Адмін-панель", template: "%s — Адмін-панель" },
  robots: { ...NOINDEX, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
