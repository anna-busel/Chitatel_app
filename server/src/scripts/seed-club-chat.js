/**
 * Наполнение чата клуба первыми сообщениями (перед подачей в App Store).
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ СКРИПТ, А НЕ РУКАМИ С ТЕЛЕФОНА:
 * с телефона нельзя поставить сообщению вчерашнюю дату — сервер всегда пишет
 * `createdAt = now`. Два десятка сообщений, упавших подряд за десять минут,
 * выглядят как постановка, и это первое, что бросается в глаза. Скрипт пишет
 * напрямую в базу и расставляет даты с разбросом по дням и часам. Закреп
 * с приветствием (atStart) отдельно прибивается к началу месяца клуба.
 *
 * ⚠️ ЭТО НЕ seed-club.js. Тот пересоздаёт клубы и БЕЗВОЗВРАТНО вытирает чат —
 * на проде его запускать нельзя. Этот скрипт по умолчанию ничего не удаляет:
 * только переименовывает аккаунты и добавляет сообщения. Идемпотентный:
 * сообщение с таким же текстом от того же автора в том же клубе повторно не
 * создаётся. Удалить старое можно, но только явно — флагом --clean, и удаление
 * там мягкое (deletedAt), то есть обратимое.
 *
 * ЗАПУСК (из папки server):
 *   node src/scripts/seed-club-chat.js --dry-run     # показать план, ничего не писать
 *   node src/scripts/seed-club-chat.js               # выполнить
 *
 * ФЛАГИ:
 *   --dry-run          только показать, что будет сделано
 *   --anna=EMAIL       аккаунт ведущей (по умолчанию — единственный admin)
 *   --ksenia=EMAIL     четвёртая участница (опционально; без неё её реплики
 *                      пропускаются, ответы на них не завязаны)
 *   --no-rename        не переименовывать аккаунты
 *   --clean            скрыть сообщения, которые уже лежат в этих клубах
 *                      (старые записи от seed-club). Удаление МЯГКОЕ: ставится
 *                      deletedAt, история их не отдаёт, но вернуть можно
 *
 * ЧЕГО СКРИПТ НЕ ДЕЛАЕТ: голосовое сообщение. Его записывает только живой
 * человек в приложении (и только админ) — файл со стороны туда не положить.
 */

const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const ChatMessage = require('../models/ChatMessage');

/* ------------------------------------------------------------------ *
 *                              АРГУМЕНТЫ                             *
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const getOpt = (name) => {
  const prefix = `--${name}=`;
  const found = argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : null;
};

const DRY_RUN = hasFlag('dry-run');
const NO_RENAME = hasFlag('no-rename');
const CLEAN = hasFlag('clean');
const ANNA_EMAIL = getOpt('anna');
const KSENIA_EMAIL = getOpt('ksenia');

/* ------------------------------------------------------------------ *
 *                            УЧАСТНИЦЫ                               *
 * ------------------------------------------------------------------ */

// Три разные формы имени — с фамилией, уменьшительное, полное. Читается как
// три разных человека, а не как список заглушек.
const CAST = [
  { key: 'marina', email: 'test-premium@chitatel.app', name: 'Марина Л.' },
  { key: 'olya', email: 'test-basic@chitatel.app', name: 'Оля' },
  { key: 'darya', email: 'test-expired@chitatel.app', name: 'Дарья' },
];

/* ------------------------------------------------------------------ *
 *                             СООБЩЕНИЯ                              *
 * ------------------------------------------------------------------ */

// `at` — доля от окна времени клуба (0 = начало окна, 1 = «сейчас»).
// `atStart` — прибить к началу месяца клуба, а не к окну (для закрепа).
// `ref` — метка сообщения, на которое можно ответить.
// `replyTo` — метка сообщения-родителя.
// `reactions` — { эмодзи: [ключи участниц] }. Белый список: ❤️ 👍 🔥 👏 🥲 🙏.
// `pin` — закрепить (ровно одно на клуб).
//
// ⚠️ Разбор «Идиота» выложен ЦЕЛИКОМ, не частями по понедельникам. Не возвращать
// в реплики обещания «следующей части» и расписание выхода — это будет враньё.

const CURRENT_MESSAGES = [
  {
    ref: 'welcome',
    who: 'anna',
    atStart: true,
    at: 0.0,
    pin: true,
    text:
      'Дорогие мои, добро пожаловать в новый месяц.\n\n' +
      'Читаем «Идиота». Книгу, которую многие из нас проходили в школе и запомнили примерно как «там все кричат и никто не женится». Взрослыми она читается совершенно иначе.\n\n' +
      'Разбор уже целиком в приложении — слушайте в своём темпе, никуда не бежим. Чат живёт весь месяц, возвращайтесь когда будет время и силы.\n\n' +
      'Вопрос, с которым я предлагаю читать: что происходит с человеком, который не умеет защищаться? Мышкин добр не потому, что старается быть хорошим. Он просто так устроен. И роман очень честно показывает, чем это заканчивается для него и для всех вокруг.\n\n' +
      'Пишите сюда мысли, несогласия, выписанные цитаты. Спорить со мной можно и нужно — из спора обычно и рождается самое интересное. Если вопрос ко мне лично, а не в общий разговор, — есть раздел «Вопрос-ответ», я собираю их там.',
  },
  {
    who: 'marina',
    at: 0.04,
    text:
      'Ох, «Идиот». Читала в шестнадцать и вынесла оттуда только то, что все всё время кричат и куда-то едут. Интересно, что будет сейчас.',
    reactions: { '👍': ['olya'] },
  },
  {
    ref: 'olya-first',
    who: 'olya',
    at: 0.07,
    text: 'А я не читала вообще. Совсем с нуля начинаю, немного страшно если честно',
  },
  {
    who: 'anna',
    at: 0.09,
    replyTo: 'olya-first',
    text:
      'Оля, честно — это лучший вариант из возможных. Без школьного осадка и без чужих трактовок в голове. Завидую вам немножко.',
    reactions: { '❤️': ['olya'] },
  },

  {
    ref: 'kamin',
    who: 'ksenia',
    at: 0.2,
    text:
      'Дочитала первую часть романа. Сцена, где Настасья Филипповна бросает пачку денег в камин, — у меня руки тряслись. Причём не от неё, а от того, как все на это смотрят.',
    reactions: { '🔥': ['marina'] },
  },
  {
    who: 'marina',
    at: 0.23,
    text: 'И Ганя, который в итоге не полез. Вот это меня добило больше всего. Он же почти полез.',
  },
  {
    who: 'olya',
    at: 0.26,
    text: 'девочки я пока только на приезде в Петербург, не спойлерите 🙈',
  },

  {
    ref: 'spor',
    who: 'marina',
    at: 0.4,
    text:
      'Анна, вопрос. Вы правда считаете Мышкина положительным героем? У меня по ходу чтения растёт ощущение, что он всем вокруг сделал только хуже. Он приносит не добро, а хаос. Каждый, кто с ним соприкасается, разрушается.',
  },
  {
    who: 'anna',
    at: 0.44,
    replyTo: 'spor',
    text:
      'Марина, это самый правильный вопрос к этой книге, и у меня нет на него удобного ответа.\n\n' +
      'Мышкин не делает зла. Но вы точно уловили: рядом с ним всё разваливается. Мне кажется, дело в том, что он снимает с людей защиту. Человек привык быть циничным, потому что так проще, — а тут кто-то смотрит на него без осуждения, и держаться за цинизм больше не выходит. А что делать вместо — непонятно. И человека разносит.\n\n' +
      'Достоевский, по-моему, не отвечает, хорошо это или плохо. Он просто показывает цену. Я об этом подробно говорю в разборе, ближе к середине — послушайте и скажите, убедила или нет.',
    reactions: { '🙏': ['marina'], '❤️': ['olya'] },
  },

  {
    who: 'ksenia',
    at: 0.58,
    text: 'Отстала на две главы, простите. Рабочая неделя съела всё. Догоню к выходным.',
  },
  {
    who: 'olya',
    at: 0.62,
    text:
      'Выписала себе: «Красота спасёт мир». Всю жизнь была уверена, что это про внешность. Оказывается вообще не про то, и говорит это даже не Мышкин.',
    reactions: { '👏': ['anna'] },
  },

  {
    who: 'olya',
    at: 0.68,
    text:
      'Дослушала разбор до конца. Место, где вы говорите, что Мышкин не жертва, а зеркало, — поставила на паузу и минут пять сидела. Никогда так на него не смотрела.',
    reactions: { '❤️': ['marina'] },
  },

  // Вопрос, оставленный без ответа. В живых чатах так всегда — и это лучший
  // признак подлинности из всех. Не «чинить».
  {
    who: 'olya',
    at: 0.74,
    text: 'А кто-нибудь смотрел экранизацию с Мироновым? Стоит смотреть после разбора или лучше вообще не надо?',
  },

  {
    ref: 'sostradanie',
    who: 'marina',
    at: 0.86,
    text:
      'Слушала разбор в дороге. Момент про сострадание и жалость — что это вообще-то разные вещи — переслушала дважды.',
  },
  {
    who: 'anna',
    at: 0.9,
    replyTo: 'sostradanie',
    text:
      'Это, наверное, самое важное различение во всей книге. Жалость смотрит сверху вниз и втайне радуется, что беда не с тобой. Сострадание становится рядом. Мышкин умеет второе и совсем не умеет первое — поэтому его и не понимают.',
    reactions: { '🔥': ['marina'], '🙏': ['olya'] },
  },
  {
    who: 'anna',
    at: 0.96,
    text:
      'И ещё: мы почти не поговорили про Рогожина. А он в этой книге не менее важен, чем Мышкин, — и мне кажется, куда страшнее. Если дойдёте до его линии, расскажите, каким он вам показался.',
  },
];

const ARCHIVE_MESSAGES = [
  {
    who: 'darya',
    at: 0.1,
    text: 'Дочитала. Не думала, что книга восемьдесят лет спустя будет читаться как репортаж.',
  },
  {
    who: 'marina',
    at: 0.16,
    text: 'Меня всю дорогу держала бабка Джоуд. Как она держит семью, пока может, и что происходит потом.',
    reactions: { '🥲': ['darya'] },
  },
  {
    ref: 'tyazhelo',
    who: 'olya',
    at: 0.38,
    text: 'Тяжело далась, если честно. Дважды откладывала. Но не жалею.',
  },
  {
    who: 'anna',
    at: 0.44,
    replyTo: 'tyazhelo',
    text:
      'Оля, она и должна даваться тяжело. Стейнбек не развлекает — он показывает, как нужда и усталость меняют людей, и не отводит взгляд. То, что вы дважды откладывали и всё-таки дочитали, — это и есть настоящее чтение.',
    reactions: { '❤️': ['olya'] },
  },
  {
    who: 'darya',
    at: 0.5,
    replyTo: 'tyazhelo',
    text:
      'Так же. Особенно середина, где просто едут и едут и ничего не меняется. Потом поняла, что это и есть приём.',
  },
  {
    who: 'marina',
    at: 0.78,
    text:
      'Последняя сцена. Я закрыла книгу и минут десять сидела молча. До сих пор не знаю, что про неё думать.',
    reactions: { '🙏': ['olya'], '❤️': ['darya'] },
  },
];

/* ------------------------------------------------------------------ *
 *                          ВРЕМЕННЫЕ МЕТКИ                           *
 * ------------------------------------------------------------------ */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Разложить сообщения по окну [windowStart, windowEnd] согласно долям `at`,
 * загнав ночные часы в дневные (8:00–22:00) и сохранив строгий порядок.
 * Без этого половина реплик оказывается в четыре утра — тоже выдаёт скрипт.
 */
function spreadTimestamps(items, windowStart, windowEnd) {
  const span = windowEnd.getTime() - windowStart.getTime();
  if (span <= 0) {
    throw new Error('Пустое окно времени для сообщений — проверьте даты клуба');
  }

  let prev = 0;
  return items.map((item, i) => {
    let ts = windowStart.getTime() + span * item.at;

    // Дневные часы: если попали в 22:00–08:00, сдвигаем внутрь дня.
    const d = new Date(ts);
    const h = d.getHours();
    if (h >= 22) {
      d.setHours(20, 10 + ((i * 7) % 45), 0, 0);
      ts = d.getTime();
    } else if (h < 8) {
      d.setHours(9, 5 + ((i * 11) % 50), 0, 0);
      ts = d.getTime();
    }

    // Строгий порядок: каждое следующее хотя бы на пару минут позже.
    if (ts <= prev) ts = prev + (3 + (i % 5)) * 60 * 1000;
    if (ts > windowEnd.getTime()) ts = windowEnd.getTime() - (items.length - i) * 60 * 1000;
    prev = ts;

    return new Date(ts);
  });
}

/* ------------------------------------------------------------------ *
 *                              ХЕЛПЕРЫ                               *
 * ------------------------------------------------------------------ */

function buildRawMessage({ clubId, userId, text, createdAt, replyToId, isPinned }) {
  const now = new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    clubMonthId: clubId,
    userId,
    type: 'text',
    text,
    imageUrl: null,
    imageStoragePath: null,
    voiceUrl: null,
    voiceStoragePath: null,
    voiceDurationSec: null,
    voiceWaveform: [],
    replyToId: replyToId || null,
    reactions: [],
    mentions: [],
    editedAt: null,
    deletedAt: null,
    readBy: [],
    isPinned: Boolean(isPinned),
    isHidden: false,
    reportCount: 0,
    createdAt,
    updatedAt: createdAt > now ? now : createdAt,
    __v: 0,
  };
}

async function seedClub({ club, messages, users, label }) {
  const now = new Date();

  // Окно: от старта клуба (но не глубже 8 дней назад) до «полчаса назад».
  // Для архива верхняя граница — конец месяца клуба, а не сейчас.
  const isArchive = club.endsAt < now;
  const windowEnd = isArchive
    ? new Date(Math.min(club.endsAt.getTime(), now.getTime() - HOUR))
    : new Date(now.getTime() - 30 * 60 * 1000);
  const windowStart = new Date(
    Math.max(club.startsAt.getTime(), windowEnd.getTime() - 8 * DAY)
  );

  // Только те реплики, для которых есть аккаунт (ksenia может отсутствовать).
  const usable = messages.filter((m) => users[m.who]);
  const skipped = messages.length - usable.length;

  const stamps = spreadTimestamps(usable, windowStart, windowEnd);

  // Приветственный закреп (atStart) должен стоять в НАЧАЛЕ месяца клуба, а не
  // в окне последней недели: иначе «добро пожаловать в новый месяц» окажется
  // датировано серединой месяца. Утро дня старта, но строго раньше следующей
  // реплики — порядок ленты не ломаем.
  usable.forEach((m, i) => {
    if (!m.atStart) return;
    const start = new Date(club.startsAt.getTime());
    start.setHours(10, 12, 0, 0);
    let ts = start.getTime();
    if (ts < club.startsAt.getTime()) ts = club.startsAt.getTime() + 30 * 60 * 1000;
    const next = stamps[i + 1] ? stamps[i + 1].getTime() : windowEnd.getTime();
    if (ts >= next) ts = next - 5 * 60 * 1000;
    stamps[i] = new Date(ts);
  });

  console.log(`\n=== ${label}: «${club.title}» (${club.year}-${club.month}) ===`);
  console.log(
    `    окно: ${windowStart.toISOString().slice(0, 16)} → ${windowEnd
      .toISOString()
      .slice(0, 16)}`
  );
  if (skipped > 0) {
    console.log(`    пропущено реплик (нет аккаунта): ${skipped}`);
  }

  // --clean: убрать то, что лежит в чате сейчас (старые сообщения от seed-club).
  // Удаление МЯГКОЕ (deletedAt) — история фильтрует их на сервере, в ленте они
  // не появятся, но при желании всё можно вернуть, сняв deletedAt.
  if (CLEAN) {
    const stale = await ChatMessage.find({
      clubMonthId: club._id,
      deletedAt: null,
    })
      .select('_id userId text')
      .lean();

    if (stale.length === 0) {
      console.log('    --clean: чат пуст, удалять нечего');
    } else {
      console.log(`    --clean: будет скрыто существующих сообщений: ${stale.length}`);
      for (const s of stale.slice(0, 5)) {
        console.log(`       − ${s.text.replace(/\n+/g, ' ').slice(0, 50)}`);
      }
      if (stale.length > 5) console.log(`       − … и ещё ${stale.length - 5}`);

      if (!DRY_RUN) {
        await ChatMessage.updateMany(
          { clubMonthId: club._id, deletedAt: null },
          { $set: { deletedAt: now, isPinned: false } }
        );
        // Закреп мог указывать на удалённое сообщение — снимаем.
        await ClubMonth.updateOne(
          { _id: club._id },
          { $set: { pinnedMessageId: null } }
        );
      }
    }
  }

  const refToId = new Map();
  const created = [];
  let existing = 0;

  for (let i = 0; i < usable.length; i += 1) {
    const m = usable[i];
    const author = users[m.who];

    // Идемпотентность: тот же автор + тот же текст в том же клубе = уже есть.
    // Только среди ЖИВЫХ: удалённое (в т.ч. только что через --clean) за
    // дубликат не считаем, иначе после очистки скрипт ничего бы не создал.
    const dup = await ChatMessage.findOne({
      clubMonthId: club._id,
      userId: author._id,
      text: m.text,
      deletedAt: null,
    })
      .select('_id')
      .lean();

    if (dup) {
      existing += 1;
      if (m.ref) refToId.set(m.ref, dup._id);
      continue;
    }

    const doc = buildRawMessage({
      clubId: club._id,
      userId: author._id,
      text: m.text,
      createdAt: stamps[i],
      replyToId: m.replyTo ? refToId.get(m.replyTo) : null,
      isPinned: m.pin,
    });

    // Реакции: собираем массив по эмодзи из ключей участниц.
    if (m.reactions) {
      doc.reactions = Object.entries(m.reactions)
        .map(([emoji, keys]) => ({
          emoji,
          userIds: keys.map((k) => users[k] && users[k]._id).filter(Boolean),
        }))
        .filter((r) => r.userIds.length > 0);
    }

    if (m.ref) refToId.set(m.ref, doc._id);
    created.push({ doc, who: m.who, pin: m.pin });

    const preview = m.text.replace(/\n+/g, ' ').slice(0, 58);
    console.log(
      `    [${stamps[i].toISOString().slice(0, 16)}] ${author.name}: ${preview}${
        m.text.length > 58 ? '…' : ''
      }${m.replyTo ? '  ↩' : ''}${m.pin ? '  📌' : ''}`
    );
  }

  if (existing > 0) {
    console.log(`    уже было в чате: ${existing} (пропущены)`);
  }

  if (DRY_RUN || created.length === 0) {
    return { created: created.length, existing };
  }

  // Пишем сырым драйвером: mongoose с timestamps:true перезаписал бы createdAt
  // текущим временем, и весь смысл разброса по дням пропал бы.
  await ChatMessage.collection.insertMany(created.map((c) => c.doc));

  const pinned = created.find((c) => c.pin);
  const update = {};
  if (pinned) update.pinnedMessageId = pinned.doc._id;

  const total = await ChatMessage.countDocuments({
    clubMonthId: club._id,
    deletedAt: null,
  });
  const authors = await ChatMessage.distinct('userId', {
    clubMonthId: club._id,
    deletedAt: null,
  });
  update.messageCount = total;
  update.participantCount = authors.length;

  await ClubMonth.updateOne({ _id: club._id }, { $set: update });

  return { created: created.length, existing };
}

/* ------------------------------------------------------------------ *
 *                               MAIN                                 *
 * ------------------------------------------------------------------ */

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log(DRY_RUN ? '🔎 DRY RUN — ничего не пишем\n' : '✍️  Запись включена\n');

  // — Ведущая —
  let anna;
  if (ANNA_EMAIL) {
    anna = await User.findOne({ email: ANNA_EMAIL });
    if (!anna) throw new Error(`Аккаунт ведущей не найден: ${ANNA_EMAIL}`);
  } else {
    const admins = await User.find({ role: 'admin' }).select('_id name email');
    if (admins.length === 0) throw new Error('Не найден ни один аккаунт с role=admin');
    if (admins.length > 1) {
      throw new Error(
        `Админов несколько (${admins
          .map((a) => a.email)
          .join(', ')}). Укажите явно: --anna=EMAIL`
      );
    }
    [anna] = admins;
  }
  console.log(`👤 Ведущая: ${anna.name} <${anna.email}>`);

  // — Участницы —
  const users = { anna };
  for (const person of CAST) {
    const u = await User.findOne({ email: person.email });
    if (!u) {
      console.log(`⚠️  Нет аккаунта ${person.email} — её реплики будут пропущены`);
      continue;
    }
    users[person.key] = u;
    if (!NO_RENAME && u.name !== person.name) {
      console.log(`   ✏️  ${u.email}: «${u.name}» → «${person.name}»`);
      if (!DRY_RUN) {
        u.name = person.name;
        await u.save();
      }
    } else {
      console.log(`   • ${person.name} <${u.email}>`);
    }
  }

  if (KSENIA_EMAIL) {
    const k = await User.findOne({ email: KSENIA_EMAIL });
    if (!k) {
      console.log(`⚠️  Нет аккаунта ${KSENIA_EMAIL} — реплики Ксении пропущены`);
    } else {
      users.ksenia = k;
      if (!NO_RENAME && k.name !== 'Ксения') {
        console.log(`   ✏️  ${k.email}: «${k.name}» → «Ксения»`);
        if (!DRY_RUN) {
          k.name = 'Ксения';
          await k.save();
        }
      } else {
        console.log(`   • Ксения <${k.email}>`);
      }
    }
  } else {
    console.log('ℹ️  --ksenia не указан: две её реплики пропускаются');
  }

  // — Клубы —
  const now = new Date();
  const current = await ClubMonth.findOne({
    startsAt: { $lte: now },
    endsAt: { $gte: now },
  });
  const archive = await ClubMonth.findOne({ endsAt: { $lt: now } }).sort({
    endsAt: -1,
  });

  if (!current) {
    console.log('\n⚠️  Текущий клуб не найден (нет клуба, чей период включает сегодня)');
  } else {
    await seedClub({
      club: current,
      messages: CURRENT_MESSAGES,
      users,
      label: 'ТЕКУЩИЙ КЛУБ',
    });
  }

  if (!archive) {
    console.log('\n⚠️  Архивный клуб не найден');
  } else {
    await seedClub({
      club: archive,
      messages: ARCHIVE_MESSAGES,
      users,
      label: 'АРХИВ',
    });
  }

  console.log(
    DRY_RUN
      ? '\n🔎 Это был dry run. Перезапустите без --dry-run, чтобы применить.'
      : '\n✅ Готово. Осталось: Анне записать голосовое в текущем клубе.'
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
