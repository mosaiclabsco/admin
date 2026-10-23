"use client";
import { createContext, startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";

export type FormResult = { error?: string; ok?: string } | null;

export const FormPending = createContext(false);

/**
 * Formulário de server action com mensagem inline (em produção, erro lançado por action não chega ao cliente).
 * Não usa o reset automático do React: formulários de edição mantêm os valores salvos;
 * os de criação passam resetOnSuccess.
 */
export function Form({ action, children, className, id, resetOnSuccess = false, onSuccess }: { action: (prev: FormResult, data: FormData) => Promise<FormResult>; children: ReactNode; className?: string; id?: string; resetOnSuccess?: boolean; onSuccess?: () => void }) {
  const [state, dispatch, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
  }, [state, resetOnSuccess, onSuccess]);
  return (
    <form
      ref={ref}
      id={id}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => dispatch(data));
      }}
    >
      <FormPending.Provider value={pending}>{children}</FormPending.Provider>
      {state?.error && <p role="alert" className="basis-full text-xs text-bad">{state.error}</p>}
      {state?.ok && !pending && <p role="status" className="basis-full text-xs text-ok">{state.ok}</p>}
    </form>
  );
}
