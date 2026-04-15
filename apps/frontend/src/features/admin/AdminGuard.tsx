import { Navigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('adminToken') || ''

  const { data, isLoading } = trpc.adminAuth.verify.useQuery(
    { token },
    { enabled: !!token, retry: false }
  )

  if (!token) {
    return <Navigate to="/admin/login" replace />
  }

  if (isLoading) {
    return (
      <div className="container flex items-center justify-center py-20">
        <Skeleton className="h-8 w-48" />
      </div>
    )
  }

  if (!data?.valid) {
    localStorage.removeItem('adminToken')
    return <Navigate to="/admin/login" replace />
  }

  return <>{children}</>
}
