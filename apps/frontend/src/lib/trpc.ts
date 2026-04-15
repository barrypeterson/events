import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from '../types'

export const trpc = createTRPCReact<AppRouter>()

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: import.meta.env.VITE_API_URL
          ? `${import.meta.env.VITE_API_URL}/api/trpc`
          : 'http://localhost:6001/api/trpc',
        transformer: superjson,
      }),
    ],
  })
}
