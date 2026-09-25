import type { EventTypeDef } from '@zemmz/shared';

export type TourId = 'dash' | 'checkin' | 'regs' | 'certs' | 'form';

export interface Article {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  tip?: string;
  tour?: TourId;
}

export interface HelpCategory {
  name: string;
  icon: 'cal' | 'scan' | 'award';
  articles: Article[];
}

/**
 * The help centre: three stages, one guide per task (live-dashboard.html,
 * helpData). Words come from the event type, and each step names the
 * button as it appears on screen.
 */
export function helpData(t: EventTypeDef, paid: boolean): HelpCategory[] {
  const concert = t.gates;
  const form = paid ? 'Checkout form' : 'Registration form';
  return [
    {
      name: 'Before the event',
      icon: 'cal',
      articles: [
        { id: 'setup', title: 'Set up your event website', summary: 'Homepage text, venue, menu and colours.', steps: ['Go to Website → General and write a short homepage introduction.', 'Add the venue name, address and phone on the Venue tab. The venue page doubles as your contact page.', 'On the Theme tab, upload your logo and pick your event colour. Button text switches automatically if the colour is too light.', 'Edit or add pages on the Pages tab, then choose which appear in the website menu on the Menu tab.'] },
        { id: 'tickets', title: paid ? 'Set up tickets and prices' : 'Set up registration places', summary: 'Ticket types, capacity and promo codes.', steps: [`Go to Tickets and add a type for each kind of ${t.guest.toLowerCase()}.`, 'Set a price (0 for free) and how many are available. Leave it empty for no limit.', 'Turn a ticket on or off sale at any time with its switch.', 'Create promo codes for partners or early birds on the Promo codes tab.'], tip: 'A ticket type stops selling on its own when it sells out.' },
        { id: 'schedule', title: concert ? 'Set up the gates' : `Build the ${t.credits ? 'session schedule' : 'agenda'}`, summary: concert ? 'Entrances, opening times and which tickets each accepts.' : `${t.unit}s, times, rooms${t.credits ? ' and CME points' : ''}.`, steps: [`Go to ${t.ckNav} and click Add ${t.unit.toLowerCase()}.`, concert ? 'Give the gate a name, the time it opens and closes, and the ticket type it accepts.' : `Enter the title, day, start and end time, ${t.chair.toLowerCase()} and room.`, ...(t.credits ? ['Set the CME points for each session. Use 0 for breaks.'] : []), 'Add a capacity if scans should stop when the room is full.'], tip: concert ? 'A gate can close after midnight: enter a closing time earlier than the opening time.' : `The public ${t.credits ? 'Sessions' : 'Agenda'} page updates straight away.` },
        { id: 'form', title: `Customise the ${form.toLowerCase()}`, summary: 'Choose which fields appear and which are required.', tour: 'form', steps: [`Go to Website → ${form}.`, 'Turn fields on or off with Shown, and decide which are Required.', 'Use Edit to rename a field or change dropdown options, one per line.', 'Add your own fields with Add field.', `Locked fields are needed for ${t.badge}s and emails, so they can’t be removed.`], tip: `Every ${t.one} gets a unique ID automatically. It’s printed on the ${t.badge} and scanned at the door.` },
        { id: 'mail', title: 'Write the confirmation email', summary: 'The email everyone receives straight away.', steps: ['Go to Messages → Confirmation email.', 'Edit the subject and message. Insert tags such as {first_name} or {registration_id}.', 'Check the preview on the right, then click Send me a test to see it in your inbox.', 'Save it. New registrations get this version.'] },
        { id: 'people', title: concert ? 'Add the line-up' : `Add ${t.people.toLowerCase()}`, summary: concert ? 'Artists, set times and biographies.' : 'Names, biographies and photos.', steps: [`Go to ${t.people} and click Add ${t.person}.`, `Enter the name, biography and category.${concert ? ' Add their set time.' : ''}`, 'Save, then click Edit to upload a photo.', 'Choose whether they also appear on the homepage.'] },
        { id: 'team', title: 'Invite your team', summary: 'Admins, content editors and check-in staff.', steps: ['Go to People and plan (from All events) and click Invite.', 'Enter their email and choose a role. Check-in staff only see the check-in console.', 'They get an email with a link that works for 7 days.', 'Change a role or remove access at any time from the same page.'] },
      ],
    },
    {
      name: 'On the day',
      icon: 'scan',
      articles: [
        { id: 'checkin', title: concert ? 'Scan tickets at the gates' : 'Check people in and out', summary: concert ? 'Every gate on its own device, with live counts.' : t.credits ? 'Scan badges so time in the room becomes CME points.' : 'Scan badges at each session door.', tour: 'checkin', steps: [`Go to ${t.ckNav} and open the ${t.unit.toLowerCase()}.`, `Choose ${t.inLbl}. Scan the barcode or type the ID and press Enter.`, `Green means done, amber warns about a repeat scan, red means the ID wasn’t found${concert ? ' or the ticket is for another gate.' : '.'}`, `As people leave, switch to ${t.outLbl} and scan again.`, `The counters show how many are ${t.roomLbl.toLowerCase()}.`], tip: concert ? 'Guests who scan out can come back in, unless pass-outs are off in Settings.' : 'If someone forgets to scan out, they’re counted until the session ends.' },
        { id: 'badges', title: `Find someone and print their ${t.badge}`, summary: 'Search, fix details and print.', tour: 'regs', steps: [`Go to ${t.regs}. Search by name, ID, email or mobile. Results update as you type.`, `Open a person and click Print ${t.badge} to see the barcode, then print.`, 'On their record you can correct details and see their attendance.', 'Tick several people in the list and click Print selected to print together.'], tip: `Add walk-ins with ${t.register}. They get the next ID.` },
        { id: 'toggles', title: 'Control what the homepage shows', summary: `${t.openLbl}, ${t.afterLbl.toLowerCase()} and maintenance mode.`, tour: 'dash', steps: ['On the Dashboard, use Quick settings.', `${t.openLbl} shows the ${paid ? 'ticket checkout' : 'sign-up form'} on the homepage.`, `${t.afterLbl} replaces it once the event is over.`, 'Maintenance mode hides the whole website while you make changes.', 'The preview next to the switches shows what visitors see right now.'] },
        { id: 'raffle', title: `Run a ${t.raffle.toLowerCase()}`, summary: 'Pick a random winner from people who came.', steps: [`Go to ${t.raffle} and name the prize.`, 'Choose who’s in the draw.', 'Leave out previous winners if you’re drawing several prizes.', 'Click Pick a random name, then Show full screen.'] },
      ],
    },
    {
      name: 'After the event',
      icon: 'award',
      articles: [
        t.cert === 'none'
          ? { id: 'after', title: `Open the ${t.afterLbl.toLowerCase()}`, summary: concert ? 'Photos and a short survey for guests.' : 'Recordings, slides and photos for attendees.', steps: [`Go to ${t.certNav} and choose what to show.`, 'Decide whether only people who came can open it.', concert ? 'Upload photos at the bottom of the page.' : 'Paste recording links, upload slides as PDFs and add photos at the bottom of the page.', 'Turn it on. The homepage switches over straight away.'] }
          : { id: 'certs', title: 'Issue certificates', summary: t.credits ? 'Let delegates download certificates with their CME points.' : 'Certificates of attendance for people who came.', tour: 'certs', steps: [t.credits ? 'Go to Certificates & CME and choose how points are earned: time in the room, or checking in.' : `Go to ${t.certNav} and choose how many sessions people must attend.`, 'Edit the certificate template and check the preview.', 'Turn on Certificate issuing. The homepage switches to the claim form.', 'People enter their ID and email and download their certificate. People who never checked in are turned away.'] },
        { id: 'eval', title: t.credits ? 'Read the evaluation report' : 'Read the feedback', summary: t.credits ? 'What delegates thought, based on the KIMS form.' : 'Ratings, ticked statements and comments.', steps: [`Go to ${t.evalNav} → Report.`, 'Use Form builder to add, edit, reorder or remove questions.', 'Click Export CSV for every response.'] },
        { id: 'export', title: 'Export lists', summary: `${t.regs}, attendance and feedback.`, steps: [`${t.regs}: Export CSV exports the list with the filters you’ve chosen.`, `${t.ckNav}: Export attendance has every scan in and out, with times in the event’s timezone.`, `${t.evalNav}: Export CSV has one row per response.`] },
      ],
    },
  ];
}

export interface TourStep { path: string; sel: string; title: string; text: string }

/** On-screen tours: each step highlights one thing on a real page. */
export function tourSteps(id: TourId, t: EventTypeDef, base: string, consolePath: string | null, paid: boolean): TourStep[] {
  switch (id) {
    case 'dash':
      return [
        { path: base, sel: '[data-tour=kpis]', title: 'Your numbers', text: 'Sales, check-ins and who’s here, updated as it happens.' },
        { path: base, sel: '[data-tour=quick]', title: 'Quick settings', text: 'These switches control what the homepage shows, with a preview of the result.' },
        { path: base, sel: '[data-tour=today]', title: 'Today', text: `Open any ${t.unit.toLowerCase()} to start scanning.` },
        { path: base, sel: '[data-tour=chart]', title: 'The last 14 days', text: `${t.regs} per day, in the event’s timezone.` },
      ];
    case 'checkin':
      return consolePath
        ? [
            { path: consolePath, sel: '[data-tour=mode]', title: 'In or out', text: `Pick the direction: ${t.inLbl.toLowerCase()} or ${t.outLbl.toLowerCase()}.` },
            { path: consolePath, sel: '[data-tour=scan]', title: 'Scan here', text: 'Use a barcode scanner, or type the ID and press Enter.' },
            { path: consolePath, sel: '[data-tour=feedback]', title: 'Instant feedback', text: 'Green means done. Amber warns about repeats. Red means the ID wasn’t found.' },
            { path: consolePath, sel: '[data-tour=counts]', title: 'Live counts', text: `How many came in, and how many are ${t.roomLbl.toLowerCase()}.` },
          ]
        : [{ path: `${base}/check-in`, sel: 'main h1', title: `No ${t.units} yet`, text: `Add a ${t.unit.toLowerCase()} first, then the tour can show the console.` }];
    case 'regs':
      return [
        { path: `${base}/registrations`, sel: '[data-tour=search]', title: 'Search in real time', text: 'Type a name, ID, email or mobile number. Filters narrow the list.' },
        { path: `${base}/registrations`, sel: '[data-tour=table]', title: 'Everyone, with attendance', text: `Open a name to edit details, see attendance and print their ${t.badge}. Tick several to print together.` },
      ];
    case 'certs':
      return [
        { path: `${base}/certificates`, sel: '[data-tour=rules]', title: t.credits ? 'How points are earned' : 'Who can claim', text: t.credits ? 'By time in the room, or simply by checking in.' : 'How many sessions people must attend.' },
        { path: `${base}/certificates`, sel: '[data-tour=issuing]', title: 'Turn on issuing', text: 'The homepage switches to the certificate claim form.' },
        { path: `${base}/certificates`, sel: '[data-tour=certpreview]', title: 'Certificate preview', text: t.credits ? 'Each certificate shows the person’s own points.' : 'Exactly what people download.' },
      ];
    case 'form':
      return [
        { path: `${base}/website?tab=form`, sel: '[data-tour=fields]', title: 'Your form fields', text: 'Show or hide fields, make them required, reorder them and edit dropdown options.' },
        { path: `${base}/website?tab=form`, sel: '[data-tour=preview]', title: 'Live preview', text: `What visitors see on the ${paid ? 'checkout' : 'registration form'}.` },
      ];
  }
}
