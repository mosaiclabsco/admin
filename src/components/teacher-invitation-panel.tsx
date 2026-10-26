import { teacherInvitationStatus } from "@/lib/teacher-invitations";
import { dateTime } from "@/lib/format";
import { Form } from "./form";
import { SubmitButton } from "./submit-button";
import { Icon } from "./icon";
import { resendLessonaraInvitation } from "@/app/(shell)/actions";
export async function TeacherInvitationPanel({
  accountId,
  teacherId,
}: {
  accountId: string;
  teacherId: string;
}) {
  const status = await teacherInvitationStatus(teacherId);
  return (
    <section className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="h2">Convite e acesso</h2>
          <p className="mt-2 text-sm text-muted">
            {!status
              ? "Não foi possível consultar o acesso."
              : status.passwordDefinedAt
                ? `Senha definida em ${dateTime(status.passwordDefinedAt)}`
                : status.invitedAt
                  ? `Convite pendente · envio aceito em ${dateTime(status.invitedAt)}`
                  : status.lastSignInAt
                    ? "Conta já acessada pelo professor"
                    : "Aguardando envio do convite"}
          </p>
          <p className="mt-2 text-xs text-muted">
            O destinatário define a senha pelo link recebido.
          </p>
        </div>
        <Form action={resendLessonaraInvitation}>
          <input type="hidden" name="account_id" value={accountId} />
          <SubmitButton
            className="btn-ghost"
            pendingLabel="Enviando…"
            disabled={!status}
          >
            <Icon name="mail" className="h-4 w-4" />
            {status?.invitedAt ? "Reenviar link" : "Enviar link de acesso"}
          </SubmitButton>
        </Form>
      </div>
    </section>
  );
}
