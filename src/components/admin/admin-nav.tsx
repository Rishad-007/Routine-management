"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  LayoutDashboard,
  Database,
  CalendarRange,
  SlidersHorizontal,
  UserCheck,
  UserPlus,
  UserX,
  BarChart3,
  Globe,
  ChevronDown,
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/admin/actions";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
}

const MANAGE_ITEMS: NavItem[] = [
  { href: "/admin/master-data", label: "Update Database", icon: Database },
  { href: "/admin/routine", label: "Update Routine", icon: CalendarRange },
  { href: "/admin/assign", label: "Assign Classes", icon: UserPlus },
  { href: "/admin/free-teachers", label: "Free Teachers", icon: UserCheck },
  { href: "/admin/adjust", label: "Adjust Routine", icon: SlidersHorizontal },
];

const REPORT_ITEMS: NavItem[] = [
  { href: "/admin/unavailable-teachers", label: "Absence Report", icon: UserX },
  { href: "/admin/adjustment-stats", label: "Adjustment Stats", icon: BarChart3 },
];

const PUBLIC_ITEMS: NavItem[] = [
  { href: "/routine", label: "Class Routine", icon: Globe, external: true },
  { href: "/teacher", label: "Teacher Routine", icon: Globe, external: true },
  { href: "/teachers", label: "Teachers", icon: Globe, external: true },
];

const DROPDOWN_ITEM_GLYPH = "h-4 w-4 text-slate-400";

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function NavDropdown({
  label,
  items,
  active,
  teal = false,
  alignEnd = false,
}: {
  label: string;
  items: NavItem[];
  active: boolean;
  teal?: boolean;
  alignEnd?: boolean;
}) {
  const triggerId = `nav-dropdown-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={triggerId}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none",
          active
            ? teal
              ? "bg-teal-700 text-white"
              : "bg-[#1e3a5f] text-white"
            : teal
              ? "text-teal-700 hover:bg-teal-50"
              : "text-slate-600 hover:bg-slate-100",
        )}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={alignEnd ? "end" : "start"} className="w-60 p-1.5">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.href}
            render={
              <Link
                href={item.href}
                {...(item.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
              />
            }
            className="cursor-pointer gap-2"
          >
            <item.icon className={DROPDOWN_ITEM_GLYPH} />
            <span className="w-full">{item.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminNav() {
  const pathname = usePathname();

  const manageActive = MANAGE_ITEMS.some((i) => isActive(pathname, i.href));
  const reportsActive = REPORT_ITEMS.some((i) => isActive(pathname, i.href));

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

        <nav className="hidden items-center gap-0.5 md:flex">
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === "/admin"
                ? "bg-[#1e3a5f] text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>

          <NavDropdown
            label="Manage"
            items={MANAGE_ITEMS}
            active={manageActive}
          />
          <NavDropdown
            label="Reports"
            items={REPORT_ITEMS}
            active={reportsActive}
            alignEnd
          />
          <NavDropdown
            label="Public"
            items={PUBLIC_ITEMS}
            active={false}
            teal
            alignEnd
          />
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
      <nav className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
        <Link
          href="/admin"
          className={cn(
            "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
            pathname === "/admin"
              ? "bg-[#1e3a5f] text-white"
              : "bg-slate-100 text-slate-600",
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>
        {[...MANAGE_ITEMS, ...REPORT_ITEMS].map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
                active
                  ? "bg-[#1e3a5f] text-white"
                  : "bg-slate-100 text-slate-600",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        {PUBLIC_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 whitespace-nowrap rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}