import { describe, expect, it } from 'vitest';
import { creditsEarned, decideScan, minutesInRoom, parseScanInput, sessionStatusAt, type ScanContext } from './attendance';
import { EVENT_TYPES } from './event-types';

const T = (hm: string) => new Date(`2026-09-22T${hm}:00Z`);
const session = { id: 's3', title: 'Session 3: Heart failure in the Gulf', startsAt: T('13:00'), endsAt: T('14:30'), capacity: null, credits: 1.5 };
const reg = { id: 'r1', publicId: 1001, name: 'Dr Ahmed Al-Mutairi', detail: 'Cardiology', ticketTypeId: 't1', ticketTypeName: 'Healthcare professional', cancelled: false };

function ctx(over: Partial<ScanContext> = {}): ScanContext {
  return {
    mode: 'in', type: EVENT_TYPES.medical, session, registration: reg, rawInput: '1001', intervals: [], inRoomCount: 0,
    creditPolicy: { rule: 'duration', thresholdPct: 75 }, now: T('13:05'), formatTime: (d) => d.toISOString().slice(11, 16), ...over,
  };
}

describe('parseScanInput', () => {
  it('reads scanner and typed input', () => {
    expect(parseScanInput('1001')).toBe(1001);
    expect(parseScanInput('*1001*')).toBe(1001);
    expect(parseScanInput('ID 1003')).toBe(1003);
    expect(parseScanInput('abc')).toBeNull();
    expect(parseScanInput('0')).toBeNull();
  });
});

describe('sessionStatusAt', () => {
  it('moves upcoming → live → ended', () => {
    expect(sessionStatusAt(session, T('12:59'))).toBe('upcoming');
    expect(sessionStatusAt(session, T('13:00'))).toBe('live');
    expect(sessionStatusAt(session, T('14:30'))).toBe('ended');
  });
});

describe('decideScan', () => {
  it('welcomes a first check-in and opens an interval', () => {
    const o = decideScan(ctx());
    expect(o.kind).toBe('ok');
    expect(o.title).toBe('Welcome, Dr Ahmed Al-Mutairi');
    expect(o.action.type).toBe('open');
  });

  it('warns on a double scan without opening a second interval', () => {
    const o = decideScan(ctx({ intervals: [{ inAt: T('13:02'), outAt: null }] }));
    expect(o.kind).toBe('warn');
    expect(o.action.type).toBe('none');
  });

  it('says welcome back after leaving', () => {
    const o = decideScan(ctx({ intervals: [{ inAt: T('13:02'), outAt: T('13:04') }] }));
    expect(o.title).toBe('Welcome back, Dr Ahmed Al-Mutairi');
  });

  it('refuses unknown IDs, cancelled registrations and ended sessions', () => {
    expect(decideScan(ctx({ registration: null, rawInput: '9981' })).title).toBe('ID 9981 not found');
    expect(decideScan(ctx({ registration: { ...reg, cancelled: true } })).kind).toBe('err');
    expect(decideScan(ctx({ now: T('15:00') })).title).toContain('has ended');
  });

  it('refuses when the room is full', () => {
    const o = decideScan(ctx({ session: { ...session, capacity: 30 }, inRoomCount: 30 }));
    expect(o.kind).toBe('err');
    expect(o.title).toBe('Session 3 is full');
  });

  it('flags a checkout below the CME threshold', () => {
    const o = decideScan(ctx({ mode: 'out', now: T('13:30'), intervals: [{ inAt: T('13:00'), outAt: null }] }));
    expect(o.kind).toBe('out');
    expect(o.detail).toContain('below 75%');
  });

  it('does not flag a checkout that already meets the threshold', () => {
    const o = decideScan(ctx({ mode: 'out', now: T('14:25'), intervals: [{ inAt: T('13:00'), outAt: null }] }));
    expect(o.detail).not.toContain('below');
  });

  it('handles checkout edge cases', () => {
    expect(decideScan(ctx({ mode: 'out' })).title).toContain('never checked in');
    expect(decideScan(ctx({ mode: 'out', intervals: [{ inAt: T('13:00'), outAt: T('13:10') }] })).title).toContain('already left');
  });

  describe('concert gates', () => {
    const gate = { ...session, title: 'Gate A · General admission', gateTicketTypeId: 'ga', credits: 0 };
    const guest = { ...reg, name: 'Maha Al-Ketbi', ticketTypeId: 'vip', ticketTypeName: 'VIP lounge' };
    it('sends a wrong-gate ticket to its own gate', () => {
      const o = decideScan(ctx({ type: EVENT_TYPES.concert, session: gate, registration: guest, gateForTicket: () => 'VIP lounge entrance' }));
      expect(o.kind).toBe('err');
      expect(o.detail).toBe('VIP lounge ticket. Send them to VIP lounge entrance');
    });
    it('records pass-outs', () => {
      const o = decideScan(ctx({ type: EVENT_TYPES.concert, mode: 'out', session: gate, registration: { ...guest, ticketTypeId: 'ga' }, intervals: [{ inAt: T('13:01'), outAt: null }] }));
      expect(o.detail).toBe('Pass-out recorded. They can scan back in.');
    });
  });
});

describe('minutesInRoom and creditsEarned', () => {
  const policy = { rule: 'duration' as const, thresholdPct: 75 };

  it('sums intervals, clipped to the session', () => {
    const iv = [{ inAt: T('12:50'), outAt: T('13:40') }, { inAt: T('14:00'), outAt: T('14:45') }];
    expect(minutesInRoom(session, iv, T('15:00'))).toBe(40 + 30);
  });

  it('is still counting while in the room during the session', () => {
    expect(minutesInRoom(session, [{ inAt: T('13:00'), outAt: null }], T('13:30'))).toBeNull();
    expect(creditsEarned(session, [{ inAt: T('13:00'), outAt: null }], policy, T('13:30'))).toBeNull();
  });

  it('counts a forgotten scan-out to the end of the session', () => {
    expect(minutesInRoom(session, [{ inAt: T('13:05'), outAt: null }], T('16:00'))).toBe(85);
  });

  it('awards points at or above the threshold only', () => {
    // 90-minute session, 75% = 67.5 minutes
    expect(creditsEarned(session, [{ inAt: T('13:00'), outAt: T('14:08') }], policy, T('15:00'))).toBe(1.5);
    expect(creditsEarned(session, [{ inAt: T('13:00'), outAt: T('14:07') }], policy, T('15:00'))).toBe(0);
  });

  it('awards points for simply checking in under the check-in rule', () => {
    expect(creditsEarned(session, [{ inAt: T('14:20'), outAt: T('14:21') }], { rule: 'checkin', thresholdPct: 75 }, T('15:00'))).toBe(1.5);
  });

  it('awards nothing without attendance', () => {
    expect(creditsEarned(session, [], policy, T('15:00'))).toBe(0);
  });
});
