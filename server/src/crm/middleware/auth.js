const CrmMember = require('../models/CrmMember');
const { AppError } = require('../../middleware/error');
const { verifyAccess } = require('../services/token.service');
const { CAN, can } = require('../services/permissions');

/**
 * requireCrm(perm) — вход в CRM + право из матрицы CAN (CRM-PLAN A2).
 *
 * - нужен токен CRM (scope:'crm', подпись CRM-секретом); токен приложения → 401;
 * - участница перечитывается из базы на каждый запрос: отключённая (active:false)
 *   теряет доступ сразу, смена роли действует сразу;
 * - perm не задан → любая активная участница (просмотр клиенток и заказов);
 * - роли без права → 403.
 *
 * Кладёт req.crmMember = { id, name, email, role }.
 */
const loadMember = async (req) => {
  if (req.crmMember) {
    return null;
  }
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return new AppError('UNAUTHORIZED', 'Токен не предоставлен', 401);
  }

  let decoded;
  try {
    decoded = verifyAccess(header.split(' ')[1]);
  } catch (_err) {
    return new AppError('UNAUTHORIZED', 'Невалидный токен', 401);
  }

  const member = await CrmMember.findById(decoded.memberId)
    .select('name email role active')
    .lean();
  if (!member || !member.active) {
    return new AppError('UNAUTHORIZED', 'Доступ закрыт', 401);
  }

  req.crmMember = {
    id: String(member._id),
    name: member.name,
    email: member.email,
    role: member.role,
  };
  return null;
};

const requireCrm = (perm) => {
  if (perm !== undefined && !CAN[perm]) {
    throw new Error(`requireCrm: неизвестное право «${perm}»`);
  }
  return async (req, _res, next) => {
    try {
      const err = await loadMember(req);
      if (err) {
        return next(err);
      }
      if (perm && !can(req.crmMember.role, perm)) {
        return next(new AppError('FORBIDDEN', 'Недостаточно прав', 403));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

module.exports = { requireCrm };
