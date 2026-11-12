import type { Metadata } from "next";
import AdminProducts from "../../components/admin/AdminProducts";

export const metadata: Metadata = { title: "Товари" };

export default function Page() {
  return <AdminProducts />;
}
