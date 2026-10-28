import { requireAdmin } from "@/lib/supabase/server";
import { listPlatforms } from "@/lib/platforms";
import { connectorFor } from "@/lib/connectors";
import { PageHead, PlatformTag } from "@/components/ui";
export default async function Platforms() {
  await requireAdmin();
  const platforms = await listPlatforms();
  return (
    <>
      <PageHead
        eyebrow="Configuração"
        title="Plataformas"
        description="Produtos da Mosaic Labs e suas informações de integração e suporte."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {platforms.map((platform) => {
          const connector = connectorFor(platform.slug);
          return (
            <section key={platform.id} className="card card-pad">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <h2>
                  <PlatformTag platform={platform} />
                </h2>
                <span
                  className={`badge ${platform.active ? "badge-ok" : "badge-muted"}`}
                >
                  {platform.active ? "Ativa" : "Oculta no seletor"}
                </span>
              </div>
              <dl className="platform-details">
                <div>
                  <dt>Endereço</dt>
                  <dd>
                    {platform.url ? (
                      <a
                        className="link break-all"
                        href={platform.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {platform.url}
                      </a>
                    ) : (
                      "Não informado"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Email de suporte</dt>
                  <dd className="break-all">
                    {platform.support_email ?? "Não informado"}
                  </dd>
                </div>
                <div>
                  <dt>Integração</dt>
                  <dd>
                    {connector
                      ? connector.configured()
                        ? "Conector ativo"
                        : "Conector sem credenciais"
                      : "Contas manuais"}
                  </dd>
                </div>
              </dl>
            </section>
          );
        })}
      </div>
    </>
  );
}
