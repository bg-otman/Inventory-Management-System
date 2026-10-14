"use client";

import React, { useEffect, useState } from "react";
import {
  Boxes,
  Plus,
  Search,
  ArrowRightLeft,
  Sliders,
  History,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

interface Category {
  id: number;
  name: string;
}

interface Warehouse {
  id: number;
  name: string;
  code?: string;
}

interface WarehouseStock {
  warehouse_id: number;
  warehouse_name: string;
  quantity: number;
}

interface Product {
  id: number;
  name: string;
  category_id: number;
  category?: Category;
  description?: string;
  sku?: string;
  barcode?: string;
  unit: string;
  default_price?: number;
  low_stock_threshold: number;
  total_stock: number;
  warehouse_stocks: WarehouseStock[];
  is_low_stock: boolean;
}

interface StockMovement {
  id: number;
  warehouse_name: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  balance_after?: number;
  reference_type: string;
  reason?: string;
  created_by_name?: string;
  created_at: string;
}

export default function StockPage() {
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<"products" | "movements">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isInlineCategoryOpen, setIsInlineCategoryOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  // Product Form state
  const [prodName, setProdName] = useState("");
  const [prodCategory, setProdCategory] = useState<number | "">("");
  const [prodDescription, setProdDescription] = useState("");
  const [prodSku, setProdSku] = useState("");
  const [prodBarcode, setProdBarcode] = useState("");
  const [prodUnit, setProdUnit] = useState("unit");
  const [prodPrice, setProdPrice] = useState("");
  const [prodThreshold, setProdThreshold] = useState("0");
  const [prodError, setProdError] = useState<string | null>(null);

  // Inline Category Form state
  const [newCatName, setNewCatName] = useState("");
  const [catError, setCatError] = useState<string | null>(null);

  // Adjustment Form state
  const [adjWarehouse, setAdjWarehouse] = useState<number | "">("");
  const [adjProduct, setAdjProduct] = useState<number | "">("");
  const [adjQty, setAdjQty] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjError, setAdjError] = useState<string | null>(null);

  // Transfer Form state
  const [transSource, setTransSource] = useState<number | "">("");
  const [transDest, setTransDest] = useState<number | "">("");
  const [transProduct, setTransProduct] = useState<number | "">("");
  const [transQty, setTransQty] = useState("");
  const [transNotes, setTransNotes] = useState("");
  const [transError, setTransError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cats, whs] = await Promise.all([
        apiFetch<Category[]>("/categories"),
        apiFetch<Warehouse[]>("/warehouses"),
      ]);
      setCategories(cats);
      setWarehouses(whs);
      await fetchProducts();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    let url = "/products?";
    if (search.trim()) url += `search=${encodeURIComponent(search.trim())}&`;
    if (selectedCategory) url += `category_id=${selectedCategory}&`;
    if (lowStockOnly) url += `low_stock_only=true&`;
    const prods = await apiFetch<Product[]>(url);
    setProducts(prods);
  };

  const fetchMovements = async () => {
    const data = await apiFetch<StockMovement[]>("/stock/movements");
    setMovements(data);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [search, selectedCategory, lowStockOnly]);

  useEffect(() => {
    if (activeTab === "movements") {
      fetchMovements();
    }
  }, [activeTab]);

  // Handle barcode quick scan
  const handleBarcodeSearch = async (code: string) => {
    if (!code.trim()) return;
    try {
      const match = await apiFetch<Product>(`/products/scan/${encodeURIComponent(code.trim())}`);
      setProducts([match]);
    } catch {
      alert("Product not found with code: " + code);
    }
  };

  // Submit Product Creation
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProdError(null);
    if (!prodName.trim() || !prodCategory) {
      setProdError("Product name and category are required");
      return;
    }

    try {
      await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify({
          name: prodName.trim(),
          category_id: Number(prodCategory),
          description: prodDescription.trim() || null,
          sku: prodSku.trim() || null,
          barcode: prodBarcode.trim() || null,
          unit: prodUnit.trim() || "unit",
          default_price: prodPrice ? Number(prodPrice) : null,
          low_stock_threshold: Number(prodThreshold || 0),
        }),
      });

      // Reset and close
      setProdName("");
      setProdCategory("");
      setProdDescription("");
      setProdSku("");
      setProdBarcode("");
      setProdUnit("unit");
      setProdPrice("");
      setProdThreshold("0");
      setIsAddProductOpen(false);
      fetchProducts();
    } catch (err: any) {
      setProdError(err.message || "Failed to create product");
    }
  };

  // Inline Category Creation (Section 4 requirement: without losing form state)
  const handleCreateCategoryInline = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError(null);
    if (!newCatName.trim()) {
      setCatError("Category name cannot be empty");
      return;
    }

    try {
      const cat = await apiFetch<Category>("/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCatName.trim() }),
      });

      // Update categories list and select it automatically
      setCategories((prev) => {
        if (!prev.find((c) => c.id === cat.id)) {
          return [...prev, cat];
        }
        return prev;
      });
      setProdCategory(cat.id);
      setNewCatName("");
      setIsInlineCategoryOpen(false);
    } catch (err: any) {
      setCatError(err.message || "Failed to create category");
    }
  };

  // Stock Adjustment
  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjError(null);
    if (!adjWarehouse || !adjProduct || !adjQty || !adjReason.trim()) {
      setAdjError("All fields including adjustment reason are required");
      return;
    }

    try {
      await apiFetch("/stock/adjustments", {
        method: "POST",
        body: JSON.stringify({
          warehouse_id: Number(adjWarehouse),
          product_id: Number(adjProduct),
          quantity: Number(adjQty),
          reason: adjReason.trim(),
        }),
      });

      setAdjQty("");
      setAdjReason("");
      setIsAdjustmentOpen(false);
      fetchProducts();
      if (activeTab === "movements") fetchMovements();
    } catch (err: any) {
      setAdjError(err.message || "Adjustment failed");
    }
  };

  // Warehouse Transfer
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransError(null);
    if (!transSource || !transDest || !transProduct || !transQty) {
      setTransError("Please fill all required transfer fields");
      return;
    }
    if (transSource === transDest) {
      setTransError("Source and destination warehouses must be different");
      return;
    }

    try {
      await apiFetch("/warehouses/transfer", {
        method: "POST",
        body: JSON.stringify({
          source_warehouse_id: Number(transSource),
          dest_warehouse_id: Number(transDest),
          lines: [{ product_id: Number(transProduct), quantity: Number(transQty) }],
          notes: transNotes.trim() || null,
        }),
      });

      setTransQty("");
      setTransNotes("");
      setIsTransferOpen(false);
      fetchProducts();
      if (activeTab === "movements") fetchMovements();
    } catch (err: any) {
      setTransError(err.message || "Transfer failed");
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {t("navStock")}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage catalog, track inventory balances by warehouse, and monitor movements.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsAdjustmentOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-2xs transition-all"
            >
              <Sliders className="w-4 h-4 text-slate-500" />
              <span>{t("adjustStock")}</span>
            </button>
            <button
              onClick={() => setIsTransferOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-2xs transition-all"
            >
              <ArrowRightLeft className="w-4 h-4 text-slate-500" />
              <span>{t("transferStock")}</span>
            </button>
            <button
              onClick={() => setIsAddProductOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold shadow-xs transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{t("addProduct")}</span>
            </button>
          </div>
        </div>

        {/* Tabs: Products List vs Movements History */}
        <div className="border-b border-slate-200 flex gap-6">
          <button
            onClick={() => setActiveTab("products")}
            className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === "products"
                ? "border-sky-600 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Products & Stock</span>
          </button>
          <button
            onClick={() => setActiveTab("movements")}
            className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === "movements"
                ? "border-sky-600 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <History className="w-4 h-4" />
            <span>{t("stockMovements")}</span>
          </button>
        </div>

        {activeTab === "products" ? (
          <div className="space-y-4">
            {/* Filters bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex flex-1 w-full flex-col sm:flex-row items-center gap-3">
                {/* Search */}
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-3" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleBarcodeSearch(search);
                    }}
                    placeholder={t("searchProducts")}
                    className="w-full ps-10 pe-4 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all"
                  />
                </div>

                {/* Category filter */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full sm:w-48 py-2 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">{t("allCategories")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {/* Low stock toggle */}
                <button
                  onClick={() => setLowStockOnly(!lowStockOnly)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    lowStockOnly
                      ? "bg-rose-50 border-rose-200 text-rose-700"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{t("lowStockList")}</span>
                </button>
              </div>

              <div className="text-xs text-slate-500 font-medium">
                Showing {products.length} products
              </div>
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4 text-start">{t("productName")}</th>
                      <th className="py-3 px-4 text-start">{t("category")}</th>
                      <th className="py-3 px-4 text-start">{t("sku")} / {t("barcode")}</th>
                      <th className="py-3 px-4 text-start">{t("defaultPrice")}</th>
                      <th className="py-3 px-4 text-start">{t("warehouses")}</th>
                      <th className="py-3 px-4 text-end">{t("totalStock")}</th>
                      <th className="py-3 px-4 text-center">{t("stockStatus")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          {loading ? "Loading products..." : "No products found."}
                        </td>
                      </tr>
                    ) : (
                      products.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">{p.name}</div>
                            {p.description && (
                              <div className="text-xs text-slate-500 truncate max-w-xs">
                                {p.description}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                              {p.category?.name || "-"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-xs font-mono">
                            {p.sku && <div>SKU: {p.sku}</div>}
                            {p.barcode && <div>BAR: {p.barcode}</div>}
                            {!p.sku && !p.barcode && <span className="text-slate-300">-</span>}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-800">
                            {p.default_price ? `${Number(p.default_price).toFixed(2)} MAD` : "-"}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            {p.warehouse_stocks.length === 0 ? (
                              <span className="text-slate-400">0</span>
                            ) : (
                              <div className="space-y-0.5">
                                {p.warehouse_stocks.map((ws) => (
                                  <div key={ws.warehouse_id}>
                                    <span className="text-slate-500">{ws.warehouse_name}:</span>{" "}
                                    <span className="font-semibold text-slate-800">
                                      {ws.quantity} {p.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-end">
                            <span className="font-bold text-base text-slate-900">
                              {p.total_stock}
                            </span>{" "}
                            <span className="text-xs text-slate-500 font-medium">{p.unit}</span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {p.total_stock === 0 ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                                {t("outOfStock")}
                              </span>
                            ) : p.is_low_stock ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                {t("lowStock")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {t("inStock")}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* Stock Movements History */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4 text-start">Date & Time</th>
                    <th className="py-3 px-4 text-start">{t("productName")}</th>
                    <th className="py-3 px-4 text-start">{t("warehouse")}</th>
                    <th className="py-3 px-4 text-start">Type</th>
                    <th className="py-3 px-4 text-end">Quantity</th>
                    <th className="py-3 px-4 text-end">Balance After</th>
                    <th className="py-3 px-4 text-start">Reason / Reference</th>
                    <th className="py-3 px-4 text-start">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No stock movements recorded yet.
                      </td>
                    </tr>
                  ) : (
                    movements.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(m.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {m.product_name}
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-xs">
                          {m.warehouse_name}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full font-medium ${
                              m.movement_type === "receipt"
                                ? "bg-emerald-50 text-emerald-700"
                                : m.movement_type === "delivery"
                                ? "bg-sky-50 text-sky-700"
                                : m.movement_type.startsWith("transfer")
                                ? "bg-purple-50 text-purple-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {m.movement_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-end font-bold text-sm">
                          <span className={Number(m.quantity) > 0 ? "text-emerald-600" : "text-rose-600"}>
                            {Number(m.quantity) > 0 ? `+${m.quantity}` : m.quantity}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-end text-xs text-slate-600 font-semibold">
                          {m.balance_after ?? "-"}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                          {m.reason || `${m.reference_type} #${m.id}`}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">
                          {m.created_by_name || "System"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Add Product */}
        <Modal
          isOpen={isAddProductOpen}
          onClose={() => setIsAddProductOpen(false)}
          title={t("addProduct")}
          maxWidth="lg"
        >
          <form onSubmit={handleCreateProduct} className="space-y-4">
            {prodError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200">
                {prodError}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("productName")} *
              </label>
              <input
                type="text"
                required
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="e.g. Huile d'olive 5L"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Category with inline creation button */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-semibold text-slate-700">
                  {t("category")} *
                </label>
                <button
                  type="button"
                  onClick={() => setIsInlineCategoryOpen(true)}
                  className="text-xs font-semibold text-sky-600 hover:text-sky-700 underline"
                >
                  + {t("createCategory")}
                </button>
              </div>
              <select
                required
                value={prodCategory}
                onChange={(e) => setProdCategory(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              >
                <option value="">{t("selectCategory")}...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* SKU and Barcode */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("sku")}
                </label>
                <input
                  type="text"
                  value={prodSku}
                  onChange={(e) => setProdSku(e.target.value)}
                  placeholder="e.g. HUI-5L"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("barcode")}
                </label>
                <input
                  type="text"
                  value={prodBarcode}
                  onChange={(e) => setProdBarcode(e.target.value)}
                  placeholder="e.g. 6111234567890"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-mono"
                />
              </div>
            </div>

            {/* Unit, Default Price, Low Stock Threshold */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("unit")}
                </label>
                <input
                  type="text"
                  value={prodUnit}
                  onChange={(e) => setProdUnit(e.target.value)}
                  placeholder="unit, kg, carton..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("defaultPrice")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={prodPrice}
                  onChange={(e) => setProdPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("lowStockThreshold")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={prodThreshold}
                  onChange={(e) => setProdThreshold(e.target.value)}
                  placeholder="0"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                value={prodDescription}
                onChange={(e) => setProdDescription(e.target.value)}
                placeholder="Packaging, dimensions, details..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddProductOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-xs"
              >
                {t("saveChanges")}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Inline Category Creation */}
        <Modal
          isOpen={isInlineCategoryOpen}
          onClose={() => setIsInlineCategoryOpen(false)}
          title={t("createCategory")}
          maxWidth="sm"
        >
          <form onSubmit={handleCreateCategoryInline} className="space-y-4">
            {catError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200">
                {catError}
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("newCategoryName")} *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Boissons"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsInlineCategoryOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                {t("createCategory")}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Stock Adjustment */}
        <Modal
          isOpen={isAdjustmentOpen}
          onClose={() => setIsAdjustmentOpen(false)}
          title={t("adjustStock")}
          maxWidth="md"
        >
          <form onSubmit={handleStockAdjustment} className="space-y-4">
            {adjError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200">
                {adjError}
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("warehouse")} *
              </label>
              <select
                required
                value={adjWarehouse}
                onChange={(e) => setAdjWarehouse(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              >
                <option value="">{t("selectCategory")}...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("productName")} *
              </label>
              <select
                required
                value={adjProduct}
                onChange={(e) => setAdjProduct(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              >
                <option value="">Select product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.unit})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("adjustmentQty")} *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={adjQty}
                onChange={(e) => setAdjQty(e.target.value)}
                placeholder="e.g. 5 or -2"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("adjustmentReason")} *
              </label>
              <input
                type="text"
                required
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="e.g. Inventory count correction / damaged goods"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAdjustmentOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-xl shadow-xs"
              >
                Save Adjustment
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Warehouse Transfer */}
        <Modal
          isOpen={isTransferOpen}
          onClose={() => setIsTransferOpen(false)}
          title={t("transferStock")}
          maxWidth="md"
        >
          <form onSubmit={handleTransfer} className="space-y-4">
            {transError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200">
                {transError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Source Warehouse *
                </label>
                <select
                  required
                  value={transSource}
                  onChange={(e) => setTransSource(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">Select source...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Destination Warehouse *
                </label>
                <select
                  required
                  value={transDest}
                  onChange={(e) => setTransDest(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">Select destination...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("productName")} *
              </label>
              <select
                required
                value={transProduct}
                onChange={(e) => setTransProduct(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              >
                <option value="">Select product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.unit})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Quantity to Transfer *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={transQty}
                onChange={(e) => setTransQty(e.target.value)}
                placeholder="e.g. 10"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("notes")} (Optional)
              </label>
              <input
                type="text"
                value={transNotes}
                onChange={(e) => setTransNotes(e.target.value)}
                placeholder="Reason or dispatch ref..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsTransferOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs"
              >
                Execute Transfer
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
