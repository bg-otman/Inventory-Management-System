"use client";

import React, { useEffect, useState } from "react";
import {
  Building,
  Users,
  Database,
  Warehouse as WarehouseIcon,
  Plus,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Lock,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

interface CompanySettings {
  company_name: string;
  company_name_ar: string;
  address?: string;
  phone?: string;
  email?: string;
  ice_number?: string;
  tax_identifier?: string;
  default_tax_rate: number;
  currency: string;
}

interface Warehouse {
  id: number;
  name: string;
  code?: string;
  address?: string;
}

interface UserAccount {
  id: number;
  username: string;
  email?: string;
  full_name: string;
  role: "owner" | "employee";
  language: string;
  is_active: boolean;
}

interface BackupRecord {
  id: number;
  filename: string;
  size_bytes: number;
  status: string;
  backup_type: string;
  error_message?: string;
  created_at: string;
}

interface BackupStatus {
  last_successful_backup?: string;
  next_scheduled_run?: string;
  backup_schedule: string;
  has_recent_failure: boolean;
  last_failure_message?: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const isOwner = user?.role === "owner";

  const [activeTab, setActiveTab] = useState<"company" | "warehouses" | "users" | "backups">("company");

  // Company settings state
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Warehouses state
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isAddWhOpen, setIsAddWhOpen] = useState(false);
  const [whName, setWhName] = useState("");
  const [whCode, setWhCode] = useState("");
  const [whAddress, setWhAddress] = useState("");

  // Users state
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"owner" | "employee">("employee");
  const [newLang, setNewLang] = useState("en");
  const [userError, setUserError] = useState<string | null>(null);

  // Backups state
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<BackupRecord | null>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const loadSettingsData = async () => {
    try {
      const [st, whs] = await Promise.all([
        apiFetch<CompanySettings>("/settings"),
        apiFetch<Warehouse[]>("/warehouses"),
      ]);
      setSettings(st);
      setWarehouses(whs);

      if (isOwner) {
        const [usrList, bList, bStatus] = await Promise.all([
          apiFetch<UserAccount[]>("/users"),
          apiFetch<BackupRecord[]>("/backups"),
          apiFetch<BackupStatus>("/backups/status"),
        ]);
        setUsers(usrList);
        setBackups(bList);
        setBackupStatus(bStatus);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, [isOwner]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      const updated = await apiFetch<CompanySettings>("/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(updated);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err: any) {
      alert("Failed to save settings: " + err.message);
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whName.trim()) return;
    try {
      await apiFetch("/warehouses", {
        method: "POST",
        body: JSON.stringify({
          name: whName.trim(),
          code: whCode.trim() || null,
          address: whAddress.trim() || null,
        }),
      });
      setWhName("");
      setWhCode("");
      setWhAddress("");
      setIsAddWhOpen(false);
      loadSettingsData();
    } catch (err: any) {
      alert("Failed to create warehouse: " + err.message);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(null);
    if (!newUsername.trim() || !newPassword.trim() || !newFullName.trim()) {
      setUserError("Username, full name, and password are required");
      return;
    }
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword.trim(),
          full_name: newFullName.trim(),
          role: newRole,
          language: newLang,
        }),
      });
      setNewUsername("");
      setNewPassword("");
      setNewFullName("");
      setIsAddUserOpen(false);
      loadSettingsData();
    } catch (err: any) {
      setUserError(err.message || "Failed to create user");
    }
  };

  const handleBackupNow = async () => {
    setIsBackingUp(true);
    try {
      await apiFetch("/backups/now", { method: "POST" });
      loadSettingsData();
    } catch (err: any) {
      alert("Backup failed: " + err.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreCandidate || !restorePassword.trim()) return;

    setRestoreError(null);
    setIsRestoring(true);
    try {
      await apiFetch("/backups/restore", {
        method: "POST",
        body: JSON.stringify({
          backup_filename: restoreCandidate.filename,
          confirmation_password: restorePassword,
        }),
      });
      alert("Database restored successfully from snapshot! Application will reload.");
      window.location.reload();
    } catch (err: any) {
      setRestoreError(err.message || "Restoration failed");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {t("navSettings")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure company identity, warehouse locations, users, and automated backups.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 flex flex-wrap gap-6">
          <button
            onClick={() => setActiveTab("company")}
            className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === "company"
                ? "border-sky-600 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Building className="w-4 h-4" />
            <span>{t("companyDetails")}</span>
          </button>

          <button
            onClick={() => setActiveTab("warehouses")}
            className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === "warehouses"
                ? "border-sky-600 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <WarehouseIcon className="w-4 h-4" />
            <span>{t("warehouses")}</span>
          </button>

          {isOwner && (
            <>
              <button
                onClick={() => setActiveTab("users")}
                className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
                  activeTab === "users"
                    ? "border-sky-600 text-sky-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Users className="w-4 h-4" />
                <span>{t("userManagement")}</span>
              </button>

              <button
                onClick={() => setActiveTab("backups")}
                className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
                  activeTab === "backups"
                    ? "border-sky-600 text-sky-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Database className="w-4 h-4" />
                <span>Weekly Backups & Restore</span>
              </button>
            </>
          )}
        </div>

        {/* Tab 1: Company Details */}
        {activeTab === "company" && settings && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 max-w-2xl">
            <form onSubmit={handleSaveSettings} className="space-y-4">
              {settingsSaved && (
                <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm border border-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Company settings updated successfully!</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("companyName")}
                  </label>
                  <input
                    type="text"
                    disabled={!isOwner}
                    value={settings.company_name}
                    onChange={(e) =>
                      setSettings({ ...settings, company_name: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("companyNameAr")}
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    disabled={!isOwner}
                    value={settings.company_name_ar}
                    onChange={(e) =>
                      setSettings({ ...settings, company_name_ar: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50 font-arabic"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("iceNumber")} (Morocco ICE)
                  </label>
                  <input
                    type="text"
                    disabled={!isOwner}
                    value={settings.ice_number || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, ice_number: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("taxIdentifier")} (IF)
                  </label>
                  <input
                    type="text"
                    disabled={!isOwner}
                    value={settings.tax_identifier || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, tax_identifier: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("phone")}
                  </label>
                  <input
                    type="text"
                    disabled={!isOwner}
                    value={settings.phone || ""}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("email")}
                  </label>
                  <input
                    type="email"
                    disabled={!isOwner}
                    value={settings.email || ""}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("address")}
                </label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={settings.address || ""}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("defaultVatRate")}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    disabled={!isOwner}
                    value={settings.default_tax_rate}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        default_tax_rate: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("currency")}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={settings.currency}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 text-slate-500 font-bold"
                  />
                </div>
              </div>

              {isOwner && (
                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    className="px-6 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-xs"
                  >
                    {t("saveChanges")}
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {/* Tab 2: Warehouses */}
        {activeTab === "warehouses" && (
          <div className="space-y-4 max-w-3xl">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Warehouse storage locations</span>
              <button
                onClick={() => setIsAddWhOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                <span>Add Warehouse</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100">
              {warehouses.map((w) => (
                <div key={w.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-2">
                      <WarehouseIcon className="w-4 h-4 text-sky-600" />
                      {w.name}
                    </div>
                    {w.address && <div className="text-xs text-slate-500 mt-0.5">{w.address}</div>}
                  </div>
                  {w.code && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-mono font-semibold">
                      {w.code}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <Modal
              isOpen={isAddWhOpen}
              onClose={() => setIsAddWhOpen(false)}
              title="Add Warehouse Location"
              maxWidth="sm"
            >
              <form onSubmit={handleCreateWarehouse} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Warehouse Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    placeholder="e.g. Entrepôt Fès"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={whCode}
                    onChange={(e) => setWhCode(e.target.value)}
                    placeholder="WH-03"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Address (Optional)
                  </label>
                  <input
                    type="text"
                    value={whAddress}
                    onChange={(e) => setWhAddress(e.target.value)}
                    placeholder="Quartier Industriel..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddWhOpen(false)}
                    className="px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg"
                  >
                    Save Warehouse
                  </button>
                </div>
              </form>
            </Modal>
          </div>
        )}

        {/* Tab 3: Users (Owner only) */}
        {activeTab === "users" && isOwner && (
          <div className="space-y-4 max-w-3xl">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">System user accounts and access roles</span>
              <button
                onClick={() => setIsAddUserOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                <span>{t("addUser")}</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100">
              {users.map((u) => (
                <div key={u.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{u.full_name}</div>
                    <div className="text-xs text-slate-500">
                      @{u.username} • Language: {u.language.toUpperCase()}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      u.role === "owner"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                    }`}
                  >
                    {u.role === "owner" ? t("roleOwner") : t("roleEmployee")}
                  </span>
                </div>
              ))}
            </div>

            <Modal
              isOpen={isAddUserOpen}
              onClose={() => setIsAddUserOpen(false)}
              title={t("addUser")}
              maxWidth="sm"
            >
              <form onSubmit={handleCreateUser} className="space-y-4">
                {userError && (
                  <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs border border-rose-200">
                    {userError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="e.g. Youssef Alami"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("username")} *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="youssef"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("password")} *
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Role</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                    >
                      <option value="employee">{t("roleEmployee")}</option>
                      <option value="owner">{t("roleOwner")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Default Lang</label>
                    <select
                      value={newLang}
                      onChange={(e) => setNewLang(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                    >
                      <option value="en">English (EN)</option>
                      <option value="ar">العربية (AR)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddUserOpen(false)}
                    className="px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg"
                  >
                    Create User
                  </button>
                </div>
              </form>
            </Modal>
          </div>
        )}

        {/* Tab 4: Backups & Safe Restoration (Owner only) */}
        {activeTab === "backups" && isOwner && (
          <div className="space-y-6 max-w-4xl">
            {/* Status card */}
            <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Database className="w-5 h-5 text-sky-600" />
                    <span>{t("backupsHeading")}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {t("backupScheduleNotice")}
                  </p>
                </div>

                <button
                  onClick={handleBackupNow}
                  disabled={isBackingUp}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isBackingUp ? "animate-spin" : ""}`} />
                  <span>{isBackingUp ? "Backing up..." : t("backupNow")}</span>
                </button>
              </div>

              {backupStatus?.has_recent_failure && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Attention:</span> A recent scheduled backup failed:{" "}
                    {backupStatus.last_failure_message}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block">{t("lastBackup")}:</span>
                  <span className="font-semibold text-slate-700">
                    {backupStatus?.last_successful_backup
                      ? new Date(backupStatus.last_successful_backup).toLocaleString()
                      : "None recorded yet"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">{t("nextBackup")}:</span>
                  <span className="font-semibold text-slate-700">
                    {backupStatus?.next_scheduled_run || "Every Sunday at 02:00 UTC"}
                  </span>
                </div>
              </div>
            </div>

            {/* Backups Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 font-semibold text-xs text-slate-700">
                Recent Backup Snapshots
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                    <tr>
                      <th className="py-2.5 px-3 text-start">Timestamp</th>
                      <th className="py-2.5 px-3 text-start">Filename</th>
                      <th className="py-2.5 px-3 text-start">Type</th>
                      <th className="py-2.5 px-3 text-end">Size</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {backups.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No backups available. Click &quot;Back Up Now&quot; to create a snapshot.
                        </td>
                      </tr>
                    ) : (
                      backups.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3 text-slate-500">
                            {new Date(b.created_at).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                            {b.filename}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 capitalize">
                            {b.backup_type}
                          </td>
                          <td className="py-2.5 px-3 text-end font-mono">
                            {(b.size_bytes / 1024).toFixed(1)} KB
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full font-semibold ${
                                b.status === "success"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {b.status === "success" && (
                              <button
                                onClick={() => {
                                  setRestoreCandidate(b);
                                  setRestorePassword("");
                                  setRestoreError(null);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold inline-flex items-center gap-1 transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Restore</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal: Restore Confirmation */}
            <Modal
              isOpen={!!restoreCandidate}
              onClose={() => setRestoreCandidate(null)}
              title="Confirm Database Restoration"
              maxWidth="md"
            >
              <form onSubmit={handleRestoreSubmit} className="space-y-4">
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-950">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span>Important Restoration Notice</span>
                  </div>
                  <p>{t("restoreWarning")}</p>
                  <p className="font-mono text-slate-700 font-semibold">
                    Target Snapshot: {restoreCandidate?.filename}
                  </p>
                </div>

                {restoreError && (
                  <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs border border-rose-200">
                    {restoreError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("confirmPasswordToRestore")} *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute start-3 top-3" />
                    <input
                      type="password"
                      required
                      autoFocus
                      value={restorePassword}
                      onChange={(e) => setRestorePassword(e.target.value)}
                      placeholder="Your owner password..."
                      className="w-full ps-9 pe-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRestoreCandidate(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isRestoring}
                    className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-xl shadow-xs"
                  >
                    {isRestoring ? "Restoring..." : "Confirm & Restore Snapshot"}
                  </button>
                </div>
              </form>
            </Modal>
          </div>
        )}
      </div>
    </AppShell>
  );
}
