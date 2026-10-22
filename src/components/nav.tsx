"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";

type NavPlatform = { slug: string; name: string; color: string };

const sections: { path: string; label: string; icon: IconName }[] = [
  { path: "", label: "Visão geral", icon: "grid" },
  { path: "accounts", label: "Contas", icon: "users" },
  { path: "billing", label: "Cobranças", icon: "card" },
  { path: "plans", label: "Planos", icon: "layers" },
  { path: "support", label: "Suporte", icon: "inbox" },
  { path: "health", label: "Saúde", icon: "pulse" },
  { path: "audit", label: "Auditoria", icon: "list" },
];

/** /[platform]/[section]/... → { slug, section }. Fora do escopo de plataforma, slug = "all". */
function parse(pathname: string) {
  const [, first = "all", second = ""] = pathname.split("/");
  if (first === "platforms") return { slug: "all", section: "platforms" };
  return { slug: first, section: second };
}

export function SidebarNav({ openTickets }: { openTickets: number }) {
  const { slug, section } = parse(usePathname());
  return (
    <nav className="contents" aria-label="Seções">
      <p className="sidebar-label">Gestão</p>
      {sections.map((s) => (
        <Link key={s.path} href={`/${slug}${s.path ? `/${s.path}` : ""}`} className="nav-link" title={s.label} aria-label={s.label} aria-current={section === s.path ? "page" : undefined}>
          <Icon name={s.icon} className="h-4 w-4" />
          <span className="nav-label">{s.label}</span>
          {s.path === "support" && openTickets > 0 && <span className="nav-count">{openTickets}</span>}
        </Link>
      ))}
      <p className="sidebar-label">Configuração</p>
      <Link href="/platforms" className="nav-link" aria-label="Plataformas" title="Plataformas" aria-current={section === "platforms" ? "page" : undefined}>
        <Icon name="settings" className="h-4 w-4" />
        <span className="nav-label">Plataformas</span>
      </Link>
    </nav>
  );
}

export function PlatformSwitcher({ platforms }: { platforms: NavPlatform[] }) {
  const { slug, section } = parse(usePathname());
  const target = (s: string) => `/${s}${section && section !== "platforms" ? `/${section}` : ""}`;
  return (
    <nav className="switcher" aria-label="Plataforma">
      <Link href={target("all")} aria-current={slug === "all"}>
        <span className="dot" style={{ background: "conic-gradient(var(--accent), var(--info), var(--warn), var(--accent))" }} />
        Todas
      </Link>
      {platforms.map((p) => (
        <Link key={p.slug} href={target(p.slug)} aria-current={slug === p.slug}>
          <span className="dot" style={{ background: p.color }} />
          {p.name}
        </Link>
      ))}
    </nav>
  );
}
