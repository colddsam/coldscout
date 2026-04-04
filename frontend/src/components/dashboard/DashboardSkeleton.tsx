/**
 * DashboardSkeleton — Placeholder view for free-plan freelancers.
 *
 * Renders a shimmer skeleton that mirrors the Overview layout without
 * displaying any real data. Shown after the UpgradeModal is dismissed.
 */

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={`bg-gray-100 rounded animate-pulse ${className ?? ''}`}
    />
  );
}

function SkeletonCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white border border-gray-200 p-5">
      {children}
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <Shimmer className="h-6 w-44 mb-2" />
          <Shimmer className="h-3.5 w-64" />
        </div>
        <Shimmer className="h-8 w-28 rounded-md" />
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Shimmer className="h-2.5 w-20 mb-3" />
                <Shimmer className="h-8 w-16 mb-1" />
              </div>
              <Shimmer className="h-10 w-10 rounded-lg" />
            </div>
          </SkeletonCard>
        ))}
      </div>

      {/* Pipeline status + System health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline status */}
        <SkeletonCard>
          <Shimmer className="h-2.5 w-28 mb-4" />
          <div className="flex flex-wrap gap-2 mb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Shimmer key={i} className="h-7 w-20 rounded-md" />
            ))}
          </div>
          <div className="flex gap-6 mb-4">
            <Shimmer className="h-3 w-32" />
            <Shimmer className="h-3 w-24" />
          </div>
          <Shimmer className="h-8 w-36 rounded-md" />
        </SkeletonCard>

        {/* System health */}
        <SkeletonCard>
          <Shimmer className="h-2.5 w-24 mb-4" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Shimmer className="h-3.5 w-28" />
                <Shimmer className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>

      {/* Recent Leads table */}
      <SkeletonCard>
        <div className="flex items-center justify-between mb-4">
          <Shimmer className="h-2.5 w-24" />
          <Shimmer className="h-6 w-20 rounded-md" />
        </div>
        {/* Table header */}
        <div className="grid grid-cols-5 gap-4 pb-3 border-b border-gray-100 mb-2">
          {['Business', 'City', 'Category', 'Status', 'Discovered'].map((col) => (
            <Shimmer key={col} className="h-2.5 w-full" />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-4 py-3 border-b border-gray-50 last:border-0"
          >
            <Shimmer className="h-3.5 w-full" />
            <Shimmer className="h-3.5 w-3/4" />
            <Shimmer className="h-3.5 w-4/5" />
            <Shimmer className="h-5 w-14 rounded-full" />
            <Shimmer className="h-3.5 w-full" />
          </div>
        ))}
      </SkeletonCard>

      {/* Job status + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Job status */}
        <SkeletonCard>
          <Shimmer className="h-2.5 w-20 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <Shimmer className="h-2.5 w-2.5 rounded-full" />
                  <Shimmer className="h-3.5 w-32" />
                </div>
                <Shimmer className="h-5 w-12 rounded-full" />
              </div>
            ))}
          </div>
        </SkeletonCard>

        {/* Quick actions */}
        <SkeletonCard>
          <Shimmer className="h-2.5 w-24 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Shimmer key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </SkeletonCard>
      </div>

      {/* Upgrade CTA banner */}
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
          Limited View
        </p>
        <p className="text-sm text-gray-500">
          Upgrade to <span className="font-semibold text-black">Pro</span> or{' '}
          <span className="font-semibold text-black">Enterprise</span> to unlock live data and
          full pipeline controls.
        </p>
      </div>
    </div>
  );
}
