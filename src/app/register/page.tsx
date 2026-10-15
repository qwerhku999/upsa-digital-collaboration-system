import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create account | Project Hub" };

export default async function Register() {
  if (await getSessionUser()) redirect("/dashboard");
  return <AuthForm mode="register" />;
}
