"use client";
import { useContext, type ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { FormPending } from "./form";

export function SubmitButton({ children, className = "btn", pendingLabel, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) {
  const { pending: nativePending } = useFormStatus();
  const pending = useContext(FormPending) || nativePending;
  return (
    <button {...props} type="submit" className={className} disabled={pending || props.disabled} aria-busy={pending}>
      {pending ? (pendingLabel ?? "Salvando…") : children}
    </button>
  );
}
