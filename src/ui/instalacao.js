/**
 * Guarda o aviso "este site pode ser instalado" que o Chrome dispara e deixa o app
 * oferecer o seu próprio botão de instalar.
 * @param {EventTarget} alvo normalmente `window`
 */
export function criarInstalacao(alvo) {
  let aviso = null;
  const ouvintes = new Set();

  alvo.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault(); // segura a barra automática; o app decide quando oferecer
    aviso = evento;
    ouvintes.forEach((avisar) => avisar());
  });
  alvo.addEventListener('appinstalled', () => { aviso = null; });

  return {
    podeInstalar: () => aviso !== null,

    /** Abre a janela de instalação do Chrome. Devolve 'accepted', 'dismissed' ou 'indisponivel'. */
    async instalar() {
      if (!aviso) return 'indisponivel';
      const atual = aviso;
      aviso = null; // o aviso só vale uma vez
      atual.prompt();
      return (await atual.userChoice).outcome;
    },

    /** Chama `avisar` assim que a instalação estiver disponível (na hora, se já estiver). */
    aoPoderInstalar(avisar) {
      ouvintes.add(avisar);
      if (aviso) avisar();
    },
  };
}

// Criada logo que o app abre, para não perder o aviso do Chrome.
export const instalacao = typeof window === 'undefined' ? null : criarInstalacao(window);
