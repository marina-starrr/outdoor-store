import type { Metadata } from "next";
import { Suspense } from "react";
import AdminChats from "../../components/admin/AdminChats";

export const metadata: Metadata = { title: "Чат з покупцями" };

export default function Page() {
  // Обрана розмова — у параметрі адреси (?id=…), тож потрібна межа Suspense
  return (
    <Suspense fallback={null}>
      <AdminChats />
    </Suspense>
  );
}
