"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale, Globe, Lock, User, ArrowRight, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { language, setLanguage, t, direction } = useLanguage();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
      router.push("/");
    } catch (err: any) {
      setError(err.message || t("loginError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillCredentials = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Top language toggle */}
      <div className="absolute top-6 end-6">
        <button
          onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm backdrop-blur-sm border border-white/10 transition-all"
        >
          <Globe className="w-4 h-4 text-sky-400" />
          <span>{language === "en" ? "العربية" : "English"}</span>
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 items-center justify-center text-white shadow-xl shadow-sky-500/20 mb-4">
          <Scale className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">
          {t("appName")} — ميزان
        </h2>
        <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto">
          {t("appSubtitle")}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white/95 backdrop-blur-md py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-white/20">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium animate-in fade-in duration-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {t("username")}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {t("password")}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl shadow-md bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-semibold text-sm transition-all focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50"
            >
              <span>{isSubmitting ? t("loggingIn") : t("loginButton")}</span>
              {direction === "rtl" ? (
                <ArrowLeft className="w-4 h-4" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
            </button>
          </form>

          {/* Quick demo sign in buttons */}
          <div className="mt-6 pt-6 border-t border-slate-100 space-y-2">
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">
              Quick Demo Access
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fillCredentials("admin", "admin123")}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-200 text-slate-700 transition-colors"
              >
                Owner: <span className="font-semibold text-sky-700">admin</span>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials("employee", "employee123")}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-200 text-slate-700 transition-colors"
              >
                Employee: <span className="font-semibold text-sky-700">employee</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
