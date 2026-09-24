'use client';

import { Icon } from '@/components/icon';

export function PrintButton({ label, onPrinted }: { label: string; onPrinted: () => Promise<void> }) {
  return (
    <button
      type="button"
      className="btn primary"
      onClick={() => {
        window.print();
        void onPrinted();
      }}
    >
      <Icon name="print" size={16} /> {label}
    </button>
  );
}
