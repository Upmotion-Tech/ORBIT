"use client";

// Port of `screenIsMeAttendance` (template.html:5026-5104) — loadMyAttendance/
// markMyAttendance (script.js:3061-3083) + the attendance computed block
// (script.js:5166-5210).

import { useEffect, useState } from "react";
import { attendanceApi, todayISO, formatCommentTimestamp } from "@/lib/orbit-client";
import { useToast } from "@/lib/toast-context";
import { Button, Icon, Badge } from "@/design-system/healer-bundle";

type AttendanceRecord = { date: string; status: string; marked_at?: string | null };

function monthLabelFrom(ym: string) {
  const parts = ym.split("-");
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function attendanceStatusTone(st: string) {
  return st === "Present" ? "success" : st === "Absent" ? "danger" : st === "WFH" ? "info" : "neutral";
}

export default function MeAttendancePage() {
  const { pushToast } = useToast();
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

  const attendanceTodayIso = todayISO();
  const isWorkingDayToday = (() => {
    const day = new Date(attendanceTodayIso + "T00:00:00").getDay();
    return day >= 1 && day <= 5;
  })();
  const todayRecord = records.find((r) => r.date === attendanceTodayIso) || null;
  const hasMarkedToday = !!todayRecord;
  const markedTodayStr = todayRecord?.marked_at ? formatCommentTimestamp(todayRecord.marked_at) : null;

  const cardBg = !isWorkingDayToday ? "var(--bg-page)" : hasMarkedToday ? "var(--status-success-bg)" : "var(--status-warning-bg)";
  const cardIcon = !isWorkingDayToday ? "calendar" : hasMarkedToday ? "circle-check" : "triangle-alert";
  const cardIconColor = !isWorkingDayToday ? "var(--text-muted)" : hasMarkedToday ? "var(--status-success-text)" : "var(--status-warning-text)";

  const presentCount = records.filter((r) => r.status === "Present").length;
  const absentCount = records.filter((r) => r.status === "Absent").length;
  const wfhCount = records.filter((r) => r.status === "WFH").length;

  const rows = records.map((r) => ({
    date: r.date,
    dayName: new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" }),
    status: r.status,
    statusTone: attendanceStatusTone(r.status),
    markedAtStr: r.marked_at ? formatCommentTimestamp(r.marked_at) : "—",
  }));

  const markAttendance = () => {
    if (marking) return;
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
            {!isWorkingDayToday && <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>Weekend — no attendance required today.</div>}
            {isWorkingDayToday && hasMarkedToday && <div style={{ fontSize: 15, fontWeight: 600, color: "var(--status-success-text)" }}>Marked present today at {markedTodayStr}</div>}
            {isWorkingDayToday && !hasMarkedToday && <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>You haven&apos;t marked attendance today yet.</div>}
          </div>
        </div>
        {isWorkingDayToday && !hasMarkedToday && (
          <Button variant="primary" onClick={markAttendance}>Mark Attendance</Button>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>{monthLabelFrom(month)} summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
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
                <td style={{ padding: "12px 16px" }}><Badge tone={ar.statusTone}>{ar.status}</Badge></td>
                <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{ar.markedAtStr}</td>
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
