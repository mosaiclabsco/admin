import { cache } from "react";
import { notFound } from "next/navigation";
import { requireAdmin } from "./supabase/server";

export type Platform = { id: string; slug: string; name: string; url: string | null; color: string; support_email: string | null; active: boolean };

export const listPlatforms = cache(async function listPlatforms() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("platforms").select("id,slug,name,url,color,support_email,active").order("name");
  if (error) throw new Error("Não foi possível carregar as plataformas.");
  return data as Platform[];
});

/** Resolve o segmento da URL: "all" = visão consolidada, senão o slug da plataforma. */
export async function resolveScope(slug: string) {
  const platforms = await listPlatforms();
  if (slug === "all") return { platform: null, platforms };
  const platform = platforms.find((p) => p.slug === slug);
  if (!platform) notFound();
  return { platform, platforms };
}
