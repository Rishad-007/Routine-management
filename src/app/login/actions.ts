"use server";

import { redirect } from "next/navigation";
import { createSession, verifyAdminCredentials } from "@/lib/auth";

export type LoginState = { error?: string } | undefined;

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Please enter both username and password." };
  }

  const session = await verifyAdminCredentials(username, password);
  if (!session) {
    return { error: "Invalid username or password." };
  }

  await createSession(session.id, session.username, session.role);
  redirect("/admin");
}
