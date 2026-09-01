"use client";

import { useActionState } from "react";
import Link from "next/link";
import { GraduationCap, ArrowLeft } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion/fade-in";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    undefined
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f8fafc] p-4">
      <Link
        href="/"
        className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        <ArrowLeft className="h-4 w-4" /> Back to website
      </Link>
      <FadeIn>
        <Card className="w-full max-w-sm shadow-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[#1e3a5f] text-white">
            <GraduationCap className="h-8 w-8" />
          </div>
          <CardTitle className="text-xl text-[#1e3a5f]">Admin Login</CardTitle>
          <CardDescription>
            Cantonment Public School &amp; College, Rangpur
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {state?.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" disabled={pending} className="w-full bg-[#1e3a5f] hover:bg-[#162c44]">
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </FadeIn>
    </div>
  );
}
