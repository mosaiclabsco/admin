const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

export const money = (cents: number | null | undefined) => brl.format((cents ?? 0) / 100);
/** "2026-10-05" (date do Postgres) → "05/10/2026", sem deslocar fuso. */
export const date = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : "—");
export const dateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");
export const monthLabel = (period: string) => {
  const label = monthFmt.format(new Date(`${period}T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** "149,90" | "149.90" | "R$ 1.249,90" → centavos. */
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[R$\s]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export function relative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "nunca";
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} dias`;
}
