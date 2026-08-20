import { useEffect, useRef, useState } from 'react';
import './StatusBanner.css';

const EXIT_MS = 280;
const AUTO_DISMISS_MS = 5000;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function StatusBanner({
  message,
  variant,
  onDismiss
}: {
  message: string | null;
  variant: 'success' | 'error';
  onDismiss: () => void;
}) {
  const [display, setDisplay] = useState<{ text: string; variant: 'success' | 'error' } | null>(
    null
  );
  const [phase, setPhase] = useState<'hidden' | 'visible' | 'exiting'>('hidden');
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!message) {
      setPhase((current) => (current === 'visible' ? 'exiting' : current));
      return;
    }

    setDisplay({ text: message, variant });
    setPhase('hidden');

    let enterId = 0;
    let dismissId = 0;

    enterId = window.setTimeout(() => {
      setPhase('visible');
      dismissId = window.setTimeout(() => setPhase('exiting'), AUTO_DISMISS_MS);
    }, prefersReducedMotion() ? 0 : 16);

    return () => {
      window.clearTimeout(enterId);
      window.clearTimeout(dismissId);
    };
  }, [message, variant]);

  useEffect(() => {
    if (phase !== 'exiting') return;

    const id = window.setTimeout(
      () => {
        setDisplay(null);
        setPhase('hidden');
        onDismissRef.current();
      },
      prefersReducedMotion() ? 0 : EXIT_MS
    );

    return () => window.clearTimeout(id);
  }, [phase]);

  return (
    <div className="status-banner-slot" aria-live="polite" aria-atomic="true">
      {display && (
        <p
          className={`status-banner ${display.variant} ${phase === 'visible' ? 'is-in' : 'is-out'}`}
          role="status"
        >
          {display.text}
        </p>
      )}
    </div>
  );
}
