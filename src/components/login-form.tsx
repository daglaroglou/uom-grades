"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { GraduationScrollIcon } from "@hugeicons/core-free-icons";
import { useLocale } from "@/components/locale-provider";
import { login } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StudentInfo } from "@/types";

interface LoginFormProps {
  onLogin: (info: StudentInfo) => void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useLocale();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const info = await login(username, password);
      onLogin(info);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-bg flex min-h-screen items-center justify-center p-4 bg-background">
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
              transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
              className="flex flex-col items-center"
            >
              <div className="rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/10 dark:ring-primary/20 mb-4">
                <HugeiconsIcon
                  icon={GraduationScrollIcon}
                  size={48}
                  className="text-primary"
                />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                {t("appTitle")}
              </CardTitle>
              <CardDescription className="mt-1.5 text-base">
                {t("signInPrompt")}
              </CardDescription>
            </motion.div>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5 pt-2">
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Label htmlFor="username" className="text-sm font-medium">
                  {t("username")}
                </Label>
                <Input
                  id="username"
                  placeholder={t("usernamePlaceholder")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  className="h-11 rounded-lg border-border/80 bg-muted/30 focus:bg-background transition-colors"
                />
              </motion.div>

              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.28 }}
              >
                <Label htmlFor="password" className="text-sm font-medium">
                  {t("password")}
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t("passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 rounded-lg border-border/80 bg-muted/30 focus:bg-background transition-colors"
                />
              </motion.div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2"
                >
                  <p className="text-sm text-destructive font-medium">
                    {error}
                  </p>
                </motion.div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-4 pt-2">
              <Button
                type="submit"
                className="h-11 w-full rounded-lg font-medium text-base"
                disabled={loading}
              >
                {loading ? t("signingIn") : t("signIn")}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {t("ssoFooter")}
              </p>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
