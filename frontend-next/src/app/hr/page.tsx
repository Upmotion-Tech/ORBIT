"use client";

// Port of `screenIsHr` (Employees/Leave Requests/Hiring/Leave Count/
// Attendance tabs) + Employee drawer, Leave drawer (read-only — see below),
// Opening drawer, Delete Opening confirm
// (template.html:4190-4799, script.js logic at 2005-2452, 5360-5620).
// Candidate resume upload is intentionally a no-op toast ("not yet
// implemented via API") — that's the real behavior in the original app too,
// not something cut during the port. Leave Requests tab (and the Attendance
// tab's WFH list) are read-only — Approve/Reject moved to the employee's
// manager via Manager Hub; the drawer still shows who decided and their note.

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/app-data-context";
import { useToast } from "@/lib/toast-context";
import { useClosingTransition } from "@/lib/use-closing-transition";
import SmoothScroll from "@/components/shell/SmoothScroll";
import {
  employeesApi,
  leavesApi,
  openingsApi,
  candidatesApi,
  attendanceApi,
  moneyPKR,
  numVal,
  fromISO,
  todayISO,
  addDaysISO,
  isValidEmail,
  isValidNumber,
  isPhoneComplete,
  formatPhoneInput,
  formatCnicInput,
  formatCommentTimestamp,
  getEmployeeName,
  ACCESS_LEVEL_OPTIONS,
  DEPT_ACCESS_LEVEL,
  DEPARTMENT_OPTIONS,
  LEAVE_COUNT_RANGE_OPTIONS,
  resolveDateRangePreset,
  validateUploadFile,
  deepLinkHref,
  isModifiedClick,
  parseDeepLinkHash,
  clearDeepLinkHash,
} from "@/lib/orbit-client";
import { Button, Input, Select, Badge, Icon } from "@/design-system/healer-bundle";

type Employee = {
  id: string; name: string; role: string; department: string; manager?: string | null; start_date?: string | null;
  employment_type: string; probation_status?: string; probation_end?: string | null; email: string; salary?: number;
  birthdate?: string | null; phone?: string | null; emergency_contact?: string | null; emergency_contact_relation?: string | null;
  contract_file_url?: string | null; contract_file_name?: string | null; access_levels?: string[]; status?: string;
  cnic?: string | null;
};
type LeaveBalance = { casual_remaining: number; sick_remaining: number; annual_remaining: number };
type Leave = {
  id: string; employee_id: string; employee_name?: string; leave_type: string; status: string; start_date: string;
  end_date?: string | null; days: number; reason?: string; approval_note?: string; rejection_reason?: string; created_at?: string;
  approved_by_id?: string | null; approved_at?: string | null;
};
type Wfh = {
  id: string; employee_id: string; employee_name?: string; date: string; status: string; description?: string; decision_note?: string; created_at?: string;
  decided_by?: string | null; decided_at?: string | null;
};
type Opening = { id: string; title: string; department: string; opened_at?: string; candidate_count?: number; status: string; salary_bracket?: string; experience?: string; description?: string };
type Candidate = { id: string; name: string; rating?: number; applied_date?: string; stage: string; resume_url?: string; notes?: string };
type AttendanceRow = {
  employee_id?: string; employee_name?: string; employee_department?: string; date: string; status: string; marked_at?: string | null;
  leave_approved_by_name?: string | null;
};

const HIRE_STAGES = ["Applied", "Screening", "Interview", "Offer", "Rejected"];

// useSearchParams() (used below for the ?tab= driven tab pills) requires a
// Suspense boundary above it per Next.js App Router.
export default function HrPage() {
  return (
    <Suspense fallback={null}>
      <HrPageContent />
    </Suspense>
  );
}

function HrPageContent() {
  const { currentUser } = useAuth();
  const { employees, reloadEmployees, leaves, allWfhRequests, holidays } = useAppData();
  const { pushToast } = useToast();

  const accessLevels = currentUser?.access_levels || [];
  const isOwnerUser = currentUser?.department === "Owner" || accessLevels.includes("owner");
  const isHrEditorReal = accessLevels.includes("owner") || accessLevels.includes("hr");
  const isFinanceEditor = accessLevels.includes("owner") || accessLevels.includes("finance");
  const isHrEditor = isHrEditorReal || isFinanceEditor;

  // Backed by ?tab= instead of local state so the Employees/Leave Requests/
  // Hiring/Leave Count/Attendance pills are real hrefs — right-click "open
  // in new tab" / ctrl-click / middle-click now works on them, same as
  // dev/page.tsx's and finance/page.tsx's tab pills.
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: "employees" | "leave" | "hiring" | "leaveCount" | "attendance" =
    tabParam === "leave" || tabParam === "hiring" || tabParam === "leaveCount" || tabParam === "attendance" ? tabParam : "employees";
  const setTab = (t: "employees" | "leave" | "hiring" | "leaveCount" | "attendance") => {
    router.replace(`/hr?tab=${t}${window.location.hash}`, { scroll: false });
  };

  // ---- Employees tab ----
  const [selEmpId, setSelEmpId] = useState<string | null>(null);
  const [empLeaveBalance, setEmpLeaveBalance] = useState<LeaveBalance | null>(null);
  const [changePasswordDraft, setChangePasswordDraft] = useState("");
  const isNewEmployee = selEmpId === "new";
  const selEmpRaw = selEmpId && !isNewEmployee ? (employees.find((e) => e.id === selEmpId) as Employee | undefined) || null : null;

  // setEmployeeFieldLive PUTs on every keystroke, and reloadEmployeesOptimistic
  // is a no-op (see below) — the input's displayed value is 100%
  // server-state-driven. That's fine for free-form fields (any partial
  // string is valid), but phone/emergency contact/CNIC all require a
  // *complete* format before the backend accepts them — every incomplete
  // keystroke 422s, reloadEmployees() then re-fetches the still-unchanged
  // stored value, and the character the user just typed visibly snaps back
  // out. These three local drafts absorb every keystroke instantly and only
  // actually call setEmployeeFieldLive once the value is complete (or
  // cleared back to empty) — synced from the real record when the drawer
  // opens for a given employee, not on every reload while it's open.
  const [phoneDraft, setPhoneDraft] = useState("+92");
  const [emergencyContactDraft, setEmergencyContactDraft] = useState("+92");
  const [cnicDraft, setCnicDraft] = useState("");
  useEffect(() => {
    setPhoneDraft(selEmpRaw?.phone || "+92");
    setEmergencyContactDraft(selEmpRaw?.emergency_contact || "+92");
    setCnicDraft(selEmpRaw?.cnic || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selEmpId]);

  const [empForm, setEmpForm] = useState({
    name: "", role: "", dept: "Employee", email: "", manager: "", type: "Full-time", start: "", salary: "",
    password: "", accessLevels: [] as string[], birthdate: "", phone: "+92", emergencyContact: "+92", emergencyContactRelation: "", cnic: "",
  });

  const openNewEmployee = () => {
    setEmpForm({ name: "", role: "", dept: "Employee", email: "", manager: "", type: "Full-time", start: "", salary: "", password: "", accessLevels: [], birthdate: "", phone: "+92", emergencyContact: "+92", emergencyContactRelation: "", cnic: "" });
    setSelEmpId("new");
  };
  const selectEmployee = (id: string) => {
    setSelEmpId(id);
    setChangePasswordDraft("");
    setEmpLeaveBalance(null);
    leavesApi.balance(id).then((bal: LeaveBalance) => setEmpLeaveBalance(bal)).catch(() => {});
  };
  const closeEmployeeModal = () => {
    setSelEmpId(null);
    setChangePasswordDraft("");
    clearDeepLinkHash();
  };
  const employeeModalClosing = useClosingTransition();
  const closeEmployeeModalAnimated = () => employeeModalClosing.closeWithTransition(closeEmployeeModal);
  // Middle-click/ctrl-click/right-click "open in new tab" on an employee row
  // works off a real #/employee/<id> href (see deepLinkHref); a plain left
  // click still preventDefaults and opens the drawer in place. A fresh tab
  // loading that hash (e.g. from the topbar Universal Search) re-runs this
  // same check on mount and switches to the Employees tab automatically.
  useEffect(() => {
    const link = parseDeepLinkHash();
    if (link && link.type === "employee") {
      setTab("employees");
      selectEmployee(link.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleEmployeeDeepLinkClick = (e: React.MouseEvent, id: string) => {
    if (isModifiedClick(e)) return;
    e.preventDefault();
    selectEmployee(id);
  };

  const setEmployeeFormField = (field: string, val: string | string[]) => {
    setEmpForm((f) => {
      const next = { ...f, [field]: val };
      if (field === "dept") {
        // Auto-ticking an access level off the chosen department is an
        // Owner-only convenience — the backend rejects any access_levels
        // beyond the "employee" baseline from a non-Owner creator, so a
        // non-Owner HR/Finance user picking e.g. "Dev Member" as the new
        // hire's department must NOT silently queue up "dev" here, or
        // submitting the form 403s with "Only Owner department users can
        // assign access levels." Non-owners leave with nothing ticked — an
        // Owner ticks the right access level for that employee afterward.
        if (isOwnerUser) {
          const mapped = (DEPT_ACCESS_LEVEL as Record<string, string>)[val as string];
          const current = f.accessLevels;
          if (mapped && !current.includes(mapped) && !current.includes("owner")) next.accessLevels = [...current, mapped];
        }
        if (val === "Owner") next.manager = "";
      }
      return next;
    });
  };

  const submitNewEmployee = () => {
    const f = empForm;
    if (!f.name || !f.role || !f.email || !f.start || !f.password) {
      pushToast("Name, Role, Email, Start Date, and Password are required.", "error");
      return;
    }
    if (!isValidEmail(f.email)) {
      pushToast("Enter a valid email address.", "error");
      return;
    }
    if (f.start > todayISO()) {
      pushToast("Start date cannot be in the future.", "error");
      return;
    }
    if (f.salary !== "" && !isValidNumber(f.salary)) {
      pushToast("Salary must be a number.", "error");
      return;
    }
    if (!isPhoneComplete(f.phone)) {
      pushToast("Enter a complete 10-digit mobile number after +92, or leave it blank.", "error");
      return;
    }
    if (!isPhoneComplete(f.emergencyContact)) {
      pushToast("Enter a complete 10-digit emergency contact number after +92, or leave it blank.", "error");
      return;
    }
    if (f.cnic && f.cnic.length !== 15) {
      pushToast("Enter a complete CNIC (35201-5746852-5), or leave it blank.", "error");
      return;
    }
    employeesApi
      .create({
        name: f.name, role: f.role, department: f.dept, email: f.email, manager: f.manager || null, employment_type: f.type,
        start_date: f.start, salary: numVal(f.salary), password: f.password, access_levels: f.accessLevels.length ? f.accessLevels : ["employee"],
        birthdate: f.birthdate || null, phone: f.phone !== "+92" ? f.phone : null, emergency_contact: f.emergencyContact !== "+92" ? f.emergencyContact : null,
        emergency_contact_relation: f.emergencyContactRelation || null, cnic: f.cnic || null,
      })
      .then(
        (emp: Employee) => {
          pushToast("Employee added successfully.");
          setSelEmpId(emp.id);
          reloadEmployees();
        },
        (err: Error) => {
          pushToast(err.message?.includes("already exists") ? "An employee with this email already exists." : err.message || "Could not add employee.", "error");
        }
      );
  };

  const setEmployeeFieldLive = (id: string, field: string, val: unknown) => {
    reloadEmployeesOptimistic(id, field, val);
    employeesApi.update(id, { [field]: val }).then(
      () => {
        pushToast(field === "password" ? "Password updated successfully." : "Employee updated.");
        reloadEmployees();
      },
      (err: Error) => {
        if (err.message?.includes("matches the current password")) pushToast("New password matches the current password.", "warning");
        else if (err.message?.includes("already exists")) pushToast("An employee with this email already exists.", "error");
        else pushToast(err.message || "Could not update employee.", "error");
        reloadEmployees();
      }
    );
  };
  // Optimistic local reflect isn't strictly necessary since useAppData owns
  // `employees`, but keeps the drawer feeling responsive between the write
  // and the next reloadEmployees() resolving.
  const reloadEmployeesOptimistic = (_id: string, _field: string, _val: unknown) => {};

  const changeEmpDepartment = (id: string, newDept: string) => {
    const emp = employees.find((e) => e.id === id) as Employee | undefined;
    if (!emp) return;
    const nextManager = newDept === "Owner" ? "" : emp.manager;
    // Same Owner-only guard as the New Employee form above: only an Owner's
    // department change is allowed to auto-tick an access level, and the
    // access_levels key is omitted entirely (not just left unchanged) for
    // everyone else, since merely including it in the payload is what the
    // backend's guard checks for.
    const patch: Record<string, unknown> = { department: newDept, manager: nextManager };
    if (isOwnerUser) {
      const current = emp.access_levels || [];
      const mapped = (DEPT_ACCESS_LEVEL as Record<string, string>)[newDept];
      patch.access_levels = mapped && !current.includes(mapped) && !current.includes("owner") ? [...current, mapped] : current;
    }
    employeesApi.update(id, patch).then(
      () => {
        pushToast("Employee updated.");
        reloadEmployees();
      },
      (err: Error) => {
        pushToast(err.message || "Could not update employee.", "error");
        reloadEmployees();
      }
    );
  };

  const toggleEmpAccessLevel = (id: string, value: string) => {
    if (!isOwnerUser) {
      pushToast("Only Owner department users can change access levels.", "error");
      return;
    }
    const emp = employees.find((e) => e.id === id) as Employee | undefined;
    if (!emp) return;
    const current = emp.access_levels || [];
    let next: string[];
    if (value === "owner") {
      next = current.includes("owner") ? ["employee"] : ["owner"];
    } else {
      next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      next = next.filter((v) => v !== "owner");
      if (!next.length) next = ["employee"];
    }
    setEmployeeFieldLive(id, "access_levels", next);
  };
  const toggleEfoAccessLevel = (value: string) => {
    if (!isOwnerUser) {
      pushToast("Only Owner department users can change access levels.", "error");
      return;
    }
    setEmpForm((f) => {
      const current = f.accessLevels;
      let next: string[];
      if (value === "owner") next = current.includes("owner") ? [] : ["owner"];
      else {
        next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
        next = next.filter((v) => v !== "owner");
      }
      return { ...f, accessLevels: next };
    });
  };

  const submitChangePassword = (id: string) => {
    const pw = changePasswordDraft.trim();
    if (!pw) {
      pushToast("Enter a new password.", "error");
      return;
    }
    if (pw.length < 4) {
      pushToast("Password must be at least 4 characters.", "error");
      return;
    }
    const isOwnAccount = currentUser?.id === id;
    employeesApi.update(id, { password: pw }).then(
      () => {
        setChangePasswordDraft("");
        if (isOwnAccount) {
          pushToast("Password changed. Please sign in with your new password.");
          localStorage.removeItem("orbit_token");
          window.location.href = "/";
        } else {
          pushToast("Password changed successfully.");
        }
      },
      (err: Error) => pushToast(err.message || "Could not change password.", "error")
    );
  };

  const uploadEmployeeContract = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validateUploadFile(f);
    if (err) {
      pushToast(err, "error");
      e.target.value = "";
      return;
    }
    employeesApi.uploadContract(id, f).then(
      () => {
        pushToast("Contract uploaded successfully.");
        reloadEmployees();
      },
      (err2: Error) => pushToast(err2.message || "Upload failed.", "error")
    );
    e.target.value = "";
  };
  const removeEmployeeContract = (id: string) => {
    employeesApi.removeContract(id).then(
      () => {
        pushToast("Contract removed successfully.");
        reloadEmployees();
      },
      (err: Error) => pushToast(err.message || "Could not remove the contract file.", "error")
    );
  };
  const openEmployeeContract = async (url: string) => {
    // Contracts are served from the DB behind an authenticated endpoint
    // (Render's disk is ephemeral) — a plain <a href> with no auth header
    // would just 401/404. Fetch with the token and open the bytes as a blob.
    try {
      const token = localStorage.getItem("orbit_token");
      const res = await fetch(url, { headers: token ? { Authorization: "Bearer " + token } : {} });
      if (!res.ok) throw new Error("Could not load the contract file.");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      pushToast((err as Error).message || "Could not open the contract file.", "error");
    }
  };

  const hrEmployeeRows = (employees as Employee[]).map((e) => ({
    id: e.id, name: e.name, role: e.role, dept: e.department, manager: e.manager || "—", start: e.start_date || "—",
    type: e.employment_type, probationStatus: e.probation_status || "—", probationTone: e.probation_status === "In Probation" ? "warning" : "success",
  }));
  const managerOptions = [{ value: "", label: "None / Select manager…" }, ...employees.map((e) => ({ value: e.name, label: e.name }))];
  const empTypeOptions = ["Full-time", "Contractor", "Part-time"].map((t) => ({ value: t, label: t }));

  const selEmployee = selEmpRaw
    ? {
        ...selEmpRaw,
        salaryStr: moneyPKR(selEmpRaw.salary || 0) + "/mo",
        probationStr: selEmpRaw.probation_end
          ? selEmpRaw.probation_status === "In Probation"
            ? "In probation until " + fromISO(selEmpRaw.probation_end)
            : "Probation cleared on " + fromISO(selEmpRaw.probation_end)
          : "—",
        probationTone: selEmpRaw.probation_status === "In Probation" ? "warning" : "success",
        leaveCasual: empLeaveBalance ? empLeaveBalance.casual_remaining : "—",
        leaveSick: empLeaveBalance ? empLeaveBalance.sick_remaining : "—",
        leaveAnnual: empLeaveBalance ? empLeaveBalance.annual_remaining : "—",
        hasContract: !!selEmpRaw.contract_file_url,
        contractFileName: selEmpRaw.contract_file_url ? (selEmpRaw.contract_file_name || selEmpRaw.contract_file_url.split("/").pop()) : null,
        contractUploadLabel: selEmpRaw.contract_file_url ? "Replace" : "Upload",
      }
    : null;

  const empAccessLevelRows = (currentAccessLevels: string[] | undefined) =>
    ACCESS_LEVEL_OPTIONS.map((opt: { value: string; label: string }) => {
      const current = currentAccessLevels || [];
      const isOwnerRow = current.includes("owner");
      return { value: opt.value, label: opt.label, checked: isOwnerRow || current.includes(opt.value), disabled: !isOwnerUser || (isOwnerRow && opt.value !== "owner") };
    });

  // ---- Leave Requests tab ----
  // Read-only here — approve/reject now happens exclusively through the
  // employee's manager (Manager Hub), not HR. HR still sees the full list
  // and can open a request to see its status, reason, and (once decided)
  // who approved/rejected it and their note.
  const timeOffRows = (leaves as Leave[]).map((lr) => ({
    id: lr.id, isWfh: false as const, employee: lr.employee_name || "Unknown", type: lr.leave_type,
    dates: lr.end_date ? lr.start_date + " — " + lr.end_date : lr.start_date, status: lr.status,
    statusTone: lr.status === "Approved" ? "success" : lr.status === "Rejected" ? "danger" : "warning",
    createdAt: lr.created_at || lr.start_date,
  }));
  const wfhHrRows = (allWfhRequests as Wfh[]).map((w) => ({
    id: w.id, isWfh: true as const, employee: w.employee_name || "Unknown", type: "Work From Home", dates: w.date, status: w.status,
    statusTone: w.status === "Approved" ? "success" : w.status === "Rejected" ? "danger" : "warning",
    createdAt: w.created_at || w.date,
  }));
  const hrLeaveRows = [...timeOffRows, ...wfhHrRows].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const [leaveDrawerId, setLeaveDrawerId] = useState<string | null>(null);
  const leaveDrawerLeaveRaw = leaveDrawerId ? (leaves as Leave[]).find((lr) => lr.id === leaveDrawerId) : null;
  const leaveDrawerWfhRaw = leaveDrawerId && !leaveDrawerLeaveRaw ? (allWfhRequests as Wfh[]).find((w) => w.id === leaveDrawerId) : null;
  const leaveDrawer = leaveDrawerLeaveRaw
    ? (() => {
        const isApproved = leaveDrawerLeaveRaw.status === "Approved";
        const isRejected = leaveDrawerLeaveRaw.status === "Rejected";
        const decisionNote = isApproved ? leaveDrawerLeaveRaw.approval_note : isRejected ? leaveDrawerLeaveRaw.rejection_reason : null;
        const decidedByName = leaveDrawerLeaveRaw.approved_by_id ? getEmployeeName(leaveDrawerLeaveRaw.approved_by_id) : "";
        return {
          employee: leaveDrawerLeaveRaw.employee_name || "Unknown", type: leaveDrawerLeaveRaw.leave_type,
          dates: leaveDrawerLeaveRaw.end_date ? leaveDrawerLeaveRaw.start_date + " — " + leaveDrawerLeaveRaw.end_date : leaveDrawerLeaveRaw.start_date,
          status: leaveDrawerLeaveRaw.status, statusTone: isApproved ? "success" : isRejected ? "danger" : "warning",
          reasonStr: leaveDrawerLeaveRaw.reason || "No reason provided.", showDecisionNote: !!decisionNote,
          decisionNoteLabel: isApproved ? "Approval note" : "Rejection reason", decisionNoteStr: decisionNote || "",
          decidedByLine: decidedByName ? (isApproved ? "Approved by " : "Rejected by ") + decidedByName + (leaveDrawerLeaveRaw.approved_at ? " · " + formatCommentTimestamp(leaveDrawerLeaveRaw.approved_at) : "") : "",
        };
      })()
    : leaveDrawerWfhRaw
    ? (() => {
        const isApproved = leaveDrawerWfhRaw.status === "Approved";
        const isRejected = leaveDrawerWfhRaw.status === "Rejected";
        const decisionNote = leaveDrawerWfhRaw.decision_note || null;
        const decidedByName = leaveDrawerWfhRaw.decided_by ? getEmployeeName(leaveDrawerWfhRaw.decided_by) : "";
        return {
          employee: leaveDrawerWfhRaw.employee_name || "Unknown", type: "Work From Home",
          dates: leaveDrawerWfhRaw.date,
          status: leaveDrawerWfhRaw.status, statusTone: isApproved ? "success" : isRejected ? "danger" : "warning",
          reasonStr: leaveDrawerWfhRaw.description || "No reason provided.", showDecisionNote: !!decisionNote,
          decisionNoteLabel: isApproved ? "Approval note" : "Rejection reason", decisionNoteStr: decisionNote || "",
          decidedByLine: decidedByName ? (isApproved ? "Approved by " : "Rejected by ") + decidedByName + (leaveDrawerWfhRaw.decided_at ? " · " + formatCommentTimestamp(leaveDrawerWfhRaw.decided_at) : "") : "",
        };
      })()
    : null;
  const openLeaveDrawer = (id: string) => setLeaveDrawerId(id);
  const closeLeaveDrawer = () => setLeaveDrawerId(null);
  const leaveDrawerClosing = useClosingTransition();
  const closeLeaveDrawerAnimated = () => leaveDrawerClosing.closeWithTransition(closeLeaveDrawer);

  // ---- Hiring tab ----
  const [openings, setOpenings] = useState<Opening[]>([]);
  const openingDrawerClosing = useClosingTransition();
  const closeOpeningDrawerAnimated = () => openingDrawerClosing.closeWithTransition(() => setOpeningDrawerId(null));
  const deleteOpeningClosing = useClosingTransition();
  const closeDeleteOpeningAnimated = () => deleteOpeningClosing.closeWithTransition(() => setDeleteOpeningConfirm(null));
  const [candidatesByOpening, setCandidatesByOpening] = useState<Record<string, Candidate[]>>({});
  const loadOpenings = () => {
    openingsApi.list().then((data: Opening[]) => {
      setOpenings(data);
      data.forEach((o) => {
        candidatesApi.list(o.id).then((cands: Candidate[]) => setCandidatesByOpening((cur) => ({ ...cur, [o.id]: cands })));
      });
    });
  };
  useEffect(loadOpenings, []);

  const hrPositionRows = openings.map((p) => ({
    id: p.id, title: p.title, dept: p.department, opened: p.opened_at ? p.opened_at.slice(0, 10) : "—",
    candCount: p.candidate_count || 0, status: p.status, statusTone: p.status === "Open" ? "info" : p.status === "Filled" ? "success" : "neutral",
  }));

  const [newOpeningOpen, setNewOpeningOpen] = useState(false);
  const [openingForm, setOpeningForm] = useState({ title: "", dept: "", salaryBracket: "", experience: "", jd: "" });
  const [openingDrawerId, setOpeningDrawerId] = useState<string | null>(null);
  const [newCandidateName, setNewCandidateName] = useState("");
  const [deleteOpeningConfirm, setDeleteOpeningConfirm] = useState<{ id: string; title: string } | null>(null);

  const openNewOpening = () => {
    setOpeningForm({ title: "", dept: "", salaryBracket: "", experience: "", jd: "" });
    setNewOpeningOpen(true);
  };
  const submitNewOpening = () => {
    const f = openingForm;
    if (!f.title.trim()) return pushToast("Position title is required.", "error");
    if (!f.dept) return pushToast("Department is required.", "error");
    if (!f.salaryBracket.trim()) return pushToast("Salary bracket is required.", "error");
    if (!f.experience.trim()) return pushToast("Experience required is required.", "error");
    if (!f.jd.trim()) return pushToast("Job description is required.", "error");
    openingsApi.create({ title: f.title, department: f.dept, salary_bracket: f.salaryBracket, experience: f.experience, description: f.jd }).then(
      () => {
        setNewOpeningOpen(false);
        pushToast("Opening created successfully.");
        loadOpenings();
      },
      (err: Error) => pushToast(err.message || "Could not create opening.", "error")
    );
  };
  const setOpeningFieldLive = (id: string, field: string, val: string) => {
    setOpenings((cur) => cur.map((o) => (o.id === id ? { ...o, [field]: val } : o)));
    openingsApi.update(id, { [field]: val }).then(
      () => {
        pushToast(field === "status" && val === "Closed" ? "Opening closed." : "Opening updated.");
        loadOpenings();
      },
      (err: Error) => pushToast(err.message || "Could not update opening.", "error")
    );
  };
  const addCandidate = (openingId: string) => {
    if (!newCandidateName.trim()) return;
    candidatesApi.create(openingId, { name: newCandidateName }).then(
      (cand: Candidate) => {
        pushToast("Candidate added.");
        setCandidatesByOpening((cur) => ({ ...cur, [openingId]: [...(cur[openingId] || []), cand] }));
        setNewCandidateName("");
      },
      (err: Error) => pushToast(err.message || "Could not add candidate.", "error")
    );
  };
  const setCandidateStage = (id: string, stage: string) => {
    setCandidatesByOpening((cur) => {
      const next = { ...cur };
      Object.keys(next).forEach((key) => {
        next[key] = next[key].map((c) => (c.id === id ? { ...c, stage } : c));
      });
      return next;
    });
    candidatesApi.update(id, { stage }).catch(() => {});
  };
  const uploadCandidateResume = () => pushToast("Resume upload not yet implemented via API.", "warning");

  const askDeleteOpening = (id: string, title: string) => setDeleteOpeningConfirm({ id, title });
  const confirmDeleteOpening = () => {
    if (!deleteOpeningConfirm) return;
    openingsApi.remove(deleteOpeningConfirm.id).then(
      () => {
        setDeleteOpeningConfirm(null);
        setOpeningDrawerId((cur) => (cur === deleteOpeningConfirm.id ? null : cur));
        pushToast("Job opening deleted successfully.");
        loadOpenings();
      },
      (err: Error) => {
        setDeleteOpeningConfirm(null);
        pushToast(err.message || "Could not delete this job opening.", "error");
      }
    );
  };

  const isNewOpening = openingDrawerId === "new";
  const selOpeningRaw = openingDrawerId && !isNewOpening ? openings.find((o) => o.id === openingDrawerId) : null;
  const selOpeningCandidates = (selOpeningRaw ? candidatesByOpening[selOpeningRaw.id] || [] : []).map((c) => ({
    ...c,
    appliedDate: c.applied_date ? c.applied_date.slice(0, 10) : "—",
    stars: "★".repeat(Math.min(c.rating || 0, 5)) + "☆".repeat(Math.max(0, 5 - (c.rating || 0))),
  }));

  // ---- Leave Count tab ----
  const [leaveCountRange, setLeaveCountRange] = useState("thisMonth");
  const leaveCountResolved = resolveDateRangePreset(leaveCountRange);
  const leaveCountByEmp: Record<string, { employee: string; days: number; entries: string[] }> = {};
  leaves.forEach((lr) => {
    const l = lr as Leave;
    if (l.status !== "Approved") return;
    const start = l.start_date;
    const end = l.end_date || l.start_date;
    if (leaveCountResolved.from && end < leaveCountResolved.from) return;
    if (leaveCountResolved.to && start > leaveCountResolved.to) return;
    const key = l.employee_id;
    if (!leaveCountByEmp[key]) leaveCountByEmp[key] = { employee: l.employee_name || "Unknown", days: 0, entries: [] };
    leaveCountByEmp[key].days += l.days || 0;
    leaveCountByEmp[key].entries.push(l.leave_type + ": " + (l.end_date && l.end_date !== l.start_date ? start + " – " + end : start));
  });
  const hrLeaveCountRows = Object.keys(leaveCountByEmp)
    .map((k) => ({ id: k, employee: leaveCountByEmp[k].employee, days: leaveCountByEmp[k].days, datesStr: leaveCountByEmp[k].entries.join("; ") }))
    .sort((a, b) => b.days - a.days);

  // ---- Attendance tab ----
  const [attendanceToday, setAttendanceToday] = useState<AttendanceRow[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRow[]>([]);
  const [attendanceMonth, setAttendanceMonth] = useState(todayISO().slice(0, 7));
  const [attendanceEmployeeFilter, setAttendanceEmployeeFilter] = useState("");
  const [attendanceSelectedDate, setAttendanceSelectedDate] = useState(todayISO());

  const loadAttendanceToday = () => attendanceApi.today().then((d: AttendanceRow[]) => setAttendanceToday(d)).catch(() => {});
  const loadAttendanceHistory = () => {
    const [year, month] = attendanceMonth.split("-").map(Number);
    attendanceApi.all(year, month, attendanceEmployeeFilter || null).then(
      (d: AttendanceRow[]) => setAttendanceHistory(d),
      () => pushToast("Could not load attendance records.", "error")
    );
  };
  useEffect(() => {
    if (tab !== "attendance") return;
    loadAttendanceToday();
    loadAttendanceHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, attendanceMonth, attendanceEmployeeFilter, holidays]);

  const attendanceStatusTone = (st: string) => (st === "Present" ? "success" : st === "Absent" ? "danger" : st === "WFH" ? "info" : st === "Leave" ? "warning" : st === "Holiday" ? "info" : "neutral");
  const attendanceEmployeeOptions = [{ value: "", label: "All employees" }, ...employees.map((e) => ({ value: e.id, label: e.name }))];
  // History is organized one day at a time (Back/Next step through actual
  // calendar days) rather than a flat list of every record in the month —
  // the This Month / Last Month toggle picks which month's data is loaded
  // and which range the day-stepper is clamped to.
  const thisMonthStr = todayISO().slice(0, 7);
  const monthFirstDayIso = attendanceMonth + "-01";
  const monthLastDayIso = (() => {
    const [y, m] = attendanceMonth.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return attendanceMonth + "-" + String(lastDay).padStart(2, "0");
  })();
  const attendanceMaxNavIso = attendanceMonth === thisMonthStr ? todayISO() : monthLastDayIso;
  const goThisMonth = () => {
    setAttendanceMonth(thisMonthStr);
    setAttendanceSelectedDate(todayISO());
  };
  const goLastMonth = () => {
    const [y, m] = thisMonthStr.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    const ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    setAttendanceMonth(ym);
    setAttendanceSelectedDate(ym + "-" + String(lastDay).padStart(2, "0"));
  };
  const stepAttendanceDay = (delta: number) => {
    const next = addDaysISO(attendanceSelectedDate, delta);
    if (next < monthFirstDayIso || next > attendanceMaxNavIso) return;
    setAttendanceSelectedDate(next);
  };
  const attendanceDayRows = attendanceHistory.filter((ah) => ah.date === attendanceSelectedDate);
  const attendanceSelectedDateLabel = new Date(attendanceSelectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="orbit-subtab-content" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>HR</h1>
          <div className="orbit-setup-tabs">
            <a href="/hr?tab=employees" className="orbit-setup-tab" style={{ fontWeight: tab === "employees" ? 600 : 400 }} onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); setTab("employees"); }}>Employees</a>
            <a href="/hr?tab=leave" className="orbit-setup-tab" style={{ fontWeight: tab === "leave" ? 600 : 400 }} onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); setTab("leave"); }}>Leave Requests</a>
            <a href="/hr?tab=hiring" className="orbit-setup-tab" style={{ fontWeight: tab === "hiring" ? 600 : 400 }} onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); setTab("hiring"); }}>Hiring</a>
            <a href="/hr?tab=leaveCount" className="orbit-setup-tab" style={{ fontWeight: tab === "leaveCount" ? 600 : 400 }} onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); setTab("leaveCount"); }}>Leave Count</a>
            <a href="/hr?tab=attendance" className="orbit-setup-tab" style={{ fontWeight: tab === "attendance" ? 600 : 400 }} onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); setTab("attendance"); }}>Attendance</a>
          </div>
        </div>
        {tab === "employees" && isHrEditor && <Button variant="primary" icon="circle-plus" onClick={openNewEmployee}>Add Employee</Button>}
        {tab === "hiring" && <Button variant="primary" icon="circle-plus" onClick={openNewOpening}>Add Opening</Button>}
        {tab === "leaveCount" && (
          <select value={leaveCountRange} onChange={(e) => setLeaveCountRange(e.target.value)} aria-label="Leave count date range" style={selectStyle}>
            {LEAVE_COUNT_RANGE_OPTIONS.map((o: { value: string; label: string }) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>

      {tab === "employees" && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={thStyle}>Name</th><th style={thStyle}>Role</th><th style={thStyle}>Department</th><th style={thStyle}>Manager</th>
              <th style={thStyle}>Start date</th><th style={thStyle}>Type</th><th style={thStyle}>Status</th><th style={{ ...thStyle, textAlign: "right" }}></th>
            </tr></thead>
            <tbody>
              {hrEmployeeRows.map((e) => (
                <tr key={e.id} onClick={() => selectEmployee(e.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{e.name}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{e.role}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{e.dept}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{e.manager}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{e.start}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{e.type}</td>
                  <td style={{ padding: "14px 16px" }}><Badge tone={e.probationTone}>{e.probationStatus}</Badge></td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }} onClick={(ev) => ev.stopPropagation()}><a href={deepLinkHref("employee", e.id)} onClick={(ev) => handleEmployeeDeepLinkClick(ev, e.id)} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none" }}>View</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "leave" && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={thStyle}>Employee</th><th style={thStyle}>Type</th><th style={thStyle}>Dates</th><th style={thStyle}>Status</th><th></th>
            </tr></thead>
            <tbody>
              {hrLeaveRows.map((lr) => (
                <tr key={lr.id} onClick={() => openLeaveDrawer(lr.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{lr.employee}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{lr.type}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{lr.dates}</td>
                  <td style={{ padding: "14px 16px" }}><Badge tone={lr.statusTone}>{lr.status}</Badge></td>
                  <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Click for details &rarr;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "hiring" && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={thStyle}>Position</th><th style={thStyle}>Department</th><th style={thStyle}>Opened</th><th style={thStyle}>Candidates</th><th style={thStyle}>Status</th><th></th>
            </tr></thead>
            <tbody>
              {hrPositionRows.map((pos) => (
                <tr key={pos.id} onClick={() => setOpeningDrawerId(pos.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{pos.title}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{pos.dept}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{pos.opened}</td>
                  <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{pos.candCount}</td>
                  <td style={{ padding: "14px 16px" }}><Badge tone={pos.statusTone}>{pos.status}</Badge></td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>{isFinanceEditor && <a href="#" onClick={(e) => { e.preventDefault(); askDeleteOpening(pos.id, pos.title); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none" }}>Delete</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "leaveCount" && (
        hrLeaveCountRows.length === 0 ? (
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>No approved leave in this period.</div>
        ) : (
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}><th style={thStyle}>Employee</th><th style={thStyle}>Days Off</th><th style={thStyle}>Dates</th></tr></thead>
              <tbody>
                {hrLeaveCountRows.map((lc) => (
                  <tr key={lc.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{lc.employee}</td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{lc.days}</td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-secondary)" }}>{lc.datesStr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "attendance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Today</h2>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}><th style={thStyle}>Employee</th><th style={thStyle}>Department</th><th style={thStyle}>Status</th><th style={thStyle}>Marked At</th></tr></thead>
                <tbody>
                  {attendanceToday.map((at, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500 }}>{at.employee_name}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{at.employee_department}</td>
                      <td style={{ padding: "12px 16px" }}><Badge tone={attendanceStatusTone(at.status)}>{at.status}</Badge></td>
                      <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{at.marked_at ? formatCommentTimestamp(at.marked_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {attendanceToday.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No active employees to show.</div>}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>History</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <select value={attendanceEmployeeFilter} onChange={(e) => setAttendanceEmployeeFilter(e.target.value)} aria-label="Filter attendance history by employee" style={selectStyle}>
                  {attendanceEmployeeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div className="orbit-pill-toggle" style={{ display: "flex", background: "var(--bg-page)", borderRadius: 9999, padding: 3, gap: 2 }}>
                  <button onClick={goThisMonth} style={{ border: "none", borderRadius: 9999, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: attendanceMonth === thisMonthStr ? "#fff" : "transparent", color: attendanceMonth === thisMonthStr ? "var(--brand-primary)" : "var(--text-secondary)" }}>This Month</button>
                  <button onClick={goLastMonth} style={{ border: "none", borderRadius: 9999, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: attendanceMonth !== thisMonthStr ? "#fff" : "transparent", color: attendanceMonth !== thisMonthStr ? "var(--brand-primary)" : "var(--text-secondary)" }}>Last Month</button>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 12 }}>
              <button onClick={() => stepAttendanceDay(-1)} disabled={attendanceSelectedDate <= monthFirstDayIso} aria-label="Previous day" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "6px 12px", cursor: attendanceSelectedDate <= monthFirstDayIso ? "not-allowed" : "pointer", opacity: attendanceSelectedDate <= monthFirstDayIso ? 0.4 : 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>&larr; Back</button>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", minWidth: 220, textAlign: "center" }}>{attendanceSelectedDateLabel}</div>
              <button onClick={() => stepAttendanceDay(1)} disabled={attendanceSelectedDate >= attendanceMaxNavIso} aria-label="Next day" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "6px 12px", cursor: attendanceSelectedDate >= attendanceMaxNavIso ? "not-allowed" : "pointer", opacity: attendanceSelectedDate >= attendanceMaxNavIso ? 0.4 : 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Next &rarr;</button>
            </div>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}><th style={thStyle}>Employee</th><th style={thStyle}>Department</th><th style={thStyle}>Status</th><th style={thStyle}>Marked At</th></tr></thead>
                <tbody>
                  {attendanceDayRows.map((ah, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500 }}>{ah.employee_name}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{ah.employee_department}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <Badge tone={attendanceStatusTone(ah.status)}>{ah.status}</Badge>
                        {ah.status === "Leave" && ah.leave_approved_by_name && (
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>Approved by {ah.leave_approved_by_name}</div>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{ah.marked_at ? formatCommentTimestamp(ah.marked_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {attendanceDayRows.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No attendance records for {attendanceSelectedDateLabel}.</div>}
            </div>
          </div>

          <div>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Work-from-home requests</h2>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}><th style={thStyle}>Employee</th><th style={thStyle}>Date</th><th style={thStyle}>Description</th><th style={thStyle}>Status</th></tr></thead>
                <tbody>
                  {(allWfhRequests as Wfh[]).map((wfh) => (
                    <tr key={wfh.id} onClick={() => openLeaveDrawer(wfh.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                      <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500 }}>{wfh.employee_name}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-primary)" }}>{wfh.date}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)" }}>{wfh.description}</td>
                      <td style={{ padding: "12px 16px" }}><Badge tone={wfh.status === "Approved" ? "success" : wfh.status === "Rejected" ? "danger" : "warning"}>{wfh.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allWfhRequests.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No work-from-home requests.</div>}
            </div>
          </div>
        </div>
      )}

      {/* ---- Employee drawer ---- */}
      {(isNewEmployee || selEmployee) && (
        <div className={"crm-overlay-fade" + (employeeModalClosing.isClosing ? " orbit-closing" : "")} onClick={closeEmployeeModalAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (employeeModalClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{isNewEmployee ? "New Employee" : selEmployee?.name}</h2>
              <button onClick={closeEmployeeModalAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>

            {isNewEmployee ? (
              <>
                <SmoothScroll style={{ flex: 1, padding: 24, fontSize: 14 }} contentStyle={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Input label="Full name" value={empForm.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFormField("name", e.target.value)} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Input label="Role / title" value={empForm.role} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFormField("role", e.target.value)} />
                    <Select label="Department" options={DEPARTMENT_OPTIONS} value={empForm.dept} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEmployeeFormField("dept", e.target.value)} />
                  </div>
                  <Input label="Email" value={empForm.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFormField("email", e.target.value)} />
                  <Input label="Password" placeholder="default: 1234" value={empForm.password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFormField("password", e.target.value)} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {empForm.dept !== "Owner" && <Select label="Manager" options={managerOptions} value={empForm.manager} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEmployeeFormField("manager", e.target.value)} />}
                    <Select label="Employment type" options={empTypeOptions} value={empForm.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEmployeeFormField("type", e.target.value)} />
                  </div>
                  {isOwnerUser && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Access level</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)" }}>
                        {empAccessLevelRows(empForm.accessLevels).map((al) => (
                          <label key={al.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-primary)", cursor: "pointer" }}>
                            <input type="checkbox" checked={al.checked} disabled={al.disabled} onChange={() => toggleEfoAccessLevel(al.value)} />
                            {al.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Start date</span>
                      <input type="date" value={empForm.start} max={todayISO()} onChange={(e) => setEmployeeFormField("start", e.target.value)} style={dateInputStyle} />
                    </div>
                    <Input label="Monthly salary (PKR)" value={empForm.salary} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFormField("salary", e.target.value)} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Birthdate (optional)</span>
                    <input type="date" value={empForm.birthdate} max={todayISO()} onChange={(e) => setEmployeeFormField("birthdate", e.target.value)} style={dateInputStyle} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Input label="Mobile (optional)" value={empForm.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFormField("phone", formatPhoneInput(e.target.value))} />
                    <Input label="Emergency contact (optional)" value={empForm.emergencyContact} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFormField("emergencyContact", formatPhoneInput(e.target.value))} />
                  </div>
                  <Input label="Relation with emergency contact (optional)" value={empForm.emergencyContactRelation} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFormField("emergencyContactRelation", e.target.value)} />
                  <Input label="CNIC (optional)" placeholder="35201-5746852-5" value={empForm.cnic} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFormField("cnic", formatCnicInput(e.target.value))} />
                </SmoothScroll>
                <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
                  <Button variant="ghost" onClick={closeEmployeeModalAnimated}>Cancel</Button>
                  {isHrEditor && <Button variant="primary" onClick={submitNewEmployee}>Add Employee</Button>}
                </div>
              </>
            ) : selEmployee ? (
              <>
                <SmoothScroll style={{ flex: 1, padding: 24, fontSize: 14 }} contentStyle={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Input label="Full name" value={selEmployee.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFieldLive(selEmployee.id, "name", e.target.value)} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Input label="Role / title" value={selEmployee.role} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFieldLive(selEmployee.id, "role", e.target.value)} />
                    <Select label="Department" options={DEPARTMENT_OPTIONS} value={selEmployee.department} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => changeEmpDepartment(selEmployee.id, e.target.value)} />
                  </div>
                  <Input label="Email" value={selEmployee.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { if (!isValidEmail(e.target.value)) { pushToast("Enter a valid email address.", "error"); return; } setEmployeeFieldLive(selEmployee.id, "email", e.target.value); }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {selEmployee.department !== "Owner" && <Select label="Manager" options={managerOptions} value={selEmployee.manager || ""} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEmployeeFieldLive(selEmployee.id, "manager", e.target.value)} />}
                    <Select label="Employment type" options={empTypeOptions} value={selEmployee.employment_type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEmployeeFieldLive(selEmployee.id, "employment_type", e.target.value)} />
                  </div>
                  {isOwnerUser && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Access level</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)" }}>
                        {empAccessLevelRows(selEmployee.access_levels).map((al) => (
                          <label key={al.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-primary)", cursor: "pointer" }}>
                            <input type="checkbox" checked={al.checked} disabled={al.disabled} onChange={() => toggleEmpAccessLevel(selEmployee.id, al.value)} />
                            {al.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Start date</span>
                      <input type="date" value={selEmployee.start_date || ""} max={todayISO()} onChange={(e) => { if (e.target.value > todayISO()) { pushToast("Start date cannot be in the future.", "error"); return; } setEmployeeFieldLive(selEmployee.id, "start_date", e.target.value); }} style={dateInputStyle} />
                    </div>
                    <Input label="Monthly salary (PKR)" value={selEmployee.salary ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { if (!isValidNumber(e.target.value)) { pushToast("Salary must be a number.", "error"); return; } setEmployeeFieldLive(selEmployee.id, "salary", numVal(e.target.value)); }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge tone={selEmployee.probationTone}>{selEmployee.probationStr}</Badge>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Birthdate (optional)</span>
                    <input type="date" value={selEmployee.birthdate || ""} max={todayISO()} onChange={(e) => { if (e.target.value > todayISO()) { pushToast("Birthdate cannot be in the future.", "error"); return; } setEmployeeFieldLive(selEmployee.id, "birthdate", e.target.value); }} style={dateInputStyle} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Input label="Mobile (optional)" value={phoneDraft} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const formatted = formatPhoneInput(e.target.value);
                      setPhoneDraft(formatted);
                      if (isPhoneComplete(formatted)) setEmployeeFieldLive(selEmployee.id, "phone", formatted);
                    }} />
                    <Input label="Emergency contact (optional)" value={emergencyContactDraft} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const formatted = formatPhoneInput(e.target.value);
                      setEmergencyContactDraft(formatted);
                      if (isPhoneComplete(formatted)) setEmployeeFieldLive(selEmployee.id, "emergency_contact", formatted);
                    }} />
                  </div>
                  <Input label="Relation with emergency contact (optional)" value={selEmployee.emergency_contact_relation || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeFieldLive(selEmployee.id, "emergency_contact_relation", e.target.value)} />
                  <Input label="CNIC (optional)" placeholder="35201-5746852-5" value={cnicDraft} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const formatted = formatCnicInput(e.target.value);
                    setCnicDraft(formatted);
                    if (formatted === "" || formatted.length === 15) setEmployeeFieldLive(selEmployee.id, "cnic", formatted);
                  }} />

                  <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Contract file (optional)</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        {selEmployee.hasContract ? (
                          <a href="#" onClick={(e) => { e.preventDefault(); if (selEmployee.contract_file_url) openEmployeeContract(selEmployee.contract_file_url); }} style={{ textDecoration: "none" }}><Badge tone="success">{"Attached: " + selEmployee.contractFileName}</Badge></a>
                        ) : (
                          <Badge tone="neutral">Not attached</Badge>
                        )}
                      </div>
                      <div>
                        {selEmployee.hasContract && <a href="#" onClick={(e) => { e.preventDefault(); removeEmployeeContract(selEmployee.id); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none", marginRight: 14 }}>Remove</a>}
                        <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", cursor: "pointer" }}>
                          {selEmployee.contractUploadLabel}
                          <input type="file" onChange={(e) => uploadEmployeeContract(selEmployee.id, e)} style={{ display: "none" }} />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Leave balance</div>
                    <div style={{ display: "flex", gap: 24 }}>
                      <div><div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{selEmployee.leaveCasual}</div><div style={{ fontSize: 12, color: "var(--text-muted)" }}>Casual</div></div>
                      <div><div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{selEmployee.leaveSick}</div><div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sick</div></div>
                      <div><div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{selEmployee.leaveAnnual}</div><div style={{ fontSize: 12, color: "var(--text-muted)" }}>Annual</div></div>
                    </div>
                  </div>

                  <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Change password</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}><Input label="New password" placeholder="Enter a new password" value={changePasswordDraft} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setChangePasswordDraft(e.target.value)} /></div>
                      <Button variant="secondary" onClick={() => submitChangePassword(selEmployee.id)}>Change password</Button>
                    </div>
                  </div>
                </SmoothScroll>
                <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
                  <Button variant="secondary" onClick={closeEmployeeModalAnimated}>Close</Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ---- Leave drawer ---- */}
      {leaveDrawer && (
        <div className={"crm-overlay-fade" + (leaveDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={closeLeaveDrawerAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (leaveDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{leaveDrawer.employee}</h2>
              <button onClick={closeLeaveDrawerAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>
            <SmoothScroll style={{ flex: 1, padding: 24, fontSize: 14 }} contentStyle={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>Type</span><span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{leaveDrawer.type}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>Dates</span><span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{leaveDrawer.dates}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--text-secondary)" }}>Status</span><Badge tone={leaveDrawer.statusTone}>{leaveDrawer.status}</Badge></div>
              <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Reason</div>
                <div style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{leaveDrawer.reasonStr}</div>
              </div>
              {leaveDrawer.decidedByLine && (
                <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)", fontSize: 13, color: "var(--text-secondary)" }}>{leaveDrawer.decidedByLine}</div>
              )}
              {leaveDrawer.showDecisionNote && (
                <div style={{ paddingTop: leaveDrawer.decidedByLine ? 0 : 12, borderTop: leaveDrawer.decidedByLine ? "none" : "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{leaveDrawer.decisionNoteLabel}</div>
                  <div style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{leaveDrawer.decisionNoteStr}</div>
                </div>
              )}
            </SmoothScroll>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              <Button variant="ghost" onClick={closeLeaveDrawerAnimated}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Opening drawer ---- */}
      {(isNewOpening || selOpeningRaw) && (
        <div className={"crm-overlay-fade" + (openingDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={closeOpeningDrawerAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (openingDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: "94vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{isNewOpening ? "New Opening" : selOpeningRaw?.title}</h2>
              <button onClick={closeOpeningDrawerAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>

            {isNewOpening ? (
              <>
                <SmoothScroll style={{ flex: 1, padding: 24, fontSize: 14 }} contentStyle={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Input label="Position title" value={openingForm.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpeningForm((f) => ({ ...f, title: e.target.value }))} />
                  <Select label="Department" options={DEPARTMENT_OPTIONS} value={openingForm.dept} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOpeningForm((f) => ({ ...f, dept: e.target.value }))} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Input label="Salary bracket" placeholder="e.g. $70,000 – $90,000" value={openingForm.salaryBracket} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpeningForm((f) => ({ ...f, salaryBracket: e.target.value }))} />
                    <Input label="Experience required" placeholder="e.g. 3–5 years" value={openingForm.experience} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpeningForm((f) => ({ ...f, experience: e.target.value }))} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Job description</span>
                    <textarea rows={6} value={openingForm.jd} onChange={(e) => setOpeningForm((f) => ({ ...f, jd: e.target.value }))} style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)", resize: "vertical" }} />
                  </div>
                </SmoothScroll>
                <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
                  <Button variant="ghost" onClick={closeOpeningDrawerAnimated}>Cancel</Button>
                  <Button variant="primary" onClick={submitNewOpening}>Create Opening</Button>
                </div>
              </>
            ) : selOpeningRaw ? (
              <>
                <SmoothScroll style={{ flex: 1, padding: 24, fontSize: 14 }} contentStyle={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{selOpeningRaw.department} · Opened {selOpeningRaw.opened_at?.slice(0, 10)}</div>
                    <Select label="Status" options={[{ value: "Open", label: "Open" }, { value: "Filled", label: "Filled" }, { value: "Closed", label: "Closed" }]} value={selOpeningRaw.status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOpeningFieldLive(selOpeningRaw.id, "status", e.target.value)} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Input label="Salary bracket" value={selOpeningRaw.salary_bracket || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpeningFieldLive(selOpeningRaw.id, "salary_bracket", e.target.value)} />
                    <Input label="Experience required" value={selOpeningRaw.experience || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpeningFieldLive(selOpeningRaw.id, "experience", e.target.value)} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Job description</span>
                    <textarea rows={5} value={selOpeningRaw.description || ""} onChange={(e) => setOpeningFieldLive(selOpeningRaw.id, "description", e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)", resize: "vertical" }} />
                  </div>
                  <div style={{ paddingTop: 14, borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Candidates</div>
                    {selOpeningCandidates.length > 0 && (
                      <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, overflow: "hidden" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <th style={smallThStyle}>Name</th><th style={smallThStyle}>Applied</th><th style={smallThStyle}>Resume</th><th style={smallThStyle}>Rating</th><th style={smallThStyle}>Stage</th>
                          </tr></thead>
                          <tbody>
                            {selOpeningCandidates.map((c) => (
                              <tr key={c.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                <td style={{ padding: "10px 12px", fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500 }}>{c.name}</td>
                                <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-secondary)" }}>{c.appliedDate}</td>
                                <td style={{ padding: "10px 12px", fontSize: 13 }}>
                                  {c.resume_url && <span style={{ color: "var(--text-link)" }}>{c.resume_url}</span>}
                                  <label style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 12.5 }}>
                                    <input type="file" onChange={uploadCandidateResume} style={{ display: "none" }} />
                                    {c.resume_url ? " · replace" : "Upload"}
                                  </label>
                                </td>
                                <td style={{ padding: "10px 12px", fontSize: 12, color: "#F5A623", letterSpacing: 1 }}>{c.stars}</td>
                                <td style={{ padding: "10px 12px" }}>
                                  <select value={c.stage} onChange={(e) => setCandidateStage(c.id, e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)" }}>
                                    {HIRE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" placeholder="Candidate name" value={newCandidateName} onChange={(e) => setNewCandidateName(e.target.value)} style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                      <Button variant="secondary" onClick={() => addCandidate(selOpeningRaw.id)}>Add Candidate</Button>
                    </div>
                  </div>
                </SmoothScroll>
                <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
                  {isFinanceEditor && <Button variant="danger" onClick={() => askDeleteOpening(selOpeningRaw.id, selOpeningRaw.title)}>Delete Opening</Button>}
                  <Button variant="secondary" onClick={closeOpeningDrawerAnimated}>Close</Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ---- Delete Opening confirm ---- */}
      {deleteOpeningConfirm && (
        <div className={"crm-overlay-fade" + (deleteOpeningClosing.isClosing ? " orbit-closing" : "")} onClick={closeDeleteOpeningAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className={"crm-pop" + (deleteOpeningClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 400, maxWidth: "90vw", background: "var(--bg-surface)", borderRadius: 12, boxShadow: "var(--shadow-popover)", padding: 24 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>Delete &quot;{deleteOpeningConfirm.title}&quot;?</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "var(--text-secondary)" }}>This permanently removes the opening and every candidate on it. This cannot be undone.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="ghost" onClick={closeDeleteOpeningAnimated}>Cancel</Button>
              <Button variant="danger" onClick={confirmDeleteOpening}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
const smallThStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
const selectStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer" };
const dateInputStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" };
