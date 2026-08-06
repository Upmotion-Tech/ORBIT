"use client";

// Port of the Manager Hub screen (template.html:4803-4932, script.js
// directLeavesFormatted/directWfhFormatted/managerLeaveRows at 4129-4197,
// directReportAttendanceRows, openLeaveAction/confirmLeaveAction/
// openWfhAction/confirmWfhAction at 2457-2473 and 3127-3145).
//
// Both GET /api/wfh and GET /api/attendance were fixed earlier this session
// (get_hr_user -> get_current_user) specifically so a manager without HR/
// Owner access can actually load this data — this page is the reason those
// fixes exist.

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/app-data-context";
import { useToast } from "@/lib/toast-context";
import { leavesApi, wfhApi, attendanceApi, getEmployeeName, todayISO, formatCommentTimestamp, fromISO, formatDateRange, parseDeepLinkHash, clearDeepLinkHash } from "@/lib/orbit-client";
import { Badge, Icon } from "@/design-system/healer-bundle";
import { useClosingTransition } from "@/lib/use-closing-transition";
import SmoothScroll from "@/components/shell/SmoothScroll";

type Leave = {
  id: string; employee_id: string; employee_name?: string; leave_type: string; status: string;
  start_date: string; end_date?: string | null; days?: number; reason?: string; approval_note?: string;
  rejection_reason?: string; created_at?: string;
};

// Approving a request means committing to however many days it covers, so
// the count is spelled out rather than left as two dates to subtract.
// Mirrors the same label the applicant sees on their own My Leave screen.
// formatDateRange (orbit-client) renders human dates and collapses a
// same-month range to "10–13 Aug 2026"; raw ISO was too hard to read at a
// glance, which is the whole point of this column.
function dateRangeLabel(start: string, end: string | null | undefined, days: number) {
  return formatDateRange(start, end || null) + " · " + days + (days === 1 ? " day" : " days");
}
type Wfh = {
  id: string; employee_id: string; employee_name?: string; date: string; end_date?: string | null; days?: number; status: string;
  description?: string; decision_note?: string; created_at?: string;
};
type AttendanceRecord = { employee_id: string; date: string; status: string; marked_at?: string | null };

function attendanceStatusTone(st: string) {
  return st === "Present" ? "success" : st === "Absent" ? "danger" : st === "WFH" ? "info" : "neutral";
}

export default function ManagerLeavePage() {
  const { currentUser } = useAuth();
  const { employees, reloadLeavesAndWfh } = useAppData();
  const { pushToast } = useToast();

  const [tab, setTab] = useState<"requests" | "attendance">("requests");
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [wfhRequests, setWfhRequests] = useState<Wfh[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [actionModal, setActionModal] = useState<{ id: string; kind: "leave" | "wfh"; type: "approve" | "reject"; note: string } | null>(null);
  const actionModalClosing = useClosingTransition();
  const closeActionModalAnimated = () => actionModalClosing.closeWithTransition(() => setActionModal(null));
  const [attendanceModalEmpId, setAttendanceModalEmpId] = useState<string | null>(null);
  const attendanceModalClosing = useClosingTransition();
  const closeAttendanceModalAnimated = () => attendanceModalClosing.closeWithTransition(() => setAttendanceModalEmpId(null));
  // A "Leave/WFH Submitted" notification deep-links here as #/leave/<id> or
  // #/wfh/<id> — there's no separate details drawer on this page (the row
  // itself already shows everything, Approve/Reject act right on it), so
  // "take me to that" means scroll to + flash-highlight the row instead.
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const loadRequests = () => {
    Promise.all([leavesApi.list().catch(() => []), wfhApi.all().catch(() => [])]).then(([l, w]: [Leave[], Wfh[]]) => {
      setLeaves(l || []);
      setWfhRequests(w || []);
    });
  };
  const loadAttendance = () => {
    const [year, month] = todayISO().slice(0, 7).split("-").map(Number);
    attendanceApi.all(year, month).then(
      (data: AttendanceRecord[]) => setAttendanceHistory(data || []),
      () => pushToast("Could not load attendance records.", "error")
    );
  };

  useEffect(() => {
    loadRequests();
    loadAttendance();
    const link = parseDeepLinkHash();
    if (link && (link.type === "leave" || link.type === "wfh")) {
      setTab("requests");
      setHighlightId(link.id);
      clearDeepLinkHash();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Runs once the requests actually finish loading (highlightId is set
  // immediately on mount, before loadRequests' fetch resolves) — scrolls the
  // row into view and fades the highlight out after a few seconds so it
  // doesn't linger indefinitely.
  useEffect(() => {
    if (!highlightId) return;
    if (!managerLeaveRows.some((r) => r.id === highlightId)) return;
    const el = document.getElementById("req-" + highlightId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, leaves, wfhRequests]);

  const myNameNorm = (currentUser?.name || "").trim().toLowerCase();
  const directReportEmps = employees.filter(
    (e) => e.manager && String(e.manager).trim().toLowerCase() === myNameNorm && e.name.trim().toLowerCase() !== myNameNorm
  );
  const directReportEmpIds = new Set(directReportEmps.map((e) => e.id));

  const directLeaves = leaves
    .filter((lr) => directReportEmpIds.has(lr.employee_id))
    .map((lr) => {
      const decisionNote = lr.status === "Approved" ? lr.approval_note : lr.status === "Rejected" ? lr.rejection_reason : "";
      return {
        id: lr.id, isWfh: false as const, employee: lr.employee_name || getEmployeeName(lr.employee_id) || "Unknown",
        type: lr.leave_type, dates: dateRangeLabel(lr.start_date, lr.end_date, lr.days || 1),
        reason: lr.reason || "No reason provided.", status: lr.status,
        statusTone: lr.status === "Approved" ? "success" : lr.status === "Rejected" ? "danger" : "warning",
        showActions: lr.status === "Pending",
        decisionNoteStr: decisionNote || "No decision note.",
        createdAt: lr.created_at || lr.start_date,
      };
    });
  const directWfh = wfhRequests
    .filter((w) => directReportEmpIds.has(w.employee_id))
    .map((w) => {
      const decisionNote = w.decision_note || "";
      return {
        id: w.id, isWfh: true as const, employee: w.employee_name || getEmployeeName(w.employee_id) || "Unknown",
        type: "Work From Home", dates: dateRangeLabel(w.date, w.end_date, w.days || 1),
        reason: w.description || "No description provided.", status: w.status,
        statusTone: w.status === "Approved" ? "success" : w.status === "Rejected" ? "danger" : "warning",
        showActions: w.status === "Pending",
        decisionNoteStr: decisionNote || "No decision note.",
        createdAt: w.created_at || w.date,
      };
    });
  const managerLeaveRows = [...directLeaves, ...directWfh].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const pendingCount =
    leaves.filter((lr) => lr.status === "Pending" && directReportEmpIds.has(lr.employee_id)).length +
    wfhRequests.filter((w) => w.status === "Pending" && directReportEmpIds.has(w.employee_id)).length;

  const curMonthIso = todayISO().slice(0, 7);
  const directReportAttendanceRows = directReportEmps.map((e) => {
    const empLogs = attendanceHistory.filter((r) => r.employee_id === e.id && r.date.slice(0, 7) === curMonthIso);
    return {
      id: e.id,
      name: e.name,
      role: e.role as string,
      dept: e.department as string,
      presentDays: empLogs.filter((r) => r.status === "Present").length,
      absentDays: empLogs.filter((r) => r.status === "Absent").length,
      wfhDays: empLogs.filter((r) => r.status === "WFH").length,
    };
  });

  const modalEmp = attendanceModalEmpId ? employees.find((e) => e.id === attendanceModalEmpId) : null;
  const modalLogs = attendanceModalEmpId
    ? attendanceHistory.filter((r) => r.employee_id === attendanceModalEmpId && r.date.slice(0, 7) === curMonthIso)
    : [];

  const confirmAction = () => {
    if (!actionModal) return;
    const note = actionModal.note.trim();
    const call =
      actionModal.kind === "wfh"
        ? actionModal.type === "approve"
          ? wfhApi.approve(actionModal.id, note)
          : wfhApi.reject(actionModal.id, note)
        : actionModal.type === "approve"
        ? leavesApi.approve(actionModal.id, note)
        : leavesApi.reject(actionModal.id, note);

    call.then(
      () => {
        pushToast(
          actionModal.type === "approve"
            ? (actionModal.kind === "wfh" ? "Work-from-home request" : "Leave") + " approved."
            : (actionModal.kind === "wfh" ? "Work-from-home request" : "Leave") + " rejected."
        );
        setActionModal(null);
        loadRequests();
        loadAttendance();
        reloadLeavesAndWfh();
      },
      (err: Error) => pushToast(err.message || "Could not " + actionModal.type + " the request.", "error")
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>Manager Hub</h1>
        <div className="orbit-setup-tabs">
          <button className="orbit-setup-tab" style={{ fontWeight: tab === "requests" ? 600 : 400 }} onClick={() => setTab("requests")}>
            Leave &amp; WFH Requests
            {pendingCount > 0 && (
              <span style={{ background: "var(--status-danger-bg, #ef4444)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 9999, marginLeft: 6 }}>{pendingCount}</span>
            )}
          </button>
          <button className="orbit-setup-tab" style={{ fontWeight: tab === "attendance" ? 600 : 400 }} onClick={() => setTab("attendance")}>
            Direct Reports Attendance
          </button>
        </div>
      </div>

      {tab === "requests" && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Dates</th>
              <th style={thStyle}>Reason / Description</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Action</th>
            </tr></thead>
            <tbody>
              {managerLeaveRows.map((lr) => (
                <tr
                  key={lr.id}
                  id={"req-" + lr.id}
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                    background: lr.id === highlightId ? "var(--brand-primary-light, rgba(37,99,235,0.08))" : "transparent",
                    transition: "background 0.6s ease",
                  }}
                >
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{lr.employee}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{lr.type}</td>
                  <td className="orbit-nowrap-cell" style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{lr.dates}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{lr.reason}</td>
                  <td style={{ padding: "14px 16px" }}><Badge tone={lr.statusTone}>{lr.status}</Badge></td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    {lr.showActions ? (
                      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                        <a href="#" onClick={(e) => { e.preventDefault(); setActionModal({ id: lr.id, kind: lr.isWfh ? "wfh" : "leave", type: "approve", note: "" }); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--status-success-text)", textDecoration: "none" }}>Approve</a>
                        <a href="#" onClick={(e) => { e.preventDefault(); setActionModal({ id: lr.id, kind: lr.isWfh ? "wfh" : "leave", type: "reject", note: "" }); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none" }}>Reject</a>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{lr.decisionNoteStr}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {managerLeaveRows.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No leave or work-from-home requests from your direct reports yet.</div>
          )}
        </div>
      )}

      {tab === "attendance" && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Role / Dept</th>
              <th style={thStyle}>Present (this month)</th>
              <th style={thStyle}>Absent</th>
              <th style={thStyle}>WFH</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Details</th>
            </tr></thead>
            <tbody>
              {directReportAttendanceRows.map((dra) => (
                <tr key={dra.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{dra.name}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{dra.role} &middot; {dra.dept}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--status-success-text)", fontWeight: 600 }}>{dra.presentDays} days</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--status-danger-text)", fontWeight: 600 }}>{dra.absentDays} days</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--brand-primary)", fontWeight: 600 }}>{dra.wfhDays} days</td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setAttendanceModalEmpId(dra.id); }} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>Details &rarr;</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {directReportAttendanceRows.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No direct reports assigned to you.</div>
          )}
        </div>
      )}

      {actionModal && (
        <div className={"crm-overlay-fade" + (actionModalClosing.isClosing ? " orbit-closing" : "")} onClick={closeActionModalAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className={"crm-pop" + (actionModalClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "90vw", background: "var(--bg-surface)", borderRadius: 12, boxShadow: "var(--shadow-popover)", padding: 24 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>
              {actionModal.type === "approve" ? "Approve" : "Reject"} {actionModal.kind === "wfh" ? "work-from-home request" : "leave request"}
            </h2>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", margin: "16px 0 6px" }}>
              {actionModal.type === "approve" ? "Note (optional)" : "Reason for rejection"}
            </label>
            <textarea
              rows={3}
              value={actionModal.note}
              onChange={(e) => setActionModal((m) => (m ? { ...m, note: e.target.value } : m))}
              placeholder="Add a note for the employee..."
              style={{ width: "100%", fontFamily: "var(--font-sans)", fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-canvas)", color: "var(--text-primary)", resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button className="login-btn" style={{ background: "none", color: "var(--text-secondary)", boxShadow: "none", width: "auto", padding: "10px 16px" }} onClick={closeActionModalAnimated}>Cancel</button>
              <button
                className="login-btn"
                style={{ width: "auto", padding: "10px 16px", background: actionModal.type === "approve" ? undefined : "linear-gradient(135deg, #DC2626 0%, #EF4444 100%)" }}
                onClick={confirmAction}
              >
                {actionModal.type === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEmp && (
        <div className={"crm-overlay-fade" + (attendanceModalClosing.isClosing ? " orbit-closing" : "")} onClick={closeAttendanceModalAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (attendanceModalClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Attendance Details</h2>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{modalEmp.name}</div>
              </div>
              <button onClick={closeAttendanceModalAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}>
                <Icon name="x" size={20} color="var(--text-muted)" />
              </button>
            </div>
            <SmoothScroll style={{ flex: 1, padding: 24 }}>
              {modalLogs.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No attendance records this month.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Time</th>
                  </tr></thead>
                  <tbody>
                    {modalLogs.map((r) => (
                      <tr key={r.date} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td className="orbit-nowrap-cell" style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-primary)" }}>{fromISO(r.date)}</td>
                        <td style={{ padding: "12px 16px" }}><Badge tone={attendanceStatusTone(r.status)}>{r.status}</Badge></td>
                        <td className="orbit-nowrap-cell" style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{r.marked_at ? formatCommentTimestamp(r.marked_at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SmoothScroll>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
