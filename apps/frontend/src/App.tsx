import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, createTRPCClient } from '@/lib/trpc'
import { Layout } from '@/components/layout/Layout'
import { EventsPage } from '@/features/events/EventsPage'
import { EventDetailPage } from '@/features/events/EventDetailPage'
import { VenuePage } from '@/features/venues/VenuePage'
import { AdminPage } from '@/features/admin/AdminPage'
import { VenuesAdminPage } from '@/features/admin/VenuesAdminPage'
import { MediaManagementPage } from '@/features/admin/MediaManagementPage'
import { ScraperPlaygroundPage } from '@/features/admin/ScraperPlaygroundPage'
import { NotFoundPage } from '@/features/events/NotFoundPage'
import { TonightPage } from '@/features/events/TonightPage'
import { DesignSystemPage } from '@/features/admin/DesignSystemPage'
import { VenueScrapingPage } from '@/features/admin/VenueScrapingPage'
import { AdminLoginPage } from '@/features/admin/AdminLoginPage'
import { AdminGuard } from '@/features/admin/AdminGuard'
import { useState } from 'react'

function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
      },
    },
  }))

  const [trpcClient] = useState(() => createTRPCClient())

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<EventsPage />} />
              <Route path="/tonight" element={<TonightPage />} />
              <Route path="/events/:id" element={<EventDetailPage />} />
              <Route path="/venues/:venueId" element={<VenuePage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin" element={<AdminGuard><AdminPage /></AdminGuard>} />
              <Route path="/admin/venues" element={<AdminGuard><VenuesAdminPage /></AdminGuard>} />
              <Route path="/admin/media" element={<AdminGuard><MediaManagementPage /></AdminGuard>} />
              <Route path="/admin/scraper-playground" element={<AdminGuard><ScraperPlaygroundPage /></AdminGuard>} />
              <Route path="/admin/design-system" element={<AdminGuard><DesignSystemPage /></AdminGuard>} />
              <Route path="/admin/venue-scraping" element={<AdminGuard><VenueScrapingPage /></AdminGuard>} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  )
}

export default App
