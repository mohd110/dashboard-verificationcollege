'use client';

import { Printer } from 'lucide-react';

import { buttonClass } from '@/components/ui';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass.primary}>
      <Printer size={15} />
      Print this card
    </button>
  );
}
