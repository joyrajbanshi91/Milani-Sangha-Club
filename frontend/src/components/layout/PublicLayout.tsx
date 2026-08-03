import { Outlet, ScrollRestoration, useNavigation } from 'react-router'

import { DraftContentNotice } from '@/components/layout/DraftContentNotice'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { BackToTop } from '@/components/ui/BackToTop'

/** Shell for the public website. The member and admin portals get their own. */
export function PublicLayout() {
  const navigation = useNavigation()
  const isNavigating = navigation.state === 'loading'

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-900 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <Header />

      {/* Thin progress bar while a lazily-loaded page is fetched. */}
      <div
        aria-hidden="true"
        className={
          isNavigating
            ? 'fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-accent-400'
            : 'sr-only'
        }
      />

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <Footer />
      <BackToTop />
      <DraftContentNotice />
      <ScrollRestoration />
    </div>
  )
}
