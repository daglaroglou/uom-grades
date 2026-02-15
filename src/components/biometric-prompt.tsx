"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FingerPrintIcon } from "@hugeicons/core-free-icons";
import { useLocale } from "@/components/locale-provider";
import {
  tryRestoreFromCredentials,
  getStudentInfoIfLoggedIn,
} from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { StudentInfo } from "@/types";

interface BiometricPromptProps {
  onSuccess: (info: StudentInfo) => void;
  onFallback: () => void;
  /** When true, session was restored from cookies; just fetch student info after biometric. */
  sessionRestoredFromCookies?: boolean;
}

export function BiometricPrompt({
  onSuccess,
  onFallback,
  sessionRestoredFromCookies = false,
}: BiometricPromptProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { t } = useLocale();

  async function handleAuthenticate() {
    setError("");
    setLoading(true);

    try {
      const { authenticate } = await import("@tauri-apps/plugin-biometric");
      const { impactFeedback, notificationFeedback } = await import(
        "@tauri-apps/plugin-haptics"
      );

      await authenticate(t("authenticateToContinue"), {
        title: t("appTitle"),
        allowDeviceCredential: true,
      });

      // Success: haptic feedback then restore
      await impactFeedback("medium");
      const info = sessionRestoredFromCookies
        ? await getStudentInfoIfLoggedIn()
        : await tryRestoreFromCredentials();
      if (info) {
        onSuccess(info);
      } else {
        setError("Could not restore session");
        await notificationFeedback("error");
      }
    } catch (err) {
      const errStr = String(err);
      // User cancelled or biometric failed
      if (
        errStr.includes("userCancel") ||
        errStr.includes("systemCancel") ||
        errStr.includes("appCancel")
      ) {
        // User cancelled - no error message, just stay
        const { notificationFeedback } = await import(
          "@tauri-apps/plugin-haptics"
        );
        await notificationFeedback("warning");
      } else if (
        errStr.includes("biometryNotAvailable") ||
        errStr.includes("biometryNotEnrolled")
      ) {
        // Biometric not available - fall back to login
        onFallback();
      } else {
        setError(errStr);
        const { notificationFeedback } = await import(
          "@tauri-apps/plugin-haptics"
        );
        await notificationFeedback("error");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-bg fixed inset-0 flex items-center justify-center overflow-hidden bg-background p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-[400px]"
      >
        <Card className="overflow-hidden border-0 shadow-xl shadow-black/5 dark:shadow-black/20 ring-1 ring-border/50">
          <CardHeader className="text-center pb-2">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                delay: 0.1,
                type: "spring",
                stiffness: 200,
                damping: 20,
              }}
              className="flex flex-col items-center"
            >
              <div className="rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/10 dark:ring-primary/20 mb-4">
                <HugeiconsIcon
                  icon={FingerPrintIcon}
                  size={48}
                  className="text-primary"
                />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                {t("appTitle")}
              </CardTitle>
              <CardDescription className="mt-1.5 text-base">
                {t("authenticateToContinue")}
              </CardDescription>
            </motion.div>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <p className="text-sm text-destructive text-center">{error}</p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              size="lg"
              className="w-full"
              onClick={handleAuthenticate}
              disabled={loading}
            >
              {loading ? t("restoringSession") : t("authenticateButton")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={onFallback}
              disabled={loading}
            >
              {t("signIn")}
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
