"use client";

import React from "react";
import { Scale, Globe, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "ar" : "en");
  };

  return (
    <header className="h-16 border-b border-slate-200 bg-white sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 shadow-xs">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-sky-200">
          <Scale className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-slate-900 tracking-tight">
              Mizan
            </span>
            <span className="text-sm font-semibold text-sky-600">
              ميزان
            </span>
          </div>
          <p className="text-xs text-slate-500 hidden sm:block">
            {t("appSubtitle")}
          </p>
        </div>
      </div>

      {/* Actions & Profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Language switch button */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 text-slate-700 text-sm font-medium transition-all"
          title="Switch language / تغيير اللغة"
        >
          <Globe className="w-4 h-4 text-sky-600" />
          <span>{language === "en" ? "العربية (AR)" : "English (EN)"}</span>
        </button>

        {user && (
          <div className="flex items-center gap-3 border-s border-slate-200 ps-3 sm:ps-4">
            <div className="text-end hidden sm:block">
              <div className="text-sm font-semibold text-slate-800">
                {user.full_name}
              </div>
              <div className="flex items-center justify-end gap-1 text-xs">
                {user.role === "owner" ? (
                  <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                    <Shield className="w-3 h-3 text-amber-600" />
                    {t("roleOwner")}
                  </span>
                ) : (
                  <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                    {t("roleEmployee")}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => logout()}
              className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title={t("navLogout")}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
