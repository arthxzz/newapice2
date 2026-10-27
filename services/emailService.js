// ============================================
// services/emailService.js
// Envio de e-mails transacionais (recuperação de senha).
//
// Requer as variáveis de ambiente SMTP_HOST, SMTP_PORT,
// SMTP_USER, SMTP_PASS e SMTP_FROM — sem elas, o transporte
// não é criado e sendPasswordResetEmail() falha com um erro
// claro (o chamador decide como responder ao usuário).
//
// Render (plano gratuito): desde set/2025 as conexões de saída nas portas
// SMTP 25, 465 e 587 são bloqueadas e só dão "Connection timeout". Use
// SMTP_PORT=2525 (a Brevo e a maioria dos provedores aceitam). Por
// segurança, se a porta configurada for uma das bloqueadas e a conexão não
// abrir, o envio tenta de novo, uma vez, na porta 2525.
// ============================================
const nodemailer = require("nodemailer");

const PORTA_ALTERNATIVA = 2525;
const PORTAS_BLOQUEADAS_NO_RENDER = new Set([25, 465, 587]);
// Sem limite, uma porta bloqueada deixa o pedido parado por ~2 minutos.
const TIMEOUT_CONEXAO_MS = 10000;

const transporters = new Map(); // porta → transporte

function config() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP não configurado (defina SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS no .env).");
  }
  return { host: SMTP_HOST, port: Number(SMTP_PORT) || 587, user: SMTP_USER, pass: SMTP_PASS };
}

function getTransporter(port) {
  if (transporters.has(port)) return transporters.get(port);
  const { host, user, pass } = config();
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: TIMEOUT_CONEXAO_MS,
    greetingTimeout:   TIMEOUT_CONEXAO_MS,
    socketTimeout:     20000,
  });
  transporters.set(port, transporter);
  return transporter;
}

// Conexão que nem chegou a abrir (porta bloqueada / rede): vale tentar outra porta.
// Erros de autenticação ou do servidor de e-mail, não.
function falhaDeConexao(err) {
  return ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED", "ECONNRESET"].includes(err?.code)
    || /timeout/i.test(err?.message ?? "");
}

async function enviar(mensagem) {
  const { port } = config();
  try {
    return await getTransporter(port).sendMail(mensagem);
  } catch (err) {
    if (!PORTAS_BLOQUEADAS_NO_RENDER.has(port) || !falhaDeConexao(err)) throw err;
    console.warn(
      `[email] Porta SMTP ${port} sem conexão (${err.message}) — tentando a porta ${PORTA_ALTERNATIVA}. ` +
      `No Render gratuito as portas 25/465/587 são bloqueadas: defina SMTP_PORT=${PORTA_ALTERNATIVA}.`
    );
    return getTransporter(PORTA_ALTERNATIVA).sendMail(mensagem);
  }
}

async function sendPasswordResetEmail(to, resetUrl) {
  const from = process.env.SMTP_FROM || "Ápice <no-reply@apice.app>";

  await enviar({
    from,
    to,
    subject: "Redefinição de senha — Ápice",
    text: `Recebemos um pedido para redefinir sua senha.\n\n` +
          `Acesse o link abaixo para escolher uma nova senha (válido por 1 hora):\n${resetUrl}\n\n` +
          `Se você não pediu isso, pode ignorar este e-mail com segurança.`,
    html: `
      <p>Recebemos um pedido para redefinir sua senha na Ápice.</p>
      <p><a href="${resetUrl}">Clique aqui para escolher uma nova senha</a> (link válido por 1 hora).</p>
      <p>Se você não pediu isso, pode ignorar este e-mail com segurança.</p>
    `,
  });
}

module.exports = { sendPasswordResetEmail, PORTA_ALTERNATIVA };
