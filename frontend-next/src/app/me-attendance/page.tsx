"use client";

// Port of `screenIsMeAttendance` (template.html:5026-5104) — loadMyAttendance/
// markMyAttendance (script.js:3061-3083) + the attendance computed block
// (script.js:5166-5210).

import { useEffect, useState } from "react";
import { attendanceApi, todayISO, formatCommentTimestamp, attendanceWindowNow, attendanceChipNow, attendanceSlotChipsNow, ATTENDANCE_WINDOW_LABEL, ATTENDANCE_ON_TIME_LABEL } from "@/lib/orbit-client";
import { useToast } from "@/lib/toast-context";
import { useAppData } from "@/lib/app-data-context";
import { useAuth } from "@/lib/auth-context";
import { Button, Icon, Badge } from "@/design-system/healer-bundle";

type AttendanceRecord = {
  date: string; half_day?: string | null; status: string; marked_at?: string | null;
  leave_approved_by_name?: string | null; leave_type?: string | null;
};

function monthLabelFrom(ym: string) {
  const parts = ym.split("-");
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function attendanceStatusTone(st: string) {
  return st === "Present" ? "success" : st === "Absent" ? "danger" : st === "Late" ? "warning" : st === "WFH" ? "info" : st === "Leave" ? "warning" : st === "Holiday" ? "info" : "neutral";
}

export default function MeAttendancePage() {
  const { pushToast } = useToast();
  const { holidays, leaves, allWfhRequests } = useAppData();
  const { currentUser } = useAuth();
  const currentMonthIso = todayISO().slice(0, 7);
  const [month, setMonth] = useState(currentMonthIso);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  // Kept separate from `records` on purpose. `records` follows the month
  // picker, so browsing to a previous month used to empty out today's row
  // and make the card above claim attendance wasn't marked yet (and re-enable
  // its button inside the 10:00–10:30 window). The card is about TODAY, so it
  // reads its own always-current-month fetch and ignores whatever month the
  // history table happens to be showing.
  //
  // /api/attendance/today would be the natural single-record source for this,
  // but it's HR-gated (get_hr_user) and returns a company-wide snapshot, so a
  // regular employee can't use it — hence refetching the current month here.
  // Costs one duplicate request on mount, when the picker is already on the
  // current month; keeping the two independent is worth more than saving it.
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [marking, setMarking] = useState(false);

  const load = () => {
    const [year, m] = month.split("-").map(Number);
    attendanceApi.me(year, m).then(
      (data: AttendanceRecord[]) => setRecords(data || []),
      () => pushToast("Could not load attendance history.", "error")
    );
  };

  const loadToday = () => {
    const [year, m] = currentMonthIso.split("-").map(Number);
    attendanceApi.me(year, m).then(
      (data: AttendanceRecord[]) => setTodayRecords(data || []),
      // Silent: `load` already toasts on the same underlying failure, and a
      // second toast for one failed page load is noise. The card just stays
      // in its "not marked yet" state, which the window check still gates.
      () => {}
    );
  };

  useEffect(load, [month]);

  // Also re-fetch whenever `holidays` changes (e.g. right after Setup
  // creates one covering today) — the server-side erasure of a same-day
  // "Present" row on a retroactive holiday needs this to show up promptly
  // instead of only on next reload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [holidays]);

  // Same holiday rationale as above, plus the initial mount fetch — this one
  // is deliberately not keyed on `month`, which is the entire point.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadToday, [holidays]);

  // This page doesn't otherwise re-render on a timer — force one every
  // minute so a tab left open across the 10:00 AM/10:30 AM boundary (or midnight
  // into a weekend) doesn't keep showing a stale enabled/disabled button.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const attendanceTodayIso = todayISO();
  // get_my_attendance also synthesizes a "Holiday" row for a holiday date
  // with no real record — that's not a genuine mark, so exclude it here or
  // a holiday would look like "already marked present". A half-day Leave/WFH
  // day can leave up to two real rows for today, one per half.
  const todaysRealRecords = todayRecords.filter((r) => r.date === attendanceTodayIso && r.status !== "Holiday");
  const latestMarkedAt = todaysRealRecords
    .map((r) => r.marked_at)
    .filter((v): v is string => !!v)
    .sort()
    .pop();
  const markedTodayStr = latestMarkedAt ? formatCommentTimestamp(latestMarkedAt) : null;

  // Both lists are already loaded in AppDataProvider — same pattern as
  // Shell.tsx's own topbar chip, which attendanceChipNow (orbit-client.js)
  // is shared with so the two buttons can never disagree about what's
  // currently markable.
  const todayIsoStr = attendanceTodayIso;
  const coversToday = (start: unknown, end: unknown) => {
    const s = (start as string) || "";
    const e = (end as string) || s;
    return !!s && s <= todayIsoStr && todayIsoStr <= e;
  };
  const myWfhToday = (allWfhRequests as unknown as { employee_id: string; status: string; date: unknown; end_date: unknown; half_day?: string | null }[]).find(
    (w) => w.employee_id === currentUser?.id && w.status === "Approved" && coversToday(w.date, w.end_date)
  ) || null;
  const myLeaveToday = (leaves as unknown as { employee_id: string; status: string; start_date: unknown; end_date: unknown; half_day?: string | null }[]).find(
    (l) => l.employee_id === currentUser?.id && l.status === "Approved" && coversToday(l.start_date, l.end_date)
  ) || null;
  const chip = attendanceChipNow(holidays, myWfhToday, myLeaveToday, todaysRealRecords, marking);
  // Non-null only on a genuine half-day WFH/Leave day (two slots to mark) —
  // this page has room to show both halves' own status side by side instead
  // of chip's single evolving button, which only ever names whichever slot
  // needs attention next. A normal day (including full-day WFH/Leave) keeps
  // using the one shared `chip` card below.
  const slotChips = attendanceSlotChipsNow(holidays, myWfhToday, myLeaveToday, todaysRealRecords, marking);
  // attendanceChipNow calls this internally too — cheap, pure date math, so
  // calling it again here for these three simple flags (used only in the
  // card's own copy below) is clearer than trying to reverse-engineer them
  // out of the chip's label/title text.
  const { isWeekend, isHoliday, holidayName } = attendanceWindowNow(holidays);
  const canMark = chip.canMark;
  // A half-day WFH/Leave day has a real record after its first half is
  // marked but still needs the other half, so the card must stay in its
  // "pending" look (not flip to green) until the chip itself says there's
  // nothing left to mark.
  const fullyMarked = chip.label === "Attendance marked";

  // "Fully marked" always wins, regardless of what the window looks like
  // right now — someone who marked at 10:05 AM shouldn't see this flip to
  // "Outside Hours" just because it's 8 PM now.
  const cardBg = fullyMarked ? "var(--status-success-bg)" : !canMark ? "var(--bg-page)" : "var(--status-warning-bg)";
  const cardIcon = fullyMarked ? "circle-check" : isHoliday ? "party-popper" : isWeekend ? "calendar" : chip.icon;
  const cardIconColor = fullyMarked ? "var(--status-success-text)" : !canMark ? "var(--text-muted)" : "var(--status-warning-text)";

  const presentCount = records.filter((r) => r.status === "Present").length;
  const lateCount = records.filter((r) => r.status === "Late").length;
  const absentCount = records.filter((r) => r.status === "Absent").length;
  const wfhCount = records.filter((r) => r.status === "WFH").length;
  const leaveCount = records.filter((r) => r.status === "Leave").length;

  // A half-day WFH/Leave date can have two rows (one per half) — key and
  // display both need half_day folded in, or React collides on the date-only
  // key and the table silently drops one of the two rows.
  const rows = records.map((r) => ({
    key: `${r.date}-${r.half_day || "full"}`,
    date: r.date,
    dayName: new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" }),
    halfDay: r.half_day || null,
    status: r.status,
    statusTone: attendanceStatusTone(r.status),
    markedAtStr: r.marked_at ? formatCommentTimestamp(r.marked_at) : "—",
    leaveApprovedByName: r.leave_approved_by_name || null,
  }));

  const markAttendance = () => {
    if (marking || !chip.canMark) return;
    setMarking(true);
    attendanceApi.mark().then(
      (rec: AttendanceRecord) => {
        setMarking(false);
        const halfSuffix = rec?.half_day ? ` (${rec.half_day})` : "";
        // Report the status the server actually wrote rather than inferring
        // it from the clock here — the backend owns the on-time cutoff, and
        // an approved WFH slot comes back "WFH" no matter what time it is.
        pushToast(
          rec?.status === "Late" ? `Attendance marked — recorded as Late${halfSuffix}.`
          : rec?.status === "WFH" ? `Attendance marked — recorded as Work From Home${halfSuffix}.`
          : `Attendance marked for today${halfSuffix}.`,
          rec?.status === "Late" ? "warning" : undefined
        );
        load();
        // The card reads todayRecords, not records, so it needs its own
        // refresh — otherwise it keeps saying "not marked" until a reload.
        // A half-day WFH day can still have a second slot left to mark, so
        // re-fetching (not optimistically appending) is what keeps the chip
        // in sync with exactly what the server now holds.
        loadToday();
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

      {/* A half-day WFH/Leave day needs two independent marks (the WFH/leave
          half and the office half), so it gets two side-by-side status
          cards here instead of the one shared evolving card — a normal day
          (full-day WFH/Leave included) only ever needs the single card,
          same as before this feature existed. */}
      {slotChips ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {slotChips.map((s) => {
            const marked = !!s.record;
            const bg = marked ? "var(--status-success-bg)" : s.canMark ? "var(--status-warning-bg)" : "var(--bg-page)";
            const fg = marked ? "var(--status-success-text)" : s.canMark ? "var(--status-warning-text)" : "var(--text-muted)";
            return (
              <div key={s.half} style={{ background: bg, border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9999, background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "var(--shadow-card)" }}>
                    <Icon name={s.icon} size={18} color={fg} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{s.half} · {s.kind === "wfh" ? "Work From Home" : "Office"}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: fg }}>{s.label}</div>
                  </div>
                </div>
                {/* Spells out the exact on-time cutoff clock time for this
                    half's own office slot (e.g. "until 3:40 PM") — a half-day
                    slot's cutoff isn't always 10:40 AM the way a normal day's
                    is, so it can't be left to the page's generic reminder line. */}
                {s.hint && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{s.hint}</div>}
                {s.canMark && (
                  <Button variant="primary" onClick={markAttendance}>{s.label}</Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
      <div style={{ background: cardBg, border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 9999, background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "var(--shadow-card)" }}>
            <Icon name={cardIcon} size={22} color={cardIconColor} />
          </div>
          <div>
            {/* attendanceChipNow already owns the full precedence chain
                (holiday/weekend/marked/which-half-is-markable-now) — reading
                its label/title here instead of re-deriving a parallel set of
                conditionals is what keeps this card and the topbar chip from
                ever disagreeing. */}
            {fullyMarked ? (
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--status-success-text)" }}>
                Marked{markedTodayStr ? ` at ${markedTodayStr}` : ""} today.
              </div>
            ) : (
              <div style={{ fontSize: 15, fontWeight: 600, color: chip.canMark ? "var(--status-warning-text)" : "var(--text-secondary)" }}>
                {chip.title || chip.label}
              </div>
            )}
            {isHoliday && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{holidayName}</div>}
            {/* A half-day office slot's own on-time cutoff (e.g. 3:40 PM for
                a Second Half slot) isn't always 10:40 AM the way a normal
                day's is — chip.hint spells out the real cutoff for THIS
                slot specifically, so it takes precedence over the generic
                line below rather than sitting next to a contradicting one. */}
            {chip.hint && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{chip.hint}</div>}
            {/* Short, always-visible reminder of the marking window — not just something you discover once you're blocked. */}
            {!chip.hint && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Attendance can be marked {ATTENDANCE_WINDOW_LABEL}, Mon–Fri. On time until {ATTENDANCE_ON_TIME_LABEL}.</div>
            )}
          </div>
        </div>
        {!fullyMarked && chip.canMark && (
          <Button variant="primary" onClick={markAttendance}>{chip.label}</Button>
        )}
        {!fullyMarked && !chip.canMark && !isHoliday && !isWeekend && (
          <Button variant="secondary" disabled>{chip.label}</Button>
        )}
      </div>
      )}

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>{monthLabelFrom(month)} summary</div>
        {/* Five tiles since Late joined the set (was four). auto-fit rather
            than a fixed repeat(5,1fr) so the extra tile wraps instead of
            squeezing all five onto a phone-width row. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 24 }}>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Present</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--status-success-text)" }}>{presentCount}</div>
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Late</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--status-warning-text)" }}>{lateCount}</div>
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
              <tr key={ar.key} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-primary)" }}>
                  {ar.date}
                  {ar.halfDay && <span style={{ marginLeft: 6, fontSize: 11.5, color: "var(--text-muted)" }}>({ar.halfDay})</span>}
                </td>
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
