import type { Metadata } from "next";
import AdminReviews from "../../components/admin/AdminReviews";

export const metadata: Metadata = { title: "Відгуки" };

export default function Page() {
  return <AdminReviews />;
}
