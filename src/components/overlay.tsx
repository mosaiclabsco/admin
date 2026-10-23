"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icon";

export function Overlay({ title, description, trigger, triggerClass = "btn-ghost", variant = "modal", children }: {
  title: string; description?: string; trigger: ReactNode; triggerClass?: string; variant?: "modal" | "drawer"; children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const close = () => setOpen(false);
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <>
    <button type="button" className={triggerClass} onClick={() => setOpen(true)} aria-haspopup="dialog">{trigger}</button>
    <dialog ref={ref} className={`overlay ${variant === "drawer" ? "overlay-drawer" : ""}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      {open && <section className="overlay-content">
        <header className="overlay-header"><div><h2 id={titleId} className="overlay-title">{title}</h2>{description && <p id={descriptionId} className="overlay-description">{description}</p>}</div><button type="button" className="overlay-close" aria-label="Fechar painel" onClick={close}><Icon name="x" /></button></header>
        <div className="overlay-body">{children(close)}</div>
      </section>}
    </dialog>
  </>;
}
