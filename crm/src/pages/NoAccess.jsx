import { Link } from 'react-router-dom';

export default function NoAccess({ title }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="pagehead"><h1 className="h1">{title || 'Нет доступа'}</h1></div>
      <section className="card stub">
        <span className="stub-title">Нет доступа к этому разделу</span>
        <span className="small muted">Если он нужен для работы — попросите владелицу CRM изменить вашу роль.</span>
        <Link to="/today" className="lnk small">На главную</Link>
      </section>
    </div>
  );
}
