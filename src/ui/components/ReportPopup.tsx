import { useEffect } from 'preact/hooks';
import { reportPopup } from '../store';
import { ReportDetail, listTitle } from '../screens/ReportsScreen';
import { formatGameTime } from '../../shared/time';

/** A report over everything, opened from the map or a profile. Esc or clicking outside closes it. */
export function ReportPopup() {
  const r = reportPopup.value;
  useEffect(() => {
    if (!r) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') reportPopup.value = null; };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [r]);
  if (!r) return null;
  return (
    <div class="modal-backdrop" onClick={() => (reportPopup.value = null)}>
      <div class="modal report-modal" role="dialog" aria-modal="true" aria-label={listTitle(r)} onClick={(e) => e.stopPropagation()}>
        <div class="row">
          <h3 style={{ margin: 0, flex: 1 }}>{listTitle(r)}</h3>
          <span class="muted mono">{formatGameTime(r.time)}</span>
          <button class="small" onClick={() => (reportPopup.value = null)} aria-label="Sluiten">✕</button>
        </div>
        <ReportDetail r={r} />
      </div>
    </div>
  );
}
