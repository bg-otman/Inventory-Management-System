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

interface Customer {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  total_receivable: number;
  unused_deposit: number;
  created_at: string;
}

interface Sale {
  id: number;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: string;
  issue_date: string;
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

export default function CustomersPage() {
  const { t } = useLanguage();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [viewCustomerDetail, setViewCustomerDetail] = useState<{
    customer: Customer;
    sales: Sale[];
    payments: Payment[];
  } | null>(null);

  // Add Customer form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [custError, setCustError] = useState<string | null>(null);

  // Payment form state
  const [payCustomerId, setPayCustomerId] = useState<number | "">("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [unpaidSales, setUnpaidSales] = useState<Sale[]>([]);
  const [allocations, setAllocations] = useState<{ [saleId: number]: string }>({});
  const [payError, setPayError] = useState<string | null>(null);
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const url = search.trim()
        ? `/customers?search=${encodeURIComponent(search.trim())}`
        : "/customers";
      const data = await apiFetch<Customer[]>(url);
      setCustomers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search]);

  // Load unpaid sales when payment customer selected
  useEffect(() => {
    if (payCustomerId !== "") {
      apiFetch<Sale[]>(`/sales?customer_id=${payCustomerId}&payment_status=unpaid`).then((unpaid) => {
        apiFetch<Sale[]>(`/sales?customer_id=${payCustomerId}&payment_status=partially_paid`).then(
          (partial) => {
            setUnpaidSales([...unpaid, ...partial]);
            setAllocations({});
          }
        );
      });
    } else {
      setUnpaidSales([]);
      setAllocations({});
    }
  }, [payCustomerId]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustError(null);
    if (!name.trim()) {
      setCustError("Customer name is required");
      return;
    }

    try {
      await apiFetch("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          email: email.trim() || null,
        }),
      });

      setName("");
      setPhone("");
      setAddress("");
      setEmail("");
      setIsAddCustomerOpen(false);
      loadCustomers();
    } catch (err: any) {
      setCustError(err.message || "Failed to create customer");
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError(null);
    if (!payCustomerId || !payAmount || Number(payAmount) <= 0) {
      setPayError("Valid customer and payment amount are required");
      return;
    }

    const allocList = Object.entries(allocations)
      .filter(([_, val]) => Number(val) > 0)
      .map(([saleId, val]) => ({
        invoice_id: Number(saleId),
        amount: Number(val),
      }));

    setIsSubmittingPay(true);
    try {
      await apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify({
          party_type: "customer",
          customer_id: Number(payCustomerId),
          amount: Number(payAmount),
          payment_method: payMethod,
          reference_no: payRef.trim() || null,
          allocations: allocList,
        }),
      });

      setIsPaymentOpen(false);
      setPayCustomerId("");
      setPayAmount("");
      setPayRef("");
      setAllocations({});
      loadCustomers();
    } catch (err: any) {
      setPayError(err.message || "Payment recording failed");
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const openCustomerDetail = async (c: Customer) => {
    try {
      const data = await apiFetch<{
        customer: Customer;
        sales: Sale[];
        payments: Payment[];
      }>(`/customers/${c.id}`);
      setViewCustomerDetail(data);
    } catch (err: any) {
      alert("Failed to load customer details: " + err.message);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {t("customerDirectory")}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Track customer accounts, outstanding debt, and unallocated deposit balances.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsPaymentOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-2xs transition-all"
            >
              <CreditCard className="w-4 h-4 text-slate-500" />
              <span>{t("recordPayment")}</span>
            </button>
            <button
              onClick={() => setIsAddCustomerOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold shadow-xs transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{t("addCustomer")}</span>
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
              placeholder="Search by name or phone..."
              className="w-full ps-10 pe-4 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Customers Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 text-start">{t("name")}</th>
                  <th className="py-3 px-4 text-start">{t("phone")}</th>
                  <th className="py-3 px-4 text-start">{t("address")}</th>
                  <th className="py-3 px-4 text-end text-rose-700">{t("totalReceivable")}</th>
                  <th className="py-3 px-4 text-end text-emerald-700">{t("unusedDeposit")}</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      {loading ? "Loading customers..." : "No customers found."}
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{c.name}</td>
                      <td className="py-3.5 px-4 text-slate-600 text-xs font-mono">{c.phone || "-"}</td>
                      <td className="py-3.5 px-4 text-slate-500 text-xs truncate max-w-xs">{c.address || "-"}</td>
                      <td className="py-3.5 px-4 text-end font-bold text-sm">
                        {Number(c.total_receivable) > 0 ? (
                          <span className="text-rose-600">{Number(c.total_receivable).toFixed(2)} MAD</span>
                        ) : (
                          <span className="text-slate-400">0.00 MAD</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-end font-bold text-sm">
                        {Number(c.unused_deposit) > 0 ? (
                          <span className="text-emerald-600">{Number(c.unused_deposit).toFixed(2)} MAD</span>
                        ) : (
                          <span className="text-slate-400">0.00 MAD</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => openCustomerDetail(c)}
                          className="px-3 py-1 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors inline-flex items-center gap-1"
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

        {/* Modal: Add Customer */}
        <Modal
          isOpen={isAddCustomerOpen}
          onClose={() => setIsAddCustomerOpen(false)}
          title={t("addCustomer")}
          maxWidth="md"
        >
          <form onSubmit={handleCreateCustomer} className="space-y-4">
            {custError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200">
                {custError}
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t("name")} *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Société Atlas SARL"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t("phone")}</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+212 600 00 00 00"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t("address")}</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Casablanca, Maroc"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t("email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@domaine.ma"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddCustomerOpen(false)}
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

        {/* Modal: Record Customer Payment / Deposit */}
        <Modal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          title="Record Customer Payment / Deposit"
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
              <label className="block text-sm font-semibold text-slate-700 mb-1">{t("customer")} *</label>
              <select
                required
                value={payCustomerId}
                onChange={(e) => setPayCustomerId(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              >
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Debt: {c.total_receivable} MAD)
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
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{t("paymentMethod")}</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="cash">{t("cash")}</option>
                  <option value="bank_transfer">{t("bankTransfer")}</option>
                  <option value="cheque">{t("cheque")}</option>
                  <option value="other">{t("other")}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Reference / Cheque #</label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Optional payment reference..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Unpaid invoices allocation */}
            {unpaidSales.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Allocate to Unpaid Invoices
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {unpaidSales.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 text-xs bg-white p-2 rounded-lg border border-slate-200">
                      <div>
                        <div className="font-semibold text-slate-800">{s.invoice_number}</div>
                        <div className="text-slate-500">Remaining: {Number(s.remaining_amount).toFixed(2)} MAD</div>
                      </div>
                      <div className="w-28">
                        <input
                          type="number"
                          step="0.01"
                          max={s.remaining_amount}
                          placeholder="Amount"
                          value={allocations[s.id] || ""}
                          onChange={(e) =>
                            setAllocations({ ...allocations, [s.id]: e.target.value })
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

        {/* Modal: Customer Ledger / Detail */}
        {viewCustomerDetail && (
          <Modal
            isOpen={!!viewCustomerDetail}
            onClose={() => setViewCustomerDetail(null)}
            title={`Customer Ledger — ${viewCustomerDetail.customer.name}`}
            maxWidth="xl"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs text-slate-500 block">Total Outstanding Debt</span>
                  <span className="text-xl font-bold text-rose-600">
                    {Number(viewCustomerDetail.customer.total_receivable).toFixed(2)} MAD
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Available Deposit Balance</span>
                  <span className="text-xl font-bold text-emerald-600">
                    {Number(viewCustomerDetail.customer.unused_deposit).toFixed(2)} MAD
                  </span>
                </div>
              </div>

              {/* Invoices */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-2">{t("customerSales")}</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-2 text-start">Invoice #</th>
                        <th className="p-2 text-start">Date</th>
                        <th className="p-2 text-end">Total</th>
                        <th className="p-2 text-end">Remaining</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewCustomerDetail.sales.length === 0 ? (
                        <tr><td colSpan={5} className="p-4 text-center text-slate-400">No invoices</td></tr>
                      ) : (
                        viewCustomerDetail.sales.map((s) => (
                          <tr key={s.id}>
                            <td className="p-2 font-mono font-semibold text-sky-700">{s.invoice_number}</td>
                            <td className="p-2 text-slate-500">{new Date(s.issue_date).toLocaleDateString()}</td>
                            <td className="p-2 text-end font-semibold">{Number(s.total_amount).toFixed(2)}</td>
                            <td className="p-2 text-end text-rose-600 font-bold">{Number(s.remaining_amount).toFixed(2)}</td>
                            <td className="p-2 text-center uppercase">{s.payment_status}</td>
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
                        <th className="p-2 text-end">Unallocated Deposit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewCustomerDetail.payments.length === 0 ? (
                        <tr><td colSpan={5} className="p-4 text-center text-slate-400">No payments</td></tr>
                      ) : (
                        viewCustomerDetail.payments.map((p) => (
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
