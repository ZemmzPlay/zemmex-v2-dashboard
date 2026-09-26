import type { PlayPlayer } from '@zemmz/db';
import { PLAY_COUNTRIES } from '@zemmz/shared';

/** The fields for adding a player or correcting one's details. */
export function PlayerFields({ p, id }: { p?: PlayPlayer; id: string }) {
  return (
    <>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="fld"><label htmlFor={`${id}-fn`}>First name</label><input id={`${id}-fn`} name="firstName" className="inp" required maxLength={60} defaultValue={p?.firstName} autoComplete="off" /></div>
        <div className="fld"><label htmlFor={`${id}-ln`}>Last name</label><input id={`${id}-ln`} name="lastName" className="inp" required maxLength={60} defaultValue={p?.lastName} autoComplete="off" /></div>
      </div>
      <div className="fld"><label htmlFor={`${id}-tag`}>Gamer tag</label><input id={`${id}-tag`} name="gamerTag" className="inp" required maxLength={24} defaultValue={p?.gamerTag} /><span className="hint">Shown in brackets and standings.</span></div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="fld"><label htmlFor={`${id}-em`}>Email</label><input id={`${id}-em`} name="email" type="email" className="inp" required defaultValue={p?.email} /></div>
        <div className="fld"><label htmlFor={`${id}-ph`}>Mobile<span className="opt">optional</span></label><input id={`${id}-ph`} name="phone" className="inp" inputMode="tel" placeholder="+965 5000 0000" defaultValue={p?.phone} /></div>
      </div>
      <div className="fld"><label htmlFor={`${id}-c`}>Country</label><select id={`${id}-c`} name="country" className="sel" defaultValue={p?.country ?? ''}><option value="">Not given</option>{PLAY_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}</select></div>
      <div className="fld !mb-0"><label htmlFor={`${id}-n`}>Note for admins<span className="opt">optional</span></label><input id={`${id}-n`} name="note" className="inp" maxLength={500} defaultValue={p?.note} placeholder="Only admins see this" /></div>
    </>
  );
}
