"use client";

// Port of `screenIsMeAttendance` (template.html:5026-5104) — loadMyAttendance/
// markMyAttendance (script.js:3061-3083) + the attendance computed block
// (script.js:5166-5210).

import { useEffect, useState } from "react";
import { attendanceApi, todayISO, formatCommentTimestamp, attendanceWindowNow } from "@/lib/orbit-client";
import { useToast } from "@/lib/toast-context";
import { useAppData } from "@/lib/app-data-context";
import { Button, Icon, Badge } from "@/design-system/healer-bundle";

type AttendanceRecord = {
  date: string; status: string; marked_at?: string | null;
  leave_approved_by_name?: string | null; leave_type?: string | null;
};

function monthLabelFrom(ym: string) {
  const parts = ym.split("-");
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function attendanceStatusTone(st: string) {
  return st === "Present" ? "success" : st === "Absent" ? "danger" : st === "WFH" ? "info" : st === "Leave" ? "warning" : st === "Holiday" ? "info" : "neutral";
}

export default function MeAttendancePage() {
  const { pushToast } = useToast();
  const { holidays } = useAppData();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [marking, setMarking] = useState(false);

  const load = () => {
    const [year, m] = month.split("-").map(Number);
    attendanceApi.me(year, m).then(
      (data: AttendanceRecord[]) => setRecords(data || []),
      () => pushToast("Could not load attendance history.", "error")
    );
  };

  useEffect(load, [month]);

  // Also re-fetch whenever `holidays` changes (e.g. right after Setup
  // creates one covering today) — the server-side erasure of a same-day
  // "Present" row on a retroactive holiday needs this to show up promptly
  // instead of only on next reload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [holidays]);

  // This page doesn't otherwise re-render on a timer — force one every
  // minute so a tab left open across the 10:00 AM/10:30 AM boundary (or midnight
  // into a weekend) doesn't keep showing a stale enabled/disabled button.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const attendanceTodayIso = todayISO();
  const { isWeekend, isWithinHours, isHoliday, holidayName, canMark } = attendanceWindowNow(holidays);
  // get_my_attendance also synthesizes a "Holiday" row for a holiday date
  // with no real record — that's not a genuine mark, so exclude it here or
  // a holiday would look like "already marked present".
  const todayRecord = records.find((r) => r.date === attendanceTodayIso && r.status !== "Holiday") || null;
  const hasMarkedToday = !!todayRecord;
  const markedTodayStr = todayRecord?.marked_at ? formatCommentTimestamp(todayRecord.marked_at) : null;

  // "Already marked" always wins, regardless of what the window looks like
  // right now — someone who marked at 10:05 AM shouldn't see this flip to
  // "Outside Hours" just because it's 8 PM now.
  const cardBg = hasMarkedToday ? "var(--status-success-bg)" : !canMark ? "var(--bg-page)" : "var(--status-warning-bg)";
  const cardIcon = hasMarkedToday ? "circle-check" : isHoliday ? "party-popper" : isWeekend ? "calendar" : !isWithinHours ? "clock" : "triangle-alert";
  const cardIconColor = hasMarkedToday ? "var(--status-success-text)" : !canMark ? "var(--text-muted)" : "var(--status-warning-text)";

  const presentCount = records.filter((r) => r.status === "Present").length;
  const absentCount = records.filter((r) => r.status === "Absent").length;
  const wfhCount = records.filter((r) => r.status === "WFH").length;
  const leaveCount = records.filter((r) => r.status === "Leave").length;

  const rows = records.map((r) => ({
    date: r.date,
    dayName: new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" }),
    status: r.status,
    statusTone: attendanceStatusTone(r.status),
    markedAtStr: r.marked_at ? formatCommentTimestamp(r.marked_at) : "—",
    leaveApprovedByName: r.leave_approved_by_name || null,
  }));

  const markAttendance = () => {
    if (marking || !canMark) return;
    setMarking(true);
    attendanceApi.mark().then(
      () => {
        setMarking(false);
        pushToast("Attendance marked for today.");
        load();
      },
      (err: Error) => {
        setMarking(false);
        pushToast(err.message || "Could not mark attendance.", "error");
      }
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>My Attendance</h1>

      <div style={{ background: cardBg, border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 9999, background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "var(--shadow-card)" }}>
            <Icon name={cardIcon} size={22} color={cardIconColor} />
          </div>
          <div>
            {hasMarkedToday && <div style={{ fontSize: 15, fontWeight: 600, color: "var(--status-success-text)" }}>Marked present today at {markedTodayStr}</div>}
            {!hasMarkedToday && isHoliday && <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>Holiday — {holidayName}. No attendance required today.</div>}
            {!hasMarkedToday && !isHoliday && isWeekend && <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>Weekend — no attendance required today.</div>}
            {!hasMarkedToday && !isHoliday && !isWeekend && !isWithinHours && <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>Attendance can only be marked between 10:00 AM and 10:30 AM.</div>}
            {!hasMarkedToday && !isHoliday && !isWeekend && isWithinHours && <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>You haven&apos;t marked attendance today yet.</div>}
            {/* Short, always-visible reminder of the marking window — not just something you discover once you're blocked. */}
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Attendance can only be marked between 10:00 AM – 10:30 AM, Mon–Fri.</div>
          </div>
        </div>
        {!hasMarkedToday && canMark && (
          <Button variant="primary" onClick={markAttendance}>Mark Attendance</Button>
        )}
        {!hasMarkedToday && !canMark && (
          <Button variant="secondary" disabled>Mark Attendance</Button>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>{monthLabelFrom(month)} summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 24 }}>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Present</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--status-success-text)" }}>{presentCount}</div>
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Absent</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--status-danger-text)" }}>{absentCount}</div>
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Work From Home</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--status-info-text)" }}>{wfhCount}</div>
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Leave</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--status-warning-text)" }}>{leaveCount}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Attendance history</h2>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
        />
      </div>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Day</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Marked At</th>
          </tr></thead>
          <tbody>
            {rows.map((ar) => (
              <tr key={ar.date} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-primary)" }}>{ar.date}</td>
                <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{ar.dayName}</td>
                <td style={{ padding: "12px 16px" }}>
                  <Badge tone={ar.statusTone}>{ar.status}</Badge>
                  {ar.status === "Leave" && ar.leaveApprovedByName && (
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>Approved by {ar.leaveApprovedByName}</div>
                  )}
                </td>
                <td className="orbit-nowrap-cell" style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{ar.markedAtStr}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No attendance records for {monthLabelFrom(month)}.</div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
