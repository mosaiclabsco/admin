"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icon";
import { signOut } from "@/app/login/actions";
export function WorkspaceShell({ brand, nav, switcher, email, children }: { brand: ReactNode; nav: ReactNode; switcher: ReactNode; email: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const profile = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function outside(e: PointerEvent) { if (!profile.current?.contains(e.target as Node)) setOpen(false); }
    function escape(e: KeyboardEvent) { if(e.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <div className={`shell ${collapsed ? "is-collapsed" : ""}`}>
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    <aside className="sidebar" id="admin-navigation" aria-label="Menu administrativo">
      <div className="sidebar-head"><div className="brand-container" hidden={collapsed}>{brand}</div><button className="menu-button" type="button" aria-label={collapsed ? "Expandir menu" : "Recolher menu"} aria-controls="admin-navigation" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><Icon name="menu" /></button></div>{nav}
    </aside>
    <div className="workspace"><header className="topbar">{switcher}
      <div className="profile-menu" ref={profile}><button className="profile-trigger" type="button" aria-expanded={open} aria-controls="profile-options" aria-label="Sua conta administrativa" onClick={() => setOpen(!open)}><span className="profile-avatar">{email.slice(0,2).toUpperCase()}</span><span className="profile-label">Administrador</span><Icon name="chevron" className="h-4 w-4" /></button>
      {open && <div className="profile-options" id="profile-options"><p className="truncate text-xs text-muted" title={email}>{email}</p><form action={signOut}><button className="menu-action" type="submit"><Icon name="logout" className="h-4 w-4" />Sair</button></form></div>}</div>
    </header><div className="workspace-scroll"><main className="content" id="main-content">{children}</main></div></div>
  </div>;
}
