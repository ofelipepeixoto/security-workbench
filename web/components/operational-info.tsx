"use client";

// Full document navigation preserves the server authentication boundary in the Sites runtime.
import { ArrowRight, FileCode2, FolderGit2, GitBranch, LockKeyhole, Shield } from "lucide-react";
import { LogoutButton } from "../app/access-panel";

type OperationalInfoProps = {
  view: "profile" | "account" | "help" | "onboarding";
  signedIn: boolean;
  name: string;
  githubReady: boolean;
  csrfToken: string;
  projectCount: number | null;
  demo: boolean;
  onAddProject: () => void;
  onShowDemo: () => void;
};

export function OperationalInfo({ view, signedIn, name, githubReady, csrfToken, projectCount, demo, onAddProject, onShowDemo }: OperationalInfoProps) {
  const canAddProject = signedIn || demo;
  const localHref = (path: string) => demo ? path + "?demo=1" : path;
  const mode = demo ? "Demonstração com dados fictícios" : signedIn ? "Operação individual do proprietário" : "Visita sem sessão operacional";

  if (view === "profile") {
    return <>
      <div className="page-heading"><div><p className="eyebrow">IDENTIDADE E SESSÃO</p><h1>Perfil</h1><p>Confira a identidade recebida no acesso e o modo que está explorando.</p></div></div>
      <section className="panel account-panel" aria-labelledby="profile-heading">
        <h2 id="profile-heading">Sua identificação</h2>
        <dl><dt>Conta</dt><dd>{signedIn ? name : "Visitante sem identidade GitHub verificada"}</dd><dt>Autenticação</dt><dd>{signedIn ? "GitHub · sessão aceita pelo servidor" : "Sem sessão operacional"}</dd><dt>Modo atual</dt><dd>{mode}</dd><dt>Permissão operacional</dt><dd>{signedIn ? "Restrita ao proprietário configurado no servidor" : "A demonstração não concede acesso a projetos reais"}</dd></dl>
        <p>Sua identificação acompanha a conta usada no GitHub. Consulte Conta e acesso para encerrar a sessão ou conferir o escopo.</p>
        <div className="button-row"><a target="_top" className="button primary" href={localHref("/account")}>Conta e acesso <ArrowRight size={16}/></a>{signedIn ? <LogoutButton csrfToken={csrfToken}/> : <a target="_top" className="button secondary" href="/access">Entrar com GitHub</a>}</div>
      </section>
    </>;
  }

  if (view === "account") {
    return <>
      <div className="page-heading"><div><p className="eyebrow">TRANSPARÊNCIA E CONTROLE</p><h1>Conta e acesso</h1><p>Conta, permissão e acesso a repositórios têm estados diferentes.</p></div></div>
      <section className="panel account-panel" aria-labelledby="account-heading">
        <h2 id="account-heading">Estado do seu acesso</h2>
        <dl>
          <dt>Conta GitHub</dt><dd>{signedIn ? `${name} · sessão aceita pelo servidor` : "Sem sessão operacional"}</dd>
          <dt>Login GitHub</dt><dd>{githubReady ? "Configuração pronta para iniciar o login; a homologação do fluxo real é uma etapa separada" : "Configuração pendente ou login desabilitado"}</dd>
          <dt>Modo atual</dt><dd>{mode}</dd>
          <dt>Escopo permitido</dt><dd>Repositórios públicos de ofelipepeixoto, cadastrados após confirmação individual de identidade e autorização.</dd>
          <dt>Projetos cadastrados</dt><dd>{projectCount === null ? "Contagem indisponível até uma consulta válida aos projetos." : <>{projectCount}{demo ? " no exemplo fictício" : " neste espaço"}. Cadastro não significa análise concluída.</>}</dd>
          <dt>GitHub App de repositórios</dt><dd>Não integrada. O login não instala uma App nem concede leitura de repositórios privados ou organizações. Uma futura instalação deve pedir somente leitura dos repositórios escolhidos, com revogação testada.</dd>
          <dt>Monitoramento automático</dt><dd>Não habilitado. Cada análise é iniciada pelo operador.</dd>
        </dl>
        <div className="button-row">{signedIn ? <LogoutButton csrfToken={csrfToken}/> : <a target="_top" className="button primary" href="/access">Entrar com GitHub <ArrowRight size={16}/></a>}<a target="_top" className="button secondary" href={localHref("/profile")}>Ver perfil</a></div>
      </section>
      <section className="panel settings-panel" aria-label="Limites e controle da sessão">
        <div><LockKeyhole size={22}/><section><h2>Controle da sessão</h2><p>Sair encerra a sessão do Workbench. Não apaga o histórico nem desinstala uma App. Revogar uma autorização no GitHub e excluir dados são ações distintas; não há controles de exclusão de dados nesta tela.</p></section></div>
        <div><FileCode2 size={22}/><section><h2>Cobertura da análise hospedada</h2><p>Até 20 arquivos suportados, 256 KiB por arquivo, 2 MiB de conteúdo e 45 segundos por análise. O resultado informa omissões e cobertura parcial. O código do alvo não é executado.</p></section></div>
        <div><Shield size={22}/><section><h2>Decisão humana</h2><p>Detecções começam como candidatos. Confiança da regra não é severidade, e ausência de detecção não comprova segurança. Dependências são inventariadas sem consulta de CVEs.</p></section></div>
      </section>
      <a target="_top" className="text-button" href={localHref("/help")}>Consultar orientação de uso <ArrowRight size={16}/></a>
    </>;
  }

  if (view === "onboarding") {
    return <>
      <div className="page-heading"><div><p className="eyebrow">PRIMEIROS PASSOS</p><h1>Do escopo à revisão</h1><p>Prepare uma análise sem preencher dados que não mudam sua tarefa.</p></div></div>
      <section className="panel" aria-labelledby="onboarding-heading">
        <h2 id="onboarding-heading">Seu próximo passo</h2>
        <p>{projectCount === null ? "Os cadastros ainda não puderam ser confirmados. Consulte a lista de Projetos e confira qualquer erro antes de adicionar outro." : projectCount ? `Há ${projectCount} projeto(s) cadastrado(s)${demo ? " no exemplo" : " neste espaço"}. Confira o escopo antes de iniciar outra análise.` : "Comece por um repositório público que você controla ou tem autorização explícita para analisar."}</p>
        <ol className="operational-steps">
          <li><h3>Confirme o projeto</h3><p>Confira nome e ID estável do repositório. A confirmação autoriza a leitura estática daquele escopo, sem liberar outros repositórios.</p></li>
          <li><h3>Analise uma versão</h3><p>Escolha a versão atual ou informe um commit completo. O sistema fixa o commit e registra arquivos lidos, cobertura e limites.</p></li>
          <li><h3>Revise e registre sua decisão</h3><p>Leia evidência, impacto possível e recomendação. Salve a decisão humana e depois compare análises compatíveis ou baixe o Markdown.</p></li>
        </ol>
        <div className="button-row"><button className="button primary" onClick={onAddProject} disabled={!canAddProject}><FolderGit2 size={17}/>{demo ? "Adicionar projeto de exemplo" : "Adicionar projeto"}</button>{projectCount !== null && projectCount > 0 && <a target="_top" className="button secondary" href={localHref("/projects")}>Ver projetos <ArrowRight size={16}/></a>}<button className="text-button" onClick={onShowDemo}>Explorar exemplo fictício</button></div>
        {!signedIn && !demo && <p>Para cadastrar projetos reais, <a target="_top" href="/access">entre com a conta GitHub do proprietário</a>.</p>}
        <p className="muted">A demonstração usa somente dados fictícios no navegador. Não envie tokens, senhas ou conteúdo sensível.</p>
      </section>
      <a target="_top" className="text-button" href={localHref("/help")}>Preciso de ajuda <ArrowRight size={16}/></a>
    </>;
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">ORIENTAÇÃO E RETOMADA</p><h1>Ajuda</h1><p>Entenda o resultado, confira limites e retome o fluxo com segurança.</p></div></div>
    <section className="panel" aria-labelledby="help-start-heading"><h2 id="help-start-heading">Onde continuar</h2><p>{mode}. {signedIn ? "Seu acesso real continua restrito ao proprietário." : "A demonstração está disponível sem login e não acessa projetos reais."}</p><div className="button-row"><a target="_top" className="button primary" href={localHref("/onboarding")}>Ver primeiros passos <ArrowRight size={16}/></a><a target="_top" className="button secondary" href={localHref("/runs")}>Consultar análises</a><a target="_top" className="button secondary" href={localHref("/account")}>Conferir acesso</a></div></section>
    <a target="_top" className="text-button" href={localHref("/dashboard")}>Voltar ao painel <ArrowRight size={16}/></a>
    <div className="info-grid">
      <section className="panel" aria-labelledby="help-results-heading"><h2 id="help-results-heading">Como ler uma análise</h2><dl><dt>Candidato</dt><dd>Observação que precisa de revisão humana. Não é confirmação de vulnerabilidade.</dd><dt>Cobertura parcial</dt><dd>Limites ou omissões restringiram a leitura. Confira os arquivos, bytes e motivos registrados.</dd><dt>Nenhum candidato</dt><dd>Nenhuma regra detectou um candidato nos arquivos lidos. Isso não comprova segurança.</dd><dt>Comparação</dt><dd>Mostra diferenças de detecção entre análises do mesmo projeto. Não detectar novamente não comprova correção.</dd></dl></section>
      <section className="panel" aria-labelledby="help-recovery-heading"><h2 id="help-recovery-heading">Quando algo não concluir</h2><dl><dt>Falha ou interrupção</dt><dd>Consulte o histórico antes de repetir a análise. Uma execução não concluída não é resultado limpo.</dd><dt>Cota GitHub</dt><dd>A aquisição pública pode atingir a cota compartilhada por IP. Aguarde e confira o histórico antes de tentar novamente.</dd><dt>Sessão expirada ou acesso negado</dt><dd>Retome pela página de acesso usando a conta GitHub autorizada. Outra conta válida não recebe permissão operacional.</dd><dt>Revisão não salva</dt><dd>Confira a mensagem de erro e recarregue a análise para verificar o estado registrado antes de refazer a decisão.</dd></dl></section>
    </div>
    <section className="panel settings-panel" aria-label="Capacidades desta versão"><div><GitBranch size={22}/><section><h2>O que está disponível</h2><p>Leitura estática de repositórios públicos do namespace autorizado, revisão humana, comparação e Markdown sobre os dados acessíveis ao seu espaço. Limites e estado de cada análise acompanham o resultado.</p></section></div><div><Shield size={22}/><section><h2>O que exige outra etapa</h2><p>Repositórios privados e organizações por App, monitoramento automático, consulta de CVEs e auditoria de bancos não estão habilitados. O conector GitHub de uma conversa não autentica a área hospedada.</p></section></div></section>
  </>;
}
