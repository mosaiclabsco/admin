import Link from "next/link";
import type { ReactNode, CSSProperties } from "react";
import { Icon } from "./icon";
import { monthLabel } from "@/lib/format";
import { shiftPeriod } from "@/lib/billing";

const accountStatus: Record<string, [string, string]> = {
  trial: ["Teste", "badge-info"],
  active: ["Ativa", "badge-ok"],
  suspended: ["Suspensa", "badge-warn"],
  cancelled: ["Cancelada", "badge-muted"],
};
export function AccountStatus({ status }: { status: string }) {
  const [label, tone] = accountStatus[status] ?? [status, "badge-muted"];
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function ChargeStatus({ status, overdue }: { status: string; overdue?: boolean }) {
  if (status === "paid") return <span className="badge badge-ok">Pago</span>;
  if (status === "waived") return <span className="badge badge-muted">Isento</span>;
  return overdue ? <span className="badge badge-bad">Atrasado</span> : <span className="badge badge-warn">Em aberto</span>;
}

const ticketStatus: Record<string, [string, string]> = {
  open: ["Aberto", "badge-bad"],
  waiting: ["Aguardando cliente", "badge-info"],
  closed: ["Fechado", "badge-muted"],
};
export function TicketStatus({ status }: { status: string }) {
  const [label, tone] = ticketStatus[status] ?? [status, "badge-muted"];
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function PlatformTag({ platform }: { platform: { name: string; color: string } | null | undefined }) {
  if (!platform) return <span className="text-xs text-muted">—</span>;
  return <span className="badge platform-tag" style={{ "--platform-color": platform.color } as CSSProperties}>{platform.name}</span>;
}

export function PageHead({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="h1">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

const statTone = { bad: "text-bad", ok: "text-ok", warn: "text-warn" } as const;
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "bad" | "ok" | "warn" }) {
  return (
    <div className="card stat">
      <p className="eyebrow">{label}</p>
      <p className={`stat-value ${tone ? statTone[tone] : ""}`}>{value}</p>
      {hint && <p className="stat-hint">{hint}</p>}
    </div>
  );
}

export function MonthNav({ base, period }: { base: string; period: string }) {
  const href = (p: string) => `${base}?m=${p.slice(0, 7)}`;
  return (
    <div className="flex items-center gap-1">
      <Link className="btn-ghost px-2" href={href(shiftPeriod(period, -1))} aria-label="Mês anterior"><Icon name="arrow" className="h-4 w-4 rotate-180" /></Link>
      <span className="min-w-36 text-center text-sm font-medium">{monthLabel(period)}</span>
      <Link className="btn-ghost px-2" href={href(shiftPeriod(period, 1))} aria-label="Próximo mês"><Icon name="arrow" className="h-4 w-4" /></Link>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-muted">{children}</p>;
}

const noticeTone = { info: "border-info/30 bg-info/5", warn: "border-warn/30 bg-warn/5", bad: "border-bad/30 bg-bad/5" } as const;
export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad"; children: ReactNode }) {
  return <div className={`mb-4 rounded-lg border px-4 py-3 text-sm text-fg ${noticeTone[tone]}`}>{children}</div>;
}
