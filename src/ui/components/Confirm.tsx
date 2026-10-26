import { useEffect, useState } from 'preact/hooks';

/** A button that asks once more before it acts (no browser dialogs); it disarms after a few seconds. */
export function Confirm({ label, sure = 'Zeker?', onConfirm, cls = '', disabled = false }: {
  label: string;
  sure?: string;
  onConfirm: () => void;
  cls?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button class={`small ${cls} ${armed ? 'danger' : ''}`} disabled={disabled} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? sure : label}
    </button>
  );
}
