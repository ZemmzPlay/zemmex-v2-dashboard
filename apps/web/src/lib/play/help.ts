import type { TourStep } from '@/lib/help';

/**
 * zemmz Play's help centre: short guides, and on-screen tours that highlight
 * the real controls (from the prototype's TOURS).
 */
export interface PlayGuide { id: string; title: string; summary: string; steps: string[]; tour?: TourStep[] }

export function playGuides(base: string): { group: string; guides: PlayGuide[] }[] {
  return [
    {
      group: 'Getting started',
      guides: [
        {
          id: 'dashboard', title: 'Find your way around', summary: 'The numbers on your dashboard and where work is waiting.',
          steps: ['Open Dashboard in the sidebar.', 'The top row compares the last 30 days with the 30 before.', 'Needs your attention lists score reports, players to verify and registrations closing soon. Click one to go straight to it.'],
          tour: [
            { path: base, sel: '[data-tour="kpis"]', title: 'Your numbers', text: 'New players, registered players, live tournaments and score reports waiting, with the change against the previous 30 days.' },
            { path: base, sel: '[data-tour="attention"]', title: 'Needs your attention', text: 'Work waiting for you. Click any item to go straight to it.' },
            { path: base, sel: '[data-tour="live"]', title: 'Live tournaments', text: 'What’s running now, with the round and how full each one is.' },
            { path: `${base}/help`, sel: '[data-tour="help"]', title: 'Help is always here', text: 'Come back to Help for these guides and tours.' },
          ],
        },
        {
          id: 'create', title: 'Create a tournament', summary: 'Game, schedule, rules and prizes in four steps.',
          steps: ['Go to Tournaments and choose New tournament.', 'Pick the game and format, then the dates in your timezone.', 'Choose who can take part and how results are reported.', 'Add an entry fee and prizes if there are any, then create and publish it. Registration opens on its dates.'],
          tour: [
            { path: `${base}/tournaments/new`, sel: '.wiz .steps', title: 'Four steps', text: 'Game, schedule, rules and prizes. You can go back to any step; nothing you typed is lost.' },
            { path: `${base}/tournaments/new`, sel: '.opt-cards', title: 'Pick the game', text: 'Choose the game players compete in. Each has its own artwork on the website.' },
            { path: `${base}/tournaments/new`, sel: '.wiz-nav', title: 'Save as draft or publish', text: 'Drafts stay off the website while you finish them.' },
          ],
        },
      ],
    },
    {
      group: 'Running tournaments',
      guides: [
        {
          id: 'scores', title: 'Confirm score reports', summary: 'Check the screenshots and move the bracket on.',
          steps: ['Open Tournaments, then Score reports.', 'Pick a report. Screenshots from both sides are side by side; different scores are flagged.', 'Type the score the screenshot shows. The line underneath says who goes through.', 'Confirm, or ask both sides for a clearer screenshot.'],
          tour: [
            { path: `${base}/tournaments?tab=reports`, sel: '.rq', title: 'Score reports', text: 'Every screenshot players upload lands here. Mismatched scores are marked in red.' },
            { path: `${base}/tournaments?tab=reports`, sel: '.shots', title: 'Check the screenshots', text: 'Open a screenshot full size to read it. Each shows who sent it and what they reported.' },
            { path: `${base}/tournaments?tab=reports`, sel: '.verdict', title: 'Enter the real score', text: 'Type the score the screenshot shows. We tell you who wins before you confirm, and the bracket updates straight away.' },
          ],
        },
        {
          id: 'schedule', title: 'Set match times', summary: 'Tell players when to play.',
          steps: ['Open a live tournament and choose Bracket.', 'Under a match, choose Set a time.', 'Pick the date and time, or tick the box to use it for the whole round. Players are emailed the time and see it in My matches.'],
        },
        {
          id: 'standings', title: 'Add standings', summary: 'Tables for groups played elsewhere or a season ranking.',
          steps: ['Open Tournaments, then Standings, and choose Add standings.', 'Paste the rows: name, played, won, lost, points.', 'Choose how many rows go through, and whether to show it on the website.'],
        },
      ],
    },
    {
      group: 'Players and your website',
      guides: [
        {
          id: 'players', title: 'Verify and manage players', summary: 'Verification, the blacklist and correcting details.',
          steps: ['Open Players. Filter by Awaiting review to see new accounts.', 'Verify players you’ve checked; some tournaments are open to verified players only.', 'Blacklisting signs a player out and withdraws them from tournaments that haven’t started.'],
          tour: [
            { path: `${base}/players`, sel: '.toolbar', title: 'Search and filter', text: 'Filter by verification, country or tournament. Search works with gamer tags, emails and phone numbers.' },
            { path: `${base}/players`, sel: '.tbl', title: 'Row actions', text: 'Verify, reject, correct details or blacklist a player from their row.' },
          ],
        },
        {
          id: 'theme', title: 'Change the website’s look', summary: 'Typefaces and colours, with readability checks.',
          steps: ['Open Website, then Theme.', 'Choose English and Arabic typefaces; each option shows in its own style.', 'Adjust the colours of each section. Anything hard to read is flagged; Fix all contrast corrects it.', 'Save. The website changes straight away.'],
          tour: [
            { path: `${base}/website?tab=theme`, sel: '[data-tour="fonts"]', title: 'Typefaces', text: 'Choose English and Arabic fonts. Each option is shown in its own style.' },
            { path: `${base}/website?tab=theme`, sel: '[data-tour="colours"]', title: 'Colours for each section', text: 'Every text colour is checked against its background. Fix corrects one pair; Fix all contrast corrects them all.' },
            { path: `${base}/website?tab=theme`, sel: '[data-tour="preview"]', title: 'Live preview', text: 'See your changes before you save, in English and Arabic.' },
          ],
        },
        {
          id: 'signin', title: 'Choose how players sign in', summary: 'Email or text message codes, Google and Discord.',
          steps: ['Open Website, then Sign-in.', 'Turn on the ways you want. Google and Discord show once they’re set up on the server.', 'Players who already have an account are matched by their email address.'],
        },
        {
          id: 'domain', title: 'Use your own domain', summary: 'play.yourleague.com instead of the zemmz address.',
          steps: ['Open Settings, then Web address.', 'Enter the domain and add the two DNS records shown.', 'Choose Check the records. Once connected, sign-in, payments and emails use your domain.'],
        },
        {
          id: 'people', title: 'Give someone access to one website', summary: 'An admin for one league, a moderator for another.',
          steps: ['Invite them to your organisation from People and plan.', 'On the website, open Settings, then People, and choose Change next to their name.', 'Pick a role for this website only, or No access to hide it from them.'],
          tour: [
            { path: `${base}/settings?tab=people`, sel: '.tbl', title: 'People on this website', text: 'Everyone in your organisation, their organisation role, and any role you’ve given them here.' },
          ],
        },
      ],
    },
  ];
}
