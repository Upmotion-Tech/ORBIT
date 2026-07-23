"use client";

// Port of `screenIsDashboard` (template.html:2188-2350, script.js Dashboard
// computations at 4213-4330). Reads leads/projects/finance stats/time
// allocations/category budgets live via useCompanyData() (same sources
// loadLeads/loadProjects/loadFinanceData/loadTimeEntries used).

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { useCompanyData } from "@/lib/use-company-data";
import {
  DASHBOARD_DATE_RANGE_OPTIONS,
  resolveDateRangePreset,
  inDateRange,
  toISO,
  todayISO,
  numVal,
  moneyRep,
  preferencesApi,
  expenseCategoryBudgetsApi,
} from "@/lib/orbit-client";
import { Button, StatCard, Badge } from "@/design-system/healer-bundle";

const STAGE_WEIGHT: Record<string, number> = { New: 0.1, Contacted: 0.2, Proposal: 0.4, Negotiation: 0.65 };

export default function DashboardPage() {
  const { currentUser } = useAuth();
  const { pushToast } = useToast();
  const { leads, projects, financeStats, categoryBudgets, timeAllocations, currencyRate, loading } = useCompanyData();
  const [dashboardCurrency, setDashboardCurrencyState] = useState<"USD" | "PKR">("USD");
  const [switching, setSwitching] = useState(false);
  const [dateRange, setDateRange] = useState("last30");
  const [budgets, setBudgets] = useState(categoryBudgets);

  // keep local editable budget rows in sync once the fetch resolves
  if (budgets !== categoryBudgets && budgets.length === 0 && categoryBudgets.length > 0) {
    setBudgets(categoryBudgets);
  }

  const accessLevels = currentUser?.access_levels || [];
  const isFinanceEditor = accessLevels.includes("owner") || accessLevels.includes("finance");

  const fmt = (usd: number) => moneyRep(usd, dashboardCurrency, currencyRate);

  const setCurrency = (cur: "USD" | "PKR") => {
    if (dashboardCurrency === cur) return;
    setSwitching(true);
    setTimeout(() => {
      setDashboardCurrencyState(cur);
      setSwitching(false);
    }, 150);
    if (currentUser?.id) {
      preferencesApi.setCurrencyPref(currentUser.id, "dashboard", cur).catch(() => {
        pushToast("Could not save currency preference.", "error");
      });
    }
  };

  const dashboardRange = resolveDateRangePreset(dateRange);
  const dashboardLeads = leads.filter((l) => inDateRange(toISO(l.received), dashboardRange));
  const lockedRevenue = dashboardLeads.filter((l) => l.stage === "Won").reduce((s, l) => s + numVal(l.value), 0);
  const invoicedRevenue = financeStats.total_outstanding_usd;
  const overdueReceivable = financeStats.total_outstanding_usd;
  const collectedRevenue = financeStats.total_paid_usd;
  const expectedRevenue = dashboardLeads
    .filter((l) => STAGE_WEIGHT[l.stage])
    .reduce((s, l) => s + numVal(l.value) * STAGE_WEIGHT[l.stage], 0);
  const expensesMonth = financeStats.monthly_expenses_usd;
  const monthlyPayroll = financeStats.payroll_cost_usd;
  const monthlyOutflow = financeStats.monthly_expenses_usd + financeStats.payroll_cost_usd;
  const netCashPosition = collectedRevenue - monthlyOutflow;

  const todayForOverdue = todayISO();
  const delayedProjects = projects
    .filter((p) => p.status === "Delayed")
    .map((p) => {
      let daysOverdueStr = "—";
      if (p.deadline && p.deadline < todayForOverdue) {
        const days = Math.round((new Date(todayForOverdue).getTime() - new Date(p.deadline).getTime()) / 86400000);
        daysOverdueStr = days + (days === 1 ? " day" : " days");
      }
      return { ...p, daysOverdueStr };
    });

  const profitabilityRows = projects
    .filter((p) => p.budget > 0)
    .map((p) => {
      const spent = p.spent || 0;
      const margin = p.budget - spent;
      return {
        name: p.name,
        revenueStr: fmt(p.budget),
        costStr: fmt(spent),
        marginStr: (margin >= 0 ? "+" : "−") + fmt(Math.abs(margin)),
        marginColor: margin >= 0 ? "var(--status-success-text)" : "var(--status-danger-text)",
      };
    });

  const utilizationRows = timeAllocations.map((u) => ({
    name: u.name,
    pctStr: u.pct + "%",
    widthStr: u.pct + "%",
    barColor: u.pct > 0 ? "var(--brand-primary)" : "var(--text-muted)",
  }));

  const budgetRows = (budgets.length ? budgets : categoryBudgets).map((b) => ({
    category: b.category,
    actualStr: fmt(b.actual_usd),
    budgetStr: fmt(b.budget_usd),
    budgetInputVal: b.budget_usd,
    widthStr: Math.min(100, b.budget_usd > 0 ? Math.round((b.actual_usd / b.budget_usd) * 100) : b.actual_usd > 0 ? 100 : 0) + "%",
    barColor: b.actual_usd > b.budget_usd ? "var(--status-danger-text)" : "var(--brand-primary)",
  }));

  const onBudgetChange = (category: string, val: string) => {
    const v = numVal(val);
    setBudgets((cur) => cur.map((b) => (b.category === category ? { ...b, budget_usd: v } : b)));
    expenseCategoryBudgetsApi.set(category, v).catch((err: Error) => {
      pushToast(err.message || "Could not save category budget.", "error");
    });
  };

  const [exportMsg, setExportMsg] = useState("");

  const doExport = (format: "excel" | "pdf") => {
    const token = localStorage.getItem("orbit_token");
    const periodOpt = DASHBOARD_DATE_RANGE_OPTIONS.find((o: { value: string; label: string }) => o.value === dateRange);
    const payload = {
      currency_label: dashboardCurrency === "PKR" ? "PKR (₨)" : "USD ($)",
      fx_note: "1 USD = " + currencyRate + " PKR",
      period_label: periodOpt ? periodOpt.label : "All time",
      revenue: { locked: fmt(lockedRevenue), invoiced: fmt(invoicedRevenue), collected: fmt(collectedRevenue), expected: fmt(expectedRevenue) },
      cash_position: { receivables: fmt(overdueReceivable), payroll_month: fmt(monthlyPayroll), total_cash_out_month: fmt(monthlyOutflow), net_position: fmt(netCashPosition) },
      expenses_month: fmt(expensesMonth),
      delayed_projects: delayedProjects.map((p) => ({ name: p.name, client: p.client, days_overdue: p.daysOverdueStr })),
      profitability: profitabilityRows.map((p) => ({ name: p.name, revenue: p.revenueStr, cost: p.costStr, margin: p.marginStr })),
      utilization: utilizationRows.map((u) => ({ name: u.name, pct: u.pctStr })),
      category_budgets: budgetRows.map((b) => ({ category: b.category, actual: b.actualStr, budget: b.budgetStr })),
    };
    fetch("/api/dashboard/export/" + format, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: JSON.stringify(payload),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Export failed.");
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ORBIT-Dashboard-" + todayISO() + (format === "excel" ? ".xlsx" : ".pdf");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportMsg("Dashboard exported.");
        setTimeout(() => setExportMsg(""), 2500);
      })
      .catch(() => pushToast("Could not export the dashboard. Please try again.", "error"));
  };

  if (loading) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, opacity: switching ? 0.35 : 1, transition: "opacity 0.15s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Company overview</h1>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
            All figures shown in {dashboardCurrency === "PKR" ? "PKR (₨)" : "USD ($)"} · 1 USD = {currencyRate} PKR
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Period</span>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
            >
              {DASHBOARD_DATE_RANGE_OPTIONS.map((opt: { value: string; label: string }) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Report in</span>
            <div className="orbit-pill-toggle" style={{ display: "flex", background: "var(--bg-page)", borderRadius: 9999, padding: 3, gap: 2 }}>
              <button onClick={() => setCurrency("USD")} style={{ border: "none", borderRadius: 9999, padding: "6px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: dashboardCurrency === "USD" ? "#fff" : "transparent", color: dashboardCurrency === "USD" ? "var(--brand-primary)" : "var(--text-secondary)" }}>USD</button>
              <button onClick={() => setCurrency("PKR")} style={{ border: "none", borderRadius: 9999, padding: "6px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: dashboardCurrency === "PKR" ? "#fff" : "transparent", color: dashboardCurrency === "PKR" ? "var(--brand-primary)" : "var(--text-secondary)" }}>PKR</button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" }}>Revenue</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, marginTop: 10 }}>
          <StatCard label="Won & Contracted (Locked)" value={fmt(lockedRevenue)} delta="+12%" deltaTone="success" />
          <StatCard label="Invoiced, Not Yet Collected" value={fmt(invoicedRevenue)} />
          <StatCard label="Collected" value={fmt(collectedRevenue)} delta="+4%" deltaTone="success" />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" }}>Cash Position — What&apos;s Coming In vs Going Out</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 24, marginTop: 10 }}>
          <MiniCard label="Owed to Us (Receivables)" value={fmt(overdueReceivable)} sub={fmt(overdueReceivable) + " overdue"} subColor="var(--status-danger-text)" />
          <MiniCard label="Payroll / Month" value={fmt(monthlyPayroll)} sub="Recurring Cash-Out" />
          <MiniCard label="Total Cash-Out / Month" value={fmt(monthlyOutflow)} sub="Expenses + Payroll" />
          <MiniCard label="Net Position (Collected − Out)" value={fmt(netCashPosition)} valueColor={netCashPosition >= 0 ? "var(--status-success-text)" : "var(--status-danger-text)"} sub="This Month" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <StatCard label="Expected Revenue (Pipeline, Stage-Weighted)" value={fmt(expectedRevenue)} />
        <StatCard label="Expenses This Month" value={fmt(expensesMonth)} delta="+3%" deltaTone="danger" />
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>Delayed Projects</h2>
          <a href="/dev" style={{ fontSize: 14, fontWeight: 500, color: "var(--text-link)", textDecoration: "none" }}>View Software Dev</a>
        </div>
        <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={thStyle}>Project</th>
              <th style={thStyle}>Client</th>
              <th style={thStyle}>Days overdue</th>
            </tr></thead>
            <tbody>
              {delayedProjects.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{p.name}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{p.client}</td>
                  <td style={{ padding: "14px 16px" }}><Badge tone="danger">{p.daysOverdueStr}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>Project Profitability</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {profitabilityRows.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>Revenue {p.revenueStr} − cost {p.costStr}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: p.marginColor, flexShrink: 0, marginLeft: 12 }}>{p.marginStr}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>Resource Utilization</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {utilizationRows.map((u, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{u.name}</span>
                  <span>{u.pctStr} billable</span>
                </div>
                <div style={{ height: 8, borderRadius: 9999, background: "var(--border-subtle)", overflow: "hidden" }}>
                  <div style={{ width: u.widthStr, height: "100%", background: u.barColor, borderRadius: 9999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>Expenses by Category — Budget vs. Actual</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {budgetRows.map((b, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{b.category}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span>{b.actualStr} of</span>
                  {isFinanceEditor ? (
                    <input
                      type="number"
                      min={0}
                      value={b.budgetInputVal}
                      onChange={(e) => onBudgetChange(b.category, e.target.value)}
                      style={{ width: 88, fontFamily: "var(--font-sans)", fontSize: 12.5, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border-subtle)" }}
                    />
                  ) : (
                    <span>{b.budgetStr}</span>
                  )}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 9999, background: "var(--border-subtle)", overflow: "hidden" }}>
                <div style={{ width: b.widthStr, height: "100%", background: b.barColor, borderRadius: 9999 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Button variant="secondary" icon="file-text" onClick={() => doExport("excel")}>Export as Excel</Button>
        <Button variant="secondary" icon="file-text" onClick={() => doExport("pdf")}>Export as PDF</Button>
        {exportMsg && <span style={{ fontSize: 13, color: "var(--status-success-text)" }}>{exportMsg}</span>}
      </div>
    </div>
  );
}

function MiniCard({ label, value, sub, subColor, valueColor }: { label: string; value: string; sub: string; subColor?: string; valueColor?: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 18 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: valueColor || "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: 12, color: subColor || "var(--text-muted)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
