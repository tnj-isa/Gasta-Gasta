# Como publicar o Gasta&Gasta

Este guia leva o app do computador até o ícone na tela do seu celular. Dá para fazer sem saber programar.

**O que acontece, em uma frase:** os arquivos do app ficam num repositório do GitHub, e o GitHub Pages (grátis para repositórios públicos) mostra esses arquivos como um site. Você abre o site no Chrome do celular e instala como app.

**Importante:** o que fica no GitHub é só o código do app. Os seus gastos, entradas e faturas **nunca vão para lá**: ficam somente no seu celular, criptografados com a sua senha.

## Antes de começar

- Uma conta no GitHub (você já tem).
- Um repositório vazio chamado `Gasta-Gasta`, público (você já criou: `tnj-isa/Gasta-Gasta`). O GitHub Pages só é grátis para repositórios públicos.

## Parte 1: enviar os arquivos para o GitHub

Escolha um dos dois caminhos.

### Caminho A, o mais fácil: o Claude envia por você

1. Entre em **claude.ai**, abra **Configurações** e depois **Conectores**.
2. Ao lado de **GitHub**, toque em **Conectar** e autorize. Na tela do GitHub, dê acesso ao repositório `Gasta-Gasta` (pode ser só a ele).
3. Volte à conversa e avise "conectei". O Claude confere o acesso, mostra o que vai enviar e envia depois do seu "pode enviar".

### Caminho B: enviar um arquivo .zip pelo site do GitHub

1. O Claude entrega um arquivo `.zip` com o projeto. Baixe e **extraia** (no Windows: botão direito no arquivo, **Extrair tudo**).
2. Abra `github.com/tnj-isa/Gasta-Gasta`. Em um repositório vazio, toque em **uploading an existing file**. Em um repositório que já tem arquivos, use **Add file** e depois **Upload files**.
3. Abra a pasta extraída, selecione **tudo o que está dentro dela** (não a pasta em si) e arraste para a página do GitHub. O arquivo `index.html` precisa ficar na primeira página do repositório, e não dentro de outra pasta.
4. Espere terminar de carregar, vá até o fim da página e toque em **Commit changes**.

Se o GitHub reclamar da quantidade ou do tamanho dos arquivos, avise o Claude: ele separa o envio em partes.

## Parte 2: ligar o GitHub Pages

1. No repositório, toque em **Settings** (Configurações), na barra de cima.
2. Na barra lateral, na seção "Code, planning, and automation", toque em **Pages**.
3. Em "Build and deployment", em **Source**, escolha **Deploy from a branch**.
4. Em **Branch**, escolha **main** e deixe a pasta em **/ (root)**. Toque em **Save**.
5. Espere de 1 a 3 minutos e recarregue a página. Vai aparecer "Your site is live at…" com o endereço do app, algo como `https://tnj-isa.github.io/Gasta-Gasta/`. **Copie o endereço que aparecer aí.**

## Parte 3: instalar no celular

1. No celular, abra o **Chrome** e entre no endereço do app. Espere a tela com a faixa roxa aparecer.
2. Toque nos três pontinhos do Chrome (canto de cima) e escolha **Adicionar à tela inicial** (em alguns celulares aparece **Instalar app**). Confirme.
3. O ícone do Gasta&Gasta aparece na tela inicial. Abra por ele: o app abre em tela cheia, sem a barra do navegador.

## Parte 4: conferir que funciona sem internet

1. Ligue o **modo avião**.
2. Abra o app pelo ícone. Ele deve abrir normalmente.
3. Na tela inicial, toque em **Testar agora**. Deve aparecer "Funcionou" (essa caixa de teste é temporária e some nas próximas etapas).

Se não abrir sem internet, desligue o modo avião, abra o app uma vez com internet, feche e tente de novo.

## Quando o app for atualizado

Quando o Claude mudar o app, o envio é feito do mesmo jeito (Parte 1). No celular, abra o app com internet e depois feche e abra de novo: o app baixa a versão nova sozinho, e ela aparece na segunda abertura. Os seus dados continuam lá.

## Cuidados

- **Repositório público** significa que qualquer pessoa pode ver o código do app, mas nunca os seus dados.
- **Nunca** coloque senhas ou chaves em arquivos do repositório, e **nunca** envie sua senha do GitHub ou tokens para o Claude. O conector do GitHub pede autorização na página do próprio GitHub.
- **Limpar os dados do Chrome ou desinstalar o app apaga os seus dados**, porque eles moram só no celular. Por isso o app terá um backup (arquivo criptografado) e um lembrete mensal.
- **Não existe "esqueci a senha".** Sem servidor, ninguém consegue abrir os seus dados sem a senha, nem o Claude. Guarde a senha em um lugar seguro.

## Para quem mantém o código

- `npm test` roda todos os testes e, antes, atualiza em `sw.js` o número da versão do cache (calculado pelo conteúdo dos arquivos). `npm run versao` faz só a atualização do número.
- Arquivo novo em `src/`, `icons/` ou `vendor/` precisa entrar na lista `ASSETS` do `sw.js`; um teste avisa se faltar.
- Para ver o app no computador: `node` com qualquer servidor estático na pasta do projeto, abrindo `http://localhost:PORTA/`. O service worker só funciona em `localhost` ou em HTTPS.
