import { create } from 'zustand'
import type { EventFilters, SearchState } from '@/types'

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  filters: {},
  setQuery: (query: string) => set({ query }),
  setFilters: (newFilters: Partial<EventFilters>) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    })),
  resetFilters: () =>
    set({
      query: '',
      filters: {},
    }),
}))
