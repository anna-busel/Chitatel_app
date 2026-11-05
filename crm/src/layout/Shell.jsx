import { useCallback, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import useOutside from '../components/useOutside';
import { GROUPS, ROLES, SECTIONS } from '../sections';
import { avStyle, initials } from '../utils';

/**
 * Оболочка CRM — боковое меню и шапка прототипа (markup.html: nav.side,
 * header.top). Пункты меню скрываются по правам из GET /api/crm/me
 * (как nav.*.show = can(...) в component.js); заголовок группы — только
 * если в ней есть видимые пункты.
 * Поиск, «Новый заказ» и уведомления в шапке появятся с экранами D/K;
 * переключатель ролей «для демо» не переносим (CRM-PLAN A4).
 */
export default function Shell() {
  const { member, can, logout } = useAuth();
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef(null);
  const closeUser = useCallback(() => setUserOpen(false), []);
  useOutside(userRef, userOpen, closeUser);

  const visible = SECTIONS.filter((s) => can(s.perm));

  return (
    <div className="app">
      <nav className="side" aria-label="Разделы">
        <div className="brand">
          <div className="brand-name">ЧИТАТЕЛЬ</div>
          <div className="brand-sub">CRM книжного клуба</div>
        </div>
        {GROUPS.map((g) => {
          const items = visible.filter((s) => s.group === g);
          if (!items.length) return null;
          return (
            <div key={g} style={{ display: 'contents' }}>
              <div className="grp">{g}</div>
              {items.map((s) => (
                <NavLink key={s.key} to={s.path} className={({ isActive }) => `navi${isActive ? ' active' : ''}`}>
                  {s.icon}
                  <span>{s.title}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="main">
        <header className="top">
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }} ref={userRef}>
              <button type="button" className="userbtn" aria-label="Профиль" aria-expanded={userOpen}
                onClick={() => setUserOpen((v) => !v)}>
                <span className="av" style={avStyle(member.name, 30)}>{initials(member.name)}</span>
                <span className="userbtn-text hide-sm">
                  <span className="userbtn-name">{member.name}</span>
                  <span className="userbtn-role">{ROLES[member.role] || member.role}</span>
                </span>
              </button>
              {userOpen && (
                <div className="menu" style={{ width: 280, minWidth: 0 }}>
                  <div style={{ padding: '8px 12px 4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>{member.name}</span>
                    <span className="small muted cell">{member.email}</span>
                    <span className="small muted">{ROLES[member.role] || member.role}</span>
                  </div>
                  <div className="menusep" />
                  <button type="button" className="menuitem" onClick={logout}>Выйти</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
