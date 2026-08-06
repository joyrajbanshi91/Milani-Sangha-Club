import { Navigate, createBrowserRouter } from 'react-router'

import { AppLayout } from '@/components/layout/AppLayout'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { RequireAuth, RequireOfficer } from '@/features/auth/guards'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'
// The home page is imported eagerly: it is the most common entry point, and
// loading it as a chunk would show a blank frame on first paint.
import { HomePage } from '@/pages/public/HomePage'

/**
 * Route table.
 *
 * Every page other than the home page is code-split, so a visitor who only
 * reads the home page never downloads the membership or contact bundles. The
 * member portal (/portal) and admin portal (/admin) are added behind guards in
 * their own phases.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'about',
        lazy: async () => ({ Component: (await import('@/pages/public/AboutPage')).AboutPage }),
      },
      {
        path: 'mission-vision',
        lazy: async () => ({
          Component: (await import('@/pages/public/MissionVisionPage')).MissionVisionPage,
        }),
      },
      {
        path: 'history',
        lazy: async () => ({ Component: (await import('@/pages/public/HistoryPage')).HistoryPage }),
      },
      {
        path: 'committee',
        lazy: async () => ({
          Component: (await import('@/pages/public/CommitteePage')).CommitteePage,
        }),
      },
      {
        path: 'membership',
        lazy: async () => ({
          Component: (await import('@/pages/public/MembershipPage')).MembershipPage,
        }),
      },
      {
        path: 'events',
        lazy: async () => ({ Component: (await import('@/pages/public/EventsPage')).EventsPage }),
      },
      {
        path: 'gallery',
        lazy: async () => ({ Component: (await import('@/pages/public/GalleryPage')).GalleryPage }),
      },
      {
        path: 'news',
        lazy: async () => ({ Component: (await import('@/pages/public/NewsPage')).NewsPage }),
      },
      {
        path: 'documents',
        lazy: async () => ({
          Component: (await import('@/pages/public/DocumentsPage')).DocumentsPage,
        }),
      },
      {
        path: 'contact',
        lazy: async () => ({ Component: (await import('@/pages/public/ContactPage')).ContactPage }),
      },
      {
        path: 'login',
        lazy: async () => ({ Component: (await import('@/pages/LoginPage')).LoginPage }),
      },
      {
        // Where the emailed password-reset link lands. Appwrite appends userId and
        // secret. This route was missing, so every reset email led to Not Found.
        path: 'reset-password',
        lazy: async () => ({
          Component: (await import('@/pages/ResetPasswordPage')).ResetPasswordPage,
        }),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },

  // ---------------------------------------------------------------------------
  // Signed-in areas.
  //
  // The guards decide what renders; they are not the security boundary. The API
  // refuses a member's request whatever the browser shows, and the Firestore
  // rules refuse it again.
  // ---------------------------------------------------------------------------
  {
    path: '/portal',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('@/pages/portal/MemberPortalPage')).MemberPortalPage,
        }),
      },
      // A stale bookmark inside the portal lands on the portal, not an error page.
      { path: '*', element: <Navigate to="/portal" replace /> },
    ],
  },
  {
    path: '/office',
    element: (
      <RequireOfficer>
        <AppLayout />
      </RequireOfficer>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('@/pages/office/OfficeDashboardPage')).OfficeDashboardPage,
        }),
      },
      {
        path: 'entries',
        lazy: async () => ({
          Component: (await import('@/pages/office/EntriesPage')).EntriesPage,
        }),
      },
      {
        path: 'payments',
        lazy: async () => ({
          Component: (await import('@/pages/office/PaymentsPage')).PaymentsPage,
        }),
      },
      {
        path: 'members',
        lazy: async () => ({
          Component: (await import('@/pages/office/MembersPage')).MembersPage,
        }),
      },
      {
        path: 'reports',
        lazy: async () => ({
          Component: (await import('@/pages/office/ReportsPage')).ReportsPage,
        }),
      },
      {
        /**
         * Messages from the website's contact page.
         *
         * The server allows only the secretary and the president; the page itself says
         * so to anybody else rather than 404ing, because a treasurer who follows a link
         * should be told who to ask, not that the page does not exist.
         *
         * This route must stay **above** the catch-all below. Without it, `/office/enquiries`
         * matched `*`, was redirected to `/office`, and the club found the Enquiries menu
         * item showing them the finance dashboard.
         */
        path: 'enquiries',
        lazy: async () => ({
          Component: (await import('@/pages/office/EnquiriesPage')).EnquiriesPage,
        }),
      },
      {
        // Starting a new club year with the opening balance the committee adopted, and
        // every year the club has kept. Its own route because a treasurer goes looking
        // for it; as a panel under the statements it could not be found.
        path: 'years',
        lazy: async () => ({
          Component: (await import('@/pages/office/YearsPage')).YearsPage,
        }),
      },
      // Catches /office/import, which existed before the import screen was
      // removed, so an old bookmark lands on the dashboard rather than an error.
      { path: '*', element: <Navigate to="/office" replace /> },
    ],
  },
])
