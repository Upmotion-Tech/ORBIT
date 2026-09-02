"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Debounced, coalescing wrapper around a "save these fields" function — for
 * the drawer TEXT inputs that used to fire a real update request on every
 * single keystroke.
 *
 * The `*FieldLive` functions on Customers/Dev/Finance/HR each PUT once per
 * `onChange`. For a dropdown, a checkbox or a drag-and-drop that's exactly
 * right: one discrete action, one save. For a text input it meant one API
 * call, one audit-log row AND one toast PER CHARACTER — typing "Noha Vista"
 * left ten "Fields updated: company_name" rows in the Audit Trail and
 * stacked ten toasts on screen, and backspacing left the same trail in
 * reverse ("Noha Vist", "Noha Vis", "Noha Vi", … "N").
 *
 * This buffers keystrokes and saves once, `delay` ms after typing stops,
 * coalescing every field touched during that pause into a SINGLE save call —
 * so one edit session produces one request, one audit entry, one toast. It's
 * the same approach HR's salary field already hand-rolled (see
 * `hr/page.tsx`'s `salaryDraft`/`salaryDebounceRef`), just reusable and
 * multi-field.
 *
 * `save(id, fields)` must apply the whole `fields` object in one call — every
 * `xApi.update` already takes a partial payload, so `{a: 1, b: 2}` is one PUT
 * and therefore one audit row listing both fields.
 *
 * Only route free-text/number typing through `queue`. Leave discrete changes
 * (Select dropdowns, checkboxes, status changes, Kanban drops) on the
 * immediate path — debouncing those adds latency for no benefit, and status
 * changes in particular depend on their validation toast firing right away.
 */
export function useDebouncedFieldSave(
  save: (id: string, fields: Record<string, unknown>) => void,
  delay = 600
) {
  const pendingRef = useRef<{ id: string; fields: Record<string, unknown> } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held in a ref so `flush`/`queue` stay referentially stable even though
  // every calling page defines its `save` inline (a fresh closure each
  // render) — otherwise the unmount effect below would re-run constantly.
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) saveRef.current(pending.id, pending.fields);
  }, []);

  /** Drop any pending save without sending it — for when the record is about
   *  to be deleted, so a debounced PUT can't land after the DELETE and 404. */
  const discard = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  const queue = useCallback(
    (id: string, field: string, val: unknown) => {
      // Switched to a different record mid-pause: flush the previous one
      // rather than merging two records' edits into one payload sent against
      // a single id.
      if (pendingRef.current && pendingRef.current.id !== id) flush();
      pendingRef.current = {
        id,
        fields: { ...(pendingRef.current?.fields || {}), [field]: val },
      };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, delay);
    },
    [delay, flush]
  );

  // A drawer torn down by unmount (route change, sign-out) must not silently
  // drop the last few keystrokes. `flush` is stable, so this runs on unmount
  // only.
  useEffect(() => flush, [flush]);

  return { queue, flush, discard };
}
