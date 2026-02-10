"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LoginForm } from "@/components/login-form";
import { Dashboard } from "@/components/dashboard";
import { tryRestoreSession } from "@/lib/tauri";
import type { StudentInfo } from "@/types";

export default function Home() {
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [checking, setChecking] = useState(true);

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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-3"
        >
          <div className="text-4xl">🎓</div>
          <p className="text-sm text-muted-foreground">Restoring session...</p>
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
