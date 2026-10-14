"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Truck,
  Users,
  Building2,
  Settings,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { t } = useLanguage();

  const navItems = [
    { href: "/", label: t("navDashboard"), icon: LayoutDashboard },
    { href: "/stock", label: t("navStock"), icon: Boxes },
    { href: "/sales", label: t("navSales"), icon: ShoppingCart },
    { href: "/purchases", label: t("navPurchases"), icon: Truck },
    { href: "/customers", label: t("navCustomers"), icon: Users },
    { href: "/suppliers", label: t("navSuppliers"), icon: Building2 },
    { href: "/settings", label: t("navSettings"), icon: Settings },
  ];

  return (
    <aside className="w-64 border-e border-slate-200 bg-white min-h-[calc(100vh-4rem)] p-4 flex flex-col justify-between shrink-0">
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                isActive
                  ? "bg-sky-50 text-sky-700 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 ${
                  isActive ? "text-sky-600" : "text-slate-400 group-hover:text-slate-600"
                }`}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-slate-100 text-xs text-slate-400 text-center">
        <span>Mizan v1.0 • MAD Currency</span>
      </div>
    </aside>
  );
};
