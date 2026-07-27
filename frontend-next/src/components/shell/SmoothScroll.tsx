"use client";

import { ReactLenis } from "lenis/react";
import type { CSSProperties, ReactNode } from "react";

type SmoothScrollProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  // Lenis's root={false} mode inserts its own plain inner div between the
  // scrolling wrapper and `children` (so it can measure content size
  // separately from the scroll box) — anything in `style` never reaches
  // the real children, just that hidden intermediary. `contentStyle` is
  // rendered on an explicit div wrapping `children` instead, so callers
  // that need the children arranged as a flex/grid row/column with a gap
  // (Kanban columns, drawer form fields, etc.) put that layout here, and
  // reserve `style` for the scroll box itself (sizing, padding, position).
  contentStyle?: CSSProperties;
  horizontal?: boolean;
};

// The rest of the app already forces scroll-behavior:auto + near-zero
// animation durations for prefers-reduced-motion users (globals.css) —
// Lenis has no built-in awareness of that setting, so without this check
// motion-sensitive users would still get eased/animated wheel scrolling
// here even though every other animation in the app is off for them.
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Wraps a scrollable region in its own Lenis instance so mouse-wheel/
// trackpad scrolling eases to a stop instead of snapping dead on every
// tick (plain browser wheel scrolling on Windows has no momentum at all —
// only touch/trackpad gestures on macOS get that from the OS). Lenis still
// drives the real native scrollTop under the hood (just RAF-interpolated),
// so anchor links, scrollIntoView, position:fixed children, and native
// drag-and-drop all keep working exactly as they did before.
//
// `data-lenis-prevent` is only set for VERTICAL instances. It stops an
// ANCESTOR SmoothScroll (e.g. the page-level one around .orbit-screen-content)
// from ALSO trying to handle the same vertical wheel event as a nested
// vertical region (a drawer body, or a comments list inside that drawer
// body) — both would otherwise react to the same deltaY. A HORIZONTAL
// instance (a Kanban board, a table's own overflow-x) doesn't compete with
// a vertical ancestor for the same axis, so it must NOT set this: Lenis
// already ignores vertical-only wheel input on a horizontal instance (its
// gestureOrientation is "horizontal"), and if that instance also carried
// data-lenis-prevent, the ancestor would unconditionally back off too —
// even though the horizontal instance never actually handled the event —
// leaving nothing to scroll the page while the mouse hovers over, say, a
// wide Kanban board. (Hit exactly this: Leads/Projects "not scrolling".)
//
// Likewise `overscrollBehavior` is only contained on this instance's OWN
// axis (X for horizontal, Y for vertical), not both. Containing the axis
// this instance does NOT scroll on would trap that axis's scroll attempts
// here instead of letting them chain up to the page — a Kanban board has
// no vertical overflow of its own, so an unqualified `contain` on Y would
// swallow every vertical scroll gesture made while hovering it, which is
// the same "page won't scroll under the board" bug from a second angle.
export default function SmoothScroll({ children, className, style, contentStyle, horizontal }: SmoothScrollProps) {
  return (
    <ReactLenis
      root={false}
      {...(horizontal ? {} : { "data-lenis-prevent": "" })}
      className={className}
      style={{
        overflow: "auto",
        overscrollBehaviorX: horizontal ? "contain" : "auto",
        overscrollBehaviorY: horizontal ? "auto" : "contain",
        ...style,
      }}
      options={{
        orientation: horizontal ? "horizontal" : "vertical",
        gestureOrientation: horizontal ? "horizontal" : "vertical",
        smoothWheel: !prefersReducedMotion(),
        syncTouch: false,
        wheelMultiplier: 2,
        touchMultiplier: 1,
        duration: 0.8,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
      }}
    >
      {contentStyle ? <div style={contentStyle}>{children}</div> : children}
    </ReactLenis>
  );
}
