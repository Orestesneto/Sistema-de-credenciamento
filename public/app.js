const tabs = document.querySelectorAll(".tab-button");
const panels = document.querySelectorAll(".panel");
const cadastroTab = document.querySelector("#tab-cadastro");
const cadastroForm = document.querySelector("#cadastro-panel");
const loginForm = document.querySelector("#login-panel");
const cadastroStatus = document.querySelector("#cadastro-status");
const loginStatus = document.querySelector("#login-status");
const credentialCard = document.querySelector("#credential-card");
const dashboardPanel = document.querySelector("#dashboard-panel");
const dashboardUserCard = document.querySelector("#dashboard-user-card");
const dashboardProfile = document.querySelector("#dashboard-profile");
const dashboardTitle = document.querySelector("#dashboard-title");
const backLoginButton = document.querySelector("#back-login-button");
const exclusiveTabs = document.querySelector("#exclusive-tabs");
const dashboardTabs = document.querySelectorAll(".dashboard-tab");
const dashboardSections = document.querySelectorAll(".dashboard-section");
const teamCheckinForm = document.querySelector("#team-checkin-form");
const teamTelefoneInput = document.querySelector("#team-telefone");
const teamDataNascimentoInput = document.querySelector("#team-data-nascimento");
const dataNascimentoInput = document.querySelector("#data-nascimento");
const teamSaveButton = document.querySelector("#team-save-button");
const teamStatus = document.querySelector("#team-status");
const salvarButton = document.querySelector("#salvar-button");
const telefoneInputs = [document.querySelector("#telefone"), document.querySelector("#login-telefone"), teamTelefoneInput];
const perfilAcessoField = document.querySelector("#perfil-acesso-field");
const perfilAcessoSelect = document.querySelector("#perfil-acesso");
const adminArea = document.querySelector("#admin-area");
const adminTotal = document.querySelector("#admin-total");
const userCards = document.querySelector("#user-cards");
const checkinArea = document.querySelector("#checkin-area");
const scannerHelp = document.querySelector("#scanner-help");
const startScannerButton = document.querySelector("#start-scanner-button");
const manualCodeInput = document.querySelector("#manual-code");
const manualCheckinButton = document.querySelector("#manual-checkin-button");
const checkinStatus = document.querySelector("#checkin-status");
const qrModal = document.querySelector("#qr-modal");
const qrModalImg = document.querySelector("#qr-modal-img");
const qrModalCode = document.querySelector("#qr-modal-code");
const qrWhatsappButton = document.querySelector("#qr-whatsapp-button");
const checkinModal = document.querySelector("#checkin-modal");
const checkinModalText = document.querySelector("#checkin-modal-text");
const toggleRegistrosEncerrados = document.querySelector("#toggle-registros-encerrados");
const settingsStatus = document.querySelector("#settings-status");

let usuarioAtual = null;
let qrScanner = null;
let scannerActive = false;
let lastScannedCode = "";
let visitorStatusTimer = null;
let visitorStatusCode = "";
let sessionMonitorTimer = null;
let sistemaConfig = {
  pararReceberRegistro: false
};

carregarConfiguracoes();
carregarSessao();

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.id.replace("tab-", "")));
});

telefoneInputs.forEach((input) => {
  input.addEventListener("input", () => {
    input.value = onlyPhoneDigits(input.value);
  });

  input.addEventListener("blur", () => {
    input.value = normalizePhone(input.value);
  });
});

document.querySelector("#login-data-nascimento").addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 11);
});

teamDataNascimentoInput.addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 8);
});

dataNascimentoInput.addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 8);
});

manualCodeInput.addEventListener("input", () => {
  manualCodeInput.value = normalizeCheckinInput(manualCodeInput.value);
});

manualCheckinButton.addEventListener("click", () => {
  realizarCheckin(manualCodeInput.value);
});

startScannerButton.addEventListener("click", iniciarScanner);

backLoginButton.addEventListener("click", () => {
  mostrarTelaLogin();
});

dashboardTabs.forEach((tab) => {
  tab.addEventListener("click", () => ativarDashboardTab(tab.dataset.dashboardTab));
});

teamCheckinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await cadastrarEquipeCheckin();
});

toggleRegistrosEncerrados.addEventListener("change", salvarConfiguracaoRegistros);

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => {
    fecharModal(button.dataset.closeModal);
  });
});

cadastroForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    nomeCompleto: document.querySelector("#nome-completo").value,
    telefone: normalizePhone(document.querySelector("#telefone").value),
    dataNascimento: normalizeDate(dataNascimentoInput.value)
  };

  if (usuarioPodeDefinirPerfil() && perfilAcessoSelect) {
    payload.perfilAcesso = perfilAcessoSelect.value;
  }

  if (!isValidPhone(payload.telefone)) {
    setStatus(cadastroStatus, "Telefone deve ficar no formato 83999999999.", "error");
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dataNascimento)) {
    setStatus(cadastroStatus, "Informe a data no formato 01012000.", "error");
    return;
  }

  salvarButton.disabled = true;
  setStatus(cadastroStatus, "Salvando cadastro...", "warn");

  try {
    const response = await postJson("/api/cadastro", payload);
    setStatus(cadastroStatus, response.message, "success");
    await carregarConfiguracoes();
    if ((response.registro.perfilAcesso || "Visitante") === "Visitante") {
      mostrarQrCode(response.registro);
    }
    cadastroForm.reset();
  } catch (error) {
    setStatus(cadastroStatus, error.message, "error");
  } finally {
    salvarButton.disabled = false;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  credentialCard.classList.add("hidden");
  adminArea.classList.add("hidden");
  dashboardPanel.classList.add("hidden");
  setStatus(loginStatus, "Consultando credenciamento...", "warn");

  try {
    const telefone = normalizePhone(document.querySelector("#login-telefone").value);

    if (!isValidPhone(telefone)) {
      setStatus(loginStatus, "Telefone deve ficar no formato 83999999999.", "error");
      return;
    }

    const response = await postJson("/api/login", {
      telefone,
      dataNascimento: normalizeDate(document.querySelector("#login-data-nascimento").value)
    });

    usuarioAtual = response.registro;
    atualizarPermissaoPerfil();

    if (usuarioTemTelaOperacional()) {
      await mostrarTelaOperacional();
    } else {
      renderCredential(response.registro);
      mostrarQrCode(response.registro);
    }

    setStatus(loginStatus, response.message, "success");
  } catch (error) {
    setStatus(loginStatus, error.message, "error");
  }
});

async function activateTab(name) {
  document.body.classList.remove("operational-view");
  dashboardPanel.classList.add("hidden");
  dashboardPanel.classList.remove("active");
  pararMonitorSessao();
  await pararScanner();

  tabs.forEach((tab) => {
    const active = tab.id === `tab-${name}`;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${name}-panel`);
  });
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Nao foi possivel concluir a operacao.");
  }

  return data;
}

async function deleteJson(url) {
  const response = await fetch(url, { method: "DELETE" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Nao foi possivel concluir a operacao.");
  }

  return data;
}

function renderCredential(registro) {
  credentialCard.innerHTML = renderCredentialMarkup(registro);
  credentialCard.classList.remove("hidden");
}

function renderDashboardCredential(registro) {
  dashboardUserCard.innerHTML = renderCredentialMarkup(registro);
}

function renderCredentialMarkup(registro) {
  return `
    <div>
      <h2>${escapeHtml(registro.nomeCompleto)}</h2>
      <span>Telefone: ${formatPhone(registro.telefone)}</span>
      <span>Nascimento: ${formatDate(registro.dataNascimento)}</span>
      <span>Perfil: ${escapeHtml(registro.perfilAcesso || "Visitante")}</span>
    </div>
  `;
}

async function carregarSessao() {
  try {
    const response = await fetch("/api/sessao");
    const data = await response.json();
    usuarioAtual = data.usuario || null;
    if (usuarioTemTelaOperacional()) {
      await mostrarTelaOperacional();
    }
  } catch (error) {
    usuarioAtual = null;
  } finally {
    atualizarPermissaoPerfil();
  }
}

async function carregarConfiguracoes() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      return;
    }

    sistemaConfig = {
      ...sistemaConfig,
      ...(data.config || {})
    };
    aplicarConfiguracaoRegistros();
  } catch (error) {
    aplicarConfiguracaoRegistros();
  }
}

function aplicarConfiguracaoRegistros() {
  const registrosEncerrados = Boolean(sistemaConfig.pararReceberRegistro);
  cadastroTab.classList.toggle("hidden", registrosEncerrados);
  cadastroForm.classList.toggle("hidden", registrosEncerrados);

  if (toggleRegistrosEncerrados) {
    toggleRegistrosEncerrados.checked = registrosEncerrados;
  }

  if (registrosEncerrados && cadastroForm.classList.contains("active")) {
    activateTab("login");
  }
}

async function salvarConfiguracaoRegistros() {
  if (!toggleRegistrosEncerrados) {
    return;
  }

  toggleRegistrosEncerrados.disabled = true;
  setStatus(settingsStatus, "Salvando configuracoes...", "warn");

  try {
    const response = await postJson("/api/config", {
      pararReceberRegistro: toggleRegistrosEncerrados.checked
    });
    sistemaConfig = response.config || sistemaConfig;
    aplicarConfiguracaoRegistros();
    setStatus(settingsStatus, response.message, "success");
  } catch (error) {
    toggleRegistrosEncerrados.checked = Boolean(sistemaConfig.pararReceberRegistro);
    setStatus(settingsStatus, error.message, "error");
  } finally {
    toggleRegistrosEncerrados.disabled = false;
  }
}

function atualizarPermissaoPerfil() {
  if (!perfilAcessoField || !perfilAcessoSelect) {
    return;
  }

  const permitido = usuarioPodeDefinirPerfil();
  perfilAcessoField.classList.toggle("hidden", !permitido);
  perfilAcessoSelect.disabled = !permitido;
  perfilAcessoSelect.value = "Visitante";
}

function usuarioPodeDefinirPerfil() {
  return usuarioAtual && usuarioAtual.perfilAcesso === "Exclusivo";
}

function usuarioTemTelaOperacional() {
  return usuarioAtual && ["Check in", "Exclusivo"].includes(usuarioAtual.perfilAcesso);
}

async function mostrarTelaOperacional() {
  await pararScanner();
  iniciarMonitorSessao();
  document.body.classList.add("operational-view");
  tabs.forEach((tab) => {
    tab.classList.remove("active");
    tab.setAttribute("aria-selected", "false");
  });
  panels.forEach((panel) => panel.classList.remove("active"));
  dashboardPanel.classList.remove("hidden");
  dashboardPanel.classList.add("active");
  credentialCard.classList.add("hidden");
  renderDashboardCredential(usuarioAtual);
  dashboardProfile.textContent = usuarioAtual.perfilAcesso;
  dashboardTitle.textContent = usuarioAtual.perfilAcesso === "Exclusivo" ? "Painel exclusivo" : "Painel de check-in";
  exclusiveTabs.classList.toggle("hidden", usuarioAtual.perfilAcesso !== "Exclusivo");
  ativarDashboardTab("checkin");
  atualizarAreaCheckin();
}

async function mostrarTelaLogin() {
  await pararScanner();
  pararMonitorSessao();
  document.body.classList.remove("operational-view");
  dashboardPanel.classList.add("hidden");
  dashboardPanel.classList.remove("active");
  adminArea.classList.add("hidden");
  checkinArea.classList.add("hidden");
  exclusiveTabs.classList.add("hidden");
  activateTab("login");
}

function iniciarMonitorSessao() {
  pararMonitorSessao();
  sessionMonitorTimer = setInterval(verificarSessaoAtual, 5000);
}

function pararMonitorSessao() {
  if (sessionMonitorTimer) {
    clearInterval(sessionMonitorTimer);
    sessionMonitorTimer = null;
  }
}

async function verificarSessaoAtual() {
  if (!usuarioAtual || !usuarioTemTelaOperacional()) {
    return;
  }

  try {
    const response = await fetch("/api/sessao", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok || !data.usuario || data.usuario.id !== usuarioAtual.id) {
      usuarioAtual = null;
      await mostrarTelaLogin();
      setStatus(loginStatus, "Este usuario entrou em outra tela. Faca login novamente.", "warn");
    }
  } catch (error) {
    // Mantem a tela atual se houver apenas uma oscilacao temporaria de rede.
  }
}

async function atualizarAreaCheckin() {
  const podeFazerCheckin = usuarioTemTelaOperacional();
  checkinArea.classList.toggle("hidden", !podeFazerCheckin);

  if (!podeFazerCheckin) {
    await pararScanner();
  }
}

async function carregarUsuariosSeExclusivo() {
  if (!usuarioPodeDefinirPerfil()) {
    adminArea.classList.add("hidden");
    userCards.innerHTML = "";
    return;
  }

  const response = await fetch("/api/usuarios");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Nao foi possivel carregar os usuarios.");
  }

  renderUserCards(data.usuarios || []);
}

function ativarDashboardTab(name) {
  if (name === "usuarios") {
    carregarUsuariosSeExclusivo();
  }

  dashboardTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.dashboardTab === name);
  });

  dashboardSections.forEach((section) => {
    const active = section.dataset.dashboardSection === name;
    const exclusiveOnly = ["usuarios", "cadastrar-checkin", "configuracoes"].includes(section.dataset.dashboardSection);
    section.classList.toggle("hidden", !active || (exclusiveOnly && !usuarioPodeDefinirPerfil()));
  });
}

async function cadastrarEquipeCheckin() {
  const telefone = normalizePhone(teamTelefoneInput.value);
  const dataNascimento = normalizeDate(teamDataNascimentoInput.value);

  if (!isValidPhone(telefone)) {
    setStatus(teamStatus, "Telefone deve ficar no formato 83999999999.", "error");
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) {
    setStatus(teamStatus, "Informe a data no formato 01012000.", "error");
    return;
  }

  teamSaveButton.disabled = true;
  setStatus(teamStatus, "Cadastrando equipe...", "warn");

  try {
    const response = await postJson("/api/equipe-checkin", { telefone, dataNascimento });
    setStatus(teamStatus, response.message, "success");
    teamCheckinForm.reset();
    await carregarUsuariosSeExclusivo();
  } catch (error) {
    setStatus(teamStatus, error.message, "error");
  } finally {
    teamSaveButton.disabled = false;
  }
}

function renderUserCards(usuarios) {
  adminTotal.textContent = String(usuarios.length);
  userCards.innerHTML = usuarios.map(renderUserCard).join("");
  userCards.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => excluirUsuario(button.dataset.deleteUser, button.dataset.userName));
  });
  adminArea.classList.remove("hidden");
}

function renderUserCard(usuario) {
  const checkinText = usuario.checkinRealizadoEm ? `Presente em ${formatDateTime(usuario.checkinRealizadoEm)}` : "Pendente";

  return `
    <article class="user-card">
      <div>
        <h3>${escapeHtml(usuario.nomeCompleto)}</h3>
        <span>${formatPhone(usuario.telefone)}</span>
        <span>${formatDate(usuario.dataNascimento)}</span>
        <strong>${escapeHtml(usuario.perfilAcesso || "Visitante")}</strong>
        <em>${checkinText}</em>
        <button class="danger-button" type="button" data-delete-user="${escapeHtml(usuario.id)}" data-user-name="${escapeHtml(usuario.nomeCompleto)}">Excluir</button>
      </div>
    </article>
  `;
}

async function excluirUsuario(id, nome) {
  if (!id) {
    return;
  }

  const confirmar = window.confirm(`Excluir o cadastro de ${nome || "este usuario"}? Esta acao nao pode ser desfeita.`);

  if (!confirmar) {
    return;
  }

  try {
    await deleteJson(`/api/usuarios/${encodeURIComponent(id)}`);
    await carregarUsuariosSeExclusivo();
  } catch (error) {
    window.alert(error.message);
  }
}

function setStatus(element, message, type) {
  element.textContent = message;
  element.className = `status-message ${type || ""}`.trim();
}

async function iniciarScanner() {
  if (!window.Html5Qrcode) {
    setStatus(checkinStatus, "Leitor de QR Code nao carregado. Digite o codigo ou telefone.", "warn");
    return;
  }

  try {
    if (!qrScanner) {
      qrScanner = new Html5Qrcode("scanner-reader", false);
    }

    if (scannerActive) {
      await pararScanner();
      return;
    }

    const cameraConfig = await getCameraConfig();
    await qrScanner.start(
      cameraConfig,
      {
        fps: 10,
        qrbox: { width: 240, height: 240 },
        aspectRatio: 1
      },
      async (decodedText) => {
        const code = normalizeCredentialCode(decodedText);

        if (code && code !== lastScannedCode) {
          lastScannedCode = code;
          await realizarCheckin(code);
        }
      },
      () => {}
    );
    scannerActive = true;
    startScannerButton.textContent = "Fechar camera";
    scannerHelp.textContent = "Aponte a camera para o QR Code do visitante.";
    setStatus(checkinStatus, "Camera aberta. Aponte para o QR Code.", "warn");
  } catch (error) {
    setStatus(checkinStatus, "Nao foi possivel abrir a camera. No celular, permita o acesso a camera ou digite o codigo.", "error");
  }
}

async function getCameraConfig() {
  try {
    const cameras = await Html5Qrcode.getCameras();
    const rearCamera = cameras.find((camera) => /back|rear|environment|traseira/i.test(camera.label));

    if (rearCamera) {
      return { deviceId: { exact: rearCamera.id } };
    }
  } catch (error) {
    // O iOS pode esconder nomes das cameras antes da permissao; o fallback usa facingMode.
  }

  return { facingMode: "environment" };
}

async function pararScanner() {
  scannerActive = false;
  lastScannedCode = "";
  startScannerButton.textContent = "Abrir camera";
  scannerHelp.textContent = "Abra a camera e aponte para o QR Code do visitante.";

  if (qrScanner && qrScanner.isScanning) {
    try {
      await qrScanner.stop();
      await qrScanner.clear();
    } catch (error) {
      // A biblioteca pode informar erro se a camera ja foi encerrada pelo navegador.
    }
  }
}

async function realizarCheckin(value) {
  const codigo = normalizeCheckinInput(value);

  if (!isValidCheckinInput(codigo)) {
    setStatus(checkinStatus, "Informe o codigo de 5 caracteres ou telefone 83999999999.", "error");
    return;
  }

  manualCodeInput.value = codigo;
  setStatus(checkinStatus, "Validando credencial...", "warn");

  try {
    const response = await postJson("/api/checkin", { codigo });
    setStatus(checkinStatus, response.message, "success");
    mostrarCheckinSucesso(response.registro);
    manualCodeInput.value = "";
    await carregarUsuariosSeExclusivo();
  } catch (error) {
    setStatus(checkinStatus, error.message, "error");
  }
}

function mostrarQrCode(registro) {
  if (!registro.codigoCredencial) {
    return;
  }

  const qrImagePath = `/api/qrcode/${registro.codigoCredencial}.png`;
  qrModalImg.src = qrImagePath;
  qrModalCode.textContent = registro.codigoCredencial;
  configurarLinkWhatsappQr(registro, qrImagePath);
  abrirModal(qrModal);
  acompanharBaixaVisitante(registro.codigoCredencial);
}

function configurarLinkWhatsappQr(registro, qrImagePath) {
  const telefone = normalizePhone(registro.telefone);
  const codigo = registro.codigoCredencial || "";

  if (!isValidPhone(telefone) || !codigo) {
    qrWhatsappButton.classList.add("hidden");
    qrWhatsappButton.removeAttribute("href");
    return;
  }

  const qrImageUrl = new URL(qrImagePath, window.location.origin).href;
  const nome = registro.nomeCompleto || "";
  const message = [
    `Olá${nome ? `, ${getFirstLastName(nome)}` : ""}. Segue o meu QR Code para o credenciamento.`,
    `Código: ${codigo}`,
    `Imagem do QR Code: ${qrImageUrl}`
  ].join("\n");

  qrWhatsappButton.href = `https://api.whatsapp.com/send?phone=55${telefone}&text=${encodeURIComponent(message)}`;
  qrWhatsappButton.classList.remove("hidden");
}

function mostrarCheckinSucesso(registro) {
  if (registro && registro.nomeCompleto) {
    const nome = getFirstLastName(registro.nomeCompleto);
    checkinModalText.textContent = `Olá ${nome}, o seu check in já foi dado baixa. Seja Bem-Vindo(a)!`;
  } else {
    checkinModalText.textContent = "Check in realizado com sucesso.";
  }

  abrirModal(checkinModal);
}

function abrirModal(modal) {
  modal.classList.remove("hidden");
}

function fecharModal(id) {
  document.querySelector(`#${id}`).classList.add("hidden");

  if (id === "qr-modal") {
    pararAcompanhamentoVisitante();
  }
}

function acompanharBaixaVisitante(codigo) {
  pararAcompanhamentoVisitante();
  visitorStatusCode = codigo;
  visitorStatusTimer = setInterval(() => verificarBaixaVisitante(codigo), 2500);
  verificarBaixaVisitante(codigo);
}

function pararAcompanhamentoVisitante() {
  if (visitorStatusTimer) {
    clearInterval(visitorStatusTimer);
    visitorStatusTimer = null;
  }

  visitorStatusCode = "";
}

async function verificarBaixaVisitante(codigo) {
  if (!codigo || codigo !== visitorStatusCode) {
    return;
  }

  try {
    const response = await fetch(`/api/credencial/${codigo}`);
    const data = await response.json();

    if (!response.ok) {
      return;
    }

    if (data.registro && data.registro.checkinRealizadoEm) {
      pararAcompanhamentoVisitante();
      fecharModal("qr-modal");
      mostrarCheckinSucesso(data.registro);
    }
  } catch (error) {
    // Mantem a tela do visitante silenciosa se houver uma oscilacao de rede.
  }
}

function normalizeCredentialCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

function normalizeCheckinInput(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
}

function isValidCheckinInput(value) {
  return /^[A-Z0-9]{5}$/.test(value) || /^83\d{9}$/.test(value);
}

function formatBytes(bytes) {
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function formatPhone(value) {
  const phone = String(value || "");

  if (phone.length === 11) {
    return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
  }

  if (phone.length === 10) {
    return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
  }

  return phone;
}

function onlyPhoneDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function normalizePhone(value) {
  const digits = onlyPhoneDigits(value);

  if (digits.length === 8) {
    return `839${digits}`.slice(0, 11);
  }

  if (digits.length === 9) {
    return `83${digits}`.slice(0, 11);
  }

  return digits;
}

function isValidPhone(value) {
  return /^83\d{9}$/.test(value);
}

function normalizeDate(value) {
  const raw = String(value || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const digits = raw.replace(/\D/g, "");

  if (digits.length === 8) {
    return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  }

  return raw;
}

function formatDate(value) {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getFirstLastName(value) {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length <= 1) {
    return words[0] || "";
  }

  return `${words[0]} ${words[words.length - 1]}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
