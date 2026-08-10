"use server";

import { redirect } from "next/navigation";
import { isCorrectPassword } from "@/lib/auth";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";

export type LoginState = { error?: string };

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  if (!password || !(await isCorrectPassword(password))) {
    return { error: "Incorrect password." };
  }

  await setSessionCookie();
  redirect("/");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}
