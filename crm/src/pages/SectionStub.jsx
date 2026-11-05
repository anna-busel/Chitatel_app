import { useEffect } from 'react';

/** Заглушка раздела до его задачи в CRM-PLAN (D…M). */
export default function SectionStub({ section }) {
  useEffect(() => {
    document.title = `${section.title} · CRM Читатель`;
  }, [section.title]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="pagehead">
        <h1 className="h1">{section.title}</h1>
      </div>
      <section className="card stub">
        <span className="stub-title">Раздел в работе</span>
        <span className="small muted">Экран появится по плану CRM (задача {section.task}).</span>
      </section>
    </div>
  );
}
