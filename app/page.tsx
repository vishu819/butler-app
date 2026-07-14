import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import RegisterSW from "@/components/RegisterSW";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  return (
    <>
      <RegisterSW />
      <Dashboard name={profile?.name || "there"} />
    </>
  );
}
