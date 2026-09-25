'use client';

import { useState } from 'react';
import { SimpleForm } from '@/components/simple-form';
import type { ActionState } from '@/lib/action-state';

export function PaymentSettings({
  action, canEdit, vatBps, feePassedOn, refundHours, hasVatNumber, feeText,
}: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  canEdit: boolean;
  vatBps: number;
  feePassedOn: boolean;
  refundHours: number | null;
  hasVatNumber: boolean;
  feeText: string;
}) {
  const [vatOn, setVatOn] = useState(vatBps > 0);
  const [refundsOn, setRefundsOn] = useState(refundHours != null);
  return (
    <SimpleForm action={action} submitLabel="Save payment settings" canEdit={canEdit}>
      <section className="fsec">
        <h2>VAT</h2>
        <div className="fld">
          <label className="switch"><input type="checkbox" role="switch" name="vatOn" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)} /> Add VAT to ticket prices</label>
          <span className="help">Buyers see it as its own line and get a tax invoice. {hasVatNumber ? '' : 'Add your VAT number under Organisation, Details first.'}</span>
        </div>
        {vatOn && (
          <div className="fld max-w-[200px]">
            <label htmlFor="vat">Rate (%)</label>
            <input id="vat" name="vatPercent" type="number" min={0.01} max={30} step={0.01} className="inp" defaultValue={vatBps ? vatBps / 100 : 5} />
            <span className="help">5 in the UAE, 15 in Saudi Arabia.</span>
          </div>
        )}
      </section>
      <section className="fsec">
        <h2>Booking fee</h2>
        <p className="hint">{feeText}</p>
        <div className="fld">
          <label className="switch"><input type="checkbox" role="switch" name="feePassedOn" defaultChecked={feePassedOn} /> Pass the booking fee on to buyers</label>
          <span className="help">On: buyers pay it on top of the ticket price. Off: the price stays as listed and the fee comes out of your payout.</span>
        </div>
      </section>
      <section className="fsec">
        <h2>Refunds</h2>
        <div className="fld">
          <label className="switch"><input type="checkbox" role="switch" name="refundsOn" checked={refundsOn} onChange={(e) => setRefundsOn(e.target.checked)} /> Let buyers cancel and get a refund online</label>
          <span className="help">From the order page in their confirmation email. The ticket stops working straight away; tickets already scanned can’t be refunded online. You can always refund from Orders.</span>
        </div>
        {refundsOn && (
          <div className="fld max-w-[260px]">
            <label htmlFor="rh">Until how many hours before the start</label>
            <input id="rh" name="refundHours" type="number" min={0} step={1} className="inp" defaultValue={refundHours ?? 48} />
          </div>
        )}
      </section>
    </SimpleForm>
  );
}
