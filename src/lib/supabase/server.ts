import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Cliente com a sessão do admin logado. Toda tabela tem RLS com is_admin(). */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado de Server Component: o proxy já renova a sessão.
        }
      },
    },
  });
});

/** Ignora RLS. Login, webhook, cron e operações privilegiadas após validar o admin. */
export function createServiceClient() {
  return createSupabaseClient(url, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Garante sessão de admin; páginas e actions chamam antes de qualquer leitura. */
export const requireAdmin = cache(async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const access = await supabase.rpc("is_admin");
  if (access.error || access.data !== true) redirect("/login?denied=1");
  const admin = await supabase.from("admins").select("email").eq("user_id", data.claims.sub).maybeSingle();
  if (admin.error || !admin.data) redirect("/login?denied=1");
  return { supabase, userId: data.claims.sub as string, email: admin.data.email as string };
});
