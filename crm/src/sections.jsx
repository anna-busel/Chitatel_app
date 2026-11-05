/**
 * Разделы CRM — как боковое меню прототипа (docs/crm-prototype/markup.html,
 * nav в component.js). perm — право из матрицы CAN (server/src/crm/services/
 * permissions.js); без perm раздел видят все роли. Менеджер не видит
 * «Рассылки», «Финансы», «Импорт» и «Настройки».
 */
const Icon = ({ children }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const SECTIONS = [
  {
    key: 'today', path: '/today', title: 'Сегодня', group: 'Работа', task: 'D, K',
    icon: <Icon><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Icon>,
  },
  {
    key: 'tasks', path: '/tasks', title: 'Задачи', group: 'Работа', task: 'K',
    icon: <Icon><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m8 12 3 3 5-6" /></Icon>,
  },
  {
    key: 'sales', path: '/sales', title: 'План продаж', group: 'Работа', perm: 'sales', task: 'K',
    icon: <Icon><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Icon>,
  },
  {
    key: 'inbox', path: '/inbox', title: 'Входящие', group: 'Работа', perm: 'inbox', task: 'I',
    icon: <Icon><path d="M3 13h5l2 3h4l2-3h5" /><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" /></Icon>,
  },
  {
    key: 'clients', path: '/clients', title: 'Клиенты', group: 'База', task: 'D',
    icon: <Icon><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-7 7-7s7 3 7 7" /><path d="M16 4a4 4 0 0 1 0 8" /><path d="M22 21c0-3-2-5.5-5-6.5" /></Icon>,
  },
  {
    key: 'orders', path: '/orders', title: 'Заказы', group: 'База', task: 'D',
    icon: <Icon><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></Icon>,
  },
  {
    key: 'products', path: '/products', title: 'Продукты и оплата', group: 'Каталог', task: 'E',
    icon: <Icon><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></Icon>,
  },
  {
    key: 'mail', path: '/mail', title: 'Рассылки', group: 'Каталог', perm: 'mail', task: 'J',
    icon: <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icon>,
  },
  {
    key: 'stats', path: '/stats', title: 'Финансы', group: 'Управление', perm: 'stats', task: 'L',
    icon: <Icon><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Icon>,
  },
  {
    key: 'import', path: '/import', title: 'Импорт из ГК', group: 'Управление', perm: 'import', task: 'H',
    icon: <Icon><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></Icon>,
  },
  {
    key: 'settings', path: '/settings', title: 'Настройки', group: 'Управление', perm: 'settings', task: 'M',
    icon: <Icon><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></Icon>,
  },
];

export const GROUPS = ['Работа', 'База', 'Каталог', 'Управление'];

export const ROLES = { owner: 'Владелец', admin: 'Администратор', marketing: 'Маркетинг', manager: 'Менеджер' };
