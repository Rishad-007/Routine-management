"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  LayoutDashboard,
  Database,
  CalendarRange,
  SlidersHorizontal,
  Globe,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/admin/actions";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/master-data", label: "Update Database", icon: Database },
  { href: "/admin/routine", label: "Update Routine", icon: CalendarRange },
  { href: "/admin/adjust", label: "Adjust Routine", icon: SlidersHorizontal },
];

const VIEW_ITEMS = [
  { href: "/routine", label: "Class Routine", icon: Globe },
  { href: "/teacher", label: "Teacher Routine", icon: Globe },
  { href: "/teachers", label: "Teachers", icon: Globe },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1e3a5f] text-white">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-[#1e3a5f]">
              Routine Admin
            </p>
            <p className="text-xs text-slate-500">CPS &amp; College, Rangpur</p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#1e3a5f] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <span className="mx-2 h-5 w-px bg-slate-200" />
          {VIEW_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </form>
      </div>

      {/* Mobile nav */}
      <nav className="flex overflow-x-auto gap-1 px-4 pb-3 md:hidden">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
                active
                  ? "bg-[#1e3a5f] text-white"
                  : "bg-slate-100 text-slate-600"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        {VIEW_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium bg-teal-50 text-teal-700"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
