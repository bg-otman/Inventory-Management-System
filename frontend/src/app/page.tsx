"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Users,
  Building2,
  AlertTriangle,
  ArrowUpRight,
  PlusCircle,
  Package,
  CreditCard,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

interface LowStockAlert {
  product_id: number;
  product_name: string;
  warehouse_id: number;
  warehouse_name: string;
  current_stock: number;
  threshold: number;
  unit: string;
}

interface Activity {
  id: number;
  user_name?: string;
  action: string;
  entity_type: string;
  entity_id?: number;
  details?: string;
  created_at: string;
}

interface DashboardStats {
  sales_today_amount: number;
  sales_today_count: number;
  customers_owe_us: number;
  we_owe_suppliers: number;
  low_stock_count: number;
  low_stock_alerts: LowStockAlert[];
  recent_activities: Activity[];
}

export default function DashboardPage() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const fetchStats = async () => {
    try {
      const data = await apiFetch<DashboardStats>("/dashboard/stats");
      setStats(data);
    } catch (err) {
      console.error("Failed to load dashboard stats", err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {t("navDashboard")}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {t("tagline")}
            </p>
          </div>

          {/* Quick Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/sales?action=new"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold shadow-xs transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t("newSale")}</span>
            </Link>
            <Link
              href="/purchases?action=new"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-xs transition-all"
            >
              <Package className="w-4 h-4" />
              <span>{t("newPurchase")}</span>
            </Link>
            <Link
              href="/customers?action=payment"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold shadow-xs transition-all"
            >
              <CreditCard className="w-4 h-4" />
              <span>{t("recordPayment")}</span>
            </Link>
          </div>
        </div>

        {/* 4 Main KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Sales Today */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                {t("kpiSalesToday")}
              </span>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900">
                {Number(stats?.sales_today_amount || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-sm font-semibold text-slate-400">MAD</span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <span className="font-semibold text-emerald-600">
                  {stats?.sales_today_count || 0}
                </span>{" "}
                {t("ordersCount")}
              </div>
            </div>
          </div>

          {/* 2. Customers Owe Us */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                {t("kpiCustomersOweUs")}
              </span>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900">
                {Number(stats?.customers_owe_us || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-sm font-semibold text-slate-400">MAD</span>
              </div>
              <Link
                href="/customers"
                className="text-xs text-sky-600 hover:text-sky-700 font-medium mt-1 inline-flex items-center gap-1"
              >
                <span>{t("customerDirectory")}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* 3. We Owe Suppliers */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                {t("kpiWeOweSuppliers")}
              </span>
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900">
                {Number(stats?.we_owe_suppliers || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-sm font-semibold text-slate-400">MAD</span>
              </div>
              <Link
                href="/suppliers"
                className="text-xs text-sky-600 hover:text-sky-700 font-medium mt-1 inline-flex items-center gap-1"
              >
                <span>{t("supplierDirectory")}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* 4. Low Stock Alerts */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                {t("kpiLowStockAlerts")}
              </span>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  (stats?.low_stock_count || 0) > 0
                    ? "bg-rose-100 text-rose-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900">
                {stats?.low_stock_count || 0}{" "}
                <span className="text-sm font-semibold text-slate-400">items</span>
              </div>
              <Link
                href="/stock?tab=alerts"
                className="text-xs text-rose-600 hover:text-rose-700 font-medium mt-1 inline-flex items-center gap-1"
              >
                <span>{t("lowStockList")}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Two Column Layout: Low Stock Items & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Low Stock Alerts */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {t("lowStockList")}
              </h2>
              <Link
                href="/stock"
                className="text-xs font-semibold text-sky-600 hover:text-sky-700"
              >
                {t("navStock")} →
              </Link>
            </div>

            {(!stats?.low_stock_alerts || stats.low_stock_alerts.length === 0) ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                <span>All stock levels are optimal. No active alerts.</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.low_stock_alerts.map((alert, idx) => (
                  <div
                    key={`${alert.product_id}-${alert.warehouse_id}-${idx}`}
                    className="py-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-sm text-slate-900">
                        {alert.product_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {alert.warehouse_name} • {t("lowStockThreshold")}: {alert.threshold} {alert.unit}
                      </div>
                    </div>
                    <div className="text-end">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100">
                        {alert.current_stock} {alert.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" />
                {t("recentActivity")}
              </h2>
            </div>

            {(!stats?.recent_activities || stats.recent_activities.length === 0) ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                <span>{t("noData")}</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.recent_activities.map((act) => (
                  <div key={act.id} className="py-3 flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-sky-500 mt-2 shrink-0" />
                    <div className="flex-1">
                      <div className="text-slate-800 font-medium">
                        {act.details || `${act.action} ${act.entity_type}`}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {act.user_name || "System"} •{" "}
                        {new Date(act.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
