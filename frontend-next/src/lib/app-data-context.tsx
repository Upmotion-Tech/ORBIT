"use client";

// Cross-cutting app data needed by the shell itself (sidebar Manager Hub
// detection + badge counts, topbar notification bell) — ported from
// bootAppData/loadEmployees/loadHrData/loadNotifications in script.js.
// Module-specific data (leads, projects, invoices, ...) is loaded by each
// module's own page, not here.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  employeesApi,
  leavesApi,
  wfhApi,
  notificationsApi,
  holidaysApi,
  setEmployeeCache,
} from "@/lib/orbit-client";
import { useAuth } from "@/lib/auth-context";

type Employee = { id: string; name: string; manager?: string | null; [key: string]: unknown };
type LeaveRequest = { id: string; status: string; employee_id: string; [key: string]: unknown };
type WfhRequest = { id: string; status: string; employee_id: string; [key: string]: unknown };
type Notification = { id: string; is_read: boolean; type?: string; title?: string; message?: string; created_at?: string; [key: string]: unknown };
type Holiday = { id: string; name: string; date: string; end_date?: string | null; day_count: number };

type AppDataContextValue = {
  employees: Employee[];
  leaves: LeaveRequest[];
  allWfhRequests: WfhRequest[];
  notifications: Notification[];
  holidays: Holiday[];
  reloadEmployees: () => void;
  reloadLeavesAndWfh: () => void;
  reloadNotifications: () => void;
  reloadHolidays: () => void;
  crmStagesList: string[];
  setCrmStagesList: React.Dispatch<React.SetStateAction<string[]>>;
};

// CRM pipeline stages have no backend table — in the original single-page
// app this was just in-memory component state (crmStagesList), reset on a
// full page reload, but shared live between the CRM screen and Setup >
// Stages & Sources since both read/wrote the same `this.state`. Hoisting it
// here (rather than local state in crm/page.tsx) preserves that sharing
// across route navigations in the multi-page port.
const CRM_STAGES_DEFAULT = ["New", "Contacted", "Proposal", "Negotiation", "Won", "Lost"];

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within <AppDataProvider>");
  return ctx;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [allWfhRequests, setAllWfhRequests] = useState<WfhRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [crmStagesList, setCrmStagesList] = useState<string[]>(CRM_STAGES_DEFAULT);

  const reloadEmployees = useCallback(() => {
    employeesApi.list().catch(() => []).then((emps: Employee[]) => {
      setEmployeeCache(emps);
      setEmployees(emps || []);
    });
  }, []);

  const reloadLeavesAndWfh = useCallback(() => {
    // loadHrData skips entirely for the dev-team-member persona in the
    // original (a Dev Member is normally an individual contributor with no
    // use for company-wide leave/WFH data) — same condition preserved here,
    // EXCEPT when this Dev Member actually has direct reports of their own:
    // Manager Hub still needs their real pending count in that case, so the
    // skip only applies to Dev Members who aren't managing anyone.
    if (currentUser && currentUser.access_level === "devmember") {
      const myName = (currentUser.name || "").trim().toLowerCase();
      const hasDirectReports = employees.some(
        (e) => e.manager && String(e.manager).trim().toLowerCase() === myName && e.name.trim().toLowerCase() !== myName
      );
      if (!hasDirectReports) return;
    }
    Promise.all([leavesApi.list().catch(() => []), wfhApi.all().catch(() => [])]).then(
      ([leaveData, wfhData]: [LeaveRequest[], WfhRequest[]]) => {
        setLeaves(leaveData || []);
        setAllWfhRequests(wfhData || []);
      }
    );
  }, [currentUser, employees]);

  const reloadNotifications = useCallback(() => {
    notificationsApi.list().then(
      (data: Notification[]) => setNotifications(data || []),
      (err: unknown) => console.error("Failed to load notifications:", err)
    );
  }, []);

  // Small, rarely-changing dataset (a handful of holidays a year) — needed
  // by both the topbar's Mark Attendance button and the My Attendance page
  // to know whether today is a holiday, so it's loaded once here rather
  // than duplicated in each place.
  const reloadHolidays = useCallback(() => {
    holidaysApi.list().then(
      (data: Holiday[]) => setHolidays(data || []),
      () => setHolidays([])
    );
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    reloadEmployees();
    reloadLeavesAndWfh();
    reloadNotifications();
    reloadHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // The boot effect above fires reloadLeavesAndWfh before `employees` has
  // actually resolved (reloadEmployees's fetch hasn't landed yet), so a Dev
  // Member manager's hasDirectReports check above sees an empty list and
  // wrongly skips on that first pass. Re-check once employees comes in.
  useEffect(() => {
    if (currentUser?.access_level === "devmember") reloadLeavesAndWfh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  return (
    <AppDataContext.Provider
      value={{
        employees,
        leaves,
        allWfhRequests,
        notifications,
        holidays,
        reloadEmployees,
        reloadLeavesAndWfh,
        reloadNotifications,
        reloadHolidays,
        crmStagesList,
        setCrmStagesList,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}
