import type { Metadata } from "next";
import AdminDashboard from "../components/admin/AdminDashboard";

export const metadata: Metadata = { title: "Огляд" };

export default function Page() {
  return <AdminDashboard />;
}
