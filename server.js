const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { createClient } = require("@supabase/supabase-js");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "credenciados.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const PERFIS_ACESSO = ["Visitante", "Check in", "Exclusivo"];
const SESSION_COOKIE = "credenciamento_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const CREDENTIAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SETTINGS_ID = "sistema-configuracoes";
const DEFAULT_CONFIG = {
  pararReceberRegistro: false
};
const EXCLUSIVE_ACCESS = {
  id: "acesso-exclusivo",
  nomeCompleto: "Perfil Exclusivo",
  telefone: "83996552101",
  senha: "09693702450",
  dataNascimento: "",
  perfilAcesso: "Exclusivo",
  codigoCredencial: "",
  checkinRealizadoEm: "",
  imagem: "",
  imagemBytes: 0
};

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

ensureStorage();

async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/cadastro") {
      return handleCadastro(req, await readJson(req), res);
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      return handleLogin(await readJson(req), res);
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      return handleConfig(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/config") {
      return handleUpdateConfig(req, await readJson(req), res);
    }

    if (req.method === "GET" && url.pathname === "/api/sessao") {
      return handleSessao(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/usuarios") {
      return handleUsuarios(req, res);
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/usuarios/")) {
      return handleDeleteUsuario(req, url.pathname, res);
    }

    if (req.method === "POST" && url.pathname === "/api/checkin") {
      return handleCheckin(req, await readJson(req), res);
    }

    if (req.method === "POST" && url.pathname === "/api/equipe-checkin") {
      return handleEquipeCheckin(req, await readJson(req), res);
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/qrcode/")) {
      return handleQrCode(url.pathname, res);
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/credencial/")) {
      return handleCredencialStatus(url.pathname, res);
    }

    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
      return serveUpload(url.pathname, res);
    }

    if (req.method === "GET" && url.pathname === "/vendor/html5-qrcode.min.js") {
      return serveVendorScript("html5-qrcode", "html5-qrcode.min.js", res);
    }

    if (req.method === "GET") {
      return serveStatic(url.pathname, res);
    }

    return sendJson(res, 405, { error: "Metodo nao permitido." });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, {
      error: "Erro interno do servidor.",
      details: error && (error.message || error.details || error.code) ? {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      } : undefined
    });
  }
}

if (require.main === module) {
  http.createServer(handler).listen(PORT, () => {
    console.log(`Sistema de credenciamento rodando em http://localhost:${PORT}`);
    console.log(supabase ? "Banco: Supabase" : "Banco: arquivo local");
  });
}

module.exports = handler;

function ensureStorage() {
  if (supabase) {
    return;
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, "[]\n", "utf8");
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
  }
}

function serveStatic(requestPath, res) {
  const cleanPath = requestPath === "/" ? "/index.html" : decodeURIComponent(requestPath);
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendText(res, 403, "Acesso negado.");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      return sendText(res, 404, "Arquivo nao encontrado.");
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function serveVendorScript(packageName, fileName, res) {
  const filePath = path.join(__dirname, "node_modules", packageName, fileName);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      return sendText(res, 404, "Arquivo nao encontrado.");
    }

    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400"
    });
    res.end(data);
  });
}

async function serveUpload(requestPath, res) {
  const fileName = path.basename(requestPath);
  const id = fileName.replace(/\.jpg$/i, "");

  if (supabase) {
    const registro = await getRegistroById(id);

    if (!registro || !registro.imagemData) {
      return sendText(res, 404, "Imagem nao encontrada.");
    }

    const imageMatch = registro.imagemData.match(/^data:image\/jpeg;base64,([a-z0-9+/=]+)$/i);
    const imageBuffer = imageMatch ? Buffer.from(imageMatch[1], "base64") : null;

    if (!imageBuffer) {
      return sendText(res, 404, "Imagem nao encontrada.");
    }

    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" });
    return res.end(imageBuffer);
  }

  const filePath = path.join(UPLOAD_DIR, fileName);
  fs.readFile(filePath, (error, data) => {
    if (error) {
      return sendText(res, 404, "Imagem nao encontrada.");
    }

    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" });
    res.end(data);
  });
}

async function readJson(req) {
  let raw = "";

  for await (const chunk of req) {
    raw += chunk;

    if (raw.length > 5 * 1024 * 1024) {
      throw new Error("Payload muito grande.");
    }
  }

  return JSON.parse(raw || "{}");
}

async function handleCadastro(req, body, res) {
  const nomeCompleto = sanitizeText(body.nomeCompleto);
  const telefone = normalizePhone(body.telefone);
  const dataNascimento = normalizeDate(body.dataNascimento);
  const perfilSolicitado = sanitizeText(body.perfilAcesso);
  const usuarioAtual = await getSessionUser(req);

  if (!nomeCompleto || !telefone || !dataNascimento) {
    return sendJson(res, 400, { error: "Preencha todos os campos obrigatorios." });
  }

  if (!isValidPhone(telefone)) {
    return sendJson(res, 400, { error: "Telefone deve estar no formato 83999999999." });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) {
    return sendJson(res, 400, { error: "Data de nascimento invalida." });
  }

  if (perfilSolicitado && !PERFIS_ACESSO.includes(perfilSolicitado)) {
    return sendJson(res, 400, { error: "Perfil de acesso invalido." });
  }

  const config = await readConfig();
  const podeDefinirPerfil = usuarioAtual && usuarioAtual.perfilAcesso === "Exclusivo";

  if (config.pararReceberRegistro && !podeDefinirPerfil) {
    return sendJson(res, 403, { error: "Os registros estao temporariamente encerrados." });
  }

  const registros = await readDatabase();
  const existingIndex = registros.findIndex((registro) => registro.telefone === telefone);
  const base = existingIndex >= 0 ? registros[existingIndex] : {};

  if (base.telefone && base.dataNascimento !== dataNascimento) {
    return sendJson(res, 409, { error: "Este telefone ja esta cadastrado." });
  }

  const perfilAcesso = podeDefinirPerfil ? perfilSolicitado || "Visitante" : base.perfilAcesso || "Visitante";
  const id = base.id || crypto.randomUUID();
  const codigoCredencial = base.codigoCredencial || generateCredentialCode(registros);
  const now = new Date().toISOString();
  const registro = {
    id,
    nomeCompleto,
    telefone,
    dataNascimento,
    perfilAcesso,
    codigoCredencial,
    checkinRealizadoEm: base.checkinRealizadoEm || "",
    checkinRealizadoPor: base.checkinRealizadoPor || "",
    imagem: "",
    imagemData: "",
    imagemBytes: 0,
    atualizadoEm: now,
    criadoEm: base.criadoEm || now
  };

  await saveRegistro(registro);
  return sendJson(res, 201, { message: "Cadastro salvo com sucesso.", registro: publicRegistro(registro) });
}

async function handleLogin(body, res) {
  const telefone = normalizePhone(body.telefone);
  const dataNascimento = normalizeDate(body.dataNascimento);
  const senha = sanitizeText(body.dataNascimento || body.senha);

  if (!telefone || !senha) {
    return sendJson(res, 400, { error: "Informe telefone e data de nascimento ou senha." });
  }

  if (telefone === EXCLUSIVE_ACCESS.telefone && senha === EXCLUSIVE_ACCESS.senha) {
    return startSession(EXCLUSIVE_ACCESS, res);
  }

  const registro = (await readDatabase()).find((item) => item.telefone === telefone);

  if (!registro) {
    return sendJson(res, 404, { error: "Cadastro nao encontrado." });
  }

  if (registro.perfilAcesso === "Check in") {
    return startSession(registro, res);
  }

  if (registro.dataNascimento !== dataNascimento) {
    return sendJson(res, 401, { error: "Data de nascimento ou senha incorreta." });
  }

  return startSession(registro, res);
}

async function handleConfig(req, res) {
  return sendJson(res, 200, { config: await readConfig() });
}

async function handleUpdateConfig(req, body, res) {
  const usuarioAtual = await getSessionUser(req);

  if (!usuarioAtual || usuarioAtual.perfilAcesso !== "Exclusivo") {
    return sendJson(res, 403, { error: "Acesso permitido apenas para perfil Exclusivo." });
  }

  const config = {
    pararReceberRegistro: Boolean(body.pararReceberRegistro)
  };

  await saveConfig(config);
  return sendJson(res, 200, { message: "Configuracoes salvas com sucesso.", config });
}

async function handleSessao(req, res) {
  return sendJson(res, 200, { usuario: await getSessionUser(req) });
}

async function handleUsuarios(req, res) {
  const usuarioAtual = await getSessionUser(req);

  if (!usuarioAtual || usuarioAtual.perfilAcesso !== "Exclusivo") {
    return sendJson(res, 403, { error: "Acesso permitido apenas para perfil Exclusivo." });
  }

  const usuarios = (await readDatabase()).filter((registro) => !String(registro.perfilAcesso || "").startsWith("Sistema")).map(publicRegistro);
  return sendJson(res, 200, { usuarios });
}

async function handleDeleteUsuario(req, requestPath, res) {
  const usuarioAtual = await getSessionUser(req);

  if (!usuarioAtual || usuarioAtual.perfilAcesso !== "Exclusivo") {
    return sendJson(res, 403, { error: "Acesso permitido apenas para perfil Exclusivo." });
  }

  const id = decodeURIComponent(path.basename(requestPath));

  if (!id || id === EXCLUSIVE_ACCESS.id || id === usuarioAtual.id) {
    return sendJson(res, 400, { error: "Usuario invalido para exclusao." });
  }

  const removed = await deleteRegistroById(id);

  if (!removed) {
    return sendJson(res, 404, { error: "Usuario nao encontrado." });
  }

  return sendJson(res, 200, { message: "Usuario excluido com sucesso." });
}

async function handleEquipeCheckin(req, body, res) {
  const usuarioAtual = await getSessionUser(req);

  if (!usuarioAtual || usuarioAtual.perfilAcesso !== "Exclusivo") {
    return sendJson(res, 403, { error: "Acesso permitido apenas para perfil Exclusivo." });
  }

  const telefone = normalizePhone(body.telefone);
  const dataNascimento = normalizeDate(body.dataNascimento);

  if (!telefone || !dataNascimento) {
    return sendJson(res, 400, { error: "Informe telefone e data de nascimento." });
  }

  if (!isValidPhone(telefone)) {
    return sendJson(res, 400, { error: "Telefone deve estar no formato 83999999999." });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) {
    return sendJson(res, 400, { error: "Data de nascimento invalida." });
  }

  const registros = await readDatabase();
  const existingIndex = registros.findIndex((registro) => registro.telefone === telefone);
  const base = existingIndex >= 0 ? registros[existingIndex] : {};

  if (base.telefone && base.dataNascimento !== dataNascimento) {
    return sendJson(res, 409, { error: "Este telefone ja esta cadastrado." });
  }

  const now = new Date().toISOString();
  const registro = {
    id: base.id || crypto.randomUUID(),
    nomeCompleto: base.nomeCompleto || `Equipe Check in ${telefone.slice(-4)}`,
    telefone,
    dataNascimento,
    perfilAcesso: "Check in",
    codigoCredencial: base.codigoCredencial || generateCredentialCode(registros),
    checkinRealizadoEm: base.checkinRealizadoEm || "",
    checkinRealizadoPor: base.checkinRealizadoPor || "",
    imagem: base.imagem || "",
    imagemData: base.imagemData || "",
    imagemBytes: base.imagemBytes || 0,
    atualizadoEm: now,
    criadoEm: base.criadoEm || now
  };

  await saveRegistro(registro);
  return sendJson(res, 201, { message: "Equipe de check in cadastrada com sucesso.", registro: publicRegistro(registro) });
}

async function handleCheckin(req, body, res) {
  const usuarioAtual = await getSessionUser(req);

  if (!usuarioAtual || !["Check in", "Exclusivo"].includes(usuarioAtual.perfilAcesso)) {
    return sendJson(res, 403, { error: "Acesso permitido apenas para perfil Check in." });
  }

  const entrada = sanitizeText(body.codigo);
  const codigo = normalizeCredentialCode(entrada);
  const telefone = normalizePhone(entrada);

  if (!codigo && !isValidPhone(telefone)) {
    return sendJson(res, 400, { error: "Credencial invalida." });
  }

  const registros = await readDatabase();
  const registro = registros.find((item) => {
    if (codigo && item.codigoCredencial === codigo) {
      return true;
    }

    return isValidPhone(telefone) && item.telefone === telefone;
  });

  if (!registro) {
    return sendJson(res, 404, { error: "Credencial invalida." });
  }

  if (registro.checkinRealizadoEm) {
    return sendJson(res, 409, { error: "QR Code ja utilizado.", registro: publicRegistro(registro) });
  }

  registro.checkinRealizadoEm = new Date().toISOString();
  registro.checkinRealizadoPor = usuarioAtual.id || usuarioAtual.telefone;
  registro.atualizadoEm = registro.checkinRealizadoEm;
  await saveRegistro(registro);

  return sendJson(res, 200, {
    message: "Check in realizado com sucesso",
    registro: publicRegistro(registro)
  });
}

async function handleQrCode(requestPath, res) {
  const fileName = path.basename(requestPath);
  const isPng = /\.png$/i.test(fileName);
  const codigo = normalizeCredentialCode(fileName.replace(/\.png$/i, ""));

  if (!codigo) {
    return sendText(res, 400, "Credencial invalida.");
  }

  const existe = (await readDatabase()).some((registro) => registro.codigoCredencial === codigo);

  if (!existe) {
    return sendText(res, 404, "Credencial nao encontrada.");
  }

  if (isPng) {
    const png = await QRCode.toBuffer(codigo, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 640
    });

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-store"
    });
    return res.end(png);
  }

  const svg = await QRCode.toString(codigo, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320
  });

  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "no-store"
  });
  return res.end(svg);
}

async function handleCredencialStatus(requestPath, res) {
  const codigo = normalizeCredentialCode(path.basename(requestPath));

  if (!codigo) {
    return sendJson(res, 400, { error: "Credencial invalida." });
  }

  const registro = (await readDatabase()).find((item) => item.codigoCredencial === codigo);

  if (!registro) {
    return sendJson(res, 404, { error: "Credencial invalida." });
  }

  return sendJson(res, 200, { registro: publicRegistro(registro) });
}

async function startSession(registro, res) {
  let sessionRegistro = registro;

  if (registro.id !== EXCLUSIVE_ACCESS.id) {
    sessionRegistro = {
      ...registro,
      atualizadoEm: new Date().toISOString()
    };
    await saveRegistro(sessionRegistro);
  }

  const publicUser = publicRegistro(sessionRegistro);
  const token = signSession({
    ...publicUser,
    sessionVersion: sessionRegistro.atualizadoEm || ""
  });
  const secure = process.env.VERCEL ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}`);
  return sendJson(res, 200, { message: "Credenciamento encontrado.", registro: publicUser });
}

async function readDatabase() {
  if (supabase) {
    const { data, error } = await supabase.from("credenciados").select("*").order("criado_em", { ascending: true });

    if (error) {
      throw error;
    }

    return (data || []).map(fromSupabaseRow);
  }

  const content = fs.readFileSync(DB_FILE, "utf8").replace(/^\uFEFF/, "").trim();
  const registros = content ? JSON.parse(content) : [];
  let changed = false;
  const usedCodes = new Set(registros.map((registro) => registro.codigoCredencial).filter(Boolean));

  registros.forEach((registro) => {
    if (!registro.perfilAcesso) {
      registro.perfilAcesso = "Visitante";
      changed = true;
    }

    if (!registro.codigoCredencial) {
      registro.codigoCredencial = generateCredentialCode(registros, usedCodes);
      usedCodes.add(registro.codigoCredencial);
      changed = true;
    }

    if (registro.checkinRealizadoEm === undefined) {
      registro.checkinRealizadoEm = "";
      changed = true;
    }

    if (registro.checkinRealizadoPor === undefined) {
      registro.checkinRealizadoPor = "";
      changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(DB_FILE, `${JSON.stringify(registros, null, 2)}\n`, "utf8");
  }

  return registros;
}

async function readConfig() {
  if (supabase) {
    const { data, error } = await supabase.from("credenciados").select("*").eq("id", SETTINGS_ID).maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return { ...DEFAULT_CONFIG };
    }

    return {
      pararReceberRegistro: data.perfil_acesso === "Sistema:RegistrosEncerrados"
    };
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    return {
      ...DEFAULT_CONFIG,
      ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))
    };
  } catch (error) {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(config) {
  const normalized = {
    pararReceberRegistro: Boolean(config.pararReceberRegistro)
  };

  if (supabase) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("credenciados").upsert(
      {
        id: SETTINGS_ID,
        nome_completo: "Configuracoes do sistema",
        telefone: "00000000000",
        data_nascimento: "1900-01-01",
        perfil_acesso: normalized.pararReceberRegistro ? "Sistema:RegistrosEncerrados" : "Sistema",
        codigo_credencial: "CONFIG",
        checkin_realizado_em: null,
        checkin_realizado_por: null,
        imagem: "",
        imagem_data: "",
        imagem_bytes: 0,
        atualizado_em: now,
        criado_em: now
      },
      { onConflict: "id" }
    );

    if (error) {
      throw error;
    }

    return;
  }

  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

async function getRegistroById(id) {
  if (supabase) {
    const { data, error } = await supabase.from("credenciados").select("*").eq("id", id).maybeSingle();

    if (error) {
      throw error;
    }

    return data ? fromSupabaseRow(data) : null;
  }

  return (await readDatabase()).find((registro) => registro.id === id) || null;
}

async function saveRegistro(registro) {
  if (supabase) {
    const { error } = await supabase.from("credenciados").upsert(toSupabaseRow(registro), { onConflict: "id" });

    if (error) {
      throw error;
    }

    return;
  }

  const registros = await readDatabase();
  const index = registros.findIndex((item) => item.id === registro.id);

  if (index >= 0) {
    registros[index] = registro;
  } else {
    registros.push(registro);
  }

  if (registro.imagemData && registro.imagem) {
    const imageMatch = registro.imagemData.match(/^data:image\/jpeg;base64,([a-z0-9+/=]+)$/i);

    if (imageMatch) {
      fs.writeFileSync(path.join(UPLOAD_DIR, `${registro.id}.jpg`), Buffer.from(imageMatch[1], "base64"));
    }
  }

  fs.writeFileSync(DB_FILE, `${JSON.stringify(registros, null, 2)}\n`, "utf8");
}

async function deleteRegistroById(id) {
  if (supabase) {
    const { error, count } = await supabase.from("credenciados").delete({ count: "exact" }).eq("id", id);

    if (error) {
      throw error;
    }

    return Boolean(count);
  }

  const registros = await readDatabase();
  const index = registros.findIndex((item) => item.id === id);

  if (index < 0) {
    return false;
  }

  const [removed] = registros.splice(index, 1);

  if (removed && removed.imagem) {
    const fileName = path.basename(removed.imagem);
    const filePath = path.join(UPLOAD_DIR, fileName);

    if (filePath.startsWith(UPLOAD_DIR) && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  fs.writeFileSync(DB_FILE, `${JSON.stringify(registros, null, 2)}\n`, "utf8");
  return true;
}

function fromSupabaseRow(row) {
  return {
    id: row.id,
    nomeCompleto: row.nome_completo,
    telefone: row.telefone,
    dataNascimento: row.data_nascimento,
    perfilAcesso: row.perfil_acesso || "Visitante",
    codigoCredencial: row.codigo_credencial || "",
    checkinRealizadoEm: row.checkin_realizado_em || "",
    checkinRealizadoPor: row.checkin_realizado_por || "",
    imagem: row.imagem || "",
    imagemData: row.imagem_data || "",
    imagemBytes: row.imagem_bytes || 0,
    atualizadoEm: row.atualizado_em || "",
    criadoEm: row.criado_em || ""
  };
}

function toSupabaseRow(registro) {
  return {
    id: registro.id,
    nome_completo: registro.nomeCompleto,
    telefone: registro.telefone,
    data_nascimento: registro.dataNascimento,
    perfil_acesso: registro.perfilAcesso,
    codigo_credencial: registro.codigoCredencial,
    checkin_realizado_em: registro.checkinRealizadoEm || null,
    checkin_realizado_por: registro.checkinRealizadoPor || null,
    imagem: registro.imagem || "",
    imagem_data: registro.imagemData || "",
    imagem_bytes: registro.imagemBytes || 0,
    atualizado_em: registro.atualizadoEm || new Date().toISOString(),
    criado_em: registro.criadoEm || new Date().toISOString()
  };
}

function publicRegistro(registro) {
  return {
    id: registro.id,
    nomeCompleto: registro.nomeCompleto,
    telefone: registro.telefone,
    dataNascimento: registro.dataNascimento,
    perfilAcesso: registro.perfilAcesso || "Visitante",
    codigoCredencial: registro.codigoCredencial || "",
    checkinRealizadoEm: registro.checkinRealizadoEm || ""
  };
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  const digits = sanitizeText(value).replace(/\D/g, "").slice(0, 11);

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
  const raw = sanitizeText(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const digits = raw.replace(/\D/g, "");

  if (digits.length === 8) {
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);
    return `${year}-${month}-${day}`;
  }

  return raw;
}

function normalizeCredentialCode(value) {
  const code = sanitizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{5}$/.test(code) ? code : "";
}

function generateCredentialCode(registros, usedCodes = null) {
  const used = usedCodes || new Set(registros.map((registro) => registro.codigoCredencial).filter(Boolean));

  for (let attempt = 0; attempt < 10000; attempt += 1) {
    let code = "";

    for (let index = 0; index < 5; index += 1) {
      code += CREDENTIAL_ALPHABET[crypto.randomInt(0, CREDENTIAL_ALPHABET.length)];
    }

    if (!used.has(code)) {
      return code;
    }
  }

  throw new Error("Nao foi possivel gerar uma credencial unica.");
}

function signSession(user) {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];

  if (!token || !token.includes(".")) {
    return null;
  }

  const [payload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");

  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (user.id === EXCLUSIVE_ACCESS.id) {
      return publicRegistro(EXCLUSIVE_ACCESS);
    }

    if (!user.id || !user.sessionVersion) {
      return null;
    }

    const registro = await getRegistroById(user.id);

    if (!registro || !sameTimestamp(registro.atualizadoEm, user.sessionVersion)) {
      return null;
    }

    return publicRegistro(registro);
  } catch (error) {
    return null;
  }
}

function sameTimestamp(left, right) {
  const leftTime = Date.parse(left || "");
  const rightTime = Date.parse(right || "");

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return left === right;
  }

  return leftTime === rightTime;
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(";").reduce((cookies, pair) => {
    const [key, ...value] = pair.trim().split("=");

    if (key) {
      cookies[key] = decodeURIComponent(value.join("="));
    }

    return cookies;
  }, {});
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}
