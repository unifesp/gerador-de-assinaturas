# Manual de Implementação do SUA Assinatura

Este manual descreve, passo a passo, como implantar o **SUA Assinatura** em outra instituição. A ferramenta foi originalmente desenvolvida para a Universidade Federal de São Paulo (UNIFESP), mas foi projetada desde a versão 1.1 para ser reutilizada por qualquer instituição do governo que utilize Google Workspace, através de um único arquivo de configuração (`config.json`).

Repositório oficial: `https://github.com/unifesp/gerador-de-assinaturas`

---

## Sumário

1. [Visão geral da arquitetura](#1-visão-geral-da-arquitetura)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Clonando o repositório](#3-clonando-o-repositório)
4. [Configurando o backend no Google Apps Script](#4-configurando-o-backend-no-google-apps-script)
5. [Gerando as duas URLs (chaves de integração)](#5-gerando-as-duas-urls-chaves-de-integração)
6. [Alterações necessárias no config.json](#6-alterações-necessárias-no-configjson)
7. [Onde subir as imagens da instituição e logos setoriais](#7-onde-subir-as-imagens-da-instituição-e-logos-setoriais)
8. [Publicando o site](#8-publicando-o-site)
9. [Checklist de testes](#9-checklist-de-testes)
10. [Contribuindo com o projeto principal](#10-contribuindo-com-o-projeto-principal)
11. [Licença AGPLv3: obrigações ao reutilizar o código](#11-licença-agplv3-obrigações-ao-reutilizar-o-código)

---

## 1. Visão geral da arquitetura

O SUA Assinatura é composto por três partes que precisam ser configuradas separadamente:

| Parte | O que é | Onde vive |
|---|---|---|
| **Front-end** | Arquivos estáticos (`index.html`, `config.json`, `images/`, páginas de apoio) | Qualquer servidor web estático (GitHub Pages, Apache, Nginx, etc.) |
| **Backend de consulta ao diretório** | Um Web App do Google Apps Script (`Código.gs`, função `doGet`) que consulta o Google Workspace Directory | Google Apps Script, na conta Google da própria instituição |
| **Backend de injeção de assinatura** | O mesmo projeto Apps Script (função `doPost`), publicado como um **segundo** Web App | Google Apps Script, mesma conta |

Não existe nenhuma "chave de API" no sentido tradicional (não há uma string secreta para copiar de um painel). A integração é feita inteiramente via **OAuth do próprio Google**, através de dois Web Apps do Apps Script com configurações de execução diferentes. Isso é explicado em detalhe na Seção 4.

---

## 2. Pré-requisitos

- **Google Workspace institucional.** Este é o pré-requisito principal e não pode ser contornado: a busca automática de dados do usuário (nome, foto, cargo, telefone) depende da **Admin SDK Directory API**, disponível apenas para contas Google Workspace administradas pela instituição (não funciona com contas Gmail pessoais nem com contas Workspace sem o Diretório habilitado).
- **Permissão de administrador** (ou ao menos permissão delegada) no Google Workspace, para:
  - Criar um projeto no Google Cloud Console vinculado à organização;
  - Habilitar a Admin SDK API e a Gmail API;
  - Configurar a tela de consentimento OAuth como **Interna** (só é possível se o projeto do Google Cloud pertencer à organização do Workspace).
- **Acesso a um servidor de hospedagem estática** (ou GitHub Pages), com HTTPS. HTTPS não é opcional: navegadores modernos e o próprio fluxo OAuth do Google exigem conexão segura.
- **Git** instalado, para clonar o repositório.
- Noções básicas de Google Apps Script e Google Cloud Console. Não é necessário conhecimento de frameworks de front-end: o projeto é HTML, CSS e JavaScript puros, sem processo de build.

---

## 3. Clonando o repositório

```bash
git clone https://github.com/unifesp/gerador-de-assinaturas.git
cd gerador-de-assinaturas
```

Antes de prosseguir, leia a Seção 11 sobre a licença AGPLv3. Recomendamos fortemente que a instituição trabalhe a partir de um **fork** próprio no GitHub (em vez de apenas um clone local), para:

- Manter um histórico próprio de customizações;
- Facilitar o envio de melhorias de volta ao projeto principal via *Pull Request* (Seção 10);
- Cumprir com transparência as obrigações da licença AGPLv3 (Seção 11).

```bash
# Alternativa recomendada: faça um fork pelo GitHub e clone o seu fork
git clone https://github.com/SUA-INSTITUICAO/gerador-de-assinaturas.git
```

---

## 4. Configurando o backend no Google Apps Script

Esta é a etapa mais delicada da implantação. Ela precisa ser feita **duas vezes**: uma vez para a consulta ao Diretório (executada com privilégios administrativos) e outra para a injeção de assinatura (executada com a identidade de cada usuário individualmente). As duas rodam a partir do **mesmo código-fonte**, mas são publicadas como **dois Web Apps diferentes**, com configurações de execução distintas.

### 4.1. Criar o projeto Apps Script

1. Acesse [script.google.com](https://script.google.com) com uma conta administrativa do Workspace da instituição.
2. Crie um novo projeto.
3. Copie o conteúdo do arquivo `Código.gs` (na raiz do repositório) para o editor.
4. Abra as configurações do projeto (ícone de engrenagem) e ative **"Mostrar arquivo de manifesto do projeto (appsscript.json)"**.
5. Substitua o conteúdo de `appsscript.json` pelo modelo abaixo, ajustando apenas se necessário:

```json
{
  "timeZone": "America/Sao_Paulo",
  "dependencies": {
    "enabledAdvancedServices": [
      { "userSymbol": "AdminDirectory", "version": "directory_v1", "serviceId": "admin" },
      { "userSymbol": "Gmail", "version": "v1", "serviceId": "gmail" }
    ]
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/admin.directory.user.readonly",
    "https://www.googleapis.com/auth/gmail.settings.basic",
    "https://www.googleapis.com/auth/userinfo.email"
  ],
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

6. No editor, na barra lateral **Serviços**, adicione os serviços avançados **Admin SDK API** e **Gmail API** (isso habilita as APIs correspondentes no projeto do Google Cloud associado).

### 4.2. Vincular a um projeto padrão do Google Cloud

Por padrão, todo projeto Apps Script usa um projeto do Google Cloud **oculto**, que não pode ser configurado manualmente (não é possível, por exemplo, tornar a tela de consentimento OAuth "Interna" nele). É necessário vincular o script a um projeto **padrão**, visível no Console:

1. Nas configurações do projeto Apps Script, em **"Projeto do Google Cloud Platform (GCP)"**, clique em **Alterar projeto**.
2. Crie (ou use) um projeto padrão no [Google Cloud Console](https://console.cloud.google.com), dentro da organização do Workspace da instituição.
3. Informe o número desse projeto na tela do Apps Script.

### 4.3. Configurar a tela de consentimento OAuth como Interna

1. No Google Cloud Console, vá em **APIs e Serviços → Google Auth Platform** (chamado de "OAuth consent screen" em versões mais antigas da interface).
2. Configure o tipo de usuário como **Interno**. Essa opção só aparece se o projeto do Cloud pertencer à organização do Workspace (Seção 4.2), condição que evita o aviso de "app não verificado" para os usuários da instituição.

### 4.4. Criar os dois deployments (Web Apps)

No editor do Apps Script, use **Implantar → Nova implantação → Tipo: App da Web**, duas vezes, com as seguintes configurações:

| | Deployment 1: Consulta ao Diretório | Deployment 2: Injeção de assinatura |
|---|---|---|
| **Executar como** | Eu (a conta que publicou o script) | Usuário que acessa o app da web |
| **Quem tem acesso** | Qualquer pessoa | Qualquer pessoa na organização [sua instituição] |
| **Função HTTP usada** | `doGet` | `doPost` |

O motivo de existirem dois: o `doGet` precisa rodar com privilégios administrativos para poder consultar **qualquer** usuário no Diretório; o `doPost` precisa rodar com a identidade de **quem está usando a página**, para que a assinatura seja gravada só na própria conta Gmail da pessoa, nunca na de outra.

Cada deployment gera uma URL própria, no formato `https://script.google.com/macros/s/AKfycb.../exec` (ou, no caso de deployments restritos ao domínio, `https://script.google.com/a/macros/SEUDOMINIO/s/.../exec`). Guarde as duas URLs: elas vão para o `config.json` (Seção 6).

> **Nota:** sempre que o código do `Código.gs` for alterado depois da publicação inicial, é necessário criar uma **nova versão** do deployment (Implantar → Gerenciar implantações → editar → Nova versão). Apenas salvar o código no editor não atualiza a URL já publicada.

---

## 5. Gerando as duas URLs (chaves de integração)

Como mencionado, não há uma chave de API separada para gerar em um painel. As próprias URLs dos dois Web Apps da Seção 4.4 **são** as credenciais de integração usadas pelo front-end. Elas devem ser tratadas como configuração pública (aparecem no código-fonte do `config.json`, visível a qualquer usuário do site), não como segredos: a segurança da integração vem do modelo de execução OAuth do Apps Script (Seção 4), não do sigilo da URL.

---

## 6. Alterações necessárias no config.json

Abra o arquivo `config.json`, na raiz do projeto, e substitua todos os valores pelos dados da nova instituição:

```json
{
  "institution": {
    "name": "Nome completo da instituição",
    "sigla": "SIGLA",
    "logoUrl": "images/geral/logo-da-instituicao.png",
    "url": "https://www.suainstituicao.br/"
  },
  "sectors": [
    {
      "name": "Nome completo do setor ou unidade",
      "sigla": "SIGLA-DO-SETOR",
      "logoUrl": "images/setores/nome-do-arquivo.png",
      "url": "https://link-do-setor.suainstituicao.br"
    }
  ],
  "colors": {
    "primary": "#RRGGBB"
  },
  "api": {
    "directoryLookupUrl": "URL do Deployment 1 (Seção 4.4)",
    "signatureInjectUrl": "URL do Deployment 2 (Seção 4.4)"
  }
}
```

Campo a campo:

- **`institution.name`**: nome completo, usado no rodapé da assinatura gerada.
- **`institution.sigla`**: usada no cabeçalho da interface e no título da aba do navegador.
- **`institution.logoUrl`**: caminho relativo até o logotipo principal da instituição (ver Seção 7).
- **`institution.url`**: destino do link ao clicar no logotipo institucional na assinatura.
- **`sectors`**: uma lista com um item por unidade/setor que terá logotipo próprio disponível no menu suspenso "Unidade Setorial". Pode começar vazia (`"sectors": []`) e ser preenchida aos poucos.
- **`colors.primary`**: a cor de marca (em hexadecimal) usada nos links, ícones de contato e detalhes visuais **da assinatura gerada**. Não afeta a cor da interface do editor, só o resultado final que vai para o e-mail.
- **`api.directoryLookupUrl`** e **`api.signatureInjectUrl`**: as duas URLs geradas na Seção 4.4.

> **Atenção a um detalhe específico da UNIFESP:** o projeto original tem um checkbox e um logotipo fixo chamados "SUA Unifesp" (referente ao sistema de chamados `sua.unifesp.br`), com URL e lógica **fixas no código**, não vindas do `config.json`. Instituições que não tiverem um sistema equivalente devem avaliar se querem remover esse checkbox e a lógica associada a ele no `index.html`, ou adaptá-lo para apontar para seu próprio sistema de atendimento. O mesmo vale para o botão "Abrir um chamado", que aponta para `https://sua.unifesp.br` fixo no código.

---

## 7. Onde subir as imagens da instituição e logos setoriais

A pasta `images/` é organizada em quatro subpastas:

```
images/
├── geral/      → logotipos institucionais fixos (o da própria instituição, o do Governo Federal)
├── setores/    → logotipos de cada unidade/setor listado no config.json
├── icons/      → ícones de redes sociais e identificadores acadêmicos (normalmente não precisam de alteração)
└── tutorial/   → capturas de tela usadas na página de ajuda (opcional atualizar)
```

Passos:

1. Adicione o logotipo da instituição em `images/geral/`, e aponte `institution.logoUrl` para ele no `config.json`.
2. Para cada setor que terá logotipo próprio, adicione o arquivo em `images/setores/` e cadastre a entrada correspondente em `sectors` no `config.json`.
3. **Formato recomendado: PNG.** Evite SVG: vários clientes de e-mail, incluindo o Gmail, têm suporte inconsistente para imagens SVG referenciadas dentro do corpo de e-mails, e o logotipo pode simplesmente não aparecer na assinatura final.
4. Os arquivos em `images/icons/` são genéricos (ORCID, Lattes, LinkedIn, etc.) e normalmente não precisam ser alterados, a menos que a instituição queira um estilo visual próprio para os ícones.
5. As imagens em `images/tutorial/` ilustram a página de ajuda (`ajuda.html`) e podem ser recriadas com capturas de tela do próprio ambiente da instituição, se desejado, mas isso não é obrigatório.

---

## 8. Publicando o site

O projeto é 100% estático (HTML, CSS e JavaScript, sem etapa de build), então qualquer servidor web serve. Duas opções comuns:

- **GitHub Pages**: ative nas configurações do repositório (fork), apontando para a branch principal.
- **Servidor próprio via CI/CD**: o repositório de referência usa um workflow do GitHub Actions (`.github/workflows/deploy.yml`) que sincroniza os arquivos via `rsync` para um servidor remoto a cada `push` na branch principal. Esse workflow pode ser adaptado, bastando configurar os *secrets* do repositório (`REMOTE_HOST`, `REMOTE_USER`, `REMOTE_TARGET`, `SSH_PRIVATE_KEY`).

Em qualquer caso, é **obrigatório** que o `config.json` seja publicado na **mesma pasta** que o `index.html`, já que a página faz uma requisição relativa (`fetch('config.json')`) que depende disso.

---

## 9. Checklist de testes

Antes de liberar para os usuários finais, valide:

- [ ] Abrir a página pela URL pública (não localmente) e confirmar que o `config.json` carrega sem erros (verifique o console do navegador).
- [ ] Digitar um e-mail institucional de teste e confirmar que nome, foto e demais dados são preenchidos automaticamente a partir do Diretório.
- [ ] Selecionar uma Unidade Setorial na lista e conferir se o logotipo aparece corretamente na pré-visualização.
- [ ] Testar os quatro checkboxes de exibição (chamado, agenda, logotipo da instituição/sistema interno, logotipo do Governo Federal) e confirmar que ocultam e reexibem os elementos corretamente.
- [ ] Testar o botão de copiar a assinatura e colar manualmente no Gmail.
- [ ] Testar o botão de injeção automática, incluindo a tela de permissões do Google na primeira execução, e confirmar que a assinatura aparece de fato no Gmail (lembrando de marcá-la como padrão, conforme orientado na própria tela de ajuda da ferramenta).

---

## 10. Contribuindo com o projeto principal

Este projeto é mantido como código aberto e se beneficia diretamente da participação de outras instituições que o adotarem. Recomendamos fortemente que a sua equipe:

- **Abra *issues*** no repositório oficial (`https://github.com/unifesp/gerador-de-assinaturas/issues`) para relatar bugs encontrados, mesmo que já corrigidos localmente no seu fork, já que isso ajuda outras instituições que enfrentem o mesmo problema.
- **Envie *Pull Requests*** para melhorias que não sejam específicas da sua instituição (correções de bugs, novos campos de perfil, melhorias de acessibilidade, novas funcionalidades genéricas). Mudanças que sejam apenas de identidade visual ou dados institucionais (logotipos, cores, nome) devem permanecer no `config.json` do seu fork, não no projeto principal.
- **Participe das discussões** de novas funcionalidades antes de implementá-las, quando possível, para evitar divergência desnecessária entre o seu fork e o projeto principal.

Um ecossistema de múltiplas instituições usando e contribuindo para a mesma base de código beneficia a todos com manutenção mais sustentável a longo prazo.

---

## 11. Licença AGPLv3: obrigações ao reutilizar o código

O projeto é distribuído sob a **GNU Affero General Public License, versão 3 (AGPLv3)**, disponível no arquivo `LICENSE` na raiz do repositório. Em linhas gerais, e sem que isto substitua uma análise jurídica formal por parte da assessoria legal da instituição, a AGPLv3 tem uma característica que a diferencia de licenças permissivas comuns:

- Ela se aplica não só à distribuição do código, mas também ao seu **uso como serviço de rede**. Isto é: se a sua instituição modificar o código e disponibilizá-lo publicamente como um serviço (como este projeto é, ao ser acessado por servidores via navegador), a AGPLv3 exige que o **código-fonte modificado** seja disponibilizado aos usuários daquele serviço, tipicamente através de um link visível na própria aplicação.
- Isso vale mesmo que a instituição nunca "distribua" o software em si (por exemplo, nunca envie um `.zip` a ninguém): o simples fato de rodar uma versão modificada como serviço acessível já aciona essa obrigação.
- Recomendamos manter, na própria interface (por exemplo, no rodapé, como já ocorre no projeto original com o link para o repositório GitHub), uma referência clara e visível ao código-fonte do fork utilizado.

Como esta é uma questão contratual/legal e não técnica, recomendamos que a assessoria jurídica ou a área de propriedade intelectual da instituição revise o texto completo da licença antes da publicação em produção, especialmente se houver qualquer modificação substancial ao código que não será compartilhada publicamente.

---

*Este manual foi elaborado para a versão 1.1 do SUA Assinatura. Caso alguma etapa descrita aqui tenha ficado desatualizada em versões futuras, considere abrir uma issue ou enviar uma correção via Pull Request, conforme a Seção 10.*
