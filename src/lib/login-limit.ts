type LimitClient = { rpc(name: string, args: { p_key: string; p_limit: number; p_seconds: number }): PromiseLike<{ data: unknown; error: unknown }> };
export type LoginLimitResult = "allowed" | "limited" | "unavailable";
export async function checkLoginLimit(db: LimitClient, key: string, limit: number, seconds: number): Promise<LoginLimitResult> {
  try {
    const result = await db.rpc("allow_auth_attempt", { p_key: key, p_limit: limit, p_seconds: seconds });
    if (result.error || typeof result.data !== "boolean") return "unavailable";
    return result.data ? "allowed" : "limited";
  } catch { return "unavailable"; }
}
