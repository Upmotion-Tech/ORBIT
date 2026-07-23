"use client";

// Every drawer/modal already animates smoothly on OPEN via the
// .crm-overlay-fade/.crm-panel-slide/.crm-pop mount animations already
// defined in globals.css — but closing just set the id straight to null,
// unmounting instantly with no exit animation, which is what made closing
// feel abrupt next to a smooth open. globals.css already has the matching
// .orbit-closing exit-animation variants for all three (this is the same
// 220ms-hold pattern toast-context.tsx already uses for toasts) — this hook
// is just that pattern extracted so every drawer can reuse it instead of
// re-implementing the same setTimeout dance.
import { useCallback, useState } from "react";

export function useClosingTransition(delayMs = 220) {
  const [isClosing, setIsClosing] = useState(false);

  const closeWithTransition = useCallback(
    (doClose: () => void) => {
      setIsClosing(true);
      setTimeout(() => {
        doClose();
        setIsClosing(false);
      }, delayMs);
    },
    [delayMs]
  );

  return { isClosing, closeWithTransition };
}
