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
  formatDateRange,
  parseDeepLinkHash,
  clearDeepLinkHash,
  todayISO,
} from "@/lib/orbit-client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { Button, Input, Select, StatCard, Badge, Icon } from "@/design-system/healer-bundle";
import { useClosingTransition } from "@/lib/use-closing-transition";
import SmoothScroll from "@/components/shell/SmoothScroll";

type LeaveBalance = { casual_remaining: number; sick_remaining: number; annual_remaining: number };
type RawLeave = {
  id: string; leave_type: string; start_date: string; end_date?: string | null; days: number;
  status: string; reason?: string; approval_note?: string; rejection_reason?: string; created_at?: string;
  approved_by_id?: string | null; approved_at?: string | null; half_day?: string | null;
};
type RawWfh = {
  id: string; date: string; end_date?: string | null; days?: number; status: string; description?: string; decision_note?: string; created_at?: string;
  decided_by?: string | null; decided_at?: string | null; half_day?: string | null;
};

const LEAVE_TYPE_OPTIONS = [
  { value: "Casual", label: "Casual" },
  { value: "Sick", label: "Sick" },
  { value: "Annual", label: "Annual" },
  { value: "Work From Home", label: "Work From Home" },
];

// Only valid for a single-day request — matches LeaveService/WfhRequestService's
// own _validate_half_day rule (end date must be empty or equal to start date).
const HALF_DAY_OPTIONS = [
  { value: "", label: "Full Day" },
  { value: "First Half", label: "First Half (10:00 AM – 2:00 PM)" },
  { value: "Second Half", label: "Second Half (3:00 PM – 7:00 PM)" },
];

// Human dates plus an explicit count, so neither the applicant nor the
// approving manager has to work out how long a request is by subtracting
// two dates in their head. formatDateRange (orbit-client) does the date
// half — it collapses a same-month range to "10–13 Aug 2026" and writes
// both months out in full when one spans a boundary.
function dateRangeLabel(start: string, end: string | null | undefined, days: number, halfDay?: string | null) {
  const base = formatDateRange(start, end || null) + " · " + days + (days === 1 ? " day" : " days");
  return halfDay ? base + " (" + halfDay + ")" : base;
}

// Client-side mirror of the backend's own inclusive day count (LeaveService.
// _count_days / WfhRequestService's end-start+1) so the form can show the
// length live, before anything is submitted. Returns 0 for an end date that
// falls before the start, which the caller renders as a warning rather than
// a nonsensical negative count. Parsed as local midnight ("T00:00:00")
// rather than bare "YYYY-MM-DD", which JS would read as UTC and can land on
// the wrong day either side of the PKT offset.
function countDaysInclusive(start: string, end: string) {
  if (!start) return 0;
  if (!end || end === start) return 1;
  const s = new Date(start + "T00:00:00").getTime();
  const e = new Date(end + "T00:00:00").getTime();
  if (isNaN(s) || isNaN(e)) return 0;
  const diff = Math.round((e - s) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

function DayCountHint({ start, end }: { start: string; end: string }) {
  if (!start) return null;
  const days = countDaysInclusive(start, end);
  const isInvalid = days === 0;
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 500,
        color: isInvalid ? "var(--status-danger-text)" : "var(--text-secondary)",
      }}
    >
      {isInvalid ? "End date is before the start date." : `${days} day${days === 1 ? "" : "s"} selected`}
    </div>
  );
}

function formatRow(lr: RawLeave) {
  const isApproved = lr.status === "Approved";
  const isRejected = lr.status === "Rejected";
  const decisionNote = isApproved ? lr.approval_note : isRejected ? lr.rejection_reason : null;
  const decidedByName = lr.approved_by_id ? getEmployeeName(lr.approved_by_id) : "";
  return {
    id: lr.id,
    type: lr.leave_type,
    dates: dateRangeLabel(lr.start_date, lr.end_date, lr.days, lr.half_day),
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
    dates: dateRangeLabel(w.date, w.end_date, w.days || 1, w.half_day),
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
  const [form, setForm] = useState({ type: "Casual", startDate: "", endDate: "", reason: "", halfDay: "" });
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const drawerClosing = useClosingTransition();
  const closeDrawerAnimated = () => drawerClosing.closeWithTransition(() => { setDrawerId(null); setEditing(false); setConfirmWithdraw(false); clearDeepLinkHash(); });

  // Self-service edit/withdraw of a request that nobody has acted on yet.
  // Both the backend endpoints and the controls below are gated on the
  // request still being Pending — once a manager approves or rejects it,
  // it's their decision on record and changing it isn't the applicant's
  // call anymore (an approved one may already have driven attendance rows).
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [editForm, setEditForm] = useState({ type: "Casual", startDate: "", endDate: "", reason: "", halfDay: "" });

  const openDrawer = (id: string) => {
    setDrawerId(id);
    setEditing(false);
    setConfirmWithdraw(false);
  };

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

  const canModifyDrawer = drawer != null && drawer.status === "Pending";

  const startEdit = () => {
    if (!drawerRaw) return;
    if (drawerIsWfh) {
      const w = drawerRaw as RawWfh;
      setEditForm({ type: "Work From Home", startDate: w.date, endDate: w.end_date || "", reason: w.description || "", halfDay: w.half_day || "" });
    } else {
      const l = drawerRaw as RawLeave;
      setEditForm({ type: l.leave_type, startDate: l.start_date, endDate: l.end_date || "", reason: l.reason || "", halfDay: l.half_day || "" });
    }
    setEditing(true);
  };

  const saveEdit = () => {
    if (!drawerId || savingEdit) return;
    if (!editForm.startDate) {
      pushToast("Start date is required.", "error");
      return;
    }
    setSavingEdit(true);
    const onOk = () => {
      setSavingEdit(false);
      setEditing(false);
      pushToast("Request updated.");
      load();
    };
    const onErr = (err: Error) => {
      setSavingEdit(false);
      pushToast(err.message || "Could not update the request.", "error");
    };
    // half_day only ever applies to a genuinely single-day request — if the
    // date fields were edited into a range, drop it rather than send a
    // half_day the backend would reject as covering more than one day.
    const isSingleDayEdit = !editForm.endDate || editForm.endDate === editForm.startDate;
    const halfDay = isSingleDayEdit ? editForm.halfDay || null : null;
    // A leave request and a WFH request are separate records with separate
    // endpoints — the type can't be switched between them by editing, only
    // withdrawn and re-filed, so each branch only sends its own fields.
    if (drawerIsWfh) {
      wfhApi
        .update(drawerId, { date: editForm.startDate, end_date: editForm.endDate || null, description: editForm.reason || null, half_day: halfDay })
        .then(onOk, onErr);
    } else {
      leavesApi
        .update(drawerId, {
          leave_type: editForm.type,
          start_date: editForm.startDate,
          end_date: editForm.endDate || null,
          reason: editForm.reason || null,
          half_day: halfDay,
        })
        .then(onOk, onErr);
    }
  };

  const withdrawRequest = () => {
    if (!drawerId) return;
    const call = drawerIsWfh ? wfhApi.remove(drawerId) : leavesApi.remove(drawerId);
    call.then(
      () => {
        pushToast("Request withdrawn.");
        setConfirmWithdraw(false);
        setDrawerId(null);
        clearDeepLinkHash();
        load();
      },
      (err: Error) => {
        setConfirmWithdraw(false);
        pushToast(err.message || "Could not withdraw the request.", "error");
      }
    );
  };

  const submit = () => {
    if (!form.startDate || !empId) {
      pushToast("Start date is required.", "error");
      return;
    }
    // Same single-day-only rule the backend enforces — a range selection
    // silently ignores whatever half-day choice is still sitting in state.
    const isSingleDay = !form.endDate || form.endDate === form.startDate;
    const halfDay = isSingleDay ? form.halfDay || null : null;
    if (form.type === "Work From Home") {
      wfhApi.create(form.startDate, form.reason || "", form.endDate || null, halfDay).then(
        () => {
          pushToast("Work From Home request submitted successfully.");
          setForm({ type: "Casual", startDate: "", endDate: "", reason: "", halfDay: "" });
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
        half_day: halfDay,
      })
      .then(
        () => {
          pushToast("Leave submitted successfully.");
          setForm({ type: "Casual", startDate: "", endDate: "", reason: "", halfDay: "" });
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
              min={todayISO()}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>End date (optional)</span>
            <input
              type="date"
              value={form.endDate}
              min={form.startDate || todayISO()}
              onChange={(e) => {
                const endDate = e.target.value;
                // A half-day choice only makes sense for a single day — drop
                // it the moment the range actually widens past one day,
                // rather than leaving a stale selection the backend would
                // silently ignore (or reject) on submit.
                const stillSingleDay = !endDate || endDate === form.startDate;
                setForm((f) => ({ ...f, endDate, halfDay: stillSingleDay ? f.halfDay : "" }));
              }}
              style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
            />
          </div>
        </div>
        {/* Live length of whatever is currently picked, updating on every
            date change — the same inclusive count the backend will compute
            and the manager will later see on the request. */}
        <div style={{ marginBottom: 14, marginTop: -4 }}>
          <DayCountHint start={form.startDate} end={form.endDate} />
        </div>
        {(!form.endDate || form.endDate === form.startDate) && (
          <div style={{ marginBottom: 14 }}>
            <Select
              label="Duration"
              options={HALF_DAY_OPTIONS}
              value={form.halfDay}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((f) => ({ ...f, halfDay: e.target.value }))}
            />
          </div>
        )}
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
            <th className="orbit-row-hint"></th>
          </tr></thead>
          <tbody>
            {allRequests.map((lr) => (
              <tr key={lr.id} onClick={() => openDrawer(lr.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                <td style={tdStyle}>{lr.type}</td>
                <td className="orbit-nowrap-cell" style={tdStyle}>{lr.dates}</td>
                <td style={{ padding: "14px 16px" }}><Badge tone={lr.statusTone}>{lr.status}</Badge></td>
                <td className="orbit-row-hint" style={{ padding: "14px 16px", textAlign: "right", fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Click for details &rarr;</td>
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
            <SmoothScroll style={{ flex: 1, padding: 24, fontSize: 14 }} contentStyle={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {editing ? (
                <>
                  {!drawerIsWfh && (
                    <Select
                      label="Type"
                      options={LEAVE_TYPE_OPTIONS.filter((o) => o.value !== "Work From Home")}
                      value={editForm.type}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm((f) => ({ ...f, type: e.target.value }))}
                    />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Start date</span>
                    <input
                      type="date"
                      value={editForm.startDate}
                      min={todayISO()}
                      onChange={(e) => setEditForm((f) => ({ ...f, startDate: e.target.value }))}
                      style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>End date (optional)</span>
                    <input
                      type="date"
                      value={editForm.endDate}
                      min={editForm.startDate || todayISO()}
                      onChange={(e) => {
                        const endDate = e.target.value;
                        const stillSingleDay = !endDate || endDate === editForm.startDate;
                        setEditForm((f) => ({ ...f, endDate, halfDay: stillSingleDay ? f.halfDay : "" }));
                      }}
                      style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <DayCountHint start={editForm.startDate} end={editForm.endDate} />
                  {(!editForm.endDate || editForm.endDate === editForm.startDate) && (
                    <Select
                      label="Duration"
                      options={HALF_DAY_OPTIONS}
                      value={editForm.halfDay}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm((f) => ({ ...f, halfDay: e.target.value }))}
                    />
                  )}
                  <Input
                    label="Reason (optional)"
                    value={editForm.reason}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
                  />
                </>
              ) : (
              <>
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
              </>
              )}
            </SmoothScroll>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
              {editing ? (
                <>
                  <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button variant="primary" disabled={savingEdit} onClick={saveEdit}>{savingEdit ? "Saving…" : "Save changes"}</Button>
                </>
              ) : confirmWithdraw ? (
                <>
                  <span style={{ flex: 1, alignSelf: "center", fontSize: 13, color: "var(--text-secondary)" }}>Withdraw this request?</span>
                  <Button variant="ghost" onClick={() => setConfirmWithdraw(false)}>Keep it</Button>
                  {/* The compiled Button has no "danger" variant (it would
                      silently fall back to secondary) — destructive intent is
                      carried by the same status-danger tokens the delete
                      links elsewhere in the app use. */}
                  <Button variant="secondary" style={{ background: "var(--status-danger-bg)", color: "var(--status-danger-text)" }} onClick={withdrawRequest}>Withdraw</Button>
                </>
              ) : (
                <>
                  {/* Only while still Pending — the backend enforces the same
                      rule, so a decided request can't be changed even if
                      these somehow rendered. */}
                  {canModifyDrawer && <Button variant="secondary" style={{ background: "var(--status-danger-bg)", color: "var(--status-danger-text)" }} onClick={() => setConfirmWithdraw(true)}>Withdraw</Button>}
                  {canModifyDrawer && <Button variant="secondary" onClick={startEdit}>Edit</Button>}
                  <Button variant="secondary" onClick={closeDrawerAnimated}>Close</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
const tdStyle: React.CSSProperties = { padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" };
