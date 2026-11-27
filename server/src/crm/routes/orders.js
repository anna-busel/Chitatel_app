const express = require('express');
const mongoose = require('mongoose');
const { success } = require('../../utils/response');
const logger = require('../../config/logger');
const CrmAudit = require('../models/CrmAudit');
const { z } = require('zod');
const { validate } = require('../../middleware/validate');
const { requireCrm } = require('../middleware/auth');
const { setAudit } = require('../middleware/audit');
const { listOrders, exportOrders } = require('../services/order-list.service');
const { can } = require('../services/permissions');
const actions = require('../services/order-actions.service');
const { idsParam } = require('../services/view.helpers');
const { sendCsv } = require('../services/csv');

/**
 * Заказы CRM (CRM-PLAN D4, 16.11.2026):
 *   GET /api/crm/orders?status&source&manager&from&to&q&sort&page&limit
 *     → { items, total, page, limit, tab, tabs: {all, unpaid, confirm, paid,
 *         free, fake, refund}, receivedByn, managers: [{id, name}] }
 *   GET /api/crm/orders/export.csv?…те же фильтры…&ids → CSV (UTF-8 с BOM, «;»)
 *
 * Просмотр и выгрузка — всем ролям (как в прототипе). «Напомнить об оплате»,
 * ссылка на оплату и письма — с E3 и F.
 *
 * D5 карточка заказа и D6 новый заказ (19.11.2026, логика —
 * crm/services/order-actions.service.js, доступ — только access.applyOrder):
 *   GET    /api/crm/orders/meta → { products, managers, accounts, requireTransferConfirm }
 *   POST   /api/crm/orders { clientId | client, productId, price, cur, promoCode,
 *          managerId, gift, mode: link|paid_manual|balance|free, days, method,
 *          account, note, reason } → карточка (права 'orders')
 *   GET    /api/crm/orders/:id → карточка
 *   POST   /api/crm/orders/:id/payments { amount, cur, method, account, note } ('orders')
 *   POST   /api/crm/orders/:id/payments/:pid/confirm ('confirm' — только владелица)
 *   DELETE /api/crm/orders/:id/payments/:pid { reason } ('orders')
 *   PATCH  /api/crm/orders/:id { productId, price, note, managerId, deadline } ('orders')
 *   POST   /api/crm/orders/:id/promo { code } ('orders')
 *   POST   /api/crm/orders/:id/fake { confirm: true }, /:id/restore ('orders')
 *   POST   /api/crm/orders/:id/refund { amount, mode: money|balance, reason } ('refund')
 *   POST   /api/crm/orders/:id/comments { text } (все роли)
 * Заказы App Store / Google Play и перенос из админки — только комментарии.
 * Каждый ответ действия — свежая карточка заказа.
 */
const router = express.Router();

const isId = (v) => mongoose.Types.ObjectId.isValid(v) && /^[a-f0-9]{24}$/i.test(String(v));

const STATUS_LABEL = {
  new: 'Не оплачен',
  partial: 'Частично',
  confirm: 'Ждёт подтверждения',
  paid: 'Оплачен',
  free: 'Выдан · 0',
  fake: 'Ложный',
  refund: 'Возврат',
};
const num = (n) => String(n === null || n === undefined ? '' : n).replace('.', ',');
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

const ORDER_CSV = [
  ['Заказ', (r) => r.num],
  ['Дата', (r) => day(r.createdAt)],
  ['Клиентка', (r) => r.clientName],
  ['Почта', (r) => r.clientEmail],
  ['Позиция', (r) => (r.productUnmatched ? `${r.product} (продукт не сопоставлен)` : r.product)],
  ['Сумма', (r) => num(r.price)],
  ['Валюта', (r) => r.cur],
  ['Оплачено', (r) => num(r.paid)],
  ['Статус', (r) => (r.overdue ? 'Просрочен' : STATUS_LABEL[r.status] || r.status)],
  ['Источник / способ', (r) => r.sourceLabel],
  ['Менеджер', (r) => r.managerName],
  ['Доступ в приложении', (r) => r.app.text],
  ['Примечание', (r) => r.note],
];

router.get('/', requireCrm(), async (req, res, next) => {
  try {
    const data = await listOrders(req.query);
    // 27.11.2026: выручку видят только роли с правом «stats» (не менеджер).
    if (!can(req.crmMember.role, 'stats')) {data.receivedByn = null;}
    return success(res, data);
  } catch (err) {
    return next(err);
  }
});

router.get('/export.csv', requireCrm('stats'), async (req, res, next) => {
  try {
    const rows = await exportOrders({ ...req.query, ids: idsParam(req.query.ids, isId) });
    Promise.resolve()
      .then(() =>
        CrmAudit.create({
          memberId: req.crmMember.id,
          at: new Date(),
          action: 'orders.export',
          entity: null,
          entityId: null,
          diff: { before: null, after: { query: req.query, count: rows.length } },
        })
      )
      .catch((err) => logger.error('CRM audit write failed', { message: err.message }));
    return sendCsv(res, `orders-${new Date().toISOString().slice(0, 10)}.csv`, ORDER_CSV, rows);
  } catch (err) {
    return next(err);
  }
});

/* ------------------- D5 / D6: карточка и новый заказ ------------------- */

const money = z.coerce
  .number({ invalid_type_error: 'Укажите сумму' })
  .min(0, 'Сумма не может быть меньше нуля')
  .max(1000000, 'Слишком большая сумма');
const optText = (max) => z.union([z.string().trim().max(max, `Не длиннее ${max} символов`), z.null()]).optional();
const CUR = z.enum(['BYN', 'USD', 'RUB', 'GEL', 'EUR']);
const idStr = z.string().regex(/^[a-f0-9]{24}$/i, 'Неверный id');

const createSchema = z.object({
  clientId: idStr.optional(),
  client: z
    .object({
      name: z.string().trim().max(200).optional().default(''),
      email: z.string().trim().toLowerCase().email('Некорректная почта клиентки'),
      phone: optText(40),
    })
    .optional(),
  productId: idStr,
  price: money.nullable().optional(),
  cur: CUR.optional(),
  promoCode: optText(40),
  managerId: z.union([idStr, z.literal(''), z.null()]).optional(),
  gift: z
    .object({
      name: z.string().trim().max(200).optional().default(''),
      email: z.string().trim().toLowerCase().email('Некорректная почта получательницы'),
    })
    .nullable()
    .optional(),
  mode: z.enum(['link', 'paid_manual', 'balance', 'free'], { errorMap: () => ({ message: 'Выберите, как оплачивает' }) }),
  days: z.coerce.number().int().min(1).max(30).optional(),
  method: z.enum(['transfer', 'bepaid', 'lava']).optional(),
  account: optText(120),
  note: optText(300),
  reason: optText(300),
});

const paymentSchema = z.object({
  amount: money,
  cur: CUR.optional(),
  method: z.enum(['transfer', 'bepaid', 'lava', 'balance'], { errorMap: () => ({ message: 'Выберите способ оплаты' }) }),
  account: optText(120),
  note: optText(300),
});

const reasonSchema = z.object({
  reason: z.string({ required_error: 'Укажите причину' }).trim().min(2, 'Укажите причину').max(300),
});

const patchSchema = z
  .object({
    productId: idStr.optional(),
    price: money.optional(),
    note: optText(500),
    managerId: z.union([idStr, z.literal(''), z.null()]).optional(),
    deadline: z.union([z.string().trim().max(40), z.null()]).optional(),
  })
  .strict();

const promoSchema = z.object({ code: z.string().trim().min(1, 'Введите промокод').max(40) });
const fakeSchema = z.object({ confirm: z.boolean().optional() });
const refundSchema = z.object({
  amount: money,
  mode: z.enum(['money', 'balance'], { errorMap: () => ({ message: 'Выберите: вернуть деньги или перезачесть на баланс' }) }),
  reason: z.string({ required_error: 'Укажите причину возврата' }).trim().min(2, 'Укажите причину возврата').max(300),
});
const commentSchema = z.object({
  text: z.string().trim().min(1, 'Пустой комментарий').max(2000, 'Не длиннее 2000 символов'),
});

const member = (req) => req.crmMember;
const snap = (order) => ({
  status: order.status,
  paid: actions.paidOf(order),
  total: actions.totalOf(order),
});

/** Обёртка действия над заказом: загрузить, выполнить, журнал, карточка. */
const orderAction = (action, run) => async (req, res, next) => {
  try {
    const order = await actions.loadOrder(req.params.id);
    const before = snap(order);
    const r = (await run(order, req)) || {};
    setAudit(res, {
      action,
      entity: 'CrmOrder',
      entityId: order._id,
      before: r.before || before,
      after: r.after || { ...snap(order), body: req.body, access: r.access ? r.access.action : null },
    });
    return success(res, await actions.orderCard(order));
  } catch (err) {
    return next(err);
  }
};

router.get('/meta', requireCrm(), async (req, res, next) => {
  try {
    return success(res, await actions.orderMeta());
  } catch (err) {
    return next(err);
  }
});

router.post('/', requireCrm('orders'), validate(createSchema), async (req, res, next) => {
  try {
    const { order, access } = await actions.createOrder(req.body, member(req));
    setAudit(res, {
      action: 'order.create',
      entity: 'CrmOrder',
      entityId: order._id,
      before: null,
      after: { num: order.num, ...snap(order), body: req.body, access: access ? access.action : null },
    });
    return success(res, await actions.orderCard(order), 201);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', requireCrm(), async (req, res, next) => {
  try {
    return success(res, await actions.orderCard(await actions.loadOrder(req.params.id)));
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/payments', requireCrm('orders'), validate(paymentSchema),
  orderAction('order.payment.add', (order, req) => actions.addPayment(order, req.body, member(req))));

router.post('/:id/payments/:pid/confirm', requireCrm('confirm'),
  orderAction('order.payment.confirm', (order, req) => actions.confirmPayment(order, req.params.pid, member(req))));

router.delete('/:id/payments/:pid', requireCrm('orders'), validate(reasonSchema),
  orderAction('order.payment.delete', (order, req) =>
    actions.deletePayment(order, req.params.pid, req.body.reason, member(req))));

router.patch('/:id', requireCrm('orders'), validate(patchSchema),
  orderAction('order.update', (order, req) => actions.editOrder(order, req.body, member(req))));

router.post('/:id/promo', requireCrm('orders'), validate(promoSchema),
  orderAction('order.promo', (order, req) => actions.applyPromoToOrder(order, req.body.code, member(req))));

router.post('/:id/fake', requireCrm('orders'), validate(fakeSchema),
  orderAction('order.fake', (order, req) => actions.markFake(order, req.body.confirm, member(req))));

router.post('/:id/restore', requireCrm('orders'),
  orderAction('order.restore', (order, req) => actions.restoreOrder(order, member(req))));

router.post('/:id/refund', requireCrm('refund'), validate(refundSchema),
  orderAction('order.refund', (order, req) => actions.refundOrder(order, req.body, member(req))));

router.post('/:id/comments', requireCrm(), validate(commentSchema), async (req, res, next) => {
  try {
    const order = await actions.loadOrder(req.params.id);
    const comment = await actions.addOrderComment(order, req.body.text, member(req));
    setAudit(res, {
      action: 'order.comment',
      entity: 'CrmOrder',
      entityId: order._id,
      before: null,
      after: { text: req.body.text },
    });
    return success(res, comment, 201);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
