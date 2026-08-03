import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react'
import { Link } from 'react-router'

import { Container } from '@/components/ui/Container'
import { club, footer } from '@/content/site'
import { cn } from '@/lib/cn'
import { logoClasses } from '@/lib/logoSize'

/**
 * Social platforms are labelled rather than shown as logos: lucide removed its
 * brand glyphs, and reproducing trademarked marks from memory is both a legal
 * and an accuracy risk. A named link is also clearer on a screen reader.
 */
const SOCIAL = [
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'x', label: 'X' },
] as const

export function Footer() {
  const year = new Date().getFullYear()
  const { contact, social } = club

  const socialLinks = SOCIAL.filter(({ key }) => social[key] !== '')

  return (
    <footer className="mt-auto relative overflow-hidden border-t border-brand-100 bg-gradient-to-b from-white via-brand-50/60 to-brand-100/70">
      <div
        className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-brand-200/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-16 top-0 h-56 w-56 rounded-full bg-accent-200/40 blur-3xl"
        aria-hidden="true"
      />
      {/* Colour rule along the top edge. */}
      <div
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-accent-400 to-brand-400"
        aria-hidden="true"
      />

      <Container className="relative py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          {/* Identity */}
          <div>
            <div className="flex items-center gap-3">
              <img
                src={club.logo.src}
                alt={club.logo.showNameBeside ? '' : club.name}
                width={96}
                height={96}
                className={cn(
                  'w-auto object-contain',
                  logoClasses(club.logo.size, 'footer'),
                  club.logo.rounded && 'rounded-xl shadow-soft'
                )}
              />
              {club.logo.showNameBeside ? (
                <span className="font-display text-lg font-semibold text-brand-900">
                  {club.name}
                </span>
              ) : null}
            </div>

            <p className="mt-4 max-w-sm text-sm/relaxed text-ink-600">{footer.blurb}</p>

            {club.establishedYear ? (
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-ink-400">
                Established {club.establishedYear}
                {club.registrationNumber ? ` · Regd. ${club.registrationNumber}` : ''}
              </p>
            ) : null}

            {socialLinks.length > 0 ? (
              <ul className="mt-6 flex flex-wrap gap-2">
                {socialLinks.map(({ key, label }) => (
                  <li key={key}>
                    <a
                      href={social[key]}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brand-200 bg-white/80 px-3.5 text-xs font-medium text-brand-800 transition-colors hover:border-brand-300 hover:bg-white"
                    >
                      {label}
                      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Link columns */}
          {footer.columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-ink-600 transition-colors hover:text-brand-800 hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Contact strip */}
        <div className="mt-12 grid gap-4 border-t border-brand-200/60 pt-8 text-sm sm:grid-cols-3">
          <p className="flex items-start gap-2.5 text-ink-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span>
              {contact.addressLines.join(', ')}
              <br />
              {contact.city}
              {contact.state ? `, ${contact.state}` : ''} {contact.postcode}
            </span>
          </p>

          {contact.phone ? (
            <p className="flex items-start gap-2.5 text-ink-600">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
              <a href={`tel:${contact.phone.replace(/\s+/g, '')}`} className="hover:text-brand-800">
                {contact.phone}
              </a>
            </p>
          ) : null}

          {contact.email ? (
            <p className="flex items-start gap-2.5 text-ink-600">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
              <a href={`mailto:${contact.email}`} className="break-all hover:text-brand-800">
                {contact.email}
              </a>
            </p>
          ) : null}
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-brand-200/60 pt-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {club.name}. All rights reserved.
          </p>
          {footer.legalNote ? <p>{footer.legalNote}</p> : null}
        </div>
      </Container>
    </footer>
  )
}
