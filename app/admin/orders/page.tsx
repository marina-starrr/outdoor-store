import type { Metadata } from "next";
import AdminOrders from "../../components/admin/AdminOrders";

export const metadata: Metadata = { title: "Замовлення" };

export default function Page() {
  return <AdminOrders />;
}
