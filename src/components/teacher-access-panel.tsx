import { Form } from "./form";
import { SubmitButton } from "./submit-button";
import { Icon } from "./icon";
import { managementConfigured, readTeacherAccess } from "@/lib/management";
import { updateLessonaraAccess } from "@/app/(shell)/actions";
export async function TeacherAccessPanel({ accountId, teacherId }: { accountId: string; teacherId: string }) {
  if (!managementConfigured()) return <section className="card card-pad"><h2 className="h2">Acesso ao Lessonara</h2><p className="mt-3 text-sm text-muted">Integração ainda não configurada. Alterações comerciais não modificam o acesso ao produto.</p></section>;
  let access;
  try { access = await readTeacherAccess(teacherId); } catch { return <section className="card card-pad"><h2 className="h2">Acesso ao Lessonara</h2><p role="status" className="mt-3 text-sm text-warn">Não foi possível consultar o acesso. Confira a conexão e a migração de administração antes de alterar esta conta.</p></section>; }
  if (!access) return <section className="card card-pad"><h2 className="h2">Acesso ao Lessonara</h2><p className="mt-3 text-sm text-muted">Esta conta não foi encontrada no Lessonara.</p></section>;
  return <section className="card card-pad"><div className="flex flex-wrap justify-between gap-3"><h2 className="h2">Acesso ao Lessonara</h2><span className={`badge ${access.access_suspended ? "badge-bad" : "badge-ok"}`}>{access.access_suspended ? "Suspenso" : "Liberado"}</span></div>
    <p className="mt-3 mb-5 text-sm text-muted">Controla as funcionalidades e o acesso do professor no portal e no desktop. Suspender preserva os dados e bloqueia a sessão do professor. O portal do aluno e as filas existentes são preservados.</p>
    <Form action={updateLessonaraAccess} className="space-y-4" key={access.access_revision}>
      <input type="hidden" name="id" value={accountId} /><input type="hidden" name="access_revision" value={access.access_revision} /><input type="hidden" name="operation" value={crypto.randomUUID()} />
      <div className="grid gap-4 sm:grid-cols-2"><div><label className="label" htmlFor="access_plan">Plano de funcionalidades *</label><select className="input" id="access_plan" name="access_plan" defaultValue={access.platform_plan} required><option value="essential">Essencial</option><option value="plus">Plus</option><option value="pro">Pro</option></select></div><div><label className="label" htmlFor="access_status">Acesso do professor *</label><select className="input" id="access_status" name="access_status" defaultValue={access.access_suspended ? "suspended" : "active"} required><option value="active">Liberado</option><option value="suspended">Suspenso</option></select></div></div>
      <div><label className="label" htmlFor="access_reason">Motivo da alteração *</label><textarea className="input" id="access_reason" name="reason" minLength={5} maxLength={500} required placeholder="Ex.: mudança de plano acordada com o professor" /></div>
      <div className="flex justify-end pt-2"><SubmitButton pendingLabel="Aplicando…"><Icon name="check" className="h-4 w-4" />Aplicar acesso</SubmitButton></div>
    </Form>
  </section>;
}
