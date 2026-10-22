"use client";
import { useActionState } from "react";
import { Icon } from "@/components/icon";
import { SubmitButton } from "@/components/submit-button";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, dispatch] = useActionState<LoginState, FormData>(login, { phase: "email" });
  return (
    <form action={dispatch} className="mt-6 space-y-4">
      {state.phase === "email" ? (
        <>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input suppressHydrationWarning className="input" id="email" name="email" type="email" autoComplete="email" placeholder="voce@empresa.com" maxLength={254} required autoFocus defaultValue={state.email} />
          </div>
          {state.error && <p role="alert" className="login-error">{state.error}</p>}
          <SubmitButton className="btn w-full" name="intent" value="request" pendingLabel="Enviando…">Receber código<Icon name="arrow" className="h-4 w-4" /></SubmitButton>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{state.message ?? "Digite o código enviado para"} <strong className="text-fg">{state.email}</strong></p>
          <div>
            <label className="label" htmlFor="code">Código</label>
            <input className="input text-center font-mono text-xl tracking-[.4em]" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,12}" maxLength={12} required autoFocus />
          </div>
          {state.error && <p role="alert" className="login-error">{state.error}</p>}
          <SubmitButton className="btn w-full" name="intent" value="verify" pendingLabel="Conferindo…">Entrar<Icon name="arrow" className="h-4 w-4" /></SubmitButton>
          <button className="w-full text-center text-xs text-muted hover:text-fg" name="intent" value="restart" formNoValidate>Usar outro email ou pedir novo código</button>
        </>
      )}
    </form>
  );
}
