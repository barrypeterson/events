import { useSearchStore } from '@/stores/search'
import type { EventFilters } from '@/types'

export function useFilters() {
  const { filters, setFilters, resetFilters } = useSearchStore()

  const updateFilter = (key: keyof EventFilters, value: any) => {
    setFilters({ [key]: value })
  }

  const removeFilter = (key: keyof EventFilters) => {
    const newFilters = { ...filters }
    delete newFilters[key]
    setFilters(newFilters)
  }

  const hasActiveFilters = Object.keys(filters).length > 0

  return {
    filters,
    updateFilter,
    removeFilter,
    resetFilters,
    hasActiveFilters,
  }
}
