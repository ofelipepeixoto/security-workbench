"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Authentication and account switches require a full server-authorized document. */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { createGitHubSessionMonitor } from "../lib/github-session-monitor.mjs";

export type GitHubSessionSnapshot = { state: "authenticated"; provider: "github"; displayName: string; expiresAt: number; verifiedAt: number; sessionKey: string } | { state: "anonymous" | "unavailable" };
type SessionView = { state: string; session?: Extract<GitHubSessionSnapshot, { state: "authenticated" }> };

// GitHub Octicons mark-github-16 (MIT); see GITHUB-MARK-LICENSE.txt. Kept local
// so displaying account status never sends an avatar/image request to GitHub.
function GitHubMark() { return <svg className="github-mark" width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" /></svg>; }

export function GitHubSessionBadge({ model, demo, githubReady, onLogout }: { model: SessionView; demo: boolean; githubReady: boolean; onLogout?: () => void }) {
  const authenticated = model.state === "authenticated" && Boolean(model.session);
  const mode = demo && authenticated || demo && model.state === "anonymous" ? "demo" : model.state;
  const label: Record<string, string> = { authenticated: "Sessão GitHub validada", anonymous: "Sem sessão GitHub", checking: "Verificando sessão…", unavailable: "Sessão não confirmada", expired: "Sessão expirada", changed: "A conta ou a sessão mudou", signing_out: "Saindo…", logout_error: "Não foi possível sair", demo: "Demonstração · dados fictícios" };
  return <div className={`github-session github-session--${mode}`}>
    <span className="github-session-status" role="status" aria-live="polite"><span className="github-session-dot" aria-hidden="true" /><span>{label[mode] || label.unavailable}</span></span>
    {authenticated ? <details className="github-session-menu"><summary><GitHubMark /><span>{model.session!.displayName}</span><span className="sr-only"> · opções da conta</span></summary><div className="github-session-options"><p>Login do Workbench pelo GitHub. O acesso aos repositórios é conferido separadamente.</p><a target="_top" href="/profile">Perfil</a><a target="_top" href="/account">Conta e acesso</a><a target="_top" href="/repositories">Repositórios GitHub</a>{onLogout && <button type="button" onClick={onLogout}><LogOut size={16} aria-hidden="true" />Sair da conta</button>}</div></details> : model.state === "checking" || model.state === "signing_out" ? null : model.state === "changed" ? <a target="_top" href="/" className="github-session-action"><RefreshCw size={15} aria-hidden="true" />Recarregar sessão</a> : githubReady ? <a target="_top" href="/api/auth/github/start" className="github-session-action"><GitHubMark />Entrar com GitHub</a> : <a target="_top" href="/access" className="github-session-action">Configurar acesso</a>}
    {model.state === "logout_error" && <p className="github-session-error" role="alert">A saída não foi confirmada. Abra Conta e acesso e tente novamente.</p>}
  </div>;
}

export function GitHubSessionStatus({ initialSession, demo, githubReady, sessionLost = false, csrfToken, onSessionLost }: { initialSession: GitHubSessionSnapshot; demo: boolean; githubReady: boolean; sessionLost?: boolean; csrfToken: string; onSessionLost?: () => void }) {
  const monitor = useMemo(() => createGitHubSessionMonitor({ initialSession }), [initialSession]);
  useEffect(() => { monitor.setOnSessionLost(onSessionLost ?? (() => {})); }, [monitor, onSessionLost]);
  const model = useSyncExternalStore(monitor.subscribe, monitor.getSnapshot, monitor.getServerSnapshot) as SessionView;
  useEffect(() => {
    if (sessionLost) { monitor.stop(); return; }
    const onVisibility = () => monitor.setVisible(!document.hidden);
    const onResume = () => { if (!document.hidden) void monitor.refresh(); };
    monitor.setVisible(!document.hidden); monitor.start();
    document.addEventListener("visibilitychange", onVisibility); window.addEventListener("focus", onResume); window.addEventListener("pageshow", onResume);
    return () => { monitor.stop(); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("focus", onResume); window.removeEventListener("pageshow", onResume); };
  }, [monitor, sessionLost]);
  async function logout() {
    if (await monitor.logout(csrfToken)) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reload after server-side session revocation.
      window.location.assign("/access");
    }
  }
  return <GitHubSessionBadge model={sessionLost && ["authenticated", "checking"].includes(model.state) ? { state: "expired" } : model} demo={demo} githubReady={githubReady} onLogout={() => void logout()} />;
}
