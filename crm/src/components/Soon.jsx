/**
 * Кнопка действия, которого ещё нет на сервере: неактивна, с подсказкой
 * «скоро» и задачей плана, где она появится (CRM-PLAN).
 *
 *   <Soon className="btn-s" hint="Задачи — блок K">+ Задача</Soon>
 */
export default function Soon({ className = 'btn', hint, children, style }) {
  const title = hint ? `Скоро: ${hint}` : 'Скоро';
  return (
    <button type="button" className={`${className} soon`} disabled aria-disabled="true" title={title} style={style}>
      {children}
      <span className="soon-tag">скоро</span>
    </button>
  );
}
