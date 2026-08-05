/**
 * ===========================================================================
 *  ALL WEBSITE CONTENT LIVES IN THIS FILE
 * ===========================================================================
 *
 *  Every heading, paragraph, list item, contact detail and menu label on the
 *  public website comes from here. To change what the site says, edit this
 *  file — you do not need to touch any page or component.
 *
 *  How to edit safely:
 *    • Change only the text between the quote marks: 'like this'.
 *    • Keep the punctuation — the commas, brackets and braces are structure.
 *    • If your text contains an apostrophe, write it as \' or use ’ instead:
 *        WRONG:  'the club\s history'        RIGHT: 'the club’s history'
 *    • Save the file; the browser updates within a second.
 *    • If the page goes blank, undo your last change — a comma or bracket
 *      was almost certainly removed.
 *
 *  A guided walkthrough of each section is in docs/06-editing-the-website.md.
 *
 *  ---------------------------------------------------------------------------
 *  IMPORTANT: this file ships with PLACEHOLDER content.
 *
 *  Committee names, member quotes, dates, addresses and fees are placeholders,
 *  not facts about your club. Replace them with real information before the
 *  site goes live. While `contentStatus` below is 'placeholder', a reminder
 *  banner appears during local development (never to real visitors).
 *  ---------------------------------------------------------------------------
 */

/** Flip to 'reviewed' once a human has checked every word below. */
export const contentStatus: 'placeholder' | 'reviewed' = 'placeholder'

// ===========================================================================
//  1. CLUB IDENTITY  —  name, tagline, contact details, social links
//     Used by: header, footer, contact page, page titles, emails
// ===========================================================================

export const club = {
  /** Full legal name of the club. */
  name: 'New Milani Sangha Club',
  /** Short form for tight spaces such as the mobile header. */
  shortName: 'Milani Sangha',
  /** One line under the name in the hero. Keep it under about 90 characters. */
  tagline: 'Together in sport, culture and service',

  /** Year the club was founded. Set to null to hide it everywhere. */
  establishedYear: '2015',
  /** Registration or society number. Set to null to hide it. */
  registrationNumber: '50219',

  /**
   * CLUB LOGO.
   *
   * Put the image file in  frontend/public/brand/  and reference it from the
   * site root — a file saved as
   *     frontend/public/brand/logo.png
   * is written here as
   *     src: '/brand/logo.png'
   *
   * PNG with a transparent background, or SVG, works best. Roughly 512px square
   * is plenty. See docs/06-editing-the-website.md for the full walkthrough,
   * including how to generate the phone app icons from the same file.
   */
  logo: {
    // logo_web.png is a 512px transparent copy of logo_1.png — 313 KB rather
    // than 1.6 MB, which matters because it loads on every page.
    //
    // Do NOT point this at logo.png: that file has no alpha channel and carries
    // the transparency chequerboard baked in as real grey pixels, so it renders
    // as a chequered square behind the badge. logo_1.png is the master; keep it.
    src: '/brand/logo_web.png',
    /**
     * HOW BIG THE LOGO APPEARS, in the header and footer. One of:
     *     'sm'  'md'  'lg'  'xl'  '2xl'
     * The header grows taller to fit, so nothing is cut off.
     *
     * If the logo still looks small at '2xl', the image itself probably has
     * empty space around the artwork — crop that margin out of the file and it
     * will fill the space. No setting here can enlarge blank padding.
     */
    size: 'lg',
    /**
     * Set to false if your logo image already contains the club's name, so the
     * name is not printed twice beside it.
     */
    showNameBeside: true,
    /**
     * A rounded plate with a soft shadow suits a square badge or monogram.
     * Set to false for a wide logo, or one with a transparent background that
     * should sit directly on the page.
     *
     * false here because the club's logo is a circular badge on a transparent
     * background: a rounded square plate with a shadow behind a circle shows the
     * plate's corners around it.
     */
    rounded: false,
  },

  /** Two or three sentences. Appears in the footer and on the About page. */
  summary:
    'Milani Sangha Club is a member-run community club. We organise sporting fixtures, cultural events and service activities through the year, and we welcome new members from the neighbourhood and beyond.',

  contact: {
    /** Street address, one line per array entry. */
    addressLines: ['Bhagini Nivedita Sarani', 'Nona Chandan Pukur'
      ,'Barrackpore,'
    ],
    city: 'Kolkata',
    state: 'West Bengal,',
    postcode: '700122',
    /** Leave any of these as an empty string to hide that row. */
    phone: '',
    whatsapp: '',
    email: '',
    /** Free text — shown on the contact page. */
    officeHours: 'Monday to Saturday, 5 p.m. to 8 p.m.',
  },

  /** Leave a URL empty to hide that icon. */
  social: {
    facebook: '',
    instagram: '',
    youtube: '',
    x: '',
  },

  /**
   * Google Maps.
   *
   * `directionsUrl` is a normal Google Maps link and is always safe to set.
   *
   * `embedUrl` puts an interactive map inside the page. It is empty by default
   * on purpose: an embedded map loads Google's scripts and cookies for every
   * visitor, which is a privacy decision the club should make consciously
   * rather than inherit. Until it is set, the contact page shows a tidy panel
   * with a link out to Maps instead.
   *
   * To enable: Google Maps → find the club → Share → Embed a map → copy the
   * src="..." value out of the iframe code and paste it here.
   */
  map: {
    directionsUrl: '',
    embedUrl: '',
  },
}
// Note: deliberately not `as const`. With literal types, an empty string like
// `phone: ''` narrows to the type `''`, and `club.contact.phone ? … : null`
// would then be a type error rather than a runtime check. Plain strings keep
// "leave it blank to hide this row" working.

// ===========================================================================
//  2. NAVIGATION  —  the menu in the header
//     Remove an entry to hide that page from the menu (the page still exists).
//     Reorder entries to reorder the menu.
// ===========================================================================

export interface NavItem {
  label: string
  to: string
  /** Optional dropdown. A parent with children is not itself clickable. */
  children?: ReadonlyArray<{ label: string; to: string; description?: string }>
}

export const nav: ReadonlyArray<NavItem> = [
  { label: 'Home', to: '/' },
  {
    label: 'About',
    to: '/about',
    children: [
      { label: 'About the club', to: '/about', description: 'Who we are and what we do' },
      { label: 'Mission & vision', to: '/mission-vision', description: 'What we are working towards' },
      { label: 'Our history', to: '/history', description: 'How the club came to be' },
      { label: 'Executive committee', to: '/committee', description: 'The office bearers' },
    ],
  },
  { label: 'Membership', to: '/membership' },
  { label: 'Events', to: '/events' },
  { label: 'Gallery', to: '/gallery' },
  { label: 'News', to: '/news' },
  { label: 'Documents', to: '/documents' },
  { label: 'Contact', to: '/contact' },
]

// ===========================================================================
//  3. HOME PAGE
// ===========================================================================

export const home = {
  /** The large banner at the top of the home page. */
  hero: {
    eyebrow: 'Community club',
    title: 'A club built by its members',
    lead: 'Sporting fixtures, cultural evenings and service work — organised through the year by members, for members and for the neighbourhood around us.',
    primaryCta: { label: 'Become a member', to: '/membership' },
    secondaryCta: { label: 'See what’s on', to: '/events' },
    /**
     * The three figures under the banner. Replace with real numbers, or delete
     * an entry to show fewer. An empty array hides the row entirely.
     */
    stats: [
      { value: '—', label: 'Members' },
      { value: '—', label: 'Events a year' },
      { value: '—', label: 'Years serving the area' },
    ],
  },

  /** The "what we do" band under the banner. */
  intro: {
    eyebrow: 'What we do',
    title: 'Three things the club exists for',
    lead: 'Everything the committee organises falls into one of these.',
    pillars: [
      {
        icon: 'trophy',
        title: 'Sport',
        body: 'Regular fixtures, inter-club tournaments and coaching for younger members through the season.',
      },
      {
        icon: 'sparkles',
        title: 'Culture',
        body: 'Festival celebrations, music and drama evenings, and an annual cultural programme open to families.',
      },
      {
        icon: 'heart',
        title: 'Service',
        body: 'Blood donation drives, health camps and neighbourhood clean-ups run with local partners.',
      },
    ],
  },

  /** Section headings on the home page. The content beneath comes from
   *  sections 7 (events), 8 (news) and 9 (gallery) further down this file. */
  sections: {
    events: {
      eyebrow: 'Diary',
      title: 'Coming up',
      lead: 'Members can register through the portal once signed in.',
      cta: { label: 'All events', to: '/events' },
    },
    news: {
      eyebrow: 'Notice board',
      title: 'Latest news',
      lead: 'Announcements and circulars from the committee.',
      cta: { label: 'All news', to: '/news' },
    },
    gallery: {
      eyebrow: 'Gallery',
      title: 'Moments from the club',
      lead: 'Photographs and video from recent events.',
      cta: { label: 'Open the gallery', to: '/gallery' },
    },
    testimonials: {
      eyebrow: 'In their words',
      title: 'What members say',
      lead: '',
    },
    sponsors: {
      eyebrow: 'With thanks',
      title: 'Our supporters',
      lead: 'Local businesses and well-wishers who help make the club’s work possible.',
    },
  },

  /** The closing call to action above the footer. */
  join: {
    title: 'Join the club',
    lead: 'Membership is open to residents of the area and to anyone who shares what the club stands for. Applications are reviewed by the committee.',
    primaryCta: { label: 'Membership types and fees', to: '/membership' },
    secondaryCta: { label: 'Ask a question', to: '/contact' },
  },
}

// ===========================================================================
//  4. ABOUT PAGE
// ===========================================================================

export const about = {
  eyebrow: 'About us',
  title: 'A member-run club with a long view',
  lead: 'The club is run entirely by its members. Every office bearer is elected, every account is presented to the general body, and every major decision is taken in the open.',
  /** Each entry becomes a paragraph. Add or remove entries freely. */
  paragraphs: [
    'Describe the club here: where it operates, who it serves, and what a typical year looks like. Two or three paragraphs is plenty — visitors who want detail will read the constitution on the Documents page.',
    'Mention the facilities members can use, the fixtures the club competes in, and the community work it takes on. Keep it concrete: specifics build more trust than adjectives.',
  ],
  /** The values band. Delete entries to show fewer. */
  values: [
    {
      title: 'Run in the open',
      body: 'Accounts, minutes and decisions are published to members. Anyone may ask a question at the general body meeting.',
    },
    {
      title: 'Open to all',
      body: 'Membership does not turn on background, profession or means. The committee reviews every application on the same terms.',
    },
    {
      title: 'Rooted locally',
      body: 'The club’s first responsibility is the neighbourhood it sits in, and its service work starts there.',
    },
    {
      title: 'Built to last',
      body: 'Decisions are taken with the next generation of members in mind, not only the current committee’s term.',
    },
  ],
}

// ===========================================================================
//  5. MISSION & VISION PAGE
// ===========================================================================

export const missionVision = {
  eyebrow: 'Mission & vision',
  title: 'What we are working towards',
  lead: 'Our mission is what we do now. Our vision is what we intend the club to become.',
  mission: {
    title: 'Our mission',
    body: 'To give members of every age a place to play, perform and serve together — run transparently, funded fairly, and open to anyone in the neighbourhood who wants to take part.',
  },
  vision: {
    title: 'Our vision',
    body: 'A club that the next generation inherits in better condition than we found it: with proper facilities, healthy finances, and a habit of service that the wider area relies on.',
  },
  /** The numbered objectives. Add or remove entries freely. */
  objectives: [
    'Run a full calendar of sporting fixtures and coaching for younger members.',
    'Hold an annual cultural programme that families across the neighbourhood attend.',
    'Organise at least one health or service camp with local partners each year.',
    'Maintain and improve the club’s premises and equipment.',
    'Keep membership affordable, and accounts open to every member.',
    'Record the club’s history so it is not lost between committees.',
  ],
}

// ===========================================================================
//  6. HISTORY PAGE
//     Replace every year and milestone below with the club's real history.
// ===========================================================================

export const history = {
  eyebrow: 'Our history',
  title: 'How the club came to be',
  lead: 'Replace this timeline with the club’s own milestones. If exact years are uncertain, say so plainly rather than guessing — a club’s record is worth keeping accurate.',
  /** Shown oldest first. `year` may be a range such as '1998–2001'. */
  milestones: [
    { year: 'Year', title: 'The club is founded', body: 'Who started it, why, and where it first met.' },
    { year: 'Year', title: 'First premises', body: 'How the club came to have a ground or a building of its own.' },
    { year: 'Year', title: 'A milestone to record', body: 'A tournament won, an anniversary marked, a facility opened.' },
    { year: 'Year', title: 'Registration', body: 'When the club was formally registered, and under what name.' },
    { year: 'Today', title: 'Where things stand', body: 'Current membership, facilities and activities.' },
  ],
}

// ===========================================================================
//  7. EXECUTIVE COMMITTEE PAGE
//     These are PLACEHOLDERS. Do not publish invented names.
//
//  EACH OFFICE BEARER HAS FOUR THINGS YOU CAN FILL IN:
//
//    name   Their full name, as they would like it printed.
//    role   Their office. Change the wording if your club differs —
//           'Cultural Secretary', 'Sports Secretary', and so on.
//    since  The year they took office, e.g. '2026'. Leave '' to hide the line.
//    photo  Their photograph. Save the file in
//               frontend/public/committee/
//           and write the path from the site root. A file saved as
//               frontend/public/committee/president.jpg
//           is written here as
//               photo: '/committee/president.jpg'
//           Use lower-case names with hyphens and no spaces.
//
//           THE PHOTOGRAPH IS SHOWN AS A CIRCLE, cropped from the centre of the
//           file. So crop it SQUARE before saving — about 600 x 600 pixels and
//           under 200 KB — with the face centred and a little space around the
//           head. A tall photograph is not rejected; it simply loses its top and
//           bottom to the circle. A photograph straight off a phone is 3–6 MB
//           and every visitor would download all of it.
//
//           Leave '' and the card shows a coloured monogram instead, which is
//           what every card does today. Photographs can be added one at a time.
//    email  Optional. Shown as a button on their card. Leave '' and the card
//           shows no address, and the page asks visitors to write to the club
//           office instead.
//
//  ON PUBLISHING EMAIL ADDRESSES: prefer a club address that belongs to the
//  office rather than to the person — secretary@example.org rather than
//  somebody's personal Gmail. An address on a public page is collected by
//  spammers within days, and an office address can be handed to the next
//  bearer at the end of the term without editing the site or losing the mail.
// ===========================================================================

export const committee = {
  eyebrow: 'Executive committee',
  title: 'The office bearers',
  lead: 'The committee is elected by the general body and serves a fixed term. Members may contact any office bearer through the club office.',
  /** Term of the current committee, e.g. '2026–2028'. Empty string hides it. */
  term: '',
  /**
   * The eight offices of this committee, in the order they appear on the page.
   *
   * A suggested file name is against each one, so photographs can be dropped into
   * frontend/public/committee/ and the path pasted in without inventing a naming
   * scheme. `photo: ''` keeps the monogram until the file is actually there — a
   * path pointing at a file that does not exist shows a broken image to visitors,
   * so fill the two in together.
   *
   * Two bearers share the title Secretary and two share Game Secretary, as the club
   * has them. If it would help visitors tell them apart, change one of each to
   * 'Joint Secretary' and 'Assistant Game Secretary' — the wording here is what the
   * card prints.
   */
  members: [
    // photo: '/committee/president.jpg'
    { name: 'Pankaj Ghosh', role: 'President', since: '2026', photo: '/committee/president.jpg', email: '' },
    // photo: '/committee/secretary-1.jpg'
    { name: 'Govindo Ghosh', role: 'Secretary', since: '2026', photo: '/committee/secretary-1.jpg', email: '' },
    // photo: '/committee/secretary-2.jpg'
    { name: 'Partha Dey', role: 'Secretary', since: '2026', photo: '/committee/secretary-2.jpg', email: '' },
    // photo: '/committee/cultural-secretary.jpg'
    { name: 'Sudip Ghosh', role: 'Cultural Secretary', since: '2026', photo: '/committee/cultural-secretary.jpg', email: '' },
    // photo: '/committee/treasurer.jpg'
    { name: 'Sukanta Bose', role: 'Treasurer', since: '2026', photo: '/committee/treasurer.jpg', email: '' },
    // photo: '/committee/cashier.jpg'
    { name: 'Full name', role: 'Cashier', since: '', photo: '', email: '' },
    // photo: '/committee/game-secretary-1.jpg'
    { name: 'Full name', role: 'Game Secretary', since: '', photo: '', email: '' },
    // photo: '/committee/game-secretary-2.jpg'
    { name: 'Full name', role: 'Game Secretary', since: '', photo: '', email: '' },
  ],
}

// ===========================================================================
//  8. MEMBERSHIP PAGE
//
//     `fee: null` renders as "To be confirmed". Set a number once the
//     committee has agreed the fee for that category — the amounts are not
//     invented here on purpose.
// ===========================================================================

export interface MembershipTypeItem {
  key: string
  name: string
  /**
   * Annual or one-time fee in rupees, e.g. 500.
   * `null` renders as "To be confirmed" — the amounts are not invented here.
   */
  fee: number | null
  period: string
  eligibility: string
  /** Set on at most one category to feature it. */
  highlight?: boolean
}

export const membership = {
  eyebrow: 'Membership',
  title: 'Becoming a member',
  lead: 'Membership is open to residents of the area and to others who share the club’s aims. Applications are reviewed by the committee, and dues are payable for the membership year.',

  benefits: [
    'Use of the club premises and equipment during opening hours',
    'Entry to club events, with member rates where a charge applies',
    'A vote at the annual general body meeting',
    'A digital membership card and downloadable payment receipts',
    'Notices, circulars and reminders by email and in the member portal',
  ],

  /** Membership categories, matching SRS §7. `period` is what the fee buys. */
  types: [
    { key: 'student', name: 'Student', fee: null, period: 'per year', eligibility: 'Enrolled students, on production of a valid student card.' },
    { key: 'regular', name: 'Regular', fee: null, period: 'per year', eligibility: 'Open to all eligible applicants.', highlight: true },
    { key: 'family', name: 'Family', fee: null, period: 'per year', eligibility: 'One household, covering spouse and dependent children.' },
    { key: 'senior', name: 'Senior', fee: null, period: 'per year', eligibility: 'Members above the age set by the committee.' },
    { key: 'life', name: 'Life', fee: null, period: 'one-time', eligibility: 'A single payment in place of annual dues.' },
    { key: 'corporate', name: 'Corporate', fee: null, period: 'per year', eligibility: 'Firms and institutions supporting the club.' },
    { key: 'associate', name: 'Associate', fee: null, period: 'per year', eligibility: 'Limited membership without voting rights.' },
    { key: 'honorary', name: 'Honorary', fee: null, period: 'no fee', eligibility: 'Conferred by the committee in recognition of service.' },
  ] as ReadonlyArray<MembershipTypeItem>,

  /** The "how to join" steps. */
  steps: [
    { title: 'Apply', body: 'Complete the membership application with your details and your membership category.' },
    { title: 'Committee review', body: 'The committee considers the application at its next sitting and records its decision.' },
    { title: 'Pay the dues', body: 'On approval, pay the fee by UPI using the reference number the system issues, and enter your UPI transaction ID.' },
    { title: 'Verification', body: 'The treasurer checks the payment against the club’s bank records and approves it. A receipt is issued only after that check.' },
    { title: 'You’re in', body: 'Your membership is activated, your receipt and membership card become available, and renewal reminders begin.' },
  ],

  /** Shown as a note under the fee table. Empty string hides it. */
  feeNote:
    'Fees are set by the general body and may change. The figures shown here are confirmed by the committee before each membership year.',
}

// ===========================================================================
//  9. EVENTS  —  sample entries
//     From a later phase these come from the database and the committee
//     manages them in the admin portal. Until then, edit them here.
// ===========================================================================

export interface EventItem {
  slug: string
  title: string
  /** ISO date, 'YYYY-MM-DD'. */
  date: string
  time: string
  venue: string
  category: string
  summary: string
}

export const events: ReadonlyArray<EventItem> = [
  {
    slug: 'annual-general-meeting',
    title: 'Annual general body meeting',
    date: '2026-09-20',
    time: '10:00',
    venue: 'Club hall',
    category: 'Meeting',
    summary:
      'Presentation of the annual accounts and the secretary’s report, followed by open questions from members.',
  },
  {
    slug: 'inter-club-tournament',
    title: 'Inter-club tournament',
    date: '2026-10-11',
    time: '08:00',
    venue: 'Club ground',
    category: 'Sport',
    summary:
      'Teams from neighbouring clubs compete over a single day. Members are welcome to attend and support.',
  },
  {
    slug: 'cultural-evening',
    title: 'Annual cultural evening',
    date: '2026-11-07',
    time: '18:00',
    venue: 'Club hall',
    category: 'Culture',
    summary:
      'Music, recitation and a short drama staged by members, followed by refreshments. Families welcome.',
  },
  {
    slug: 'health-camp',
    title: 'Free health check-up camp',
    date: '2026-12-06',
    time: '09:00',
    venue: 'Club premises',
    category: 'Service',
    summary:
      'General health screening open to the neighbourhood, run with a local hospital.',
  },
]

// ===========================================================================
//  10. NEWS & NOTICES  —  sample entries
// ===========================================================================

export interface NewsItem {
  slug: string
  title: string
  /** ISO date, 'YYYY-MM-DD'. */
  date: string
  category: string
  summary: string
  /** Pinned items sort to the top and carry a marker. */
  pinned?: boolean
}

export const news: ReadonlyArray<NewsItem> = [
  {
    slug: 'membership-renewal-open',
    title: 'Membership renewal for the coming year is open',
    date: '2026-08-01',
    category: 'Membership',
    summary:
      'Members may renew through the portal. Dues are payable by UPI, and receipts are issued once the treasurer has verified the payment.',
    pinned: true,
  },
  {
    slug: 'committee-election-notice',
    title: 'Notice of committee election',
    date: '2026-07-18',
    category: 'Notice',
    summary:
      'Nominations for the executive committee are invited from members in good standing. The notice and nomination form are on the Documents page.',
  },
  {
    slug: 'ground-maintenance',
    title: 'Ground closed for maintenance',
    date: '2026-07-02',
    category: 'Facilities',
    summary: 'The playing surface is being relaid. Fixtures resume once the work is signed off.',
  },
]

// ===========================================================================
//  11. GALLERY  —  album list
//      Photographs and video are uploaded through the admin portal in a later
//      phase. For now each album shows a placeholder cover.
// ===========================================================================

export interface AlbumItem {
  slug: string
  title: string
  /** ISO date, 'YYYY-MM-DD'. */
  date: string
  itemCount: number
  description: string
}

export const gallery: ReadonlyArray<AlbumItem> = [
  { slug: 'cultural-evening', title: 'Cultural evening', date: '2025-11-08', itemCount: 0, description: 'Performances by members and the prize distribution.' },
  { slug: 'tournament', title: 'Inter-club tournament', date: '2025-10-12', itemCount: 0, description: 'Match play, the final, and the presentation.' },
  { slug: 'health-camp', title: 'Health check-up camp', date: '2025-12-07', itemCount: 0, description: 'Screening camp run with a local hospital.' },
  { slug: 'founders-day', title: 'Founders’ day', date: '2025-08-15', itemCount: 0, description: 'Flag hoisting, prize giving and the community lunch.' },
]

// ===========================================================================
//  12. DOCUMENTS
//      `href` is left empty until the file is uploaded through the admin
//      portal in a later phase; entries with no link show as "Coming soon".
// ===========================================================================

export interface DocumentItem {
  title: string
  category: 'Constitution' | 'Circular' | 'Minutes' | 'Report' | 'Policy'
  /** ISO date, 'YYYY-MM-DD'. */
  updated: string
  href: string
}

export const documents: ReadonlyArray<DocumentItem> = [
  { title: 'Constitution of the club', category: 'Constitution', updated: '2026-04-01', href: '' },
  { title: 'Annual report', category: 'Report', updated: '2026-06-30', href: '' },
  { title: 'Audited accounts', category: 'Report', updated: '2026-06-30', href: '' },
  { title: 'Minutes of the general body meeting', category: 'Minutes', updated: '2026-05-12', href: '' },
  { title: 'Notice of committee election', category: 'Circular', updated: '2026-07-18', href: '' },
  { title: 'Code of conduct for members', category: 'Policy', updated: '2026-04-01', href: '' },
]

// ===========================================================================
//  13. TESTIMONIALS
//      PLACEHOLDERS. Never publish a quote a member did not give you.
//      Delete the whole list to hide the section.
// ===========================================================================

export interface Testimonial {
  quote: string
  name: string
  role: string
}

export const testimonials: ReadonlyArray<Testimonial> = [
  {
    quote:
      'Replace this with a real quote from a member, in their own words, with their permission.',
    name: 'Member name',
    role: 'Member since —',
  },
  {
    quote:
      'Two or three sentences work best. Ask what the club has meant to them rather than for praise.',
    name: 'Member name',
    role: 'Member since —',
  },
  {
    quote: 'A quote from a parent, a volunteer or a neighbour gives a different and useful view.',
    name: 'Member name',
    role: 'Volunteer',
  },
]

// ===========================================================================
//  14. SPONSORS & SUPPORTERS
//      Delete the whole list to hide the section. Logos are uploaded in a
//      later phase; for now each shows a monogram.
// ===========================================================================

export interface Sponsor {
  name: string
  tier: 'Principal' | 'Supporting' | 'Well-wisher'
  url: string
}

export const sponsors: ReadonlyArray<Sponsor> = [
  { name: 'Supporter name', tier: 'Principal', url: '' },
  { name: 'Supporter name', tier: 'Supporting', url: '' },
  { name: 'Supporter name', tier: 'Supporting', url: '' },
  { name: 'Supporter name', tier: 'Well-wisher', url: '' },
]

// ===========================================================================
//  15. CONTACT PAGE
// ===========================================================================

export const contact = {
  eyebrow: 'Contact',
  title: 'Get in touch',
  lead: 'For membership questions, event enquiries or anything else, write to the club office or use the form below.',
  /** Subjects offered in the enquiry form's dropdown. */
  subjects: [
    'Membership enquiry',
    'Event enquiry',
    'Payment or receipt',
    'Sponsorship',
    'Complaint',
    'Suggestion',
    'Something else',
  ],
  /** Shown under the form. */
  formNote:
    'The form opens your email application with the message ready to send, so you keep a copy in your sent items. Members signed in to the portal can raise a tracked support ticket instead.',
}

// ===========================================================================
//  16. FOOTER
// ===========================================================================

export const footer = {
  /** Short line under the club name. */
  blurb: 'A member-run community club.',
  /** Link columns. Add or remove links freely. */
  columns: [
    {
      title: 'The club',
      links: [
        { label: 'About us', to: '/about' },
        { label: 'Mission & vision', to: '/mission-vision' },
        { label: 'Our history', to: '/history' },
        { label: 'Executive committee', to: '/committee' },
      ],
    },
    {
      title: 'Take part',
      links: [
        { label: 'Membership', to: '/membership' },
        { label: 'Events', to: '/events' },
        { label: 'Gallery', to: '/gallery' },
        { label: 'News & notices', to: '/news' },
      ],
    },
    {
      title: 'Information',
      links: [
        { label: 'Documents', to: '/documents' },
        { label: 'Contact', to: '/contact' },
      ],
    },
  ],
  /** Appears at the very bottom, next to the copyright line. */
  legalNote: '',
}
