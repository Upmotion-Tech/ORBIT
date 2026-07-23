"use client";

// Port of `screenIsCrm` + Lead drawer + Delete confirm + New Lead drawer
// (template.html:2501-2913, script.js CRM logic scattered ~3365-3850,
// 4508-4700, 6500-6650). Faithful to the original data model and mutation
// flow (optimistic update -> debounced PUT -> reapply server copy ->
// refresh activity log -> toast) with everything preserved (filters, sort,
// search-highlight, validation rules, Won-stage attachment gate,
// sequential-stage-transition guard, activity/comments split, file
// upload/remove, customer dedup) — plus real drag-and-drop between Kanban
// columns, in addition to the inline stage <select>, both funneling through
// the same changeLeadStage.

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/app-data-context";
import { useToast } from "@/lib/toast-context";
import { useClosingTransition } from "@/lib/use-closing-transition";
import {
  leadsApi,
  customersApi,
  crmSourcesApi,
  money,
  numVal,
  toISO,
  fromISO,
  toApiDate,
  todayISO,
  addDaysISO,
  isoOnOrAfter,
  matchesSearch,
  leadSearchHaystack,
  highlightSegments,
  sortLeads,
  isStageTransitionAllowed,
  validateUploadFile,
  activityToDisplay,
  CRM_SORT_OPTIONS,
  DATE_RANGE_OPTIONS,
  resolveDateRangePreset,
  inDateRange,
  deepLinkHref,
  isModifiedClick,
  parseDeepLinkHash,
  clearDeepLinkHash,
} from "@/lib/orbit-client";
import { Button, Input, Select, Badge, Icon } from "@/design-system/healer-bundle";

type Lead = {
  id: string; name: string; poc: string; assignedRep: string; source: string; medium: string;
  value: number | null; stage: string; description: string; received: string; expectedClose: string;
  actualClose: string | null; followUp: string | null; followUpOverdue: boolean;
  scopeDoc: boolean; contract: boolean; scopeDocUrl: string | null; contractUrl: string | null;
  scopeDocName?: string; contractName?: string; isLockedRevenue: boolean; createdDateStr: string;
};
type Activity = { ts: string; user: string; text: string; type: string };
type Customer = { id: string; company_name: string };

export default function CrmPage() {
  const { currentUser } = useAuth();
  const { employees, crmStagesList } = useAppData();
  const { pushToast } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [sources, setSources] = useState<string[]>(["Referral", "Website", "LinkedIn", "Cold outreach", "Instagram"]);
  const [view, setView] = useState<"kanban" | "list" | "past">("kanban");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterRep, setFilterRep] = useState("");
  const [dateRangePreset, setDateRangePreset] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("newest");

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activitiesByLead, setActivitiesByLead] = useState<Record<string, Activity[]>>({});
  const [activitiesLoadingId, setActivitiesLoadingId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);

  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string | null>>({});
  const [dupWarning, setDupWarning] = useState(false);
  const [form, setForm] = useState({
    name: "", poc: "", source: "Referral", medium: "", value: "", received: "", expectedClose: "",
    description: "", assignedRep: currentUser?.name || "", customerId: "",
  });

  const leadsById = useRef<Record<string, Lead>>({});
  leadsById.current = useMemo(() => Object.fromEntries(leads.map((l) => [l.id, l])), [leads]);
  const saveTimers = useRef<Record<string, Record<string, ReturnType<typeof setTimeout>>>>({});
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accessLevels = currentUser?.access_levels || [];
  const isCrmOwner = accessLevels.includes("owner") || accessLevels.includes("crm");
  const persona = currentUser?.access_level;
  const allowInlineStatusChange = persona === "owner";
  const isOwnerDept = currentUser?.department === "Owner";

  const loadLeads = () => {
    leadsApi.list().then(
      (data: Lead[]) => setLeads(data),
      () => pushToast("Could not load leads.", "error")
    );
  };
  useEffect(() => {
    loadLeads();
    crmSourcesApi.list().then((data: { name: string }[]) => setSources(data.map((s) => s.name))).catch(() => {});
    customersApi.list().then((data: Customer[]) => setCustomers(data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyLeadFromApi = (apiLead: Lead) => {
    setLeads((cur) => (cur.some((l) => l.id === apiLead.id) ? cur.map((l) => (l.id === apiLead.id ? apiLead : l)) : [apiLead, ...cur]));
  };

  const refreshActivities = (id: string) => {
    setActivitiesLoadingId(id);
    leadsApi
      .listActivities(id)
      .then((items: { created_at: string; created_by: string; note: string; type: string }[]) => {
        setActivitiesByLead((cur) => ({ ...cur, [id]: items.map(activityToDisplay) }));
        setActivitiesLoadingId((cur) => (cur === id ? null : cur));
      })
      .catch(() => setActivitiesLoadingId((cur) => (cur === id ? null : cur)));
  };

  const openLead = (id: string) => {
    setSelectedLeadId(id);
    setFieldErrors({});
    refreshActivities(id);
  };
  const closeLeadModal = () => {
    setSelectedLeadId(null);
    setDeleteConfirmId(null);
    clearDeepLinkHash();
  };
  const leadModalClosing = useClosingTransition();
  const closeLeadModalAnimated = () => leadModalClosing.closeWithTransition(closeLeadModal);
  const deleteConfirmClosing = useClosingTransition();
  const closeDeleteConfirmAnimated = () => deleteConfirmClosing.closeWithTransition(() => setDeleteConfirmId(null));
  const newLeadClosing = useClosingTransition();

  // Middle-click/ctrl-click/right-click "open in new tab" on a lead card or
  // row works off a real #/lead/<id> href (see deepLinkHref) — a plain left
  // click still preventDefaults and opens the drawer in place as before. A
  // fresh tab loading that hash re-runs this same check on mount and opens
  // straight to the right lead.
  useEffect(() => {
    const link = parseDeepLinkHash();
    if (link && link.type === "lead") openLead(link.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleDeepLinkClick = (e: React.MouseEvent, id: string) => {
    if (isModifiedClick(e)) return;
    e.preventDefault();
    openLead(id);
  };

  const isOwnerOrCrm = () => (currentUser?.access_levels || []).some((l) => l === "owner" || l === "crm");

  const setLeadField = (id: string, field: string, val: string | number) => {
    const prevVal = leadsById.current[id] ? (leadsById.current[id] as unknown as Record<string, unknown>)[field] : undefined;
    setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, [field]: val } : l)));
    if (String(prevVal ?? "") === String(val ?? "")) return;
    const FIELD_TO_API: Record<string, string> = {
      name: "company_name", poc: "client_contact_name", assignedRep: "assigned_rep", source: "source",
      medium: "medium", value: "value", description: "description", received: "date_received",
      expectedClose: "expected_closure_date", actualClose: "actual_closure_date", followUp: "follow_up_date",
    };
    const DATE_FIELDS = new Set(["received", "expectedClose", "actualClose", "followUp"]);
    const apiKey = FIELD_TO_API[field];
    if (!apiKey) return;
    const patch: Record<string, unknown> = { [apiKey]: DATE_FIELDS.has(field) ? toApiDate(String(val)) : val };
    saveTimers.current[id] = saveTimers.current[id] || {};
    clearTimeout(saveTimers.current[id][field]);
    setEditSaving(true);
    saveTimers.current[id][field] = setTimeout(() => {
      leadsApi.update(id, patch).then(
        (res: { data?: Lead; warning?: string }) => {
          setEditSaving(false);
          if (res?.data) applyLeadFromApi(res.data);
          refreshActivities(id);
          pushToast(res?.warning || "Changes auto-saved.");
        },
        (err: Error) => {
          setEditSaving(false);
          pushToast(err.message || "Could not save that change.", "error");
          loadLeads();
        }
      );
    }, 500);
  };

  const setLeadFieldWithDateValidation = (id: string, field: string, iso: string, baseIso: string, displayVal: string) => {
    if (iso && baseIso && !isoOnOrAfter(iso, baseIso)) {
      setFieldErrors((cur) => ({ ...cur, [field]: "Cannot be before date received." }));
      pushToast("Validation failed: " + field + " cannot be before date received.", "warning");
      return;
    }
    setFieldErrors((cur) => ({ ...cur, [field]: null }));
    setLeadField(id, field, displayVal);
  };

  const changeLeadStage = (id: string, newStage: string) => {
    const lead = leadsById.current[id];
    if (!lead || lead.stage === newStage) return;
    if (newStage === "Won" && !(lead.scopeDoc && lead.contract)) {
      pushToast("Upload the scope document and signed contract before marking this lead Won.", "warning");
      return;
    }
    if (!isStageTransitionAllowed(crmStagesList, lead.stage, newStage, isOwnerOrCrm() && persona === "owner")) {
      pushToast("Cannot skip stages — move this lead through the pipeline in order, or ask an Owner to override.", "warning");
      return;
    }
    setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, stage: newStage } : l)));
    leadsApi.setStage(id, newStage).then(
      (res: { data?: Lead }) => {
        if (res?.data) applyLeadFromApi(res.data);
        refreshActivities(id);
        pushToast("Stage updated successfully.");
      },
      (err: Error) => {
        pushToast(err.message || "Could not update the stage.", "error");
        loadLeads();
      }
    );
  };

  // Drag-and-drop between Kanban columns — a nicer alternative to the inline
  // stage <select> for anyone who could already use it (allowInlineStatusChange
  // gates draggable below exactly like it already gates the dropdown); the
  // drop itself just calls the same changeLeadStage used by the dropdown, so
  // every existing rule (Won-stage attachment gate, sequential-stage guard)
  // still applies — dragging out of order just snaps back with the same
  // warning toast instead of moving the card.
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const onLeadDragStart = (e: React.DragEvent, id: string) => {
    setDraggedLeadId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const onLeadDragEnd = () => {
    setDraggedLeadId(null);
    setDragOverStage(null);
  };
  const onStageDragOver = (e: React.DragEvent, stageTitle: string) => {
    if (!draggedLeadId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stageTitle) setDragOverStage(stageTitle);
  };
  const onStageDrop = (e: React.DragEvent, stageTitle: string) => {
    e.preventDefault();
    // draggedLeadId (React state, set directly from the dragged card's own
    // closure) is the reliable source of truth here — dataTransfer was
    // preferred before, but a dragged <a href> can carry the browser's own
    // default link-drag payload (the resolved URL) in the same "text/plain"
    // slot, and that was winning over our real id whenever it was present,
    // which is what caused a drop to occasionally act on the wrong lead.
    const id = draggedLeadId || e.dataTransfer.getData("text/plain");
    setDraggedLeadId(null);
    setDragOverStage(null);
    if (id) changeLeadStage(id, stageTitle);
  };

  const uploadFile = (id: string, e: React.ChangeEvent<HTMLInputElement>, kind: "scope" | "contract") => {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validateUploadFile(f);
    if (err) {
      pushToast(err, "error");
      e.target.value = "";
      return;
    }
    setEditSaving(true);
    const call = kind === "scope" ? leadsApi.uploadScopeDoc(id, f) : leadsApi.uploadContract(id, f);
    call.then(
      (res: { data?: Lead }) => {
        setEditSaving(false);
        if (res?.data) applyLeadFromApi(res.data);
        refreshActivities(id);
        pushToast("File uploaded successfully.");
      },
      (err2: Error) => {
        setEditSaving(false);
        pushToast(err2.message || "Upload failed.", "error");
      }
    );
    e.target.value = "";
  };
  const removeFile = (id: string, kind: "scope" | "contract") => {
    setEditSaving(true);
    const call = kind === "scope" ? leadsApi.removeScopeDoc(id) : leadsApi.removeContract(id);
    call.then(
      (res: { data?: Lead }) => {
        setEditSaving(false);
        if (res?.data) applyLeadFromApi(res.data);
        refreshActivities(id);
        pushToast((kind === "scope" ? "Scope document" : "Signed contract") + " removed successfully.");
      },
      (err: Error) => {
        setEditSaving(false);
        pushToast(err.message || "Could not remove the file.", "error");
      }
    );
  };

  const openLeadFile = async (url: string) => {
    // Scope docs/signed contracts are now served from the DB behind an
    // authenticated endpoint (Render's disk is ephemeral — see
    // backend/app/services/policy_service.py for the same fix applied to
    // policy PDFs first), so a plain <a href> with no auth header would just
    // 401. Fetch with the token and open the bytes as a blob instead.
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

  const askDeleteLead = (id: string) => setDeleteConfirmId(id);
  const confirmDeleteLead = () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    leadsApi.remove(id).then(
      () => {
        setLeads((cur) => cur.filter((l) => l.id !== id));
        setDeleteConfirmId(null);
        setSelectedLeadId((cur) => (cur === id ? null : cur));
        pushToast("Lead deleted successfully.");
      },
      (err: Error) => {
        setDeleteConfirmId(null);
        pushToast(err.message || "Could not delete this lead.", "error");
      }
    );
  };

  const postComment = (id: string) => {
    const text = commentDraft.trim();
    if (!text || commentPosting) return;
    setCommentPosting(true);
    leadsApi.addComment(id, text).then(
      () => {
        setCommentDraft("");
        setCommentPosting(false);
        refreshActivities(id);
      },
      (err: Error) => {
        setCommentPosting(false);
        pushToast(err.message || "Could not post the comment.", "error");
      }
    );
  };

  // ---- Filtering / sorting ----
  const onSearchChange = (v: string) => {
    setSearch(v);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => setDebouncedSearch(v), 200);
  };
  const crmDateRange = resolveDateRangePreset(dateRangePreset === "custom" ? "custom" : dateRangePreset, dateFrom, dateTo);
  const filtersActive = !!(search || filterSource || filterStage || filterRep || dateRangePreset);
  // Won/Lost leads drop out of the Kanban/List pipeline view once closed —
  // they stay in the DB and reappear here the moment a date filter is
  // active (or the Stage filter is explicitly set to Won/Lost), matching
  // "still filterable for the period it was open." Full history for any
  // time regardless of filters lives in the separate Past Leads view below.
  const showTerminalStages = !!dateRangePreset || filterStage === "Won" || filterStage === "Lost";
  const filteredUnsorted = leads.filter((l) => {
    if (!showTerminalStages && (l.stage === "Won" || l.stage === "Lost")) return false;
    if (debouncedSearch && !matchesSearch(leadSearchHaystack(l), debouncedSearch)) return false;
    if (filterSource && l.source !== filterSource) return false;
    if (filterStage && l.stage !== filterStage) return false;
    if (filterRep && l.assignedRep !== filterRep) return false;
    if (!inDateRange(toISO(l.received), crmDateRange)) return false;
    return true;
  });
  // Past Leads (Owner department only): the full Won/Lost archive, unaffected
  // by the pipeline filters above — always browsable regardless of when the
  // lead closed.
  const pastLeads = leads
    .filter((l) => l.stage === "Won" || l.stage === "Lost")
    .filter((l) => !debouncedSearch || matchesSearch(leadSearchHaystack(l), debouncedSearch))
    .sort((a, b) => (toISO(b.actualClose || b.received) || "").localeCompare(toISO(a.actualClose || a.received) || ""));
  const tomorrowIso = addDaysISO(todayISO(), 1);
  const filteredLeads = (sortLeads(filteredUnsorted, sort) as Lead[]).map((l) => {
    const followUpISO = toISO(l.followUp || "");
    const followUpDueSoon = !l.followUpOverdue && !!followUpISO && followUpISO <= tomorrowIso && l.stage !== "Won" && l.stage !== "Lost";
    return {
      ...l,
      nameSegments: highlightSegments(l.name, debouncedSearch),
      followUpDueSoon,
      followUpDueSoonLabel: followUpISO === todayISO() ? "Follow-up due today" : "Follow-up due tomorrow",
    };
  });

  const stageBadgeTone = (stage: string) => (stage === "Won" ? "success" : stage === "Lost" ? "danger" : "info");
  const stageOptions = crmStagesList.map((s) => ({ value: s, label: s }));
  const repOptions = Array.from(new Set(employees.map((e) => e.name).concat(leads.map((l) => l.assignedRep))))
    .filter(Boolean)
    .sort()
    .map((r) => ({ value: r, label: r }));

  const crmStages = crmStagesList.map((stage) => ({
    title: stage,
    leads: filteredLeads.filter((l) => l.stage === stage),
  }));

  const selectedLead = selectedLeadId ? leadsById.current[selectedLeadId] : null;
  const activities = selectedLeadId ? activitiesByLead[selectedLeadId] || [] : [];
  const activityLog = activities.filter((a) => a.type !== "comment");
  const comments = activities.filter((a) => a.type === "comment");
  const baseIsoForSel = selectedLead ? toISO(selectedLead.received) : "";

  // ---- New Lead form ----
  const openNewLead = () => {
    setDupWarning(false);
    setFormErrors({});
    setCustomerQuery("");
    setForm({ name: "", poc: "", source: "Referral", medium: "", value: "", received: "", expectedClose: "", description: "", assignedRep: currentUser?.name || "", customerId: "" });
    setNewLeadOpen(true);
  };
  const closeNewLead = () => {
    if (!creatingLead) setNewLeadOpen(false);
  };
  const closeNewLeadAnimated = () => newLeadClosing.closeWithTransition(closeNewLead);
  const setCrmField = (field: string, val: string) => {
    if (field === "name") {
      const dup = leads.some((l) => l.name.trim().toLowerCase() === val.trim().toLowerCase());
      setDupWarning(dup);
    }
    setForm((f) => ({ ...f, [field]: val }));
    setFormErrors((cur) => ({ ...cur, [field]: null }));
  };
  const customerResults = customerQuery.trim()
    ? customers.filter((c) => c.company_name.toLowerCase().includes(customerQuery.trim().toLowerCase())).slice(0, 8)
    : [];
  const selectedCustomer = form.customerId ? customers.find((c) => c.id === form.customerId) : null;

  const validateNewLeadForm = (f: typeof form) => {
    const errors: Record<string, string> = {};
    if (!f.name.trim()) errors.name = "Company name is required.";
    if (!f.poc.trim()) errors.poc = "Client contact is required.";
    if (!f.assignedRep.trim()) errors.assignedRep = "Assigned rep is required.";
    if (!f.source.trim()) errors.source = "Source is required.";
    if (f.value !== "" && numVal(f.value) < 0) errors.value = "Value cannot be negative.";
    const receivedISO = toISO(f.received);
    if (f.received && !receivedISO) errors.received = "Enter a valid date.";
    if (f.expectedClose) {
      const expISO = toISO(f.expectedClose);
      if (!expISO) errors.expectedClose = "Enter a valid date.";
      else if (receivedISO && !isoOnOrAfter(expISO, receivedISO)) errors.expectedClose = "Cannot be before date received.";
    }
    return errors;
  };
  const submitNewLead = () => {
    if (creatingLead) return;
    const errors = validateNewLeadForm(form);
    if (Object.values(errors).some(Boolean)) {
      setFormErrors(errors);
      pushToast("Validation failed. Check the highlighted fields.", "warning");
      return;
    }
    const payload = {
      company_name: form.name.trim(),
      client_contact_name: form.poc.trim(),
      customer_id: form.customerId || null,
      assigned_rep: form.assignedRep || currentUser?.name,
      source: form.source,
      medium: form.medium || null,
      value: numVal(form.value),
      stage: "New",
      description: form.description || null,
      date_received: toApiDate(form.received) || null,
      expected_closure_date: toApiDate(form.expectedClose) || null,
    };
    setCreatingLead(true);
    leadsApi.create(payload).then(
      (res: { warning?: string }) => {
        setCreatingLead(false);
        setNewLeadOpen(false);
        loadLeads();
        pushToast(res?.warning || "Lead created successfully.");
      },
      (err: Error) => {
        setCreatingLead(false);
        pushToast(err.message || "Could not create the lead.", "error");
      }
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>Lead Pipeline</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", background: "var(--bg-page)", borderRadius: 9999, padding: 3, gap: 2 }}>
            <button onClick={() => setView("kanban")} style={{ border: "none", borderRadius: 9999, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: view === "kanban" ? "#fff" : "transparent", color: view === "kanban" ? "var(--brand-primary)" : "var(--text-secondary)" }}>Kanban</button>
            <button onClick={() => setView("list")} style={{ border: "none", borderRadius: 9999, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: view === "list" ? "#fff" : "transparent", color: view === "list" ? "var(--brand-primary)" : "var(--text-secondary)" }}>List</button>
            {isOwnerDept && (
              <button onClick={() => setView("past")} style={{ border: "none", borderRadius: 9999, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, background: view === "past" ? "#fff" : "transparent", color: view === "past" ? "var(--brand-primary)" : "var(--text-secondary)" }}>Past Leads</button>
            )}
          </div>
          {isCrmOwner && <Button variant="primary" icon="plus" onClick={openNewLead}>New Lead</Button>}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "var(--bg-page)", borderRadius: 12, padding: "12px 16px" }}>
        <input type="text" placeholder="Search company or contact…" value={search} onChange={(e) => onSearchChange(e.target.value)} style={{ flex: 1, minWidth: 180, fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", outline: "none", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} style={selectStyle}>
          <option value="">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} style={selectStyle}>
          <option value="">All stages</option>
          {stageOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterRep} onChange={(e) => setFilterRep(e.target.value)} style={selectStyle}>
          <option value="">All reps</option>
          {repOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={dateRangePreset} onChange={(e) => setDateRangePreset(e.target.value)} aria-label="Filter by date received" style={selectStyle}>
          {DATE_RANGE_OPTIONS.map((o: { value: string; label: string }) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {dateRangePreset === "custom" && (
          <>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" style={dateInputStyle} />
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>to</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" style={dateInputStyle} />
          </>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort leads" style={selectStyle}>
          {CRM_SORT_OPTIONS.map((o: { value: string; label: string }) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {filtersActive && (
          <a href="#" onClick={(e) => { e.preventDefault(); setSearch(""); setDebouncedSearch(""); setFilterSource(""); setFilterStage(""); setFilterRep(""); setDateRangePreset(""); setDateFrom(""); setDateTo(""); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", textDecoration: "none", whiteSpace: "nowrap" }}>Clear filters</a>
        )}
      </div>

      {view === "kanban" && (
        <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
          {crmStages.map((stage) => (
            <div
              key={stage.title}
              onDragOver={(e) => onStageDragOver(e, stage.title)}
              onDragLeave={() => setDragOverStage((cur) => (cur === stage.title ? null : cur))}
              onDrop={(e) => onStageDrop(e, stage.title)}
              style={{
                width: 264, flexShrink: 0, borderRadius: 12, padding: 12,
                background: dragOverStage === stage.title ? "var(--brand-primary-light)" : "var(--bg-page)",
                outline: dragOverStage === stage.title ? "2px dashed var(--brand-primary)" : "2px dashed transparent",
                outlineOffset: -2,
                transition: "background 0.15s ease, outline-color 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 12px" }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" }}>{stage.title}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 9999, padding: "1px 8px" }}>{stage.leads.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 40 }}>
                {stage.leads.map((lead) => (
                  <a
                    key={lead.id}
                    className="crm-card"
                    href={deepLinkHref("lead", lead.id)}
                    onClick={(e) => handleDeepLinkClick(e, lead.id)}
                    draggable={allowInlineStatusChange}
                    onDragStart={(e) => onLeadDragStart(e, lead.id)}
                    onDragEnd={onLeadDragEnd}
                    style={{
                      display: "block", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14,
                      cursor: allowInlineStatusChange ? "grab" : "pointer", textDecoration: "none", color: "inherit",
                      opacity: draggedLeadId === lead.id ? 0.4 : 1,
                      transform: draggedLeadId === lead.id ? "scale(0.97)" : "scale(1)",
                      transition: "opacity 0.15s ease, transform 0.15s ease",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>
                      {lead.nameSegments.map((seg, i) => (seg.hl ? <mark key={i} style={{ background: "var(--status-warning-bg)", color: "inherit", borderRadius: 2, padding: "0 1px" }}>{seg.text}</mark> : <span key={i}>{seg.text}</span>))}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>{lead.poc}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 2 }}>Rep: {lead.assignedRep}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>Started: {lead.createdDateStr}</div>
                    {lead.followUpOverdue && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--status-danger-text)", marginBottom: 8 }}>Follow-up overdue</div>}
                    {lead.followUpDueSoon && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--status-warning-text)", marginBottom: 8 }}>{lead.followUpDueSoonLabel}</div>}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{lead.value != null ? money(lead.value) : "—"}</span>
                      <Badge tone="info">{lead.source}</Badge>
                    </div>
                    {allowInlineStatusChange ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <select value={lead.stage} onChange={(e) => changeLeadStage(lead.id, e.target.value)} style={{ width: "100%", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" }}>
                          {stageOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    ) : (
                      <Badge tone={stageBadgeTone(lead.stage)}>{lead.stage}</Badge>
                    )}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(view === "kanban" || view === "list") && filteredLeads.length === 0 && (
        <div style={{ background: "var(--bg-page)", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
          {filtersActive ? "No leads match your search and filters. Try adjusting or resetting them." : 'No leads yet. Click "New Lead" to add your first one.'}
        </div>
      )}

      {view === "list" && filteredLeads.length > 0 && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th style={thStyle}>Company</th><th style={thStyle}>POC</th><th style={thStyle}>Lead POC (rep)</th>
                <th style={thStyle}>Source</th><th style={thStyle}>Value</th><th style={thStyle}>Stage</th>
                <th style={thStyle}>Started</th><th style={thStyle}>Expected close</th><th></th>
              </tr></thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} onClick={() => openLead(lead.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>
                      {lead.nameSegments.map((seg, i) => (seg.hl ? <mark key={i} style={{ background: "var(--status-warning-bg)", color: "inherit", borderRadius: 2, padding: "0 1px" }}>{seg.text}</mark> : <span key={i}>{seg.text}</span>))}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{lead.poc}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{lead.assignedRep}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{lead.source}</td>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{lead.value != null ? money(lead.value) : "—"}</td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      {isCrmOwner ? (
                        <select value={lead.stage} onChange={(e) => changeLeadStage(lead.id, e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)", cursor: "pointer" }}>
                          {stageOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <Badge tone={stageBadgeTone(lead.stage)}>{lead.stage}</Badge>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{lead.createdDateStr}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{lead.expectedClose}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      <a href={deepLinkHref("lead", lead.id)} onClick={(e) => handleDeepLinkClick(e, lead.id)} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>View</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "past" && isOwnerDept && (
        pastLeads.length === 0 ? (
          <div style={{ background: "var(--bg-page)", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No Won or Lost leads yet.</div>
        ) : (
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <th style={thStyle}>Company</th><th style={thStyle}>POC</th><th style={thStyle}>Rep</th>
                  <th style={thStyle}>Value</th><th style={thStyle}>Stage</th><th style={thStyle}>Closed</th><th></th>
                </tr></thead>
                <tbody>
                  {pastLeads.map((lead) => (
                    <tr key={lead.id} onClick={() => openLead(lead.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                      <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>{lead.name}</td>
                      <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{lead.poc}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{lead.assignedRep}</td>
                      <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{lead.value != null ? money(lead.value) : "—"}</td>
                      <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}><Badge tone={stageBadgeTone(lead.stage)}>{lead.stage}</Badge></td>
                      <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{lead.actualClose || "—"}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                        <a href={deepLinkHref("lead", lead.id)} onClick={(e) => handleDeepLinkClick(e, lead.id)} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>View</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ---- Lead Edit drawer ---- */}
      {selectedLead && (
        <div className={"crm-overlay-fade" + (leadModalClosing.isClosing ? " orbit-closing" : "")} onClick={closeLeadModalAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (leadModalClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Edit Lead</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {editSaving && <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Saving…</span>}
                <button onClick={closeLeadModalAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14, fontSize: 14 }}>
              <Input label="Company name" value={selectedLead.name} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadField(selectedLead.id, "name", e.target.value)} />
              <Input label="Point of contact (client)" value={selectedLead.poc} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadField(selectedLead.id, "poc", e.target.value)} />
              <Select label="Lead POC (our rep working this lead)" options={repOptions} value={selectedLead.assignedRep} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLeadField(selectedLead.id, "assignedRep", e.target.value)} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Select label="Source" options={sources.map((s) => ({ value: s, label: s }))} value={selectedLead.source} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLeadField(selectedLead.id, "source", e.target.value)} />
                <Input label="Medium" value={selectedLead.medium} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadField(selectedLead.id, "medium", e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Input label="Value ($)" value={selectedLead.value ?? ""} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadField(selectedLead.id, "value", Math.max(0, numVal(e.target.value)))} />
                <Select label="Stage" options={stageOptions} value={selectedLead.stage} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => changeLeadStage(selectedLead.id, e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Input label="Date received" value={selectedLead.received} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadField(selectedLead.id, "received", e.target.value)} />
                  <input type="date" value={toISO(selectedLead.received)} disabled={!isCrmOwner} onChange={(e) => setLeadField(selectedLead.id, "received", fromISO(e.target.value))} style={dateInputStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Input label="Expected closure" value={selectedLead.expectedClose} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadFieldWithDateValidation(selectedLead.id, "expectedClose", toISO(e.target.value), baseIsoForSel, e.target.value)} />
                  <input type="date" value={toISO(selectedLead.expectedClose)} disabled={!isCrmOwner} onChange={(e) => setLeadFieldWithDateValidation(selectedLead.id, "expectedClose", e.target.value, baseIsoForSel, fromISO(e.target.value))} style={dateInputStyle} />
                  {fieldErrors.expectedClose && <span style={{ fontSize: 11.5, color: "var(--status-danger-text)" }}>{fieldErrors.expectedClose}</span>}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Input label="Actual closure" placeholder="Not yet closed" value={selectedLead.actualClose || ""} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadFieldWithDateValidation(selectedLead.id, "actualClose", toISO(e.target.value), baseIsoForSel, e.target.value)} />
                  <input type="date" value={toISO(selectedLead.actualClose || "")} disabled={!isCrmOwner} onChange={(e) => setLeadFieldWithDateValidation(selectedLead.id, "actualClose", e.target.value, baseIsoForSel, fromISO(e.target.value))} style={dateInputStyle} />
                  {fieldErrors.actualClose && <span style={{ fontSize: 11.5, color: "var(--status-danger-text)" }}>{fieldErrors.actualClose}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Input label="Follow-up date" placeholder="None set" value={selectedLead.followUp || ""} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadFieldWithDateValidation(selectedLead.id, "followUp", toISO(e.target.value), baseIsoForSel, e.target.value)} />
                  <input type="date" value={toISO(selectedLead.followUp || "")} disabled={!isCrmOwner} onChange={(e) => setLeadFieldWithDateValidation(selectedLead.id, "followUp", e.target.value, baseIsoForSel, fromISO(e.target.value))} style={dateInputStyle} />
                  {fieldErrors.followUp && <span style={{ fontSize: 11.5, color: "var(--status-danger-text)" }}>{fieldErrors.followUp}</span>}
                </div>
              </div>
              <Input label="Description" multiline rows={3} value={selectedLead.description} disabled={!isCrmOwner} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadField(selectedLead.id, "description", e.target.value)} />

              <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                  Won-lead attachments{selectedLead.stage === "Won" && <span style={{ color: "var(--status-danger-text)" }}> · required</span>}
                </div>
                {(["scope", "contract"] as const).map((kind) => {
                  const has = kind === "scope" ? selectedLead.scopeDoc : selectedLead.contract;
                  const url = kind === "scope" ? selectedLead.scopeDocUrl : selectedLead.contractUrl;
                  const name = kind === "scope" ? selectedLead.scopeDocName : selectedLead.contractName;
                  const label = kind === "scope" ? "Scope document" : "Signed contract";
                  return (
                    <div key={kind} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: kind === "scope" ? 10 : 0 }}>
                      <div>
                        <div style={{ fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500, marginBottom: 2 }}>{label}</div>
                        {has ? (
                          <a href="#" onClick={(e) => { e.preventDefault(); if (url) openLeadFile(url); }} style={{ textDecoration: "none" }}>
                            <Badge tone="success">{"Attached: " + (name || (kind === "scope" ? "scope-document.pdf" : "signed-contract.pdf"))}</Badge>
                          </a>
                        ) : (
                          <Badge tone="neutral">Not attached</Badge>
                        )}
                      </div>
                      {isCrmOwner && (
                        <div style={{ display: "flex", alignItems: "center" }}>
                          {has && <a href="#" onClick={(e) => { e.preventDefault(); removeFile(selectedLead.id, kind); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none", marginRight: 14 }}>Remove</a>}
                          <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-link)", cursor: "pointer" }}>
                            {has ? "Replace" : "Upload"}
                            <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => uploadFile(selectedLead.id, e, kind)} style={{ display: "none" }} />
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10 }}>
                  {selectedLead.stage !== "Won" ? "Attachments apply once a lead is marked Won." : (selectedLead.scopeDoc && selectedLead.contract ? "Both documents attached — counted in locked revenue." : "Not yet counted in locked revenue until both documents are attached.")} Accepted: PDF, DOC, DOCX, images — up to 10MB.
                </div>
              </div>

              <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Activity log</div>
                {activitiesLoadingId === selectedLead.id && <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Loading…</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 140, overflow: "auto" }}>
                  {activityLog.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)", flexShrink: 0, width: 78 }}>{a.ts}</span>
                      <span style={{ color: "var(--text-primary)" }}><b>{a.user}</b> — {a.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Comments</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12, maxHeight: 160, overflow: "auto" }}>
                  {comments.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)", flexShrink: 0, width: 78 }}>{c.ts}</span>
                      <span style={{ color: "var(--text-primary)" }}><b>{c.user}</b> — {c.text}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" placeholder="Add a comment…" value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && commentDraft.trim()) postComment(selectedLead.id); }} style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                  <Button variant="secondary" disabled={commentPosting} onClick={() => postComment(selectedLead.id)}>Post</Button>
                </div>
              </div>
            </div>
            {isCrmOwner && (
              <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
                <Button variant="danger" onClick={() => askDeleteLead(selectedLead.id)}>Delete Lead</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Delete confirm ---- */}
      {deleteConfirmId && (
        <div className={"crm-overlay-fade" + (deleteConfirmClosing.isClosing ? " orbit-closing" : "")} onClick={closeDeleteConfirmAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className={"crm-pop" + (deleteConfirmClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 380, maxWidth: "90vw", background: "var(--bg-surface)", borderRadius: 12, boxShadow: "var(--shadow-popover)", padding: 24 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>Delete Lead?</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "var(--text-secondary)" }}>This action can be restored later.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="ghost" onClick={closeDeleteConfirmAnimated}>Cancel</Button>
              <Button variant="danger" onClick={confirmDeleteLead}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {/* ---- New Lead drawer ---- */}
      {newLeadOpen && (
        <div className={"crm-overlay-fade" + (newLeadClosing.isClosing ? " orbit-closing" : "")} onClick={closeNewLeadAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (newLeadClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>New Lead</h2>
              <button onClick={closeNewLeadAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              {dupWarning && <div style={{ background: "var(--status-warning-bg)", color: "var(--status-warning-text)", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>Possible duplicate — a lead with this company name already exists. You can still create it.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Customer</span>
                {selectedCustomer ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-page)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px" }}>
                    <span style={{ fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500 }}>{selectedCustomer.company_name}</span>
                    <a href="#" onClick={(e) => { e.preventDefault(); setForm((f) => ({ ...f, customerId: "" })); }} style={{ fontSize: 12.5, color: "var(--text-link)", textDecoration: "none" }}>Change</a>
                  </div>
                ) : (
                  <>
                    <input type="text" placeholder="Search existing customers, or leave blank to create a new one…" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }} />
                    {customerResults.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, border: "1px solid var(--border-subtle)", borderRadius: 8, maxHeight: 150, overflow: "auto" }}>
                        {customerResults.map((cc) => (
                          <div key={cc.id} onClick={() => { setForm((f) => ({ ...f, customerId: cc.id, name: cc.company_name })); setCustomerQuery(""); setFormErrors((cur) => ({ ...cur, name: null })); }} style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)", fontSize: 13.5, color: "var(--text-primary)" }}>{cc.company_name}</div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Input label="Company name *" value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCrmField("name", e.target.value)} />
                {formErrors.name && <span style={{ fontSize: 11.5, color: "var(--status-danger-text)" }}>{formErrors.name}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Input label="Point of contact (client) *" value={form.poc} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCrmField("poc", e.target.value)} />
                {formErrors.poc && <span style={{ fontSize: 11.5, color: "var(--status-danger-text)" }}>{formErrors.poc}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Select label="Lead POC (our rep working this lead) *" options={repOptions} value={form.assignedRep} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCrmField("assignedRep", e.target.value)} />
                {formErrors.assignedRep && <span style={{ fontSize: 11.5, color: "var(--status-danger-text)" }}>{formErrors.assignedRep}</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Select label="Source *" options={sources.map((s) => ({ value: s, label: s }))} value={form.source} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCrmField("source", e.target.value)} />
                <Input label="Medium" placeholder="e.g. Contact form" value={form.medium} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCrmField("medium", e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <Input label="Value ($)" placeholder="0" value={form.value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCrmField("value", e.target.value)} />
                  {formErrors.value && <span style={{ fontSize: 11.5, color: "var(--status-danger-text)" }}>{formErrors.value}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Input label="Date received" placeholder="e.g. 3 Jul 2026" value={form.received} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCrmField("received", e.target.value)} />
                  <input type="date" value={toISO(form.received)} onChange={(e) => setCrmField("received", fromISO(e.target.value))} style={dateInputStyle} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Input label="Expected closure date" placeholder="e.g. 30 Aug 2026" value={form.expectedClose} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCrmField("expectedClose", e.target.value)} />
                <input type="date" value={toISO(form.expectedClose)} onChange={(e) => setCrmField("expectedClose", fromISO(e.target.value))} style={dateInputStyle} />
                {formErrors.expectedClose && <span style={{ fontSize: 11.5, color: "var(--status-danger-text)" }}>{formErrors.expectedClose}</span>}
              </div>
              <Input label="Description" multiline rows={3} value={form.description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCrmField("description", e.target.value)} />
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              <Button variant="ghost" disabled={creatingLead} onClick={closeNewLeadAnimated}>Cancel</Button>
              <Button variant="primary" disabled={creatingLead} onClick={submitNewLead}>{creatingLead ? "Creating…" : "Create Lead"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
const selectStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer" };
const dateInputStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-primary)" };
