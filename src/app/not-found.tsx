import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="h1 mt-2">Página não encontrada</h1>
        <Link href="/all" className="btn mt-6">Voltar ao painel</Link>
      </div>
    </main>
  );
}
