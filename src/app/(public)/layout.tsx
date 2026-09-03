import { PublicHeader } from "@/components/public/public-header";
import { Footer } from "@/components/footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</main>
      <Footer />
    </div>
  );
}
