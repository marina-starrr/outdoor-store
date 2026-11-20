import type { Metadata } from "next";
import AdminSuppliers from "../../components/admin/AdminSuppliers";

export const metadata: Metadata = { title: "Постачальники" };

export default function Page() {
  return <AdminSuppliers />;
}
