"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, CalendarDays, Users, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/routine", label: "Class Routine", icon: CalendarDays },
  { href: "/teacher", label: "Teacher Routine", icon: CalendarDays },
  { href: "/teachers", label: "Teachers", icon: Users },
];

export function PublicHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1e3a5f] text-white">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-[#1e3a5f] md:text-base">
              Cantonment Public School
            </p>
            <p className="hidden text-xs text-slate-500 md:block">&amp; College, Rangpur</p>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#1e3a5f] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <l.icon className="h-4 w-4" />
                <span className="hidden md:inline">{l.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
