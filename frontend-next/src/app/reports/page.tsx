"use client";

// Port of `screenIsReports` (template.html:2352-2483, script.js computations
// at 4331-4394). Owner-only screen (only ever linked from the Dashboard
// sidebar item, which itself is owner-gated per dashboardItems).

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/app-data-context";
import { useCompanyData } from "@/lib/use-company-data";
import { REPORTS_DATE_RANGE_OPTIONS, resolveDateRangePreset, inDateRange, toISO, numVal, toUSD, moneyRep, preferencesApi } from "@/lib/orbit-client";
import { useToast } from "@/lib/toast-context";

const ACTIVE_STAGES = ["New", "Contacted", "Proposal", "Negotiation"];
const PROJECT_STATUSES = ["Not Started", "In Progress", "Delayed", "Completed"];

export default function ReportsPage() {
  const { currentUser } = useAuth();
  const { pushToast } = useToast();
  const { employees, leaves } = useAppData();
  const { leads, projects, expenses, financeStats, timeAllocations, openings, currencyRate, loading } = useCompanyData();
  const [reportsCurrency, setReportsCurrencyState] = useState<"USD" | "PKR">("USD");
  const [switching, setSwitching] = useState(false);
  const [dateRange, setDateRange] = useState("last30");

  const fmt = (usd: number) => moneyRep(usd, reportsCurrency, currencyRate);

  const setCurrency = (cur: "USD" | "PKR") => {
    if (reportsCurrency === cur) return;
    setSwitching(true);
    setTimeout(() => {
      setReportsCurrencyState(cur);
      setSwitching(false);
    }, 150);
    if (currentUser?.id) {
      preferencesApi.setCurrencyPref(currentUser.id, "reports", cur).catch(() => pushToast("Could not save currency preference.", "error"));
    }
  };

  if (loading) return null;

  const reportsRange = resolveDateRangePreset(dateRange);
  const reportsLeads = leads.filter((l) => inDateRange(toISO(l.received), reportsRange));
  const wonLeads = reportsLeads.filter((l) => l.stage === "Won");
  const lostLeads = reportsLeads.filter((l) => l.stage === "Lost");
  const activeLeads = reportsLeads.filter((l) => ACTIVE_STAGES.includes(l.stage));
  const pipelineValue = activeLeads.reduce((s, l) => s + numVal(l.value), 0);
  const resolvedCount = wonLeads.length + lostLeads.length;
  const winRatePct = resolvedCount > 0 ? Math.round((wonLeads.length / resolvedCount) * 100) : 0;

  // Finance figures: collected/outstanding/payroll come from the same
  // date-less finance-stats aggregate Dashboard uses (documented backend
  // limitation, not a bug to fix here). Locked/Expected revenue: the
  // original app reused Dashboard's own date-range-filtered figures here
  // (an artifact of one shared render pass computing both screens at
  // once) — now that Dashboard/Reports are separate routes with their own
  // date-range state, this page scopes Locked/Expected to Reports' own
  // date range instead, which is the more intuitive behavior for a page
  // that shows its own date-range selector.
  const STAGE_WEIGHT: Record<string, number> = { New: 0.1, Contacted: 0.2, Proposal: 0.4, Negotiation: 0.65 };
  const reportLockedRevenue = wonLeads.reduce((s, l) => s + numVal(l.value), 0);
  const reportExpectedRevenue = reportsLeads.filter((l) => STAGE_WEIGHT[l.stage]).reduce((s, l) => s + numVal(l.value) * STAGE_WEIGHT[l.stage], 0);
  const reportCollected = financeStats.total_paid_usd;
  const reportOutstanding = financeStats.total_outstanding_usd;
  const reportOverdue = financeStats.total_outstanding_usd;
  const reportOutflow = financeStats.monthly_expenses_usd + financeStats.payroll_cost_usd;
  const reportNet = reportCollected - reportOutflow;

  const pipelineByStage = ACTIVE_STAGES.map((st) => {
    const rows = reportsLeads.filter((l) => l.stage === st);
    return { stage: st, count: rows.length, valueStr: fmt(rows.reduce((s, l) => s + numVal(l.value), 0)) };
  });
  const maxStageCount = Math.max(1, ...pipelineByStage.map((r) => r.count));
  const pipelineByStageBars = pipelineByStage.map((r) => ({ ...r, widthStr: Math.round((r.count / maxStageCount) * 100) + "%" }));

  const sourceGroups: Record<string, { source: string; total: number; won: number; lost: number; value: number }> = {};
  reportsLeads.forEach((l) => {
    if (!sourceGroups[l.source]) sourceGroups[l.source] = { source: l.source, total: 0, won: 0, lost: 0, value: 0 };
    sourceGroups[l.source].total += 1;
    sourceGroups[l.source].value += numVal(l.value);
    if (l.stage === "Won") sourceGroups[l.source].won += 1;
    if (l.stage === "Lost") sourceGroups[l.source].lost += 1;
  });
  const reportSourceRows = Object.values(sourceGroups)
    .sort((a, b) => b.total - a.total)
    .map((g) => {
      const res = g.won + g.lost;
      return { source: g.source, total: g.total, valueStr: fmt(g.value), winRateStr: res > 0 ? Math.round((g.won / res) * 100) + "%" : "—" };
    });

  const expenseByCatMap: Record<string, number> = {};
  expenses.filter((e) => inDateRange(e.submitted_date, reportsRange)).forEach((e) => {
    expenseByCatMap[e.category] = (expenseByCatMap[e.category] || 0) + toUSD(e.amount, e.currency || "USD", currencyRate);
  });
  const reportExpenseByCat = Object.keys(expenseByCatMap)
    .map((k) => ({ category: k, amountUSD: expenseByCatMap[k] }))
    .sort((a, b) => b.amountUSD - a.amountUSD)
    .slice(0, 8)
    .map((r) => ({ category: r.category, amountStr: fmt(r.amountUSD) }));

  const projectsByStatus = PROJECT_STATUSES.map((st) => ({ status: st, count: projects.filter((p) => p.status === st).length }));
  const atRiskCount = projects.filter((p) => p.status === "Delayed").length;
  const activeProjectCount = projects.filter((p) => p.status !== "Completed").length;
  const utilVals = timeAllocations.map((u) => u.pct);
  const avgUtilization = utilVals.length ? Math.round(utilVals.reduce((s, v) => s + v, 0) / utilVals.length) : 0;

  const employeesR = employees.filter((e) => e.status !== "Terminated");
  const headcountByDeptMap: Record<string, number> = {};
  employeesR.forEach((e) => {
    const dept = (e.department as string) || "Unspecified";
    headcountByDeptMap[dept] = (headcountByDeptMap[dept] || 0) + 1;
  });
  const reportHeadcountRows = Object.keys(headcountByDeptMap).map((d) => ({ dept: d, count: headcountByDeptMap[d] }));
  const totalHeadcount = employeesR.length;
  const openPositionsCount = openings.filter((p) => p.status === "Open").length;
  const pendingLeaveCount = leaves.filter((lr) => lr.status === "Pending").length;
  const probationCount = employeesR.filter((e) => e.probation_status === "In Probation").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, opacity: switching ? 0.35 : 1, transition: "opacity 0.15s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Management Reports</h1>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
            Cross-department view for decision-making · figures in {reportsCurrency === "PKR" ? "PKR (₨)" : "USD ($)"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            aria-label="Report date range"
            style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer" }}
          >
            {REPORTS_DATE_RANGE_OPTIONS.map((opt: { value: string; label: string }) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Report in</span>
            <div className="orbit-pill-toggle" style={{ display: "flex", background: "var(--bg-page)", borderRadius: 9999, padding: 3, gap: 2 }}>
              <button onClick={() => setCurrency("USD")} style={{ border: "none", borderRadius: 9999, padding: "6px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: reportsCurrency === "USD" ? "#fff" : "transparent", color: reportsCurrency === "USD" ? "var(--brand-primary)" : "var(--text-secondary)" }}>USD</button>
              <button onClick={() => setCurrency("PKR")} style={{ border: "none", borderRadius: 9999, padding: "6px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: reportsCurrency === "PKR" ? "#fff" : "transparent", color: reportsCurrency === "PKR" ? "var(--brand-primary)" : "var(--text-secondary)" }}>PKR</button>
            </div>
          </div>
        </div>
      </div>

      <section style={sectionStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--brand-primary)", marginBottom: 18 }}>Sales &amp; Pipeline</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 20, marginBottom: 24 }}>
          <Metric label="Open Pipeline Value" value={fmt(pipelineValue)} />
          <Metric label="Win Rate" value={winRatePct + "%"} />
          <Metric label="Active Leads" value={String(activeLeads.length)} />
          <Metric label="Deals Won" value={String(wonLeads.length)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Pipeline by Stage</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pipelineByStageBars.map((s) => (
                <div key={s.stage}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: "var(--text-primary)" }}>{s.stage} ({s.count})</span>
                    <span style={{ color: "var(--text-secondary)" }}>{s.valueStr}</span>
                  </div>
                  <div style={{ height: 8, background: "var(--bg-page)", borderRadius: 9999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: s.widthStr, background: "var(--brand-primary)", borderRadius: 9999 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Leads by Source</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th style={smallTh}>Source</th>
                <th style={{ ...smallTh, textAlign: "right" }}>Leads</th>
                <th style={{ ...smallTh, textAlign: "right" }}>Value</th>
                <th style={{ ...smallTh, textAlign: "right" }}>Win</th>
              </tr></thead>
              <tbody>
                {reportSourceRows.map((r) => (
                  <tr key={r.source} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: 8, fontSize: 13, color: "var(--text-primary)" }}>{r.source}</td>
                    <td style={{ padding: 8, fontSize: 13, color: "var(--text-secondary)", textAlign: "right" }}>{r.total}</td>
                    <td style={{ padding: 8, fontSize: 13, color: "var(--text-primary)", textAlign: "right" }}>{r.valueStr}</td>
                    <td style={{ padding: 8, fontSize: 13, color: "var(--text-secondary)", textAlign: "right" }}>{r.winRateStr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--brand-primary)", marginBottom: 18 }}>Finance &amp; Cash</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 24 }}>
          <div>
            <Metric label="Collected (In)" value={fmt(reportCollected)} small />
          </div>
          <div>
            <Metric label="Outstanding (Owed to Us)" value={fmt(reportOutstanding)} small />
            <div style={{ fontSize: 11, color: "var(--status-danger-text)", marginTop: 2 }}>{fmt(reportOverdue)} overdue</div>
          </div>
          <Metric label="Monthly Cash-Out" value={fmt(reportOutflow)} small />
          <Metric label="Won & Contracted" value={fmt(reportLockedRevenue)} small />
          <Metric label="Expected (Pipeline)" value={fmt(reportExpectedRevenue)} small />
          <Metric label="Net Position / Month" value={fmt(reportNet)} small color={reportNet >= 0 ? "var(--status-success-text)" : "var(--status-danger-text)"} />
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Top Expense Categories</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {reportExpenseByCat.map((c) => (
            <div key={c.category} style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 14px", minWidth: 130 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>{c.category}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{c.amountStr}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <section style={sectionStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--brand-primary)", marginBottom: 18 }}>Delivery (Software Dev)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            <Metric label="Active Projects" value={String(activeProjectCount)} small />
            <Metric label="At Risk" value={String(atRiskCount)} small color="var(--status-danger-text)" />
            <Metric label="Avg Utilization" value={avgUtilization + "%"} small />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {projectsByStatus.map((p) => (
              <div key={p.status} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: 13.5, color: "var(--text-primary)" }}>{p.status}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>{p.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--brand-primary)", marginBottom: 18 }}>People (HR)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            <Metric label="Headcount" value={String(totalHeadcount)} small />
            <Metric label="Open Roles" value={String(openPositionsCount)} small />
            <Metric label="Leave Pending" value={String(pendingLeaveCount)} small />
            <Metric label="On Probation" value={String(probationCount)} small />
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>Headcount by Department</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reportHeadcountRows.map((h) => (
              <div key={h.dept} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: 13.5, color: "var(--text-primary)" }}>{h.dept}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>{h.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, small, color }: { label: string; value: string; small?: boolean; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: small ? 20 : 22, fontWeight: 700, color: color || "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 };
const smallTh: React.CSSProperties = { textAlign: "left", padding: "6px 8px", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
