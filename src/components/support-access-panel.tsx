"use client";
import { useState } from "react";
import {
  requestSupportAccess,
  confirmSupportAccess,
} from "@/app/(shell)/support-actions";
import { Form } from "./form";
import { SubmitButton } from "./submit-button";
import { Icon } from "./icon";
import { Overlay } from "./overlay";
export function SupportAccessPanel({ accountId }: { accountId: string }) {
  return (
    <section className="card card-pad">
      <h2 className="h2">Acesso de suporte</h2>
      <p className="text-sm text-muted mt-2 mb-4">
        Entre temporariamente no portal deste professor. A confirmação vai para
        seu email administrativo; o acesso fica registrado.
      </p>
      <Overlay
        title="Acessar como professor"
        description="Confirme sua identidade por email. O acesso mantém o plano e as permissões deste professor e dura até 15 minutos. Abrir substituirá a sessão do Lessonara neste navegador; a sessão do admin continua disponível."
        trigger={
          <>
            <Icon name="external" />
            Acessar como
          </>
        }
      >
        {() => <SupportForm accountId={accountId} />}
      </Overlay>
    </section>
  );
}
function SupportForm({ accountId }: { accountId: string }) {
  const [challenge, setChallenge] = useState(""),
    [link, setLink] = useState("");
  return (
    <div className="space-y-5">
      {!link && (
        <Form
          action={async () => {
            const result = await requestSupportAccess(accountId);
            if (result.challenge) setChallenge(result.challenge);
            return result;
          }}
        >
          <div className="flex justify-end">
            <SubmitButton>
              <Icon name="mail" />
              {challenge
                ? "Enviar outro código"
                : "Enviar código para meu email"}
            </SubmitButton>
          </div>
        </Form>
      )}
      {challenge && !link && (
        <Form
          action={async (_, form) => {
            const result = await confirmSupportAccess(accountId, form);
            if (result.link) setLink(result.link);
            return result;
          }}
        >
          <input type="hidden" name="challenge" value={challenge} />
          <label className="label" htmlFor="support-code">
            Código de confirmação
          </label>
          <input
            className="input"
            id="support-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
          />
          <p className="text-xs text-muted mt-2">
            Válido por 5 minutos. Até 5 tentativas.
          </p>
          <div className="flex justify-end mt-6">
            <SubmitButton>
              <Icon name="check" />
              Confirmar e liberar acesso
            </SubmitButton>
          </div>
        </Form>
      )}
      {link && (
        <div>
          <p className="text-sm text-muted mb-4">
            Botão de uso único, válido por dois minutos. Ao abrir, confirme o
            início da sessão de suporte no Lessonara.
          </p>
          <div className="flex justify-end">
            <a href={link} className="btn" rel="noreferrer">
              <Icon name="external" />
              Abrir portal do professor
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
