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
  QUOTE_ANALYSIS_MAX_TOKENS,
  WEEKLY_REPORT_MAX_TOKENS,
  MONTHLY_REPORT_MAX_TOKENS,
  QUOTE_CATEGORIES,
  QUOTE_ANALYSIS_SYSTEM,
  QUOTE_ANALYSIS_PROMPT,
  WEEKLY_REPORT_SYSTEM,
  WEEKLY_REPORT_PROMPT,
  MONTHLY_REPORT_SYSTEM,
  MONTHLY_REPORT_WEEKLY_PROMPT,
  MONTHLY_REPORT_TOPQUOTES_PROMPT,
} = require('../config/ai-prompts');

/**
 * ИИ-анализ цитат + недельный/месячный отчёты (промпты Анны, config/ai-prompts.js).
 *
 * 🔴 Apple 5.1.2(i): НИКАКИЕ данные пользователя не уходят в OpenAI без явного
 * согласия (user.aiConsent === true). Гард — в analyzeQuote / generateWeeklyReport /
 * generateMonthlyReport, обойти его нельзя.
 *
 * Таймаут 30 сек, 3 попытки с экспоненциальной паузой (1с, 3с, 9с). При
 * окончательной неудаче анализа цитаты — aiStatus='failed' (клиент показывает
 * «Анализ временно недоступен»). Для отчётов ошибка пробрасывается в job, который
 * пропускает юзера (не сохраняет «сломанный» отчёт) — повтор при фоновом catch-up.
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
 * Подстановка {токенов} в промпт-шаблон. Плейсхолдеры вида {key} заменяются
 * на vars[key] (все вхождения). Отсутствующий ключ заменяется пустой строкой.
 */
const fillTemplate = (template, vars) => {
  let out = String(template);
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value == null ? '' : String(value));
  }
  return out;
};

/**
 * Убирает markdown-обёртку ```json ... ``` если модель её добавила, и парсит JSON.
 * Бросает ошибку если распарсить нельзя.
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
 * @param {number} maxTokens
 * @returns {Promise<object>} распарсенный JSON-ответ модели
 */
const callOpenAI = async (systemPrompt, userMessage, maxTokens) => {
  const openai = getClient();
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        temperature: AI_TEMPERATURE,
        max_tokens: maxTokens,
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

/** Нормализация темы/категории для сопоставления (регистр, ё, пробелы, пунктуация). */
const normalizeTerm = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'.,!?:;()\-—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Нормализация ответа модели по одной цитате к полям aiAnalysis. */
const normalizeQuoteAnalysis = (result) => {
  const allowedSentiment = ['positive', 'neutral', 'negative'];
  let themes = [];
  if (Array.isArray(result.themes)) {
    themes = result.themes
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .slice(0, 3);
  }
  const category = String(result.category || '').trim() || 'ДРУГОЕ';
  const sentiment = allowedSentiment.includes(result.sentiment)
    ? result.sentiment
    : 'neutral';
  return {
    category,
    themes,
    sentiment,
    insights: String(result.insights || '').trim(),
  };
};

// Плейсхолдер имени, который сервер подставляет при входе, если провайдер имя
// не отдал (apple-auth/google-auth). В анализ его пускать нельзя — иначе ИИ
// обращается «Пользователь». Настоящее имя приходит с онбординг-экрана «Имя».
const NAME_PLACEHOLDER = 'Пользователь';

/**
 * Настоящее имя для обращения в анализе. Заглушку и пустое → '' (тогда промпт
 * обращается на «вы»). Задача 6.3.
 */
const displayName = (user) => {
  const n = (user && typeof user.name === 'string') ? user.name.trim() : '';
  return n && n !== NAME_PLACEHOLDER ? n : '';
};

// Жизненная ситуация из онбординга (экран «Расскажите о себе») → человекочитаемо
// для контекста ИИ. Ключи — коды, которые шлёт клиент (survey_screen).
const SURVEY_LIFE_SITUATION = {
  mom: 'в основном занята детьми, дети — главная забота',
  married: 'замужем, балансирует дом, работу и себя',
  single: 'вне отношений, изучает мир и себя',
};

/**
 * Контекст о читателе из онбординг-опроса (задача 6.3) для плейсхолдера
 * {userContext} промпта разбора цитаты — чтобы анализ был личным. Ответы лежат
 * в user.surveyAnswers (Mixed, свободная схема). Берём только заполненные поля;
 * ничего нет → ''. В контекст идут ситуация, книга детства, волнующий вопрос и
 * желание на год — они задают тон; технические ответы (что мешает читать, что
 * ценно в клубе) в разбор цитаты не тянем.
 */
const buildUserContext = (user) => {
  const a = user && user.surveyAnswers;
  if (!a || typeof a !== 'object') return '';
  const parts = [];
  const situation = SURVEY_LIFE_SITUATION[a.lifeSituation];
  if (situation) parts.push(`жизненная ситуация: ${situation}`);
  if (typeof a.childhoodBook === 'string' && a.childhoodBook.trim()) {
    parts.push(`любимая книга детства — «${a.childhoodBook.trim()}»`);
  }
  if (typeof a.lifeQuestion === 'string' && a.lifeQuestion.trim()) {
    parts.push(`сейчас её волнует: «${a.lifeQuestion.trim()}»`);
  }
  if (typeof a.yearWish === 'string' && a.yearWish.trim()) {
    parts.push(`через год хочет: «${a.yearWish.trim()}»`);
  }
  if (parts.length === 0) return '';
  return `Контекст о читателе (из анкеты, учитывай мягко, не перечисляй дословно): ${parts.join('; ')}.`;
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

  // {userName} — настоящее имя (заглушка отфильтрована); {userContext} —
  // персонализация из онбординг-опроса (задача 6.3).
  const userMessage = fillTemplate(QUOTE_ANALYSIS_PROMPT, {
    text: quote.text,
    author: quote.author || 'не указан',
    userName: displayName(user),
    userContext: buildUserContext(user),
    categories: QUOTE_CATEGORIES.join(', '),
  });

  try {
    const raw = await callOpenAI(
      QUOTE_ANALYSIS_SYSTEM,
      userMessage,
      QUOTE_ANALYSIS_MAX_TOKENS
    );
    const analysis = normalizeQuoteAnalysis(raw);

    const updated = await Quote.findByIdAndUpdate(
      quote._id,
      {
        $set: {
          aiStatus: 'ready',
          aiAnalysis: {
            category: analysis.category,
            themes: analysis.themes,
            sentiment: analysis.sentiment,
            insights: analysis.insights,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    ).lean();

    logger.info('AI quote analysis ready', { quoteId: String(quote._id) });

    // Push «Анализ готов» (задача 6.1). Fire-and-forget, гейтится настройкой aiReady.
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

/** Формат одной цитаты в тексте для отчёта (как в reader-bot). */
const formatQuoteLine = (q) =>
  `"${q.text}" ${q.author ? `(${q.author})` : ''}`.trim();

/**
 * Недельный отчёт по цитатам (промпт WEEKLY_REPORT_PROMPT Анны).
 * Рекомендации здесь НЕ генерируются моделью — они подбираются отдельно
 * (resolveRecommendations) по темам из ответа. Отчёт = только личный разбор.
 *
 * @param {object} user - документ User (нужен aiConsent, name)
 * @param {Array} quotes - цитаты за неделю
 * @param {string} previousReportText - текст insights прошлого отчёта (для «динамики»)
 * @returns {Promise<{dominantThemes:string[], emotionalTone:string, insights:string, personalGrowth:string}>}
 */
const generateWeeklyReport = async (user, quotes, previousReportText = '') => {
  if (!user || user.aiConsent !== true) {
    throw new AppError('AI_CONSENT_REQUIRED', 'Требуется согласие на ИИ-анализ', 403);
  }

  const quotesText = quotes.map(formatQuoteLine).join('\n\n');
  const previousReportBlock = previousReportText
    ? `ПРОШЛЫЙ ОТЧЁТ:\n${previousReportText}`
    : '';

  const userMessage = fillTemplate(WEEKLY_REPORT_PROMPT, {
    quotesText,
    userName: user.name || '',
    previousReportBlock,
  });

  const result = await callOpenAI(
    WEEKLY_REPORT_SYSTEM,
    userMessage,
    WEEKLY_REPORT_MAX_TOKENS
  );

  const dominantThemes = Array.isArray(result.dominantThemes)
    ? result.dominantThemes.map((t) => String(t || '').trim()).filter(Boolean)
    : [];

  return {
    dominantThemes,
    emotionalTone: String(result.emotionalTone || '').trim(),
    insights: String(result.insights || '').trim(),
    personalGrowth: String(result.personalGrowth || '').trim(),
  };
};

/** Русское название месяца (1-12). */
const MONTH_NAMES = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
];
const getMonthName = (month) => MONTH_NAMES[(Number(month) - 1 + 12) % 12] || '';

/**
 * Месячный отчёт (промпты MONTHLY_REPORT_* Анны). Двухуровневая логика:
 *   - >= 2 недельных отчётов → агрегируем их инсайты (weekly-промпт);
 *   - иначе → фоллбек по топ-цитатам месяца (topquotes-промпт).
 *
 * @param {object} user - документ User (нужен aiConsent, name)
 * @param {object} data
 * @param {Array}  data.weeklyReports - недельные отчёты месяца (insights, dominantThemes, emotionalTone)
 * @param {Array}  data.topQuotes - топ-цитаты месяца (для фоллбека)
 * @param {object} data.metrics - { month, totalQuotes, uniqueAuthors, weeksActive, topThemes[], emotionalTrend }
 * @returns {Promise<{insights:string}>}
 */
const generateMonthlyReport = async (user, { weeklyReports = [], topQuotes = [], metrics = {} }) => {
  if (!user || user.aiConsent !== true) {
    throw new AppError('AI_CONSENT_REQUIRED', 'Требуется согласие на ИИ-анализ', 403);
  }

  const monthName = getMonthName(metrics.month);
  let systemPrompt;
  let userMessage;

  if (weeklyReports.length >= 2) {
    const weeklyInsights = weeklyReports
      .map((report, i) => {
        const themes = Array.isArray(report.dominantThemes) && report.dominantThemes.length
          ? report.dominantThemes.join(', ')
          : 'нет данных';
        const tone = report.emotionalTone || 'нейтральный';
        const gist = String(report.insights || '').substring(0, 250);
        return `\nНеделя ${i + 1}:\n- Темы: ${themes}\n- Тон: ${tone}\n- Суть: ${gist}\n    `;
      })
      .join('\n');

    systemPrompt = MONTHLY_REPORT_SYSTEM;
    userMessage = fillTemplate(MONTHLY_REPORT_WEEKLY_PROMPT, {
      monthName,
      userName: user.name || '',
      totalQuotes: metrics.totalQuotes ?? 0,
      uniqueAuthors: metrics.uniqueAuthors ?? 0,
      weeksActive: metrics.weeksActive ?? 0,
      topThemes: Array.isArray(metrics.topThemes) ? metrics.topThemes.join(', ') : '',
      emotionalTrend: metrics.emotionalTrend || '',
      weeklyInsights,
    });
  } else {
    const quotesText = topQuotes
      .map((q, i) => `${i + 1}. "${q.text}" ${q.author ? `(${q.author})` : ''}`)
      .join('\n');

    systemPrompt = MONTHLY_REPORT_SYSTEM;
    userMessage = fillTemplate(MONTHLY_REPORT_TOPQUOTES_PROMPT, { quotesText });
  }

  const result = await callOpenAI(
    systemPrompt,
    userMessage,
    MONTHLY_REPORT_MAX_TOKENS
  );

  return { insights: String(result.insights || '').trim() };
};

/**
 * Подбор рекомендаций из каталога по темам/категориям отчёта.
 * Берём только опубликованные разборы (у остальных нет аудио). Ранжируем по
 * количеству совпавших тем/категорий (Book.categories + Book.tags), затем по рейтингу.
 *
 * @param {object} opts
 * @param {string[]} opts.themes - темы цитат/отчёта (dominantThemes, aiAnalysis.themes)
 * @param {string[]} opts.categories - категории цитат (aiAnalysis.category)
 * @param {Array}    opts.excludeBookIds - книги, которые не рекомендуем (напр. уже открытые)
 * @param {number}   opts.limit - сколько карточек вернуть (по умолчанию 3)
 * @returns {Promise<Array<{bookId, title, author, coverImageUrl, why}>>}
 */
const resolveRecommendations = async ({
  themes = [],
  categories = [],
  excludeBookIds = [],
  limit = 3,
}) => {
  const wanted = [];
  const seen = new Set();
  for (const t of [...themes, ...categories]) {
    const norm = normalizeTerm(t);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      wanted.push({ norm, original: String(t).trim() });
    }
  }
  if (wanted.length === 0) {
    return [];
  }

  const books = await Book.find({
    isPublished: true,
    _id: { $nin: excludeBookIds },
  })
    .select('title author coverImageUrl categories tags rating')
    .lean();

  const scored = [];
  for (const b of books) {
    const terms = new Set();
    for (const c of b.categories || []) {
      const n = normalizeTerm(c);
      if (n) terms.add(n);
    }
    for (const t of b.tags || []) {
      const n = normalizeTerm(t);
      if (n) terms.add(n);
    }

    let score = 0;
    let matched = null;
    for (const w of wanted) {
      if (terms.has(w.norm)) {
        score += 1;
        if (!matched) matched = w.original;
      }
    }
    // Частичное совпадение (вхождение) — слабый сигнал, если точных нет.
    if (score === 0) {
      for (const w of wanted) {
        let hit = false;
        for (const term of terms) {
          if (term.includes(w.norm) || w.norm.includes(term)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          score += 0.5;
          if (!matched) matched = w.original;
        }
      }
    }

    if (score > 0) {
      scored.push({ book: b, score, matched });
    }
  }

  scored.sort(
    (x, y) => y.score - x.score || (y.book.rating || 0) - (x.book.rating || 0)
  );

  return scored.slice(0, limit).map(({ book, matched }) => ({
    bookId: book._id,
    title: book.title,
    author: book.author || '',
    coverImageUrl: book.coverImageUrl || '',
    why: matched
      ? `Одна из тем ваших цитат — «${matched}». Этот разбор может быть созвучен.`
      : 'Этот разбор может быть вам близок.',
  }));
};

module.exports = {
  analyzeQuote,
  analyzeQuoteInBackground,
  generateWeeklyReport,
  generateMonthlyReport,
  resolveRecommendations,
};
