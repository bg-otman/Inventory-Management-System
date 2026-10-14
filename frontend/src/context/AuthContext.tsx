"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useLanguage } from "./LanguageContext";

export interface User {
  id: number;
  username: string;
  email?: string;
  full_name: string;
  role: "owner" | "employee";
  language: "en" | "ar";
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { setLanguage } = useLanguage();

  const refreshUser = async () => {
    try {
      const data = await apiFetch<User>("/auth/me");
      setUser(data);
      if (data.language && (data.language === "en" || data.language === "ar")) {
        setLanguage(data.language);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (username: string, password: string) => {
    const data = await apiFetch<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setUser(data);
    if (data.language) {
      setLanguage(data.language);
    }
  };

  const logout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
