// Libera um email no portal: cria o usuário no Auth (se não existir) e adiciona em public.admins.
// Uso: pnpm admin:add voce@exemplo.com
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Uso: pnpm admin:add <email>");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const created = await db.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "admin" } });
let userId = created.data.user?.id;
if (created.error) {
  if (!["email_exists", "user_already_exists"].includes(created.error.code ?? "")) throw created.error;
  for (let page = 1; !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (data.users.length < 1000) break;
  }
}
if (!userId) throw new Error("Usuário não encontrado após criação.");
const { error } = await db.from("admins").upsert({ user_id: userId, email });
if (error) throw error;
console.log(`OK: ${email} pode entrar no portal (${userId}).`);
