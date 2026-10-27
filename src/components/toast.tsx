"use client";
import { useEffect, useState, useRef } from "react";
import { Icon } from "./icon";
type Notice = { id: string; message: string; kind: "success" | "error" };
export function notify(message: string, kind: Notice["kind"] = "success") {
  window.dispatchEvent(
    new CustomEvent("mosaic-admin:toast", {
      detail: { id: crypto.randomUUID(), message, kind },
    }),
  );
}
export function ToastHost() {
  const [items, setItems] = useState<Notice[]>([]);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (items.length) host.current?.showPopover();
    else host.current?.hidePopover();
  }, [items.length]);
  useEffect(() => {
    const listener = (event: Event) => {
      const item = (event as CustomEvent<Notice>).detail;
      setItems((previous) =>
        [...previous.filter((p) => p.id !== item.id), item].slice(-3),
      );
    };
    window.addEventListener("mosaic-admin:toast", listener);
    return () => window.removeEventListener("mosaic-admin:toast", listener);
  }, []);
  useEffect(() => {
    if (!items.length) return;
    const timer = setTimeout(
      () => setItems((previous) => previous.slice(1)),
      8000,
    );
    return () => clearTimeout(timer);
  }, [items]);
  return (
    <div
      ref={host}
      popover="manual"
      className="toast-stack"
      aria-label="Notificações"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast-notice toast-${item.kind}`}
          role={item.kind === "error" ? "alert" : "status"}
        >
          <Icon
            name={item.kind === "error" ? "x" : "check"}
            className="h-5 w-5"
          />
          <span>{item.message}</span>
          <button
            type="button"
            aria-label="Fechar notificação"
            onClick={() =>
              setItems((previous) => previous.filter((p) => p.id !== item.id))
            }
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
