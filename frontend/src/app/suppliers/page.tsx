"use client";

import React, { useEffect, useState } from "react";
import {
  Plus,
  Search,
  CreditCard,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

interface Supplier {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  contact_person?: string;
  total_payable: number;
  unused_advance: number;
  created_at: string;
}

interface Purchase {
  id: number;
  reference_number: string;
  supplier_invoice_ref?: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  receipt_status: string;
  invoice_status: string;
  payment_status: string;
  created_at: string;
}

interface Payment {
  id: number;
  payment_number: string;
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  payment_date: string;
  payment_method: string;
  is_reversed: boolean;
}

export default function SuppliersPage() {
  const { t } = useLanguage();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [viewSupplierDetail, setViewSupplierDetail] = useState<{
    supplier: Supplier;
    purchases: Purchase[];
    payments: Payment[];
  } | null>(null);

  // Add Supplier form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [supError, setSupError] = useState<string | null>(null);

  // Payment form state
  const [paySupplierId, setPaySupplierId] = useState<number | "">("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [unpaidPurchases, setUnpaidPurchases] = useState<Purchase[]>([]);
  const [allocations, setAllocations] = useState<{ [purchaseId: number]: string }>({});
  const [payError, setPayError] = useState<string | null>(null);
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const url = search.trim()
        ? `/suppliers?search=${encodeURIComponent(search.trim())}`
        : "/suppliers";
      const data = await apiFetch<Supplier[]>(url);
      setSuppliers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [search]);

  // Load unpaid purchases when supplier selected
  useEffect(() => {
    if (paySupplierId !== "") {
      apiFetch<Purchase[]>(
        `/purchases?supplier_id=${paySupplierId}&invoice_status=recorded&payment_status=unpaid`
      ).then((unpaid) => {
        apiFetch<Purchase[]>(
          `/purchases?supplier_id=${paySupplierId}&invoice_status=recorded&payment_status=partially_paid`
        ).then((partial) => {
          setUnpaidPurchases([...unpaid, ...partial]);
          setAllocations({});
        });
      });
    } else {
      setUnpaidPurchases([]);
      setAllocations({});
    }
  }, [paySupplierId]);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupError(null);
    if (!name.trim()) {
      setSupError("Supplier name is required");
      return;
    }

    try {
      await apiFetch("/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          email: email.trim() || null,
          contact_person: contactPerson.trim() || null,
        }),
      });

      setName("");
      setPhone("");
      setAddress("");
      setEmail("");
      setContactPerson("");
      setIsAddSupplierOpen(false);
      loadSuppliers();
    } catch (err: any) {
      setSupError(err.message || "Failed to create supplier");
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError(null);
    if (!paySupplierId || !payAmount || Number(payAmount) <= 0) {
      setPayError("Valid supplier and payment amount are required");
      return;
    }

    const allocList = Object.entries(allocations)
      .filter(([_, val]) => Number(val) > 0)
      .map(([purchaseId, val]) => ({
        invoice_id: Number(purchaseId),
        amount: Number(val),
      }));

    setIsSubmittingPay(true);
    try {
      await apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify({
          party_type: "supplier",
          supplier_id: Number(paySupplierId),
          amount: Number(payAmount),
          payment_method: payMethod,
          reference_no: payRef.trim() || null,
          allocations: allocList,
        }),
      });

      setIsPaymentOpen(false);
      setPaySupplierId("");
      setPayAmount("");
      setPayRef("");
      setAllocations({});
      loadSuppliers();
    } catch (err: any) {
      setPayError(err.message || "Payment recording failed");
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const openSupplierDetail = async (s: Supplier) => {
    try {
      const data = await apiFetch<{
        supplier: Supplier;
        purchases: Purchase[];
        payments: Payment[];
      }>(`/suppliers/${s.id}`);
      setViewSupplierDetail(data);
    } catch (err: any) {
      alert("Failed to load supplier details: " + err.message);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {t("supplierDirectory")}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Track supplier accounts, outstanding payables, and unallocated advance balances.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsPaymentOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-2xs transition-all"
            >
              <CreditCard className="w-4 h-4 text-slate-500" />
              <span>Pay Supplier</span>
            </button>
            <button
              onClick={() => setIsAddSupplierOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-xs transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{t("addSupplier")}</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or contact..."
              className="w-full ps-10 pe-4 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Suppliers Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 text-start">{t("name")}</th>
                  <th className="py-3 px-4 text-start">{t("contactPerson")}</th>
                  <th className="py-3 px-4 text-start">{t("phone")}</th>
                  <th className="py-3 px-4 text-end text-rose-700">{t("totalPayable")}</th>
                  <th className="py-3 px-4 text-end text-emerald-700">{t("unusedAdvance")}</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      {loading ? "Loading suppliers..." : "No suppliers found."}
                    </td>
                  </tr>
                ) : (
                  suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{s.name}</td>
                      <td className="py-3.5 px-4 text-slate-600 text-xs">{s.contact_person || "-"}</td>
                      <td className="py-3.5 px-4 text-slate-500 text-xs font-mono">{s.phone || "-"}</td>
                      <td className="py-3.5 px-4 text-end font-bold text-sm">
                        {Number(s.total_payable) > 0 ? (
                          <span className="text-rose-600">{Number(s.total_payable).toFixed(2)} MAD</span>
                        ) : (
                          <span className="text-slate-400">0.00 MAD</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-end font-bold text-sm">
                        {Number(s.unused_advance) > 0 ? (
                          <span className="text-emerald-600">{Number(s.unused_advance).toFixed(2)} MAD</span>
                        ) : (
                          <span className="text-slate-400">0.00 MAD</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => openSupplierDetail(s)}
                          className="px-3 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          <span>{t("viewAccount")}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Add Supplier */}
        <Modal
          isOpen={isAddSupplierOpen}
          onClose={() => setIsAddSupplierOpen(false)}
          title={t("addSupplier")}
          maxWidth="md"
        >
          <form onSubmit={handleCreateSupplier} className="space-y-4">
            {supError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200">
                {supError}
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t("name")} *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Coopérative Oléicole"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t("contactPerson")}</label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="M. Mohammed"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t("phone")}</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+212 522 00 00 00"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t("address")}</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Fès, Maroc"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddSupplierOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs"
              >
                {t("saveChanges")}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Record Supplier Payment / Advance */}
        <Modal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          title="Record Supplier Payment / Advance"
          maxWidth="lg"
        >
          <form onSubmit={handleRecordPayment} className="space-y-4">
            {payError && (
              <div className="p-3.5 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{payError}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t("supplier")} *</label>
              <select
                required
                value={paySupplierId}
                onChange={(e) => setPaySupplierId(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Payable: {s.total_payable} MAD)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{t("paymentAmount")} *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{t("paymentMethod")}</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="cash">{t("cash")}</option>
                  <option value="bank_transfer">{t("bankTransfer")}</option>
                  <option value="cheque">{t("cheque")}</option>
                  <option value="other">{t("other")}</option>
                </select>
              </div>
            </div>

            {/* Unpaid purchases allocation */}
            {unpaidPurchases.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Allocate to Invoiced Purchases
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {unpaidPurchases.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 text-xs bg-white p-2 rounded-lg border border-slate-200">
                      <div>
                        <div className="font-semibold text-slate-800">{p.reference_number} ({p.supplier_invoice_ref || "Inv"})</div>
                        <div className="text-slate-500">Remaining: {Number(p.remaining_amount).toFixed(2)} MAD</div>
                      </div>
                      <div className="w-28">
                        <input
                          type="number"
                          step="0.01"
                          max={p.remaining_amount}
                          placeholder="Amount"
                          value={allocations[p.id] || ""}
                          onChange={(e) =>
                            setAllocations({ ...allocations, [p.id]: e.target.value })
                          }
                          className="w-full px-2 py-1 rounded border border-slate-200 text-end text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsPaymentOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmittingPay}
                className="px-5 py-2 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl shadow-xs"
              >
                {isSubmittingPay ? "Saving..." : "Record Payment"}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Supplier Ledger */}
        {viewSupplierDetail && (
          <Modal
            isOpen={!!viewSupplierDetail}
            onClose={() => setViewSupplierDetail(null)}
            title={`Supplier Ledger — ${viewSupplierDetail.supplier.name}`}
            maxWidth="xl"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs text-slate-500 block">Total Outstanding Payable</span>
                  <span className="text-xl font-bold text-rose-600">
                    {Number(viewSupplierDetail.supplier.total_payable).toFixed(2)} MAD
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Available Advance Balance</span>
                  <span className="text-xl font-bold text-emerald-600">
                    {Number(viewSupplierDetail.supplier.unused_advance).toFixed(2)} MAD
                  </span>
                </div>
              </div>

              {/* Purchases */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-2">Purchases</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-2 text-start">Order #</th>
                        <th className="p-2 text-start">Inv Ref</th>
                        <th className="p-2 text-end">Total</th>
                        <th className="p-2 text-end">Remaining</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewSupplierDetail.purchases.length === 0 ? (
                        <tr><td colSpan={5} className="p-4 text-center text-slate-400">No purchases</td></tr>
                      ) : (
                        viewSupplierDetail.purchases.map((p) => (
                          <tr key={p.id}>
                            <td className="p-2 font-mono font-semibold text-indigo-700">{p.reference_number}</td>
                            <td className="p-2 text-slate-600">{p.supplier_invoice_ref || "-"}</td>
                            <td className="p-2 text-end font-semibold">{Number(p.total_amount).toFixed(2)}</td>
                            <td className="p-2 text-end text-rose-600 font-bold">{Number(p.remaining_amount).toFixed(2)}</td>
                            <td className="p-2 text-center uppercase">{p.payment_status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payments */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-2">Payment History</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-2 text-start">Payment #</th>
                        <th className="p-2 text-start">Date</th>
                        <th className="p-2 text-start">Method</th>
                        <th className="p-2 text-end">Amount</th>
                        <th className="p-2 text-end">Unused Advance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewSupplierDetail.payments.length === 0 ? (
                        <tr><td colSpan={5} className="p-4 text-center text-slate-400">No payments</td></tr>
                      ) : (
                        viewSupplierDetail.payments.map((p) => (
                          <tr key={p.id}>
                            <td className="p-2 font-mono font-semibold">{p.payment_number}</td>
                            <td className="p-2 text-slate-500">{p.payment_date}</td>
                            <td className="p-2 text-slate-600">{p.payment_method}</td>
                            <td className="p-2 text-end font-bold text-slate-900">{Number(p.amount).toFixed(2)} MAD</td>
                            <td className="p-2 text-end font-semibold text-emerald-600">{Number(p.unallocated_amount).toFixed(2)} MAD</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AppShell>
  );
}
