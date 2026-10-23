"use client";
import { dateTime } from "@/lib/format";
import { Overlay } from "./overlay";
import { Icon } from "./icon";
export type AuditEntry = { actor: string; action: string; entity: string | null; entity_id: string | null; data: unknown; created_at: string };
export function AuditDetails({ entry, platform }: { entry: AuditEntry; platform: string }) {
  return <Overlay title="Detalhes da alteração" description={entry.action} variant="drawer" trigger={<><Icon name="list" className="h-4 w-4" />Ver detalhes</>}>
    {() => <><dl className="audit-metadata"><div><dt>Quando</dt><dd>{dateTime(entry.created_at)}</dd></div><div><dt>Responsável</dt><dd>{entry.actor}</dd></div><div><dt>Plataforma</dt><dd>{platform}</dd></div>{entry.entity && <div><dt>Registro</dt><dd>{entry.entity}{entry.entity_id && <> · <span className="font-mono text-xs">{entry.entity_id}</span></>}</dd></div>}</dl><h3 className="h2 mb-3">Dados registrados</h3><pre className="audit-json">{JSON.stringify(entry.data, null, 2)}</pre></>}
  </Overlay>;
}
