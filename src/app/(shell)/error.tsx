"use client";

export default function ShellError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card card-pad max-w-lg">
      <p className="eyebrow">Erro</p>
      <h1 className="h1 mt-1">Algo deu errado ao carregar</h1>
      <p className="mt-2 text-sm text-muted">{error.digest ? `Código: ${error.digest}` : error.message}</p>
      <button className="btn mt-5" onClick={reset}>Tentar de novo</button>
    </div>
  );
}
