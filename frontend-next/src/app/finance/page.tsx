"use client";

// Port of `screenIsFinance` (Invoices/Expenses/Payroll/Milestones tabs) +
// Invoice/Expense drawers, Milestone form, Salary Slip modal
// (template.html:3666-4188, script.js logic at 2864-3354, 5000-5345).
// The Invoice drawer's left-hand "View in PDF" panel is a simplified
// representation of the original fake-invoice-layout preview (same fields,
// lighter styling) — the real PDF is still generated server-side via
// GET /api/finance/invoices/{id}/pdf, unchanged.

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import {
  invoicesApi,
  expensesApi,
  payrollApi,
  milestonesApi,
  financeStatsApi,
  expenseCategoriesApi,
  projectsApi,
  moneyC,
  moneyPKR,
  numVal,
  toUSD,
  todayISO,
  MONTH_NAMES,
  DEPARTMENT_OPTIONS,
} from "@/lib/orbit-client";
import { Button, Input, Select, Badge, Icon, Modal } from "@/design-system/healer-bundle";
import { useClosingTransition } from "@/lib/use-closing-transition";

type Invoice = {
  id: string; invoice_number?: string; client: string; project_name?: string; amount: number; currency: string;
  invoice_type?: string; status: string; issue_date?: string | null; due_date?: string | null; paid_date?: string | null;
  notes?: string; line_items?: { project_id?: string | null; description: string; qty: number; unit_price: number }[];
  bank_account_name?: string; bank_account_number?: string; bank_iban?: string; bank_name?: string;
  registration_number?: string; ntn?: string;
};
type Expense = {
  id: string; category: string; amount: number; currency: string; expense_type?: string; department: string;
  submitted_by_name?: string; submitted_date?: string; notes?: string; status: string;
};
type SalarySlip = {
  id: string; employee_id: string; employee_name?: string; employee_role?: string; employee_department?: string;
  month: string; gross_salary: number; tax: number; other_deductions: number; deduction_reason?: string;
  bonus: number; allowances: number; net_salary: number; notes?: string; payment_status: string; payment_date?: string | null;
};
type Milestone = { id: string; project_id: string; project_name?: string; name: string; amount: number; currency: string; expected_date: string; status: string };
type Project = { id: string; name: string; client: string };
type Category = { id: string; name: string };

const INVOICE_STATUSES = ["Draft", "New", "Sent", "Overdue", "Paid", "Unpaid"];
const EXPENSE_STATUSES = ["Pending", "Approved", "Rejected"];
const CURRENCY_OPTIONS = [{ value: "USD", label: "USD ($)" }, { value: "PKR", label: "PKR (₨)" }];

function blankLineItem() {
  return { projectId: "", description: "", qty: "1", unitPrice: "" };
}

export default function FinancePage() {
  const { currentUser } = useAuth();
  const { pushToast } = useToast();
  const accessLevels = currentUser?.access_levels || [];
  const isFinanceEditor = accessLevels.includes("owner") || accessLevels.includes("finance");
  const canRunPayroll = isFinanceEditor;

  const [tab, setTab] = useState<"invoices" | "expenses" | "payroll" | "milestones">("invoices");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payrollMonth, setPayrollMonth] = useState(todayISO().slice(0, 7));

  const loadFinance = () => {
    Promise.all([
      invoicesApi.list().catch(() => []),
      expensesApi.list().catch(() => []),
      payrollApi.list({ month: payrollMonth }).catch(() => []),
      milestonesApi.list().catch(() => []),
    ]).then(([inv, exp, pay, ms]: [Invoice[], Expense[], SalarySlip[], Milestone[]]) => {
      setInvoices(inv);
      setExpenses(exp);
      setSlips(pay);
      setMilestones(ms);
    });
  };
  useEffect(loadFinance, [payrollMonth]);
  useEffect(() => {
    projectsApi.list().then((p: Project[]) => setProjects(p)).catch(() => {});
    expenseCategoriesApi.list().then((c: Category[]) => setCategories(c)).catch(() => {});
  }, []);

  // ---- Invoices ----
  const [invSearch, setInvSearch] = useState("");
  const [invStatus, setInvStatus] = useState("");
  const [invCurrency, setInvCurrency] = useState("");
  const [invProject, setInvProject] = useState("");
  const [invDrawerId, setInvDrawerId] = useState<string | null>(null);
  const [invForm, setInvForm] = useState({
    invoiceNumber: "", client: "", currency: "USD", invoiceType: "Fixed", issueDate: todayISO(), due: "", status: "Draft",
    paidDate: "", notes: "", lineItems: [blankLineItem()], bankAccountName: "", bankAccountNumber: "", bankIban: "", bankName: "",
    registrationNumber: "", ntn: "",
  });
  const [invoiceSaving, setInvoiceSaving] = useState(false);

  const invProjectFilterOptions = [{ value: "", label: "All projects" }, ...Array.from(new Set(invoices.map((i) => i.project_name || ""))).filter(Boolean).map((p) => ({ value: p, label: p }))];
  const financeInvoiceRows = invoices
    .map((i) => ({ ...i, project: i.project_name || "", amountStr: moneyC(i.amount, i.currency), dueStr: i.due_date || "—", installmentStr: i.invoice_type || "Fixed" }))
    .filter((i) => {
      const q = invSearch.trim().toLowerCase();
      if (q && !(i.client.toLowerCase().includes(q) || i.project.toLowerCase().includes(q))) return false;
      if (invStatus && i.status !== invStatus) return false;
      if (invCurrency && i.currency !== invCurrency) return false;
      if (invProject && i.project !== invProject) return false;
      return true;
    });
  const invFiltersActive = !!(invSearch || invStatus || invCurrency || invProject);

  const changeInvoiceStatus = (id: string, status: string) => {
    invoicesApi.update(id, { status }).then(
      () => {
        pushToast("Invoice status updated to " + status + ".");
        loadFinance();
      },
      (err: Error) => pushToast(err.message, "error")
    );
  };

  const openInvoiceDrawer = (id: string) => {
    if (id === "new") {
      setInvForm({
        invoiceNumber: "UPM-CZ-" + todayISO().slice(0, 4) + "-", client: "", currency: "USD", invoiceType: "Fixed",
        issueDate: todayISO(), due: "", status: "Draft", paidDate: "", notes: "", lineItems: [blankLineItem()],
        bankAccountName: "", bankAccountNumber: "", bankIban: "", bankName: "", registrationNumber: "", ntn: "",
      });
    } else {
      const inv = invoices.find((i) => i.id === id);
      if (inv) {
        setInvForm({
          invoiceNumber: inv.invoice_number || "", client: inv.client, currency: inv.currency, invoiceType: inv.invoice_type || "Fixed",
          issueDate: inv.issue_date || "", due: inv.due_date || "", status: inv.status, paidDate: inv.paid_date || "", notes: inv.notes || "",
          lineItems: (inv.line_items && inv.line_items.length ? inv.line_items : [{ project_id: "", description: "", qty: 1, unit_price: 0 }]).map((li) => ({
            projectId: li.project_id || "", description: li.description || "", qty: String(li.qty || 1), unitPrice: String(li.unit_price ?? ""),
          })),
          bankAccountName: inv.bank_account_name || "", bankAccountNumber: inv.bank_account_number || "", bankIban: inv.bank_iban || "", bankName: inv.bank_name || "",
          registrationNumber: inv.registration_number || "", ntn: inv.ntn || "",
        });
      }
    }
    setInvDrawerId(id);
  };
  const closeInvoiceDrawer = () => setInvDrawerId(null);
  const invoiceDrawerClosing = useClosingTransition();
  const closeInvoiceDrawerAnimated = () => invoiceDrawerClosing.closeWithTransition(closeInvoiceDrawer);
  const deleteInvoice = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this invoice? This cannot be undone.")) return;
    invoicesApi.remove(id).then(
      () => {
        pushToast("Invoice deleted.");
        if (invDrawerId === id) closeInvoiceDrawer();
        loadFinance();
      },
      (err: Error) => pushToast(err.message || "Could not delete invoice.", "error")
    );
  };
  const isNewInvoice = invDrawerId === "new";
  const pdfInvoiceRaw = invDrawerId && !isNewInvoice ? invoices.find((i) => i.id === invDrawerId) : null;

  const invoiceApiPatchFor = (field: string, form: typeof invForm): Record<string, unknown> | null => {
    switch (field) {
      case "invoiceNumber": return { invoice_number: form.invoiceNumber };
      case "client": return { client: form.client };
      case "currency": return { currency: form.currency };
      case "issueDate": return form.issueDate ? { issue_date: form.issueDate } : null;
      case "due": return form.due ? { due_date: form.due } : null;
      case "status": return { status: form.status };
      case "paidDate": return form.paidDate ? { paid_date: form.paidDate } : null;
      case "notes": return { notes: form.notes || "" };
      case "bankAccountName": return { bank_account_name: form.bankAccountName || null };
      case "bankAccountNumber": return { bank_account_number: form.bankAccountNumber || null };
      case "bankIban": return { bank_iban: form.bankIban || null };
      case "bankName": return { bank_name: form.bankName || null };
      case "registrationNumber": return { registration_number: form.registrationNumber || null };
      case "ntn": return { ntn: form.ntn || null };
      case "lineItems": {
        const items = form.lineItems.filter((li) => li.description && numVal(li.unitPrice) > 0).map((li) => ({ project_id: li.projectId || null, description: li.description, qty: numVal(li.qty) || 1, unit_price: numVal(li.unitPrice) }));
        return items.length ? { line_items: items } : null;
      }
      default: return null;
    }
  };
  const autoSaveInvoiceField = (field: string, form: typeof invForm) => {
    if (!invDrawerId || invDrawerId === "new") return;
    const patch = invoiceApiPatchFor(field, form);
    if (!patch) return;
    setInvoiceSaving(true);
    invoicesApi.update(invDrawerId, patch).then(
      () => {
        setInvoiceSaving(false);
        pushToast("Changes auto-saved.");
        loadFinance();
      },
      (err: Error) => {
        setInvoiceSaving(false);
        pushToast(err.message || "Could not save that change.", "error");
      }
    );
  };
  const setInvoiceField = (field: string, val: string) => {
    setInvForm((f) => {
      const next = { ...f, [field]: val };
      if (field === "status" && val !== "Paid") next.paidDate = "";
      autoSaveInvoiceField(field, next);
      return next;
    });
  };
  const setInvoiceLineItemField = (index: number, field: string, val: string) => {
    setInvForm((f) => {
      const items = f.lineItems.slice();
      const next = { ...items[index], [field]: val };
      if (field === "projectId" && val) {
        const proj = projects.find((p) => p.id === val);
        if (proj) next.description = proj.name;
      }
      items[index] = next;
      const updated = { ...f, lineItems: items };
      autoSaveInvoiceField("lineItems", updated);
      return updated;
    });
  };
  const addInvoiceLineItem = () => setInvForm((f) => ({ ...f, lineItems: [...f.lineItems, blankLineItem()] }));
  const removeInvoiceLineItem = (index: number) => {
    setInvForm((f) => {
      if (f.lineItems.length <= 1) return f;
      const updated = { ...f, lineItems: f.lineItems.filter((_, i) => i !== index) };
      autoSaveInvoiceField("lineItems", updated);
      return updated;
    });
  };
  const invFormTotal = invForm.lineItems.reduce((sum, li) => sum + numVal(li.qty || "1") * numVal(li.unitPrice), 0);

  const submitNewInvoice = () => {
    if (!invForm.invoiceNumber || !invForm.client || !invForm.issueDate || !invForm.due) {
      pushToast("Please fill all required fields.", "error");
      return;
    }
    const lineItems = invForm.lineItems.filter((li) => li.description && numVal(li.unitPrice) > 0).map((li) => ({ project_id: li.projectId || null, description: li.description, qty: numVal(li.qty) || 1, unit_price: numVal(li.unitPrice) }));
    if (!lineItems.length) {
      pushToast("Add at least one line item with a description and unit price.", "error");
      return;
    }
    invoicesApi
      .create({
        invoice_number: invForm.invoiceNumber, client: invForm.client, currency: invForm.currency, invoice_type: invForm.invoiceType || "Fixed",
        issue_date: invForm.issueDate, due_date: invForm.due, status: invForm.status,
        paid_date: invForm.status === "Paid" && invForm.paidDate ? invForm.paidDate : null, notes: invForm.notes || "", line_items: lineItems,
        bank_account_name: invForm.bankAccountName || null, bank_account_number: invForm.bankAccountNumber || null, bank_iban: invForm.bankIban || null, bank_name: invForm.bankName || null,
        registration_number: invForm.registrationNumber || null, ntn: invForm.ntn || null,
      })
      .then(
        () => {
          setInvDrawerId(null);
          pushToast("Invoice created successfully.");
          loadFinance();
        },
        (err: Error) => pushToast(err.message, "error")
      );
  };
  const downloadInvoicePdf = () => {
    if (!pdfInvoiceRaw) return;
    const token = localStorage.getItem("orbit_token");
    fetch("/api/finance/invoices/" + pdfInvoiceRaw.id + "/pdf", { headers: token ? { Authorization: "Bearer " + token } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (pdfInvoiceRaw.invoice_number || pdfInvoiceRaw.id) + ".pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  };

  // ---- Expenses ----
  const [expSearch, setExpSearch] = useState("");
  const [expCategory, setExpCategory] = useState("");
  const [expStatus, setExpStatus] = useState("");
  const [expDept, setExpDept] = useState("");
  const [expDrawerId, setExpDrawerId] = useState<string | null>(null);
  const [expForm, setExpForm] = useState({ category: "", amount: "", currency: "USD", date: todayISO(), dept: "", notes: "" });

  const financeExpenseRows = expenses
    .map((e) => ({ ...e, submittedBy: e.submitted_by_name || "Unknown", date: e.submitted_date || "—", amountStr: moneyC(e.amount, e.currency || "USD"), statusTone: e.status === "Approved" ? "success" : e.status === "Rejected" ? "danger" : "warning", typeStr: e.expense_type || "Operational" }))
    .filter((e) => {
      const q = expSearch.trim().toLowerCase();
      if (q && !(e.category.toLowerCase().includes(q) || e.submittedBy.toLowerCase().includes(q))) return false;
      if (expCategory && e.category !== expCategory) return false;
      if (expStatus && e.status !== expStatus) return false;
      if (expDept && e.department !== expDept) return false;
      return true;
    });
  const expFiltersActive = !!(expSearch || expCategory || expStatus || expDept);
  const expCategoryFilterOptions = [{ value: "", label: "All categories" }, ...Array.from(new Set(expenses.map((e) => e.category))).map((c) => ({ value: c, label: c }))];
  const expDeptFilterOptions = [{ value: "", label: "All departments" }, ...DEPARTMENT_OPTIONS];

  const changeExpenseStatus = (id: string, status: string) => {
    expensesApi.update(id, { status }).then(
      () => {
        pushToast("Expense marked as " + status + ".");
        loadFinance();
      },
      (err: Error) => pushToast(err.message, "error")
    );
  };
  const openExpenseDrawer = (id: string) => {
    if (id === "new") setExpForm({ category: "", amount: "", currency: "USD", date: todayISO(), dept: "", notes: "" });
    setExpDrawerId(id);
  };
  const closeExpenseDrawer = () => setExpDrawerId(null);
  const expenseDrawerClosing = useClosingTransition();
  const closeExpenseDrawerAnimated = () => expenseDrawerClosing.closeWithTransition(closeExpenseDrawer);
  const deleteExpense = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this expense? This cannot be undone.")) return;
    expensesApi.remove(id).then(
      () => {
        pushToast("Expense deleted.");
        if (expDrawerId === id) closeExpenseDrawer();
        loadFinance();
      },
      (err: Error) => pushToast(err.message || "Could not delete expense.", "error")
    );
  };
  const isNewExpense = expDrawerId === "new";
  const expenseDrawerRaw = expDrawerId && !isNewExpense ? expenses.find((e) => e.id === expDrawerId) : null;

  const setExpenseFieldLive = (id: string, field: string, val: string) => {
    const parsedVal = field === "amount" ? numVal(val) : val;
    setExpenses((cur) => cur.map((e) => (e.id === id ? { ...e, [field]: parsedVal } : e)));
    expensesApi.update(id, { [field]: parsedVal }).catch((err: Error) => pushToast(err.message || "Could not save that change.", "error"));
  };

  const submitNewExpense = () => {
    if (!expForm.category || !expForm.amount || !expForm.date || !expForm.dept) {
      pushToast("Please fill all required fields.", "error");
      return;
    }
    expensesApi
      .create({ category: expForm.category, amount: numVal(expForm.amount), currency: expForm.currency, expense_type: "Operational", department: expForm.dept, submitted_by_id: currentUser?.id, submitted_date: expForm.date, notes: expForm.notes || "" })
      .then(
        () => {
          setExpDrawerId(null);
          pushToast("Expense submitted.");
          loadFinance();
        },
        (err: Error) => pushToast(err.message, "error")
      );
  };

  // ---- Payroll ----
  const payrollMonthLabel = (() => {
    const [y, m] = payrollMonth.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  })();
  const payrollRows = slips.map((s) => ({
    id: s.employee_id, name: s.employee_name || "Unknown", role: s.employee_role || "Unknown", dept: s.employee_department || "Unknown",
    grossStr: moneyPKR(s.gross_salary), netStr: moneyPKR(s.net_salary), paidStatus: s.payment_status,
    paidTone: s.payment_status === "Paid" ? "success" : "neutral",
  }));

  const togglePayrollPaid = (employeeId: string, current: string) => {
    const slip = slips.find((s) => s.employee_id === employeeId);
    if (!slip) return;
    const nextStatus = current === "Paid" ? "Unpaid" : "Paid";
    setSlips((cur) => cur.map((s) => (s.employee_id === employeeId ? { ...s, payment_status: nextStatus, payment_date: nextStatus === "Paid" ? todayISO() : null } : s)));
    payrollApi.update(slip.id, { payment_status: nextStatus }).then(
      () => {
        pushToast("Salary marked as " + nextStatus + ".");
        loadFinance();
      },
      (err: Error) => {
        pushToast(err.message, "error");
        loadFinance();
      }
    );
  };

  const [salarySlipEmpId, setSalarySlipEmpId] = useState<string | null>(null);
  const salarySlipRaw = salarySlipEmpId ? slips.find((s) => s.employee_id === salarySlipEmpId) : null;

  const setSalarySlipFieldLive = (employeeId: string, field: string, val: string) => {
    const slip = slips.find((s) => s.employee_id === employeeId);
    if (!slip) return;
    const parsedVal = ["notes", "payment_status", "deduction_reason"].includes(field) ? val : numVal(val);
    setSlips((cur) =>
      cur.map((s) => {
        if (s.employee_id !== employeeId) return s;
        const next = { ...s, [field]: parsedVal } as SalarySlip;
        next.net_salary = next.gross_salary + next.allowances + next.bonus - next.tax - next.other_deductions;
        return next;
      })
    );
    const fresh = { ...slip, [field]: parsedVal } as SalarySlip;
    fresh.net_salary = fresh.gross_salary + fresh.allowances + fresh.bonus - fresh.tax - fresh.other_deductions;
    payrollApi.update(slip.id, { gross_salary: fresh.gross_salary, tax: fresh.tax, other_deductions: fresh.other_deductions, deduction_reason: fresh.deduction_reason || "", bonus: fresh.bonus, allowances: fresh.allowances, notes: fresh.notes || "", payment_status: fresh.payment_status }).then(
      () => pushToast("Salary slip updated."),
      (err: Error) => pushToast(err.message, "error")
    );
  };

  // ---- Milestones ----
  const [msSearch, setMsSearch] = useState("");
  const [msStatus, setMsStatus] = useState("");
  const [msProject, setMsProject] = useState("");
  const [milestoneFormOpen, setMilestoneFormOpen] = useState(false);
  const milestoneFormClosing = useClosingTransition();
  const closeMilestoneFormAnimated = () => milestoneFormClosing.closeWithTransition(() => setMilestoneFormOpen(false));
  const [msForm, setMsForm] = useState({ projectId: "", description: "", amount: "", currency: "USD", expectedDate: "" });

  const milestoneProjectOptions = projects.map((p) => ({ value: p.id, label: p.name }));
  const financeMilestoneRows = milestones
    .map((m) => ({ ...m, projectName: m.project_name || "", amountStr: moneyC(m.amount, m.currency), statusTone: m.status === "Received" ? "success" : "info" }))
    .filter((m) => {
      const q = msSearch.trim().toLowerCase();
      if (q && !(m.projectName.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))) return false;
      if (msStatus && m.status !== msStatus) return false;
      if (msProject && m.project_id !== msProject) return false;
      return true;
    });
  const msFiltersActive = !!(msSearch || msStatus || msProject);

  const milestoneMonthlyMap: Record<string, number> = {};
  milestones.forEach((m) => {
    const parts = String(m.expected_date || "").split("-");
    let key = "Unscheduled";
    if (parts.length === 3) key = (MONTH_NAMES[parseInt(parts[1], 10) - 1] || "Jan") + " " + parts[0];
    milestoneMonthlyMap[key] = (milestoneMonthlyMap[key] || 0) + toUSD(m.amount, m.currency, 276.52);
  });
  const monthOrder = (k: string) => {
    const p = k.split(" ");
    const mi = MONTH_NAMES.indexOf(p[0]);
    return mi === -1 ? 999999 : parseInt(p[1], 10) * 12 + mi;
  };
  const milestoneMonthlyRows = Object.keys(milestoneMonthlyMap)
    .sort((a, b) => monthOrder(a) - monthOrder(b))
    .map((k) => ({ month: k, totalStr: moneyC(milestoneMonthlyMap[k], "USD") }));

  const changeMilestoneStatus = (id: string, status: string) => {
    milestonesApi.update(id, { status }).then(
      () => {
        pushToast("Milestone marked as " + status + ".");
        loadFinance();
      },
      (err: Error) => pushToast(err.message, "error")
    );
  };
  const deleteMilestone = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this milestone?")) return;
    milestonesApi.remove(id).then(
      () => {
        pushToast("Milestone deleted.");
        loadFinance();
      },
      (err: Error) => pushToast(err.message, "error")
    );
  };
  const submitMilestone = () => {
    if (!msForm.projectId || !msForm.description.trim() || !msForm.expectedDate) {
      pushToast("Please fill all required fields.", "error");
      return;
    }
    if (!(numVal(msForm.amount) > 0)) {
      pushToast("Amount must be a number greater than 0.", "error");
      return;
    }
    milestonesApi.create({ project_id: msForm.projectId, name: msForm.description, amount: numVal(msForm.amount), currency: msForm.currency, expected_date: msForm.expectedDate }).then(
      () => {
        setMilestoneFormOpen(false);
        pushToast("Milestone created.");
        loadFinance();
      },
      (err: Error) => pushToast(err.message, "error")
    );
  };

  return (
    <div className="orbit-subtab-content" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>Finance</h1>
          <div className="orbit-setup-tabs">
            <button className="orbit-setup-tab" style={{ fontWeight: tab === "invoices" ? 600 : 400 }} onClick={() => setTab("invoices")}>Invoices</button>
            <button className="orbit-setup-tab" style={{ fontWeight: tab === "expenses" ? 600 : 400 }} onClick={() => setTab("expenses")}>Expenses</button>
            <button className="orbit-setup-tab" style={{ fontWeight: tab === "payroll" ? 600 : 400 }} onClick={() => setTab("payroll")}>Payroll</button>
            <button className="orbit-setup-tab" style={{ fontWeight: tab === "milestones" ? 600 : 400 }} onClick={() => setTab("milestones")}>Milestones</button>
          </div>
        </div>
        {tab === "invoices" && isFinanceEditor && <Button variant="primary" icon="circle-plus" onClick={() => openInvoiceDrawer("new")}>New Invoice</Button>}
        {tab === "expenses" && isFinanceEditor && <Button variant="primary" icon="circle-plus" onClick={() => openExpenseDrawer("new")}>Log Expense</Button>}
        {tab === "milestones" && isFinanceEditor && <Button variant="primary" icon="circle-plus" onClick={() => { setMsForm({ projectId: "", description: "", amount: "", currency: "USD", expectedDate: "" }); setMilestoneFormOpen(true); }}>Add Milestone</Button>}
      </div>

      {tab === "invoices" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "var(--bg-page)", borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
            <input type="text" placeholder="Search client or project…" value={invSearch} onChange={(e) => setInvSearch(e.target.value)} style={{ flex: 1, minWidth: 180, fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", outline: "none", background: "var(--bg-surface)" }} />
            <select value={invStatus} onChange={(e) => setInvStatus(e.target.value)} style={selectStyle}><option value="">All statuses</option>{INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select value={invCurrency} onChange={(e) => setInvCurrency(e.target.value)} style={selectStyle}><option value="">All currencies</option>{CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <select value={invProject} onChange={(e) => setInvProject(e.target.value)} style={selectStyle}>{invProjectFilterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            {invFiltersActive && <a href="#" onClick={(e) => { e.preventDefault(); setInvSearch(""); setInvStatus(""); setInvCurrency(""); setInvProject(""); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none", whiteSpace: "nowrap" }}>Clear filters</a>}
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th style={thStyle}></th><th style={thStyle}>Client</th><th style={thStyle}>Project</th><th style={thStyle}>Amount</th><th style={thStyle}>Type</th><th style={thStyle}>Due</th><th style={thStyle}>Status</th><th style={thStyle}></th>
              </tr></thead>
              <tbody>
                {financeInvoiceRows.map((i) => (
                  <tr key={i.id} onClick={() => openInvoiceDrawer(i.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                    <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}><a href="#" onClick={(e) => { e.preventDefault(); openInvoiceDrawer(i.id); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none" }}>View in PDF</a></td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{i.client}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{i.project}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{i.amountStr}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{i.installmentStr}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{i.dueStr}</td>
                    <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      <select value={i.status} onChange={(e) => changeInvoiceStatus(i.id, e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" }}>
                        {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      {isFinanceEditor && <a href="#" onClick={(e) => { e.preventDefault(); deleteInvoice(i.id); }} style={{ fontSize: 12.5, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none" }}>Delete</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "expenses" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "var(--bg-page)", borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
            <input type="text" placeholder="Search category or submitter…" value={expSearch} onChange={(e) => setExpSearch(e.target.value)} style={{ flex: 1, minWidth: 180, fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", outline: "none", background: "var(--bg-surface)" }} />
            <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)} style={{ ...selectStyle, maxWidth: 200 }}>{expCategoryFilterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <select value={expStatus} onChange={(e) => setExpStatus(e.target.value)} style={selectStyle}><option value="">All statuses</option>{EXPENSE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select value={expDept} onChange={(e) => setExpDept(e.target.value)} style={selectStyle}>{expDeptFilterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            {expFiltersActive && <a href="#" onClick={(e) => { e.preventDefault(); setExpSearch(""); setExpCategory(""); setExpStatus(""); setExpDept(""); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none", whiteSpace: "nowrap" }}>Clear filters</a>}
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th style={thStyle}></th><th style={thStyle}>Category</th><th style={thStyle}>Amount</th><th style={thStyle}>Type</th><th style={thStyle}>Submitted by</th><th style={thStyle}>Status</th><th style={thStyle}></th>
              </tr></thead>
              <tbody>
                {financeExpenseRows.map((e) => (
                  <tr key={e.id} onClick={() => openExpenseDrawer(e.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                    <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }} onClick={(ev) => ev.stopPropagation()}><a href="#" onClick={(ev) => { ev.preventDefault(); openExpenseDrawer(e.id); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none" }}>View</a></td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{e.category}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{e.amountStr}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{e.typeStr}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{e.submittedBy}</td>
                    <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }} onClick={(ev) => ev.stopPropagation()}>
                      {isFinanceEditor ? (
                        <select value={e.status} onChange={(ev) => changeExpenseStatus(e.id, ev.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" }}>
                          {EXPENSE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <Badge tone={e.statusTone}>{e.status}</Badge>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", whiteSpace: "nowrap" }} onClick={(ev) => ev.stopPropagation()}>
                      {isFinanceEditor && <a href="#" onClick={(ev) => { ev.preventDefault(); deleteExpense(e.id); }} style={{ fontSize: 12.5, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none" }}>Delete</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "payroll" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Month</span>
            <input type="month" value={payrollMonth} onChange={(e) => setPayrollMonth(e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th style={thStyle}>Employee</th><th style={thStyle}>Role</th><th style={thStyle}>Department</th><th style={thStyle}>Gross (monthly)</th><th style={thStyle}>Net (monthly)</th><th style={thStyle}>Paid ({payrollMonthLabel})</th><th></th>
              </tr></thead>
              <tbody>
                {payrollRows.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{p.name}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{p.role}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{p.dept}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{p.grossStr}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{p.netStr}</td>
                    <td style={{ padding: "14px 16px" }}>
                      {canRunPayroll ? (
                        <a href="#" onClick={(e) => { e.preventDefault(); togglePayrollPaid(p.id, p.paidStatus); }} style={{ textDecoration: "none" }}><Badge tone={p.paidTone}>{p.paidStatus}</Badge></a>
                      ) : (
                        <Badge tone={p.paidTone}>{p.paidStatus}</Badge>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}><a href="#" onClick={(e) => { e.preventDefault(); setSalarySlipEmpId(p.id); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none" }}>Salary slip</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "milestones" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "var(--bg-page)", borderRadius: 12, padding: "12px 16px" }}>
            <input type="text" placeholder="Search project or milestone…" value={msSearch} onChange={(e) => setMsSearch(e.target.value)} style={{ flex: 1, minWidth: 180, fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", outline: "none", background: "var(--bg-surface)" }} />
            <select value={msStatus} onChange={(e) => setMsStatus(e.target.value)} style={selectStyle}><option value="">All statuses</option><option value="Expected">Expected</option><option value="Received">Received</option></select>
            <select value={msProject} onChange={(e) => setMsProject(e.target.value)} style={{ ...selectStyle, maxWidth: 220 }}><option value="">All projects</option>{milestoneProjectOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            {msFiltersActive && <a href="#" onClick={(e) => { e.preventDefault(); setMsSearch(""); setMsStatus(""); setMsProject(""); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none", whiteSpace: "nowrap" }}>Clear filters</a>}
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Expected income by month</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {milestoneMonthlyRows.map((m) => (
                <div key={m.month} style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 18px", minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.month}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{m.totalStr}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th style={thStyle}>Project</th><th style={thStyle}>Milestone</th><th style={thStyle}>Amount</th><th style={thStyle}>Expected date</th><th style={thStyle}>Status</th><th style={{ ...thStyle, textAlign: "right" }}></th>
              </tr></thead>
              <tbody>
                {financeMilestoneRows.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{m.projectName}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{m.name}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{m.amountStr}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{m.expected_date}</td>
                    <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                      {isFinanceEditor ? (
                        <select value={m.status} onChange={(e) => changeMilestoneStatus(m.id, e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" }}>
                          <option value="Expected">Expected</option><option value="Received">Received</option>
                        </select>
                      ) : (
                        <Badge tone={m.statusTone}>{m.status}</Badge>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", whiteSpace: "nowrap" }}>{isFinanceEditor && <a href="#" onClick={(e) => { e.preventDefault(); deleteMilestone(m.id); }} style={{ fontSize: 12.5, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none" }}>Delete</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---- Invoice drawer ---- */}
      {invDrawerId && (
        <div className={"crm-overlay-fade" + (invoiceDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={closeInvoiceDrawerAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (invoiceDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: "94vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Invoice</h2>
              <button onClick={closeInvoiceDrawerAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, fontSize: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>View in PDF</div>
                <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 22, fontFamily: "var(--font-sans)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>Upmotion Tech</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>123 Market Street, Suite 400</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>INVOICE</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{pdfInvoiceRaw ? (pdfInvoiceRaw.invoice_number || pdfInvoiceRaw.id) : invForm.invoiceNumber}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 16 }}>
                    <div><span style={{ color: "var(--text-muted)" }}>Issued to</span><br /><b style={{ color: "var(--text-primary)" }}>{pdfInvoiceRaw ? pdfInvoiceRaw.client : invForm.client}</b></div>
                    <div style={{ textAlign: "right" }}><span style={{ color: "var(--text-muted)" }}>Issued</span><br /><span style={{ color: "var(--text-primary)" }}>{(pdfInvoiceRaw ? pdfInvoiceRaw.issue_date : invForm.issueDate) || "Not yet issued"}</span></div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10, marginBottom: 10 }}>
                    {invForm.lineItems.map((li, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                        <span>{li.description || "—"} × {li.qty || 1}</span>
                        <span style={{ color: "var(--text-primary)" }}>{moneyC(numVal(li.qty || "1") * numVal(li.unitPrice), invForm.currency)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", padding: "12px 0", display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 14 }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Total</span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{moneyC(invFormTotal, invForm.currency)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)" }}>
                    <span>Due {invForm.due || "—"}</span>
                    <span>Status: {invForm.status}</span>
                  </div>
                </div>
                {!isNewInvoice && (
                  <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                    <Button variant="primary" onClick={downloadInvoicePdf}>⬇ Download PDF</Button>
                    {isFinanceEditor && invDrawerId && <Button variant="danger" onClick={() => deleteInvoice(invDrawerId)}>Delete Invoice</Button>}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Input label="Invoice No." placeholder="UPM-CZ-2026-001" value={invForm.invoiceNumber} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInvoiceField("invoiceNumber", e.target.value)} />
                <Input label="Client" value={invForm.client} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInvoiceField("client", e.target.value)} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Select label="Currency" options={CURRENCY_OPTIONS} value={invForm.currency} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setInvoiceField("currency", e.target.value)} />
                  <Select label="Status" options={INVOICE_STATUSES.map((s) => ({ value: s, label: s }))} value={invForm.status} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setInvoiceField("status", e.target.value)} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Issue date</label>
                    <input type="date" value={invForm.issueDate} disabled={!isFinanceEditor} onChange={(e) => setInvoiceField("issueDate", e.target.value)} style={{ width: "100%", boxSizing: "border-box", ...dateInputStyle }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Due date</label>
                    <input type="date" value={invForm.due} disabled={!isFinanceEditor} onChange={(e) => setInvoiceField("due", e.target.value)} style={{ width: "100%", boxSizing: "border-box", ...dateInputStyle }} />
                  </div>
                </div>
                {invForm.status === "Paid" && (
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Paid date</label>
                    <input type="date" value={invForm.paidDate} disabled={!isFinanceEditor} onChange={(e) => setInvoiceField("paidDate", e.target.value)} style={{ width: "100%", boxSizing: "border-box", ...dateInputStyle }} />
                  </div>
                )}
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Line items</div>
                    {isFinanceEditor && <a href="#" onClick={(e) => { e.preventDefault(); addInvoiceLineItem(); }} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>+ Add line item</a>}
                  </div>
                  {invForm.lineItems.map((li, idx) => (
                    <div key={idx} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <select value={li.projectId} disabled={!isFinanceEditor} onChange={(e) => setInvoiceLineItemField(idx, "projectId", e.target.value)} style={{ flex: 1, marginRight: 8, fontFamily: "var(--font-sans)", fontSize: 12.5, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)" }}>
                          <option value="">No linked project</option>
                          {projects.filter((p) => p.client !== "Internal").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {invForm.lineItems.length > 1 && isFinanceEditor && <a href="#" onClick={(e) => { e.preventDefault(); removeInvoiceLineItem(idx); }} style={{ fontSize: 12, fontWeight: 600, color: "var(--status-danger-text)", textDecoration: "none", whiteSpace: "nowrap" }}>Remove</a>}
                      </div>
                      {!li.projectId && <input type="text" placeholder="Description" value={li.description} disabled={!isFinanceEditor} onChange={(e) => setInvoiceLineItemField(idx, "description", e.target.value)} style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)" }} />}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Qty</label>
                          <input type="number" min={0} step={1} value={li.qty} disabled={!isFinanceEditor} onChange={(e) => setInvoiceLineItemField(idx, "qty", e.target.value)} style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)" }} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Unit price</label>
                          <input type="number" min={0} step={0.01} value={li.unitPrice} disabled={!isFinanceEditor} onChange={(e) => setInvoiceLineItemField(idx, "unitPrice", e.target.value)} style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)" }} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 12.5, color: "var(--text-secondary)" }}>Line total: <b style={{ color: "var(--text-primary)" }}>{moneyC(numVal(li.qty || "1") * numVal(li.unitPrice), invForm.currency)}</b></div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border-subtle)", fontSize: 14 }}>
                    <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Total</span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{moneyC(invFormTotal, invForm.currency)}</span>
                  </div>
                </div>
                <Input label="Notes (optional)" value={invForm.notes} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInvoiceField("notes", e.target.value)} />
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Company details (optional)</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <Input label="Registration number" value={invForm.registrationNumber} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInvoiceField("registrationNumber", e.target.value)} />
                    <Input label="NTN" value={invForm.ntn} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInvoiceField("ntn", e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Bank details (optional)</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <Input label="Account name" value={invForm.bankAccountName} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInvoiceField("bankAccountName", e.target.value)} />
                    <Input label="Account number" value={invForm.bankAccountNumber} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInvoiceField("bankAccountNumber", e.target.value)} />
                    <Input label="IBAN number" value={invForm.bankIban} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInvoiceField("bankIban", e.target.value)} />
                    <Input label="Bank name" value={invForm.bankName} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInvoiceField("bankName", e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              {!isNewInvoice ? <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{invoiceSaving ? "Saving…" : "All changes saved."}</span> : isFinanceEditor && <Button variant="primary" onClick={submitNewInvoice}>Create Invoice</Button>}
            </div>
          </div>
        </div>
      )}

      {/* ---- Expense drawer ---- */}
      {expDrawerId && (
        <div className={"crm-overlay-fade" + (expenseDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={closeExpenseDrawerAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (expenseDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{isNewExpense ? "Log Expense" : "Expense"}</h2>
              <button onClick={closeExpenseDrawerAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14, fontSize: 14 }}>
              {isNewExpense ? (
                <>
                  <Select label="Category" options={[{ value: "", label: "Select category…" }, ...categories.map((c) => ({ value: c.name, label: c.name }))]} value={expForm.category} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExpForm((f) => ({ ...f, category: e.target.value }))} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Select label="Currency" options={CURRENCY_OPTIONS} value={expForm.currency} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExpForm((f) => ({ ...f, currency: e.target.value }))} />
                    <Input label="Amount" value={expForm.amount} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpForm((f) => ({ ...f, amount: e.target.value }))} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Date</span>
                    <input type="date" value={expForm.date} disabled={!isFinanceEditor} onChange={(e) => setExpForm((f) => ({ ...f, date: e.target.value }))} style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
                  </div>
                  <Select label="Department" options={[{ value: "", label: "Select department…" }, ...DEPARTMENT_OPTIONS]} value={expForm.dept} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExpForm((f) => ({ ...f, dept: e.target.value }))} />
                  <Input label="Description (optional)" multiline rows={3} value={expForm.notes} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpForm((f) => ({ ...f, notes: e.target.value }))} />
                </>
              ) : expenseDrawerRaw ? (
                <>
                  <Select label="Category" options={categories.map((c) => ({ value: c.name, label: c.name }))} value={expenseDrawerRaw.category} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExpenseFieldLive(expenseDrawerRaw.id, "category", e.target.value)} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Select label="Currency" options={CURRENCY_OPTIONS} value={expenseDrawerRaw.currency} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExpenseFieldLive(expenseDrawerRaw.id, "currency", e.target.value)} />
                    <Input label="Amount" value={expenseDrawerRaw.amount} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpenseFieldLive(expenseDrawerRaw.id, "amount", e.target.value)} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Date</span>
                    <input type="date" value={expenseDrawerRaw.submitted_date || ""} disabled={!isFinanceEditor} onChange={(e) => setExpenseFieldLive(expenseDrawerRaw.id, "submitted_date", e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
                  </div>
                  <Select label="Department" options={DEPARTMENT_OPTIONS} value={expenseDrawerRaw.department} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExpenseFieldLive(expenseDrawerRaw.id, "department", e.target.value)} />
                  <Input label="Description (optional)" multiline rows={3} value={expenseDrawerRaw.notes || ""} disabled={!isFinanceEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpenseFieldLive(expenseDrawerRaw.id, "notes", e.target.value)} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, paddingTop: 4 }}>
                    <span style={{ color: "var(--text-secondary)" }}>Submitted by</span>
                    <span style={{ color: "var(--text-primary)" }}>{expenseDrawerRaw.submitted_by_name || "Unknown"}</span>
                  </div>
                  <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid var(--border-subtle)" }}>
                    {isFinanceEditor && <Select label="Status" options={EXPENSE_STATUSES.map((s) => ({ value: s, label: s }))} value={expenseDrawerRaw.status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExpenseFieldLive(expenseDrawerRaw.id, "status", e.target.value)} />}
                  </div>
                </>
              ) : null}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              {!isNewExpense && isFinanceEditor && expDrawerId && <Button variant="danger" onClick={() => deleteExpense(expDrawerId)}>Delete Expense</Button>}
              <Button variant="ghost" onClick={closeExpenseDrawerAnimated}>Close</Button>
              {isNewExpense && isFinanceEditor && <Button variant="primary" onClick={submitNewExpense}>Submit</Button>}
            </div>
          </div>
        </div>
      )}

      {/* ---- Milestone form ---- */}
      {milestoneFormOpen && (
        <div className={"crm-overlay-fade" + (milestoneFormClosing.isClosing ? " orbit-closing" : "")} onClick={closeMilestoneFormAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (milestoneFormClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Add Payment Milestone</h2>
              <button onClick={closeMilestoneFormAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14, fontSize: 14 }}>
              <Select label="Project" options={[{ value: "", label: "Select project…" }, ...milestoneProjectOptions]} value={msForm.projectId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMsForm((f) => ({ ...f, projectId: e.target.value }))} />
              <Input label="Milestone description" value={msForm.description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMsForm((f) => ({ ...f, description: e.target.value }))} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Select label="Currency" options={CURRENCY_OPTIONS} value={msForm.currency} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMsForm((f) => ({ ...f, currency: e.target.value }))} />
                <Input label="Amount" value={msForm.amount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMsForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Expected date</label>
                <input type="date" value={msForm.expectedDate} onChange={(e) => setMsForm((f) => ({ ...f, expectedDate: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", ...dateInputStyle }} />
              </div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              <Button variant="ghost" onClick={closeMilestoneFormAnimated}>Cancel</Button>
              <Button variant="primary" onClick={submitMilestone}>Add Milestone</Button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Salary Slip modal ---- */}
      <Modal open={!!salarySlipRaw} onClose={() => setSalarySlipEmpId(null)} title="Salary Slip" width={820}>
        {salarySlipRaw && (canRunPayroll ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ background: "linear-gradient(135deg, var(--brand-primary), var(--status-info-text, var(--brand-primary)))", borderRadius: 12, padding: "22px 24px", marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 26, color: "#fff", marginBottom: 4 }}>{salarySlipRaw.employee_name || "Unknown"}</div>
              <div style={{ fontSize: 15, color: "rgba(255,255,255,0.85)" }}>{salarySlipRaw.employee_role || "Unknown"} &mdash; {salarySlipRaw.month}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Input label="Gross salary (PKR) — set in Employee record" value={salarySlipRaw.gross_salary} disabled />
              <Input label="Tax (PKR)" value={salarySlipRaw.tax} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSalarySlipFieldLive(salarySlipRaw.employee_id, "tax", e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Input label="Allowances (PKR)" value={salarySlipRaw.allowances} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSalarySlipFieldLive(salarySlipRaw.employee_id, "allowances", e.target.value)} />
              <Input label="Other deductions (PKR)" value={salarySlipRaw.other_deductions} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSalarySlipFieldLive(salarySlipRaw.employee_id, "other_deductions", e.target.value)} />
            </div>
            <Input label="Reason for deduction (optional)" placeholder="e.g. late arrival fine, advance repayment…" value={salarySlipRaw.deduction_reason || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSalarySlipFieldLive(salarySlipRaw.employee_id, "deduction_reason", e.target.value)} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "stretch" }}>
              <Input label="Bonus (PKR)" value={salarySlipRaw.bonus} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSalarySlipFieldLive(salarySlipRaw.employee_id, "bonus", e.target.value)} />
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 18px", background: "var(--bg-page)", borderRadius: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Net salary (PKR)</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: "var(--brand-primary)" }}>{moneyPKR(salarySlipRaw.net_salary)}</span>
              </div>
            </div>
            <Input label="Notes" value={salarySlipRaw.notes || ""} multiline rows={3} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSalarySlipFieldLive(salarySlipRaw.employee_id, "notes", e.target.value)} />
            <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-end" }}><Button variant="primary" onClick={() => setSalarySlipEmpId(null)}>Close</Button></div>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 2 }}>{salarySlipRaw.employee_name || "Unknown"}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 18 }}>{salarySlipRaw.employee_role || "Unknown"} &mdash; {salarySlipRaw.month}</div>
            <Row label="Gross pay" value={moneyPKR(salarySlipRaw.gross_salary)} />
            <Row label="Allowances" value={"+" + moneyPKR(salarySlipRaw.allowances)} />
            <Row label="Bonus" value={"+" + moneyPKR(salarySlipRaw.bonus)} />
            <Row label="Tax" value={"−" + moneyPKR(salarySlipRaw.tax)} />
            <Row label="Other deductions" value={"−" + moneyPKR(salarySlipRaw.other_deductions)} />
            {salarySlipRaw.deduction_reason && <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10, marginTop: -6 }}>Reason: {salarySlipRaw.deduction_reason}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}><span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Net pay</span><span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{moneyPKR(salarySlipRaw.net_salary)}</span></div>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}><Button variant="primary" onClick={() => setSalarySlipEmpId(null)}>Close</Button></div>
          </div>
        ))}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 10 }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
const selectStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)" };
const dateInputStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)" };
