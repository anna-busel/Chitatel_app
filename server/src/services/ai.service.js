const OpenAI = require('openai');
const config = require('../config');
const logger = require('../config/logger');
const { AppError } = require('../middleware/error');
const Quote = require('../models/Quote');
const Book = require('../models/Book');
const pushService = require('./push.service');
const {
  AI_MODEL,
  AI_TEMPERATURE,
  AI_MAX_TOKENS,
  QUOTE_ANALYSIS_PROMPT,
  WEEKLY_REPORT_PROMPT,
} = require('../config/ai-prompts');

/**
 * ИИ-анализ цитат (MASTER 7.7).
 *
 * 🔴 Apple 5.1.2(i): НИКАКИЕ данные пользователя не уходят в OpenAI без
 * явного согласия (user.aiConsent === true). Гард — в analyzeQuote и
 * generateWeeklySummary, обойти его нельзя.
 *
 * Таймаут 30 сек, 3 попытки с экспоненциальной паузой (1с, 3с, 9с).
 * При окончательной неудаче цитата помечается aiStatus='failed'
 * (клиент показывает «Анализ временно недоступен», MASTER 7.5 AI_ANALYSIS_FAILED).
 */

const REQUEST_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 3000, 9000];

// Сколько разборов каталога показываем модели при генерации рекомендации.
const CATALOG_LIMIT = 80;

let client = null;

/** Ленивая инициализация клиента — чтобы сервер стартовал даже без ключа. */
const getClient = () => {
  if (!config.openai.apiKey) {
    throw new AppError('AI_ANALYSIS_FAILED', 'OpenAI API-ключ не настроен', 502);
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }
  return client;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Убирает markdown-обёртку ```json ... ``` если модель её добавила,
 * и парсит JSON. Бросает ошибку если распарсить нельзя.
 */
const parseJsonResponse = (raw) => {
  const cleaned = String(raw || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  return JSON.parse(cleaned);
};

/**
 * Один вызов OpenAI с ретраями.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<object>} распарсенный JSON-ответ модели
 */
const callOpenAI = async (systemPrompt, userMessage) => {
  const openai = getClient();
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        temperature: AI_TEMPERATURE,
        max_tokens: AI_MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

      const raw = completion.choices?.[0]?.message?.content;
      return parseJsonResponse(raw);
    } catch (err) {
      lastError = err;
      logger.warn('OpenAI attempt failed', {
        attempt: attempt + 1,
        message: err.message,
      });
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(BACKOFF_MS[attempt]);
      }
    }
  }

  throw new AppError(
    'AI_ANALYSIS_FAILED',
    'Анализ временно недоступен',
    502,
    { reason: lastError ? lastError.message : 'unknown' }
  );
};

/**
 * Собирает user-message для анализа цитаты:
 * текст цитаты + автор + книга + последние 5 цитат пользователя (MASTER 7.7).
 */
const buildQuoteUserMessage = (quote, recentQuotes) => {
  const lines = [
    `Цитата: «${quote.text}»`,
    `Автор: ${quote.author || 'не указан'}`,
    `Книга: ${quote.bookTitle || 'не указана'}`,
  ];

  if (recentQuotes.length > 0) {
    lines.push('');
    lines.push('Последние цитаты этого читателя (для контекста):');
    for (const q of recentQuotes) {
      lines.push(`- «${q.text}» (${q.author || 'без автора'})`);
    }
  }

  return lines.join('\n');
};

/**
 * Анализ одной цитаты. Сохраняет результат в саму цитату.
 * Вызывается асинхронно после POST /api/quotes (без блокировки ответа клиенту).
 *
 * @param {object} quote - документ Quote (lean или mongoose doc)
 * @param {object} user - документ User (нужен aiConsent)
 * @returns {Promise<object>} обновлённая цитата
 */
const analyzeQuote = async (quote, user) => {
  // 🔴 ОБЯЗАТЕЛЬНЫЙ ГАРД — без согласия ничего не отправляем в OpenAI.
  if (!user || user.aiConsent !== true) {
    throw new AppError(
      'AI_CONSENT_REQUIRED',
      'Требуется согласие на ИИ-анализ',
      403
    );
  }

  // Последние 5 цитат юзера (кроме текущей) — контекст для модели.
  const recentQuotes = await Quote.find({
    userId: quote.userId,
    _id: { $ne: quote._id },
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('text author')
    .lean();

  try {
    const result = await callOpenAI(
      QUOTE_ANALYSIS_PROMPT,
      buildQuoteUserMessage(quote, recentQuotes)
    );

    const updated = await Quote.findByIdAndUpdate(
      quote._id,
      {
        $set: {
          aiStatus: 'ready',
          aiAnalysis: {
            resonance: result.resonance || '',
            context: result.context || '',
            question: result.question || '',
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    ).lean();

    logger.info('AI quote analysis ready', { quoteId: String(quote._id) });

    // Push °Анализ готов° (задача 6.1, MASTER 7.9). Fire-and-forget,
    // гейтится настройкой aiReady внутри push.service.
    pushService
      .sendToUser(
        quote.userId,
        {
          title: 'Анализ цитаты готов',
          body: 'ИИ разобрал вашу цитату — загляните в дневник',
          data: { type: 'ai_ready', quoteId: String(quote._id) },
        },
        'aiReady'
      )
      .catch(() => {});

    return updated;
  } catch (err) {
    await Quote.findByIdAndUpdate(quote._id, { $set: { aiStatus: 'failed' } });
    logger.error('AI quote analysis failed', {
      quoteId: String(quote._id),
      message: err.message,
    });
    throw err;
  }
};

/**
 * Обёртка «выстрелил и забыл» для роута POST /api/quotes.
 * Ошибки не пробрасывает — статус цитаты уже помечен failed внутри analyzeQuote.
 */
const analyzeQuoteInBackground = (quote, user) => {
  setImmediate(() => {
    analyzeQuote(quote, user).catch(() => {
      // Ошибка уже залогирована и записана в aiStatus='failed'.
    });
  });
};

/** Нормализация названия для сопоставления ответа модели с каталогом. */
const normalizeTitle = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[«»"'.,!?:;()]/g, '')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Обобщённый анализ цитат за неделю (для еженедельного отчёта, MASTER 7.7).
 *
 * Рекомендация берётся ТОЛЬКО из опубликованных разборов каталога:
 * список подставляется в user-message, ответ модели сопоставляется с базой
 * по названию → bookId. Если книга не опознана — bookId=null, и клиент
 * не показывает блок рекомендации (кнопка вела бы в никуда).
 *
 * @param {object} user - документ User (нужен aiConsent)
 * @param {Array} quotes - цитаты за неделю
 * @returns {Promise<object>} { weekTheme, insight, recommendation: { title, author, why, bookId } }
 */
const generateWeeklySummary = async (user, quotes) => {
  if (!user || user.aiConsent !== true) {
    throw new AppError(
      'AI_CONSENT_REQUIRED',
      'Требуется согласие на ИИ-анализ',
      403
    );
  }

  // Каталог для рекомендации: только опубликованные разборы (у остальных нет аудио).
  const catalog = await Book.find({ isPublished: true })
    .select('title author tags')
    .limit(CATALOG_LIMIT)
    .lean();

  const lines = ['Цитаты, сохранённые читателем за неделю:'];
  for (const q of quotes) {
    lines.push(
      `- «${q.text}» — ${q.author || 'без автора'}${q.bookTitle ? ` (${q.bookTitle})` : ''}`
    );
  }

  if (catalog.length > 0) {
    lines.push('');
    lines.push('КАТАЛОГ РАЗБОРОВ (выбирай рекомендацию только отсюда, название — дословно):');
    for (const b of catalog) {
      const tags = Array.isArray(b.tags) && b.tags.length > 0
        ? ` — темы: ${b.tags.slice(0, 5).join(', ')}`
        : '';
      lines.push(`- «${b.title}» — ${b.author || 'без автора'}${tags}`);
    }
  } else {
    lines.push('');
    lines.push('КАТАЛОГ РАЗБОРОВ: пуст. Верни "recommendation": null.');
  }

  const result = await callOpenAI(WEEKLY_REPORT_PROMPT, lines.join('\n'));

  const summary = {
    weekTheme: result.weekTheme || '',
    insight: result.insight || '',
    recommendation: {
      title: '',
      author: '',
      why: '',
      bookId: null,
    },
  };

  const rec = result.recommendation;
  if (rec && rec.title) {
    const wanted = normalizeTitle(rec.title);
    const matched = catalog.find((b) => normalizeTitle(b.title) === wanted);

    if (matched) {
      // Название и автор берём из базы, а не из ответа модели — чтобы в отчёте
      // не было «почти правильных» названий.
      summary.recommendation = {
        title: matched.title,
        author: matched.author || '',
        why: rec.why || '',
        bookId: matched._id,
      };
    } else {
      logger.warn('AI recommended a book outside catalog', { title: rec.title });
    }
  }

  return summary;
};

module.exports = {
  analyzeQuote,
  analyzeQuoteInBackground,
  generateWeeklySummary,
};
