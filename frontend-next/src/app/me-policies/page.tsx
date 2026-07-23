"use client";

// Real backend-backed replacement for the old static-mock Company Policies
// screen. Owner department can publish a policy as typed text or an
// uploaded PDF; every employee can read/view; a RAG assistant answers
// questions grounded in whatever's currently published (re-read fresh from
// the DB on every question — see backend/app/services/policy_service.py).

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { policiesApi, getEmployeeName, PKT_TZ } from "@/lib/orbit-client";
import { Button, Input, Modal } from "@/design-system/healer-bundle";

// Compact element overrides so the assistant's markdown (bold, numbered/
// bulleted lists, the occasional table) fits a narrow chat bubble instead of
// using react-markdown's default block spacing, which is sized for a full
// document rather than a 13.5px chat message.
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p style={{ margin: "0 0 8px" }}>{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol style={{ margin: "0 0 8px", paddingLeft: 18 }}>{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li style={{ marginBottom: 3 }}>{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ overflowX: "auto", marginBottom: 8 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => <th style={{ border: "1px solid var(--border-subtle)", padding: "4px 8px", textAlign: "left" }}>{children}</th>,
  td: ({ children }: { children?: React.ReactNode }) => <td style={{ border: "1px solid var(--border-subtle)", padding: "4px 8px" }}>{children}</td>,
};

type Policy = {
  id: string;
  title: string;
  category: string;
  content?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  created_by_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

type ChatMsg = { role: "user" | "assistant"; text: string };

const MAX_PDF_MB = 15;

function formatUpdated(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: PKT_TZ });
}

export default function MePoliciesPage() {
  const { currentUser } = useAuth();
  const { pushToast } = useToast();
  const isOwnerDept = currentUser?.department === "Owner";

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewPolicy, setViewPolicy] = useState<Policy | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<"text" | "file">("text");
  const [form, setForm] = useState({ title: "", category: "General", content: "" });
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);

  const load = () => {
    setLoading(true);
    policiesApi.list().then(
      (data: Policy[]) => { setPolicies(data || []); setLoading(false); },
      () => { setPolicies([]); setLoading(false); }
    );
  };

  useEffect(() => { load(); }, []);

  const resetAddForm = () => {
    setForm({ title: "", category: "General", content: "" });
    setPendingFile(null);
    setAddMode("text");
  };

  const closeAdd = () => {
    setShowAdd(false);
    // Delayed so the form doesn't visibly blank out while Modal is still
    // playing its own close animation (see design-system/healer-bundle.js).
    setTimeout(resetAddForm, 220);
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) {
      pushToast("Only PDF files are supported for policy documents.", "error");
      e.target.value = "";
      return;
    }
    if (f.size > MAX_PDF_MB * 1024 * 1024) {
      pushToast(`File is too large. Maximum size is ${MAX_PDF_MB}MB.`, "error");
      e.target.value = "";
      return;
    }
    setPendingFile(f);
  };

  const submitAdd = async () => {
    if (!form.title.trim()) { pushToast("Title is required.", "error"); return; }
    if (addMode === "file" && !pendingFile) { pushToast("Choose a PDF to upload.", "error"); return; }
    setSaving(true);
    try {
      const created = await policiesApi.create({
        title: form.title.trim(),
        category: form.category.trim() || "General",
        content: addMode === "text" ? (form.content.trim() || null) : null,
      });
      if (addMode === "file" && pendingFile) {
        await policiesApi.uploadFile(created.id, pendingFile);
      }
      pushToast("Policy published.");
      load();
      closeAdd();
    } catch (err) {
      pushToast((err as Error).message || "Could not save policy.", "error");
    } finally {
      setSaving(false);
    }
  };

  const openPolicyFile = async (p: Policy) => {
    if (!p.file_url) return;
    try {
      // A plain <a href> pointing straight at this API path won't work — the
      // endpoint requires the Bearer token from localStorage, which the
      // browser only attaches to fetch/XHR calls, never a bare anchor
      // navigation. Fetch it as this page (with auth) and open the actual
      // PDF bytes as a blob URL instead — same pattern finance/page.tsx
      // already uses for downloading invoice PDFs.
      const token = localStorage.getItem("orbit_token");
      const res = await fetch(p.file_url, { headers: token ? { Authorization: "Bearer " + token } : {} });
      if (!res.ok) throw new Error("Could not load the PDF.");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      pushToast((err as Error).message || "Could not open the PDF.", "error");
    }
  };

  const removePolicy = (p: Policy) => {
    if (!window.confirm(`Remove "${p.title}"? This cannot be undone.`)) return;
    policiesApi.remove(p.id).then(
      () => {
        pushToast("Policy removed.");
        setViewPolicy((v) => (v?.id === p.id ? null : v));
        load();
      },
      (err: Error) => pushToast(err.message || "Could not remove policy.", "error")
    );
  };

  const askAssistant = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setChat((c) => [...c, { role: "user", text: q }]);
    setQuestion("");
    setAsking(true);
    try {
      const res = await policiesApi.ask(q);
      setChat((c) => [...c, { role: "assistant", text: res.answer }]);
    } catch (err) {
      setChat((c) => [...c, { role: "assistant", text: (err as Error).message || "Sorry, I couldn't get an answer right now." }]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>Company Policies</h1>
        {isOwnerDept && <Button variant="primary" onClick={() => setShowAdd(true)}>Add Policy</Button>}
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <th style={thStyle}>Policy</th>
            <th style={thStyle}>Category</th>
            <th style={thStyle}>Updated</th>
            <th style={thStyle}></th>
          </tr></thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} className="orbit-settings-row" style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }} onClick={() => setViewPolicy(p)}>
                <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{p.title}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" }}>{p.category}</td>
                <td style={{ padding: "14px 16px", fontSize: 14, color: "var(--text-primary)" }}>{formatUpdated(p.updated_at)}</td>
                <td style={{ padding: "14px 16px", textAlign: "right" }}>
                  {isOwnerDept && (
                    <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removePolicy(p); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--status-danger-text)", textDecoration: "none" }}>Remove</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && policies.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
            No company policies published yet{isOwnerDept ? " — use “Add Policy” to publish the first one." : "."}
          </div>
        )}
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>AI Policy Assistant</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>Ask a question about any published company policy.</p>
        </div>

        {chat.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 340, overflowY: "auto", padding: "4px 2px" }}>
            {chat.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                background: m.role === "user" ? "var(--brand-primary)" : "var(--bg-page)",
                color: m.role === "user" ? "#fff" : "var(--text-primary)",
                border: m.role === "assistant" ? "1px solid var(--border-subtle)" : "none",
                borderRadius: 12,
                padding: "10px 14px",
                fontSize: 13.5,
              }}>
                {m.role === "assistant" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{m.text}</ReactMarkdown>
                ) : (
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                )}
              </div>
            ))}
            {asking && (
              <div style={{ alignSelf: "flex-start", color: "var(--text-muted)", fontSize: 13, fontStyle: "italic" }}>Thinking…</div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="e.g. How many paid leave days do I get?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") askAssistant(); }}
            style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", outline: "none" }}
          />
          <Button variant="primary" onClick={askAssistant} disabled={asking || !question.trim()}>Ask</Button>
        </div>
      </div>

      {/* ---- View policy modal ---- */}
      <Modal open={!!viewPolicy} onClose={() => setViewPolicy(null)} title={viewPolicy?.title || "Policy"} width={680}>
        {viewPolicy && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" }}>
              <span>Category: <strong style={{ color: "var(--text-primary)" }}>{viewPolicy.category}</strong></span>
              <span>Updated: <strong style={{ color: "var(--text-primary)" }}>{formatUpdated(viewPolicy.updated_at)}</strong></span>
              {viewPolicy.created_by_id && <span>By: <strong style={{ color: "var(--text-primary)" }}>{getEmployeeName(viewPolicy.created_by_id) || "—"}</strong></span>}
            </div>
            {viewPolicy.content && (
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6, color: "var(--text-primary)", background: "var(--bg-page)", borderRadius: 10, padding: 16, maxHeight: 420, overflowY: "auto" }}>
                {viewPolicy.content}
              </div>
            )}
            {viewPolicy.file_url && (
              <a href="#" onClick={(e) => { e.preventDefault(); openPolicyFile(viewPolicy); }} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>
                📄 Open {viewPolicy.file_name || "PDF document"}
              </a>
            )}
            {!viewPolicy.content && !viewPolicy.file_url && (
              <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>No content has been added to this policy yet.</div>
            )}
          </div>
        )}
      </Modal>

      {/* ---- Add policy modal (Owner department only) ---- */}
      <Modal open={showAdd} onClose={closeAdd} title="Add Policy" width={620}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input label="Title" value={form.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Leave & Time Off Policy" />
          <Input label="Category" value={form.category} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. HR" />

          <div style={{ display: "flex", gap: 8 }}>
            <Button variant={addMode === "text" ? "primary" : "secondary"} onClick={() => setAddMode("text")}>Write text</Button>
            <Button variant={addMode === "file" ? "primary" : "secondary"} onClick={() => setAddMode("file")}>Upload PDF</Button>
          </div>

          {addMode === "text" ? (
            <Input label="Policy content" multiline rows={8} value={form.content} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="Paste or type the full policy text…" />
          ) : (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>PDF document</label>
              <input type="file" accept="application/pdf" onChange={onPickFile} style={{ fontSize: 13.5 }} />
              {pendingFile && <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>Selected: {pendingFile.name}</div>}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 4 }}>
            <Button variant="ghost" onClick={closeAdd}>Cancel</Button>
            <Button variant="primary" onClick={submitAdd} disabled={saving}>{saving ? "Publishing…" : "Publish Policy"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
