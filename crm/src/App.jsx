import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Shell from './layout/Shell';
import Login from './pages/Login';
import NoAccess from './pages/NoAccess';
import SectionStub from './pages/SectionStub';
import Clients from './pages/Clients';
import Orders from './pages/Orders';
import Today from './pages/Today';
import { SECTIONS } from './sections';

function RequireAuth({ children }) {
  const { status, error, retry, logout } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="center-screen muted">Загрузка…</div>;
  }
  if (status === 'error') {
    return (
      <div className="center-screen">
        <span>{error || 'Не удалось загрузить CRM'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-p" type="button" onClick={retry}>Повторить</button>
          <button className="btn" type="button" onClick={logout}>Выйти</button>
        </div>
      </div>
    );
  }
  if (status !== 'in') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

// Готовые экраны (CRM-PLAN D1, D4, D7); остальные разделы — заглушка до своей задачи.
const PAGES = { today: Today, clients: Clients, orders: Orders };

function Section({ section }) {
  const { can } = useAuth();
  if (!can(section.perm)) return <NoAccess title={section.title} />;
  const Page = PAGES[section.key];
  return Page ? <Page /> : <SectionStub section={section} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Navigate to="/today" replace />} />
        {SECTIONS.map((s) => (
          <Route key={s.key} path={s.path.slice(1)} element={<Section section={s} />} />
        ))}
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
  );
}
