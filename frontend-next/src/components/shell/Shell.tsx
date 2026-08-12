"use client";

// Port of the app shell (sidebar + topbar) from unpacked/template.html
// lines 2061-2186. Screen ids now map to real Next.js routes instead of
// internal `screen` state (setScreen(id) -> router.push('/' + id)), per the
// agreed real-routing plan. Search-results/notification click-through
// navigation is stubbed for now (routes to build in the next increment);
// the dropdowns themselves are fully wired to real data.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/app-data-context";
import { useToast } from "@/lib/toast-context";
import {
  mergeAccess,
  derivePersonaFlavor,
  deriveLandingFromAccess,
  notificationsApi,
  leadsApi,
  projectsApi,
  tasksApi,
  customersApi,
  employeesApi,
  attendanceApi,
  deepLinkHref,
  isModifiedClick,
  formatActivityTimestamp,
  todayISO,
  PKT_TZ,
  attendanceWindowNow,
} from "@/lib/orbit-client";
import { SidebarSection, Icon, Avatar } from "@/design-system/healer-bundle";
import SmoothScroll from "./SmoothScroll";

const MOBILE_BREAKPOINT = "(max-width: 768px)";

type NavItem = { id: string; label: string; icon?: string };
type SearchResult = { kind: string; title: string; subtitle: string; href: string };

function screenIdToPath(id: string) {
  return id === "dashboard" ? "/" : "/" + id;
}
function pathToScreenId(pathname: string) {
  if (pathname === "/") return "dashboard";
  return pathname.replace(/^\//, "").split("/")[0];
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { currentUser, handleLogout } = useAuth();
  const { employees, leaves, allWfhRequests, notifications, holidays, reloadNotifications } = useAppData();
  const { pushToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  // On mobile the notification flyout is position:fixed (see globals.css —
  // position:absolute relative to the small bell-button anchor used to clip/
  // cut off there), so it needs its own on-screen coordinates instead of an
  // ancestor to anchor against. Measured fresh each time it opens (not on a
  // resize listener — the topbar's wrapped height only actually changes on
  // orientation change/rotation, which remounts the page anyway) and handed
  // to the CSS via custom properties (see .orbit-notif-flyout) rather than
  // plain inline top/right, since inline styles can never win against the
  // shared .orbit-topbar-flyout rule's own `!important` bottom-sheet values.
  const notifWrapRef = useRef<HTMLDivElement | null>(null);
  const [notifPanelPos, setNotifPanelPos] = useState<{ top: number; right: number } | null>(null);

  // ---- Auto-refresh when the app is reopened after being backgrounded ----
  // Installed as a standalone PWA, there's no browser chrome to pull down
  // against, so the native "pull to refresh" gesture simply doesn't exist in
  // that mode (true of any installed PWA, not specific to this app) — the
  // only thing that reliably showed fresh data was force-closing and
  // reopening, which is really just a full reload happening to occur. This
  // reproduces that same full reload automatically instead of requiring the
  // manual force-close: a `visibilitychange` to "hidden" starts a clock, and
  // coming back "visible" after a meaningful gap reloads the page. The
  // threshold (2 minutes) exists so a brief app-switch — glancing at a
  // notification, then straight back — doesn't cost someone their scroll
  // position or an unsaved form field for a reload that wouldn't have found
  // anything new anyway; only a background long enough for data to actually
  // go stale triggers it.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const REFRESH_AFTER_HIDDEN_MS = 2 * 60 * 1000;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (document.visibilityState === "visible" && hiddenAt !== null) {
        const hiddenForMs = Date.now() - hiddenAt;
        hiddenAt = null;
        if (hiddenForMs > REFRESH_AFTER_HIDDEN_MS) {
          window.location.reload();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // ---- Topbar live clock (PKT, matches the rest of the app's fixed
  // Asia/Karachi timezone standard, not the visitor's browser/OS clock) ----
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clockDateStr = now ? now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: PKT_TZ }) : "";
  const clockTimeStr = now ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: PKT_TZ }) : "";

  // ---- Topbar "Mark Attendance" quick action ----
  // Shell stays mounted across client-side navigation (only `children`
  // swaps), so this loads once per session rather than once per page.
  // POST /api/attendance/mark is idempotent (see AttendanceService.
  // mark_attendance) — already used by the My Attendance page's own button;
  // this is the same call, just reachable from anywhere instead of only
  // after navigating there.
  const [attendanceMarkedToday, setAttendanceMarkedToday] = useState(false);
  const [marking, setMarking] = useState(false);
  // Recomputed on every render — Shell already re-renders every second for
  // the live clock (see `now`/setInterval below), so this naturally stays
  // current without its own ticker.
  const { isWeekend, isWithinHours, isBeforeWindow, isAfterWindow, isHoliday, holidayName, canMark } = attendanceWindowNow(holidays);

  // Once the window closes with nothing marked, the outcome is already
  // determined — but the server won't write the row until the 23:55 sweep
  // (main.py's _run_attendance_sweep), so between 10:30 and then there is no
  // record to read and the chip has to work it out itself.
  //
  // run_end_of_day_sweep resolves in a specific order — approved WFH, then
  // approved leave, then Absent — and this mirrors it exactly. Getting the
  // order wrong (or skipping straight to "Absent") would tell someone with an
  // approved leave day that they're absent, for the whole working day, until
  // 23:55 quietly corrected it. They were never supposed to mark in the first
  // place. Both lists are already loaded in AppDataProvider, so this costs no
  // extra request.
  // Both context types carry an index signature, so their date fields come
  // through as `unknown` and need casting before comparison (the same gotcha
  // frontend-next/CLAUDE.md lists). A null end_date means a single-day
  // request, matching find_approved_for_employee_and_date on the backend.
  const todayIsoStr = todayISO();
  const coversToday = (start: unknown, end: unknown) => {
    const s = (start as string) || "";
    const e = (end as string) || s;
    return !!s && s <= todayIsoStr && todayIsoStr <= e;
  };
  const myApprovedWfhToday = allWfhRequests.some(
    (w) => w.employee_id === currentUser?.id && w.status === "Approved" && coversToday(w.date, w.end_date)
  );
  const myApprovedLeaveToday = leaves.some(
    (l) => l.employee_id === currentUser?.id && l.status === "Approved" && coversToday(l.start_date, l.end_date)
  );

  // Label, icon, aria-label, title and style class each used to repeat their
  // own copy of this precedence chain inline. That's exactly how "Attendance
  // marked" became unreachable after 10:30 — the window check sat ahead of
  // the marked check in some copies and the chain was long enough that it
  // wasn't obvious. One object, five consumers, no drift.
  //
  // Icon names are resolved straight into a lucide CDN URL by the design
  // system's Icon (healer-bundle.js), so a name that doesn't exist in
  // lucide-static 0.400.0 renders a blank box rather than erroring — every
  // name below is one already in use elsewhere in this app.
  const attendanceChip = (() => {
    if (marking) return { label: "Marking…", icon: "clock", aria: "Marking attendance", title: undefined as string | undefined, cls: " is-pending" };
    // Neither is a working day, so nothing is expected and nothing is owed.
    if (isHoliday) return { label: "Holiday", icon: "party-popper", aria: `Holiday — ${holidayName}`, title: `Holiday — ${holidayName}`, cls: " is-unavailable" };
    if (isWeekend) return { label: "Weekend", icon: "moon", aria: "Weekend — attendance not required", title: "Weekend — no attendance needed today", cls: " is-unavailable" };
    // Marked wins over the window from here down — marking at 10:08 should
    // still read "Attendance marked" at 6 PM, not "Outside Hours".
    if (attendanceMarkedToday) return { label: "Attendance marked", icon: "circle-check", aria: "Attendance marked for today", title: "Attendance already marked for today", cls: " is-done" };
    if (isBeforeWindow) return { label: "Attendance Slot 10:00 AM–10:30 AM", icon: "clock", aria: "Attendance slot opens at 10:00 AM", title: "Attendance can be marked between 10:00 AM and 10:30 AM", cls: " is-unavailable" };
    if (isWithinHours) return { label: "Mark Attendance", icon: "clock", aria: "Mark attendance", title: undefined as string | undefined, cls: " is-pending" };
    // Past the window and unmarked: mirror run_end_of_day_sweep's own
    // WFH -> Leave -> Absent order, since that's what will land at 23:55.
    if (myApprovedWfhToday) return { label: "WFH", icon: "circle-check", aria: "Working from home today", title: "Approved work-from-home day — no attendance needed", cls: " is-done" };
    if (myApprovedLeaveToday) return { label: "On Leave", icon: "calendar", aria: "On approved leave today", title: "Approved leave — no attendance needed", cls: " is-done" };
    return { label: "Absent", icon: "triangle-alert", aria: "Absent — attendance window closed", title: "The 10:00 AM–10:30 AM window closed with no attendance marked", cls: " is-unavailable" };
  })();

  useEffect(() => {
    // Still worth fetching even outside the 10:00 AM-10:30 AM window (but not on a
    // weekend, when there's never anything to find) — the label itself
    // switches to "Outside Hours" once the window closes regardless of
    // whether they already marked (see the button below), but this is
    // still what keeps the button correctly disabled so it can't be
    // clicked again. Re-runs whenever `holidays` changes too (e.g. right
    // after Setup creates one covering today) so a same-day retroactive
    // holiday's server-side erasure of an existing "Present" row is
    // reflected here promptly rather than only on next login.
    if (!currentUser?.id || isWeekend) return;
    const today = new Date();
    attendanceApi.me(today.getFullYear(), today.getMonth() + 1).then(
      (records: { date: string; status: string }[]) => {
        // get_my_attendance also synthesizes a "Holiday" row for a holiday
        // date with no real record — that's not a genuine mark, so exclude
        // it or a holiday would look like "already marked".
        setAttendanceMarkedToday((records || []).some((r) => r.date === todayISO() && r.status !== "Holiday"));
      },
      () => {}
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, holidays]);

  const markAttendance = () => {
    if (marking || attendanceMarkedToday || !canMark) return;
    setMarking(true);
    attendanceApi.mark().then(
      () => {
        setMarking(false);
        setAttendanceMarkedToday(true);
        pushToast("Attendance marked for today.");
      },
      (err: Error) => {
        setMarking(false);
        pushToast(err.message || "Could not mark attendance.", "error");
      }
    );
  };
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  // Starts expanded (matches desktop, and avoids an SSR/hydration mismatch —
  // window isn't available on the server) and immediately collapses once
  // mounted if the viewport is actually phone-sized, so a phone visitor
  // isn't greeted with the sidebar covering the whole screen.
  useEffect(() => {
    if (window.matchMedia(MOBILE_BREAKPOINT).matches) setSidebarExpanded(false);
  }, []);

  // AnimatePresence (below, where the panel/backdrop render) keeps each one
  // mounted through its own exit animation and only then actually unmounts
  // it, so this can just flip the boolean directly — no more manual
  // "wait for the CSS animation, then unmount" delay to hand-roll.
  const closeSidebarAnimated = () => setSidebarExpanded(false);

  const activeScreen = pathToScreenId(pathname || "/");
  const setScreen = (id: string) => {
    router.push(screenIdToPath(id));
    // On a phone the sidebar is a full overlay (see the mobile media query
    // in globals.css) — leaving it open over the newly-navigated-to page
    // would just hide the page behind it.
    if (window.matchMedia(MOBILE_BREAKPOINT).matches) closeSidebarAnimated();
  };

  const accessLevels = currentUser?.access_levels || ["employee"];
  const access = mergeAccess(accessLevels);
  const persona = currentUser?.access_level || derivePersonaFlavor(accessLevels);
  const userName = currentUser?.name || "User";
  const userRole = (currentUser?.role as string) || "Member";

  // ---- Universal Search (topbar) ----
  // Searches across every module the user actually has access to —
  // including task tags, not just titles — and deep-links straight to the
  // matching lead/project/task/customer/employee via the same #/type/id
  // mechanism used for "open in new tab" elsewhere. Fetched fresh per query
  // (debounced) rather than kept preloaded, since leads/projects/tasks/
  // employees are otherwise only ever loaded by their own page.
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchRequestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    const q = debouncedQuery;
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    const requestId = ++searchRequestId.current;
    setSearchLoading(true);
    const tasks: Promise<SearchResult[]>[] = [];
    if (access.crm) {
      tasks.push(
        leadsApi.search(q, 5).then((rows: { id: string; name: string; poc: string; stage: string }[]) =>
          rows.map((l) => ({ kind: "Lead", title: l.name, subtitle: l.poc + " · " + l.stage, href: "/crm" + deepLinkHref("lead", l.id) }))
        ).catch(() => [])
      );
    }
    if (access.dev) {
      tasks.push(
        projectsApi.list({ search: q }).then((rows: { id: string; name: string; client: string; status: string }[]) =>
          rows.slice(0, 5).map((p) => ({ kind: "Project", title: p.name, subtitle: p.client + " · " + p.status, href: "/dev" + deepLinkHref("project", p.id) }))
        ).catch(() => [])
      );
      tasks.push(
        tasksApi.list({ search: q }).then((rows: { id: string; title: string; status: string; tags?: string[] }[]) =>
          rows.slice(0, 5).map((t) => ({
            kind: "Task", title: t.title,
            subtitle: t.status + (t.tags && t.tags.length ? " · #" + t.tags.join(" #") : ""),
            href: "/dev" + deepLinkHref("task", t.id),
          }))
        ).catch(() => [])
      );
    }
    if (access.customers) {
      tasks.push(
        customersApi.list(q).then((rows: { id: string; company_name: string; primary_contact_name?: string | null }[]) =>
          rows.slice(0, 5).map((c) => ({ kind: "Customer", title: c.company_name, subtitle: c.primary_contact_name || "", href: "/customers" + deepLinkHref("customer", c.id) }))
        ).catch(() => [])
      );
    }
    if (access.hr) {
      tasks.push(
        employeesApi.list({ search: q }).then((rows: { id: string; name: string; role: string; department: string }[]) =>
          rows.slice(0, 5).map((e) => ({ kind: "Person", title: e.name, subtitle: e.role + " · " + e.department, href: "/hr" + deepLinkHref("employee", e.id) }))
        ).catch(() => [])
      );
    }
    Promise.all(tasks).then((groups) => {
      if (searchRequestId.current !== requestId) return; // a newer query already superseded this one
      setSearchResults(groups.flat().slice(0, 8));
      setSearchLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const goToSearchResult = (e: React.MouseEvent, href: string) => {
    if (isModifiedClick(e)) return;
    e.preventDefault();
    router.push(href);
    setSearchQuery("");
    setSearchOpen(false);
  };

  const goToMyRecord = (e: React.MouseEvent) => {
    if (isModifiedClick(e)) return;
    e.preventDefault();
    router.push("/me-record");
  };

  const dashboardItems: NavItem[] = persona === "owner"
    ? [{ id: "dashboard", label: "Home", icon: "house" }, { id: "reports", label: "Reports", icon: "bar-chart-2" }]
    : [{ id: "dashboard", label: "Home", icon: "house" }];
  const crmItems: NavItem[] = [{ id: "crm", label: "Leads", icon: "users" }];
  const customersItems: NavItem[] = [{ id: "customers", label: "Customers", icon: "user" }];
  const devItems: NavItem[] = [{ id: "dev", label: persona === "devmember" ? "My Projects" : "Projects", icon: "flask-conical" }];
  const financeItems: NavItem[] = [{ id: "finance", label: "Invoices & Expenses", icon: "credit-card" }];
  const hrItems: NavItem[] = [{ id: "hr", label: "Human Resources", icon: "clipboard-list" }];
  const meItems: NavItem[] = [
    { id: "me-leave", label: "My Leave", icon: "calendar" },
    { id: "me-attendance", label: "My Attendance", icon: "circle-check" },
    { id: "me-policies", label: "Policies", icon: "file-text" },
    { id: "me-record", label: "My Record", icon: "user" },
  ];
  const adminItems: NavItem[] = [{ id: "setup", label: "Settings", icon: "settings" }];

  // ---- Manager Hub detection & badge count (script.js:4117-4143) ----
  const myNameNorm = (userName || "").trim().toLowerCase();
  const directReportEmps = employees.filter(
    (e) => e.manager && String(e.manager).trim().toLowerCase() === myNameNorm && e.name.trim().toLowerCase() !== myNameNorm
  );
  const showManagerSection = directReportEmps.length > 0;
  const directReportEmpIds = new Set(directReportEmps.map((e) => e.id));
  const pendingDirectLeaves = leaves.filter((lr) => lr.status === "Pending" && directReportEmpIds.has(lr.employee_id));
  const pendingDirectWfh = allWfhRequests.filter((w) => w.status === "Pending" && directReportEmpIds.has(w.employee_id));
  const managerPendingCount = pendingDirectLeaves.length + pendingDirectWfh.length;
  const managerItems: NavItem[] = [
    {
      id: "manager-leave",
      label: managerPendingCount > 0 ? `Leave Requests (${managerPendingCount})` : "Leave Requests",
      icon: "clipboard-check",
    },
  ];

  // ---- Access guard ----
  // Sidebar links are already filtered by `access`, but nothing previously
  // stopped someone from *landing* on (or directly navigating to) a screen
  // their access_levels don't cover — e.g. a Dev Member logging in at the
  // bare root URL got the full company Dashboard ("/") since that route
  // never checked access at all, only the sidebar hid its own link to it.
  // This bounces any such visit to the correct screen for their real access,
  // the same redirect `landingScreen`/`deriveLandingFromAccess` was already
  // computing but nothing ever actually navigated to.
  const isScreenAllowed = (screenId: string): boolean => {
    switch (screenId) {
      case "dashboard": return access.dashboard;
      case "reports": return access.dashboard && persona === "owner";
      case "crm": return access.crm;
      case "customers": return access.customers;
      case "dev": return access.dev;
      case "finance": return access.finance;
      case "hr": return access.hr;
      case "setup": return access.permissions;
      case "manager-leave": return showManagerSection;
      default: return true; // "me-*" screens (always available) + unknown routes
    }
  };
  useEffect(() => {
    if (!isScreenAllowed(activeScreen)) {
      router.replace(screenIdToPath(deriveLandingFromAccess(access)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScreen, access.dashboard, access.crm, access.customers, access.dev, access.finance, access.hr, access.permissions, persona, showManagerSection]);

  const unread = notifications.filter((n) => !n.is_read);
  const hasNotifications = unread.length > 0;
  const hasAnyNotifications = notifications.length > 0;
  const hasUnreadNotifications = unread.length > 0;

  const notifIconFor = (n: { type?: string }) => {
    const typeLc = (n.type || "").toLowerCase();
    if (typeLc.includes("leave")) return "calendar";
    if (typeLc.includes("project")) return "folder";
    if (typeLc.includes("task")) return "check-square";
    if (typeLc.includes("comment")) return "message-square";
    if (typeLc.includes("attachment")) return "paperclip";
    if (typeLc.includes("lead")) return "dollar-sign";
    return "bell";
  };

  // Precise deep-link when the notification carries a related_type/id (set
  // server-side for task/project assignments — see backend/app/services/
  // task_service.py & project_service.py); otherwise a best-effort plain
  // page route from the notification's type string, same substring approach
  // notifIconFor already uses. Returns null when there's nowhere sensible to
  // send the click (e.g. "Removed from Project" — no longer accessible).
  const notificationHref = (n: { type?: string; related_type?: string; related_id?: string }): string | null => {
    const typeLc = (n.type || "").toLowerCase();
    // A request still awaiting a manager's decision ("Leave Submitted",
    // "WFH Requested") goes to Manager Hub (which flashes/scrolls to the
    // exact row — no separate details drawer exists there); an
    // already-decided one ("Leave/WFH Approved/Rejected") opens that exact
    // request's drawer on the employee's own history page.
    const isPendingDecision = typeLc.includes("submitted") || typeLc.includes("requested");
    if (n.related_type && n.related_id) {
      if (n.related_type === "task") return "/dev" + deepLinkHref("task", n.related_id);
      if (n.related_type === "project") return "/dev" + deepLinkHref("project", n.related_id);
      if (n.related_type === "lead") return "/crm" + deepLinkHref("lead", n.related_id);
      if (n.related_type === "customer") return "/customers" + deepLinkHref("customer", n.related_id);
      if (n.related_type === "employee") return "/hr" + deepLinkHref("employee", n.related_id);
      if (n.related_type === "leave" || n.related_type === "wfh") {
        return isPendingDecision
          ? (showManagerSection ? "/manager-leave" + deepLinkHref(n.related_type, n.related_id) : null)
          : "/me-leave" + deepLinkHref(n.related_type, n.related_id);
      }
    }
    // Fallback for notifications that predate related_type/id, or for which
    // resolving a specific record failed server-side (e.g. no exact
    // employee-name match) — same best-effort plain page route notifIconFor
    // already uses for its icon.
    if (isPendingDecision) return showManagerSection ? "/manager-leave" : null;
    if (typeLc.includes("leave") || typeLc.includes("wfh")) return "/me-leave";
    if (typeLc.includes("salary")) return "/me-record";
    if (typeLc.includes("expense") || typeLc.includes("invoice") || typeLc.includes("milestone")) return access.finance ? "/finance" : null;
    if (typeLc.includes("job") || typeLc.includes("opening") || typeLc.includes("candidate")) return access.hr ? "/hr" : null;
    if (typeLc.includes("project") || typeLc.includes("task")) return access.dev ? "/dev" : null;
    return null;
  };

  const goToNotification = (n: { id: string; is_read: boolean; type?: string; related_type?: string; related_id?: string }) => {
    const href = notificationHref(n);
    if (!n.is_read) {
      notificationsApi.markRead(n.id, true).then(reloadNotifications);
    }
    if (href) {
      setNotifOpen(false);
      router.push(href);
    }
  };

  const goHome = () => setScreen(persona === "owner" ? "dashboard" : "dashboard");

  const sections = useMemo(
    () => [
      { show: access.dashboard, label: "Dashboard", items: dashboardItems },
      { show: access.crm, label: "CRM", items: crmItems },
      { show: access.customers, label: "Customers", items: customersItems },
      { show: access.dev, label: "Software Dev", items: devItems },
      { show: access.finance, label: "Finance", items: financeItems },
      { show: access.hr, label: "", items: hrItems },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [access.dashboard, access.crm, access.customers, access.dev, access.finance, access.hr, persona]
  );

  // Sidebar items navigate via router.push() on click rather than a real
  // <Link>, so without this, Next.js only starts fetching a route's code
  // *after* the click — the first visit to any given screen in a session
  // pays that fetch/compile cost as visible lag. Prefetching every
  // currently-visible item up front (same mechanism a <Link> uses under the
  // hood) means that cost is already paid by the time the click happens.
  useEffect(() => {
    const allItems = [
      ...sections.flatMap((s) => (s.show ? s.items : [])),
      ...(showManagerSection ? managerItems : []),
      ...meItems,
      ...(access.permissions ? adminItems : []),
    ];
    allItems.forEach((item: NavItem) => router.prefetch(screenIdToPath(item.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, showManagerSection, access.permissions]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <AnimatePresence>
        {sidebarExpanded && (
          <motion.div
            key="sidebar-panel"
            className="orbit-sidebar"
            initial={{ x: -16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -16, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              width: "var(--sidebar-width)",
              flexShrink: 0,
              background: "var(--bg-sidebar)",
              borderRight: "1px solid var(--border-subtle)",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <SmoothScroll style={{ flex: 1, minHeight: 0, padding: "24px 12px" }}>
              <div
                onClick={goHome}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px", marginBottom: 32, cursor: "pointer" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/orbit-logo.png" alt="" style={{ width: 32, height: 32, flexShrink: 0, display: "block" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "0.04em", color: "var(--text-primary)", lineHeight: 1.1 }}>ORBIT</span>
                  <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.01em", color: "var(--text-muted)", lineHeight: 1.1 }}>Powered by Upmotion Tech</span>
                </div>
              </div>

              <a
                href="/me-record"
                onClick={goToMyRecord}
                className="orbit-profile-chip orbit-sidebar-mobile-profile"
                aria-label={`${userName} — open My Record`}
              >
                <div className="orbit-avatar-ring">
                  <Avatar name={userName} size={34} style={{ background: "#fff", color: "#4338CA", fontWeight: 700 }} />
                </div>
                <div className="orbit-profile-text">
                  <div className="orbit-profile-name">{userName}</div>
                  <div className="orbit-profile-role">{userRole}</div>
                </div>
                <Icon name="chevron-right" size={14} color="currentColor" className="orbit-profile-chevron" />
              </a>

              {sections.map((s) =>
                s.show ? (
                  <SidebarSection key={s.label} label={s.label} items={s.items} activeId={activeScreen} onSelect={setScreen} />
                ) : null
              )}

              {showManagerSection && (
                <SidebarSection label="Manager Hub" items={managerItems} activeId={activeScreen} onSelect={setScreen} />
              )}
              <SidebarSection label="Me" items={meItems} activeId={activeScreen} onSelect={setScreen} />
              {access.permissions && (
                <SidebarSection label="Settings" items={adminItems} activeId={activeScreen} onSelect={setScreen} />
              )}

              <div className="orbit-logout-wrap">
                <button className="sidebar-logout-btn" onClick={handleLogout}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </SmoothScroll>
          </motion.div>
        )}
        </AnimatePresence>
        <AnimatePresence>
        {sidebarExpanded && (
          <motion.div
            key="sidebar-backdrop"
            className="orbit-sidebar-backdrop"
            onClick={closeSidebarAnimated}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          />
        )}
        </AnimatePresence>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            className="orbit-topbar"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              height: "var(--topbar-height)",
              padding: "0 24px",
              background: "var(--bg-surface)",
              borderBottom: "1px solid var(--border-subtle)",
              flexShrink: 0,
              position: "relative",
            }}
          >
            <button
              onClick={() => (sidebarExpanded ? closeSidebarAnimated() : setSidebarExpanded(true))}
              aria-label="Toggle menu"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 6, lineHeight: 0, flexShrink: 0 }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className="orbit-topbar-mobile-logo" onClick={goHome} style={{ cursor: "pointer" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/orbit-logo.png" alt="" style={{ width: 40, height: 40, display: "block" }} />
              <span>ORBIT</span>
            </div>

            <div ref={searchBoxRef} className="orbit-topbar-search" style={{ position: "relative", flex: "1 1 220px", minWidth: 160, maxWidth: 360 }}>
              <div
                className="orbit-topbar-search-inner"
                style={{
                  display: "flex",
                  flexWrap: "nowrap",
                  alignItems: "center",
                  gap: 8,
                  background: "#fff",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 10,
                  padding: "9px 16px",
                }}
              >
                <Icon name="search" size={18} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search Anything"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  style={{ border: "none", outline: "none", background: "transparent", flex: 1, minWidth: 0, fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--text-primary)" }}
                />
              </div>
              {searchOpen && debouncedQuery.length >= 2 && (
                <SmoothScroll
                  className="crm-pop orbit-topbar-flyout"
                  style={{ position: "absolute", top: 44, left: 0, width: 380, maxHeight: 440, background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-popover)", zIndex: 2000 }}
                >
                  {searchLoading && (
                    <div style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>Searching…</div>
                  )}
                  {!searchLoading && searchResults.length === 0 && (
                    <div style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>No results for &ldquo;{debouncedQuery}&rdquo;.</div>
                  )}
                  {!searchLoading && searchResults.map((r, i) => (
                    <a
                      key={i}
                      href={r.href}
                      onClick={(e) => goToSearchResult(e, r.href)}
                      style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", textDecoration: "none", color: "inherit" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--brand-primary)", background: "var(--brand-primary-light)", borderRadius: 9999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.03em" }}>{r.kind}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>{r.title}</span>
                      </div>
                      {r.subtitle && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.subtitle}</div>}
                    </a>
                  ))}
                </SmoothScroll>
              )}
            </div>

            <div className="orbit-clock" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap", flexShrink: 0 }}>
              <Icon name="clock" size={15} color="var(--text-muted)" />
              <span className="orbit-clock-date">{clockDateStr}</span>
              <span className="orbit-clock-sep" style={{ color: "var(--text-muted)" }}>&middot;</span>
              <span className="orbit-clock-time">{clockTimeStr}</span>
            </div>

            <button
              onClick={markAttendance}
              disabled={marking || attendanceMarkedToday || !canMark}
              style={{ marginLeft: "auto" }}
              aria-label={attendanceChip.aria}
              title={attendanceChip.title}
              className={"orbit-attendance-btn" + attendanceChip.cls + (marking ? " is-marking" : "")}
            >
              <span className="orbit-attendance-icon-badge">
                <Icon name={attendanceChip.icon} size={13} color="#fff" />
              </span>
              <span className="orbit-attendance-label">{attendanceChip.label}</span>
            </button>

            <div ref={notifWrapRef} className="orbit-notif-wrap" style={{ position: "relative" }}>
              <button
                onClick={() => {
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (next) {
                    reloadNotifications();
                    const rect = notifWrapRef.current?.getBoundingClientRect();
                    if (rect) {
                      setNotifPanelPos({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
                    }
                  }
                }}
                aria-label="Notifications"
                style={{ position: "relative", background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 9999, cursor: "pointer", padding: 8, lineHeight: 0 }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {hasNotifications && (
                  <span
                    style={{
                      position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, padding: "0 4px",
                      borderRadius: 9999, background: "var(--notification-dot)", color: "#fff", fontSize: 10, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {unread.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <SmoothScroll
                  className="crm-pop orbit-topbar-flyout orbit-notif-flyout"
                  style={{
                    position: "absolute", top: 44, right: 0, width: 380, maxHeight: 440, background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-popover)", zIndex: 2000,
                    ...(notifPanelPos
                      ? ({ "--notif-top": `${notifPanelPos.top}px`, "--notif-right": `${notifPanelPos.right}px` } as React.CSSProperties)
                      : {}),
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Notifications</span>
                    {hasUnreadNotifications && (
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          notificationsApi.markAllRead().then(reloadNotifications);
                        }}
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}
                      >
                        Mark all as read
                      </a>
                    )}
                  </div>
                  {!hasAnyNotifications && (
                    <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>No notifications yet.</div>
                  )}
                  {notifications.map((n) => {
                    const href = notificationHref(n);
                    return (
                      <div
                        key={n.id}
                        onClick={() => goToNotification(n)}
                        style={{
                          display: "flex", gap: 10, padding: "14px 16px",
                          borderBottom: "1px solid var(--border-subtle)",
                          cursor: href || !n.is_read ? "pointer" : "default",
                          background: n.is_read ? "transparent" : "var(--brand-primary-light, rgba(37,99,235,0.06))",
                        }}
                      >
                        {!n.is_read && (
                          <span style={{ width: 7, height: 7, borderRadius: 9999, background: "var(--brand-primary)", flexShrink: 0, marginTop: 6 }} />
                        )}
                        <Icon name={notifIconFor(n)} size={16} color="var(--text-muted)" />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: n.is_read ? 400 : 600, lineHeight: 1.4 }}>{n.message || n.title}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{formatActivityTimestamp(n.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </SmoothScroll>
              )}
            </div>

            <a
              href="/me-record"
              onClick={goToMyRecord}
              className="orbit-profile-chip"
              aria-label={`${userName} — open My Record`}
            >
              <div className="orbit-avatar-ring">
                <Avatar name={userName} size={34} style={{ background: "#fff", color: "#4338CA", fontWeight: 700 }} />
              </div>
              <div>
                <div className="orbit-profile-name">{userName}</div>
                <div className="orbit-profile-role">{userRole}</div>
              </div>
              <Icon name="chevron-right" size={14} color="currentColor" className="orbit-profile-chevron" />
            </a>
          </div>

          <SmoothScroll className="orbit-screen-content" style={{ flex: 1, padding: 24 }} allowPullToRefresh>
            {isScreenAllowed(activeScreen) ? children : null}
          </SmoothScroll>
        </div>
      </div>
    </div>
  );
}
