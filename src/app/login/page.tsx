import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
export const metadata: Metadata = { title: "Entrar" };
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
 const params = await searchParams;
 const notice = params.expired ? "Sua sessão expirou. Entre com um novo código." : params.denied ? "Este usuário não tem acesso ao painel." : null;
 return <main className="login-layout">
  <section className="login-studio" aria-label="Mosaic Labs">
   <Brand />
   <div className="login-studio-content"><span className="studio-caption">Painel administrativo</span><h1>Gestão com<br /><span>visão do todo.</span></h1><p>Contas, assinaturas e operações.<br />Cada plataforma em seu lugar.</p><div className="studio-products"><span className="studio-product"><span className="product-dot" />Lessonara</span><span className="studio-product studio-product-outline">Mosaic Labs</span></div></div>
   <div className="studio-art" aria-hidden="true"><span /><span /><span /><span /></div>
   <span className="login-studio-footer">mosaic-labs.co</span>
  </section>
  <section className="login-access" aria-labelledby="login-title"><div className="login-access-inner"><span className="login-access-icon"><Icon name="layers" className="h-6 w-6" /></span><h2 id="login-title">Bem-vindo de volta.</h2><p className="login-description">Use seu email para receber um código de acesso ao painel.</p>{notice && <p className="login-notice" role="status">{notice}</p>}<LoginForm /><p className="login-access-footer"><Icon name="check" className="h-4 w-4" />Acesso exclusivo para administradores.</p></div><p className="login-bottom-note">Mosaic Labs · Administração</p></section>
 </main>;
}
