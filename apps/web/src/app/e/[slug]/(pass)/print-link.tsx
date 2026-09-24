'use client';

export function PrintLink({ label }: { label: string }) {
  return (
    <button type="button" className="btn line" onClick={() => window.print()}>
      {label}
    </button>
  );
}
