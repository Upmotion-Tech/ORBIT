"use client";

// Port of `screenIsMeRecord` (template.html:5130-5141) — reads the same
// real salary-slip record Payroll itself edits (script.js:5699-5715), not a
// hardcoded gross/net approximation. Extended with the rest of the
// employee's own record (manager, start date, birthdate, phone, emergency
// contact, etc.) per an explicit request that this stay strictly
// read-only — no edit controls anywhere on this page. The salary card
// mirrors Finance's own read-only Salary Slip breakdown (finance/page.tsx's
// `canRunPayroll ? ... : (...)` non-editable branch) field-for-field, so an
// employee sees exactly the same gross/allowances/bonus/tax/deductions
// breakdown Finance sees, just without edit controls.

import { useEffect, useState } from "react";
import { payrollApi, todayISO, moneyPKR, fromISO, MONTH_NAMES } from "@/lib/orbit-client";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/app-data-context";

type SalarySlip = {
  employee_id: string;
  month: string;
  gross_salary: number;
  allowances: number;
  bonus: number;
  tax: number;
  other_deductions: number;
  deduction_reason?: string | null;
  net_salary: number;
};

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value || "—"}</span>
    </div>
  );
}

function monthLabel(month?: string): string {
  if (!month) return "";
  const [y, m] = month.split("-");
  const idx = parseInt(m, 10) - 1;
  if (!y || idx < 0 || idx > 11 || !MONTH_NAMES[idx]) return month;
  return `${MONTH_NAMES[idx]} ${y}`;
}

const cardStyle: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 };

export default function MeRecordPage() {
  const { currentUser } = useAuth();
  const { employees } = useAppData();
  const [slip, setSlip] = useState<SalarySlip | null>(null);

  useEffect(() => {
    const month = todayISO().slice(0, 7);
    payrollApi.list({ month }).then(
      (slips: SalarySlip[]) => {
        const mine = (slips || []).find((s) => s.employee_id === currentUser?.id) || null;
        setSlip(mine);
      },
      () => setSlip(null)
    );
  }, [currentUser?.id]);

  const myEmployee = employees.find((e) => e.id === currentUser?.id) || null;
  const emp = myEmployee as Record<string, unknown> | null;

  const emergencyContact = emp?.emergency_contact as string | undefined;
  const emergencyRelation = emp?.emergency_contact_relation as string | undefined;
  const emergencyValue = emergencyContact ? (emergencyRelation ? `${emergencyContact} (${emergencyRelation})` : emergencyContact) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>My Record</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "stretch" }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 4 }}>{currentUser?.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>{(myEmployee?.role as string) || (currentUser?.role as string)}</div>

          <Row label="Department" value={emp?.department as string} />
          <Row label="Manager" value={emp?.manager as string} />
          <Row label="Employment type" value={emp?.employment_type as string} />
          <Row label="Start date" value={fromISO(emp?.start_date as string)} />
          <Row label="Probation status" value={emp?.probation_status as string} />
          <Row label="Date of birth" value={fromISO(emp?.birthdate as string)} />
          <Row label="Phone" value={emp?.phone as string} />
          <Row label="Email" value={emp?.email as string} />
          <Row label="Emergency contact" value={emergencyValue} />
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 2 }}>Latest Salary Slip</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>{slip ? monthLabel(slip.month) : "No salary slip on file yet"}</div>

          {slip ? (
            <>
              <Row label="Gross pay" value={moneyPKR(slip.gross_salary)} />
              <Row label="Allowances" value={"+" + moneyPKR(slip.allowances)} />
              <Row label="Bonus" value={"+" + moneyPKR(slip.bonus)} />
              <Row label="Tax" value={"−" + moneyPKR(slip.tax)} />
              <Row label="Other deductions" value={"−" + moneyPKR(slip.other_deductions)} />
              {slip.deduction_reason && (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "0 0 10px" }}>Reason: {slip.deduction_reason}</div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, paddingTop: 10 }}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Net pay</span>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{moneyPKR(slip.net_salary)}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>Your salary slip for this month hasn&rsquo;t been issued yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
