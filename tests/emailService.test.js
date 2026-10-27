// tests/emailService.test.js
// Recuperação de senha em produção: o Render gratuito bloqueia as portas SMTP
// 25/465/587 ("Connection timeout"). O envio usa timeout curto e, se a porta
// configurada for uma dessas e a conexão não abrir, tenta a porta 2525.
jest.mock("nodemailer", () => ({ createTransport: jest.fn() }));
const nodemailer = require("nodemailer");

const ENV = { SMTP_HOST: "smtp-relay.brevo.com", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "Ápice <x@y.com>" };

function carregar(porta, comportamentoPorPorta) {
  jest.resetModules();
  Object.assign(process.env, ENV, { SMTP_PORT: String(porta) });
  const portasUsadas = [];
  require("nodemailer").createTransport.mockImplementation(opts => {
    portasUsadas.push(opts.port);
    return { sendMail: jest.fn(() => comportamentoPorPorta(opts.port)) };
  });
  return { email: require("../services/emailService"), portasUsadas, opcoes: () => require("nodemailer").createTransport.mock.calls.map(c => c[0]) };
}

const timeout = () => Promise.reject(Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" }));

beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test("porta 587 sem conexão (bloqueio do Render) → envia pela 2525", async () => {
  const { email, portasUsadas } = carregar(587, port => (port === 587 ? timeout() : Promise.resolve({ ok: true })));
  await expect(email.sendPasswordResetEmail("a@b.com", "https://site/redefinir-senha?token=x")).resolves.toBeUndefined();
  expect(portasUsadas).toEqual([587, 2525]);
  expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/SMTP_PORT=2525/));
});

test("porta 2525 configurada → envia direto, sem segunda tentativa", async () => {
  const { email, portasUsadas } = carregar(2525, () => Promise.resolve({ ok: true }));
  await email.sendPasswordResetEmail("a@b.com", "https://site/x");
  expect(portasUsadas).toEqual([2525]);
});

test("erro de autenticação não é bloqueio de porta: não tenta outra porta", async () => {
  const { email, portasUsadas } = carregar(587, () => Promise.reject(Object.assign(new Error("Invalid login"), { code: "EAUTH" })));
  await expect(email.sendPasswordResetEmail("a@b.com", "https://site/x")).rejects.toThrow("Invalid login");
  expect(portasUsadas).toEqual([587]);
});

test("as duas portas sem conexão → o erro chega ao chamador (que registra no log)", async () => {
  const { email, portasUsadas } = carregar(587, timeout);
  await expect(email.sendPasswordResetEmail("a@b.com", "https://site/x")).rejects.toThrow(/timeout/i);
  expect(portasUsadas).toEqual([587, 2525]);
});

test("transporte com timeout curto de conexão (sem esperar ~2 minutos)", async () => {
  const { email, opcoes } = carregar(2525, () => Promise.resolve({}));
  await email.sendPasswordResetEmail("a@b.com", "https://site/x");
  expect(opcoes()[0]).toMatchObject({ host: "smtp-relay.brevo.com", port: 2525, secure: false, connectionTimeout: 10000 });
});

test("o link de redefinição vai no e-mail", async () => {
  let enviado;
  const { email } = carregar(2525, () => Promise.resolve({}));
  require("nodemailer").createTransport.mockImplementation(() => ({ sendMail: jest.fn(async m => { enviado = m; }) }));
  await email.sendPasswordResetEmail("a@b.com", "https://site/redefinir-senha?token=abc");
  expect(enviado).toMatchObject({ to: "a@b.com", subject: expect.stringMatching(/Redefinição de senha/) });
  expect(enviado.html).toContain("https://site/redefinir-senha?token=abc");
});
