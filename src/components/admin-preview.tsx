"use client";
import { Brand } from "./brand";
import { useState } from "react";
import { WorkspaceShell } from "./workspace-shell";
import { Icon, type IconName } from "./icon";
import { PageHead, Stat, AccountStatus, ChargeStatus } from "./ui";
const sections: { id: string; label: string; icon: IconName }[] = [{ id:"accounts",label:"Professores",icon:"users" },{ id:"billing",label:"Pagamentos",icon:"card" },{ id:"audit",label:"Auditoria",icon:"list" }];
const rows = [{name:"Professora de demonstração",email:"professora@example.invalid",plan:"Pro",status:"active",students:8,price:"R$ 99,00"},{name:"Professor em avaliação",email:"professor@example.invalid",plan:"Plus",status:"trial",students:3,price:"R$ 79,00"},{name:"Conta de demonstração",email:"conta@example.invalid",plan:"Essencial",status:"suspended",students:0,price:"R$ 49,00"}];
export function AdminPreview() {
 const [section,setSection]=useState("accounts");
 return <WorkspaceShell email="admin@example.invalid" brand={<Brand />} nav={<nav className="contents" aria-label="Prévia das seções"><p className="sidebar-label">Gestão</p>{sections.map(s=><button type="button" key={s.id} onClick={()=>setSection(s.id)} className="nav-link" title={s.label} aria-label={s.label} aria-current={section===s.id?"page":undefined}><Icon name={s.icon} className="h-4 w-4" /><span className="nav-label">{s.label}</span></button>)}</nav>} switcher={<span className="inline-flex items-center gap-2 text-sm font-medium"><span className="dot bg-accent" />Lessonara</span>}>
  <div className="mb-6 rounded-xl border border-warn/25 bg-warn/5 px-4 py-3 text-sm">Prévia local · dados fictícios · nenhuma alteração em contas ou pagamentos reais.</div>
  <PageHead title={sections.find(s=>s.id===section)!.label} description="Acompanhe as contas, assinaturas e acessos do Lessonara." />
  <div className="stats"><Stat label="Contas ativas" value="1" hint="Dados de demonstração" /><Stat label="Em avaliação" value="1" /><Stat label="Recebido no mês" value="R$ 99,00" tone="ok" /><Stat label="Acesso suspenso" value="1" tone="warn" /></div>
  {section==="accounts" && <section className="card table-wrap"><table className="table"><thead><tr><th>Professor</th><th>Plano</th><th>Situação comercial</th><th>Alunos</th><th>Mensalidade</th></tr></thead><tbody>{rows.map(row=><tr key={row.email}><td><p className="font-medium">{row.name}</p><p className="mt-1 text-xs text-muted">{row.email}</p></td><td>{row.plan}</td><td><AccountStatus status={row.status} /></td><td>{row.students}</td><td className="tabular">{row.price}</td></tr>)}</tbody></table></section>}
  {section==="billing" && <section className="card table-wrap"><table className="table"><thead><tr><th>Professor</th><th>Referência</th><th>Valor</th><th>Estado</th></tr></thead><tbody>{rows.map((row,i)=><tr key={row.email}><td>{row.name}</td><td>Outubro de 2026</td><td>{row.price}</td><td><ChargeStatus status={i===0?"paid":"pending"} overdue={i===2} /></td></tr>)}</tbody></table></section>}
  {section==="audit" && <section className="card card-pad"><h2 className="h2">Rastreabilidade das alterações</h2><p className="mt-3 text-sm text-muted">Na versão conectada, alterações de acesso registram administrador, professor, motivo, estado anterior e novo estado. Confirmações de pagamento são gravadas junto com o histórico na mesma transação.</p><p className="mt-4 text-sm text-accent">Nenhum evento real nesta prévia.</p></section>}
 </WorkspaceShell>;
}
