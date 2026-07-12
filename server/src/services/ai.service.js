const OpenAI = require('openai');
const config = require('../config');
const logger = require('../config/logger');
const { AppError } = require('../middleware/error');
const Quote = require('../models/Quote');
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

/**
 * Обобщённый анализ цитат за неделю (для еженедельного отчёта, MASTER 7.7).
 *
 * @param {object} user - документ User (нужен aiConsent)
 * @param {Array} quotes - цитаты за неделю
 * @returns {Promise<object>} { weekTheme, insight, recommendation: { title, author, why } }
 */
const generateWeeklySummary = async (user, quotes) => {
  if (!user || user.aiConsent !== true) {
    throw new AppError(
      'AI_CONSENT_REQUIRED',
      'Требуется согласие на ИИ-анализ',
      403
    );
  }

  const lines = ['Цитаты, сохранённые читателем за неделю:'];
  for (const q of quotes) {
    lines.push(
      `- «${q.text}» — ${q.author || 'без автора'}${q.bookTitle ? ` (${q.bookTitle})` : ''}`
    );
  }

  const result = await callOpenAI(WEEKLY_REPORT_PROMPT, lines.join('\n'));

  return {
    weekTheme: result.weekTheme || '',
    insight: result.insight || '',
    recommendation: {
      title: result.recommendation?.title || '',
      author: result.recommendation?.author || '',
      why: result.recommendation?.why || '',
    },
  };
};

module.exports = {
  analyzeQuote,
  analyzeQuoteInBackground,
  generateWeeklySummary,
};
