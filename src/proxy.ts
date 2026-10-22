import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login$/, /^\/api\/inbound\//, /^\/api\/cron\//];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/preview" && process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  if (PUBLIC.some((re) => re.test(path)) || (process.env.NODE_ENV === "development" && path === "/preview")) return response;

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.redirect(new URL("/login", request.url));

  // Sessão do admin tem prazo: passado SESSION_MAX_HOURS desde o OTP, pede código de novo.
  const maxHours = 12;
  const authAt = Math.max(0, ...((data.claims.amr as { timestamp: number }[] | undefined) ?? []).map((m) => m.timestamp));
  if (!authAt || Date.now() / 1000 - authAt > maxHours * 3600) {
    await supabase.auth.signOut({ scope: "local" });
    const expired = NextResponse.redirect(new URL("/login?expired=1", request.url));
    response.cookies.getAll().forEach((cookie) => expired.cookies.set(cookie));
    return expired;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|woff2?)$).*)"],
};
