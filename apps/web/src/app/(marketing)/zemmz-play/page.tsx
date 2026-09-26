import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, TICKET_FEE } from '@zemmz/shared';
import { getCurrentUser } from '@/lib/auth';
import { PLAY_PLANS, PLAY_TRIAL_DAYS } from '@/lib/plans';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';

export const metadata: Metadata = {
  title: { absolute: 'zemmz Play: tournament websites and brackets for esports organisers' },
  description: 'A branded tournament website in English and Arabic, with player sign-up, brackets, score reports by screenshot, standings and prizes.',
};

const P = {
  check: 'm5 12.5 4.5 4.5L19 7.5',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  bracket: 'M4 5h5v4H4zM4 15h5v4H4zM9 7h3v10H9M12 12h3M15 10h5v4h-5z',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01',
};
const I = ({ n, s = 18 }: { n: keyof typeof P; s?: number }) => (
  <svg className="i" viewBox="0 0 24 24" style={{ width: s, height: s }} aria-hidden="true"><path d={P[n]} /></svg>
);

const HOW: [keyof typeof P, string, string, string, string[]][] = [
  ['globe', 'Your website', 'Launch a league website in an afternoon.', 'Your name, colours and logo, in English and Arabic. Players sign up with a code sent to their email or phone: no passwords to forget.', ['English and Arabic, right to left', 'Rules, FAQ and sponsors', 'Your colours, contrast-checked']],
  ['bracket', 'Your tournaments', 'Run any format from one dashboard.', 'Single and double elimination, round robin and Swiss, solo or teams. Seeds, check-in, entry fees and eligible countries are set per tournament.', ['Brackets built for you', 'Team codes for captains', 'Paid or free entry']],
  ['image', 'Results', 'Players report, you confirm.', 'Both sides upload a screenshot of the result screen. You see them side by side, with mismatched scores flagged, and one click moves the bracket on.', ['Screenshots side by side', 'Ask for a clearer one', 'Standings and prizes']],
];

const FAQ: [string, string][] = [
  ['Which games can we run?', 'Any game with a result screen. Valorant, EA Sports FC, Tekken, Rocket League, Call of Duty, League of Legends, Overwatch and Mobile Legends have their own artwork; anything else works as another game.'],
  ['How do players sign in?', 'With a six-digit code sent to their email, or by text message to their phone where SMS is set up. Each website has its own players, so your community stays yours.'],
  ['Can we charge an entry fee?', `Yes. Players pay by card on a secure page and the place is held while they pay. The zemmz fee is ${TICKET_FEE.rate * 100}% plus a small fixed amount, capped, and is added on top for the player. We pay entry fees out to you every week.`],
  ['How are prizes paid?', 'You pay winners directly. When the final is confirmed, zemmz Play lists the winners with their contact details, and you record each payment reference so there’s a trail.'],
  ['What happens when a plan ends?', 'The websites go offline until someone renews. Nothing is deleted for 60 days, so you can pick up where you left off.'],
];

export default async function PlayMarketing() {
  const user = await getCurrentUser();
  return (
    <div className="z">
      <MarketingNav signedIn={!!user} />
      <main>
        <section className="zhero">
          <div className="w">
            <div>
              <h1>Your league, online. Brackets that run themselves.</h1>
              <p className="lede">A branded tournament website in English and Arabic, with player sign-up, brackets, score reports by screenshot, standings and prizes.</p>
              <div className="ctas">
                <Link className="zb p" href={user ? '/play' : '/signup?plan=play'}>{user ? 'Open zemmz Play' : 'Start free trial'}</Link>
                <Link className="zb s" href="/contact?about=play">Talk to us</Link>
              </div>
              <p className="fine">{PLAY_TRIAL_DAYS} days of the Season plan, free, from your first website.</p>
            </div>
            <div className="zframe" aria-label="Example of a bracket in zemmz Play">
              <div className="hd"><span className="mk">GEL</span><span><b>Valorant Open</b><small>Example tournament</small></span><span className="st">Live</span></div>
              <div className="qs">
                <h4>Semifinals</h4>
                <div className="row"><span><b>Kuwait Falcons 2 – 1 Dubai Vipers</b><small>Both captains reported the same score</small></span><span className="st">Confirmed</span></div>
                <div className="row"><span><b>Riyadh Rush vs Doha Dragons</b><small>Scores don’t match: review the screenshots</small></span><span className="st" style={{ color: '#9A5B00' }}>To review</span></div>
                <h4 style={{ marginTop: 14 }}>Final</h4>
                <div className="row"><span><b>Kuwait Falcons vs winner of semifinal 2</b><small>Best of five</small></span><span className="st" style={{ color: '#737290' }}>Next</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="zs" id="how">
          <div className="w">
            <div className="hdg"><h2>How it works</h2><p>From the first sign-up to paying the winners.</p></div>
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

        <section className="zs m" id="pricing">
          <div className="w">
            <div className="hdg"><h2>Pricing</h2><p>Monthly, or save about 20% by paying for the year. Prices in AED, excluding VAT.</p></div>
            <div className="zpr">
              {PLAY_PLANS.map((p, i) => (
                <div key={p.key}>
                  <h3>{p.name}</h3>
                  <p className="pr">{p.price} <small>{p.per}</small></p>
                  {p.yearlyPerMonthMinor && <p className="fine" style={{ margin: '-6px 0 8px' }}>{formatMoney(p.yearlyPerMonthMinor, 'AED')} a month paid yearly</p>}
                  <p>{p.blurb}</p>
                  {p.priceMinor == null ? <Link className="zb p sm" href="/contact?about=play">Talk to us</Link> : <Link className={`zb ${i === 1 ? 'p' : 's'} sm`} href="/signup?plan=play">Start free trial</Link>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="zs" id="faq">
          <div className="w zfaq">
            <div className="hdg" style={{ margin: 0 }}><h2>Questions</h2><p>Anything else, <Link href="/contact?about=play">get in touch</Link>.</p></div>
            <div>{FAQ.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}</summary><p>{a}</p></details>)}</div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
