import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatEventDate(dateString: string | Date, endDateString?: string | Date | null): string {
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString
    const dateFormatted = format(date, "EEE, MMM d • h:mm a")

    // If there's an end time and it's on the same day, show time range
    if (endDateString) {
      const endDate = typeof endDateString === 'string' ? parseISO(endDateString) : endDateString
      // Check if same day
      if (format(date, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
        const startTime = format(date, "h:mm a")
        const endTime = format(endDate, "h:mm a")
        return dateFormatted.replace(startTime, `${startTime} - ${endTime}`)
      }
    }

    return dateFormatted
  } catch (error) {
    return String(dateString)
  }
}

export function formatEventDateLong(dateString: string | Date, endDateString?: string | Date | null): string {
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString
    const dateFormatted = format(date, "EEEE, MMMM d, yyyy 'at' h:mm a")

    // If there's an end time, show the time range
    if (endDateString) {
      const endDate = typeof endDateString === 'string' ? parseISO(endDateString) : endDateString
      const endTime = format(endDate, "h:mm a")
      // Replace the time in the formatted string with a time range
      const startTime = format(date, "h:mm a")
      return dateFormatted.replace(startTime, `${startTime} - ${endTime}`)
    }

    return dateFormatted
  } catch (error) {
    return String(dateString)
  }
}

export function formatEventDateShort(dateString: string | Date): string {
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString
    return format(date, "MMM d")
  } catch (error) {
    return String(dateString)
  }
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    music: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    comedy: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    sports: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    arts: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
    food: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    theater: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    festival: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    education: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    community: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    nightlife: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  }

  return colors[category.toLowerCase()] || "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300"
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

export function truncate(str: string | null | undefined, maxLength: number): string {
  if (!str) return ''
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + "..."
}
