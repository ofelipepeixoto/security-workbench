"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, GitBranch, LockKeyhole, Shield, LogOut } from "lucide-react";

export function LogoutButton({ csrfToken }: { csrfToken: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function logout() {
    setBusy(true); setError("");
    try {
      {
        const response = await fetch("/api/auth/github/logout", { method: "POST", headers: { "X-Workbench-CSRF": csrfToken }, cache: "no-store" });
        if (!response.ok && response.status !== 401) throw new Error("Não foi possível encerrar a sessão. Tente novamente.");
      }
      // Reload the document after revocation; no other provider grants operational access.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Session state must be reloaded after server revocation.
      window.location.assign("/access");
    } catch { setError("Não foi possível encerrar a sessão. Tente novamente."); setBusy(false); }
  }
  return <div><button className="button secondary" onClick={logout} disabled={busy}><LogOut size={16}/>{busy ? "Saindo…" : "Sair da conta"}</button>{error && <p role="alert">{error}</p>}</div>;
}

const results: Record<string, string> = {
  denied: "Você não autorizou o login no GitHub. Nenhum acesso foi concedido.",
  invalid: "Esta tentativa de login expirou ou não pôde ser validada. Inicie uma nova tentativa.",
  unavailable: "O login GitHub está indisponível. Tente novamente mais tarde.",
  forbidden: "A conta foi identificada, mas a operação está restrita ao proprietário configurado.",
  expired: "Sua sessão expirou. Entre novamente para continuar.",
};

export function AccessPanel({ signedIn, name, githubReady, csrfToken, authResult = "" }: { signedIn: boolean; name: string; githubReady: boolean; csrfToken: string; authResult?: string }) {
  return <main id="main" className="access-page"><a className="skip-link" href="#access-actions">Pular para opções de acesso</a>
    <Link className="access-brand" href="/" prefetch={false}><Shield size={24}/>Security Workbench</Link>
    <div className="access-layout"><section className="access-intro"><p className="eyebrow">CÓDIGO, EVIDÊNCIA E DECISÃO HUMANA</p><h1>Um espaço para revisar o código que você controla.</h1><p>Entre para retomar seus projetos, analisar uma versão autorizada e decidir com base nas evidências.</p><ol><li>Confirme o repositório e o escopo.</li><li>Leia candidatos com cobertura explícita.</li><li>Revise antes de confirmar um achado.</li></ol><p className="muted">A demonstração pública usa dados fictícios. A operação real continua individual.</p></section>
      <section className="access-card" id="access-actions" aria-labelledby="access-title"><LockKeyhole size={24}/><h2 id="access-title">{signedIn ? "Sua conta está identificada" : "Acesse seu Workbench"}</h2>
        {Object.hasOwn(results, authResult) && <p className="notice" role="status">{results[authResult]}</p>}
        {signedIn ? <><p>{name} · GitHub</p><p>Operação autorizada para o proprietário. Seu histórico permanece no mesmo espaço.</p><Link href="/" prefetch={false} className="button primary">Continuar para o painel <ArrowRight size={16}/></Link><LogoutButton csrfToken={csrfToken}/></> : <><p>Use a identidade do proprietário. Uma conta válida não concede acesso a dados privados de outras pessoas.</p>{githubReady ? <a target="_top" href="/api/auth/github/start" className="button primary"><GitBranch size={18}/>Continuar com GitHub</a> : <><button className="button primary" disabled aria-describedby="github-setup"><GitBranch size={18}/>Continuar com GitHub</button><p id="github-setup" className="setup-status">Configuração pendente. O aplicativo OAuth ainda precisa ser habilitado e homologado pelo proprietário.</p></>}
          <p className="muted">Somente a conta GitHub do proprietário pode operar. Nenhum cadastro aberto é criado.</p><Link href="/" prefetch={false} className="text-button">Explorar a demonstração</Link></>}
        <div className="access-boundary"><p>O GitHub identifica seu ID e login público. Sua senha não é enviada ao Workbench.</p><strong>Login e instalação são etapas distintas.</strong><p>A instalação de uma GitHub App, a seleção de repositórios e o monitoramento são permissões separadas. Nesta fase, somente a leitura pública do namespace autorizado está disponível.</p></div>
      </section></div><footer className="page-footer"><span>Sem telefone obrigatório. Sem acesso automático a organizações.</span><span>Revisão humana preservada.</span></footer>
  </main>;
}
