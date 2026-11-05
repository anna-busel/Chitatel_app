const config = require('../config');
const logger = require('../config/logger');

/**
 * Отправка писем (UPDATES-PLAN P1, 05.11.2026). Пока одно письмо — код
 * восстановления пароля для входа по почте.
 *
 * SMTP из config.smtp (SMTP_HOST/PORT/USER/PASS, MAIL_FROM). Не настроен —
 * письмо не уходит, в лог warn, наружу false: ручка forgot-password всё равно
 * отвечает {sent:true}, чтобы не выдавать, есть ли такая почта.
 */

// nodemailer грузим лениво и в try/catch (как apn в push.service.js): если
// деплой прошёл без `npm install`, сервер не падает — не уходят только письма.
let nodemailer = null;
try {
  // eslint-disable-next-line global-require
  nodemailer = require('nodemailer');
} catch (err) {
  logger.warn('Пакет nodemailer не установлен — письма не отправляются (нужен npm install)');
}

let transport = null;

/** Транспорт SMTP или null, если nodemailer нет или SMTP не настроен. */
function getTransport() {
  if (transport) {return transport;}
  if (!nodemailer) {return null;}
  const { host, port, user, pass } = config.smtp;
  if (!user || !pass) {
    logger.warn('SMTP не настроен (SMTP_USER/SMTP_PASS) — письмо не отправлено');
    return null;
  }
  transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transport;
}

/**
 * Отправить письмо. true — SMTP принял, false — не настроен или ошибка
 * (ошибка пишется в лог, наружу не бросается).
 */
async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (!t) {return false;}
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, text });
    return true;
  } catch (err) {
    logger.error('Письмо не отправлено', { message: err.message, code: err.code });
    return false;
  }
}

/** Письмо с кодом восстановления пароля. */
function sendPasswordResetCode(email, code, ttlMinutes) {
  const text = [
    'Здравствуйте!',
    '',
    'Код для восстановления пароля в приложении «ЧИТАТЕЛЬ»:',
    '',
    code,
    '',
    `Код действует ${ttlMinutes} минут. Введите его в приложении и задайте новый пароль.`,
    '',
    'Если вы не запрашивали восстановление пароля, просто не отвечайте на это письмо — пароль останется прежним.',
    '',
    'Команда «ЧИТАТЕЛЬ»',
    'support.chitatel@gmail.com',
  ].join('\n');

  return sendMail({
    to: email,
    subject: `Код для восстановления пароля: ${code}`,
    text,
  });
}

/** Только для тестов: сбросить закэшированный транспорт. */
function _resetForTests() {
  transport = null;
}

module.exports = { sendMail, sendPasswordResetCode, _resetForTests };
