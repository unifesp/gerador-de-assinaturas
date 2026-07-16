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
