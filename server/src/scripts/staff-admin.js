/**
 * Служебные админы (23.11.2026): вход в админку для команды без показа в
 * клубе (User.staffOnly — нет в участницах, упоминаниях и пушах чата).
 *
 * Использование:
 *   cd server
 *   node src/scripts/staff-admin.js add <email> "<Имя>" <password>
 *   node src/scripts/staff-admin.js remove <email>
 *
 * add — создаёт аккаунт (вход по почте и паролю) или обновляет имя и пароль
 *   уже служебного. Аккаунт участницы служебным не делает: она пропала бы
 *   из клуба — для команды нужна отдельная почта.
 * remove — снимает права админа, ставит случайный пароль и сбрасывает
 *   сессии: старым паролем больше не войти. Работает и для обычного админа
 *   (так закрыт общий anna@chitatel.app).
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD = 12;

async function addStaff(User, { email, name, password }) {
  const mail = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(mail)) {throw new Error('Некорректная почта');}
  if (!name) {throw new Error('Нужно имя');}
  if (!password || password.length < MIN_PASSWORD) {
    throw new Error(`Пароль — не короче ${MIN_PASSWORD} символов`);
  }

  const existing = await User.findOne({ email: mail });
  if (existing && !existing.staffOnly) {
    throw new Error(
      `${mail} — аккаунт участницы приложения. Служебным его делать нельзя: ` +
        'она пропадёт из клуба. Возьмите для админки другую почту.'
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  if (existing) {
    await User.updateOne(
      { _id: existing._id },
      {
        $set: { name, passwordHash, role: 'admin', staffOnly: true, isDeleted: false, refreshTokens: [] },
      }
    );
    return 'updated';
  }
  await User.create({
    email: mail,
    name,
    passwordHash,
    authProvider: 'email',
    role: 'admin',
    staffOnly: true,
  });
  return 'created';
}

async function removeAdmin(User, { email }) {
  const mail = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: mail });
  if (!user) {throw new Error(`${mail} не найден`);}
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('base64'), BCRYPT_ROUNDS);
  await User.updateOne(
    { _id: user._id },
    { $set: { role: 'user', staffOnly: false, passwordHash, refreshTokens: [] } }
  );
  return 'removed';
}

const usage = () => {
  console.error(
    'Использование:\n' +
      '  node src/scripts/staff-admin.js add <email> "<Имя>" <password>\n' +
      '  node src/scripts/staff-admin.js remove <email>'
  );
  process.exit(1);
};

const main = async () => {
  const mongoose = require('mongoose');
  const config = require('../config');
  const User = require('../models/User');
  const [cmd, email, name, password] = process.argv.slice(2);
  if (cmd !== 'add' && cmd !== 'remove') {usage();}
  if (cmd === 'add' && (!email || !name || !password)) {usage();}
  if (cmd === 'remove' && !email) {usage();}

  await mongoose.connect(config.mongoUri);
  try {
    if (cmd === 'add') {
      const r = await addStaff(User, { email, name, password });
      console.log(r === 'created' ? `Создан служебный админ: ${email.toLowerCase()} (${name})` : `Обновлён служебный админ: ${email.toLowerCase()}`);
    } else {
      await removeAdmin(User, { email });
      console.log(`Права админа сняты, пароль сброшен: ${email.toLowerCase()}`);
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main();
}

module.exports = { addStaff, removeAdmin, MIN_PASSWORD };
