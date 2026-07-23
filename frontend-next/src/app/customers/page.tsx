"use client";

// Port of `screenIsCustomers` + New Customer modal + Customer drawer
// (template.html:2915-3011, script.js handlers at 1782-1826, computed rows
// at 4696-4726).

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { customersApi, deepLinkHref, isModifiedClick, parseDeepLinkHash, clearDeepLinkHash } from "@/lib/orbit-client";
import { useClosingTransition } from "@/lib/use-closing-transition";
import { Button, Input, Icon } from "@/design-system/healer-bundle";

type Customer = {
  id: string; company_name: string; primary_contact_name?: string | null; primary_contact_email?: string | null;
  primary_contact_phone?: string | null; industry?: string | null; website?: string | null; address?: string | null;
  notes?: string | null; lead_count: number;
};

export default function CustomersPage() {
  const { currentUser } = useAuth();
  const { pushToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const newCustomerClosing = useClosingTransition();
  const closeNewCustomerAnimated = () => newCustomerClosing.closeWithTransition(() => setNewOpen(false));
  const [form, setForm] = useState({ company_name: "", primary_contact_name: "", primary_contact_email: "", primary_contact_phone: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const accessLevels = currentUser?.access_levels || [];
  const isCustomersEditor = accessLevels.includes("owner") || accessLevels.includes("customers");

  const load = () => { customersApi.list().then((data: Customer[]) => setCustomers(data)).catch(() => {}); };
  useEffect(load, []);

  const closeCustomerDrawer = () => {
    setSelectedId(null);
    clearDeepLinkHash();
  };
  const customerDrawerClosing = useClosingTransition();
  const closeCustomerDrawerAnimated = () => customerDrawerClosing.closeWithTransition(closeCustomerDrawer);
  // Middle-click/ctrl-click/right-click "open in new tab" works off a real
  // #/customer/<id> href (see deepLinkHref); a plain left click still
  // preventDefaults and opens the drawer in place. A fresh tab loading that
  // hash re-runs this same check on mount and opens straight to the customer.
  useEffect(() => {
    const link = parseDeepLinkHash();
    if (link && link.type === "customer") setSelectedId(link.id);
  }, []);
  const handleDeepLinkClick = (e: React.MouseEvent, id: string) => {
    if (isModifiedClick(e)) return;
    e.preventDefault();
    setSelectedId(id);
  };

  const searchLc = search.trim().toLowerCase();
  const rows = customers.filter(
    (c) =>
      !searchLc ||
      c.company_name.toLowerCase().includes(searchLc) ||
      (c.primary_contact_name || "").toLowerCase().includes(searchLc) ||
      (c.primary_contact_email || "").toLowerCase().includes(searchLc)
  );

  const selected = selectedId ? customers.find((c) => c.id === selectedId) || null : null;

  const setFieldLive = (id: string, field: string, val: string) => {
    setCustomers((cur) => cur.map((c) => (c.id === id ? { ...c, [field]: val } : c)));
    customersApi.update(id, { [field]: val }).then(
      () => pushToast("Customer updated."),
      (err: Error) => pushToast(err.message || "Could not save change.", "error")
    );
  };

  const submitNewCustomer = () => {
    if (!form.company_name.trim()) {
      pushToast("Company name is required.", "error");
      return;
    }
    customersApi.create(form).then(
      () => {
        setNewOpen(false);
        pushToast("Customer added successfully.");
        load();
      },
      (err: Error) => pushToast(err.message || "Could not add customer.", "error")
    );
  };

  const deleteSelectedCustomer = () => {
    if (!selectedId) return;
    if (window.confirm("Are you sure you want to delete this customer?")) {
      customersApi.remove(selectedId).then(
        () => {
          setSelectedId(null);
          pushToast("Customer deleted successfully.");
          load();
        },
        (err: Error) => pushToast(err.message || "Could not delete customer.", "error")
      );
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--text-primary)" }}>Customers</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input type="text" placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-primary)", width: 220 }} />
          {isCustomersEditor && (
            <Button
              variant="primary"
              icon="plus"
              onClick={() => {
                setForm({ company_name: "", primary_contact_name: "", primary_contact_email: "", primary_contact_phone: "" });
                setNewOpen(true);
              }}
            >
              New Customer
            </Button>
          )}
        </div>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={thStyle}>Company</th><th style={thStyle}>Primary Contact</th><th style={thStyle}>Email</th>
              <th style={thStyle}>Phone</th><th style={thStyle}>Leads</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((cu) => (
                <tr key={cu.id} onClick={() => setSelectedId(cu.id)} style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
                  <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>{cu.company_name}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{cu.primary_contact_name || "—"}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{cu.primary_contact_email || "—"}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{cu.primary_contact_phone || "—"}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13.5, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{cu.lead_count}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <a href={deepLinkHref("customer", cu.id)} onClick={(e) => handleDeepLinkClick(e, cu.id)} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-link)", textDecoration: "none" }}>View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>No customers yet — they&apos;re created automatically from new leads, or you can add one directly.</div>
        )}
      </div>

      {newOpen && (
        <div className={"crm-overlay-fade" + (newCustomerClosing.isClosing ? " orbit-closing" : "")} onClick={closeNewCustomerAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className={"crm-pop" + (newCustomerClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw", background: "var(--bg-surface)", borderRadius: 12, boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>New Customer</h2>
              <button onClick={closeNewCustomerAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <Input label="Company name *" value={form.company_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
              <Input label="Primary contact name (optional)" value={form.primary_contact_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, primary_contact_name: e.target.value }))} />
              <Input label="Primary contact email (optional)" value={form.primary_contact_email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, primary_contact_email: e.target.value }))} />
              <Input label="Primary contact phone (optional)" value={form.primary_contact_phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, primary_contact_phone: e.target.value }))} />
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button variant="ghost" onClick={closeNewCustomerAnimated}>Cancel</Button>
              <Button variant="primary" onClick={submitNewCustomer}>Add Customer</Button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className={"crm-overlay-fade" + (customerDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={closeCustomerDrawerAnimated} style={{ position: "fixed", inset: 0, background: "rgba(17,20,30,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div className={"crm-panel-slide" + (customerDrawerClosing.isClosing ? " orbit-closing" : "")} onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "92vw", height: "100%", background: "var(--bg-surface)", boxShadow: "var(--shadow-popover)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Customer</h2>
              <button onClick={closeCustomerDrawerAnimated} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}><Icon name="x" size={20} color="var(--text-muted)" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14, fontSize: 14 }}>
              <Input label="Company name" value={selected.company_name} disabled={!isCustomersEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFieldLive(selected.id, "company_name", e.target.value)} />
              <Input label="Primary contact name (optional)" value={selected.primary_contact_name || ""} disabled={!isCustomersEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFieldLive(selected.id, "primary_contact_name", e.target.value)} />
              <Input label="Primary contact email (optional)" value={selected.primary_contact_email || ""} disabled={!isCustomersEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFieldLive(selected.id, "primary_contact_email", e.target.value)} />
              <Input label="Primary contact phone (optional)" value={selected.primary_contact_phone || ""} disabled={!isCustomersEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFieldLive(selected.id, "primary_contact_phone", e.target.value)} />
              <Input label="Industry (optional)" value={selected.industry || ""} disabled={!isCustomersEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFieldLive(selected.id, "industry", e.target.value)} />
              <Input label="Website (optional)" value={selected.website || ""} disabled={!isCustomersEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFieldLive(selected.id, "website", e.target.value)} />
              <Input label="Address (optional)" multiline rows={2} value={selected.address || ""} disabled={!isCustomersEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFieldLive(selected.id, "address", e.target.value)} />
              <Input label="Notes (optional)" multiline rows={3} value={selected.notes || ""} disabled={!isCustomersEditor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFieldLive(selected.id, "notes", e.target.value)} />
              <div style={{ fontSize: 13, color: "var(--text-muted)", paddingTop: 6, borderTop: "1px solid var(--border-subtle)" }}>{selected.lead_count} lead(s) linked to this customer</div>
            </div>
            {isCustomersEditor && (
              <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
                <Button variant="danger" onClick={deleteSelectedCustomer}>Delete Customer</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)" };
