"use client";
import { notify } from "./toast";
import {
  createContext,
  startTransition,
  useActionState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

export type FormResult = { error?: string; ok?: string } | null;

export const FormPending = createContext(false);

/**
 * Formulário de server action com notificação fora do layout (em produção, erro lançado por action não chega ao cliente).
 * Não usa o reset automático do React: formulários de edição mantêm os valores salvos;
 * os de criação passam resetOnSuccess.
 */
export function Form({
  action,
  children,
  className,
  id,
  resetOnSuccess = false,
  onSuccess,
}: {
  action: (prev: FormResult, data: FormData) => Promise<FormResult>;
  children: ReactNode;
  className?: string;
  id?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const handled = useRef<FormResult>(null);
  useEffect(() => {
    if (!state || pending || handled.current === state) return;
    handled.current = state;
    if (state.error) notify(state.error, "error");
    if (state.ok) {
      notify(state.ok);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
  }, [state, pending, resetOnSuccess, onSuccess]);
  return (
    <form
      ref={ref}
      id={id}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(
          event.currentTarget,
          (event.nativeEvent as SubmitEvent).submitter,
        );
        startTransition(() => dispatch(data));
      }}
    >
      <FormPending.Provider value={pending}>{children}</FormPending.Provider>
    </form>
  );
}
