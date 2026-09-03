import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";
import { Footer } from "@/components/footer";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <AdminNav />
      <main className="px-4 py-6 md:px-8">{children}</main>
      <Footer />
    </div>
  );
}
