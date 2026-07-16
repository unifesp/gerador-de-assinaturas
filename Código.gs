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
 */
function doPost(e) {
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

    return createHtmlResponse(true, "Assinatura atualizada com sucesso na conta " + userEmail + ".");
  } catch (err) {
    return createHtmlResponse(false, "Erro ao gravar a assinatura: " + err.message);
  }
}

function createHtmlResponse(success, message) {
  const color = success ? "#16a34a" : "#dc2626";
  const bgIcon = success ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)";
  const icon = success ? "✅" : "⚠️";
  const title = success ? "Assinatura atualizada com sucesso!" : "Não foi possível atualizar a assinatura";
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
    '</body></html>';
  return HtmlService.createHtmlOutput(html);
}
