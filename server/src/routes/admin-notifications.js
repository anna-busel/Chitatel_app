const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/subscription');
const { success } = require('../utils/response');
const { getReminderSetting } = require('../services/reminder.service');
const { reloadReminder } = require('../jobs/push-scheduler');

const router = Router();

// Только админ.
router.use(requireAuth, requireAdmin);

function serialize(s) {
  return {
    title: s.title,
    body: s.body,
    hour: s.hour,
    minute: s.minute,
    weekdays: s.weekdays,
    enabled: s.enabled,
  };
}

/* ------------------------------------------------------------------ *
 *          НАСТРОЙКА НАПОМИНАНИЯ «ЗАПИШИТЕ ЦИТАТУ»                    *
 * ------------------------------------------------------------------ */
// GET /api/admin/notifications/reminder
router.get('/reminder', async (_req, res, next) => {
  try {
    const s = await getReminderSetting();
    return success(res, { reminder: serialize(s) });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/admin/notifications/reminder
const reminderSchema = z.object({
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1, 'Текст обязателен').max(300),
  hour: z.coerce.number().int().min(0).max(23),
  minute: z.coerce.number().int().min(0).max(59),
  // Дни недели в нотации cron: 0=Вс, 1=Пн, ... 6=Сб. Хотя бы один день.
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
  enabled: z.boolean(),
});

router.put('/reminder', validate(reminderSchema), async (req, res, next) => {
  try {
    const s = await getReminderSetting();
    s.title = req.body.title || 'ЧИТАТЕЛЬ';
    s.body = req.body.body;
    s.hour = req.body.hour;
    s.minute = req.body.minute;
    // Уникализируем и сортируем дни.
    s.weekdays = Array.from(new Set(req.body.weekdays)).sort((a, b) => a - b);
    s.enabled = req.body.enabled;
    await s.save();

    // Перепланировать cron на лету (тот же процесс).
    await reloadReminder();

    return success(res, { reminder: serialize(s) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
