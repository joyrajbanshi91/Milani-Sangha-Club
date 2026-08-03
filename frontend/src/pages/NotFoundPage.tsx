import { Link } from 'react-router'

import { Container } from '@/components/ui/Container'
import { LinkButton } from '@/components/ui/LinkButton'
import { nav } from '@/content/site'

export function NotFoundPage() {
  return (
    <Container className="py-24 text-center">
      <p className="font-display text-6xl text-accent-400">404</p>
      <h1 className="mt-4 font-display text-2xl text-ink-900 sm:text-3xl">Page not found</h1>
      <p className="mx-auto mt-3 max-w-md text-ink-600">
        The page you are looking for does not exist, or it has moved.
      </p>

      <LinkButton to="/" className="mt-8" size="lg">
        Back to home
      </LinkButton>

      <nav aria-label="Site pages" className="mt-12">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
          Or try one of these
        </h2>
        <ul className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {nav
            .flatMap((item) => item.children ?? [item])
            .map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="text-brand-800 hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </Container>
  )
}
