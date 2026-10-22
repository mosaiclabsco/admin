import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { lessonaraAccounts } from "@/lib/connectors/lessonara";
import { syncAccounts } from "@/lib/connectors";
import { listAccounts } from "@/lib/queries";

const enabled = process.env.LIVE_CONNECTOR_VALIDATE === "1";
describe.skipIf(!enabled)("explicit live connector verification", () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  let outsiderId: string | undefined;
  let ownerClient: SupabaseClient | undefined;
  const service = () => createClient(url, process.env.SUPABASE_SECRET_KEY!, options);
  afterAll(async () => {
    if (ownerClient) await ownerClient.auth.signOut({ scope: "local" });
    if (outsiderId) await service().auth.admin.deleteUser(outsiderId);
  });

  it("syncs actual teachers by source ID with admin RLS, while rejecting anonymous and outsider access", async () => {
    expect(process.env.LIVE_ADMIN_EXPECTED_URL).toBeTruthy();
    expect(url).toBe(process.env.LIVE_ADMIN_EXPECTED_URL);
    expect(process.env.LIVE_LESSONARA_EXPECTED_URL).toBeTruthy();
    expect(process.env.LESSONARA_SUPABASE_URL).toBe(process.env.LIVE_LESSONARA_EXPECTED_URL);
    expect(url).not.toBe(process.env.LESSONARA_SUPABASE_URL);
    const source = createClient(process.env.LESSONARA_SUPABASE_URL!, process.env.LESSONARA_SUPABASE_SECRET_KEY!, options);
    const teachers = await lessonaraAccounts(source);
    expect(teachers.length).toBeGreaterThan(0);
    const email = process.env.ADMIN_OWNER_EMAIL!;
    expect(email).toBeTruthy();
    const otp = await service().auth.admin.generateLink({ type: "magiclink", email });
    expect(otp.error).toBeNull();
    const jar = new Map<string, string>();
    const admin = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => jar.set(name, value)) },
    });
    ownerClient = admin;
    expect((await admin.auth.verifyOtp({ email, token: otp.data.properties!.email_otp, type: "email" })).error).toBeNull();
    expect((await admin.rpc("is_admin")).data).toBe(true);
    const platform = await admin.from("platforms").select("id").eq("slug", "lessonara").single();
    expect(platform.error).toBeNull();
    const result = await syncAccounts(admin, platform.data!.id, teachers);
    expect(result).toEqual({ upserted: teachers.length, missing: 0 });
    const first = await listAccounts(admin, platform.data!.id);
    expect(first.map(a => a.external_id).sort()).toEqual(teachers.map(t => t.externalId).sort());
    await syncAccounts(admin, platform.data!.id, teachers);
    const second = await listAccounts(admin, platform.data!.id);
    expect(second.map(a => a.id).sort()).toEqual(first.map(a => a.id).sort());
    const audit = await admin.from("audit_log").insert({ actor: email, action: "account.sync", platform_id: platform.data!.id, data: { ...result, source: "lessonara" } });
    expect(audit.error).toBeNull();
    const access = await source.from("teachers").select("id,platform_plan,access_suspended,access_revision");
    expect(access.error).toBeNull();
    expect(access.data!.length).toBe(teachers.length);
    const publicDb = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options);
    expect((await publicDb.from("accounts").select("id")).data ?? []).toEqual([]);
    const outsiderEmail = `access-check-${randomUUID()}@example.invalid`;
    const outsider = await service().auth.admin.createUser({ email: outsiderEmail, email_confirm: true });
    expect(outsider.error).toBeNull(); outsiderId = outsider.data.user!.id;
    const outsiderOtp = await service().auth.admin.generateLink({ type: "magiclink", email: outsiderEmail });
    expect(outsiderOtp.error).toBeNull();
    expect((await publicDb.auth.verifyOtp({ email: outsiderEmail, token: outsiderOtp.data.properties!.email_otp, type: "email" })).error).toBeNull();
    expect((await publicDb.rpc("is_admin")).data).toBe(false);
    expect(await listAccounts(publicDb)).toEqual([]);
    await publicDb.auth.signOut({ scope: "local" });
    // Keep the owner session only long enough for authenticated HTTP checks in this test.
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    for (const path of ["/all", "/lessonara/accounts", "/lessonara/billing", `/lessonara/accounts/${first[0].id}`]) {
      const res = await fetch(`http://127.0.0.1:3100${path}`, { headers: { cookie }, redirect: "manual" });
      const html = await res.text();
      expect(res.status, path).toBe(200);
      expect(html, path).not.toContain("Algo deu errado");
      expect(html, path).not.toContain("NEXT_REDIRECT");
    }
    writeFileSync("/private/tmp/mosaic-admin-live-validation.json", JSON.stringify({ teachers: teachers.length, linkedAccounts: second.length, stableIds: true, adminRls: true, anonymousDenied: true, outsiderDenied: true, authenticatedPages: 4 }), { mode: 0o600 });
  }, 90000);
});
