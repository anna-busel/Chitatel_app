const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { validate } = require('../../middleware/validate');
const { AppError } = require('../../middleware/error');
const { success } = require('../../utils/response');
const logger = require('../../config/logger');
const User = require('../../models/User');
const CrmClient = require('../models/CrmClient');
const CrmBalanceOp = require('../models/CrmBalanceOp');
const CrmEvent = require('../models/CrmEvent');
const CrmAudit = require('../models/CrmAudit');
const { requireCrm } = require('../middleware/auth');
const { setAudit } = require('../middleware/audit');
const { can } = require('../services/permissions');
const { attachClient, applyClientOrders, unlinkClient } = require('../services/access.service');
const { listClients, exportClients } = require('../services/client-list.service');
const { clientCard, clientHistory, commentView } = require('../services/client-card.service');
const { idsParam, round2, paging } = require('../services/view.helpers');
const { sendCsv } = require('../services/csv');
const { findDuplicates, duplicatesOf, merge, undoMerge } = require('../services/client-merge.service');

/**
 * Клиентки CRM.
 *
 * D1 «Клиенты» (16.11.2026):
 *   GET  /api/crm/clients?q&seg&sort&page&limit → { items, total, page, limit, seg, counts, currentMonth }
 *   GET  /api/crm/clients/export.csv?q&seg&sort&ids → CSV (UTF-8 с BOM, «;»)
 *   POST /api/crm/clients/tags { ids, add?, remove? } → { changed } (массовый тег «Акция»)
 * D2 карточка (шторка):
 *   GET   /api/crm/clients/:id → карточка (контакты, доступ в приложении, заказы, баланс, комментарии)
 *   PATCH /api/crm/clients/:id { name, phone, city, country, telegram, whatsapp, tags }
 *   POST  /api/crm/clients/:id/comments { text } → комментарий
 *   POST  /api/crm/clients/:id/balance { op: topup|spend, amount, reason } → { balance, op }
 *   GET   /api/crm/clients/:id/history?page → события CrmEvent
 * B6 (05.11.2026): /:id/link, /:id/unlink — ручная привязка к аккаунту приложения.
 * D3 дубли (19.11.2026, crm/services/client-merge.service.js):
 *   GET  /api/crm/clients/duplicates?page&limit → { items: [{ key, reasons, clients }], total, page, limit }
 *   GET  /api/crm/clients/:id/duplicates → { items, mergedInto }
 *   POST /api/crm/clients/:id/merge { intoId } → { mergeId, fromId, intoId, moved, balance, … }
 *        (карточка :id вливается в intoId и скрывается)
 *   POST /api/crm/clients/merge/:mergeId/undo → { fromId, intoId, revoked } — 30 минут
 *
 * Права (матрица прототипа, crm/services/permissions.js): просмотр, выгрузка,
 * теги и комментарии — всем ролям; контакты, баланс, привязка — 'orders'
 * (владелица, администраторы, менеджер). Журнал — auditMiddleware + setAudit;
 * выгрузка персональных данных тоже пишется в журнал.
 *
 * Код активации не используем (L5) — привязка только по почте аккаунта.
 */
const router = express.Router();

const linkSchema = z.object({
  email: z.string().trim().toLowerCase().email('Некорректный адрес почты'),
});

async function loadClient(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('NOT_FOUND', 'Неверный id клиентки', 400);
  }
  const client = await CrmClient.findById(id);
  if (!client) {
    throw new AppError('NOT_FOUND', 'Клиентка не найдена', 404);
  }
  return client;
}

const isId = (v) => mongoose.Types.ObjectId.isValid(v) && /^[a-f0-9]{24}$/i.test(String(v));
const who = (req) => req.crmMember.name || 'Менеджер';

async function logEvent(clientId, whoName, text, type) {
  try {
    await CrmEvent.create({ clientId, who: whoName, text, type });
  } catch (err) {
    logger.warn('CRM event не записан', { message: err.message });
  }
}

function writeExportAudit(req, action, count) {
  Promise.resolve()
    .then(() =>
      CrmAudit.create({
        memberId: req.crmMember.id,
        at: new Date(),
        action,
        entity: null,
        entityId: null,
        diff: { before: null, after: { query: req.query, count } },
      })
    )
    .catch((err) => logger.error('CRM audit write failed', { message: err.message, action }));
}

const today = () => new Date().toISOString().slice(0, 10);

/* --------------------------- D1: список --------------------------- */

router.get('/', requireCrm(), async (req, res, next) => {
  try {
    // 27.11.2026: суммы покупок видят только роли с правом «stats» (не менеджер).
    const money = can(req.crmMember.role, 'stats');
    const query = { ...req.query };
    if (!money && /ltv/.test(String(query.sort || ''))) {delete query.sort;}
    const data = await listClients(query);
    if (!money) {data.items = data.items.map(({ ltv, ...rest }) => ({ ...rest, ltv: null }));}
    return success(res, data);
  } catch (err) {
    return next(err);
  }
});

const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const CLIENT_CSV = [
  ['Клиентка', (r) => r.name],
  ['Почта (ГК / сайт)', (r) => r.email],
  ['Почта в приложении', (r) => r.appEmail || (r.linked ? '' : 'не связана')],
  ['Телефон', (r) => r.phone],
  ['Telegram', (r) => r.telegram],
  ['Город', (r) => r.city],
  ['Страна', (r) => r.country],
  ['Клуб по', (r) => r.until],
  ['Сумма покупок, BYN', (r) => String(r.ltv).replace('.', ',')],
  ['Посл. оплата', (r) => fmtDate(r.lastPaidAt)],
  ['Баланс, BYN', (r) => String(r.balance).replace('.', ',')],
  ['Теги', (r) => (r.tags || []).join(', ')],
];

router.get('/export.csv', requireCrm('stats'), async (req, res, next) => {
  try {
    const query = { ...req.query, ids: idsParam(req.query.ids, isId) };
    const rows = await exportClients(query);
    writeExportAudit(req, 'clients.export', rows.length);
    return sendCsv(res, `clients-${today()}.csv`, CLIENT_CSV, rows);
  } catch (err) {
    return next(err);
  }
});

const tagName = z.string().trim().min(1, 'Пустой тег').max(40, 'Тег длиннее 40 символов');

const bulkTagsSchema = z
  .object({
    ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i, 'Неверный id')).min(1).max(1000),
    add: tagName.optional(),
    remove: tagName.optional(),
  })
  .refine((b) => Boolean(b.add) !== Boolean(b.remove), { message: 'Нужно add или remove' });

/** Массовый тег (тег «Акция» в «Клиентах»), «Отменить» — тот же роут с remove. */
router.post('/tags', requireCrm(), validate(bulkTagsSchema), async (req, res, next) => {
  try {
    const { ids, add, remove } = req.body;
    const tag = add || remove;
    const cond = add ? { tags: { $ne: tag } } : { tags: tag };
    const targets = await CrmClient.find({ _id: { $in: ids }, mergedInto: null, ...cond })
      .select('_id')
      .lean();
    const changedIds = targets.map((t) => t._id);
    if (changedIds.length) {
      await CrmClient.updateMany(
        { _id: { $in: changedIds } },
        add ? { $addToSet: { tags: tag } } : { $pull: { tags: tag } }
      );
      const text = add ? `Добавлен тег «${tag}»` : `Снят тег «${tag}»`;
      try {
        await CrmEvent.insertMany(changedIds.map((clientId) => ({ clientId, who: who(req), text, type: 'tag' })));
      } catch (err) {
        logger.warn('CRM events не записаны', { message: err.message });
      }
    }
    setAudit(res, {
      action: add ? 'clients.tag.add' : 'clients.tag.remove',
      entity: 'CrmClient',
      before: null,
      after: { tag, ids: changedIds.map(String) },
    });
    return success(res, { tag, changed: changedIds.length, ids: changedIds.map(String) });
  } catch (err) {
    return next(err);
  }
});

/* --------------------------- D3: дубли ---------------------------- */

router.get('/duplicates', requireCrm(), async (req, res, next) => {
  try {
    const { page } = paging(req.query);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    return success(res, await findDuplicates({ page, limit }));
  } catch (err) {
    return next(err);
  }
});

const mergeSchema = z.object({
  intoId: z.string().regex(/^[a-f0-9]{24}$/i, 'Неверный id карточки'),
});

router.post('/merge/:mergeId/undo', requireCrm('orders'), async (req, res, next) => {
  try {
    const r = await undoMerge(req.params.mergeId, req.crmMember);
    setAudit(res, {
      action: 'client.merge.undo',
      entity: 'CrmClient',
      entityId: r.intoId,
      before: { mergeId: req.params.mergeId },
      after: r,
    });
    return success(res, r);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/duplicates', requireCrm(), async (req, res, next) => {
  try {
    return success(res, await duplicatesOf(req.params.id));
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/merge', requireCrm('orders'), validate(mergeSchema), async (req, res, next) => {
  try {
    const r = await merge(req.params.id, req.body.intoId, req.crmMember);
    setAudit(res, {
      action: 'client.merge',
      entity: 'CrmClient',
      entityId: r.intoId,
      before: { fromId: r.fromId },
      after: r,
    });
    return success(res, r);
  } catch (err) {
    return next(err);
  }
});

/* --------------------------- D2: карточка -------------------------- */

router.get('/:id', requireCrm(), async (req, res, next) => {
  try {
    const client = await loadClient(req.params.id);
    return success(res, await clientCard(client));
  } catch (err) {
    return next(err);
  }
});

const optText = (max) =>
  z
    .union([z.string().trim().max(max, `Не длиннее ${max} символов`), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

const patchSchema = z
  .object({
    name: z.string().trim().min(1, 'Введите имя').max(200).optional(),
    phone: optText(40),
    city: optText(120),
    country: optText(120),
    telegram: optText(64),
    whatsapp: z.boolean().optional(),
    tags: z.array(tagName).max(50).optional(),
  })
  .strict();

const FIELD_LABEL = {
  name: 'Имя',
  phone: 'Телефон',
  city: 'Город',
  country: 'Страна',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
};

router.patch('/:id', requireCrm(), validate(patchSchema), async (req, res, next) => {
  try {
    const body = req.body;
    const contactKeys = Object.keys(FIELD_LABEL).filter((k) => body[k] !== undefined);
    // Теги — всем ролям (как в прототипе), контакты — право 'orders'.
    if (contactKeys.length && !can(req.crmMember.role, 'orders')) {
      throw new AppError('FORBIDDEN', 'Недостаточно прав', 403);
    }
    const client = await loadClient(req.params.id);
    const before = {};
    const after = {};
    const events = [];

    contactKeys.forEach((k) => {
      let value = body[k];
      if (k === 'telegram') {
        value = value ? value.replace(/^@/, '').trim() || null : null;
        const prev = client.telegram ? client.telegram.username || null : null;
        if (prev === value) {return;}
        before.telegram = prev;
        after.telegram = value;
        client.set('telegram.username', value);
        return;
      }
      const prev = client[k] === undefined ? null : client[k];
      if (prev === value) {return;}
      before[k] = prev;
      after[k] = value;
      client[k] = value;
      if (k === 'phone') {
        client.phoneNorm = value ? value.replace(/\D/g, '') || null : null;
      }
    });
    const changedContacts = Object.keys(after);
    if (changedContacts.length) {
      events.push(`Изменены данные: ${changedContacts.map((k) => FIELD_LABEL[k]).join(', ')}`);
    }

    if (body.tags !== undefined) {
      const nextTags = [...new Set(body.tags)];
      const prev = client.tags || [];
      const added = nextTags.filter((t) => !prev.includes(t));
      const removed = prev.filter((t) => !nextTags.includes(t));
      if (added.length || removed.length) {
        before.tags = [...prev];
        after.tags = nextTags;
        client.tags = nextTags;
        added.forEach((t) => events.push(`Добавлен тег «${t}»`));
        removed.forEach((t) => events.push(`Снят тег «${t}»`));
      }
    }

    if (Object.keys(after).length) {
      await client.save();
      for (const text of events) {
        await logEvent(client._id, who(req), text, text.startsWith('Изменены') ? 'edit' : 'tag');
      }
    }
    setAudit(res, { action: 'client.update', entity: 'CrmClient', entityId: client._id, before, after });
    return success(res, await clientCard(client));
  } catch (err) {
    return next(err);
  }
});

const commentSchema = z.object({
  text: z.string().trim().min(1, 'Пустой комментарий').max(2000, 'Не длиннее 2000 символов'),
});

router.post('/:id/comments', requireCrm(), validate(commentSchema), async (req, res, next) => {
  try {
    const client = await loadClient(req.params.id);
    const comment = {
      _id: new mongoose.Types.ObjectId(),
      memberId: req.crmMember.id,
      at: new Date(),
      text: req.body.text,
    };
    await CrmClient.updateOne({ _id: client._id }, { $push: { comments: comment } });
    setAudit(res, {
      action: 'client.comment',
      entity: 'CrmClient',
      entityId: client._id,
      before: null,
      after: { text: comment.text },
    });
    const names = new Map([[String(req.crmMember.id), req.crmMember.name]]);
    return success(res, commentView(comment, names), 201);
  } catch (err) {
    return next(err);
  }
});

const balanceSchema = z.object({
  op: z.enum(['topup', 'spend']),
  amount: z.coerce
    .number({ invalid_type_error: 'Укажите сумму' })
    .positive('Укажите сумму больше нуля')
    .max(100000, 'Слишком большая сумма'),
  reason: z
    .string({ required_error: 'Укажите, за что пополнение или списание' })
    .trim()
    .min(2, 'Укажите, за что пополнение или списание — это попадёт в историю')
    .max(300),
});

/**
 * Ручное пополнение/списание баланса (BYN) с обязательной причиной.
 * Списание атомарно: findOneAndUpdate({_id, balance ≥ x}, {$inc: -x}) (§2 плана);
 * не записалась операция — сумма возвращается обратно.
 */
router.post('/:id/balance', requireCrm('orders'), validate(balanceSchema), async (req, res, next) => {
  try {
    const client = await loadClient(req.params.id);
    const amount = round2(req.body.amount);
    if (!(amount > 0)) {
      throw new AppError('VALIDATION_ERROR', 'Укажите сумму больше нуля', 400);
    }
    const delta = req.body.op === 'spend' ? -amount : amount;
    const cond = { _id: client._id };
    if (delta < 0) {cond.balance = { $gte: amount };}
    const updated = await CrmClient.findOneAndUpdate(cond, { $inc: { balance: delta } }, { new: true })
      .select('balance')
      .lean();
    if (!updated) {
      throw new AppError(
        'VALIDATION_ERROR',
        `На балансе только ${round2(client.balance)} BYN`,
        400
      );
    }
    let op;
    try {
      op = await CrmBalanceOp.create({
        clientId: client._id,
        amount: delta,
        reason: req.body.reason,
        by: req.crmMember.id,
        at: new Date(),
      });
    } catch (err) {
      await CrmClient.updateOne({ _id: client._id }, { $inc: { balance: -delta } });
      throw err;
    }
    const text =
      delta > 0
        ? `Пополнен баланс: ${amount} BYN · ${req.body.reason}`
        : `Списано с баланса: ${amount} BYN · ${req.body.reason}`;
    await logEvent(client._id, who(req), text, 'balance');

    const balance = round2(updated.balance);
    setAudit(res, {
      action: delta > 0 ? 'client.balance.topup' : 'client.balance.spend',
      entity: 'CrmClient',
      entityId: client._id,
      before: { balance: round2(balance - delta) },
      after: { balance, amount: delta, reason: req.body.reason },
    });
    return success(res, {
      balance,
      op: {
        id: String(op._id),
        at: op.at,
        amount: delta,
        reason: req.body.reason,
        who: req.crmMember.name,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/history', requireCrm(), async (req, res, next) => {
  try {
    const client = await loadClient(req.params.id);
    const { page } = paging(req.query);
    return success(res, await clientHistory(client._id, { page, limit: 50 }));
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/crm/clients/:id/link { email }
 * → { clientId, appUserId, email, applied } — applied: сколько заказов выдано.
 */
router.post('/:id/link', requireCrm('orders'), validate(linkSchema), async (req, res, next) => {
  try {
    const client = await loadClient(req.params.id);
    const { email } = req.body;

    const user = await User.findOne({ email, isDeleted: { $ne: true } }).select('_id email');
    if (!user) {
      throw new AppError(
        'NOT_FOUND',
        'В приложении нет аккаунта с такой почтой — попросите войти и проверить почту в профиле',
        404
      );
    }
    if (client.appUserId && String(client.appUserId) !== String(user._id)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Клиентка уже связана с другим аккаунтом — сначала отвяжите',
        409
      );
    }
    const other = await CrmClient.findOne({ appUserId: user._id, _id: { $ne: client._id } })
      .select('_id name')
      .lean();
    if (other) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Этот аккаунт уже связан с клиенткой «${other.name || other._id}»`,
        409
      );
    }

    const before = { appUserId: client.appUserId ? String(client.appUserId) : null };
    const who = req.crmMember.name || 'Менеджер';
    if (!client.appUserId) {
      await attachClient(client, user, { who, how: 'вручную' });
    }
    const applied = await applyClientOrders(client._id, { who });

    setAudit(res, {
      action: 'client.link',
      entity: 'CrmClient',
      entityId: client._id,
      before,
      after: { appUserId: String(user._id), email, applied },
    });
    return success(res, {
      clientId: String(client._id),
      appUserId: String(user._id),
      email,
      applied,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/crm/clients/:id/unlink
 * Снимает выданное заказами этой клиентки с аккаунта и рвёт связь.
 * → { clientId, appUserId: null, revoked }
 */
router.post('/:id/unlink', requireCrm('orders'), async (req, res, next) => {
  try {
    const client = await loadClient(req.params.id);
    if (!client.appUserId) {
      throw new AppError('VALIDATION_ERROR', 'Клиентка не связана с аккаунтом приложения', 400);
    }
    const before = { appUserId: String(client.appUserId) };
    const { revoked } = await unlinkClient(client, { who: req.crmMember.name || 'Менеджер' });

    setAudit(res, {
      action: 'client.unlink',
      entity: 'CrmClient',
      entityId: client._id,
      before,
      after: { appUserId: null, revoked },
    });
    return success(res, { clientId: String(client._id), appUserId: null, revoked });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
