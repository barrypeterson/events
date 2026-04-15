import { Heart } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t" data-testid="footer">
      <div className="container py-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <h3 className="mb-3 text-lg font-semibold">SLO Events</h3>
            <p className="text-sm text-muted-foreground">
              Discover the best events in San Luis Obispo with AI-powered search
              and recommendations.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="/"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Browse Events
                </a>
              </li>
              <li>
                <a
                  href="/tonight"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Tonight
                </a>
              </li>
              <li>
                <a
                  href="/admin"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Admin
                </a>
              </li>
              <li>
                <a
                  href="/admin/venues"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Venues
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold">Follow Us</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Facebook
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Instagram
                </a>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-6" />

        <div className="flex flex-col items-center justify-between space-y-2 text-sm text-muted-foreground md:flex-row md:space-y-0">
          <p>&copy; {currentYear} SLO Events. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Made with <Heart className="h-4 w-4 fill-red-500 text-red-500" /> in
            San Luis Obispo
          </p>
        </div>
      </div>
    </footer>
  )
}
