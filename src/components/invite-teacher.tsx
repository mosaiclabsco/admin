"use client";
import { Form } from "./form";
import { SubmitButton } from "./submit-button";
import { Icon } from "./icon";
import { Overlay } from "./overlay";
import { inviteLessonaraTeacher } from "@/app/(shell)/actions";
export function InviteTeacher({
  plans,
}: {
  plans: { id: string; name: string }[];
}) {
  return (
    <Overlay
      title="Convidar professor"
      description="O professor recebe um link e escolhe a própria senha."
      trigger={
        <>
          <Icon name="mail" className="h-4 w-4" />
          Convidar professor
        </>
      }
      triggerClass="btn"
    >
      {(close) => (
        <Form
          action={inviteLessonaraTeacher}
          onSuccess={close}
          className="space-y-5"
        >
          <div>
            <label className="label" htmlFor="invite-name">
              Nome *
            </label>
            <input
              className="input"
              id="invite-name"
              name="name"
              required
              maxLength={120}
            />
          </div>
          <div>
            <label className="label" htmlFor="invite-email">
              Email *
            </label>
            <input
              className="input"
              id="invite-email"
              name="email"
              type="email"
              required
              maxLength={254}
            />
          </div>
          <div>
            <label className="label" htmlFor="invite-plan">
              Plano inicial
            </label>
            <select
              className="input"
              id="invite-plan"
              name="plan_id"
              defaultValue=""
            >
              <option value="">Essencial · configurar assinatura depois</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted">
              Contas novas começam em avaliação. Para contas existentes, o plano
              atual é preservado.
            </p>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={close}>
              <Icon name="x" className="h-4 w-4" />
              Cancelar
            </button>
            <SubmitButton pendingLabel="Enviando…">
              <Icon name="mail" className="h-4 w-4" />
              Enviar convite
            </SubmitButton>
          </div>
        </Form>
      )}
    </Overlay>
  );
}
