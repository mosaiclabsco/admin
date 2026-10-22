/* eslint-disable @next/next/no-img-element */
export function Brand({ compact = false }: { compact?: boolean }) {
 return <span className={`mosaic-brand ${compact ? "mosaic-brand-compact" : ""}`}><img src="/brand/icon.svg" width="38" height="38" alt="" /><span className="mosaic-wordmark">mosaic labs<span className="mosaic-brand-label">admin</span></span></span>;
}
