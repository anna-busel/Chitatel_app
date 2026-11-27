/**
 * Друзья (UPDATES-PLAN F2/F3, 27.11.2026): заявка, встречная заявка, принять,
 * отклонить, блокировка, лимит, уведомления.
 */
jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/models/User', () => ({ findById: jest.fn(), find: jest.fn() }));
jest.mock('../src/models/Friendship', () => {
  const M = jest.fn();
  M.pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');
  M.findOne = jest.fn();
  M.find = jest.fn();
  M.create = jest.fn();
  M.countDocuments = jest.fn();
  M.deleteOne = jest.fn();
  return M;
});
jest.mock('../src/services/push.service', () => ({ sendToUser: jest.fn(() => Promise.resolve(true)) }));
jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { userId: req.headers['x-test-user'] };
    next();
  },
}));

const express = require('express');
const User = require('../src/models/User');
const Friendship = require('../src/models/Friendship');
const push = require('../src/services/push.service');
const routes = require('../src/routes/friends');
const { errorHandler } = require('../src/middleware/error');

const A = '64a000000000000000000001';
const B = '64a000000000000000000002';
const tick = () => new Promise((r) => setImmediate(r));

function chain(value) {
  const q = { then: (res, rej) => Promise.resolve(value).then(res, rej) };
  ['select', 'lean', 'sort'].forEach((m) => { q[m] = jest.fn(() => q); });
  return q;
}

let server;
let baseUrl;
beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/friends', routes);
  app.use(errorHandler);
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});
afterAll((done) => {
  server.close(done);
});

const users = {};
beforeEach(() => {
  jest.clearAllMocks();
  users[A] = { _id: A, name: 'Аня', blockedUsers: [] };
  users[B] = { _id: B, name: 'Вера', blockedUsers: [] };
  User.findById.mockImplementation((id) => chain(users[String(id)] || null));
  User.find.mockImplementation((f) => chain(f._id.$in.map((id) => users[String(id)]).filter(Boolean)));
  Friendship.countDocuments.mockResolvedValue(0);
  Friendship.deleteOne.mockResolvedValue({});
});

async function call(method, path, me, body) {
  const res = await fetch(`${baseUrl}/api/friends${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-test-user': me },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

test('заявка: создаётся pending, Вере уходит уведомление friend_request', async () => {
  Friendship.findOne.mockResolvedValue(null);
  Friendship.create.mockResolvedValue({ _id: 'f1' });
  const r = await call('POST', '/requests', A, { userId: B });
  expect(r.body.data).toEqual({ status: 'pending', requestId: 'f1' });
  expect(Friendship.create).toHaveBeenCalledWith({ requesterId: A, addresseeId: B, pairKey: `${A}:${B}` });
  await tick();
  expect(push.sendToUser).toHaveBeenCalledWith(B, expect.objectContaining({
    data: { type: 'friend_request', requestId: 'f1', userId: A },
  }), 'friends');
});

test('встречная заявка — сразу друзья, первой уходит friend_accepted', async () => {
  const f = { requesterId: B, addresseeId: A, status: 'pending', save: jest.fn(() => Promise.resolve()) };
  Friendship.findOne.mockResolvedValue(f);
  const r = await call('POST', '/requests', A, { userId: B });
  expect(r.body.data.status).toBe('accepted');
  expect(f.status).toBe('accepted');
  await tick();
  expect(push.sendToUser).toHaveBeenCalledWith(B, expect.objectContaining({ data: { type: 'friend_accepted', userId: A } }), 'friends');
});

test('блокировка в любую сторону — заявку не отправить', async () => {
  users[B].blockedUsers = [A];
  const r = await call('POST', '/requests', A, { userId: B });
  expect(r.status).toBe(403);
  expect(Friendship.create).not.toHaveBeenCalled();
});

test('себя — нельзя; больше 50 в сутки — нельзя', async () => {
  expect((await call('POST', '/requests', A, { userId: A })).status).toBe(400);
  Friendship.findOne.mockResolvedValue(null);
  Friendship.countDocuments.mockResolvedValue(50);
  expect((await call('POST', '/requests', A, { userId: B })).status).toBe(429);
});

test('принять может только адресат: заявка ищется по addresseeId', async () => {
  const f = { _id: 'f1', requesterId: A, addresseeId: B, status: 'pending', save: jest.fn(() => Promise.resolve()) };
  Friendship.findOne.mockResolvedValue(f);
  const r = await call('POST', '/requests/64b000000000000000000001/accept', B);
  expect(r.body.data).toEqual({ status: 'accepted', userId: A });
  expect(Friendship.findOne).toHaveBeenCalledWith({ _id: '64b000000000000000000001', addresseeId: B, status: 'pending' });
  Friendship.findOne.mockResolvedValue(null);
  expect((await call('POST', '/requests/64b000000000000000000001/accept', A)).status).toBe(404);
});

test('отклонить — запись удаляется', async () => {
  Friendship.findOne.mockResolvedValue({ _id: 'f1', requesterId: A, addresseeId: B, status: 'pending' });
  const r = await call('POST', '/requests/64b000000000000000000001/decline', B);
  expect(r.body.data.status).toBe('none');
  expect(Friendship.deleteOne).toHaveBeenCalledWith({ _id: 'f1' });
});

test('список друзей — без заблокированных', async () => {
  const C = '64a000000000000000000003';
  users[C] = { _id: C, name: 'Оля', blockedUsers: [] };
  users[A].blockedUsers = [C];
  Friendship.find.mockReturnValue(chain([
    { requesterId: A, addresseeId: B, status: 'accepted' },
    { requesterId: C, addresseeId: A, status: 'accepted' },
  ]));
  const r = await call('GET', '/', A);
  expect(r.body.data).toEqual({ friends: [{ id: B, name: 'Вера', avatarUrl: null }], count: 1 });
});

test('удалить из друзей — по паре', async () => {
  const r = await call('DELETE', `/${B}`, A);
  expect(r.body.data.status).toBe('none');
  expect(Friendship.deleteOne).toHaveBeenCalledWith({ pairKey: `${A}:${B}` });
});
