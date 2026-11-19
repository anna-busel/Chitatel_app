const express = require('express');
const { z } = require('zod');
const { validate } = require('../../middleware/validate');
const { success } = require('../../utils/response');
const { requireCrm } = require('../middleware/auth');
const { setAudit } = require('../middleware/audit');
const { getNotifications, markRead } = require('../services/notifications.service');

/**
 * Колокольчик (CRM-PLAN D8, 19.11.2026):
 *   GET  /api/crm/notifications → { items: [{ id, kind, text, sub, at, link, read }], unread, seenAt }
 *   POST /api/crm/notifications/read { ids: [..] } | { all: true } → { unread }
 *
 * Всем ролям; что видно — решает notifications.service (сообщения — только
 * с правом «Входящие»). Отметка прочитанного пишется в журнал как
 * notifications.read, «Сегодня» её не показывает.
 */
const router = express.Router();

const readSchema = z
  .object({
    ids: z.array(z.string().max(80)).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((b) => b.all === true || (b.ids && b.ids.length), { message: 'Нужно ids или all' });

router.get('/', requireCrm(), async (req, res, next) => {
  try {
    return success(res, await getNotifications(req.crmMember));
  } catch (err) {
    return next(err);
  }
});

router.post('/read', requireCrm(), validate(readSchema), async (req, res, next) => {
  try {
    const out = await markRead(req.crmMember, req.body);
    setAudit(res, { action: 'notifications.read', after: { all: Boolean(req.body.all), count: (req.body.ids || []).length } });
    return success(res, out);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
