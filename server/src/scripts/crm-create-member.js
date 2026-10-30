/**
 * Завести участницу команды CRM (CRM-PLAN A2/A6) — пока нет экрана «Команда».
 *
 * Использование:
 *   cd server
 *   node src/scripts/crm-create-member.js <email> "<Имя>" <role> <password>
 *   role: owner | admin | marketing | manager
 *
 * Если участница с такой почтой уже есть — обновляет имя, роль и пароль,
 * включает её (active: true) и сбрасывает сессии. 2FA не трогает: при первом
 * входе она сама подключит приложение-аутентификатор.
 * Сбросить 2FA (потеряла телефон): добавить флаг --reset-2fa.
 */
const mongoose = require('mongoose');
const config = require('../config');
const CrmMember = require('../crm/models/CrmMember');
const { hashPassword } = require('../crm/services/auth.service');

const MIN_PASSWORD = 10;

const usage = () => {
  console.error(
    'Использование: node src/scripts/crm-create-member.js <email> "<Имя>" ' +
      '<owner|admin|marketing|manager> <password> [--reset-2fa]'
  );
  process.exit(1);
};

const main = async () => {
  const args = process.argv.slice(2);
  const reset2fa = args.includes('--reset-2fa');
  const [email, name, role, password] = args.filter((a) => a !== '--reset-2fa');

  if (!email || !name || !role || !password) {
    usage();
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    console.error('Некорректная почта');
    process.exit(1);
  }
  if (!CrmMember.ROLES.includes(role)) {
    console.error(`Роль должна быть одной из: ${CrmMember.ROLES.join(', ')}`);
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD) {
    console.error(`Пароль — не короче ${MIN_PASSWORD} символов`);
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);

  const passwordHash = await hashPassword(password);
  const set = {
    name,
    role,
    passwordHash,
    active: true,
    refreshTokens: [],
  };
  if (reset2fa) {
    set.totpSecret = null;
  }

  const existing = await CrmMember.findOne({ email: email.toLowerCase() }).lean();
  const member = await CrmMember.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: set, $setOnInsert: { email: email.toLowerCase() } },
    { upsert: true, new: true, runValidators: true }
  );

  console.warn(
    `${existing ? 'Обновлена' : 'Создана'} участница CRM: ${member.email} ` +
      `(${member.name}, ${member.role})${reset2fa ? ', 2FA сброшена' : ''}`
  );

  await mongoose.disconnect();
};

main().catch(async (err) => {
  console.error('Ошибка:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
