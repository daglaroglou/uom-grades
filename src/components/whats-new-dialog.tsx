"use client";

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { motion, AnimatePresence } from "motion/react";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { CHANGELOG } from "@/lib/changelog";

const LAST_SEEN_VERSION_KEY = "uom-grades-last-seen-version";

function parseVersion(v: string): [number, number, number] {
  const parts = v.replace(/^v/, "").split(".");
  return [
    parseInt(parts[0] ?? "0", 10) || 0,
    parseInt(parts[1] ?? "0", 10) || 0,
    parseInt(parts[2] ?? "0", 10) || 0,
  ];
}

function versionGt(a: string, b: string): boolean {
  const [am, ai, ap] = parseVersion(a);
  const [bm, bi, bp] = parseVersion(b);
  if (am !== bm) return am > bm;
  if (ai !== bi) return ai > bi;
  return ap > bp;
}

export function shouldShowWhatsNew(currentVersion: string): boolean {
  if (typeof window === "undefined") return false;
  const last = localStorage.getItem(LAST_SEEN_VERSION_KEY);
  if (!last) return false; // First run: don't show (onboarding covers that)
  return versionGt(currentVersion, last);
}

export function markWhatsNewSeen(version: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
}

interface WhatsNewDialogProps {
  open: boolean;
  version: string;
  onClose: () => void;
}

export function WhatsNewDialog({ open, version, onClose }: WhatsNewDialogProps) {
  const { t } = useLocale();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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

  const entries = CHANGELOG[version] ?? [t("whatsNewGeneric")];

  if (!open) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
      >
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-xl border bg-popover p-6 shadow-xl ring-1 ring-border/50"
        >
          <h2 id="whats-new-title" className="text-lg font-semibold">
            {t("whatsNewTitle", { version })}
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {entries.map((entry, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{entry}</span>
              </li>
            ))}
          </ul>
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
