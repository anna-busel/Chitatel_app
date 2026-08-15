const NotificationSetting = require('../models/NotificationSetting');

/**
 * Сервис редактируемых системных уведомлений (задача 6.6).
 *
 * DEFAULTS — метаданные каждого типа: дефолтный заголовок/текст (тот, что был
 * зашит в коде), наличие расписания (scheduled) и редактируемость тела
 * (bodyEditable). Отправители зовут getNotif(type) и получают текст/флаги с
 * фолбэком на дефолт — поэтому, пока в БД нет документа, поведение прежнее.
 *
 * Событийные чат-уведомления (ответ/упоминание/ответ на вопрос) сюда НЕ
 * включены намеренно: их текст динамический (имя, превью), они функциональные,
 * и Анна их править не просила. При необходимости добавим отдельно.
 */
const DEFAULTS = {
  daily_quote: {
    label: 'Мысль дня',
    title: 'Мысль дня',
    body: '',
    scheduled: true,
    bodyEditable: false,
    hour: 10,
    minute: 0,
    note: 'Тело — сама мысль дня (из вкладки «Мысль дня»), не редактируется. Здесь — заголовок, время отправки и вкл/выкл.',
  },
  ai_ready: {
    label: 'Разбор цитаты готов',
    title: 'Анализ цитаты готов',
    body: 'ИИ разобрал вашу цитату — загляните в дневник',
    scheduled: false,
    bodyEditable: true,
    note: 'Летит участнице, когда готов разбор её цитаты.',
  },
  weekly_report: {
    label: 'Отчёт за неделю',
    title: 'Ваш отчёт за неделю готов',
    body: 'Анна разобрала ваши цитаты — почитайте',
    scheduled: false,
    bodyEditable: true,
    note: 'Летит, когда сгенерился недельный отчёт участницы.',
  },
  monthly_report: {
    label: 'Отчёт за месяц',
    title: 'Ваш отчёт за месяц готов',
    body: 'Глубокий разбор месяца от Анны — почитайте',
    scheduled: false,
    bodyEditable: true,
    note: 'Летит, когда сгенерился месячный отчёт участницы.',
  },
};

const TYPES = Object.keys(DEFAULTS);

/**
 * Текст/флаги типа для ОТПРАВИТЕЛЯ: сохранённый документ поверх дефолта.
 * Пустой заголовок/тело трактуем как «не задано» → берём дефолт.
 */
async function getNotif(type) {
  const def = DEFAULTS[type] || {};
  const doc = await NotificationSetting.findOne({ type }).lean();
  return {
    type,
    title: (doc && doc.title) || def.title || '',
    body:
      doc && doc.body != null && doc.body !== '' ? doc.body : def.body || '',
    enabled: doc ? doc.enabled : true,
    hour: doc && doc.hour != null ? doc.hour : def.hour != null ? def.hour : 10,
    minute:
      doc && doc.minute != null ? doc.minute : def.minute != null ? def.minute : 0,
  };
}

/**
 * Полный список типов для АДМИНКИ: значения (сохранённые или дефолтные) +
 * метаданные (label/scheduled/bodyEditable/note), чтобы UI нарисовал под
 * каждый тип правильные поля.
 */
async function listNotifs() {
  const docs = await NotificationSetting.find({ type: { $in: TYPES } }).lean();
  const byType = {};
  docs.forEach((d) => {
    byType[d.type] = d;
  });
  return TYPES.map((type) => {
    const def = DEFAULTS[type];
    const doc = byType[type];
    return {
      type,
      label: def.label,
      scheduled: !!def.scheduled,
      bodyEditable: !!def.bodyEditable,
      note: def.note || '',
      title: (doc && doc.title) || def.title || '',
      body: doc && doc.body ? doc.body : def.body || '',
      enabled: doc ? doc.enabled : true,
      hour: doc && doc.hour != null ? doc.hour : def.hour != null ? def.hour : null,
      minute:
        doc && doc.minute != null
          ? doc.minute
          : def.minute != null
          ? def.minute
          : null,
    };
  });
}

/**
 * Обновить настройку типа (upsert). Меняются только переданные поля.
 */
async function updateNotif(type, data) {
  const update = {};
  if (data.title != null) update.title = data.title;
  if (data.body != null) update.body = data.body;
  if (data.enabled != null) update.enabled = data.enabled;
  if (data.hour != null) update.hour = data.hour;
  if (data.minute != null) update.minute = data.minute;
  return NotificationSetting.findOneAndUpdate(
    { type },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}

module.exports = { getNotif, listNotifs, updateNotif, DEFAULTS, TYPES };
