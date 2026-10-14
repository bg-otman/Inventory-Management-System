"use client";

import React, { useEffect, useState } from "react";
import {
  Plus,
  FileText,
  Download,
  CheckCircle,
  Clock,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

interface Customer {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  unit: string;
  default_price?: number;
  total_stock: number;
}

interface Warehouse {
  id: number;
  name: string;
}

interface SaleLine {
  id?: number;
  product_id: number;
  product_name_snapshot: string;
  unit_snapshot: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Sale {
  id: number;
  invoice_number: string;
  customer_id?: number;
  customer_name_snapshot: string;
  warehouse_id: number;
  subtotal: number;
  discount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: "paid" | "partially_paid" | "unpaid";
  delivery_status: "delivered" | "pending";
  delivered_at?: string;
  due_date?: string;
  issue_date: string;
  language: string;
  notes?: string;
  lines: SaleLine[];
}

interface NewLineForm {
  product_id: number | "";
  quantity: number;
  unit_price: number;
}

export default function SalesPage() {
  const { t, language } = useLanguage();

  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isNewSaleOpen, setIsNewSaleOpen] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  // New Sale Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | "">("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "">("");
  const [saleLines, setSaleLines] = useState<NewLineForm[]>([
    { product_id: "", quantity: 1, unit_price: 0 },
  ]);
  const [saleDiscount, setSaleDiscount] = useState("0");
  const [saleTaxRate, setSaleTaxRate] = useState("20");
  const [deliveredNow, setDeliveredNow] = useState(true);
  const [dueDate, setDueDate] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const [initialPayment, setInitialPayment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [saleError, setSaleError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [salesData, custs, prods, whs] = await Promise.all([
        apiFetch<Sale[]>("/sales"),
        apiFetch<Customer[]>("/customers"),
        apiFetch<Product[]>("/products"),
        apiFetch<Warehouse[]>("/warehouses"),
      ]);
      setSales(salesData);
      setCustomers(custs);
      setProducts(prods);
      setWarehouses(whs);
      if (whs.length > 0) {
        setSelectedWarehouseId(whs[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Check if url query has action=new
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "new") {
      setIsNewSaleOpen(true);
    }
  }, []);

  // Line item helpers
  const handleProductChange = (index: number, prodId: number) => {
    const prod = products.find((p) => p.id === prodId);
    const updated = [...saleLines];
    updated[index].product_id = prodId;
    if (prod && prod.default_price) {
      updated[index].unit_price = Number(prod.default_price);
    }
    setSaleLines(updated);
  };

  const handleLineQtyChange = (index: number, qty: number) => {
    const updated = [...saleLines];
    updated[index].quantity = qty;
    setSaleLines(updated);
  };

  const handleLinePriceChange = (index: number, price: number) => {
    const updated = [...saleLines];
    updated[index].unit_price = price;
    setSaleLines(updated);
  };

  const addLine = () => {
    setSaleLines([...saleLines, { product_id: "", quantity: 1, unit_price: 0 }]);
  };

  const removeLine = (index: number) => {
    if (saleLines.length === 1) return;
    setSaleLines(saleLines.filter((_, i) => i !== index));
  };

  // Calculation helpers
  const subtotal = saleLines.reduce((acc, line) => {
    if (!line.product_id) return acc;
    return acc + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
  }, 0);

  const discountVal = Number(saleDiscount) || 0;
  const taxable = Math.max(0, subtotal - discountVal);
  const taxRateVal = Number(saleTaxRate) || 0;
  const taxVal = Math.round(taxable * (taxRateVal / 100) * 100) / 100;
  const totalVal = taxable + taxVal;

  // Auto set initial payment if walk-in customer
  useEffect(() => {
    if (selectedCustomerId === "") {
      setInitialPayment(totalVal.toFixed(2));
    }
  }, [selectedCustomerId, totalVal]);

  const handleSubmitSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaleError(null);

    // Validation
    if (!selectedWarehouseId) {
      setSaleError("Please select a warehouse");
      return;
    }

    const validLines = saleLines.filter((l) => l.product_id !== "" && l.quantity > 0);
    if (validLines.length === 0) {
      setSaleError("Please add at least one valid product line");
      return;
    }

    // Walk in rule: must be paid in full
    const payAmount = Number(initialPayment) || 0;
    if (selectedCustomerId === "" && Math.abs(payAmount - totalVal) > 0.01) {
      setSaleError("Walk-in sales must be paid in full. To give credit, select a named customer.");
      return;
    }

    setIsSubmitting(true);
    try {
      const createdSale = await apiFetch<Sale>("/sales", {
        method: "POST",
        body: JSON.stringify({
          customer_id: selectedCustomerId === "" ? null : Number(selectedCustomerId),
          warehouse_id: Number(selectedWarehouseId),
          lines: validLines.map((l) => ({
            product_id: Number(l.product_id),
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
          })),
          discount: discountVal,
          tax_rate: taxRateVal,
          delivered_now: deliveredNow,
          due_date: dueDate || null,
          language: language,
          notes: saleNotes.trim() || null,
          initial_payment_amount: payAmount > 0 ? payAmount : null,
          payment_method: paymentMethod,
        }),
      });

      setIsNewSaleOpen(false);
      // Reset form
      setSaleLines([{ product_id: "", quantity: 1, unit_price: 0 }]);
      setSaleDiscount("0");
      setInitialPayment("");
      setSaleNotes("");
      loadData();
      setViewSale(createdSale);
    } catch (err: any) {
      setSaleError(err.message || "Failed to create sale");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mark Delivered action
  const handleMarkDelivered = async (saleId: number) => {
    try {
      const updated = await apiFetch<Sale>(`/sales/${saleId}/deliver`, {
        method: "POST",
      });
      setSales((prev) => prev.map((s) => (s.id === saleId ? updated : s)));
      if (viewSale && viewSale.id === saleId) {
        setViewSale(updated);
      }
    } catch (err: any) {
      alert("Failed to mark delivered: " + err.message);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {t("salesLedger")}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Issue invoices, track delivery fulfillment, and monitor customer payments.
            </p>
          </div>

          <button
            onClick={() => setIsNewSaleOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{t("newSale")}</span>
          </button>
        </div>

        {/* Sales Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 text-start">{t("invoiceNumber")}</th>
                  <th className="py-3 px-4 text-start">{t("issueDate")}</th>
                  <th className="py-3 px-4 text-start">{t("customer")}</th>
                  <th className="py-3 px-4 text-end">{t("totalAmount")}</th>
                  <th className="py-3 px-4 text-end">{t("remainingBalance")}</th>
                  <th className="py-3 px-4 text-center">{t("paymentStatus")}</th>
                  <th className="py-3 px-4 text-center">{t("deliveryStatus")}</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      {loading ? "Loading sales invoices..." : "No sales invoices recorded yet."}
                    </td>
                  </tr>
                ) : (
                  sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-sky-700">
                        {sale.invoice_number}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-xs">
                        {new Date(sale.issue_date).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {sale.customer_name_snapshot}
                      </td>
                      <td className="py-3.5 px-4 text-end font-semibold text-slate-900">
                        {Number(sale.total_amount).toFixed(2)} MAD
                      </td>
                      <td className="py-3.5 px-4 text-end text-xs">
                        {Number(sale.remaining_amount) > 0 ? (
                          <span className="font-bold text-rose-600">
                            {Number(sale.remaining_amount).toFixed(2)} MAD
                          </span>
                        ) : (
                          <span className="text-slate-400">0.00 MAD</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            sale.payment_status === "paid"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : sale.payment_status === "partially_paid"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {t(sale.payment_status as any)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            sale.delivery_status === "delivered"
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {sale.delivery_status === "delivered" ? (
                            <>
                              <CheckCircle className="w-3 h-3 text-sky-600" />
                              {t("delivered")}
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
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setViewSale(sale)}
                            className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                            title="View Invoice Details"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <a
                            href={`/api/v1/sales/${sale.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Download PDF"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: New Sale Form */}
        <Modal
          isOpen={isNewSaleOpen}
          onClose={() => setIsNewSaleOpen(false)}
          title={t("newSale")}
          maxWidth="2xl"
        >
          <form onSubmit={handleSubmitSale} className="space-y-5">
            {saleError && (
              <div className="p-3.5 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{saleError}</span>
              </div>
            )}

            {/* Customer & Warehouse */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("customer")} *
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) =>
                    setSelectedCustomerId(e.target.value ? Number(e.target.value) : "")
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">{t("walkInCustomer")} (Paid in full)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {selectedCustomerId === "" && (
                  <p className="text-xs text-amber-600 mt-1">
                    Walk-in sales must be fully paid. Credit requires a named customer.
                  </p>
                )}
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
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
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
                <h4 className="text-sm font-bold text-slate-900">Line Items</h4>
                <button
                  type="button"
                  onClick={addLine}
                  className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("addItem")}
                </button>
              </div>

              <div className="space-y-2">
                {saleLines.map((line, idx) => (
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
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="">Select product...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.unit}) — Stock: {p.total_stock}
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
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-end"
                      />
                    </div>

                    <div className="w-full sm:w-32">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        placeholder="Unit Price"
                        value={line.unit_price}
                        onChange={(e) =>
                          handleLinePriceChange(idx, Number(e.target.value))
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-end"
                      />
                    </div>

                    <div className="w-full sm:w-28 text-end font-bold text-sm text-slate-800">
                      {((Number(line.quantity) || 0) * (Number(line.unit_price) || 0)).toFixed(2)} MAD
                    </div>

                    {saleLines.length > 1 && (
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
            </div>

            {/* Calculations & Discount/Tax */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-sm">
              <div className="flex justify-between items-center text-slate-600">
                <span>{t("subtotal")}:</span>
                <span className="font-semibold">{subtotal.toFixed(2)} MAD</span>
              </div>

              <div className="flex justify-between items-center gap-4">
                <span className="text-slate-600">{t("discount")}:</span>
                <input
                  type="number"
                  min="0"
                  max={subtotal}
                  step="0.01"
                  value={saleDiscount}
                  onChange={(e) => setSaleDiscount(e.target.value)}
                  className="w-32 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-end text-sm"
                />
              </div>

              <div className="flex justify-between items-center gap-4">
                <span className="text-slate-600">{t("taxRate")}:</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={saleTaxRate}
                  onChange={(e) => setSaleTaxRate(e.target.value)}
                  className="w-32 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-end text-sm"
                />
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>{t("taxAmount")}:</span>
                <span className="font-semibold">{taxVal.toFixed(2)} MAD</span>
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-base font-bold text-slate-900">
                <span>{t("totalAmount")}:</span>
                <span className="text-sky-700 text-lg">{totalVal.toFixed(2)} MAD</span>
              </div>
            </div>

            {/* Delivery option */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deliveredNow}
                  onChange={(e) => setDeliveredNow(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="font-semibold text-sm text-slate-800">
                    {t("deliveredNow")}
                  </span>
                  <p className="text-xs text-slate-500">
                    Uncheck to keep as &quot;Pending Delivery&quot; and fulfill later.
                  </p>
                </div>
              </label>
            </div>

            {/* Payment Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("amountPaid")} (MAD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={totalVal}
                  value={initialPayment}
                  onChange={(e) => setInitialPayment(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("paymentMethod")}
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="cash">{t("cash")}</option>
                  <option value="bank_transfer">{t("bankTransfer")}</option>
                  <option value="cheque">{t("cheque")}</option>
                  <option value="other">{t("other")}</option>
                </select>
              </div>
            </div>

            {selectedCustomerId !== "" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("dueDate")} (Optional)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("notes")} (Optional)
              </label>
              <textarea
                rows={2}
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                placeholder="Invoice remarks or order references..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewSaleOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl shadow-xs"
              >
                {isSubmitting ? "Creating..." : "Confirm & Issue Invoice"}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: View Invoice Snapshot */}
        {viewSale && (
          <Modal
            isOpen={!!viewSale}
            onClose={() => setViewSale(null)}
            title={`Invoice ${viewSale.invoice_number}`}
            maxWidth="xl"
          >
            <div className="space-y-5">
              {/* Meta bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm">
                <div>
                  <span className="text-slate-500 block text-xs">Customer</span>
                  <span className="font-bold text-slate-800">
                    {viewSale.customer_name_snapshot}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Date</span>
                  <span className="font-semibold text-slate-800">
                    {new Date(viewSale.issue_date).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Payment</span>
                  <span className="font-semibold text-sky-700 uppercase">
                    {t(viewSale.payment_status as any)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Delivery</span>
                  <span className="font-semibold text-slate-800 uppercase">
                    {t(viewSale.delivery_status as any)}
                  </span>
                </div>
              </div>

              {/* Items table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="py-2.5 px-3 text-start">Item</th>
                      <th className="py-2.5 px-3 text-end">Qty</th>
                      <th className="py-2.5 px-3 text-end">P.U</th>
                      <th className="py-2.5 px-3 text-end">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewSale.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {l.product_name_snapshot}
                        </td>
                        <td className="py-2 px-3 text-end text-slate-600">
                          {l.quantity} {l.unit_snapshot}
                        </td>
                        <td className="py-2 px-3 text-end text-slate-600">
                          {Number(l.unit_price).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-end font-semibold text-slate-800">
                          {Number(l.line_total).toFixed(2)} MAD
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="space-y-1 text-sm text-end">
                <div className="text-slate-500">
                  Subtotal: <span className="font-semibold text-slate-800">{Number(viewSale.subtotal).toFixed(2)} MAD</span>
                </div>
                {Number(viewSale.discount) > 0 && (
                  <div className="text-emerald-600">
                    Discount: -{Number(viewSale.discount).toFixed(2)} MAD
                  </div>
                )}
                <div className="text-slate-500">
                  TVA ({viewSale.tax_rate}%): <span className="font-semibold text-slate-800">{Number(viewSale.tax_amount).toFixed(2)} MAD</span>
                </div>
                <div className="text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
                  Total: <span className="text-sky-700">{Number(viewSale.total_amount).toFixed(2)} MAD</span>
                </div>
                <div className="text-slate-500 text-xs">
                  Paid: {Number(viewSale.paid_amount).toFixed(2)} MAD • Remaining: {Number(viewSale.remaining_amount).toFixed(2)} MAD
                </div>
              </div>

              {/* Actions: Mark delivered if pending, and download PDF */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                {viewSale.delivery_status === "pending" ? (
                  <button
                    onClick={() => handleMarkDelivered(viewSale.id)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold shadow-xs transition-all"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>{t("markDelivered")}</span>
                  </button>
                ) : (
                  <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> Delivered & stock updated
                  </span>
                )}

                <a
                  href={`/api/v1/sales/${viewSale.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold shadow-xs transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>{t("downloadPdf")}</span>
                </a>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AppShell>
  );
}
