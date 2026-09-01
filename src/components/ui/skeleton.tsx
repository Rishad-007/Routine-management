import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} />
  );
}

export function RoutineGridSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="h-11 bg-[#eef2f7]">
        <Skeleton className="mx-4 mt-3 h-5 w-40" />
      </div>
      <div className="p-4">
        <Skeleton className="h-8 w-full" />
        <div className="mt-3 space-y-3">
          {[0, 1, 2, 3, 4].map((d) => (
            <div key={d} className="flex gap-3">
              <Skeleton className="h-12 w-28 shrink-0" />
              {[0, 1, 2, 3, 4, 5, 6].map((p) => (
                <Skeleton key={p} className="h-12 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
