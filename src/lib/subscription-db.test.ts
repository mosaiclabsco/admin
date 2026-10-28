import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
let db: PGlite;
const operator = "00000000-0000-4000-8000-000000000001",
  outsider = "00000000-0000-4000-8000-000000000002";
const platform = "10000000-0000-4000-8000-000000000001",
  otherPlatform = "10000000-0000-4000-8000-000000000002";
const account = "20000000-0000-4000-8000-000000000001",
  otherAccount = "20000000-0000-4000-8000-000000000002";
const essential = "30000000-0000-4000-8000-000000000001",
  pro = "30000000-0000-4000-8000-000000000002",
  foreign = "30000000-0000-4000-8000-000000000003";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
 create table admins(user_id uuid,email text);
 create function public.is_admin() returns boolean language sql security definer as $$select exists(select 1 from public.admins where user_id=auth.uid())$$;
 create table platforms(id uuid primary key,slug text);
 create table plans(id uuid primary key,platform_id uuid references platforms,code text,name text,price_cents integer,active boolean);
 create table accounts(id uuid primary key,platform_id uuid references platforms,plan_id uuid references plans,price_override_cents integer,billing_day integer,status text);
 create table charges(id uuid primary key default gen_random_uuid(),account_id uuid,amount_cents integer,status text);
 create table audit_log(id uuid primary key default gen_random_uuid(),actor text,action text,platform_id uuid,entity text,entity_id text,data jsonb);
 `);
  for (const name of [
    "20261023000004_subscription_changes.sql",
    "20261027000008_immediate_subscription_changes.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`reset role;set test.role='service_role';set test.uid='${operator}';truncate subscription_changes,audit_log,charges,accounts,plans,platforms,admins cascade;
 insert into admins values('${operator}','operator@example.invalid');
 insert into platforms values('${platform}','lessonara'),('${otherPlatform}','other');
 insert into plans values('${essential}','${platform}','LSN-ESSENCIAL','Essencial',4900,true,'essential'),('${pro}','${platform}','LSN-PRO','Pro',9900,true,'pro'),('${foreign}','${otherPlatform}','OTHER','Other',1000,true,null);
 insert into accounts values('${account}','${platform}','${essential}',null,10,'active'),('${otherAccount}','${platform}','${essential}',null,10,'active');
 insert into charges(account_id,amount_cents,status) values('${account}',4900,'paid');
 set role authenticated;set test.role='authenticated';`);
});
async function request(
  mode?: string | null,
  id = randomUUID(),
  target = pro,
  expected = 9900,
  who = account,
) {
  const date = (
    await db.query<{ today: string }>(
      "select to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD') as today",
    )
  ).rows[0].today;
  const args: unknown[] = [
    who,
    target,
    null,
    4900,
    expected,
    10,
    date,
    id,
    0,
    false,
  ];
  if (mode !== undefined) args.push(mode);
  await db.query(
    `select public.${mode === undefined ? "schedule_subscription_change" : "request_subscription_change"}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
    args,
  );
  return id;
}
async function service() {
  await db.exec("reset role;set test.role='service_role'");
}
it("keeps the legacy renewal default and does not claim future changes", async () => {
  const id = await request();
  await service();
  const row = (
    await db.query<{
      application_mode: string;
      effective_on: string;
      requested_on: string;
    }>(
      "select application_mode,effective_on::text,requested_on::text from subscription_changes",
    )
  ).rows[0];
  expect(row.application_mode).toBe("renewal");
  expect(row.effective_on > row.requested_on).toBe(true);
  expect(
    (
      await db.query("select * from claim_requested_subscription_change($1)", [
        id,
      ])
    ).rows,
  ).toHaveLength(0);
});
it("applies immediately without changing billing day, charges or another account; replay is stable", async () => {
  const id = await request("now");
  expect(await request("now", id)).toBe(id);
  await service();
  const claimed = (
    await db.query<{
      claim_token: string;
      id: string;
      application_mode: string;
      effective_on: string;
      requested_on: string;
    }>("select * from claim_requested_subscription_change($1)", [id])
  ).rows;
  expect(claimed).toHaveLength(1);
  expect(claimed[0].application_mode).toBe("now");
  expect(claimed[0].effective_on).toEqual(claimed[0].requested_on);
  await db.query("select finish_subscription_change($1,$2,null)", [
    id,
    claimed[0].claim_token,
  ]);
  expect(
    (
      await db.query("select plan_id,billing_day from accounts where id=$1", [
        account,
      ])
    ).rows,
  ).toEqual([{ plan_id: pro, billing_day: 10 }]);
  expect(
    (await db.query("select plan_id from accounts where id=$1", [otherAccount]))
      .rows[0],
  ).toEqual({ plan_id: essential });
  expect(
    (await db.query("select amount_cents,status from charges")).rows,
  ).toEqual([{ amount_cents: 4900, status: "paid" }]);
  expect(
    (
      await db.query("select * from claim_requested_subscription_change($1)", [
        id,
      ])
    ).rows,
  ).toHaveLength(0);
  await db.query("select finish_subscription_change($1,$2,null)", [
    id,
    claimed[0].claim_token,
  ]);
  expect(
    (
      await db.query(
        "select * from audit_log where action='subscription.apply'",
      )
    ).rows,
  ).toHaveLength(1);
});
it("only claims the requested operation and preserves leases against a second executor", async () => {
  const one = await request("now"),
    two = await request("now", randomUUID(), pro, 9900, otherAccount);
  await service();
  expect(
    (
      await db.query<{ id: string }>(
        "select id from claim_requested_subscription_change($1)",
        [one],
      )
    ).rows,
  ).toEqual([{ id: one }]);
  expect(
    (
      await db.query("select * from claim_requested_subscription_change($1)", [
        one,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query("select status from subscription_changes where id=$1", [
        two,
      ])
    ).rows[0],
  ).toEqual({ status: "scheduled" });
  expect(
    (
      await db.query<{ id: string }>(
        "select id from claim_subscription_changes()",
      )
    ).rows,
  ).toEqual([{ id: two }]);
});
it("rejects outsiders, anonymous callers and direct low-privilege worker execution", async () => {
  await db.exec(`set test.uid='${outsider}'`);
  await expect(request("now")).rejects.toThrow(/insufficient_privilege/);
  await expect(
    db.exec("select * from claim_subscription_changes()"),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query("select * from claim_requested_subscription_change($1)", [
      randomUUID(),
    ]),
  ).rejects.toThrow(/permission denied/);
  await db.exec("reset role;set role anon");
  await expect(request("now")).rejects.toThrow(/permission denied/);
});
it("rejects foreign-platform plans, stale prices, invalid timing and duplicate pending changes", async () => {
  await expect(request("now", randomUUID(), foreign, 1000)).rejects.toThrow(
    /Plan unavailable/,
  );
  await expect(request("now", randomUUID(), pro, 1)).rejects.toThrow(
    /Quote changed/,
  );
  await expect(request("invalid")).rejects.toThrow(/Invalid timing/);
  await expect(request(null)).rejects.toThrow(/Invalid timing/);
  const id = await request("now");
  await expect(request("renewal", id)).rejects.toThrow(
    /Operation already used/,
  );
  await expect(request("now")).rejects.toThrow(/subscription_change_one_open/);
});
it("keeps commercial terms unchanged on source failure and prevents unauthorized finalization", async () => {
  const id = await request("now");
  await expect(
    db.query("select finish_subscription_change($1,$2,null)", [
      id,
      randomUUID(),
    ]),
  ).rejects.toThrow(/permission denied/);
  await service();
  const job = (
    await db.query<{ claim_token: string }>(
      "select * from claim_requested_subscription_change($1)",
      [id],
    )
  ).rows[0];
  await db.query("select finish_subscription_change($1,$2,$3)", [
    id,
    job.claim_token,
    "Source temporarily unavailable",
  ]);
  expect(
    (await db.query("select plan_id from accounts where id=$1", [account]))
      .rows[0],
  ).toEqual({ plan_id: essential });
  expect(
    (
      await db.query(
        "select status,attempts,last_error from subscription_changes where id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({
    status: "scheduled",
    attempts: 1,
    last_error: "Source temporarily unavailable",
  });
});

it("allows cancellation before execution and prevents cancellation of a partially attempted change", async () => {
  const id = await request("now");
  await db.query("select cancel_subscription_change($1)", [id]);
  const next = await request("now");
  await service();
  const job = (
    await db.query<{ claim_token: string }>(
      "select * from claim_requested_subscription_change($1)",
      [next],
    )
  ).rows[0];
  await db.query("select finish_subscription_change($1,$2,$3)", [
    next,
    job.claim_token,
    "temporary failure",
  ]);
  await db.exec("set role authenticated;set test.role='authenticated'");
  await expect(
    db.query("select cancel_subscription_change($1)", [next]),
  ).rejects.toThrow(/cannot be cancelled/);
});
