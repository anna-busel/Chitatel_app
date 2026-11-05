const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { validate } = require('../../middleware/validate');
const { AppError } = require('../../middleware/error');
const { success } = require('../../utils/response');
const User = require('../../models/User');
const CrmClient = require('../models/CrmClient');
const { requireCrm } = require('../middleware/auth');
const { setAudit } = require('../middleware/audit');
const { attachClient, applyClientOrders, unlinkClient } = require('../services/access.service');

/**
 * Клиентки CRM: ручная привязка к аккаунту приложения (CRM-PLAN B6, 05.11.2026).
 *
 * Кейс «оплатила с одной почтой, в приложении другая» (тред t2 прототипа):
 * менеджер вводит почту, под которой она входит в приложение. Код активации
 * не используем (L5) — только почта аккаунта.
 *
 * Право — 'orders' (владелица, администраторы, менеджер): привязка открывает
 * доступ по оплаченным заказам. Журнал — auditMiddleware + setAudit.
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
