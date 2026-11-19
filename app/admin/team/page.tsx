import type { Metadata } from "next";
import AdminTeam from "../../components/admin/AdminTeam";

export const metadata: Metadata = { title: "Адміністратори" };

export default function Page() {
  return <AdminTeam />;
}
