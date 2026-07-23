// Ported from unpacked/script.js (lines 1-1033) — shared formatting/search
// helpers plus the full REST API client layer (apiFetch + every xApi object).
// Kept behaviorally identical to the source app: same endpoints, same field
// mappings, same error handling. Only change: module-level exports added at
// the bottom instead of these being globals in a single-file bundle.


// Was `LANDING_SCREENS`, a map keyed by the cosmetic single-flavor persona
// (owner/financehead/devmember/hr_admin/employee) rather than the employee's
// real, granular access_levels — so anyone whose persona flavor derived to
// "financehead" (i.e. anyone with 'finance' ticked, even WITHOUT 'dashboard'
// ticked) always landed on/got redirected back to the Dashboard screen,
// regardless of whether they actually had dashboard access. A Finance-only
// employee (ticked "Invoices & Expenses" only, correctly hiding "Dashboard"
// from their sidebar) would still see full company-wide Dashboard content
// the instant they logged in, since the landing/redirect logic never
// actually checked their real access — it just trusted the derived flavor.
// This derives the landing screen from the real merged access object
// instead, so it only ever lands somewhere the employee can actually see.
function deriveLandingFromAccess(access) {
  if (access.dashboard) return 'dashboard';
  if (access.crm) return 'crm';
  if (access.customers) return 'customers';
  if (access.dev) return 'dev';
  if (access.finance) return 'finance';
  if (access.hr) return 'hr';
  if (access.permissions) return 'setup';
  return 'me-leave';
}
// Employees now hold a *list* of access levels (multi-select, tick-box in
// the Employee form) instead of a single role. Each level besides "owner"
// and "employee" maps 1:1 to one sidebar screen — "owner" grants
// everything, and access is simply the union of whatever's ticked. This
// replaces the old single-role ACCESS_LEVELS bundle lookup.
function mergeAccess(levels) {
  const list = levels || [];
  const isOwner = list.indexOf('owner') !== -1;
  return {
    dashboard: isOwner || list.indexOf('dashboard') !== -1,
    crm: isOwner || list.indexOf('crm') !== -1,
    customers: isOwner || list.indexOf('customers') !== -1,
    dev: isOwner || list.indexOf('dev') !== -1,
    finance: isOwner || list.indexOf('finance') !== -1,
    hr: isOwner || list.indexOf('hr') !== -1,


    permissions: isOwner || list.indexOf('permissions') !== -1,
    audit: isOwner,
  };
}
// Cosmetic-only "flavor" derived from the granular access levels, so the
// pre-existing persona === 'devmember' / 'owner' / etc. checks scattered
// through Dashboard/Dev/Finance rendering (labels, default assignee,
// payroll/expense-approval capability, own-projects-only filtering) keep
// working unchanged for the common single-level case. Priority order for
// employees ticked into more than one module: owner > hr > finance > dev.
function derivePersonaFlavor(levels) {
  const list = levels || [];
  if (list.indexOf('owner') !== -1) return 'owner';
  if (list.indexOf('hr') !== -1) return 'hr_admin';
  if (list.indexOf('finance') !== -1) return 'financehead';
  if (list.indexOf('dev') !== -1) return 'devmember';
  return 'employee';
}


const DELAYED_INFO = { p2: 3, p9: 5 };

// Deep-link support: every Lead/Project/Task/Employee row/card is a real
// <a href="#/type/id"> now, not just a div with an onClick — this is what
// lets a browser's native right-click "open in new tab" / middle-click /
// ctrl-click actually work, since those only do anything meaningful on a
// real anchor. A plain left-click still does the normal in-app
// setState-driven navigation (via isModifiedClick below deciding whether to
// preventDefault or let the browser handle it natively).
function deepLinkHref(type, id) {
  return '#/' + type + '/' + encodeURIComponent(id);
}
function isModifiedClick(e) {
  // Anything that should open a new tab/window instead of navigating in
  // place: ctrl/cmd-click, shift-click, or a middle-click (button 1) — a
  // plain right-click never reaches a click handler at all, so it needs no
  // special-casing here; it already works natively off the real href.
  return !!e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1);
}
function parseDeepLinkHash() {
  const m = /^#\/(lead|project|task|employee|customer|leave|wfh)\/([^/?#]+)$/.exec(window.location.hash || '');
  if (!m) return null;
  return { type: m[1], id: decodeURIComponent(m[2]) };
}
// Opening a Lead/Project/Task/Employee row navigates via a real
// #/type/id anchor (see deepLinkHref above) so right-click/ctrl-click/
// middle-click "open in new tab" work — but nothing ever cleared that hash
// again once the drawer closed, so it stayed in the URL bar indefinitely.
// A later page refresh re-ran parseDeepLinkHash() against that same stale
// hash and popped the drawer back open on its own. Called from every
// drawer's own close handler; only strips the hash if it's actually one of
// ours (never touches an unrelated hash), and uses replaceState so closing
// a drawer doesn't add a spurious extra entry to browser back-button history.
function clearDeepLinkHash() {
  if (!parseDeepLinkHash()) return;
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch (e) { /* history API unavailable */ }
}

function money(n) {
  if (n == null || n === '') return '$0';
  const num = typeof n === 'number' ? n : Number(String(n).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return '$0';
  return '$' + Math.round(num).toLocaleString('en-US');
}
function moneyPKR(n) {
  if (n == null || n === '') return 'PKR 0';
  const num = typeof n === 'number' ? n : Number(String(n).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return 'PKR 0';
  return 'PKR ' + Math.round(num).toLocaleString('en-US');
}
function numVal(n) {
  if (n == null || n === '') return 0;
  const num = typeof n === 'number' ? n : Number(String(n).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : num;
}
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function isValidEmail(v) {
  return !!v && EMAIL_REGEX.test(String(v).trim());
}
// Keeps the "+92" prefix fixed/non-removable and everything after it
// digit-only, capped at 10 digits — same "strip a mangled prefix and
// re-prepend the real one" technique already used for the Invoice Number's
// locked "UPM-CZ-" prefix.
function formatPhoneInput(raw) {
  const PREFIX = '+92';
  let val = raw || '';
  if (!val.startsWith(PREFIX)) {
    val = PREFIX + val.replace(/^\+?9?2?/, '');
  }
  const digits = val.slice(PREFIX.length).replace(/\D/g, '').slice(0, 10);
  return PREFIX + digits;
}
// A field left at just "+92" (untouched) counts as not provided, since these
// fields are optional; anything else must be the full "+92" + 10 digits.
function isPhoneComplete(v) {
  return v === '+92' || v === '' || v == null || /^\+92\d{10}$/.test(v);
}
function isValidNumber(v) {
  if (v == null || v === '') return false;
  return !isNaN(Number(v));
}
const CURRENCY_SYMBOL = { USD: '$', PKR: '\u20a8' };
// Base reporting currency is USD. The USD->PKR rate is a system setting
// (see /api/settings/currency) \u2014 this default only covers the brief window
// before that setting has loaded.
const DEFAULT_USD_TO_PKR_RATE = 276.52;
function toUSD(amount, currency, rate) {
  const n = numVal(amount);
  return currency === 'PKR' ? n / (rate || DEFAULT_USD_TO_PKR_RATE) : n;
}
function inReporting(amountUSD, reportingCur, rate) {
  return amountUSD * (reportingCur === 'PKR' ? (rate || DEFAULT_USD_TO_PKR_RATE) : 1);
}
function moneyRep(amountUSD, reportingCur, rate) {
  const cur = reportingCur === 'PKR' ? 'PKR' : 'USD';
  return moneyC(inReporting(amountUSD, cur, rate), cur);
}
function moneyC(n, currency) {
  const sym = CURRENCY_SYMBOL[currency] || '$';
  const num = typeof n === 'number' ? n : Number(String(n).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return sym + '0';
  return sym + Math.round(num).toLocaleString('en-US');
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function toISO(str) {
  if (!str) return '';
  const m = String(str).trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!m) return '';
  const monIdx = MONTH_NAMES.findIndex((mo) => mo.toLowerCase() === m[2].slice(0, 3).toLowerCase());
  if (monIdx === -1) return '';
  return m[3] + '-' + String(monIdx + 1).padStart(2, '0') + '-' + m[1].padStart(2, '0');
}
function fromISO(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  const monIdx = parseInt(parts[1], 10) - 1;
  if (monIdx < 0 || monIdx > 11 || !MONTH_NAMES[monIdx]) return '';
  return parseInt(parts[2], 10) + ' ' + MONTH_NAMES[monIdx] + ' ' + parts[0];
}
function formatDateRange(startISO, endISO) {
  if (!startISO) return '';
  if (!endISO || endISO === startISO) return fromISO(startISO);
  const sp = startISO.split('-'), ep = endISO.split('-');
  const sMonIdx = parseInt(sp[1], 10) - 1, eMonIdx = parseInt(ep[1], 10) - 1;
  if (sp[0] === ep[0] && sMonIdx === eMonIdx) {
    return parseInt(sp[2], 10) + '\u2013' + parseInt(ep[2], 10) + ' ' + MONTH_NAMES[eMonIdx] + ' ' + ep[0];
  }
  return fromISO(startISO) + ' \u2013 ' + fromISO(endISO);
}


// ---- Employee ID ↔ Name mapping helpers ----
// Tasks/projects reference employees by stable UUID (assignee_id, team_ids,
// author_id) instead of name strings, so a name change never orphans an
// assignment. This module-level cache is populated by setEmployeeCache()
// every time loadEmployees() succeeds, and read from everywhere in the UI
// that needs to show a real name next to an ID.
let EMPLOYEE_CACHE = [];
function setEmployeeCache(list) {
  EMPLOYEE_CACHE = list || [];
}
function getEmployeeId(name) {
  if (!name || typeof name !== 'string') return null;
  const emp = EMPLOYEE_CACHE.find(e => e.name === name);
  return emp ? emp.id : null;
}
function getEmployeeName(id) {
  if (!id || typeof id !== 'string') return '';
  const emp = EMPLOYEE_CACHE.find(e => e.id === id);
  return emp ? emp.name : id;
}
function namesToIds(names) {
  return (names || [])
    .map(name => getEmployeeId(name))
    .filter(id => id !== null);
}
function idsToNames(ids) {
  return (ids || []).map(id => getEmployeeName(id));
}

// ---- CRM Leads: search / sort / stage-workflow / storage helpers (kept free of DCLogic
// instance state so they're easy to unit-test and to lift into a real API layer later) ----
const CRM_VIEW_STORAGE_PREFIX = 'orbit.crm.leadsView.';
function readStoredCrmView(userId, fallback) {
  try {
    const v = window.localStorage.getItem(CRM_VIEW_STORAGE_PREFIX + (userId || 'anonymous'));
    return v === 'kanban' || v === 'list' ? v : fallback;
  } catch (e) { return fallback; }
}
function writeStoredCrmView(userId, view) {
  try { window.localStorage.setItem(CRM_VIEW_STORAGE_PREFIX + (userId || 'anonymous'), view); } catch (e) { /* storage unavailable */ }
}

// Keeps you on the same screen across a browser refresh — the persona-based
// access check in renderVals() already redirects away if it's not valid for
// whichever persona is active, so no validation is needed here.
const SCREEN_STORAGE_KEY = 'orbit.currentScreen';
function readStoredScreen(fallback) {
  try {
    const v = window.localStorage.getItem(SCREEN_STORAGE_KEY);
    return v || fallback;
  } catch (e) { return fallback; }
}
function writeStoredScreen(screen) {
  try { window.localStorage.setItem(SCREEN_STORAGE_KEY, screen); } catch (e) { /* storage unavailable */ }
}

function normalizeSearchText(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
// Word-by-word, multi-word, partial, case-insensitive: every query word must appear
// somewhere in the combined haystack (order-independent, so "Blue Log" still matches
// "Blue Harbor Logistics").
function matchesSearch(haystack, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const hay = normalizeSearchText(haystack);
  const words = q.split(' ').filter(Boolean);
  return words.every((w) => hay.indexOf(w) !== -1);
}
function leadSearchHaystack(l) {
  return [l.name, l.poc, l.assignedRep, l.description, l.source, l.medium, l.stage].filter(Boolean).join(' ');
}
// Splits `text` into {text, hl} segments so the template can wrap matches in <mark>
// without needing arbitrary string logic in the expression language.
// A word boundary here is anything that isn't a letter/digit — whitespace,
// punctuation, etc. — matching how normalizeSearchText/split(' ') already
// think about "words" elsewhere in this file.
function isWordChar(ch) {
  return /[A-Za-z0-9]/.test(ch);
}
function highlightSegments(text, query) {
  const str = String(text || '');
  const q = normalizeSearchText(query);
  if (!q) return [{ text: str, hl: false }];
  const words = Array.from(new Set(q.split(' ').filter((w) => w.length > 0)));
  if (!words.length) return [{ text: str, hl: false }];
  const lower = str.toLowerCase();
  const ranges = [];
  words.forEach((w) => {
    let from = 0;
    while (from <= lower.length) {
      const idx = lower.indexOf(w, from);
      if (idx === -1) break;
      // A query word that's a prefix of a longer word in the text (e.g.
      // "corp" inside "Corporation") only highlighted the typed substring,
      // leaving the rest of that same word suddenly un-highlighted right
      // in the middle of a word — looking like the highlight had silently
      // failed partway through. Extend the range to the full word's own
      // boundaries so the whole matched word is highlighted, not just the
      // characters that happened to be typed.
      let start = idx;
      while (start > 0 && isWordChar(lower[start - 1])) start--;
      let end = idx + w.length;
      while (end < lower.length && isWordChar(lower[end])) end++;
      ranges.push([start, end]);
      from = idx + w.length;
    }
  });
  if (!ranges.length) return [{ text: str, hl: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
    else merged.push(ranges[i]);
  }
  const segs = [];
  let cursor = 0;
  merged.forEach(([from, to]) => {
    if (from > cursor) segs.push({ text: str.slice(cursor, from), hl: false });
    segs.push({ text: str.slice(from, to), hl: true });
    cursor = to;
  });
  if (cursor < str.length) segs.push({ text: str.slice(cursor), hl: false });
  return segs;
}

const CRM_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'value-desc', label: 'Highest Value' },
  { value: 'value-asc', label: 'Lowest Value' },
  { value: 'name-asc', label: 'Company A-Z' },
  { value: 'name-desc', label: 'Company Z-A' },
  { value: 'updated', label: 'Recently Updated' },
];
function sortLeads(list, sortKey) {
  const arr = list.slice();
  const receivedTime = (l) => { const iso = toISO(l.received); return iso ? new Date(iso).getTime() : 0; };
  switch (sortKey) {
    case 'oldest': return arr.sort((a, b) => receivedTime(a) - receivedTime(b));
    case 'value-desc': return arr.sort((a, b) => numVal(b.value) - numVal(a.value));
    case 'value-asc': return arr.sort((a, b) => numVal(a.value) - numVal(b.value));
    case 'name-asc': return arr.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc': return arr.sort((a, b) => b.name.localeCompare(a.name));
    case 'updated': return arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    case 'newest':
    default: return arr.sort((a, b) => receivedTime(b) - receivedTime(a));
  }
}

// Tick-box options for the Employee form's Access Level field. Each one
// (besides Owner) grants exactly the one matching screen — no bundling —
// so ticking just "Leads" gives only the CRM screen, ticking "Leads" +
// "Invoices & Expenses" gives exactly those two, etc. "Owner" grants
// everything and is independent of the rest.
const ACCESS_LEVEL_OPTIONS = [
  { value: 'owner', label: 'Owner (full access)' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'crm', label: 'Leads' },
  { value: 'customers', label: 'Customers' },
  { value: 'dev', label: 'Projects' },
  { value: 'finance', label: 'Invoices & Expenses' },
  { value: 'hr', label: 'Employees' },
  { value: 'permissions', label: 'Setup' },
];
// Picking a department with an obviously-matching screen should nudge that
// access level on by default — still freely untickable, just saves HR a step
// on the common case. Scoped to exactly these three departments for now, per
// explicit request, rather than guessing a mapping for every department.
const DEPT_ACCESS_LEVEL = { 'Dev Member': 'dev', 'Finance': 'finance', 'Owner': 'owner' };
// Department is now a fixed 4-option list rather than a free-form union of
// whatever strings happen to already be on employee records.
const DEPARTMENT_OPTIONS = [
  { value: 'Owner', label: 'Owner' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Dev Member', label: 'Dev Member' },
  { value: 'Employee', label: 'Employee' },
];

// ---- Reusable date-range filter (Leads, Projects) — all boundaries computed
// against PKT "today" so every user filters against the same calendar day. ----
const DATE_RANGE_OPTIONS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'custom', label: 'Custom Date Range' },
];
const LEAVE_COUNT_RANGE_OPTIONS = [
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
];
const REPORTS_DATE_RANGE_OPTIONS = [
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
];
const DASHBOARD_DATE_RANGE_OPTIONS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'thisYear', label: 'This Year' },
];
const ME_LEAVE_RANGE_OPTIONS = [
  { value: '', label: 'All time' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
];
function pktTodayParts() {
  const d = new Date(Date.now() + 5 * 3600 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() };
}
function isoFromYMD(y, m, day) {
  return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}
function shiftYMD(y, m, day, deltaDays) {
  const d = new Date(Date.UTC(y, m, day + deltaDays));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() };
}
function resolveDateRangePreset(preset, customFrom, customTo) {
  if (!preset) return { from: null, to: null };
  if (preset === 'custom') return { from: customFrom || null, to: customTo || null };
  const t = pktTodayParts();
  const todayStr = isoFromYMD(t.y, t.m, t.day);
  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case 'yesterday': {
      const y = shiftYMD(t.y, t.m, t.day, -1);
      const iso = isoFromYMD(y.y, y.m, y.day);
      return { from: iso, to: iso };
    }
    case 'last7': {
      const s = shiftYMD(t.y, t.m, t.day, -6);
      return { from: isoFromYMD(s.y, s.m, s.day), to: todayStr };
    }
    case 'last30': {
      const s = shiftYMD(t.y, t.m, t.day, -29);
      return { from: isoFromYMD(s.y, s.m, s.day), to: todayStr };
    }
    case 'thisMonth':
      return { from: isoFromYMD(t.y, t.m, 1), to: todayStr };
    case 'lastMonth': {
      const lm = t.m === 0 ? { y: t.y - 1, m: 11 } : { y: t.y, m: t.m - 1 };
      const lastDay = new Date(Date.UTC(lm.y, lm.m + 1, 0)).getUTCDate();
      return { from: isoFromYMD(lm.y, lm.m, 1), to: isoFromYMD(lm.y, lm.m, lastDay) };
    }
    case 'thisYear':
      return { from: isoFromYMD(t.y, 0, 1), to: todayStr };
    default:
      return { from: null, to: null };
  }
}
function inDateRange(dateISO, range) {
  if (!range.from && !range.to) return true;
  if (!dateISO) return false;
  if (range.from && dateISO < range.from) return false;
  if (range.to && dateISO > range.to) return false;
  return true;
}

// Stage-workflow rule: the last two stages in the list are treated as parallel terminal
// branches (Won / Lost) reachable only from the stage immediately before them; every other
// move must be exactly one step forward, or any number of steps backward. Owners can
// override and jump anywhere.
function isStageTransitionAllowed(stagesList, fromStage, toStage, isOwner) {
  if (isOwner) return true;
  if (fromStage === toStage) return true;
  const iFrom = stagesList.indexOf(fromStage);
  const iTo = stagesList.indexOf(toStage);
  if (iFrom === -1 || iTo === -1) return true;
  if (iTo <= iFrom) return true;
  const terminalStart = Math.max(stagesList.length - 2, 0);
  if (iTo >= terminalStart) return iFrom === terminalStart - 1;
  return iTo === iFrom + 1;
}

function isoOnOrAfter(candidateIso, baseIso) {
  if (!candidateIso || !baseIso) return true;
  return candidateIso >= baseIso;
}

const UPLOAD_MAX_SIZE_MB = 10;
const UPLOAD_ALLOWED_EXT = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
function validateUploadFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (UPLOAD_ALLOWED_EXT.indexOf(ext) === -1) {
    return 'Unsupported file type. Allowed: PDF, DOC, DOCX, or an image.';
  }
  if (file.size > UPLOAD_MAX_SIZE_MB * 1024 * 1024) {
    return 'File is too large. Maximum size is ' + UPLOAD_MAX_SIZE_MB + 'MB.';
  }
  return null;
}

// ---- Leads backend integration (FastAPI /api/leads) ----
// The frontend's field names (name, poc, received, ...) intentionally differ from the
// API's (company_name, client_contact_name, date_received, ...); these two mapping
// directions are the only place that difference should ever need to be handled.
function apiErrorMessage(body) {
  if (!body) return 'Something went wrong. Please try again.';
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    const msgs = body.detail.map((d) => d && d.msg).filter(Boolean);
    return msgs.length ? msgs.join('; ') : 'Validation failed.';
  }
  if (body.message) return body.message;
  return 'Something went wrong. Please try again.';
}
// Set by Component.componentDidMount so a 401 anywhere can kick the user back
// to the login screen without threading `this` through every apiFetch call.
let onSessionExpired = null;
async function apiFetch(path, options = {}) {
  options.headers = options.headers || {};
  const token = localStorage.getItem('orbit_token');
  if (token) {
    options.headers['Authorization'] = 'Bearer ' + token;
  }
  let res;
  try {
    res = await fetch(path, options);
  } catch (e) {
    throw new Error('Network error — check your connection and try again.');
  }
  // A 401 from the login endpoint itself means "wrong email/password" —
  // there's no session to have expired yet, since this *is* the attempt to
  // start one. Only treat a 401 as an expired session for every other
  // (already-authenticated) call.
  if (res.status === 401 && path !== '/api/auth/login') {
    // checkAuth's own retry-on-transient-failure logic (see below) needs
    // the token to still be there to retry with — clearing it here, on the
    // very first attempt, meant every retry sent no Authorization header at
    // all and was guaranteed to 401 again, silently defeating the retry
    // before it ever got a real second chance. Callers that are doing their
    // own retry pass `skipAuthExpiry` and are responsible for clearing the
    // token themselves once they actually give up.
    if (!options.skipAuthExpiry) {
      localStorage.removeItem('orbit_token');
      // Read the real backend reason (e.g. "Your account has been
      // deactivated by the Owner...") instead of always showing a generic
      // "session expired" toast — get_current_user now re-checks account
      // status on every request, so this is also what surfaces the specific
      // deactivation message the instant a live session's next call 401s.
      let detailMsg = null;
      try { detailMsg = apiErrorMessage(await res.json()); } catch (e) { /* no/empty body */ }
      if (onSessionExpired) onSessionExpired(detailMsg);
    }
    throw new Error('Session expired');
  }
  let body = null;
  try { body = await res.json(); } catch (e) { /* no/empty JSON body (e.g. 204) */ }
  if (!res.ok) throw new Error(apiErrorMessage(body));
  return body;
}
function toApiDate(displayDate) {
  return toISO(displayDate) || null;
}
function apiLeadToDisplay(l) {
  return {
    id: l.id,
    name: l.company_name,
    poc: l.client_contact_name,
    assignedRep: l.assigned_rep || 'Unassigned',
    source: l.source || '',
    // Was `|| '—'`: since this feeds the editable Medium input directly (the
    // only place `.medium` is used), that dash was real text sitting in the
    // field, not just a read-only placeholder — leaving it untouched and
    // saving another field could silently persist "—" as the medium value.
    medium: l.medium || '',
    // Stays null (not `|| 0`) when the backend redacts it for a non-owner
    // CRM-access viewer — a real 0 and "hidden" must stay distinguishable so
    // the UI can show "—" instead of a misleading "$0". See valueStr below.
    value: l.value,
    stage: l.stage,
    description: l.description || '',
    received: fromISO(l.date_received) || '',
    expectedClose: fromISO(l.expected_closure_date) || '',
    actualClose: fromISO(l.actual_closure_date) || null,
    followUp: fromISO(l.follow_up_date) || null,
    followUpOverdue: !!l.is_overdue_follow_up,
    scopeDoc: !!l.scope_document_url,
    contract: !!l.signed_contract_url,
    scopeDocUrl: l.scope_document_url || null,
    contractUrl: l.signed_contract_url || null,
    scopeDocName: l.scope_document_url ? (l.scope_document_filename || l.scope_document_url.split('/').pop()) : undefined,
    contractName: l.signed_contract_url ? (l.signed_contract_filename || l.signed_contract_url.split('/').pop()) : undefined,
    isLockedRevenue: !!l.is_locked_revenue,
    updatedAt: l.updated_at ? new Date(l.updated_at).getTime() : 0,
    createdAt: l.created_at || null,
    createdDateStr: formatLocalDateOnly(l.created_at),
    activity: [],
  };
}
// ORBIT standardizes on Pakistan Standard Time (Asia/Karachi, fixed UTC+05:00,
// no DST) everywhere a date/time is shown — regardless of the viewer's own
// machine timezone — so every user sees the same "today" and the same clock.
const PKT_TZ = 'Asia/Karachi';
function formatCommentTimestamp(iso) {
  if (!iso) return 'Just now';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Just now';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: PKT_TZ }) + ' ' + d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: PKT_TZ });
}
function flattenComments(commentsList, self) {
  if (!commentsList) return [];
  const rootComments = commentsList.filter(c => !c.parent_id);
  const repliesByParent = {};
  commentsList.forEach(c => {
    if (c.parent_id) {
      repliesByParent[c.parent_id] = repliesByParent[c.parent_id] || [];
      repliesByParent[c.parent_id].push(c);
    }
  });
  const result = [];
  function addBranch(comment, depth = 0) {
    const isReplying = self.state.replyingToCommentId === comment.id;
    const authorName = getEmployeeName(comment.author_id);
    result.push({
      ...comment,
      ts: formatCommentTimestamp(comment.created_at),
      user: authorName,
      text: comment.text,
      depth,
      isReplying,
      paddingStyle: depth > 0 ? 'margin-left:' + (depth * 20) + 'px;border-left:2px solid var(--border-subtle);padding-left:10px' : '',
      replyStyle: isReplying ? ';background:rgba(99,102,241,0.08);border-radius:6px;margin:-2px -4px;padding:2px 4px' : '',
      onReply: (e) => {
        if (e && e.preventDefault) e.preventDefault();
        self.setState({ replyingToCommentId: comment.id });
        if (comment.project_id) {
          self.setState({ projectCommentDraft: '@' + authorName + ' ' });
        } else {
          self.setState({ taskCommentDraft: '@' + authorName + ' ' });
        }
      }
    });
    const replies = repliesByParent[comment.id] || [];
    replies.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    replies.forEach(r => addBranch(r, depth + 1));
  }
  rootComments.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  rootComments.forEach(c => addBranch(c, 0));
  return result;
}
function getHighlightParts(text, query) {
  if (!text) return { before: '', match: '', after: '', hasMatch: false };
  if (!query) return { before: text, match: '', after: '', hasMatch: false };
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return { before: text, match: '', after: '', hasMatch: false };
  return {
    before: text.substring(0, idx),
    match: text.substring(idx, idx + query.length),
    after: text.substring(idx + query.length),
    hasMatch: true
  };
}
function formatLocalDateOnly(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: PKT_TZ });
}
function todayISO() {
  const d = new Date(Date.now() + 5 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const LEAD_FIELD_TO_API = {
  name: 'company_name', poc: 'client_contact_name', assignedRep: 'assigned_rep',
  source: 'source', medium: 'medium', value: 'value', description: 'description',
  received: 'date_received', expectedClose: 'expected_closure_date',
  actualClose: 'actual_closure_date', followUp: 'follow_up_date',
};
const LEAD_DATE_FIELDS = { received: 1, expectedClose: 1, actualClose: 1, followUp: 1 };
function buildApiFieldPatch(field, value) {
  const apiKey = LEAD_FIELD_TO_API[field];
  if (!apiKey) return null;
  const patch = {};
  patch[apiKey] = LEAD_DATE_FIELDS[field] ? toApiDate(value) : value;
  return patch;
}
const settingsApi = {
  getCurrency() {
    return apiFetch('/api/settings/currency');
  },
  updateCurrency(rate) {
    return apiFetch('/api/settings/currency', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usd_to_pkr_rate: rate }),
    });
  },
};
const preferencesApi = {
  getCurrencyPrefs(userId) {
    return apiFetch('/api/preferences/currency/' + encodeURIComponent(userId));
  },
  setCurrencyPref(userId, module, currency) {
    return apiFetch('/api/preferences/currency/' + encodeURIComponent(userId), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module, currency }),
    });
  },
};
const leadsApi = {
  async list() {
    const data = await apiFetch('/api/leads?page_size=200&sort_by=created_at&sort_dir=desc');
    return (data.items || []).map(apiLeadToDisplay);
  },
  async search(q, limit = 8) {
    const data = await apiFetch('/api/leads/search?q=' + encodeURIComponent(q) + '&limit=' + limit);
    return (data.items || []).map(apiLeadToDisplay);
  },
  create(payload) {
    return apiFetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  },
  update(id, patch) {
    return apiFetch('/api/leads/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  },
  setStage(id, stage) {
    return apiFetch('/api/leads/' + id + '/stage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }) });
  },
  remove(id) {
    return apiFetch('/api/leads/' + id, { method: 'DELETE' });
  },
  uploadScopeDoc(id, file) {
    const fd = new FormData(); fd.append('file', file);
    return apiFetch('/api/leads/' + id + '/scope-document', { method: 'POST', body: fd });
  },
  uploadContract(id, file) {
    const fd = new FormData(); fd.append('file', file);
    return apiFetch('/api/leads/' + id + '/signed-contract', { method: 'POST', body: fd });
  },
  removeScopeDoc(id) {
    return apiFetch('/api/leads/' + id + '/scope-document', { method: 'DELETE' });
  },
  removeContract(id) {
    return apiFetch('/api/leads/' + id + '/signed-contract', { method: 'DELETE' });
  },
  async listActivities(id) {
    const data = await apiFetch('/api/leads/' + id + '/activities?page_size=200');
    return data.items || [];
  },
  addComment(id, note) {
    return apiFetch('/api/leads/' + id + '/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'comment', note }) });
  },
};
const projectsApi = {
  async list(filters = {}) {
    let query = '';
    const qparams = [];
    if (filters.search) qparams.push('search=' + encodeURIComponent(filters.search));
    if (filters.client) qparams.push('client=' + encodeURIComponent(filters.client));
    if (filters.status) qparams.push('status=' + encodeURIComponent(filters.status));
    if (filters.team_member) qparams.push('team_member=' + encodeURIComponent(filters.team_member));
    if (filters.date_from) qparams.push('date_from=' + encodeURIComponent(filters.date_from));
    if (filters.date_to) qparams.push('date_to=' + encodeURIComponent(filters.date_to));
    if (qparams.length > 0) query = '?' + qparams.join('&');
    return apiFetch('/api/projects' + query);
  },
  create(payload) {
    return apiFetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  },
  update(id, patch) {
    return apiFetch('/api/projects/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  },
  remove(id) {
    return apiFetch('/api/projects/' + id, { method: 'DELETE' });
  },
  uploadAttachment(id, file) {
    const fd = new FormData(); fd.append('file', file);
    return apiFetch('/api/projects/' + id + '/attachments', { method: 'POST', body: fd });
  },
  removeAttachment(id, filename) {
    return apiFetch('/api/projects/' + id + '/attachments/' + encodeURIComponent(filename), { method: 'DELETE' });
  },
  getComments(id) {
    return apiFetch('/api/projects/' + id + '/comments');
  },
  getAttachments(id) {
    return apiFetch('/api/projects/' + id + '/attachments');
  },
  getAudit(id) {
    return apiFetch('/api/projects/' + id + '/audit');
  },
  addComment(id, payload) {
    return apiFetch('/api/projects/' + id + '/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }
};

const tasksApi = {
  async list(filters = {}) {
    let query = '';
    const qparams = [];
    if (filters.search) qparams.push('search=' + encodeURIComponent(filters.search));
    if (filters.project_id) qparams.push('project_id=' + encodeURIComponent(filters.project_id));
    if (filters.assignee) qparams.push('assignee=' + encodeURIComponent(filters.assignee));
    if (filters.status) qparams.push('status=' + encodeURIComponent(filters.status));
    if (filters.date_from) qparams.push('date_from=' + encodeURIComponent(filters.date_from));
    if (filters.date_to) qparams.push('date_to=' + encodeURIComponent(filters.date_to));
    if (qparams.length > 0) query = '?' + qparams.join('&');
    return apiFetch('/api/tasks' + query);
  },
  create(payload) {
    return apiFetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  },
  update(id, patch) {
    return apiFetch('/api/tasks/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  },
  remove(id) {
    return apiFetch('/api/tasks/' + id, { method: 'DELETE' });
  },
  getComments(id) {
    return apiFetch('/api/tasks/' + id + '/comments');
  },
  getAudit(id) {
    return apiFetch('/api/tasks/' + id + '/audit');
  },
  addComment(id, payload) {
    return apiFetch('/api/tasks/' + id + '/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }
};


const notificationsApi = {
  list() {
    return apiFetch('/api/notifications');
  },
  markRead(id, isRead) {
    return apiFetch('/api/notifications/' + id + '/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_read: isRead }) });
  },
  markAllRead() {
    return apiFetch('/api/notifications/read-all', { method: 'POST' });
  }
};

const timeEntriesApi = {
  list() {
    return apiFetch('/api/time-entries');
  }
};
const employeesApi = {
  list(filters) {
    let q = '';
    const p = [];
    if (filters && filters.search) p.push('search=' + encodeURIComponent(filters.search));
    if (filters && filters.department) p.push('department=' + encodeURIComponent(filters.department));
    if (filters && filters.status_filter) p.push('status_filter=' + encodeURIComponent(filters.status_filter));
    if (p.length) q = '?' + p.join('&');
    return apiFetch('/api/employees' + q);
  },
  get(id) { return apiFetch('/api/employees/' + id); },
  create(payload) { return apiFetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  update(id, payload) { return apiFetch('/api/employees/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  remove(id) { return apiFetch('/api/employees/' + id, { method: 'DELETE' }); },
  deactivate(id) { return apiFetch('/api/employees/' + id + '/deactivate', { method: 'POST' }); },
  activate(id) { return apiFetch('/api/employees/' + id + '/activate', { method: 'POST' }); },
  deletePermanent(id) { return apiFetch('/api/employees/' + id + '/permanent', { method: 'DELETE' }); },
  uploadContract(id, file) {
    const fd = new FormData(); fd.append('file', file);
    return apiFetch('/api/employees/' + id + '/contract', { method: 'POST', body: fd });
  },
  removeContract(id) { return apiFetch('/api/employees/' + id + '/contract', { method: 'DELETE' }); },
};
const customersApi = {
  list(search) {
    const q = search ? '?search=' + encodeURIComponent(search) : '';
    return apiFetch('/api/customers' + q);
  },
  get(id) { return apiFetch('/api/customers/' + id); },
  create(payload) { return apiFetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  update(id, payload) { return apiFetch('/api/customers/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  remove(id) { return apiFetch('/api/customers/' + id, { method: 'DELETE' }); },
};
const attendanceApi = {
  mark() { return apiFetch('/api/attendance/mark', { method: 'POST' }); },
  me(year, month) { return apiFetch('/api/attendance/me?year=' + year + '&month=' + month); },
  today() { return apiFetch('/api/attendance/today'); },
  all(year, month, employeeId) {
    let q = '?year=' + year + '&month=' + month;
    if (employeeId) q += '&employee_id=' + encodeURIComponent(employeeId);
    return apiFetch('/api/attendance' + q);
  },
};
const wfhApi = {
  create(dateIso, description) {
    return apiFetch('/api/wfh/mine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: dateIso, description: description || null }) });
  },
  mine() { return apiFetch('/api/wfh/mine'); },
  all(statusFilter) {
    let q = '';
    if (statusFilter) q = '?status_filter=' + encodeURIComponent(statusFilter);
    return apiFetch('/api/wfh' + q);
  },
  approve(id, note) {
    return apiFetch('/api/wfh/' + id + '/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note || null }) });
  },
  reject(id, note) {
    return apiFetch('/api/wfh/' + id + '/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note || null }) });
  },
};
const leavesApi = {
  list(filters) {
    let q = '';
    const p = [];
    if (filters && filters.employee_id) p.push('employee_id=' + encodeURIComponent(filters.employee_id));
    if (filters && filters.status_filter) p.push('status_filter=' + encodeURIComponent(filters.status_filter));
    if (filters && filters.leave_type) p.push('leave_type=' + encodeURIComponent(filters.leave_type));
    if (p.length) q = '?' + p.join('&');
    return apiFetch('/api/leaves' + q);
  },
  get(id) { return apiFetch('/api/leaves/' + id); },
  create(payload) { return apiFetch('/api/leaves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  approve(id, note) { return apiFetch('/api/leaves/' + id + '/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) }); },
  reject(id, reason) { return apiFetch('/api/leaves/' + id + '/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rejection_reason: reason }) }); },
  balance(employeeId) { return apiFetch('/api/leaves/balance/' + employeeId); },
};
const openingsApi = {
  list() { return apiFetch('/api/job-openings'); },
  get(id) { return apiFetch('/api/job-openings/' + id); },
  create(payload) { return apiFetch('/api/job-openings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  update(id, payload) { return apiFetch('/api/job-openings/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  remove(id) { return apiFetch('/api/job-openings/' + id, { method: 'DELETE' }); },
};
const candidatesApi = {
  list(openingId) { return apiFetch('/api/job-openings/' + openingId + '/candidates'); },
  create(openingId, payload) { return apiFetch('/api/job-openings/' + openingId + '/candidates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  update(id, payload) { return apiFetch('/api/job-openings/candidates/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
};
const leavePolicyApi = {
  get() { return apiFetch('/api/settings/hr/leave-policy'); },
  update(payload) { return apiFetch('/api/settings/hr/leave-policy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
};
const holidaysApi = {
  list() { return apiFetch('/api/settings/hr/holidays'); },
  create(payload) { return apiFetch('/api/settings/hr/holidays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  remove(id) { return apiFetch('/api/settings/hr/holidays/' + id, { method: 'DELETE' }); },
};
const auditLogApi = {
  list() { return apiFetch('/api/audit?limit=200'); },
};

const invoicesApi = {
  list(filters = {}) {
    let q = '';
    const p = [];
    if (filters.search) p.push('search=' + encodeURIComponent(filters.search));
    if (filters.status) p.push('status=' + encodeURIComponent(filters.status));
    if (filters.currency) p.push('currency=' + encodeURIComponent(filters.currency));
    if (filters.project_id) p.push('project_id=' + encodeURIComponent(filters.project_id));
    if (filters.date_from) p.push('date_from=' + encodeURIComponent(filters.date_from));
    if (filters.date_to) p.push('date_to=' + encodeURIComponent(filters.date_to));
    if (p.length) q = '?' + p.join('&');
    return apiFetch('/api/finance/invoices' + q);
  },
  get(id) { return apiFetch('/api/finance/invoices/' + id); },
  create(payload) { return apiFetch('/api/finance/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  update(id, payload) { return apiFetch('/api/finance/invoices/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  remove(id) { return apiFetch('/api/finance/invoices/' + id, { method: 'DELETE' }); }
};
const expensesApi = {
  list(filters = {}) {
    let q = '';
    const p = [];
    if (filters.search) p.push('search=' + encodeURIComponent(filters.search));
    if (filters.status) p.push('status=' + encodeURIComponent(filters.status));
    if (filters.department) p.push('department=' + encodeURIComponent(filters.department));
    if (filters.category) p.push('category=' + encodeURIComponent(filters.category));
    if (p.length) q = '?' + p.join('&');
    return apiFetch('/api/finance/expenses' + q);
  },
  get(id) { return apiFetch('/api/finance/expenses/' + id); },
  create(payload) { return apiFetch('/api/finance/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  update(id, payload) { return apiFetch('/api/finance/expenses/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  remove(id) { return apiFetch('/api/finance/expenses/' + id, { method: 'DELETE' }); }
};
const payrollApi = {
  list(filters = {}) {
    let q = '';
    const p = [];
    if (filters.month) p.push('month=' + encodeURIComponent(filters.month));
    if (filters.search) p.push('search=' + encodeURIComponent(filters.search));
    if (filters.department) p.push('department=' + encodeURIComponent(filters.department));
    if (filters.payment_status) p.push('payment_status=' + encodeURIComponent(filters.payment_status));
    if (p.length) q = '?' + p.join('&');
    return apiFetch('/api/finance/payroll' + q);
  },
  get(id) { return apiFetch('/api/finance/payroll/' + id); },
  update(id, payload) { return apiFetch('/api/finance/payroll/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  remove(id) { return apiFetch('/api/finance/payroll/' + id, { method: 'DELETE' }); }
};
const expenseCategoriesApi = {
  list() { return apiFetch('/api/settings/finance/expense-categories'); },
  create(name) { return apiFetch('/api/settings/finance/expense-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); },
  remove(id) { return apiFetch('/api/settings/finance/expense-categories/' + id, { method: 'DELETE' }); }
};
const crmSourcesApi = {
  list() { return apiFetch('/api/settings/crm/sources'); },
  create(name) { return apiFetch('/api/settings/crm/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); },
  update(id, name) { return apiFetch('/api/settings/crm/sources/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); },
  remove(id) { return apiFetch('/api/settings/crm/sources/' + id, { method: 'DELETE' }); }
};
const expenseCategoryBudgetsApi = {
  list() { return apiFetch('/api/finance/expense-category-budgets'); },
  set(category, monthlyBudgetUsd) {
    return apiFetch('/api/finance/expense-category-budgets/' + encodeURIComponent(category), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly_budget_usd: monthlyBudgetUsd }),
    });
  },
};
const milestonesApi = {
  list(filters = {}) {
    let q = '';
    const p = [];
    if (filters.search) p.push('search=' + encodeURIComponent(filters.search));
    if (filters.status) p.push('status=' + encodeURIComponent(filters.status));
    if (filters.project_id) p.push('project_id=' + encodeURIComponent(filters.project_id));
    if (p.length) q = '?' + p.join('&');
    return apiFetch('/api/finance/milestones' + q);
  },
  get(id) { return apiFetch('/api/finance/milestones/' + id); },
  create(payload) { return apiFetch('/api/finance/milestones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  update(id, payload) { return apiFetch('/api/finance/milestones/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  remove(id) { return apiFetch('/api/finance/milestones/' + id, { method: 'DELETE' }); }
};
const financeStatsApi = {
  get() { return apiFetch('/api/finance/stats'); }
};
const policiesApi = {
  list() { return apiFetch('/api/policies'); },
  get(id) { return apiFetch('/api/policies/' + id); },
  create(payload) { return apiFetch('/api/policies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  update(id, payload) { return apiFetch('/api/policies/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); },
  remove(id) { return apiFetch('/api/policies/' + id, { method: 'DELETE' }); },
  uploadFile(id, file) {
    const fd = new FormData(); fd.append('file', file);
    return apiFetch('/api/policies/' + id + '/file', { method: 'POST', body: fd });
  },
  removeFile(id) { return apiFetch('/api/policies/' + id + '/file', { method: 'DELETE' }); },
  ask(question) { return apiFetch('/api/policies/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) }); },
};

// Ported from script.js lines 1039-1063 — these sit just past the original
// line-1033 cutoff used for the rest of this file's extraction, so they're
// appended here rather than inline with the block above.
function activityToDisplay(a) {
  const userName = a.created_by ? getEmployeeName(a.created_by) : 'Unknown';
  return { ts: formatActivityTimestamp(a.created_at), user: userName, text: a.note || '', type: a.type };
}

function auditToDisplay(a) {
  const actorName = a.actor_id ? (getEmployeeName(a.actor_id) || a.actor_id) : 'System';
  return {
    id: a.id,
    user: actorName,
    ts: formatActivityTimestamp(a.created_at),
    action: a.action,
    detail: a.detail || '',
    hasDetail: !!(a.detail && a.detail.trim())
  };
}

function formatActivityTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: PKT_TZ }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: PKT_TZ });
}

// `onSessionExpired` is a module-private `let` (set by apiFetch's 401
// handler) — components can't reassign an imported binding directly, so
// this setter is the one addition to the ported code, called once from the
// root layout the same way the original called it from Component.componentDidMount.
function setOnSessionExpired(fn) {
  onSessionExpired = fn;
}

export {
  // core fetch + error handling
  apiFetch,
  apiErrorMessage,
  setOnSessionExpired,
  // date-range presets + resolution (shared across Me/HR/Dashboard/Reports)
  ME_LEAVE_RANGE_OPTIONS,
  DATE_RANGE_OPTIONS,
  DASHBOARD_DATE_RANGE_OPTIONS,
  REPORTS_DATE_RANGE_OPTIONS,
  LEAVE_COUNT_RANGE_OPTIONS,
  CRM_SORT_OPTIONS,
  DEPARTMENT_OPTIONS,
  DEPT_ACCESS_LEVEL,
  ACCESS_LEVEL_OPTIONS,
  pktTodayParts,
  isoFromYMD,
  shiftYMD,
  resolveDateRangePreset,
  inDateRange,
  isoOnOrAfter,
  sortLeads,
  isStageTransitionAllowed,
  // persona/access helpers
  deriveLandingFromAccess,
  mergeAccess,
  derivePersonaFlavor,
  // formatting helpers
  money,
  moneyPKR,
  moneyC,
  moneyRep,
  numVal,
  toUSD,
  inReporting,
  isValidEmail,
  formatPhoneInput,
  isPhoneComplete,
  isValidNumber,
  CURRENCY_SYMBOL,
  DEFAULT_USD_TO_PKR_RATE,
  MONTH_NAMES,
  toISO,
  fromISO,
  formatDateRange,
  formatLocalDateOnly,
  formatCommentTimestamp,
  formatActivityTimestamp,
  activityToDisplay,
  auditToDisplay,
  PKT_TZ,
  todayISO,
  addDaysISO,
  // employee id <-> name cache
  setEmployeeCache,
  getEmployeeId,
  getEmployeeName,
  namesToIds,
  idsToNames,
  // deep links
  deepLinkHref,
  isModifiedClick,
  parseDeepLinkHash,
  clearDeepLinkHash,
  // search / highlight
  normalizeSearchText,
  matchesSearch,
  leadSearchHaystack,
  isWordChar,
  highlightSegments,
  getHighlightParts,
  // stored view/screen prefs
  readStoredCrmView,
  writeStoredCrmView,
  readStoredScreen,
  writeStoredScreen,
  // lead field mapping
  apiLeadToDisplay,
  buildApiFieldPatch,
  toApiDate,
  LEAD_FIELD_TO_API,
  LEAD_DATE_FIELDS,
  DELAYED_INFO,
  UPLOAD_ALLOWED_EXT,
  UPLOAD_MAX_SIZE_MB,
  validateUploadFile,
  // API client objects (all 24)
  settingsApi,
  preferencesApi,
  leadsApi,
  projectsApi,
  tasksApi,
  notificationsApi,
  timeEntriesApi,
  employeesApi,
  customersApi,
  attendanceApi,
  wfhApi,
  leavesApi,
  openingsApi,
  candidatesApi,
  leavePolicyApi,
  holidaysApi,
  auditLogApi,
  invoicesApi,
  expensesApi,
  payrollApi,
  expenseCategoriesApi,
  crmSourcesApi,
  expenseCategoryBudgetsApi,
  milestonesApi,
  financeStatsApi,
  policiesApi,
};