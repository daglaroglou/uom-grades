"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { GraduationScrollIcon } from "@hugeicons/core-free-icons";
import { LoginForm } from "@/components/login-form";
import { Dashboard } from "@/components/dashboard";
import { tryRestoreSession } from "@/lib/tauri";
import { useLocale } from "@/components/locale-provider";
import type { StudentInfo } from "@/types";

export default function Home() {
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const { t } = useLocale();

  // Try to restore a saved session on launch
  useEffect(() => {
    tryRestoreSession()
      .then((info) => {
        if (info) setStudentInfo(info);
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
        {/* Subtle animated gradient background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/5" />
          <motion.div
            className="absolute inset-0 bg-gradient-to-tr from-primary/[0.07] via-transparent to-primary/[0.05]"
            animate={{
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col items-center gap-6 px-6"
        >
          {/* Icon with pulse animation */}
          <motion.div
            className="relative"
            animate={{
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" />
            <motion.div
              className="relative rounded-2xl bg-primary/5 p-6 ring-1 ring-primary/10 dark:ring-primary/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <HugeiconsIcon
                icon={GraduationScrollIcon}
                size={56}
                className="text-primary mx-auto block"
              />
            </motion.div>
          </motion.div>

          <div className="space-y-2 text-center">
            <motion.p
              className="text-base font-medium text-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {t("restoringSession")}
            </motion.p>
            <motion.p
              className="text-sm text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {t("appTitle")}
            </motion.p>
          </div>

          {/* Animated progress bar */}
          <motion.div
            className="h-1 w-48 overflow-hidden rounded-full bg-muted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            <motion.div
              className="h-full w-1/3 rounded-full bg-primary"
              animate={{
                x: ["0%", "200%"],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!studentInfo ? (
        <LoginForm key="login" onLogin={setStudentInfo} />
      ) : (
        <Dashboard
          key="dashboard"
          studentInfo={studentInfo}
          onLogout={() => setStudentInfo(null)}
        />
      )}
    </AnimatePresence>
  );
}
