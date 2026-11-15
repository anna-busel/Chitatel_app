const express = require('express');
const mongoose = require('mongoose');
const { success } = require('../../utils/response');
const logger = require('../../config/logger');
const CrmAudit = require('../models/CrmAudit');
const { requireCrm } = require('../middleware/auth');
const { listOrders, exportOrders } = require('../services/order-list.service');
const { idsParam } = require('../services/view.helpers');
const { sendCsv } = require('../services/csv');

/**
 * Заказы CRM (CRM-PLAN D4, 16.11.2026):
 *   GET /api/crm/orders?status&source&manager&from&to&q&sort&page&limit
 *     → { items, total, page, limit, tab, tabs: {all, unpaid, confirm, paid,
 *         free, fake, refund}, receivedByn, managers: [{id, name}] }
 *   GET /api/crm/orders/export.csv?…те же фильтры…&ids → CSV (UTF-8 с BOM, «;»)
 *
 * Просмотр и выгрузка — всем ролям (как в прототипе). Карточка заказа (D5),
 * новый заказ (D6) и «Напомнить об оплате» — следующими задачами.
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
    return success(res, await listOrders(req.query));
  } catch (err) {
    return next(err);
  }
});

router.get('/export.csv', requireCrm(), async (req, res, next) => {
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

module.exports = router;
