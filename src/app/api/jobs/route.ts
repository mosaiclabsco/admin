import { createClient } from "@/lib/supabase/server";
import { loadJobsSnapshot } from "@/lib/jobs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store, private", Vary: "Cookie" };
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims)
    return Response.json(
      { error: "Entre novamente no admin." },
      { status: 401, headers },
    );
  const allowed = await db.rpc("is_admin");
  if (allowed.error || allowed.data !== true)
    return Response.json(
      { error: "Acesso restrito ao administrador." },
      { status: 403, headers },
    );
  const slug = new URL(request.url).searchParams.get("platform") ?? "all";
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug))
    return Response.json(
      { error: "Plataforma inválida." },
      { status: 400, headers },
    );
  try {
    return Response.json(await loadJobsSnapshot(slug), { headers });
  } catch {
    return Response.json(
      { error: "Não foi possível consultar os jobs." },
      { status: 503, headers },
    );
  }
}
