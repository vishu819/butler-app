import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import RegisterSW from "@/components/RegisterSW";
import Dashboard from "@/components/Dashboard";
import Onboarding from "@/components/Onboarding";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, onboarded")
    .eq("id", user.id)
    .single();

  // First login: run the intro wizard before showing the dashboard.
  if (!profile?.onboarded) {
    return (
      <>
        <RegisterSW />
        <Onboarding initialName={profile?.name || ""} email={user.email || ""} />
      </>
    );
  }

  return (
    <>
      <RegisterSW />
      <Dashboard name={profile?.name || "there"} email={user.email || ""} />
    </>
  );
}
