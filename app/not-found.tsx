import type { Metadata } from "next";
import NotFoundView from "./components/NotFoundView";

export const metadata: Metadata = {
  title: "Сторінку не знайдено",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <NotFoundView />;
}
