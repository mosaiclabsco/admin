export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-56 rounded-lg bg-sunken" />
      <div className="stats">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-24" />)}</div>
      <div className="card h-72" />
    </div>
  );
}
