"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { translations, Language } from "@/lib/translations";
import { apiFetch } from "@/lib/api";

interface LanguageContextType {
  language: Language;
  direction: "ltr" | "rtl";
  t: (key: keyof typeof translations.en) => string;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  direction: "ltr",
  t: (key) => translations.en[key] || key,
  setLanguage: () => {},
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    // Check saved preference in localStorage
    const saved = localStorage.getItem("mizan_language") as Language;
    if (saved === "en" || saved === "ar") {
      setLanguageState(saved);
      document.documentElement.dir = saved === "ar" ? "rtl" : "ltr";
      document.documentElement.lang = saved;
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("mizan_language", lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;

    // Async sync with backend profile if authenticated
    apiFetch("/auth/language", {
      method: "PUT",
      body: JSON.stringify({ language: lang }),
    }).catch(() => {
      // Ignored if user not logged in
    });
  };

  const t = (key: keyof typeof translations.en): string => {
    return translations[language][key] || translations.en[key] || key;
  };

  const direction = language === "ar" ? "rtl" : "ltr";

  return (
    <LanguageContext.Provider value={{ language, direction, t, setLanguage }}>
      <div dir={direction} className={language === "ar" ? "font-arabic" : ""}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
