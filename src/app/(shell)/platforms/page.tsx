import { requireAdmin } from "@/lib/supabase/server";
import { listPlatforms } from "@/lib/platforms";
import { connectorFor } from "@/lib/connectors";
import { PageHead } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { savePlatform } from "../actions";

export default async function Platforms() {
  await requireAdmin();
  const platforms = await listPlatforms();
  return (
    <>
      <PageHead eyebrow="Configuração" title="Plataformas" description="Cada produto da Mosaic Labs. O email de suporte roteia os emails recebidos para a plataforma certa." />
      <div className="grid gap-4 md:grid-cols-2">
        {platforms.map((p) => {
          const connector = connectorFor(p.slug);
          return (
            <section key={p.id} className="card card-pad">
              <div className="mb-4 flex items-center gap-2">
                <span className="dot h-3 w-3" style={{ background: p.color }} />
                <h2 className="font-semibold">{p.name}</h2>
                <span className="font-mono text-xs text-muted">/{p.slug}</span>
                <span className="ml-auto text-xs text-muted">{connector ? (connector.configured() ? "conector ativo" : "conector sem credenciais") : "contas manuais"}</span>
              </div>
              <Form action={savePlatform} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={p.id} />
                <div><label className="label">Nome</label><input className="input" name="name" defaultValue={p.name} required /></div>
                <div><label className="label">Cor</label><input className="input h-[38px] p-1" type="color" name="color" defaultValue={p.color} /></div>
                <div><label className="label">URL</label><input className="input" name="url" defaultValue={p.url ?? ""} /></div>
                <div><label className="label">Email de suporte</label><input className="input" name="support_email" type="email" defaultValue={p.support_email ?? ""} /></div>
                <div><label className="label">Status</label><select className="input" name="active" defaultValue={p.active ? "on" : "off"}><option value="on">Ativa</option><option value="off">Oculta no seletor</option></select></div>
                <div className="flex items-end"><SubmitButton>Salvar</SubmitButton></div>
              </Form>
            </section>
          );
        })}
      </div>
      <section className="card card-pad mt-4">
        <h2 className="h2 mb-3">Nova plataforma</h2>
        <Form action={savePlatform} resetOnSuccess className="grid gap-3 sm:grid-cols-6 sm:items-end">
          <div><label className="label">Nome</label><input className="input" name="name" required /></div>
          <div><label className="label">Slug (URL)</label><input className="input font-mono" name="slug" placeholder="minha-app" required /></div>
          <div><label className="label">URL</label><input className="input" name="url" placeholder="https://" /></div>
          <div><label className="label">Email de suporte</label><input className="input" name="support_email" type="email" /></div>
          <div><label className="label">Cor</label><input className="input h-[38px] p-1" type="color" name="color" defaultValue="#80679c" /></div>
          <SubmitButton>Criar</SubmitButton>
        </Form>
      </section>
    </>
  );
}
