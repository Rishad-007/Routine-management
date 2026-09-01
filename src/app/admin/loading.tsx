import { Skeleton, RoutineGridSkeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-10 w-44" />
        <Skeleton className="ml-auto h-10 w-36" />
      </div>
      <RoutineGridSkeleton />
    </div>
  );
}
