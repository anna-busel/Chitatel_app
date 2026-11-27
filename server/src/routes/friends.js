const mongoose = require('mongoose');
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const logger = require('../config/logger');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const pushService = require('../services/push.service');

/**
 * Взаимные друзья (UPDATES-PLAN F2/F3, 27.11.2026). Под /api/friends:
 *   GET    /                         — мои друзья
 *   GET    /requests                 — входящие заявки
 *   POST   /requests {userId}        — отправить заявку (встречная — сразу дружба)
 *   POST   /requests/:id/accept      — принять (только адресат)
 *   POST   /requests/:id/decline     — отклонить (только адресат), запись удаляется
 *   DELETE /:userId                  — удалить из друзей / отозвать свою заявку
 *
 * Блокировка в любую сторону запрещает заявки; сама блокировка рвёт дружбу
 * (routes/users.js). Не больше 50 заявок в сутки от одного человека.
 * Уведомления friend_request / friend_accepted — в ленту и пушем
 * (pushSettings.friends).
 */
const router = Router();
router.use(requireAuth);

const DAILY_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERSON_FIELDS = 'name avatarUrl isDeleted isBanned blockedUsers';

const isId = (v) => mongoose.Types.ObjectId.isValid(v) && /^[a-f0-9]{24}$/i.test(String(v));
const sameId = (a, b) => String(a) === String(b);
const blocks = (u, otherId) => (u.blockedUsers || []).some((id) => sameId(id, otherId));
const person = (u) => ({ id: String(u._id), name: u.name || '', avatarUrl: u.avatarUrl || null });

function notify(userId, payload) {
  // Ошибка пуша не должна ломать заявку.
  Promise.resolve()
    .then(() => pushService.sendToUser(String(userId), payload, 'friends'))
    .catch((err) => logger.warn('friends: пуш не отправлен', { message: err.message }));
}

const requestPush = (from, requestId) => ({
  title: 'Заявка в друзья',
  body: `${from.name || 'Участница'} хочет добавить вас в друзья`,
  data: { type: 'friend_request', requestId: String(requestId), userId: String(from._id) },
});

const acceptedPush = (by) => ({
  title: 'Новый друг',
  body: `Вы теперь друзья с ${by.name || 'участницей'}`,
  data: { type: 'friend_accepted', userId: String(by._id) },
});

/** Живые и не заблокированные мной/мной не заблокировавшие. */
async function visiblePeople(meId, ids) {
  const me = await User.findById(meId).select('blockedUsers').lean();
  const users = await User.find({ _id: { $in: ids }, isDeleted: { $ne: true } })
    .select(PERSON_FIELDS)
    .lean();
  return users.filter((u) => !blocks(me || {}, u._id) && !blocks(u, meId));
}

router.get('/', async (req, res, next) => {
  try {
    const me = req.user.userId;
    const rows = await Friendship.find({
      status: 'accepted',
      $or: [{ requesterId: me }, { addresseeId: me }],
    })
      .sort({ acceptedAt: -1 })
      .lean();
    const otherIds = rows.map((f) => (sameId(f.requesterId, me) ? f.addresseeId : f.requesterId));
    const people = await visiblePeople(me, otherIds);
    const byId = new Map(people.map((u) => [String(u._id), u]));
    const friends = otherIds.map((id) => byId.get(String(id))).filter(Boolean).map(person);
    return success(res, { friends, count: friends.length });
  } catch (err) {
    return next(err);
  }
});

router.get('/requests', async (req, res, next) => {
  try {
    const me = req.user.userId;
    const rows = await Friendship.find({ addresseeId: me, status: 'pending' })
      .sort({ createdAt: -1 })
      .lean();
    const people = await visiblePeople(me, rows.map((f) => f.requesterId));
    const byId = new Map(people.map((u) => [String(u._id), u]));
    const requests = rows
      .filter((f) => byId.has(String(f.requesterId)))
      .map((f) => ({ id: String(f._id), from: person(byId.get(String(f.requesterId))), createdAt: f.createdAt }));
    return success(res, { requests });
  } catch (err) {
    return next(err);
  }
});

router.post('/requests', async (req, res, next) => {
  try {
    const me = String(req.user.userId);
    const target = String((req.body && req.body.userId) || '');
    if (!isId(target)) {throw new AppError('VALIDATION_ERROR', 'Неверный id пользователя', 400);}
    if (target === me) {throw new AppError('VALIDATION_ERROR', 'Нельзя добавить себя в друзья', 400);}

    const [meDoc, other] = await Promise.all([
      User.findById(me).select('name blockedUsers').lean(),
      User.findById(target).select(PERSON_FIELDS).lean(),
    ]);
    if (!other || other.isDeleted) {throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);}
    if (blocks(meDoc || {}, target) || blocks(other, me)) {
      throw new AppError('BLOCKED', 'Заявку отправить нельзя', 403);
    }

    const pairKey = Friendship.pairKeyOf(me, target);
    const existing = await Friendship.findOne({ pairKey });
    if (existing && existing.status === 'accepted') {
      return success(res, { status: 'accepted' });
    }
    if (existing && sameId(existing.requesterId, me)) {
      return success(res, { status: 'pending', requestId: String(existing._id) });
    }
    if (existing) {
      // Встречная заявка: она уже звала меня — сразу друзья.
      existing.status = 'accepted';
      existing.acceptedAt = new Date();
      await existing.save();
      notify(existing.requesterId, acceptedPush({ _id: me, name: meDoc && meDoc.name }));
      return success(res, { status: 'accepted' });
    }

    const sentToday = await Friendship.countDocuments({
      requesterId: me,
      createdAt: { $gt: new Date(Date.now() - DAY_MS) },
    });
    if (sentToday >= DAILY_LIMIT) {
      throw new AppError('TOO_MANY_REQUESTS', 'Слишком много заявок за сутки. Попробуйте завтра', 429);
    }

    let created;
    try {
      created = await Friendship.create({ requesterId: me, addresseeId: target, pairKey });
    } catch (err) {
      // Параллельная заявка уже создала запись на эту пару.
      if (err && err.code === 11000) {return success(res, { status: 'pending' });}
      throw err;
    }
    notify(target, requestPush({ _id: me, name: meDoc && meDoc.name }, created._id));
    return success(res, { status: 'pending', requestId: String(created._id) });
  } catch (err) {
    return next(err);
  }
});

async function pendingForMe(req) {
  const id = req.params.id;
  if (!isId(id)) {throw new AppError('NOT_FOUND', 'Заявка не найдена', 404);}
  const f = await Friendship.findOne({ _id: id, addresseeId: req.user.userId, status: 'pending' });
  if (!f) {throw new AppError('NOT_FOUND', 'Заявка не найдена', 404);}
  return f;
}

router.post('/requests/:id/accept', async (req, res, next) => {
  try {
    const f = await pendingForMe(req);
    f.status = 'accepted';
    f.acceptedAt = new Date();
    await f.save();
    const me = await User.findById(req.user.userId).select('name').lean();
    notify(f.requesterId, acceptedPush({ _id: req.user.userId, name: me && me.name }));
    return success(res, { status: 'accepted', userId: String(f.requesterId) });
  } catch (err) {
    return next(err);
  }
});

router.post('/requests/:id/decline', async (req, res, next) => {
  try {
    const f = await pendingForMe(req);
    await Friendship.deleteOne({ _id: f._id });
    return success(res, { status: 'none', userId: String(f.requesterId) });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:userId', async (req, res, next) => {
  try {
    const other = req.params.userId;
    if (!isId(other)) {throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);}
    await Friendship.deleteOne({ pairKey: Friendship.pairKeyOf(req.user.userId, other) });
    return success(res, { status: 'none', userId: other });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
