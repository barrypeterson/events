import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useSearch } from '@/hooks/useSearch'

export function SearchBar() {
  const { query, setQuery, clearSearch } = useSearch(500)

  return (
    <div className="relative w-full" data-testid="search-bar">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Search events..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="pl-10 pr-10"
        data-testid="search-input"
      />
      {query && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
          onClick={clearSearch}
          data-testid="clear-search"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
