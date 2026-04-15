import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div
      className="container flex min-h-[80vh] items-center justify-center"
      data-testid="not-found-page"
    >
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-full bg-muted p-4">
            <AlertCircle className="h-16 w-16 text-muted-foreground" />
          </div>
        </div>
        <h1 className="mb-2 text-6xl font-bold">404</h1>
        <h2 className="mb-4 text-2xl font-semibold">Page Not Found</h2>
        <p className="mb-6 text-muted-foreground">
          Sorry, the page you're looking for doesn't exist.
        </p>
        <Link to="/">
          <Button size="lg">Back to Home</Button>
        </Link>
      </div>
    </div>
  )
}
