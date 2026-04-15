import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useFilters } from '@/hooks/useFilters'
import { cn, getCategoryColor } from '@/lib/utils'
import { X } from 'lucide-react'

// Map display names to backend enum values
const CATEGORIES = [
  { display: 'Music', value: 'MUSIC' },
  { display: 'Comedy', value: 'COMEDY' },
  { display: 'Sports', value: 'SPORTS' },
  { display: 'Arts', value: 'ARTS' },
  { display: 'Food & Wine', value: 'FOOD_WINE' },
  { display: 'Theater', value: 'THEATER' },
  { display: 'Community', value: 'COMMUNITY' },
  { display: 'Family', value: 'FAMILY' },
  { display: 'Kids', value: 'KIDS' },
  { display: 'Outdoor', value: 'OUTDOOR' },
  { display: 'Fitness', value: 'FITNESS' },
  { display: 'Education', value: 'EDUCATION' },
  { display: 'Business', value: 'BUSINESS' },
  { display: 'Other', value: 'OTHER' },
]

export function EventFilters() {
  const { filters, updateFilter, resetFilters, hasActiveFilters } = useFilters()

  const handleCategoryClick = (categoryValue: string) => {
    const currentCategories = filters.categories || []

    if (currentCategories.includes(categoryValue)) {
      // Remove category if already selected
      const newCategories = currentCategories.filter(c => c !== categoryValue)
      updateFilter('categories', newCategories.length > 0 ? newCategories : undefined)
    } else {
      // Add category to selection
      updateFilter('categories', [...currentCategories, categoryValue])
    }
  }

  const handleShowPastEventsToggle = () => {
    updateFilter('showPastEvents', !filters.showPastEvents)
  }

  const handleShowRecurringEventsToggle = () => {
    updateFilter('showRecurringEvents', !filters.showRecurringEvents)
  }

  return (
    <div className="space-y-4" data-testid="event-filters">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Categories</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            data-testid="reset-filters"
          >
            Clear all
            <X className="ml-1 h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 md:flex-wrap md:overflow-visible md:pb-0">
        {CATEGORIES.map((category) => {
          const isActive = filters.categories?.includes(category.value) || false
          return (
            <Badge
              key={category.value}
              variant={isActive ? 'default' : 'outline'}
              className={cn(
                'shrink-0 cursor-pointer transition-all duration-200 hover:scale-105',
                isActive && getCategoryColor(category.display)
              )}
              onClick={() => handleCategoryClick(category.value)}
              data-testid={`category-filter-${category.display.toLowerCase()}`}
            >
              {isActive && '✓ '}
              {category.display}
            </Badge>
          )
        })}
      </div>

      {/* Filter Toggles */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          variant={filters.showPastEvents ? 'default' : 'outline'}
          size="sm"
          onClick={handleShowPastEventsToggle}
          data-testid="show-past-events-toggle"
          className="text-xs"
        >
          {filters.showPastEvents ? '✓ ' : ''}Show Past Events
        </Button>
        <Button
          variant={filters.showRecurringEvents ? 'default' : 'outline'}
          size="sm"
          onClick={handleShowRecurringEventsToggle}
          data-testid="show-recurring-events-toggle"
          className="text-xs"
        >
          {filters.showRecurringEvents ? '✓ ' : ''}Show Recurring Events
        </Button>
      </div>
    </div>
  )
}
