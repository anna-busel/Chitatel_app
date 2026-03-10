const { Router } = require('express');
const { success } = require('../utils/response');

const router = Router();

// Заглушки — реализация в задаче 1.2

// POST /api/auth/register
router.post('/register', (_req, res) => {
  return success(res, { message: 'Not implemented yet' }, 501);
});

// POST /api/auth/login
router.post('/login', (_req, res) => {
  return success(res, { message: 'Not implemented yet' }, 501);
});

// POST /api/auth/refresh
router.post('/refresh', (_req, res) => {
  return success(res, { message: 'Not implemented yet' }, 501);
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  return success(res, { message: 'Not implemented yet' }, 501);
});

// POST /api/auth/apple
router.post('/apple', (_req, res) => {
  return success(res, { message: 'Not implemented yet' }, 501);
});

// POST /api/auth/google
router.post('/google', (_req, res) => {
  return success(res, { message: 'Not implemented yet' }, 501);
});

module.exports = router;
