// Código para o arquivo Código.gs
function doGet(e) {
  const email = e.parameter.email;
  const response = {
    success: false,
    name: "",
    photoUrl: "",
    title: "",
    department: "",
    costCenter: "",
    mobile: "",
    phone: "",
    ramal: ""
  };

  if (!email) return createResponse(response);

  try {
    // Busca o usuário no diretório do Google Workspace
    const user = AdminDirectory.Users.get(email);

    response.success = true;
    response.name = user.name.fullName;

    // Tenta obter a foto de perfil. Se não houver, o campo fica vazio.
    // Note: thumbnailPhotoUrl pode exigir permissões específicas ou estar oculta por privacidade.
    if (user.thumbnailPhotoUrl) {
      response.photoUrl = user.thumbnailPhotoUrl;
    }

    // Cargo (Cargo ou Função), Departamento (Unidade de Lotação) e Centro de custo
    // (Unidade Superior) vêm da organização cadastrada no perfil do usuário.
    if (user.organizations && user.organizations.length > 0) {
      const org = user.organizations.find(function (o) { return o.primary; }) || user.organizations[0];
      if (org.title) response.title = org.title;
      if (org.department) response.department = org.department;
      if (org.costCenter) response.costCenter = org.costCenter;
    }

    // Telefone Celular vem da lista de telefones cadastrados, tipo "mobile"
    // (campo "Telefone (smartphone)" no Google Workspace).
    if (user.phones && user.phones.length > 0) {
      const mobilePhone =
        user.phones.find(function (p) { return p.type === 'mobile'; }) ||
        user.phones.find(function (p) { return p.type === 'work_mobile'; });
      if (mobilePhone && mobilePhone.value) response.mobile = mobilePhone.value;

      // Telefone Fixo e Ramal vêm do campo "Telefone (trabalho)" (type "work"),
      // que no Google Workspace armazena um valor composto no formato "numero|ramal".
      const workPhone = user.phones.find(function (p) { return p.type === 'work'; });
      if (workPhone && workPhone.value) {
        const parts = workPhone.value.split('|');
        const phoneNumber = parts[0] ? parts[0].trim() : '';
        const extension = parts[1] ? parts[1].trim() : '';
        if (phoneNumber) response.phone = phoneNumber;
        if (extension) response.ramal = extension;
      }
    }

    return createResponse(response);
  } catch (err) {
    response.error = "Usuário não encontrado ou sem permissão.";
    return createResponse(response);
  }
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ATENÇÃO: esta função deve ser publicada em um SEGUNDO deployment de Web App,
 * separado do usado pelo doGet acima. Configuração desse segundo deployment:
 *   - Executar como: "Usuário que acessa o app da web"
 *   - Quem tem acesso: "Qualquer pessoa na organização [UNIFESP]"
 * Isso é necessário porque o doGet (busca no Directory) precisa rodar com a
 * identidade de quem publicou o script (para ter permissão de consultar
 * QUALQUER usuário no diretório), enquanto esta função precisa rodar com a
 * identidade de quem está USANDO a página (para gravar a assinatura só na
 * própria conta Gmail dele, nunca na de outra pessoa).
 *
 * Também é necessário, no manifesto do projeto (appsscript.json — em "Editor" ->
 * ícone de engrenagem -> "Mostrar arquivo de manifesto do projeto"), garantir que
 * o escopo abaixo esteja declarado em "oauthScopes":
 *   "https://www.googleapis.com/auth/gmail.settings.basic"
 * e que o serviço avançado "Gmail API" esteja ativado em Serviços (barra lateral
 * do editor de Apps Script).
 *
 * doPost funciona como um DISPATCHER: o parâmetro "action" decide o que fazer.
 *   - action = "saveRating"  -> grava a avaliação numa planilha (roda no
 *     PRIMEIRO deployment, o mesmo do doGet, executando como "Eu" - não exige
 *     login da pessoa que avalia).
 *   - qualquer outro valor (ou ausente, para compatibilidade)  -> injeta a
 *     assinatura no Gmail (roda no SEGUNDO deployment, como o usuário).
 */
function doPost(e) {
  if (e.parameter.action === 'saveRating') {
    return saveRating(e);
  }
  return injectSignature(e);
}

function injectSignature(e) {
  const signatureHtml = e.parameter.signatureHtml;

  if (!signatureHtml) {
    return createHtmlResponse(false, "Nenhum conteúdo de assinatura foi recebido.");
  }

  try {
    // Session.getActiveUser() só retorna o e-mail real quando o deployment está
    // configurado como "Executar como: Usuário que acessa o app da web".
    const userEmail = Session.getActiveUser().getEmail();
    if (!userEmail) {
      return createHtmlResponse(false, "Não foi possível identificar o usuário autenticado. Verifique se você fez login com sua conta institucional.");
    }

    // Localiza o endereço de envio (send-as) principal do usuário e atualiza a assinatura.
    Gmail.Users.Settings.SendAs.patch(
      { signature: signatureHtml },
      "me",
      userEmail
    );

    // Confirmação real: relê o que ficou gravado no Gmail (em vez de confiar apenas
    // na ausência de erro). O Gmail sanitiza o HTML da assinatura ao salvar, então essa
    // leitura também serve para detectar o caso em que o conteúdo foi salvo praticamente vazio.
    const saved = Gmail.Users.Settings.SendAs.get("me", userEmail);
    const savedSignature = (saved && saved.signature) ? saved.signature : "";

    if (!savedSignature || savedSignature.trim().length < 20) {
      return createHtmlResponse(false,
        "A gravação não gerou erro, mas ao conferir o resultado a assinatura salva ficou vazia ou muito curta. " +
        "É possível que o Gmail tenha removido parte do conteúdo ao sanitizar o HTML. Avise o suporte técnico.");
    }

    const note =
      "Assinatura gravada com sucesso na conta " + userEmail + ". " +
      "IMPORTANTE: o Gmail permite guardar várias assinaturas, e só a marcada como \"padrão\" é inserida " +
      "automaticamente ao escrever ou responder um email. Na primeira vez, confira em " +
      "Configurações (⚙️) → Ver todas as configurações → Geral → Assinatura, e marque a assinatura que " +
      "acabamos de gravar como padrão para \"Novos emails\" e para \"Respostas/encaminhamentos\".";

    return createHtmlResponse(true, note);
  } catch (err) {
    return createHtmlResponse(false, "Erro ao gravar a assinatura: " + err.message);
  }
}

/**
 * Grava uma avaliação de satisfação (nota de 1 a 3 + comentário opcional) numa
 * planilha do Google Drive. Roda como "Eu" (identidade do primeiro deployment),
 * então não exige nenhum login da pessoa que está avaliando - a chamada é feita
 * via fetch() direto pelo front-end, sem abrir nova aba.
 * Na primeira chamada, a planilha "SUA Assinatura - Avaliações" é criada
 * automaticamente no Google Drive da conta que publicou o script, e o ID dela
 * fica guardado nas Propriedades do Script para ser reaproveitado nas próximas
 * chamadas (não precisa criar nem configurar nada manualmente).
 */
function saveRating(e) {
  try {
    const rating = e.parameter.rating;
    const comment = (e.parameter.comment || '').toString().slice(0, 1000);
    if (!rating) {
      return createResponse({ success: false, error: 'Nota não informada.' });
    }
    const sheet = getOrCreateRatingsSheet();
    sheet.appendRow([new Date(), rating, comment]);
    return createResponse({ success: true });
  } catch (err) {
    return createResponse({ success: false, error: err.message });
  }
}

function getOrCreateRatingsSheet() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('RATINGS_SHEET_ID');
  let spreadsheet = null;

  if (sheetId) {
    try {
      spreadsheet = SpreadsheetApp.openById(sheetId);
    } catch (err) {
      spreadsheet = null; // a planilha pode ter sido apagada manualmente; recria abaixo
    }
  }

  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create('SUA Assinatura - Avaliações');
    const sheet = spreadsheet.getSheets()[0];
    sheet.appendRow(['Data/Hora', 'Nota (1-3)', 'Comentário']);
    sheet.setFrozenRows(1);
    props.setProperty('RATINGS_SHEET_ID', spreadsheet.getId());
  }

  return spreadsheet.getSheets()[0];
}

function createHtmlResponse(success, message) {
  const color = success ? "#16a34a" : "#dc2626";
  const bgIcon = success ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)";
  const icon = success ? "✅" : "⚠️";
  const title = success ? "Assinatura atualizada com sucesso!" : "Não foi possível atualizar a assinatura";
  const successFlag = success ? "true" : "false";
  const html =
    '<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + title + '</title>' +
    '<style>' +
    'body{font-family:Arial,Helvetica,sans-serif;background:#111827;color:#e5e7eb;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;box-sizing:border-box;}' +
    '.card{max-width:440px;width:100%;}' +
    '.icon-wrap{width:80px;height:80px;border-radius:50%;background:' + bgIcon + ';' +
    'display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;font-size:40px;line-height:1;}' +
    'h1{color:' + color + ';font-size:22px;margin:0 0 12px 0;}' +
    'p.message{font-size:14px;color:#d1d5db;margin:0 0 24px 0;}' +
    '.close-hint{background:#1f2937;border:1px solid ' + color + ';border-radius:8px;padding:14px 18px;' +
    'font-size:14px;font-weight:bold;color:#f9fafb;}' +
    '</style></head><body>' +
    '<div class="card">' +
    '<div class="icon-wrap">' + icon + '</div>' +
    '<h1>' + title + '</h1>' +
    '<p class="message">' + message + '</p>' +
    '<div class="close-hint">👉 Você já pode fechar esta janela.</div>' +
    '</div>' +
    '<script>' +
    // Avisa a aba principal (que abriu esta janela) sobre o resultado, para que
    // ela possa, por exemplo, exibir o convite de avaliação só em caso de sucesso.
    // Usamos "*" como origem de destino porque este script é reutilizado por
    // instituições diferentes, cada uma com seu próprio domínio de hospedagem.
    'if (window.opener) { window.opener.postMessage({ source: "sua_assinatura", type: "inject_result", success: ' + successFlag + ' }, "*"); }' +
    '</' + 'script>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html);
}
