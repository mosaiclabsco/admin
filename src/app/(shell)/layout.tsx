import Link from "next/link";
import { Brand } from "@/components/brand";
import { requireAdmin } from "@/lib/supabase/server";
import { listPlatforms } from "@/lib/platforms";
import { PlatformSwitcher, SidebarNav } from "@/components/nav";
import { WorkspaceShell } from "@/components/workspace-shell";

export default async function ShellLayout({ children }: LayoutProps<"/">) {
  const { supabase, email } = await requireAdmin();
  const [platforms, open] = await Promise.all([
    listPlatforms(),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  return <WorkspaceShell email={email} brand={<Link href="/all" aria-label="Mosaic Labs Admin"><Brand /></Link>} nav={<SidebarNav openTickets={open.count ?? 0} />} switcher={<PlatformSwitcher platforms={platforms.filter((p) => p.active)} />}>{children}</WorkspaceShell>;
}
