"use client";

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { motion, AnimatePresence } from "motion/react";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? "⌘" : "Ctrl";

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const { t } = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, modalRef);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [open, onClose]);

  const shortcuts = [
    { keys: "R", desc: t("shortcutRefresh") },
    { keys: "S", desc: t("shortcutSettings") },
    { keys: `${modKey}+E`, desc: t("shortcutExport") },
    { keys: "?", desc: t("shortcutHelp") },
    { keys: "Esc", desc: t("shortcutClose") },
  ];

  if (!open) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-xl border bg-popover p-6 shadow-xl ring-1 ring-border/50"
        >
          <h2 id="shortcuts-title" className="text-lg font-semibold">
            {t("shortcutsTitle")}
          </h2>
          <dl className="mt-4 space-y-3">
            {shortcuts.map(({ keys, desc }) => (
              <div
                key={keys}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <dt className="text-muted-foreground">{desc}</dt>
                <dd>
                  <kbd className="rounded border border-border bg-muted px-2 py-1 font-mono text-xs">
                    {keys}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex justify-end">
            <Button ref={closeRef} size="sm" onClick={onClose}>
              {t("confirm")}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
