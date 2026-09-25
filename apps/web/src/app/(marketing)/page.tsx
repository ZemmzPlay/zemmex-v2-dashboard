import type { Metadata } from 'next';
import Link from 'next/link';
import { TICKET_FEE } from '@zemmz/shared';
import { getCurrentUser } from '@/lib/auth';
import { TRIAL_ATTENDEES, PLANS } from '@/lib/plans';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';

export const metadata: Metadata = {
  title: { absolute: 'zemmz Live: registration, check-in and certificates for events' },
  description: 'Registration or ticketing, check-in at the door, and certificates or follow-up afterwards. One system your team can run without training.',
};

const P = {
  check: 'm5 12.5 4.5 4.5L19 7.5',
  form: 'M5 3h14v18H5zM9 8h6M9 12h6M9 16h3',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  award: 'M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM8.5 14l-1.5 7 5-3 5 3-1.5-7',
};
const I = ({ n, s = 18 }: { n: keyof typeof P; s?: number }) => (
  <svg className="i" viewBox="0 0 24 24" style={{ width: s, height: s }} aria-hidden="true"><path d={P[n]} /></svg>
);

const HOW: [keyof typeof P, string, string, string, string[]][] = [
  ['form', 'Before', 'Open registration or start selling tickets.', 'Everyone gets an ID and a confirmation email. Your website holds the programme, speakers and venue.', ['Free or paid', 'Your form, your fields', 'Arabic and English']],
  ['scan', 'On the day', 'Check people in at every door.', 'Staff scan a badge or e-ticket from a phone or scanner. You see who is in each room as it happens.', ['Badges and e-tickets', 'Session and gate scanning', 'Live headcounts']],
  ['award', 'After', 'Close the event properly.', 'Switch the website to certificates, recordings or a thank-you page. Only people who attended get access.', ['Certificates and CME points', 'Recordings and slides', 'Feedback reports']],
];

const WHO: [string, string][] = [
  ['Government and public sector', 'Forums, national events and public registrations, with roles for every team and a record of every change.'],
  ['Hospitals and medical societies', 'CME points from time spent in each session, accredited certificates and a KIMS-style evaluation.'],
  ['Universities and associations', 'Conferences, graduations and member events, with certificates of attendance.'],
  ['Companies and summits', 'Paid ticket tiers, session check-in and recordings for the people who came.'],
  ['Concerts and cultural events', 'E-tickets, scanning at every gate with pass-outs, and an after-show page.'],
];

const aed = TICKET_FEE.schedule.AED;
const FAQ: [string, string][] = [
  ['Can you handle government and medical events?', 'Yes. Admins, content editors and check-in staff each get their own role, and every change is recorded in an activity log. For medical events, zemmz Live calculates CME points and prints them on each certificate. Your accrediting body still accredits the activity.'],
  ['What do we need at the door?', 'A phone, tablet or laptop at each entrance. Any barcode scanner works, and staff can type an ID if a badge is damaged.'],
  ['Can the website be in Arabic?', 'Yes. Event websites can be in Arabic, English or both, with a language switch for visitors.'],
  ['Do you support us on the day?', 'Every plan includes support on event days. Government and enterprise plans can have our team on site.'],
  ['How does pricing work for free events?', `If registration is free, you pay the licence and nothing per attendee, however many people come. Paid tickets add ${TICKET_FEE.rate * 100}% plus AED ${aed.fixed} a ticket, capped at AED ${aed.cap}, which you can absorb or pass to the buyer at checkout.`],
];

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="z">
      <MarketingNav signedIn={!!user} />
      <main>
        <section className="zhero">
          <div className="w">
            <div>
              <h1>Your event, run properly.</h1>
              <p className="lede">Registration or ticketing, check-in at the door, and certificates or follow-up afterwards. One system your team can run without training.</p>
              <div className="ctas">
                <Link className="zb p" href="/contact?about=demo">Book a demo</Link>
                <Link className="zb s" href="/signup">Start free trial</Link>
              </div>
              <p className="fine">Free for your first {TRIAL_ATTENDEES} attendees.</p>
            </div>
            <div className="zframe" aria-label="Example of the organiser dashboard">
              <div className="hd"><span className="mk">NHF</span><span><b>National Health Forum 2026</b><small>Example event</small></span><span className="st">Live</span></div>
              <div className="kp"><div><b>1,248</b><span>Registered</span></div><div><b>986</b><span>Checked in</span></div><div><b>612</b><span>Certificates</span></div></div>
              <div className="qs">
                <h4>What the event website shows</h4>
                <div className="row"><span><b>Registration</b><small>Closed after the last session</small></span><span className="ztog" /></div>
                <div className="row"><span><b>Certificates</b><small>Only people who checked in can claim</small></span><span className="ztog on" /></div>
                <div className="row"><span><b>Maintenance mode</b><small>Hides the website while you edit</small></span><span className="ztog" /></div>
              </div>
            </div>
          </div>
        </section>

        <section className="zs" id="how">
          <div className="w">
            <div className="hdg"><h2>How it works</h2><p>The same three stages for every event, controlled from one dashboard.</p></div>
            <ol className="zhow">
              {HOW.map(([ic, n, h, p, items], i) => (
                <li className="zstep" key={n}>
                  <div className="top"><span className="ic"><I n={ic} s={26} /></span><span className="n">Step {i + 1} · {n}</span></div>
                  <h3>{h}</h3>
                  <p>{p}</p>
                  <ul>{items.map((x) => <li key={x}><I n="check" s={16} />{x}</li>)}</ul>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="zs m" id="who">
          <div className="w zwho">
            <div className="hdg"><h2>Built for organisations that can’t get it wrong</h2><p>Choose the type of event when you set up. zemmz Live switches on the right tools and uses the right words.</p></div>
            <ul>{WHO.map(([a, b]) => <li key={a}><b>{a}</b><span>{b}</span></li>)}</ul>
          </div>
        </section>

        <section className="zs" id="pricing">
          <div className="w">
            <div className="hdg"><h2>Pricing</h2><p>Every plan includes the event website, registration, check-in and certificates. Prices in AED, excluding VAT.</p></div>
            <div className="zpr">
              {PLANS.map((p, i) => (
                <div key={p.key}>
                  <h3>{p.name}</h3>
                  <p className="pr">{p.price} <small>{p.per}</small></p>
                  <p>{p.blurb}</p>
                  {p.key === 'ENTERPRISE' ? <Link className="zb p sm" href="/contact?about=enterprise">Talk to us</Link> : <Link className={`zb ${i === 2 ? 'p' : 's'} sm`} href={`/signup?plan=${p.key.toLowerCase()}`}>Start free trial</Link>}
                </div>
              ))}
            </div>
            <p className="zpnote">Free registration costs nothing per attendee. Paid tickets add {TICKET_FEE.rate * 100}% plus AED {aed.fixed} a ticket, capped at AED {aed.cap}, so an expensive ticket never costs you more than a cheap one. Card fees are charged by your payment provider.</p>
          </div>
        </section>

        <section className="zs m" id="faq">
          <div className="w zfaq">
            <div className="hdg" style={{ margin: 0 }}><h2>Questions</h2><p>Anything else, <Link href="/contact">get in touch</Link>.</p></div>
            <div>{FAQ.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}</summary><p>{a}</p></details>)}</div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
