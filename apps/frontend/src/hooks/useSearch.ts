import { useState, useEffect, useCallback } from 'react'
import { debounce } from '@/lib/utils'
import { useSearchStore } from '@/stores/search'

export function useSearch(delay: number = 500) {
  const { query, setQuery } = useSearchStore()
  const [inputValue, setInputValue] = useState(query)

  // Debounced update to store
  const debouncedSetQuery = useCallback(
    debounce((value: string) => {
      setQuery(value)
    }, delay),
    [setQuery, delay]
  )

  // Update input value and trigger debounced update
  const handleSearchChange = (value: string) => {
    setInputValue(value)
    debouncedSetQuery(value)
  }

  // Sync input with store on mount
  useEffect(() => {
    setInputValue(query)
  }, [query])

  const clearSearch = () => {
    setInputValue('')
    setQuery('')
  }

  return {
    query: inputValue,
    setQuery: handleSearchChange,
    clearSearch,
  }
}
