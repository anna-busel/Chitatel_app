/**
 * Сверка доступов CRM ↔ приложение (CRM-PLAN B7, 05.11.2026). ТОЛЬКО ОТЧЁТ —
 * ничего не пишет.
 *
 * Показывает:
 *   1. Оплаченные заказы (paid/free, рассрочка с доступом после первого
 *      платежа), по которым доступ НЕ выдан:
 *        - клиентка не связана с аккаунтом приложения (нужна привязка B6);
 *        - связана, но granted пуст (applyOrder не вызывался / упал).
 *   2. Выданные заказы, а в User этих прав нет (месяцы, разборы, пакеты сняли
 *      руками или чем-то ещё).
 *   3. Наоборот: заказ «Возврат»/«Ложный», а granted не снят — доступ остался.
 *
 * Использование (на сервере):
 *   cd server && node src/scripts/crm-verify-access.js
 */
const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');
const CrmClient = require('../crm/models/CrmClient');
const CrmOrder = require('../crm/models/CrmOrder');
const CrmProduct = require('../crm/models/CrmProduct');
const { shouldGrant, GRANTING, REVOKING } = require('../crm/services/access.service');

const APP_TYPES = ['month', 'months', 'year', 'book', 'pack'];

function line(order, client, text) {
  const who = client ? client.primaryEmail || client.name || String(client._id) : '—';
  return `  №${order.num} · ${who} · ${text}`;
}

async function run() {
  await mongoose.connect(config.mongoUri);

  const products = new Map(
    (await CrmProduct.find({}).select('name grant accessOnFirstPayment').lean()).map((p) => [
      String(p._id),
      p,
    ])
  );
  const orders = await CrmOrder.find({
    status: { $in: [...GRANTING, 'partial', ...REVOKING] },
  })
    .select('num clientId productId status payments gift granted')
    .lean();

  const clientIds = new Set();
  orders.forEach((o) => {
    clientIds.add(String(o.clientId));
    if (o.gift && o.gift.recipientClientId) {clientIds.add(String(o.gift.recipientClientId));}
  });
  const clients = new Map(
    (await CrmClient.find({ _id: { $in: [...clientIds] } })
      .select('name primaryEmail appUserId')
      .lean()).map((c) => [String(c._id), c])
  );

  const userIds = new Set();
  clients.forEach((c) => c.appUserId && userIds.add(String(c.appUserId)));
  orders.forEach((o) => {
    const s = o.granted && o.granted.subscriptionSet;
    if (s && s.userId) {userIds.add(String(s.userId));}
  });
  const users = new Map(
    (await User.find({ _id: { $in: [...userIds] } })
      .select('email clubMonthsEntitled purchasedBooks purchasedPackages isDeleted')
      .lean()).map((u) => [String(u._id), u])
  );

  const notLinked = [];
  const notGranted = [];
  const missing = [];
  const notRevoked = [];

  for (const o of orders) {
    const product = products.get(String(o.productId));
    const recipientId = (o.gift && o.gift.recipientClientId) || o.clientId;
    const client = clients.get(String(recipientId));
    const g = o.granted || {};
    const s = g.subscriptionSet || {};

    if (REVOKING.includes(o.status)) {
      if (g.at) {notRevoked.push(line(o, client, `статус «${o.status}», а доступ не снят`));}
      continue;
    }
    if (!product || !shouldGrant(o, product)) {continue;}
    const type = (product.grant && product.grant.type) || 'none';
    if (!APP_TYPES.includes(type)) {continue;}

    if (!g.at) {
      if (!client || !client.appUserId) {
        notLinked.push(line(o, client, `${product.name} — не связана с приложением`));
      } else {
        notGranted.push(line(o, client, `${product.name} — связана, но доступ не выдан`));
      }
      continue;
    }

    const user = s.userId ? users.get(String(s.userId)) : null;
    if (!user || user.isDeleted) {
      missing.push(line(o, client, 'аккаунт, на который выдано, удалён или не найден'));
      continue;
    }
    const lacks = [];
    const months = new Set(user.clubMonthsEntitled || []);
    (g.months || []).filter((k) => !months.has(k)).forEach((k) => lacks.push(`клуб ${k}`));
    if (!s.termExpiredAt) {
      const books = new Set((user.purchasedBooks || []).map(String));
      const pkgs = new Set((user.purchasedPackages || []).map(String));
      const nb = (g.bookIds || []).filter((id) => !books.has(String(id))).length;
      const np = (g.packageIds || []).filter((id) => !pkgs.has(String(id))).length;
      if (nb) {lacks.push(`разборов: ${nb}`);}
      if (np) {lacks.push(`пакетов: ${np}`);}
    }
    if (lacks.length) {
      missing.push(line(o, client, `${user.email || user._id}: нет ${lacks.join(', ')}`));
    }
  }

  const section = (title, rows) => {
    console.log(`\n${title}: ${rows.length}`);
    rows.slice(0, 500).forEach((r) => console.log(r));
    if (rows.length > 500) {console.log(`  … и ещё ${rows.length - 500}`);}
  };
  console.log('=== Сверка доступов CRM ↔ приложение (только отчёт) ===');
  console.log(`Заказов просмотрено: ${orders.length}`);
  section('1а. Оплачено, клиентка не связана с приложением (B6)', notLinked);
  section('1б. Оплачено, связана, доступ не выдан', notGranted);
  section('2. Выдано по заказу, а в аккаунте этого нет', missing);
  section('3. Возврат/ложный, а доступ не снят', notRevoked);

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Ошибка сверки:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
