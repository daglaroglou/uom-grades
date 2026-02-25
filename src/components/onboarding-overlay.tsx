"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";

const ONBOARDING_KEY = "uom-grades-onboarding-completed";

export function OnboardingOverlay({
  visible,
  onComplete,
  hasGrades,
}: {
  visible: boolean;
  onComplete: () => void;
  hasGrades: boolean;
}) {
  const { t } = useLocale();
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const steps = [
    {
      title: t("onboardingStep1Title"),
      description: t("onboardingStep1Desc"),
    },
    {
      title: t("onboardingStep2Title"),
      description: t("onboardingStep2Desc"),
    },
    {
      title: t("onboardingStep3Title"),
      description: t("onboardingStep3Desc"),
    },
  ];

  const isLastStep = step === steps.length - 1;

  function handleNext() {
    if (isLastStep) {
      if (dontShowAgain) {
        localStorage.setItem(ONBOARDING_KEY, "true");
      }
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleSkip() {
    if (dontShowAgain) {
      localStorage.setItem(ONBOARDING_KEY, "true");
    }
    onComplete();
  }

  if (!visible || !hasGrades) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-desc"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-md rounded-xl border bg-popover p-6 shadow-2xl ring-1 ring-border/50"
        >
          <h2 id="onboarding-title" className="text-lg font-semibold">
            {steps[step].title}
          </h2>
          <p id="onboarding-desc" className="mt-2 text-sm text-muted-foreground">
            {steps[step].description}
          </p>

          {/* Progress dots */}
          <div className="mt-4 flex gap-2" aria-hidden="true">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="rounded border-border"
              />
              {t("onboardingDontShowAgain")}
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                {t("onboardingSkip")}
              </Button>
              <Button size="sm" onClick={handleNext}>
                {isLastStep ? t("onboardingGotIt") : t("onboardingNext")}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function shouldShowOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ONBOARDING_KEY) !== "true";
}
