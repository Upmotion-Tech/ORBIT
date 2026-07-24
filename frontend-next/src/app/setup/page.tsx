"use client";

// Port of `screenIsSetup` (template.html:5143-5548, script.js logic at
// 1834-1925, 3600-3740, 5717-5776, 5924-5978). Tabs shown: Stages & Sources,
// Leave & Holidays, Audit Trail, Currency, Employees (owner-only) — matching
// the "leave disabled features disabled" decision, the "User Management" and
// "Permissions" tabs are excluded entirely here (not just hidden), same as
// the original which sets `setupTabIsUserMgmt`/`setupTabIsPermissions` to a
// hardcoded `false` and comments out their tab buttons and content blocks.
// Holiday Calendar within the Leave & Holidays tab is likewise commented out
// in the original and omitted here.

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/app-data-context";
import { useToast } from "@/lib/toast-context";
import {
  employeesApi,
  leadsApi,
  crmSourcesApi,
  expenseCategoriesApi,
  expensesApi,
  leavePolicyApi,
  holidaysApi,
  settingsApi,
  auditLogApi,
  taxSlabsApi,
  taxCertificatesApi,
  moneyPKR,
  numVal,
  formatCommentTimestamp,
  formatActivityTimestamp,
  getEmployeeName,
  derivePersonaFlavor,
  MONTH_NAMES,
  downloadAuthenticatedPdf,
  fromISO,
} from "@/lib/orbit-client";
import { Button, Badge, Input } from "@/design-system/healer-bundle";
import { useClosingTransition } from "@/lib/use-closing-transition";

type CrmSource = { id: string; name: string };
type ExpenseCategory = { id: string; name: string };
type LeavePolicy = { casual_days: number; sick_days: number; annual_days: number };
type Holiday = { id: string; name: string; date: string; end_date?: string | null; day_count: number };
type AuditLogEntry = {
  id: string; created_at?: string; actor_id?: string | null; action: string;
  entity_type?: string; entity_label?: string; detail?: string | null;
};
type TaxSlab = { id: string; min_salary: number; max_salary: number | null; tax_percentage: number; fixed_tax: number; active: boolean };
type FiscalYearOption = { label: string; start_month: string; end_month: string };
type MonthlyTaxSummaryLine = { month: string; employees_paid: number; total_gross: number; total_tax: number };
type MonthlyTaxSummary = { fiscal_year: string; months: MonthlyTaxSummaryLine[]; total_gross: number; total_tax: number };

function fyMonthLabel(month?: string): string {
  if (!month) return "";
  const [y, m] = month.split("-");
  const idx = parseInt(m, 10) - 1;
  if (!y || idx < 0 || idx > 11 || !MONTH_NAMES[idx]) return month;
  return `${MONTH_NAMES[idx]} ${y}`;
}

type SetupTab = "stages" | "leave" | "audit" | "currency" | "employees" | "tax";

export default function SetupPage() {
  const { currentUser } = useAuth();
  const { employees, reloadEmployees, holidays, reloadHolidays, crmStagesList, setCrmStagesList } = useAppData();
  const { pushToast } = useToast();

  const accessLevels = currentUser?.access_levels || [];
  const isOwnerReal = accessLevels.includes("owner");
  const persona = currentUser?.access_level || derivePersonaFlavor(accessLevels);
  const isOwnerPersona = persona === "owner";

  const [setupTab, setSetupTabState] = useState<SetupTab>("stages");

  // ---- Stages & Sources ----
  const [crmNewStageInput, setCrmNewStageInput] = useState("");
  const [apiCrmSources, setApiCrmSources] = useState<CrmSource[]>([]);
  const [crmNewSourceInput, setCrmNewSourceInput] = useState("");
  const [apiExpenseCategories, setApiExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [crmNewExpenseCategoryInput, setCrmNewExpenseCategoryInput] = useState("");

  useEffect(() => {
    crmSourcesApi.list().then((data: CrmSource[]) => setApiCrmSources(data)).catch(() => { });
    expenseCategoriesApi.list().then((data: ExpenseCategory[]) => setApiExpenseCategories(data)).catch(() => { });
  }, []);

  const addCrmStage = () => {
    const name = crmNewStageInput.trim();
    if (!name || crmStagesList.includes(name)) return;
    setCrmStagesList((cur) => [...cur, name]);
    setCrmNewStageInput("");
  };
  const renameCrmStage = (oldName: string) => {
    const next = window.prompt('Rename stage "' + oldName + '" to:', oldName);
    if (!next || !next.trim() || next.trim() === oldName) return;
    const newName = next.trim();
    setCrmStagesList((cur) => cur.map((s) => (s === oldName ? newName : s)));
    leadsApi.list().then(
      (leads: { id: string; stage: string }[]) => {
        const affected = leads.filter((l) => l.stage === oldName);
        Promise.all(affected.map((l) => leadsApi.setStage(l.id, newName))).then(
          () => pushToast('Stage renamed to "' + newName + '".'),
          (err: Error) => pushToast(err.message || "Could not rename the stage on all leads.", "error")
        );
      },
      () => pushToast("Could not rename the stage on all leads.", "error")
    );
  };
  const deleteCrmStage = (name: string) => {
    if (crmStagesList.length <= 1) return;
    if (!window.confirm('Delete stage "' + name + '"? Leads in this stage will move to the first remaining stage.')) return;
    const remaining = crmStagesList.filter((s) => s !== name);
    const fallback = remaining[0] || "New";
    setCrmStagesList(remaining);
    leadsApi.list().then(
      (leads: { id: string; stage: string }[]) => {
        const affected = leads.filter((l) => l.stage === name);
        Promise.all(affected.map((l) => leadsApi.setStage(l.id, fallback))).then(
          () => pushToast('Stage deleted. Affected leads moved to "' + fallback + '".'),
          (err: Error) => pushToast(err.message || "Could not move all affected leads.", "error")
        );
      },
      () => pushToast("Could not move all affected leads.", "error")
    );
  };

  const addCrmSource = () => {
    const name = crmNewSourceInput.trim();
    if (!name || apiCrmSources.some((s) => s.name === name)) return;
    crmSourcesApi.create(name).then(
      (source: CrmSource) => {
        setApiCrmSources((cur) => [...cur, source]);
        setCrmNewSourceInput("");
        pushToast("Source added.");
      },
      (err: Error) => pushToast(err.message || "Could not add source.", "error")
    );
  };
  const renameCrmSource = (oldName: string) => {
    const next = window.prompt('Rename source "' + oldName + '" to:', oldName);
    if (!next || !next.trim() || next.trim() === oldName) return;
    const newName = next.trim();
    const match = apiCrmSources.find((s) => s.name === oldName);
    if (!match) return;
    crmSourcesApi.update(match.id, newName).then(
      (updated: CrmSource) => {
        setApiCrmSources((cur) => cur.map((s) => (s.id === updated.id ? updated : s)));
        leadsApi.list().then(
          (leads: { id: string; source: string }[]) => {
            const affected = leads.filter((l) => l.source === oldName);
            Promise.all(affected.map((l) => leadsApi.update(l.id, { source: newName }))).then(
              () => pushToast('Source renamed to "' + newName + '".'),
              (err: Error) => pushToast(err.message || "Could not rename the source on all leads.", "error")
            );
          },
          () => pushToast("Could not rename the source on all leads.", "error")
        );
      },
      (err: Error) => pushToast(err.message || "Could not rename source.", "error")
    );
  };
  const deleteCrmSource = (name: string) => {
    if (apiCrmSources.length <= 1) return;
    if (!window.confirm('Delete source "' + name + '"? Leads with this source will move to the first remaining source.')) return;
    const match = apiCrmSources.find((s) => s.name === name);
    if (!match) return;
    const remaining = apiCrmSources.filter((s) => s.id !== match.id);
    const fallback = (remaining[0] && remaining[0].name) || "Other";
    crmSourcesApi.remove(match.id).then(
      () => {
        setApiCrmSources(remaining);
        leadsApi.list().then(
          (leads: { id: string; source: string }[]) => {
            const affected = leads.filter((l) => l.source === name);
            Promise.all(affected.map((l) => leadsApi.update(l.id, { source: fallback }))).then(
              () => pushToast('Source deleted. Affected leads moved to "' + fallback + '".'),
              (err: Error) => pushToast(err.message || "Could not move all affected leads.", "error")
            );
          },
          () => pushToast("Could not move all affected leads.", "error")
        );
      },
      (err: Error) => pushToast(err.message || "Could not delete source.", "error")
    );
  };

  const addExpenseCategory = () => {
    const name = crmNewExpenseCategoryInput.trim();
    if (!name || apiExpenseCategories.some((c) => c.name === name)) return;
    expenseCategoriesApi.create(name).then(
      (cat: ExpenseCategory) => {
        setApiExpenseCategories((cur) => [...cur, cat]);
        setCrmNewExpenseCategoryInput("");
        pushToast("Category added.");
      },
      (err: Error) => pushToast(err.message || "Could not add category.", "error")
    );
  };
  const deleteExpenseCategory = (id: string, name: string) => {
    // No confirm dialog, per the original — acts immediately.
    if (apiExpenseCategories.length <= 1) return;
    const remaining = apiExpenseCategories.filter((c) => c.id !== id);
    const fallback = (remaining[0] && remaining[0].name) || "Other";
    expenseCategoriesApi.remove(id).then(
      () => {
        setApiExpenseCategories(remaining);
        expensesApi.list().then(
          (expenses: { id: string; category: string }[]) => {
            const affected = expenses.filter((e) => e.category === name);
            Promise.all(affected.map((e) => expensesApi.update(e.id, { category: fallback }))).then(
              () => pushToast('Category deleted. Affected expenses moved to "' + fallback + '".'),
              (err: Error) => pushToast(err.message || "Could not move all affected expenses.", "error")
            );
          },
          () => pushToast("Could not move all affected expenses.", "error")
        );
      },
      (err: Error) => pushToast(err.message || "Could not delete category.", "error")
    );
  };

  // ---- Leave & Holidays ----
  const [apiLeavePolicy, setApiLeavePolicy] = useState<LeavePolicy | null>(null);
  const [leavePolicyForm, setLeavePolicyForm] = useState<LeavePolicy | null>(null);
  useEffect(() => {
    leavePolicyApi.get().then((data: LeavePolicy) => setApiLeavePolicy(data)).catch(() => null);
  }, []);
  const companyLeavePolicy = leavePolicyForm || apiLeavePolicy || { casual_days: 12, sick_days: 7, annual_days: 14 };
  const setLeavePolicyField = (field: "casual_days" | "sick_days" | "annual_days", val: number) => {
    setLeavePolicyForm({ ...companyLeavePolicy, [field]: val });
  };
  const saveLeavePolicy = () => {
    const f = leavePolicyForm || companyLeavePolicy;
    leavePolicyApi.update(f).then(
      (policy: LeavePolicy) => {
        setApiLeavePolicy(policy);
        setLeavePolicyForm(null);
        pushToast("Leave policy updated.");
      },
      (err: Error) => pushToast(err.message || "Could not update leave policy.", "error")
    );
  };

  // ---- Holiday Calendar ----
  // Can be added in advance or after the dates have already passed (backend
  // retroactively erases any "Present" attendance already marked for days
  // now covered, and notifies every employee either way — see
  // HolidayService.create_holiday). Blocking attendance on these dates is
  // enforced entirely server-side (AttendanceService); this tab is just
  // add/list/delete.
  const [holidayFormOpen, setHolidayFormOpen] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ name: "", startDate: "", endDate: "" });
  const [savingHoliday, setSavingHoliday] = useState(false);

  const openNewHolidayForm = () => {
    setHolidayForm({ name: "", startDate: "", endDate: "" });
    setHolidayFormOpen(true);
  };
  const cancelHolidayForm = () => setHolidayFormOpen(false);

  const holidayDayCount = (() => {
    if (!holidayForm.startDate) return 0;
    const start = new Date(holidayForm.startDate + "T00:00:00");
    const end = holidayForm.endDate ? new Date(holidayForm.endDate + "T00:00:00") : start;
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000);
    return diffDays < 0 ? 0 : diffDays + 1;
  })();

  const saveHoliday = () => {
    if (savingHoliday) return;
    const name = holidayForm.name.trim();
    if (!name || !holidayForm.startDate) {
      pushToast("Title and start date are required.", "error");
      return;
    }
    if (holidayForm.endDate && holidayForm.endDate < holidayForm.startDate) {
      pushToast("End date can't be before start date.", "error");
      return;
    }
    setSavingHoliday(true);
    holidaysApi.create({
      name,
      date: holidayForm.startDate,
      end_date: holidayForm.endDate || null,
    }).then(
      (holiday: Holiday) => {
        setSavingHoliday(false);
        setHolidayFormOpen(false);
        reloadHolidays();
        pushToast(`${holiday.name} added — every employee has been notified.`);
      },
      (err: Error) => {
        setSavingHoliday(false);
        pushToast(err.message || "Could not add holiday.", "error");
      }
    );
  };

  const deleteHoliday = (holiday: Holiday) => {
    if (!window.confirm(`Delete "${holiday.name}"?`)) return;
    holidaysApi.remove(holiday.id).then(
      () => reloadHolidays(),
      (err: Error) => pushToast(err.message || "Could not delete holiday.", "error")
    );
  };

  // Holidays accumulate year over year — default the list to the current
  // year so it stays a short, relevant "what's coming up / what already
  // happened this year" view rather than every holiday ever added, with a
  // picker to look at any other year that actually has holidays in it.
  const currentYear = new Date().getFullYear();
  const [holidayYear, setHolidayYear] = useState(currentYear);
  const holidayYearOptions = Array.from(
    new Set(holidays.map((h: Holiday) => parseInt(h.date.slice(0, 4), 10)).concat([currentYear]))
  ).sort((a, b) => b - a);
  const holidaysInYear = holidays.filter((h: Holiday) => {
    const startYear = parseInt(h.date.slice(0, 4), 10);
    const endYear = h.end_date ? parseInt(h.end_date.slice(0, 4), 10) : startYear;
    return holidayYear >= startYear && holidayYear <= endYear;
  });

  // ---- Audit Trail (lazy-loaded on first visit to the tab, per original) ----
  const [apiAuditLog, setApiAuditLog] = useState<AuditLogEntry[] | null>(null);
  const loadAuditLog = () => {
    auditLogApi.list().then(
      (data: AuditLogEntry[]) => setApiAuditLog(data),
      () => pushToast("Could not load audit trail.", "error")
    );
  };

  const setSetupTab = (id: SetupTab) => {
    setSetupTabState(id);
    if (id === "audit" && apiAuditLog === null) loadAuditLog();
  };

  // ---- Currency ----
  const [currencyBaseCurrency, setCurrencyBaseCurrency] = useState("USD");
  const [currencyRate, setCurrencyRate] = useState(280);
  const [currencyRateInput, setCurrencyRateInput] = useState("280");
  const [currencyUpdatedAt, setCurrencyUpdatedAt] = useState<string | null>(null);
  const [currencyUpdatedBy, setCurrencyUpdatedBy] = useState<string | null>(null);
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyFieldError, setCurrencyFieldError] = useState<string | null>(null);

  useEffect(() => {
    settingsApi.getCurrency().then(
      (data: { base_currency: string; usd_to_pkr_rate: number; updated_at?: string; updated_by?: string }) => {
        setCurrencyBaseCurrency(data.base_currency);
        setCurrencyRate(data.usd_to_pkr_rate);
        setCurrencyRateInput(String(data.usd_to_pkr_rate));
        setCurrencyUpdatedAt(data.updated_at || null);
        setCurrencyUpdatedBy(data.updated_by || null);
      },
      () => { }
    );
  }, []);

  const saveCurrencyRate = () => {
    if (currencySaving) return;
    const val = Number(currencyRateInput);
    if (!currencyRateInput || isNaN(val) || val <= 0) {
      setCurrencyFieldError("Enter a positive decimal number.");
      return;
    }
    setCurrencySaving(true);
    setCurrencyFieldError(null);
    settingsApi.updateCurrency(val).then(
      (data: { usd_to_pkr_rate: number; updated_at?: string; updated_by?: string }) => {
        setCurrencySaving(false);
        setCurrencyRate(data.usd_to_pkr_rate);
        setCurrencyRateInput(String(data.usd_to_pkr_rate));
        setCurrencyUpdatedAt(data.updated_at || null);
        setCurrencyUpdatedBy(data.updated_by || null);
        pushToast("Exchange rate updated successfully.");
      },
      (err: Error) => {
        setCurrencySaving(false);
        pushToast(err.message || "Could not update the exchange rate.", "error");
      }
    );
  };

  // ---- Employees (owner-only account management) ----
  const [deleteAccountConfirmId, setDeleteAccountConfirmId] = useState<string | null>(null);
  const [deleteAccountConfirmName, setDeleteAccountConfirmName] = useState("");

  const deactivateSetupEmployee = (id: string, name: string) => {
    employeesApi.deactivate(id).then(
      () => {
        pushToast(name + "’s account has been deactivated.");
        reloadEmployees();
      },
      (err: Error) => pushToast(err.message || "Could not deactivate account.", "error")
    );
  };
  const activateSetupEmployee = (id: string, name: string) => {
    employeesApi.activate(id).then(
      () => {
        pushToast(name + "’s account has been reactivated.");
        reloadEmployees();
      },
      (err: Error) => pushToast(err.message || "Could not activate account.", "error")
    );
  };
  const askDeleteEmployeeAccount = (id: string, name: string) => {
    setDeleteAccountConfirmId(id);
    setDeleteAccountConfirmName(name);
  };
  const cancelDeleteEmployeeAccount = () => {
    setDeleteAccountConfirmId(null);
    setDeleteAccountConfirmName("");
  };
  const deleteAccountClosing = useClosingTransition();
  const cancelDeleteEmployeeAccountAnimated = () => deleteAccountClosing.closeWithTransition(cancelDeleteEmployeeAccount);
  const confirmDeleteEmployeeAccount = () => {
    const id = deleteAccountConfirmId;
    const name = deleteAccountConfirmName;
    if (!id) return;
    employeesApi.deletePermanent(id).then(
      () => {
        setDeleteAccountConfirmId(null);
        setDeleteAccountConfirmName("");
        pushToast(name + "’s account and all their data have been permanently deleted.");
        reloadEmployees();
      },
      (err: Error) => {
        setDeleteAccountConfirmId(null);
        setDeleteAccountConfirmName("");
        pushToast(err.message || "Could not delete this account.", "error");
      }
    );
  };

  // ---- Tax Slabs (owner-only) ----
  // Annual income-tax brackets the payroll engine reads Income Tax from
  // (see backend/app/services/tax_slab_service.py) — min/max here are
  // ANNUAL figures, not monthly, matching how Pakistani salary tax slabs
  // actually work (annualize monthly gross x12, then match).
  const [taxSlabs, setTaxSlabs] = useState<TaxSlab[]>([]);
  const [taxSlabFormOpen, setTaxSlabFormOpen] = useState(false);
  const [editingTaxSlabId, setEditingTaxSlabId] = useState<string | null>(null);
  const [taxSlabForm, setTaxSlabForm] = useState({ minSalary: "", maxSalary: "", taxPercentage: "", fixedTax: "" });
  const [taxSlabSaving, setTaxSlabSaving] = useState(false);

  useEffect(() => {
    taxSlabsApi.list().then((data: TaxSlab[]) => setTaxSlabs(data)).catch(() => { });
  }, []);

  // ---- Year-end Tax Certificates: monthly deduction summary + company
  // statement. Every figure here is read fresh from SalarySlip rows (no
  // separate certificate table) — see TaxCertificateService on the backend.
  const isOwnerDept = currentUser?.department === "Owner";
  const [summaryYears, setSummaryYears] = useState<FiscalYearOption[]>([]);
  const [summaryFy, setSummaryFy] = useState("");
  const [monthlySummary, setMonthlySummary] = useState<MonthlyTaxSummary | null>(null);
  const [companyYears, setCompanyYears] = useState<FiscalYearOption[]>([]);
  const [companyFy, setCompanyFy] = useState("");
  const [downloadingCompanyCert, setDownloadingCompanyCert] = useState(false);

  useEffect(() => {
    taxCertificatesApi.summaryYears().then((years: FiscalYearOption[]) => {
      setSummaryYears(years);
      if (years.length) setSummaryFy(years[0].label);
    }).catch(() => { });
  }, []);

  useEffect(() => {
    if (isOwnerDept) {
      taxCertificatesApi.companyYears().then((years: FiscalYearOption[]) => {
        setCompanyYears(years);
        if (years.length) setCompanyFy(years[0].label);
      }).catch(() => { });
    }
  }, [isOwnerDept]);

  useEffect(() => {
    if (!summaryFy) return;
    taxCertificatesApi.monthlySummary(summaryFy).then(
      (data: MonthlyTaxSummary) => setMonthlySummary(data),
      () => setMonthlySummary(null)
    );
  }, [summaryFy]);

  const downloadCompanyTaxCertificate = async () => {
    if (!companyFy || downloadingCompanyCert) return;
    setDownloadingCompanyCert(true);
    try {
      await downloadAuthenticatedPdf(taxCertificatesApi.companyPdfUrl(companyFy), `company-tax-statement-${companyFy}.pdf`);
    } catch (err) {
      pushToast((err as Error).message || "Could not generate the company tax certificate.", "error");
    } finally {
      setDownloadingCompanyCert(false);
    }
  };

  const openNewTaxSlabForm = () => {
    setEditingTaxSlabId(null);
    setTaxSlabForm({ minSalary: "", maxSalary: "", taxPercentage: "", fixedTax: "0" });
    setTaxSlabFormOpen(true);
  };
  const openEditTaxSlabForm = (slab: TaxSlab) => {
    setEditingTaxSlabId(slab.id);
    setTaxSlabForm({
      minSalary: String(slab.min_salary),
      maxSalary: slab.max_salary == null ? "" : String(slab.max_salary),
      taxPercentage: String(slab.tax_percentage),
      fixedTax: String(slab.fixed_tax),
    });
    setTaxSlabFormOpen(true);
  };
  const cancelTaxSlabForm = () => {
    setTaxSlabFormOpen(false);
    setEditingTaxSlabId(null);
  };
  const saveTaxSlab = () => {
    if (taxSlabSaving) return;
    const minSalary = numVal(taxSlabForm.minSalary);
    const maxSalary = taxSlabForm.maxSalary.trim() === "" ? null : numVal(taxSlabForm.maxSalary);
    const taxPercentage = numVal(taxSlabForm.taxPercentage);
    const fixedTax = numVal(taxSlabForm.fixedTax || "0");
    if (!taxSlabForm.minSalary.trim() || isNaN(minSalary) || minSalary < 0) {
      pushToast("Enter a valid minimum salary.", "error");
      return;
    }
    if (maxSalary !== null && (isNaN(maxSalary) || maxSalary <= minSalary)) {
      pushToast("Max salary must be greater than min salary (or left blank for no upper limit).", "error");
      return;
    }
    if (!taxSlabForm.taxPercentage.trim() || isNaN(taxPercentage) || taxPercentage < 0 || taxPercentage > 100) {
      pushToast("Enter a valid tax percentage (0–100).", "error");
      return;
    }
    setTaxSlabSaving(true);
    const payload = { min_salary: minSalary, max_salary: maxSalary, tax_percentage: taxPercentage, fixed_tax: fixedTax };
    const req = editingTaxSlabId ? taxSlabsApi.update(editingTaxSlabId, payload) : taxSlabsApi.create(payload);
    req.then(
      (saved: TaxSlab) => {
        setTaxSlabSaving(false);
        setTaxSlabFormOpen(false);
        setEditingTaxSlabId(null);
        setTaxSlabs((cur) => {
          const exists = cur.some((s) => s.id === saved.id);
          const next = exists ? cur.map((s) => (s.id === saved.id ? saved : s)) : [...cur, saved];
          return next.slice().sort((a, b) => a.min_salary - b.min_salary);
        });
        pushToast(editingTaxSlabId ? "Tax slab updated." : "Tax slab added.");
      },
      (err: Error) => {
        setTaxSlabSaving(false);
        pushToast(err.message || "Could not save the tax slab.", "error");
      }
    );
  };
  const toggleTaxSlabActive = (slab: TaxSlab) => {
    taxSlabsApi.update(slab.id, { active: !slab.active }).then(
      (updated: TaxSlab) => setTaxSlabs((cur) => cur.map((s) => (s.id === updated.id ? updated : s))),
      (err: Error) => pushToast(err.message || "Could not update the tax slab.", "error")
    );
  };
  const deleteTaxSlab = (slab: TaxSlab) => {
    if (!window.confirm("Delete this tax slab? This can't be undone.")) return;
    taxSlabsApi.remove(slab.id).then(
      () => {
        setTaxSlabs((cur) => cur.filter((s) => s.id !== slab.id));
        pushToast("Tax slab deleted.");
      },
      (err: Error) => pushToast(err.message || "Could not delete the tax slab.", "error")
    );
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({ fontWeight: active ? 600 : 400 });

  const auditRows = (apiAuditLog || []).map((a) => ({
    ts: formatCommentTimestamp(a.created_at),
    user: a.actor_id ? getEmployeeName(a.actor_id) || a.actor_id : "System",
    action: a.action,
    record: (a.entity_type || "") + ": " + (a.entity_label || ""),
    detail: a.detail || "—",
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>Settings</h1>
        <div className="orbit-setup-tabs">
          <button className="orbit-setup-tab" style={tabBtnStyle(setupTab === "stages")} onClick={() => setSetupTab("stages")}>Stages &amp; Sources</button>
          <button className="orbit-setup-tab" style={tabBtnStyle(setupTab === "leave")} onClick={() => setSetupTab("leave")}>Leave &amp; Holidays</button>
          <button className="orbit-setup-tab" style={tabBtnStyle(setupTab === "audit")} onClick={() => setSetupTab("audit")}>Audit Trail</button>
          <button className="orbit-setup-tab" style={tabBtnStyle(setupTab === "currency")} onClick={() => setSetupTab("currency")}>Currency</button>
          {isOwnerReal && (
            <button className="orbit-setup-tab" style={tabBtnStyle(setupTab === "employees")} onClick={() => setSetupTab("employees")}>Employees</button>
          )}
          {isOwnerReal && (
            <button className="orbit-setup-tab" style={tabBtnStyle(setupTab === "tax")} onClick={() => setSetupTab("tax")}>Tax Slabs</button>
          )}
        </div>
      </div>

      <div className="orbit-setup-content">
        {setupTab === "currency" && (
          <div style={{ maxWidth: 480, background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Currency Settings</h2>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Controls the USD ⇄ PKR conversion used everywhere money is shown in a reporting currency.</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "10px 0", borderTop: "1px solid var(--border-subtle)" }}>
              <span style={{ color: "var(--text-muted)" }}>Base currency</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{currencyBaseCurrency}</span>
            </div>
            {isOwnerPersona ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>USD → PKR Exchange Rate</label>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input
                    type="number" step="0.01" min="0" value={currencyRateInput}
                    onChange={(e) => { setCurrencyRateInput(e.target.value); setCurrencyFieldError(null); }}
                    style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 14, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }}
                  />
                  <Button variant="primary" disabled={currencySaving} onClick={saveCurrencyRate}>{currencySaving ? "Saving…" : "Save"}</Button>
                </div>
                {currencyFieldError && <span style={{ fontSize: 12, color: "var(--status-danger-text)" }}>{currencyFieldError}</span>}
              </div>
            ) : (
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 14, fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>{currencyRate} PKR per 1 USD</div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
              <span>Last updated: {currencyUpdatedAt ? formatActivityTimestamp(currencyUpdatedAt) : "—"}</span>
              <span>By: {currencyUpdatedBy || "—"}</span>
            </div>
          </div>
        )}

        {setupTab === "employees" && isOwnerReal && (
          <>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Department</th>
                      <th style={thStyle}>Role</th>
                      <th style={thStyle}>Account</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => {
                      const isSelf = !!(currentUser && currentUser.id === e.id);
                      const active = e.is_active !== false;
                      return (
                        <tr key={e.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{e.name}</td>
                          <td style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{e.email as string}</td>
                          <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{e.department as string}</td>
                          <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{e.role as string}</td>
                          <td style={{ padding: "14px 16px" }}>
                            <Badge tone={active ? "success" : "danger"}>{active ? "Active" : "Deactivated"}</Badge>
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {active && !isSelf && (
                              <a href="#" onClick={(ev) => { ev.preventDefault(); deactivateSetupEmployee(e.id, e.name); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none", whiteSpace: "nowrap" }}>Deactivate</a>
                            )}
                            {!active && !isSelf && (
                              <a href="#" onClick={(ev) => { ev.preventDefault(); activateSetupEmployee(e.id, e.name); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none", whiteSpace: "nowrap" }}>Activate</a>
                            )}
                            {!isSelf && (
                              <a href="#" onClick={(ev) => { ev.preventDefault(); askDeleteEmployeeAccount(e.id, e.name); }} style={{ marginLeft: 14, fontSize: 13, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none", whiteSpace: "nowrap" }}>Delete Account</a>
                            )}
                            {isSelf && <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>You</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Deactivating an account signs that employee out immediately (or on their next action) and blocks them from logging back in until reactivated. Deleting an account is permanent — it removes their login and all of their personal records (leave requests, salary slips, expenses, notifications) and cannot be undone.</div>
          </>
        )}

        {setupTab === "leave" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Company-wide Annual Leave Balances</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                  Casual days / year
                  <input type="number" value={companyLeavePolicy.casual_days} disabled={!isOwnerReal}
                    onChange={(e) => setLeavePolicyField("casual_days", numVal(e.target.value))}
                    style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                  Sick days / year
                  <input type="number" value={companyLeavePolicy.sick_days} disabled={!isOwnerReal}
                    onChange={(e) => setLeavePolicyField("sick_days", numVal(e.target.value))}
                    style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                  Annual days / year
                  <input type="number" value={companyLeavePolicy.annual_days} disabled={!isOwnerReal}
                    onChange={(e) => setLeavePolicyField("annual_days", numVal(e.target.value))}
                    style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                </label>
              </div>
              {isOwnerReal && <Button variant="primary" onClick={saveLeavePolicy}>Save Policy</Button>}
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 12 }}>Every employee&apos;s balance is this allotment minus their approved leave for the year — visible on their profile and in My Leave.</div>
            </div>

            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Holiday Calendar</h2>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Attendance can&apos;t be marked on these dates, and every employee gets notified once a holiday is added — whether it&apos;s announced ahead of time or added after the dates have already passed.</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <select value={holidayYear} onChange={(e) => setHolidayYear(Number(e.target.value))}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", fontSize: 13.5, fontWeight: 600 }}>
                    {holidayYearOptions.map((y: number) => (
                      <option key={y} value={y}>{y}{y === currentYear ? " (current)" : ""}</option>
                    ))}
                  </select>
                  {isOwnerReal && <Button variant="primary" icon="plus" onClick={openNewHolidayForm}>Add Holiday</Button>}
                </div>
              </div>

              {holidayFormOpen && (
                <div style={{ background: "var(--bg-page)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>New Holiday</h3>
                  <Input label="Title" value={holidayForm.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHolidayForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Eid ul-Fitr" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                      Start date
                      <input type="date" value={holidayForm.startDate} onChange={(e) => setHolidayForm((f) => ({ ...f, startDate: e.target.value }))}
                        style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                      End date (optional — blank = single day)
                      <input type="date" value={holidayForm.endDate} onChange={(e) => setHolidayForm((f) => ({ ...f, endDate: e.target.value }))}
                        style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                    </label>
                  </div>
                  {holidayForm.startDate && (
                    <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{holidayDayCount} day{holidayDayCount === 1 ? "" : "s"} total.</div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <Button variant="ghost" onClick={cancelHolidayForm}>Cancel</Button>
                    <Button variant="primary" onClick={saveHoliday}>{savingHoliday ? "Saving…" : "Make Holiday"}</Button>
                  </div>
                </div>
              )}

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={thStyle}>Title</th><th style={thStyle}>Dates</th><th style={thStyle}>Days</th><th></th>
                  </tr></thead>
                  <tbody>
                    {holidaysInYear.map((h: Holiday) => (
                      <tr key={h.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{h.name}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                          {h.end_date && h.end_date !== h.date ? `${fromISO(h.date)} – ${fromISO(h.end_date)}` : fromISO(h.date)}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{h.day_count}</td>
                        <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {isOwnerReal && <a href="#" onClick={(e) => { e.preventDefault(); deleteHoliday(h); }} style={{ fontSize: 13, fontWeight: 600, color: "var(--status-danger-text)", textDecoration: "none" }}>Delete</a>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {holidaysInYear.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No holidays in {holidayYear}.</div>
              )}
            </div>
          </div>
        )}

        {setupTab === "stages" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 }}>
                <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Pipeline Stages</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {crmStagesList.map((s) => (
                    <div key={s} className="orbit-settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                      <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{s}</span>
                      {isOwnerReal && (
                        <div style={{ display: "flex", gap: 14 }}>
                          <a href="#" onClick={(e) => { e.preventDefault(); renameCrmStage(s); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none" }}>Rename</a>
                          <a href="#" onClick={(e) => { e.preventDefault(); deleteCrmStage(s); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none" }}>Delete</a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {isOwnerReal && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="text" placeholder="New stage name" value={crmNewStageInput} onChange={(e) => setCrmNewStageInput(e.target.value)}
                      style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                    <Button variant="secondary" onClick={addCrmStage}>Add Stage</Button>
                  </div>
                )}
              </div>

              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 }}>
                <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Reporting Sources</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {apiCrmSources.map((s) => (
                    <div key={s.id} className="orbit-settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                      <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{s.name}</span>
                      {isOwnerReal && (
                        <div style={{ display: "flex", gap: 14 }}>
                          <a href="#" onClick={(e) => { e.preventDefault(); renameCrmSource(s.name); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none" }}>Rename</a>
                          <a href="#" onClick={(e) => { e.preventDefault(); deleteCrmSource(s.name); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none" }}>Delete</a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {isOwnerReal && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="text" placeholder="New source name" value={crmNewSourceInput} onChange={(e) => setCrmNewSourceInput(e.target.value)}
                      style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                    <Button variant="secondary" onClick={addCrmSource}>Add Source</Button>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 24, background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Expense Categories</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {apiExpenseCategories.map((c) => (
                  <div key={c.id} className="orbit-settings-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px 8px 14px", border: "1px solid var(--border-subtle)", borderRadius: 9999 }}>
                    <span style={{ fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500 }}>{c.name}</span>
                    {isOwnerReal && (
                      <a href="#" onClick={(e) => { e.preventDefault(); deleteExpenseCategory(c.id, c.name); }} style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textDecoration: "none", padding: "0 2px" }}>×</a>
                    )}
                  </div>
                ))}
              </div>
              {isOwnerReal && (
                <div style={{ display: "flex", gap: 8, maxWidth: 420 }}>
                  <input type="text" placeholder="New category name" value={crmNewExpenseCategoryInput} onChange={(e) => setCrmNewExpenseCategoryInput(e.target.value)}
                    style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                  <Button variant="secondary" onClick={addExpenseCategory}>Add Category</Button>
                </div>
              )}
            </div>
          </>
        )}

        {setupTab === "audit" && (
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={thStyle}>Timestamp</th>
                    <th style={thStyle}>User</th>
                    <th style={thStyle}>Action</th>
                    <th style={thStyle}>Record</th>
                    <th style={thStyle}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((a, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{a.ts}</td>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>{a.user}</td>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{a.action}</td>
                      <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{a.record}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditRows.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No audit trail records yet.</div>
              )}
            </div>
          </div>
        )}

        {setupTab === "tax" && isOwnerReal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Income Tax Slabs</h2>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Annual salary brackets payroll uses to auto-calculate every employee&apos;s Income Tax. Ranges are yearly figures — a monthly salary is annualized (×12) before matching.</p>
              </div>
              <Button variant="primary" icon="plus" onClick={openNewTaxSlabForm}>Add Slab</Button>
            </div>

            {taxSlabFormOpen && (
              <div style={{ background: "var(--bg-page)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{editingTaxSlabId ? "Edit Slab" : "New Slab"}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
                  <Input label="Min salary (annual)" type="number" value={taxSlabForm.minSalary} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaxSlabForm((f) => ({ ...f, minSalary: e.target.value }))} />
                  <Input label="Max salary (annual, blank = no limit)" type="number" value={taxSlabForm.maxSalary} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaxSlabForm((f) => ({ ...f, maxSalary: e.target.value }))} />
                  <Input label="Tax %" type="number" value={taxSlabForm.taxPercentage} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaxSlabForm((f) => ({ ...f, taxPercentage: e.target.value }))} />
                  <Input label="Fixed tax" type="number" value={taxSlabForm.fixedTax} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaxSlabForm((f) => ({ ...f, fixedTax: e.target.value }))} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <Button variant="ghost" onClick={cancelTaxSlabForm}>Cancel</Button>
                  <Button variant="primary" onClick={saveTaxSlab}>{taxSlabSaving ? "Saving…" : "Save Slab"}</Button>
                </div>
              </div>
            )}

            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={thStyle}>Salary Range (annual)</th><th style={thStyle}>Tax %</th><th style={thStyle}>Fixed Tax</th><th style={thStyle}>Active</th><th></th>
                  </tr></thead>
                  <tbody>
                    {taxSlabs.map((s) => (
                      <tr key={s.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>{moneyPKR(s.min_salary)} – {s.max_salary == null ? "and above" : moneyPKR(s.max_salary)}</td>
                        <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{s.tax_percentage}%</td>
                        <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{moneyPKR(s.fixed_tax)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <a href="#" onClick={(e) => { e.preventDefault(); toggleTaxSlabActive(s); }} style={{ textDecoration: "none" }}>
                            <Badge tone={s.active ? "success" : "neutral"}>{s.active ? "Active" : "Inactive"}</Badge>
                          </a>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <a href="#" onClick={(e) => { e.preventDefault(); openEditTaxSlabForm(s); }} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-link)", textDecoration: "none", marginRight: 14 }}>Edit</a>
                          <a href="#" onClick={(e) => { e.preventDefault(); deleteTaxSlab(s); }} style={{ fontSize: 13, fontWeight: 600, color: "var(--status-danger-text)", textDecoration: "none" }}>Delete</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {taxSlabs.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No tax slabs configured yet — Income Tax will calculate as Rs. 0 until at least one is added.</div>
              )}
            </div>

            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Monthly Tax Deduction Summary</h2>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Running month-by-month totals of income tax withheld across all employees — track this through the year so year-end certificates reconcile cleanly.</p>
                </div>
                {summaryYears.length > 0 && (
                  <select value={summaryFy} onChange={(e) => setSummaryFy(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", fontSize: 13.5, fontWeight: 600 }}>
                    {summaryYears.map((y) => (
                      <option key={y.label} value={y.label}>{y.label}{y.label === summaryYears[0]?.label ? " (current)" : ""}</option>
                    ))}
                  </select>
                )}
              </div>

              {monthlySummary && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <th style={thStyle}>Month</th><th style={thStyle}>Employees Paid</th><th style={thStyle}>Total Gross Payroll</th><th style={thStyle}>Total Tax Withheld</th>
                    </tr></thead>
                    <tbody>
                      {monthlySummary.months.map((m) => (
                        <tr key={m.month} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "10px 16px", fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>{fyMonthLabel(m.month)}</td>
                          <td style={{ padding: "10px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{m.employees_paid}</td>
                          <td style={{ padding: "10px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{moneyPKR(m.total_gross)}</td>
                          <td style={{ padding: "10px 16px", fontSize: 13.5, color: "var(--text-primary)", fontWeight: 600, whiteSpace: "nowrap" }}>{moneyPKR(m.total_tax)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ padding: "10px 16px", fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>Total ({monthlySummary.fiscal_year})</td>
                        <td></td>
                        <td style={{ padding: "10px 16px", fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{moneyPKR(monthlySummary.total_gross)}</td>
                        <td style={{ padding: "10px 16px", fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{moneyPKR(monthlySummary.total_tax)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {isOwnerDept && (
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 20 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Company Tax Certificate</h2>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-muted)" }}>A company-wide statement of tax deducted from every employee&apos;s salary — available once a fiscal year has fully closed on June 30.</p>
                {companyYears.length > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <select value={companyFy} onChange={(e) => setCompanyFy(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", fontSize: 13.5, fontWeight: 600 }}>
                      {companyYears.map((y) => (
                        <option key={y.label} value={y.label}>{y.label}</option>
                      ))}
                    </select>
                    <Button variant="primary" icon="download" onClick={downloadCompanyTaxCertificate}>{downloadingCompanyCert ? "Generating…" : "Download Certificate"}</Button>
                  </div>
                ) : (
                  <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>No fiscal year has closed yet — the first Company Tax Certificate becomes available on July 1 following the company&apos;s first full fiscal year of payroll records.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {deleteAccountConfirmId && (
        <div className={"crm-overlay-fade" + (deleteAccountClosing.isClosing ? " orbit-closing" : "")} onClick={cancelDeleteEmployeeAccountAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className={"crm-pop" + (deleteAccountClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 400, maxWidth: "90vw", background: "var(--bg-surface)", borderRadius: 12, boxShadow: "var(--shadow-popover)", padding: 24 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>Delete {deleteAccountConfirmName}&apos;s account?</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "var(--text-secondary)" }}>This is permanent. They will no longer be able to log in, and all of their personal data (leave requests, salary slips, expenses, notifications) will be permanently deleted. This cannot be undone.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="ghost" onClick={cancelDeleteEmployeeAccountAnimated}>Cancel</Button>
              <Button variant="danger" onClick={confirmDeleteEmployeeAccount}>Delete Account</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
