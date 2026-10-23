"use client";
import { useState } from "react";
import type { PlanRow } from "@/lib/queries";
import { savePlan } from "@/app/(shell)/actions";
import { Overlay } from "./overlay";
import { Form } from "./form";
import { SubmitButton } from "./submit-button";
import { Icon } from "./icon";

export function PlanEditor({ plan, platforms, defaultPlatform }: { plan?: PlanRow; platforms: { id: string; name: string; slug: string }[]; defaultPlatform?: string }) {
  const [platformId, setPlatformId] = useState(plan?.platform_id ?? defaultPlatform ?? platforms[0]?.id);
  const isLessonara = platforms.some(p => p.id === platformId && p.slug === "lessonara");
  return <Overlay title={plan ? "Editar plano" : "Criar plano"} description="Defina o cadastro comercial. Valores de cobranças já emitidas permanecem preservados." trigger={<><Icon name={plan ? "edit" : "plus"} className="h-4 w-4" />{plan ? "Editar" : "Novo plano"}</>} triggerClass={plan ? "btn-ghost" : "btn"}>
    {close => <Form action={savePlan} onSuccess={close}>
      {plan ? <input type="hidden" name="id" value={plan.id} /> : <div className="mb-5"><label className="label" htmlFor="plan-platform">Plataforma</label><select className="input" id="plan-platform" name="platform_id" value={platformId} onChange={e => setPlatformId(e.target.value)} required>{platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label className="label" htmlFor="plan-code">Código do plano</label><input className="input" id="plan-code" name="code" defaultValue={plan?.code} placeholder="LSN-PRO" maxLength={40} required /></div>
        <div><label className="label" htmlFor="plan-name">Nome</label><input className="input" id="plan-name" name="name" defaultValue={plan?.name} maxLength={100} required /></div>
        <div><label className="label" htmlFor="plan-price">Preço mensal (R$)</label><input className="input" id="plan-price" name="price" inputMode="decimal" defaultValue={plan ? (plan.price_cents / 100).toFixed(2).replace(".", ",") : undefined} placeholder="0,00" required /></div>
        <div><label className="label" htmlFor="plan-active">Status</label><select className="input" id="plan-active" name="active" defaultValue={plan?.active === false ? "off" : "on"}><option value="on">Ativo</option><option value="off">Inativo</option></select></div>
        {isLessonara && <div className="sm:col-span-2"><label className="label" htmlFor="plan-feature">Acesso no Lessonara</label><select className="input" id="plan-feature" name="feature_tier" defaultValue={plan?.feature_tier ?? ""} required><option value="" disabled>Selecione as funcionalidades</option><option value="essential">Essencial</option><option value="plus">Plus</option><option value="pro">Pro</option></select><p className="mt-2 text-xs text-muted">Aplicado na renovação junto com a assinatura comercial.</p></div>}
        <div className="sm:col-span-2"><label className="label" htmlFor="plan-notes">Observação</label><textarea className="input min-h-24" id="plan-notes" name="notes" defaultValue={plan?.notes ?? ""} maxLength={2000} /></div>
      </div>
      <div className="dialog-actions"><button type="button" className="btn-ghost" onClick={close}><Icon name="x" className="h-4 w-4" />Cancelar</button><SubmitButton><Icon name="save" className="h-4 w-4" />{plan ? "Salvar plano" : "Criar plano"}</SubmitButton></div>
    </Form>}
  </Overlay>;
}
