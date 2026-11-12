import type { Metadata } from "next";
import AdminMessages from "../../components/admin/AdminMessages";

export const metadata: Metadata = { title: "Звернення" };

export default function Page() {
  return <AdminMessages />;
}
