"use client";

// Port of `screenIsDev` (Projects + Tasks tabs) + Project/New Project/Task/
// New Task drawers (template.html:3013-3663, script.js logic scattered
// ~1602-1700, 2485-2825, 4727-5000). Kanban boards support real
// drag-and-drop between columns, in addition to the inline status <select>
// — both funnel through the same changeProjectStatus/changeTaskStatus. One
// remaining intentional simplification: comment reply-to works (prefills
// draft with @mention, shows a "replying to" banner, posts with parent_id)
// but renders as a flat timeline rather than depth-indented nesting.
//
// Filtering is server-side here (unlike CRM, which filters client-side) —
// every filter change, including each search keystroke, re-fetches from
// /api/projects or /api/tasks with query params, matching loadProjects/
// loadTasks's exact behavior in the original.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/app-data-context";
import { useToast } from "@/lib/toast-context";
import { useClosingTransition } from "@/lib/use-closing-transition";
import {
  projectsApi,
  tasksApi,
  moneyC,
  numVal,
  toISO,
  fromISO,
  todayISO,
  getEmployeeName,
  getHighlightParts,
  formatActivityTimestamp,
  auditToDisplay,
  DATE_RANGE_OPTIONS,
  resolveDateRangePreset,
  deepLinkHref,
  isModifiedClick,
  parseDeepLinkHash,
  clearDeepLinkHash,
} from "@/lib/orbit-client";
import { Button, Input, Select, Badge, Icon } from "@/design-system/healer-bundle";

type Project = {
  id: string; name: string; client: string; status: string; budget: number | null; spent: number | null;
  deadline: string | null; start_date: string | null; team_ids: string[]; description: string;
  attachments?: { filename?: string; name?: string; url: string }[]; created_at?: string; completed_at?: string | null;
};
type Task = {
  id: string; project_id: string; title: string; assignee_id: string | null; status: string;
  deadline: string | null; start_date: string | null; description: string; tags: string[];
  created_by_id?: string; created_at?: string;
};
type Comment = { id: string; text: string; author_id: string; parent_id?: string | null; created_at: string };
type Employee = { id: string; name: string; role?: string; department?: string; status?: string };

const DEV_STATUSES = ["Not Started", "In Progress", "Delayed", "Completed"];
const STATUS_TONE: Record<string, string> = { "Not Started": "neutral", "In Progress": "info", Delayed: "danger", Completed: "success" };
const devStatusOptions = DEV_STATUSES.map((s) => ({ value: s, label: s }));

function Highlight({ parts }: { parts: { before: string; match: string; after: string; hasMatch: boolean } }) {
  return (
    <>
      {parts.before}
      {parts.hasMatch && <mark style={{ background: "#ffe066", color: "#11141e", borderRadius: 2, padding: "0 2px" }}>{parts.match}</mark>}
      {parts.after}
    </>
  );
}

export default function DevPage() {
  const { currentUser } = useAuth();
  const { employees } = useAppData();
  const { pushToast } = useToast();

  const persona = currentUser?.access_level;
  const accessLevels = currentUser?.access_levels || [];
  const isOwnerReal = accessLevels.includes("owner");
  const rawDept = currentUser?.department as string | undefined;
  const isDevEditor = isOwnerReal || (accessLevels.includes("dev") && rawDept !== "Dev Member");
  const isDevOwner = isOwnerReal || isDevEditor;
  const showProjectFinance = isDevOwner;
  const devPageTitle = persona === "devmember" ? "My Projects" : "Projects";
  const isOwnerDept = currentUser?.department === "Owner";

  const [tab, setTab] = useState<"projects" | "tasks">("projects");
  const [projSubView, setProjSubView] = useState<"kanban" | "list" | "past">("kanban");
  const [taskSubView, setTaskSubView] = useState<"kanban" | "list">("kanban");

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [projSearch, setProjSearch] = useState("");
  const [projClient, setProjClient] = useState("");
  const [projStatus, setProjStatus] = useState("");
  const [projMember, setProjMember] = useState("");
  const [projDateRangePreset, setProjDateRangePreset] = useState("");
  const [projDateFrom, setProjDateFrom] = useState("");
  const [projDateTo, setProjDateTo] = useState("");

  const [taskSearch, setTaskSearch] = useState("");
  const [taskProject, setTaskProject] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskStatus, setTaskStatus] = useState("");

  const loadProjects = () => {
    const params: Record<string, string> = {};
    if (projSearch) params.search = projSearch;
    if (projClient) params.client = projClient;
    if (projStatus) params.status = projStatus;
    if (projMember) params.team_member = projMember;
    if (projDateFrom) params.date_from = projDateFrom;
    if (projDateTo) params.date_to = projDateTo;
    projectsApi.list(params).then(
      (data: Project[]) => setProjects(data),
      () => pushToast("Could not load projects.", "error")
    );
  };
  const loadTasks = () => {
    const params: Record<string, string> = {};
    if (taskSearch) params.search = taskSearch;
    if (taskProject) params.project_id = taskProject;
    if (taskAssignee) params.assignee = taskAssignee;
    if (taskStatus) params.status = taskStatus;
    tasksApi.list(params).then(
      (data: Task[]) => setTasks(data),
      () => pushToast("Could not load tasks.", "error")
    );
  };

  useEffect(loadProjects, [projSearch, projClient, projStatus, projMember, projDateFrom, projDateTo]);
  useEffect(loadTasks, [taskSearch, taskProject, taskAssignee, taskStatus]);

  const activeEmployees = employees.filter((e) => e.status !== "Terminated") as Employee[];
  const devEmployeeOptions = activeEmployees.filter((e) => e.department === "Dev Member").map((e) => ({ value: e.id, label: e.name }));

  // ---- computed rows ----
  const mergeProject = (raw: Project) => {
    const query = projSearch.trim();
    const teamNames = (raw.team_ids || []).map((id) => getEmployeeName(id)).filter(Boolean);
    return {
      ...raw,
      budgetStr: raw.budget != null ? moneyC(raw.budget, "USD") : "—",
      spentStr: raw.spent != null ? moneyC(raw.spent || 0, "USD") : "—",
      teamStr: teamNames.length ? teamNames.join(", ") : "Unassigned",
      nameHighlight: getHighlightParts(raw.name, query),
      clientHighlight: getHighlightParts(raw.client, query),
      teamHighlight: getHighlightParts(teamNames.join(", "), query),
      taskCount: tasks.filter((t) => t.project_id === raw.id).length,
      atRisk: raw.status === "Delayed",
    };
  };
  const allProjects = projects.map(mergeProject);
  const projectNameById: Record<string, string> = {};
  allProjects.forEach((p) => (projectNameById[p.id] = p.name));

  const mergeTask = (raw: Task) => {
    const query = taskSearch.trim();
    const assigneeName = getEmployeeName(raw.assignee_id || "");
    return {
      ...raw,
      projectName: projectNameById[raw.project_id] || "Unknown project",
      titleHighlight: getHighlightParts(raw.title, query),
      assignee: assigneeName,
      assigneeHighlight: getHighlightParts(assigneeName, query),
      tagChips: (raw.tags || []).map((t) => "#" + t),
      hasTags: !!(raw.tags && raw.tags.length),
      overdue: !!(raw.deadline && raw.deadline < todayISO() && raw.status !== "Completed"),
    };
  };
  const allTasks = tasks.map(mergeTask);

  const projClientOptions = [{ value: "", label: "All clients" }, ...Array.from(new Set(allProjects.map((p) => p.client))).map((c) => ({ value: c, label: c }))];
  const projMemberOptions = [{ value: "", label: "All team members" }, ...Array.from(new Set(allProjects.flatMap((p) => p.team_ids || []))).map((id) => ({ value: id, label: getEmployeeName(id) }))];
  const projFiltersActive = !!(projSearch || projClient || projStatus || projMember || projDateRangePreset);

  // Completed projects fall off the Kanban/List board 20 days after
  // completion — still in the DB, still reachable via a date/status filter
  // (matching Won/Lost leads' behavior in CRM), and always browsable in the
  // separate Past Projects view (Owner department only).
  const PROJECT_STALE_DAYS = 20;
  const isStaleCompleted = (p: { status: string; completed_at?: string | null }) =>
    p.status === "Completed" && !!p.completed_at && Date.now() - new Date(p.completed_at).getTime() > PROJECT_STALE_DAYS * 24 * 60 * 60 * 1000;
  const showStaleCompleted = !!projDateRangePreset || !!projDateFrom || !!projDateTo || projStatus === "Completed";
  const visibleProjects = showStaleCompleted ? allProjects : allProjects.filter((p) => !isStaleCompleted(p));
  const pastProjects = allProjects
    .filter(isStaleCompleted)
    .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));

  const projectKanbanCols = DEV_STATUSES.map((status) => ({ status, rows: visibleProjects.filter((p) => p.status === status) }));

  const taskProjectOptions = [{ value: "", label: "All projects" }, ...allProjects.map((p) => ({ value: p.id, label: p.name }))];
  const taskAssigneeOptions = [{ value: "", label: "All assignees" }, ...Array.from(new Set(allTasks.map((t) => t.assignee_id))).filter(Boolean).map((id) => ({ value: id as string, label: getEmployeeName(id as string) }))];
  const taskFiltersActive = !!(taskSearch || taskProject || taskAssignee || taskStatus);
  const taskKanbanCols = DEV_STATUSES.map((status) => ({ status, rows: allTasks.filter((t) => t.status === status) }));

  const canCreateTask = isOwnerReal || rawDept === "Dev Member" || accessLevels.includes("dev");

  // ---- Project drawer ----
  const [selProjectId, setSelProjectId] = useState<string | null>(null);
  const [projComments, setProjComments] = useState<Record<string, Comment[]>>({});
  const [projAuditLogs, setProjAuditLogs] = useState<Record<string, { id: string; user: string; ts: string; action: string; detail: string; hasDetail: boolean }[]>>({});
  const [projTeamQuery, setProjTeamQuery] = useState("");
  const [projCommentDraft, setProjCommentDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: string; author: string; snippet: string } | null>(null);

  const selProject = selProjectId ? allProjects.find((p) => p.id === selProjectId) || null : null;
  const selProjectSubtasks = selProject ? allTasks.filter((t) => t.project_id === selProject.id) : [];
  const canAddSubtask = !!selProject && (isOwnerReal || (currentUser && (selProject.team_ids || []).includes(currentUser.id)));

  const loadProjectDetails = (id: string) => {
    projectsApi.getComments(id).then((c: Comment[]) => setProjComments((cur) => ({ ...cur, [id]: c })));
    projectsApi.getAudit(id).then((logs: { id: string; actor_id: string; created_at: string; action: string; detail: string }[]) =>
      setProjAuditLogs((cur) => ({ ...cur, [id]: logs.map(auditToDisplay) }))
    );
  };
  const openProjectDrawer = (id: string) => {
    setSelProjectId(id);
    setReplyingTo(null);
    loadProjectDetails(id);
  };
  const closeProjectDrawer = () => {
    setSelProjectId(null);
    setReplyingTo(null);
    clearDeepLinkHash();
  };
  const projectDrawerClosing = useClosingTransition();
  const closeProjectDrawerAnimated = () => projectDrawerClosing.closeWithTransition(closeProjectDrawer);

  const setProjectFieldLive = (id: string, field: string, val: unknown) => {
    setProjects((cur) => cur.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
    let apiVal = val;
    if (field === "deadline" && val) {
      try {
        apiVal = new Date(val as string).toISOString().slice(0, 10);
      } catch {}
    }
    projectsApi.update(id, { [field]: apiVal }).then(
      () => {
        pushToast("Project auto-saved.");
        loadProjects();
        loadProjectDetails(id);
      },
      (err: Error) => {
        pushToast(err.message || "Could not save project change.", "error");
        loadProjects();
      }
    );
  };
  const changeProjectStatus = (id: string, status: string) => setProjectFieldLive(id, "status", status);

  // Drag-and-drop between Kanban columns — a nicer alternative to the inline
  // status <select> everyone here can already use; dropping just calls the
  // same changeProjectStatus/changeTaskStatus the dropdown already calls, so
  // server-side rules (e.g. a Dev Member only being allowed to update
  // projects they're assigned to) still apply exactly as before.
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverProjectStatus, setDragOverProjectStatus] = useState<string | null>(null);
  const onProjectDragStart = (e: React.DragEvent, id: string) => {
    setDraggedProjectId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const onProjectDragEnd = () => { setDraggedProjectId(null); setDragOverProjectStatus(null); };
  const onProjectColDragOver = (e: React.DragEvent, status: string) => {
    if (!draggedProjectId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverProjectStatus !== status) setDragOverProjectStatus(status);
  };
  const onProjectColDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    // draggedProjectId (React state) is the reliable source of truth — see
    // the identical fix/comment on CRM's onStageDrop for why dataTransfer
    // alone isn't safe for a dragged <a href>.
    const id = draggedProjectId || e.dataTransfer.getData("text/plain");
    setDraggedProjectId(null);
    setDragOverProjectStatus(null);
    if (id) changeProjectStatus(id, status);
  };

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskStatus, setDragOverTaskStatus] = useState<string | null>(null);
  const onTaskDragStart = (e: React.DragEvent, id: string) => {
    setDraggedTaskId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const onTaskDragEnd = () => { setDraggedTaskId(null); setDragOverTaskStatus(null); };
  const onTaskColDragOver = (e: React.DragEvent, status: string) => {
    if (!draggedTaskId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverTaskStatus !== status) setDragOverTaskStatus(status);
  };
  const onTaskColDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const id = draggedTaskId || e.dataTransfer.getData("text/plain");
    setDraggedTaskId(null);
    setDragOverTaskStatus(null);
    if (id) changeTaskStatus(id, status);
  };

  const toggleProjTeamMember = (memberId: string) => {
    if (!selProject) return;
    const has = selProject.team_ids.includes(memberId);
    const next = has ? selProject.team_ids.filter((x) => x !== memberId) : [...selProject.team_ids, memberId];
    setProjectFieldLive(selProject.id, "team_ids", next);
  };

  const uploadProjectAttachment = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      pushToast("File size exceeds maximum limit of 10MB.", "error");
      return;
    }
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".xlsx", ".xls"].includes(ext)) {
      pushToast("Allowed file types: PDF, DOC, DOCX, PNG, JPG, JPEG, XLSX, XLS", "error");
      return;
    }
    pushToast("Uploading attachment...");
    projectsApi.uploadAttachment(id, file).then(
      () => {
        pushToast("Attachment uploaded successfully.");
        loadProjects();
      },
      (err: Error) => pushToast(err.message || "Upload failed.", "error")
    );
    e.target.value = "";
  };
  const removeProjectAttachment = (id: string, name: string) => {
    projectsApi.removeAttachment(id, name).then(
      () => {
        pushToast("Attachment removed.");
        loadProjects();
      },
      (err: Error) => pushToast(err.message || "Could not remove attachment.", "error")
    );
  };

  const openAttachment = async (url: string) => {
    // Attachments are served from the DB behind an authenticated endpoint
    // (Render's disk is ephemeral) — a plain <a href> with no auth header
    // would just 401. Fetch with the token and open the bytes as a blob.
    try {
      const token = localStorage.getItem("orbit_token");
      const res = await fetch(url, { headers: token ? { Authorization: "Bearer " + token } : {} });
      if (!res.ok) throw new Error("Could not load the file.");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      pushToast((err as Error).message || "Could not open the file.", "error");
    }
  };

  const addProjectComment = (id: string) => {
    const text = projCommentDraft.trim();
    if (!text) return;
    projectsApi.addComment(id, { text, parent_id: replyingTo?.id || null }).then(
      () => {
        pushToast("Comment posted.");
        setProjCommentDraft("");
        setReplyingTo(null);
        loadProjectDetails(id);
      },
      (err: Error) => pushToast(err.message || "Could not post the comment.", "error")
    );
  };

  const deleteSelectedProject = () => {
    if (!selProject) return;
    if (window.confirm("Are you sure you want to delete this project?")) {
      projectsApi.remove(selProject.id).then(
        () => {
          closeProjectDrawer();
          pushToast("Project deleted successfully.");
          loadProjects();
          loadTasks();
        },
        (err: Error) => pushToast(err.message || "Could not delete project.", "error")
      );
    }
  };

  // ---- New Project drawer ----
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const newProjectClosing = useClosingTransition();
  const closeNewProjectAnimated = () => newProjectClosing.closeWithTransition(() => setNewProjectOpen(false));
  const [pfTeamQuery, setPfTeamQuery] = useState("");
  const [pForm, setPForm] = useState({ name: "", client: "", deadline: "", budget: "", team_ids: [] as string[], description: "" });

  const openNewProject = () => {
    setPfTeamQuery("");
    setPForm({ name: "", client: "", deadline: "", budget: "", team_ids: [], description: "" });
    setNewProjectOpen(true);
  };
  const togglePfTeamMember = (id: string) => {
    setPForm((f) => ({ ...f, team_ids: f.team_ids.includes(id) ? f.team_ids.filter((x) => x !== id) : [...f.team_ids, id] }));
  };
  const submitNewProject = () => {
    if (!pForm.name || !pForm.client) {
      pushToast("Project name and client name are required.", "error");
      return;
    }
    if (pForm.deadline) {
      const deadlineDate = new Date(pForm.deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (deadlineDate < today) {
        pushToast("Project deadline cannot be before creation date.", "error");
        return;
      }
    }
    projectsApi
      .create({
        name: pForm.name,
        client: pForm.client,
        start_date: todayISO(),
        deadline: pForm.deadline ? new Date(pForm.deadline).toISOString().slice(0, 10) : null,
        budget: numVal(pForm.budget),
        team_ids: pForm.team_ids,
        description: pForm.description || "",
        status: "Not Started",
      })
      .then(
        () => {
          setNewProjectOpen(false);
          pushToast("Project created successfully.");
          loadProjects();
        },
        (err: Error) => pushToast(err.message || "Could not create project.", "error")
      );
  };

  // ---- Task drawer ----
  const [selTaskId, setSelTaskId] = useState<string | null>(null);
  const [taskComments, setTaskComments] = useState<Record<string, Comment[]>>({});
  const [taskAuditLogs, setTaskAuditLogs] = useState<Record<string, { id: string; user: string; ts: string; action: string; detail: string; hasDetail: boolean }[]>>({});
  const [taskCommentDraft, setTaskCommentDraft] = useState("");
  const [taskTagInput, setTaskTagInput] = useState("");

  const selTask = selTaskId ? allTasks.find((t) => t.id === selTaskId) || null : null;
  const disabledDetails = !!selTask && !(isOwnerReal || (currentUser && selTask.created_by_id === currentUser.id));

  const loadTaskDetails = (id: string) => {
    tasksApi.getComments(id).then((c: Comment[]) => setTaskComments((cur) => ({ ...cur, [id]: c })));
    tasksApi.getAudit(id).then((logs: { id: string; actor_id: string; created_at: string; action: string; detail: string }[]) =>
      setTaskAuditLogs((cur) => ({ ...cur, [id]: logs.map(auditToDisplay) }))
    );
  };
  const openTaskDrawer = (id: string) => {
    setSelTaskId(id);
    setReplyingTo(null);
    loadTaskDetails(id);
  };
  const closeTaskDrawer = () => {
    setSelTaskId(null);
    setReplyingTo(null);
    clearDeepLinkHash();
  };
  const taskDrawerClosing = useClosingTransition();
  const closeTaskDrawerAnimated = () => taskDrawerClosing.closeWithTransition(closeTaskDrawer);

  // Middle-click/ctrl-click/right-click "open in new tab" on a project or
  // task card/row works off a real #/project/<id> or #/task/<id> href (see
  // deepLinkHref) — a plain left click still preventDefaults and opens the
  // drawer in place. A fresh tab loading that hash re-runs this same check
  // on mount, switches to the right tab, and opens straight to the item.
  useEffect(() => {
    const link = parseDeepLinkHash();
    if (!link) return;
    if (link.type === "project") {
      setTab("projects");
      openProjectDrawer(link.id);
    } else if (link.type === "task") {
      setTab("tasks");
      openTaskDrawer(link.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleDeepLinkClick = (e: React.MouseEvent, opener: (id: string) => void, id: string) => {
    if (isModifiedClick(e)) return;
    e.preventDefault();
    opener(id);
  };

  const setTaskFieldLive = (id: string, field: string, val: unknown) => {
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, [field]: val } : t)));
    let apiVal = val;
    if ((field === "deadline" || field === "start_date") && val) {
      try {
        apiVal = new Date(val as string).toISOString().slice(0, 10);
      } catch {}
    }
    tasksApi.update(id, { [field]: apiVal }).then(
      () => {
        pushToast("Task auto-saved.");
        loadTasks();
        loadTaskDetails(id);
      },
      (err: Error) => {
        pushToast(err.message || "Could not save task change.", "error");
        loadTasks();
      }
    );
  };
  const changeTaskStatus = (id: string, status: string) => setTaskFieldLive(id, "status", status);

  const addSelectedTaskTag = () => {
    if (!selTask) return;
    const tag = taskTagInput.trim().replace(/^#+/, "");
    if (!tag || (selTask.tags || []).includes(tag)) {
      setTaskTagInput("");
      return;
    }
    setTaskFieldLive(selTask.id, "tags", [...(selTask.tags || []), tag]);
    setTaskTagInput("");
  };
  const removeSelectedTaskTag = (tag: string) => {
    if (!selTask) return;
    setTaskFieldLive(selTask.id, "tags", (selTask.tags || []).filter((t) => t !== tag));
  };

  const addTaskComment = (id: string) => {
    const text = taskCommentDraft.trim();
    if (!text) return;
    tasksApi.addComment(id, { text, parent_id: replyingTo?.id || null }).then(
      () => {
        pushToast("Comment posted.");
        setTaskCommentDraft("");
        setReplyingTo(null);
        loadTaskDetails(id);
      },
      (err: Error) => pushToast(err.message || "Could not post the comment.", "error")
    );
  };

  const deleteSelectedTask = () => {
    if (!selTask) return;
    if (window.confirm("Are you sure you want to delete this task?")) {
      tasksApi.remove(selTask.id).then(
        () => {
          closeTaskDrawer();
          pushToast("Task deleted successfully.");
          loadTasks();
        },
        (err: Error) => pushToast(err.message || "Could not delete task.", "error")
      );
    }
  };

  // ---- New Task drawer ----
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const newTaskClosing = useClosingTransition();
  const closeNewTaskAnimated = () => newTaskClosing.closeWithTransition(() => setNewTaskOpen(false));
  const [taskIsSubtask, setTaskIsSubtask] = useState(false);
  const [tForm, setTForm] = useState({ projectId: "", title: "", assignee_id: "", deadline: "", description: "", tags: [] as string[] });
  const [tfTagInput, setTfTagInput] = useState("");

  const openNewTask = (presetProjectId?: string, isSubtask = false) => {
    setTaskIsSubtask(isSubtask);
    setTForm({ projectId: presetProjectId || "", title: "", assignee_id: "", deadline: "", description: "", tags: [] });
    setTfTagInput("");
    setNewTaskOpen(true);
  };
  const tfProject = tForm.projectId ? allProjects.find((p) => p.id === tForm.projectId) : null;
  const tfProjectMemberOptions = [{ value: "", label: "Unassigned" }, ...((tfProject?.team_ids || []).map((id) => ({ value: id, label: getEmployeeName(id) })))];

  const addTfTag = () => {
    const tag = tfTagInput.trim().replace(/^#+/, "");
    if (!tag || tForm.tags.includes(tag)) {
      setTfTagInput("");
      return;
    }
    setTForm((f) => ({ ...f, tags: [...f.tags, tag] }));
    setTfTagInput("");
  };
  const removeTfTag = (tag: string) => setTForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));

  const submitNewTask = () => {
    if (!tForm.projectId || !tForm.title || !tForm.assignee_id || !tForm.deadline) {
      pushToast("Title, Assignee, and Delivery date are required.", "error");
      return;
    }
    const deadlineISO = toISO(tForm.deadline);
    if (deadlineISO && deadlineISO < todayISO()) {
      pushToast("Delivery date cannot be in the past.", "error");
      return;
    }
    tasksApi
      .create({
        project_id: tForm.projectId,
        title: tForm.title,
        assignee_id: tForm.assignee_id || null,
        deadline: deadlineISO || null,
        description: tForm.description || "",
        status: "Not Started",
        tags: tForm.tags,
      })
      .then(
        () => {
          setNewTaskOpen(false);
          pushToast("Task created successfully.");
          loadTasks();
        },
        (err: Error) => pushToast(err.message || "Could not create task.", "error")
      );
  };

  const startReply = (c: Comment, authorName: string) => setReplyingTo({ id: c.id, author: authorName, snippet: c.text.slice(0, 40) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>{devPageTitle}</h1>
          <div className="orbit-setup-tabs">
            <button className="orbit-setup-tab" style={{ fontWeight: tab === "projects" ? 600 : 400 }} onClick={() => setTab("projects")}>Projects</button>
            <button className="orbit-setup-tab" style={{ fontWeight: tab === "tasks" ? 600 : 400 }} onClick={() => setTab("tasks")}>Tasks</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {tab === "projects" && (
            <>
              <div className="orbit-pill-toggle" style={{ display: "flex", background: "var(--bg-page)", borderRadius: 9999, padding: 3, gap: 2 }}>
                <button onClick={() => setProjSubView("kanban")} style={{ border: "none", borderRadius: 9999, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: projSubView === "kanban" ? "#fff" : "transparent", color: projSubView === "kanban" ? "var(--brand-primary)" : "var(--text-secondary)" }}>Kanban</button>
                <button onClick={() => setProjSubView("list")} style={{ border: "none", borderRadius: 9999, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: projSubView === "list" ? "#fff" : "transparent", color: projSubView === "list" ? "var(--brand-primary)" : "var(--text-secondary)" }}>List</button>
                {isOwnerDept && (
                  <button onClick={() => setProjSubView("past")} style={{ border: "none", borderRadius: 9999, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: projSubView === "past" ? "#fff" : "transparent", color: projSubView === "past" ? "var(--brand-primary)" : "var(--text-secondary)" }}>Past Projects</button>
                )}
              </div>
              {isDevOwner && <Button variant="primary" icon="plus" onClick={openNewProject}>New Project</Button>}
            </>
          )}
          {tab === "tasks" && (
            <>
              <div className="orbit-pill-toggle" style={{ display: "flex", background: "var(--bg-page)", borderRadius: 9999, padding: 3, gap: 2 }}>
                <button onClick={() => setTaskSubView("kanban")} style={{ border: "none", borderRadius: 9999, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: taskSubView === "kanban" ? "#fff" : "transparent", color: taskSubView === "kanban" ? "var(--brand-primary)" : "var(--text-secondary)" }}>Kanban</button>
                <button onClick={() => setTaskSubView("list")} style={{ border: "none", borderRadius: 9999, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: taskSubView === "list" ? "#fff" : "transparent", color: taskSubView === "list" ? "var(--brand-primary)" : "var(--text-secondary)" }}>List</button>
              </div>
              {canCreateTask && <Button variant="primary" icon="plus" onClick={() => openNewTask()}>New Task</Button>}
            </>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
      {tab === "projects" && (
        <motion.div key="tab-projects" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "var(--bg-page)", borderRadius: 12, padding: "12px 16px" }}>
            <input type="text" placeholder="Search project or client…" value={projSearch} onChange={(e) => setProjSearch(e.target.value)} style={{ flex: 1, minWidth: 180, fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", outline: "none", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
            <select value={projClient} onChange={(e) => setProjClient(e.target.value)} style={selectStyle}>{projClientOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <select value={projStatus} onChange={(e) => setProjStatus(e.target.value)} style={selectStyle}><option value="">All statuses</option>{devStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <select value={projMember} onChange={(e) => setProjMember(e.target.value)} style={selectStyle}>{projMemberOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <select value={projDateRangePreset} onChange={(e) => setProjDateRangePreset(e.target.value)} aria-label="Filter by deadline" style={selectStyle}>{DATE_RANGE_OPTIONS.map((o: { value: string; label: string }) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            {projDateRangePreset === "custom" && (
              <>
                <input type="date" value={projDateFrom} onChange={(e) => setProjDateFrom(e.target.value)} aria-label="From date" style={dateInputStyle} />
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>to</span>
                <input type="date" value={projDateTo} onChange={(e) => setProjDateTo(e.target.value)} aria-label="To date" style={dateInputStyle} />
              </>
            )}
            {projFiltersActive && (
              <a href="#" onClick={(e) => { e.preventDefault(); setProjSearch(""); setProjClient(""); setProjStatus(""); setProjMember(""); setProjDateRangePreset(""); setProjDateFrom(""); setProjDateTo(""); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none", whiteSpace: "nowrap" }}>Clear filters</a>
            )}
          </div>

          <AnimatePresence mode="wait">
          {projSubView === "kanban" && (
            <motion.div key="proj-kanban" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
              {projectKanbanCols.map((col) => (
                <div
                  key={col.status}
                  onDragOver={(e) => onProjectColDragOver(e, col.status)}
                  onDragLeave={() => setDragOverProjectStatus((cur) => (cur === col.status ? null : cur))}
                  onDrop={(e) => onProjectColDrop(e, col.status)}
                  style={{
                    width: 264, flexShrink: 0, borderRadius: 12, padding: 12,
                    background: dragOverProjectStatus === col.status ? "var(--brand-primary-light)" : "var(--bg-page)",
                    outline: dragOverProjectStatus === col.status ? "2px dashed var(--brand-primary)" : "2px dashed transparent",
                    outlineOffset: -2,
                    transition: "background 0.15s ease, outline-color 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" }}>{col.status}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 9999, padding: "1px 8px" }}>{col.rows.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {col.rows.map((p) => (
                      <a
                        key={p.id}
                        href={deepLinkHref("project", p.id)}
                        onClick={(e) => handleDeepLinkClick(e, openProjectDrawer, p.id)}
                        draggable
                        onDragStart={(e) => onProjectDragStart(e, p.id)}
                        onDragEnd={onProjectDragEnd}
                        style={{
                          display: "block", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, boxShadow: "var(--shadow-card)", padding: 14,
                          cursor: "grab", textDecoration: "none", color: "inherit",
                          opacity: draggedProjectId === p.id ? 0.4 : 1,
                          transform: draggedProjectId === p.id ? "scale(0.97)" : "scale(1)",
                          transition: "opacity 0.15s ease, transform 0.15s ease",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}><Highlight parts={p.nameHighlight} /></div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}><Highlight parts={p.clientHighlight} /> · due {p.deadline}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>Started: {p.start_date || "—"}</div>
                        {p.atRisk && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--status-danger-text)", marginBottom: 8 }}>At Risk</div>}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          {showProjectFinance && <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{p.budgetStr}</span>}
                          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{p.taskCount} tasks</span>
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <select value={p.status} onChange={(e) => changeProjectStatus(p.id, e.target.value)} style={{ width: "100%", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" }}>
                            {devStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      </a>
                    ))}
                    {col.rows.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 2px" }}>No projects</div>}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {projSubView === "list" && (
            <motion.div key="proj-list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={thStyle}>Project</th><th style={thStyle}>Client</th><th style={thStyle}>Team</th>
                    <th style={thStyle}>Start date</th><th style={thStyle}>Deadline</th>
                    {showProjectFinance && <th style={thStyle}>Budget</th>}
                    <th style={thStyle}>Status</th><th></th>
                  </tr></thead>
                  <tbody>
                    {visibleProjects.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}><Highlight parts={p.nameHighlight} /></td>
                        <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}><Highlight parts={p.clientHighlight} /></td>
                        <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}><Highlight parts={p.teamHighlight} /></td>
                        <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{p.start_date || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{p.deadline}</td>
                        {showProjectFinance && <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{p.budgetStr}</td>}
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          <select value={p.status} onChange={(e) => changeProjectStatus(p.id, e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" }}>
                            {devStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}><a href={deepLinkHref("project", p.id)} onClick={(e) => handleDeepLinkClick(e, openProjectDrawer, p.id)} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>View</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {projSubView === "past" && isOwnerDept && (
            <motion.div key="proj-past" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
            {pastProjects.length === 0 ? (
              <div style={{ background: "var(--bg-page)", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No projects have aged out of the board yet — Completed projects move here {PROJECT_STALE_DAYS} days after completion.</div>
            ) : (
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <th style={thStyle}>Project</th><th style={thStyle}>Client</th><th style={thStyle}>Team</th>
                      {showProjectFinance && <th style={thStyle}>Budget</th>}
                      <th style={thStyle}>Completed</th><th></th>
                    </tr></thead>
                    <tbody>
                      {pastProjects.map((p) => (
                        <tr key={p.id} onClick={() => openProjectDrawer(p.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                          <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>{p.name}</td>
                          <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{p.client}</td>
                          <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{p.teamStr}</td>
                          {showProjectFinance && <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{p.budgetStr}</td>}
                          <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatActivityTimestamp(p.completed_at || "")}</td>
                          <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                            <a href={deepLinkHref("project", p.id)} onClick={(e) => handleDeepLinkClick(e, openProjectDrawer, p.id)} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>View</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </motion.div>
          )}
          </AnimatePresence>
        </motion.div>
      )}

      {tab === "tasks" && (
        <motion.div key="tab-tasks" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "var(--bg-page)", borderRadius: 12, padding: "12px 16px" }}>
            <input type="text" placeholder="Search task or assignee…" value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} style={{ flex: 1, minWidth: 180, fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", outline: "none", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
            <select value={taskProject} onChange={(e) => setTaskProject(e.target.value)} style={selectStyle}>{taskProjectOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} style={selectStyle}>{taskAssigneeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <select value={taskStatus} onChange={(e) => setTaskStatus(e.target.value)} style={selectStyle}><option value="">All statuses</option>{devStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            {taskFiltersActive && (
              <a href="#" onClick={(e) => { e.preventDefault(); setTaskSearch(""); setTaskProject(""); setTaskAssignee(""); setTaskStatus(""); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none", whiteSpace: "nowrap" }}>Clear filters</a>
            )}
          </div>

          <AnimatePresence mode="wait">
          {taskSubView === "kanban" && (
            <motion.div key="task-kanban" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
              {taskKanbanCols.map((col) => (
                <div
                  key={col.status}
                  onDragOver={(e) => onTaskColDragOver(e, col.status)}
                  onDragLeave={() => setDragOverTaskStatus((cur) => (cur === col.status ? null : cur))}
                  onDrop={(e) => onTaskColDrop(e, col.status)}
                  style={{
                    width: 250, flexShrink: 0, borderRadius: 12, padding: 12,
                    background: dragOverTaskStatus === col.status ? "var(--brand-primary-light)" : "var(--bg-page)",
                    outline: dragOverTaskStatus === col.status ? "2px dashed var(--brand-primary)" : "2px dashed transparent",
                    outlineOffset: -2,
                    transition: "background 0.15s ease, outline-color 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" }}>{col.status}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 9999, padding: "1px 8px" }}>{col.rows.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {col.rows.map((t) => (
                      <a
                        key={t.id}
                        href={deepLinkHref("task", t.id)}
                        onClick={(e) => handleDeepLinkClick(e, openTaskDrawer, t.id)}
                        draggable
                        onDragStart={(e) => onTaskDragStart(e, t.id)}
                        onDragEnd={onTaskDragEnd}
                        style={{
                          display: "block", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, boxShadow: "var(--shadow-card)", padding: 14,
                          cursor: "grab", textDecoration: "none", color: "inherit",
                          opacity: draggedTaskId === t.id ? 0.4 : 1,
                          transform: draggedTaskId === t.id ? "scale(0.97)" : "scale(1)",
                          transition: "opacity 0.15s ease, transform 0.15s ease",
                        }}
                      >
                        <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, marginBottom: 6 }}><Highlight parts={t.titleHighlight} /></div>
                        {t.hasTags && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>{t.tagChips.map((tg) => <span key={tg} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--brand-primary)", background: "var(--brand-primary-light)", borderRadius: 9999, padding: "2px 8px" }}>{tg}</span>)}</div>}
                        <div style={{ fontSize: 11, color: "var(--text-link)", marginBottom: 6 }}>{t.projectName}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 6 }}><Highlight parts={t.assigneeHighlight} /> · due {t.deadline}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Started: {t.start_date || "—"}</div>
                        {t.overdue && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--status-danger-text)" }}>Overdue</div>}
                        <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                          <select value={t.status} onChange={(e) => changeTaskStatus(t.id, e.target.value)} style={{ width: "100%", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" }}>
                            {devStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      </a>
                    ))}
                    {col.rows.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 2px" }}>No tasks</div>}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {taskSubView === "list" && (
            <motion.div key="task-list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={thStyle}>Task</th><th style={thStyle}>Tags</th><th style={thStyle}>Project</th>
                    <th style={thStyle}>Assignee</th><th style={thStyle}>Start date</th><th style={thStyle}>Deadline</th>
                    <th style={thStyle}>Status</th><th></th>
                  </tr></thead>
                  <tbody>
                    {allTasks.map((t) => (
                      <tr key={t.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}><Highlight parts={t.titleHighlight} /></td>
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{t.tagChips.map((tg) => <span key={tg} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--brand-primary)", background: "var(--brand-primary-light)", borderRadius: 9999, padding: "2px 8px" }}>{tg}</span>)}</div></td>
                        <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{t.projectName}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}><Highlight parts={t.assigneeHighlight} /></td>
                        <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{t.start_date || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{t.deadline}</td>
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          <select value={t.status} onChange={(e) => changeTaskStatus(t.id, e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" }}>
                            {devStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}><a href={deepLinkHref("task", t.id)} onClick={(e) => handleDeepLinkClick(e, openTaskDrawer, t.id)} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>View</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ---- Project drawer ---- */}
      {selProject && (
        <div className={"crm-overlay-fade" + (projectDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={closeProjectDrawerAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (projectDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Project</h2>
              <button onClick={closeProjectDrawerAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14, fontSize: 14 }}>
              <Input label="Project name" value={selProject.name} disabled={!isDevOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProjectFieldLive(selProject.id, "name", e.target.value)} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Input label="Client" value={selProject.client} disabled={!isDevOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProjectFieldLive(selProject.id, "client", e.target.value)} />
                <Select label="Status" options={devStatusOptions} value={selProject.status} disabled={!isDevOwner} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => changeProjectStatus(selProject.id, e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Start date</label>
                  <input type="date" value={selProject.start_date || ""} disabled={!isDevOwner} onChange={(e) => setProjectFieldLive(selProject.id, "start_date", e.target.value)} style={{ width: "100%", boxSizing: "border-box", ...dateInputStyle }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Deadline</label>
                  <input type="date" value={selProject.deadline || ""} disabled={!isDevOwner} onChange={(e) => setProjectFieldLive(selProject.id, "deadline", e.target.value)} style={dateInputStyle} />
                </div>
              </div>
              {showProjectFinance && <Input label="Budget ($, 0 = internal)" value={selProject.budget ?? ""} disabled={!isDevOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProjectFieldLive(selProject.id, "budget", numVal(e.target.value))} />}
              {showProjectFinance && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Spent {selProject.spentStr} of {selProject.budgetStr}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Team</span>
                {selProject.team_ids.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {selProject.team_ids.map((id) => (
                      <span key={id} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-page)", border: "1px solid var(--border-subtle)", borderRadius: 9999, padding: "4px 6px 4px 12px", fontSize: 13, color: "var(--text-primary)" }}>
                        {getEmployeeName(id)}
                        {showProjectFinance && <a href="#" onClick={(e) => { e.preventDefault(); toggleProjTeamMember(id); }} style={{ color: "var(--text-muted)", textDecoration: "none", fontWeight: 700, padding: "0 4px" }}>×</a>}
                      </span>
                    ))}
                  </div>
                )}
                {showProjectFinance && (
                  <>
                    <input type="text" placeholder="Search employees to add…" value={projTeamQuery} onChange={(e) => setProjTeamQuery(e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                    {(() => {
                      const q = projTeamQuery.trim().toLowerCase();
                      const results = activeEmployees.filter((e) => !selProject.team_ids.includes(e.id) && (!q || e.name.toLowerCase().includes(q))).slice(0, 8);
                      return results.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, border: "1px solid var(--border-subtle)", borderRadius: 8, maxHeight: 170, overflow: "auto" }}>
                          {results.map((r) => (
                            <div key={r.id} onClick={() => toggleProjTeamMember(r.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)" }}>
                              <span style={{ fontSize: 13.5, color: "var(--text-primary)" }}>{r.name}</span>
                              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.role}</span>
                            </div>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </>
                )}
              </div>
              <Input label="Description" multiline rows={3} value={selProject.description} disabled={!isDevOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProjectFieldLive(selProject.id, "description", e.target.value)} />

              <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Attachments</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  {(selProject.attachments || []).map((att, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                      <a href="#" onClick={(e) => { e.preventDefault(); openAttachment(att.url); }} style={{ fontSize: 13, color: "var(--text-link)", textDecoration: "none" }}>{att.filename || att.name}</a>
                      {showProjectFinance && <a href="#" onClick={(e) => { e.preventDefault(); removeProjectAttachment(selProject.id, att.filename || att.name || ""); }} style={{ fontSize: 12.5, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none" }}>Remove</a>}
                    </div>
                  ))}
                </div>
                {showProjectFinance && (
                  <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", cursor: "pointer" }}>
                    Upload attachment
                    <input type="file" onChange={(e) => uploadProjectAttachment(selProject.id, e)} style={{ display: "none" }} />
                  </label>
                )}
              </div>

              <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Subtasks</div>
                  {canAddSubtask && <a href="#" onClick={(e) => { e.preventDefault(); openNewTask(selProject.id, true); }} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>+ Add subtask</a>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selProjectSubtasks.map((st) => (
                    <div key={st.id} onClick={() => openTaskDrawer(st.id)} style={{ textDecoration: "none", color: "inherit", padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: 8, cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500 }}>{st.title}</span>
                        <Badge tone={STATUS_TONE[st.status] || "neutral"}>{st.status}</Badge>
                      </div>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{st.assignee} · due {st.deadline}</span>
                    </div>
                  ))}
                </div>
              </div>

              <CommentsSection
                comments={(projComments[selProject.id] || []).map((c) => ({ ...c, authorName: getEmployeeName(c.author_id), ts: formatActivityTimestamp(c.created_at) }))}
                replyingTo={replyingTo}
                onReply={(c) => startReply(c, getEmployeeName(c.author_id))}
                onCancelReply={() => setReplyingTo(null)}
                draft={projCommentDraft}
                onDraftChange={setProjCommentDraft}
                onPost={() => addProjectComment(selProject.id)}
              />

              <AuditLogSection logs={projAuditLogs[selProject.id] || []} />
            </div>
            {showProjectFinance && (
              <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
                <Button variant="danger" onClick={deleteSelectedProject}>Delete Project</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- New Project drawer ---- */}
      {newProjectOpen && (
        <div className={"crm-overlay-fade" + (newProjectClosing.isClosing ? " orbit-closing" : "")} onClick={closeNewProjectAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (newProjectClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>New Project</h2>
              <button onClick={closeNewProjectAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <Input label="Project name" value={pForm.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPForm((f) => ({ ...f, name: e.target.value }))} />
              <Input label="Client" placeholder="e.g. Internal" value={pForm.client} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPForm((f) => ({ ...f, client: e.target.value }))} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Input label="Deadline" placeholder="e.g. 30 Aug 2026" value={pForm.deadline} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPForm((f) => ({ ...f, deadline: e.target.value }))} />
                  <input type="date" value={toISO(pForm.deadline)} onChange={(e) => setPForm((f) => ({ ...f, deadline: fromISO(e.target.value) }))} style={dateInputStyle} />
                </div>
                <Input label="Budget ($, 0 = internal)" placeholder="0" value={pForm.budget} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPForm((f) => ({ ...f, budget: e.target.value }))} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Team</span>
                {pForm.team_ids.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {pForm.team_ids.map((id) => (
                      <span key={id} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-page)", border: "1px solid var(--border-subtle)", borderRadius: 9999, padding: "4px 6px 4px 12px", fontSize: 13, color: "var(--text-primary)" }}>
                        {getEmployeeName(id)}
                        <a href="#" onClick={(e) => { e.preventDefault(); togglePfTeamMember(id); }} style={{ color: "var(--text-muted)", textDecoration: "none", fontWeight: 700, padding: "0 4px" }}>×</a>
                      </span>
                    ))}
                  </div>
                )}
                <input type="text" placeholder="Search employees to add…" value={pfTeamQuery} onChange={(e) => setPfTeamQuery(e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                {(() => {
                  const q = pfTeamQuery.trim().toLowerCase();
                  const results = activeEmployees.filter((e) => !pForm.team_ids.includes(e.id) && (!q || e.name.toLowerCase().includes(q))).slice(0, 8);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, border: "1px solid var(--border-subtle)", borderRadius: 8, maxHeight: 170, overflow: "auto" }}>
                      {results.map((r) => (
                        <div key={r.id} onClick={() => togglePfTeamMember(r.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{ fontSize: 13.5, color: "var(--text-primary)" }}>{r.name}</span>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.role}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <Input label="Description" multiline rows={3} value={pForm.description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              <Button variant="ghost" onClick={closeNewProjectAnimated}>Cancel</Button>
              <Button variant="primary" onClick={submitNewProject}>Create Project</Button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Task drawer ---- */}
      {selTask && (
        <div className={"crm-overlay-fade" + (taskDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={closeTaskDrawerAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (taskDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Subtask</h2>
              <button onClick={closeTaskDrawerAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14, fontSize: 14 }}>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Project: <b style={{ color: "var(--text-primary)" }}>{selTask.projectName}</b></div>
              <Input label="Title" value={selTask.title} disabled={disabledDetails} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaskFieldLive(selTask.id, "title", e.target.value)} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Select label="Owner" options={devEmployeeOptions} value={selTask.assignee_id || ""} disabled={disabledDetails} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTaskFieldLive(selTask.id, "assignee_id", e.target.value)} />
                <Select label="Status" options={devStatusOptions} value={selTask.status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => changeTaskStatus(selTask.id, e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Start date</span>
                  <input type="date" value={selTask.start_date || ""} disabled={disabledDetails} onChange={(e) => setTaskFieldLive(selTask.id, "start_date", e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Input label="Delivery date" value={selTask.deadline || ""} disabled={disabledDetails} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaskFieldLive(selTask.id, "deadline", e.target.value)} />
                  <input type="date" value={selTask.deadline || ""} disabled={disabledDetails} onChange={(e) => setTaskFieldLive(selTask.id, "deadline", e.target.value)} style={dateInputStyle} />
                </div>
              </div>
              <Input label="Description" multiline rows={3} value={selTask.description} disabled={disabledDetails} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaskFieldLive(selTask.id, "description", e.target.value)} />

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Tags</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" placeholder="e.g. MVP1" value={taskTagInput} onChange={(e) => setTaskTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSelectedTaskTag(); } }} style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
                  <Button variant="secondary" onClick={addSelectedTaskTag}>Add</Button>
                </div>
                {(selTask.tags || []).length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {selTask.tags.map((t) => (
                      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--brand-primary)", background: "var(--brand-primary-light)", borderRadius: 9999, padding: "3px 10px" }}>
                        #{t}
                        <a href="#" onClick={(e) => { e.preventDefault(); removeSelectedTaskTag(t); }} style={{ color: "var(--brand-primary)", textDecoration: "none", fontWeight: 700 }}>×</a>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>No tags yet.</span>
                )}
              </div>

              <CommentsSection
                comments={(taskComments[selTask.id] || []).map((c) => ({ ...c, authorName: getEmployeeName(c.author_id), ts: formatActivityTimestamp(c.created_at) }))}
                replyingTo={replyingTo}
                onReply={(c) => startReply(c, getEmployeeName(c.author_id))}
                onCancelReply={() => setReplyingTo(null)}
                draft={taskCommentDraft}
                onDraftChange={setTaskCommentDraft}
                onPost={() => addTaskComment(selTask.id)}
              />

              <AuditLogSection logs={taskAuditLogs[selTask.id] || []} />
            </div>
            {isOwnerReal && (
              <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
                <Button variant="danger" onClick={deleteSelectedTask}>Delete Subtask</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- New Task drawer ---- */}
      {newTaskOpen && (
        <div className={"crm-overlay-fade" + (newTaskClosing.isClosing ? " orbit-closing" : "")} onClick={closeNewTaskAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (newTaskClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>New Task</h2>
              <button onClick={closeNewTaskAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              {!taskIsSubtask && <Select label="Project" options={allProjects.map((p) => ({ value: p.id, label: p.name }))} value={tForm.projectId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTForm((f) => ({ ...f, projectId: e.target.value, assignee_id: "" }))} />}
              <Select label="Assignee" options={tfProjectMemberOptions} value={tForm.assignee_id} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTForm((f) => ({ ...f, assignee_id: e.target.value }))} />
              <Input label="Title" value={tForm.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTForm((f) => ({ ...f, title: e.target.value }))} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Input label="Delivery date" placeholder="e.g. 15 Jul 2026" value={tForm.deadline} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTForm((f) => ({ ...f, deadline: e.target.value }))} />
                <input type="date" value={toISO(tForm.deadline)} onChange={(e) => { if (e.target.value && e.target.value < todayISO()) { pushToast("Delivery date cannot be in the past.", "error"); return; } setTForm((f) => ({ ...f, deadline: fromISO(e.target.value) })); }} style={dateInputStyle} />
              </div>
              <Input label="Description (Optional)" multiline rows={3} value={tForm.description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTForm((f) => ({ ...f, description: e.target.value }))} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Tags (optional)</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" placeholder="e.g. MVP1" value={tfTagInput} onChange={(e) => setTfTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTfTag(); } }} style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
                  <Button variant="secondary" onClick={addTfTag}>Add</Button>
                </div>
                {tForm.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {tForm.tags.map((t) => (
                      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--brand-primary)", background: "var(--brand-primary-light)", borderRadius: 9999, padding: "3px 10px" }}>
                        #{t}
                        <a href="#" onClick={(e) => { e.preventDefault(); removeTfTag(t); }} style={{ color: "var(--brand-primary)", textDecoration: "none", fontWeight: 700 }}>×</a>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              <Button variant="ghost" onClick={closeNewTaskAnimated}>Cancel</Button>
              <Button variant="primary" onClick={submitNewTask}>Create Task</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentsSection({
  comments, replyingTo, onReply, onCancelReply, draft, onDraftChange, onPost,
}: {
  comments: (Comment & { authorName: string; ts: string })[];
  replyingTo: { id: string; author: string; snippet: string } | null;
  onReply: (c: Comment) => void;
  onCancelReply: () => void;
  draft: string;
  onDraftChange: (v: string) => void;
  onPost: () => void;
}) {
  return (
    <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Comments</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12, maxHeight: 160, overflow: "auto" }}>
        {comments.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 10, fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)", flexShrink: 0, width: 78 }}>{c.ts}</span>
            <span style={{ color: "var(--text-primary)" }}>
              <b>{c.authorName}</b> — {c.text}
              <a href="#" onClick={(e) => { e.preventDefault(); onReply(c); }} style={{ marginLeft: 8, fontSize: 11, color: "var(--text-link)", textDecoration: "none" }}>Reply</a>
            </span>
          </div>
        ))}
      </div>
      {replyingTo && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 8, background: "rgba(99,102,241,0.06)", borderRadius: 6, fontSize: 13, color: "var(--text-secondary)" }}>
          <span style={{ flex: 1 }}>Replying to <b style={{ color: "var(--text-primary)" }}>@{replyingTo.author}</b>: &ldquo;{replyingTo.snippet}&rdquo;</span>
          <button onClick={onCancelReply} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-muted)", padding: "0 4px", lineHeight: 1 }}>&times;</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input type="text" placeholder="Add a comment…" value={draft} onChange={(e) => onDraftChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) onPost(); }} style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
        <Button variant="secondary" onClick={onPost}>Post</Button>
      </div>
    </div>
  );
}

function AuditLogSection({ logs }: { logs: { id: string; user: string; ts: string; action: string; detail: string; hasDetail: boolean }[] }) {
  return (
    <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Audit Log</div>
      {logs.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 160, overflowY: "auto" }}>
          {logs.map((log) => (
            <div key={log.id} style={{ padding: "8px 10px", background: "var(--bg-page)", border: "1px solid var(--border-subtle)", borderRadius: 6, fontSize: 12.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{log.user}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{log.ts}</span>
              </div>
              <div style={{ color: "var(--text-secondary)" }}>
                <b style={{ color: "var(--brand-primary)" }}>{log.action}</b>
                {log.hasDetail && <> — {log.detail}</>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No audit log records yet.</div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
const selectStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer" };
const dateInputStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)" };
