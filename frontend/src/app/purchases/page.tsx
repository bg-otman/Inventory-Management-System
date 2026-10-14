"use client";

import React, { useEffect, useState } from "react";
import {
  Plus,
  FileCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Eye,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

interface Supplier {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  unit: string;
}

interface Warehouse {
  id: number;
  name: string;
}

interface PurchaseLine {
  id?: number;
  product_id: number;
  product_name_snapshot: string;
  unit_snapshot: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
}

interface Purchase {
  id: number;
  reference_number: string;
  supplier_id: number;
  supplier_name?: string;
  warehouse_id: number;
  warehouse_name?: string;
  supplier_invoice_ref?: string;
  supplier_invoice_date?: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  receipt_status: "pending" | "received";
  received_at?: string;
  invoice_status: "not_recorded" | "recorded";
  invoiced_at?: string;
  payment_status: "paid" | "partially_paid" | "unpaid";
  notes?: string;
  created_at: string;
  lines: PurchaseLine[];
}

interface NewLineForm {
  product_id: number | "";
  quantity: number;
  unit_cost: number;
}

export default function PurchasesPage() {
  const { t } = useLanguage();

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isNewPurchaseOpen, setIsNewPurchaseOpen] = useState(false);
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
  const [recordInvoicePurchase, setRecordInvoicePurchase] = useState<Purchase | null>(null);
  const [invoiceRefInput, setInvoiceRefInput] = useState("");
  const [invoiceDateInput, setInvoiceDateInput] = useState("");

  // New Purchase Form state
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | "">("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "">("");
  const [purchaseLines, setPurchaseLines] = useState<NewLineForm[]>([
    { product_id: "", quantity: 1, unit_cost: 0 },
  ]);
  const [supplierInvRef, setSupplierInvRef] = useState("");
  const [supplierInvDate, setSupplierInvDate] = useState("");
  const [receiveNow, setReceiveNow] = useState(true);
  const [recordInvoiceNow, setRecordInvoiceNow] = useState(true);
  const [initialPayment, setInitialPayment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [purchData, sups, prods, whs] = await Promise.all([
        apiFetch<Purchase[]>("/purchases"),
        apiFetch<Supplier[]>("/suppliers"),
        apiFetch<Product[]>("/products"),
        apiFetch<Warehouse[]>("/warehouses"),
      ]);
      setPurchases(purchData);
      setSuppliers(sups);
      setProducts(prods);
      setWarehouses(whs);
      if (whs.length > 0) setSelectedWarehouseId(whs[0].id);
      if (sups.length > 0) setSelectedSupplierId(sups[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "new") {
      setIsNewPurchaseOpen(true);
    }
  }, []);

  // Line helpers
  const handleProductChange = (index: number, prodId: number) => {
    const updated = [...purchaseLines];
    updated[index].product_id = prodId;
    setPurchaseLines(updated);
  };

  const handleLineQtyChange = (index: number, qty: number) => {
    const updated = [...purchaseLines];
    updated[index].quantity = qty;
    setPurchaseLines(updated);
  };

  const handleLineCostChange = (index: number, cost: number) => {
    const updated = [...purchaseLines];
    updated[index].unit_cost = cost;
    setPurchaseLines(updated);
  };

  const addLine = () => {
    setPurchaseLines([...purchaseLines, { product_id: "", quantity: 1, unit_cost: 0 }]);
  };

  const removeLine = (index: number) => {
    if (purchaseLines.length === 1) return;
    setPurchaseLines(purchaseLines.filter((_, i) => i !== index));
  };

  const totalCost = purchaseLines.reduce((acc, line) => {
    if (!line.product_id) return acc;
    return acc + (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0);
  }, 0);

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setPurchaseError(null);

    if (!selectedSupplierId || !selectedWarehouseId) {
      setPurchaseError("Supplier and Warehouse are required");
      return;
    }

    const validLines = purchaseLines.filter((l) => l.product_id !== "" && l.quantity > 0);
    if (validLines.length === 0) {
      setPurchaseError("Please add at least one valid product line");
      return;
    }

    setIsSubmitting(true);
    try {
      const payAmount = Number(initialPayment) || 0;
      await apiFetch("/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: Number(selectedSupplierId),
          warehouse_id: Number(selectedWarehouseId),
          lines: validLines.map((l) => ({
            product_id: Number(l.product_id),
            quantity: Number(l.quantity),
            unit_cost: Number(l.unit_cost),
          })),
          supplier_invoice_ref: supplierInvRef.trim() || null,
          supplier_invoice_date: supplierInvDate || null,
          receive_now: receiveNow,
          record_invoice_now: recordInvoiceNow,
          initial_payment_amount: payAmount > 0 ? payAmount : null,
          payment_method: paymentMethod,
          notes: purchaseNotes.trim() || null,
        }),
      });

      setIsNewPurchaseOpen(false);
      setPurchaseLines([{ product_id: "", quantity: 1, unit_cost: 0 }]);
      setInitialPayment("");
      setSupplierInvRef("");
      setPurchaseNotes("");
      loadData();
    } catch (err: any) {
      setPurchaseError(err.message || "Failed to create purchase");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Receive goods action
  const handleReceiveGoods = async (purchaseId: number) => {
    try {
      const updated = await apiFetch<Purchase>(`/purchases/${purchaseId}/receive`, {
        method: "POST",
      });
      setPurchases((prev) => prev.map((p) => (p.id === purchaseId ? updated : p)));
      if (viewPurchase && viewPurchase.id === purchaseId) setViewPurchase(updated);
    } catch (err: any) {
      alert("Failed to receive goods: " + err.message);
    }
  };

  // Record supplier invoice action
  const handleRecordInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordInvoicePurchase || !invoiceRefInput.trim()) return;

    try {
      const updated = await apiFetch<Purchase>(
        `/purchases/${recordInvoicePurchase.id}/record-invoice`,
        {
          method: "POST",
          body: JSON.stringify({
            supplier_invoice_ref: invoiceRefInput.trim(),
            supplier_invoice_date: invoiceDateInput || null,
          }),
        }
      );
      setPurchases((prev) =>
        prev.map((p) => (p.id === recordInvoicePurchase.id ? updated : p))
      );
      setRecordInvoicePurchase(null);
      setInvoiceRefInput("");
      setInvoiceDateInput("");
    } catch (err: any) {
      alert("Failed to record invoice: " + err.message);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {t("purchasesLedger")}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage supplier orders, receive goods into warehouse, and record supplier invoices.
            </p>
          </div>

          <button
            onClick={() => setIsNewPurchaseOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{t("newPurchase")}</span>
          </button>
        </div>

        {/* Purchases Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 text-start">{t("referenceNo")}</th>
                  <th className="py-3 px-4 text-start">Date</th>
                  <th className="py-3 px-4 text-start">{t("supplier")}</th>
                  <th className="py-3 px-4 text-start">{t("warehouse")}</th>
                  <th className="py-3 px-4 text-end">{t("totalAmount")}</th>
                  <th className="py-3 px-4 text-center">{t("receiptStatus")}</th>
                  <th className="py-3 px-4 text-center">{t("invoiceStatus")}</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      {loading ? "Loading purchases..." : "No purchases recorded yet."}
                    </td>
                  </tr>
                ) : (
                  purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-700">
                        {p.reference_number}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-xs">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {p.supplier_name || "-"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 text-xs">
                        {p.warehouse_name || "-"}
                      </td>
                      <td className="py-3.5 px-4 text-end font-semibold text-slate-900">
                        {Number(p.total_amount).toFixed(2)} MAD
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            p.receipt_status === "received"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {p.receipt_status === "received" ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              {t("received")}
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-amber-600" />
                              {t("pending")}
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            p.invoice_status === "recorded"
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {p.invoice_status === "recorded" ? (
                            <>
                              <FileCheck className="w-3 h-3 text-sky-600" />
                              {p.supplier_invoice_ref || t("recorded")}
                            </>
                          ) : (
                            t("notRecorded")
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {p.receipt_status === "pending" && (
                            <button
                              onClick={() => handleReceiveGoods(p.id)}
                              className="px-2 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                              title="Receive Goods into Warehouse"
                            >
                              Receive
                            </button>
                          )}
                          {p.invoice_status === "not_recorded" && (
                            <button
                              onClick={() => {
                                setRecordInvoicePurchase(p);
                                setInvoiceRefInput("");
                                setInvoiceDateInput("");
                              }}
                              className="px-2 py-1 text-xs font-semibold rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
                              title="Record Supplier Invoice"
                            >
                              Invoice
                            </button>
                          )}
                          <button
                            onClick={() => setViewPurchase(p)}
                            className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: New Purchase Form */}
        <Modal
          isOpen={isNewPurchaseOpen}
          onClose={() => setIsNewPurchaseOpen(false)}
          title={t("newPurchase")}
          maxWidth="2xl"
        >
          <form onSubmit={handleCreatePurchase} className="space-y-5">
            {purchaseError && (
              <div className="p-3.5 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{purchaseError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("supplier")} *
                </label>
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) =>
                    setSelectedSupplierId(e.target.value ? Number(e.target.value) : "")
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("warehouse")} *
                </label>
                <select
                  required
                  value={selectedWarehouseId}
                  onChange={(e) =>
                    setSelectedWarehouseId(e.target.value ? Number(e.target.value) : "")
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">Items Ordered</h4>
                <button
                  type="button"
                  onClick={addLine}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("addItem")}
                </button>
              </div>

              <div className="space-y-2">
                {purchaseLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/50"
                  >
                    <div className="w-full sm:flex-1">
                      <select
                        required
                        value={line.product_id}
                        onChange={(e) =>
                          handleProductChange(idx, Number(e.target.value))
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Select product...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-full sm:w-24">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) =>
                          handleLineQtyChange(idx, Number(e.target.value))
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-end"
                      />
                    </div>

                    <div className="w-full sm:w-32">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        placeholder="Unit Cost"
                        value={line.unit_cost}
                        onChange={(e) =>
                          handleLineCostChange(idx, Number(e.target.value))
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-end"
                      />
                    </div>

                    <div className="w-full sm:w-28 text-end font-bold text-sm text-slate-800">
                      {((Number(line.quantity) || 0) * (Number(line.unit_cost) || 0)).toFixed(2)} MAD
                    </div>

                    {purchaseLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="text-end text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                Total Purchase: <span className="text-indigo-700">{totalCost.toFixed(2)} MAD</span>
              </div>
            </div>

            {/* Receipt & Invoice Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={receiveNow}
                  onChange={(e) => setReceiveNow(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-800">
                  Receive goods immediately
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recordInvoiceNow}
                  onChange={(e) => setRecordInvoiceNow(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-800">
                  Record invoice now
                </span>
              </label>
            </div>

            {/* Optional Supplier invoice details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("supplierInvoiceRef")}
                </label>
                <input
                  type="text"
                  value={supplierInvRef}
                  onChange={(e) => setSupplierInvRef(e.target.value)}
                  placeholder="e.g. FACT-2026-99"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("supplierInvoiceDate")}
                </label>
                <input
                  type="date"
                  value={supplierInvDate}
                  onChange={(e) => setSupplierInvDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewPurchaseOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow-xs"
              >
                {isSubmitting ? "Creating..." : "Save Purchase Order"}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Record Supplier Invoice */}
        <Modal
          isOpen={!!recordInvoicePurchase}
          onClose={() => setRecordInvoicePurchase(null)}
          title={`Record Supplier Invoice for ${recordInvoicePurchase?.reference_number}`}
          maxWidth="sm"
        >
          <form onSubmit={handleRecordInvoiceSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("supplierInvoiceRef")} *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={invoiceRefInput}
                onChange={(e) => setInvoiceRefInput(e.target.value)}
                placeholder="e.g. INV-SUP-1234"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDateInput}
                onChange={(e) => setInvoiceDateInput(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRecordInvoicePurchase(null)}
                className="px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                Record Invoice
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: View Purchase Details */}
        {viewPurchase && (
          <Modal
            isOpen={!!viewPurchase}
            onClose={() => setViewPurchase(null)}
            title={`Purchase ${viewPurchase.reference_number}`}
            maxWidth="lg"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm">
                <div>
                  <span className="text-slate-500 block text-xs">Supplier</span>
                  <span className="font-bold text-slate-800">{viewPurchase.supplier_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Warehouse</span>
                  <span className="font-semibold text-slate-800">{viewPurchase.warehouse_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Receipt Status</span>
                  <span className="font-semibold text-emerald-700 uppercase">{viewPurchase.receipt_status}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Invoice Status</span>
                  <span className="font-semibold text-sky-700 uppercase">{viewPurchase.invoice_status}</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="py-2.5 px-3 text-start">Product</th>
                      <th className="py-2.5 px-3 text-end">Quantity</th>
                      <th className="py-2.5 px-3 text-end">Unit Cost</th>
                      <th className="py-2.5 px-3 text-end">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewPurchase.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-medium text-slate-800">{l.product_name_snapshot}</td>
                        <td className="py-2 px-3 text-end text-slate-600">{l.quantity} {l.unit_snapshot}</td>
                        <td className="py-2 px-3 text-end text-slate-600">{Number(l.unit_cost).toFixed(2)}</td>
                        <td className="py-2 px-3 text-end font-semibold text-slate-800">{Number(l.line_total).toFixed(2)} MAD</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-end text-base font-bold text-slate-900">
                Total: <span className="text-indigo-700">{Number(viewPurchase.total_amount).toFixed(2)} MAD</span>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AppShell>
  );
}
