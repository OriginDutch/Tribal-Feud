import { useEffect, useState } from 'preact/hooks';

const STEPS = ['Zeker? Dit is verraad.', 'Echt? Er is geen weg terug.', 'Laatste kans: VERRAAD PLEGEN'];

/** Three clicks after the first one before anything happens (the nuke button). Resets after 8 s. */
export function TripleConfirm({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!step) return;
    const t = window.setTimeout(() => setStep(0), 8000);
    return () => window.clearTimeout(t);
  }, [step]);
  return (
    <button
      class={`small ${step ? 'danger' : ''} ${step === 3 ? 'nuke' : ''}`}
      onClick={() => {
        if (step < 3) setStep(step + 1);
        else { setStep(0); onConfirm(); }
      }}
    >
      {step === 0 ? label : STEPS[step - 1]}
    </button>
  );
}
