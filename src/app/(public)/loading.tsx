import { Skeleton, RoutineGridSkeleton } from "@/components/ui/skeleton";

export default function PublicLoading() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <Skeleton className="mx-auto h-9 w-64" />
        <Skeleton className="mx-auto mt-3 h-4 w-80" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-2xl border p-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-8 w-48" />
            <Skeleton className="mt-3 h-4 w-40" />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border p-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-4 h-9 w-full" />
          <Skeleton className="mt-3 h-9 w-full" />
        </div>
      </div>

      <RoutineGridSkeleton />
    </div>
  );
}
