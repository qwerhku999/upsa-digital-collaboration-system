import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in | Project Hub" };

export default async function Login() {
  if (await getSessionUser()) redirect("/dashboard");
  return <AuthForm mode="login" />;
}
