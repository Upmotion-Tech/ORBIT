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
import { payrollApi, taxCertificatesApi, todayISO, moneyPKR, fromISO, MONTH_NAMES, downloadAuthenticatedPdf } from "@/lib/orbit-client";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/app-data-context";
import { useToast } from "@/lib/toast-context";
import { Icon, Button } from "@/design-system/healer-bundle";
import SmoothScroll from "@/components/shell/SmoothScroll";

type FiscalYearOption = { label: string; start_month: string; end_month: string };

type SalarySlip = {
  id: string;
  employee_id: string;
  month: string;
  gross_salary: number;
  allowances: number;
  bonus: number;
  tax: number;
  other_deductions: number;
  deduction_reason?: string | null;
  net_salary: number;
  payment_status: string;
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
  const { pushToast } = useToast();
  // Own-slips-only endpoint (GET /api/finance/payroll/me) rather than the
  // full month-wide list Finance uses — that endpoint is Finance/Owner-only
  // now (it used to be reachable by any logged-in employee, which meant
  // this page was fetching *everyone's* salary data client-side just to
  // find its own row in it). One fetch covers both the "Latest Salary Slip"
  // card and the full history board below.
  const [mySlips, setMySlips] = useState<SalarySlip[]>([]);

  useEffect(() => {
    payrollApi.me(24).then(
      (slips: SalarySlip[]) => setMySlips(slips || []),
      () => setMySlips([])
    );
  }, [currentUser?.id]);

  // ---- Tax Certificate: only fiscal years (July-June) that have both
  // actually closed on June 30 AND started on/after this employee's own
  // join date are offered — see TaxCertificateService on the backend.
  const [taxYears, setTaxYears] = useState<FiscalYearOption[]>([]);
  const [selectedTaxYear, setSelectedTaxYear] = useState("");
  const [downloadingTaxCert, setDownloadingTaxCert] = useState(false);

  useEffect(() => {
    taxCertificatesApi.myYears().then(
      (years: FiscalYearOption[]) => {
        setTaxYears(years || []);
        if (years?.length) setSelectedTaxYear(years[0].label);
      },
      () => setTaxYears([])
    );
  }, [currentUser?.id]);

  const downloadTaxCertificate = async () => {
    if (!selectedTaxYear || downloadingTaxCert) return;
    setDownloadingTaxCert(true);
    try {
      const fallbackName = `tax-certificate-${(currentUser?.name || "employee").replace(/[^a-zA-Z0-9-_]/g, "")}_${selectedTaxYear}.pdf`;
      await downloadAuthenticatedPdf(taxCertificatesApi.myPdfUrl(selectedTaxYear), fallbackName);
    } catch (err) {
      pushToast((err as Error).message || "Could not generate your tax certificate.", "error");
    } finally {
      setDownloadingTaxCert(false);
    }
  };

  const currentMonthIso = todayISO().slice(0, 7);
  const slip = mySlips.find((s) => s.month === currentMonthIso) || null;

  const downloadSlipPdf = async (slipId: string, month: string) => {
    try {
      await downloadAuthenticatedPdf(`/api/finance/payroll/${slipId}/pdf`, `salary-slip-${(currentUser?.name || "employee").replace(/[^a-zA-Z0-9-_]/g, "")}_${month}.pdf`);
    } catch (err) {
      pushToast((err as Error).message || "Could not download the salary slip PDF.", "error");
    }
  };

  const myEmployee = employees.find((e) => e.id === currentUser?.id) || null;
  const emp = myEmployee as Record<string, unknown> | null;

  const emergencyContact = emp?.emergency_contact as string | undefined;
  const emergencyRelation = emp?.emergency_contact_relation as string | undefined;
  const emergencyValue = emergencyContact ? (emergencyRelation ? `${emergencyContact} (${emergencyRelation})` : emergencyContact) : undefined;

  const contractUrl = emp?.contract_file_url as string | undefined;
  const contractName = (emp?.contract_file_name as string | undefined) || "contract";

  const openContract = async () => {
    if (!contractUrl) return;
    // The contract is served from the DB behind an authenticated endpoint
    // (Render's disk is ephemeral) — a plain <a href> with no auth header
    // would just 401. Fetch with the token and open the bytes as a blob.
    try {
      const token = localStorage.getItem("orbit_token");
      const res = await fetch(contractUrl, { headers: token ? { Authorization: "Bearer " + token } : {} });
      if (!res.ok) throw new Error("Could not load your contract file.");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      pushToast((err as Error).message || "Could not open your contract file.", "error");
    }
  };

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
          <Row label="CNIC" value={emp?.cnic as string} />
          <Row label="Email" value={emp?.email as string} />
          <Row label="Emergency contact" value={emergencyValue} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, padding: "10px 0" }}>
            <span style={{ color: "var(--text-secondary)" }}>Contract</span>
            {contractUrl ? (
              <a href="#" onClick={(e) => { e.preventDefault(); openContract(); }} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>
                <Icon name="file-text" size={16} color="var(--text-link)" />
                Open {contractName}
              </a>
            ) : (
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>—</span>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 2 }}>Latest Salary Slip</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>{slip ? monthLabel(slip.month) : "No salary slip on file yet"}</div>

          {slip ? (
            <>
              <Row label="Gross pay" value={moneyPKR(slip.gross_salary)} />
              <Row label="Allowances" value={"+" + moneyPKR(slip.allowances)} />
              <Row label="Bonus" value={"+" + moneyPKR(slip.bonus)} />
              <Row label="Income Tax" value={"−" + moneyPKR(slip.tax)} />
              <Row label="Other deductions" value={"−" + moneyPKR(slip.other_deductions)} />
              {slip.deduction_reason && (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "0 0 10px" }}>Reason: {slip.deduction_reason}</div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, paddingTop: 10 }}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Net pay</span>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{moneyPKR(slip.net_salary)}</span>
              </div>
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <a href="#" onClick={(e) => { e.preventDefault(); downloadSlipPdf(slip.id, slip.month); }} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>
                  <Icon name="file-text" size={16} color="var(--text-link)" />
                  Download PDF
                </a>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>Your salary slip for this month hasn&rsquo;t been issued yet.</div>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 16 }}>Salary Slip Board</div>
        {mySlips.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>No salary slips on file yet.</div>
        ) : (
          <SmoothScroll horizontal>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th style={boardThStyle}>Month</th>
                <th style={boardThStyle}>Gross</th>
                <th style={boardThStyle}>Income Tax</th>
                <th style={boardThStyle}>Net Pay</th>
                <th style={boardThStyle}>Status</th>
                <th></th>
              </tr></thead>
              <tbody>
                {mySlips.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>{monthLabel(s.month)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{moneyPKR(s.gross_salary)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{moneyPKR(s.tax)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 600, whiteSpace: "nowrap" }}>{moneyPKR(s.net_salary)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: s.payment_status === "Paid" ? "var(--status-success-text)" : "var(--text-muted)", whiteSpace: "nowrap" }}>{s.payment_status}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <a href="#" onClick={(e) => { e.preventDefault(); downloadSlipPdf(s.id, s.month); }} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>Download PDF</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SmoothScroll>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 2 }}>Tax Certificate</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Download your income tax deduction certificate for a completed fiscal year (July–June).</div>
        {taxYears.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <select value={selectedTaxYear} onChange={(e) => setSelectedTaxYear(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", fontSize: 13.5, fontWeight: 600 }}>
              {taxYears.map((y) => (
                <option key={y.label} value={y.label}>{y.label}</option>
              ))}
            </select>
            <Button variant="primary" icon="download" onClick={downloadTaxCertificate}>{downloadingTaxCert ? "Generating…" : "Download Certificate"}</Button>
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>No fiscal year is available yet — a tax certificate becomes available for a fiscal year the day after it closes on June 30.</div>
        )}
      </div>
    </div>
  );
}

const boardThStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
