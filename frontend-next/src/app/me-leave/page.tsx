"use client";

// Port of the `screenIsMeLeave` + `myLeaveDrawerOpen` blocks
// (unpacked/template.html:4934-5024, script.js loadMyLeaveData/submitMeLeave/
// openMyLeaveDrawer/closeMyLeaveDrawer + the myLeave*/myAllRequests computed
// block at script.js:5620-5690).

import { useEffect, useState } from "react";
import {
  leavesApi,
  wfhApi,
  pktTodayParts,
  getEmployeeName,
  formatActivityTimestamp,
  parseDeepLinkHash,
  clearDeepLinkHash,
} from "@/lib/orbit-client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { Button, Input, Select, StatCard, Badge, Icon } from "@/design-system/healer-bundle";
import { useClosingTransition } from "@/lib/use-closing-transition";

type LeaveBalance = { casual_remaining: number; sick_remaining: number; annual_remaining: number };
type RawLeave = {
  id: string; leave_type: string; start_date: string; end_date?: string | null; days: number;
  status: string; reason?: string; approval_note?: string; rejection_reason?: string; created_at?: string;
  approved_by_id?: string | null; approved_at?: string | null;
};
type RawWfh = {
  id: string; date: string; status: string; description?: string; decision_note?: string; created_at?: string;
  decided_by?: string | null; decided_at?: string | null;
};

const LEAVE_TYPE_OPTIONS = [
  { value: "Casual", label: "Casual" },
  { value: "Sick", label: "Sick" },
  { value: "Annual", label: "Annual" },
  { value: "Work From Home", label: "Work From Home" },
];

function formatRow(lr: RawLeave) {
  const isApproved = lr.status === "Approved";
  const isRejected = lr.status === "Rejected";
  const decisionNote = isApproved ? lr.approval_note : isRejected ? lr.rejection_reason : null;
  const decidedByName = lr.approved_by_id ? getEmployeeName(lr.approved_by_id) : "";
  return {
    id: lr.id,
    type: lr.leave_type,
    dates: lr.end_date ? lr.start_date + " — " + lr.end_date : lr.start_date,
    status: lr.status,
    statusTone: isApproved ? "success" : isRejected ? "danger" : "warning",
    reason: lr.reason || "",
    showDecision: isApproved || isRejected,
    decidedByLine: decidedByName
      ? (isApproved ? "Approved by " : "Rejected by ") + decidedByName + (lr.approved_at ? " · " + formatActivityTimestamp(lr.approved_at) : "")
      : "",
    showDecisionNote: !!decisionNote,
    decisionNoteLabel: isApproved ? "Approval note" : "Rejection reason",
    decisionNoteStr: decisionNote || "",
    createdAt: lr.created_at || lr.start_date,
    startDate: lr.start_date,
  };
}
function formatWfhRow(w: RawWfh) {
  const isApproved = w.status === "Approved";
  const isRejected = w.status === "Rejected";
  const decisionNote = w.decision_note || null;
  const decidedByName = w.decided_by ? getEmployeeName(w.decided_by) : "";
  return {
    id: w.id,
    type: "Work From Home",
    dates: w.date,
    status: w.status,
    statusTone: isApproved ? "success" : isRejected ? "danger" : "warning",
    reason: w.description || "",
    showDecision: isApproved || isRejected,
    decidedByLine: decidedByName
      ? (isApproved ? "Approved by " : "Rejected by ") + decidedByName + (w.decided_at ? " · " + formatActivityTimestamp(w.decided_at) : "")
      : "",
    showDecisionNote: !!decisionNote,
    decisionNoteLabel: isApproved ? "Approval note" : "Rejection reason",
    decisionNoteStr: decisionNote || "",
    createdAt: w.created_at || w.date,
    startDate: w.date,
  };
}

export default function MeLeavePage() {
  const { currentUser } = useAuth();
  const { pushToast } = useToast();
  const empId = currentUser?.id;

  const [balance, setBalance] = useState<LeaveBalance>({ casual_remaining: 0, sick_remaining: 0, annual_remaining: 0 });
  const [leaves, setLeaves] = useState<RawLeave[]>([]);
  const [wfh, setWfh] = useState<RawWfh[]>([]);
  const [month, setMonth] = useState(() => {
    const t = pktTodayParts();
    return t.y + "-" + String(t.m + 1).padStart(2, "0");
  });
  const [form, setForm] = useState({ type: "Casual", startDate: "", endDate: "", reason: "" });
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const drawerClosing = useClosingTransition();
  const closeDrawerAnimated = () => drawerClosing.closeWithTransition(() => { setDrawerId(null); clearDeepLinkHash(); });

  const load = () => {
    if (!empId) return;
    Promise.all([
      leavesApi.list({ employee_id: empId }).catch(() => []),
      leavesApi.balance(empId).catch(() => null),
      wfhApi.mine().catch(() => []),
    ]).then(([myLeaves, bal, myWfh]: [RawLeave[], LeaveBalance | null, RawWfh[]]) => {
      setLeaves(myLeaves || []);
      if (bal) setBalance(bal);
      setWfh(myWfh || []);
    });
  };

  useEffect(load, [empId]);

  // A "Leave/WFH Approved/Rejected" notification deep-links here as
  // #/leave/<id> or #/wfh/<id> (see Shell.tsx's notificationHref) — the
  // drawer lookup below already searches the full unfiltered leaves/wfh
  // arrays by id, not the currently-selected month's filtered rows, so this
  // opens straight to the right request regardless of which month it's in.
  useEffect(() => {
    const link = parseDeepLinkHash();
    if (link && (link.type === "leave" || link.type === "wfh")) {
      setDrawerId(link.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leaveRows = leaves.filter((lr) => (lr.start_date || "").slice(0, 7) === month).map(formatRow);
  const wfhRows = wfh.filter((w) => (w.date || "").slice(0, 7) === month).map(formatWfhRow);
  const allRequests = leaveRows.concat(wfhRows).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const thisYear = String(pktTodayParts().y);
  const daysThisYear = leaves
    .filter((lr) => lr.status === "Approved" && lr.start_date && lr.start_date.slice(0, 4) === thisYear)
    .reduce((sum, lr) => sum + (lr.days || 0), 0);

  const drawerRaw =
    drawerId != null
      ? (leaves.find((lr) => lr.id === drawerId) as RawLeave | undefined) ||
        (wfh.find((w) => w.id === drawerId) as RawWfh | undefined)
      : null;
  const drawerIsWfh = drawerRaw != null && "date" in drawerRaw;
  const drawer = drawerRaw
    ? drawerIsWfh
      ? formatWfhRow(drawerRaw as RawWfh)
      : formatRow(drawerRaw as RawLeave)
    : null;

  const submit = () => {
    if (!form.startDate || !empId) {
      pushToast("Start date is required.", "error");
      return;
    }
    if (form.type === "Work From Home") {
      wfhApi.create(form.startDate, form.reason || "").then(
        () => {
          pushToast("Work From Home request submitted successfully.");
          setForm({ type: "Casual", startDate: "", endDate: "", reason: "" });
          load();
        },
        (err: Error) => pushToast(err.message || "Could not submit Work From Home request.", "error")
      );
      return;
    }
    leavesApi
      .create({
        employee_id: empId,
        leave_type: form.type,
        start_date: form.startDate,
        end_date: form.endDate || null,
        reason: form.reason || "",
      })
      .then(
        () => {
          pushToast("Leave submitted successfully.");
          setForm({ type: "Casual", startDate: "", endDate: "", reason: "" });
          load();
        },
        (err: Error) => pushToast(err.message || "Could not submit leave.", "error")
      );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>My Leave</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 24 }}>
        <StatCard label="Casual leave remaining" value={balance.casual_remaining} />
        <StatCard label="Sick leave remaining" value={balance.sick_remaining} />
        <StatCard label="Annual leave remaining" value={balance.annual_remaining} />
        <StatCard label="Days taken this year" value={daysThisYear} />
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>Request Time Off / Work From Home</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          <Select label="Type" options={LEAVE_TYPE_OPTIONS} value={form.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((f) => ({ ...f, type: e.target.value }))} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Start date</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>End date (optional)</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
            />
          </div>
        </div>
        <Input label="Reason (optional)" value={form.reason} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        <div style={{ marginTop: 16 }}>
          <Button variant="primary" onClick={submit}>Submit Request</Button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Request history</h2>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="Filter leave history by month"
          style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer" }}
        />
      </div>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Dates</th>
            <th style={thStyle}>Status</th>
            <th></th>
          </tr></thead>
          <tbody>
            {allRequests.map((lr) => (
              <tr key={lr.id} onClick={() => setDrawerId(lr.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                <td style={tdStyle}>{lr.type}</td>
                <td style={tdStyle}>{lr.dates}</td>
                <td style={{ padding: "14px 16px" }}><Badge tone={lr.statusTone}>{lr.status}</Badge></td>
                <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Click for details &rarr;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drawer && (
        <div className={"crm-overlay-fade" + (drawerClosing.isClosing ? " orbit-closing" : "")} onClick={closeDrawerAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (drawerClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{drawer.type} Leave</h2>
              <button onClick={closeDrawerAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}>
                <Icon name="x" size={20} color="var(--text-muted)" />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14, fontSize: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Dates</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{drawer.dates}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Status</span>
                <Badge tone={drawer.statusTone}>{drawer.status}</Badge>
              </div>
              <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Reason</div>
                <div style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{drawer.reason || "No reason provided."}</div>
              </div>
              {drawer.showDecision && drawer.decidedByLine && (
                <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)", fontSize: 13, color: "var(--text-secondary)" }}>{drawer.decidedByLine}</div>
              )}
              {drawer.showDecisionNote && (
                <div style={{ paddingTop: drawer.decidedByLine ? 0 : 12, borderTop: drawer.decidedByLine ? "none" : "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{drawer.decisionNoteLabel}</div>
                  <div style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{drawer.decisionNoteStr}</div>
                </div>
              )}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
              <Button variant="secondary" onClick={closeDrawerAnimated}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
const tdStyle: React.CSSProperties = { padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" };
