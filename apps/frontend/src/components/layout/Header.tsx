import { Link, useLocation } from 'react-router-dom'
import { Calendar, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function Header() {
  const location = useLocation()
  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <header
      className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      data-testid="header"
    >
      <div className="container flex h-16 items-center">
        <Link
          to="/"
          className="flex items-center space-x-2 transition-opacity hover:opacity-80"
          data-testid="logo-link"
        >
          <Calendar className="h-6 w-6 text-primary" />
          <span className="font-display text-xl font-bold text-primary">SLO Events</span>
        </Link>

        <nav className="ml-auto flex items-center space-x-4">
          <Link to="/tonight" className="hidden md:block">
            <Button
              variant="ghost"
              data-testid="nav-tonight"
              className={isActive('/tonight') ? 'bg-primary/15 text-primary font-semibold' : ''}
            >
              Tonight
            </Button>
          </Link>

          <Link to="/" className="hidden md:block">
            <Button
              variant="ghost"
              data-testid="nav-events"
              className={isActive('/') ? 'bg-primary/15 text-primary font-semibold' : ''}
            >
              Events
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" data-testid="mobile-menu">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/tonight">Tonight</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/">Events</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  )
}
