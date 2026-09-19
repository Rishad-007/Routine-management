"use client";

import { useMemo, useRef, useState } from "react";
import { Check, DoorOpen, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { RoomRow } from "@/lib/types";

/**
 * What the picker hands back: an existing room, or a name to create on save.
 * Mirrors the RoomChoice the section server actions accept.
 */
export type RoomSelection =
  | { kind: "existing"; id: string }
  | { kind: "new"; name: string }
  | null;

interface Props {
  rooms: RoomRow[];
  /** roomId -> "Class 6 — Jui", for rooms a section already holds. */
  heldBy: Map<string, string>;
  value: RoomSelection;
  onChange: (value: RoomSelection) => void;
  className?: string;
}

/**
 * Type-to-search room input with inline creation.
 *
 * Rooms that a section already holds are shown rather than hidden: 18 rooms in
 * this school are legitimately shared by two sections, and filtering them out
 * made them impossible to pick at all.
 */
export function RoomPicker({
  rooms,
  heldBy,
  value,
  onChange,
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const selectedLabel =
    value?.kind === "existing"
      ? (roomMap.get(value.id)?.name ?? "")
      : value?.kind === "new"
        ? value.name
        : "";

  const { free, taken, exact } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = rooms.filter((r) => !q || r.name.toLowerCase().includes(q));
    return {
      free: match.filter((r) => !heldBy.has(r.id)),
      taken: match.filter((r) => heldBy.has(r.id)),
      exact: rooms.some((r) => r.name.toLowerCase() === q),
    };
  }, [rooms, heldBy, query]);

  const canCreate = query.trim().length > 0 && !exact;

  function pick(next: RoomSelection) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  // A click inside the list fires after blur, so defer closing.
  function handleBlur() {
    blurTimer.current = setTimeout(() => setOpen(false), 120);
  }
  function cancelBlur() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }

  return (
    <div className={cn("relative", className)}>
      {value && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-full items-center justify-between rounded-lg border bg-white px-3 text-left text-sm"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <DoorOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{selectedLabel}</span>
            {value.kind === "new" && (
              <span className="shrink-0 rounded bg-[#0d9488]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#0b7a70]">
                new
              </span>
            )}
          </span>
          <X
            className="h-3.5 w-3.5 shrink-0 text-slate-400 hover:text-slate-600"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
          />
        </button>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            autoFocus={open}
            placeholder="Type a room name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={handleBlur}
            className="pl-9"
          />
        </div>
      )}

      {open && (
        <div
          onMouseDown={cancelBlur}
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-white p-1 shadow-lg"
        >
          {canCreate && (
            <button
              type="button"
              onClick={() => pick({ kind: "new", name: query.trim() })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-[#0b7a70] hover:bg-[#0d9488]/10"
            >
              <Plus className="h-4 w-4" />
              Create room &ldquo;{query.trim()}&rdquo;
            </button>
          )}

          <Group label={`Unassigned (${free.length})`} show={free.length > 0}>
            {free.map((r) => (
              <Row
                key={r.id}
                name={r.name}
                selected={value?.kind === "existing" && value.id === r.id}
                onSelect={() => pick({ kind: "existing", id: r.id })}
              />
            ))}
          </Group>

          <Group label={`Already in use (${taken.length})`} show={taken.length > 0}>
            {taken.map((r) => (
              <Row
                key={r.id}
                name={r.name}
                note={heldBy.get(r.id)}
                selected={value?.kind === "existing" && value.id === r.id}
                onSelect={() => pick({ kind: "existing", id: r.id })}
              />
            ))}
          </Group>

          {free.length === 0 && taken.length === 0 && !canCreate && (
            <p className="px-2 py-3 text-sm text-slate-400">No rooms match.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  show,
  children,
}: {
  label: string;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <div className="py-1">
      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  name,
  note,
  selected,
  onSelect,
}: {
  name: string;
  note?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100",
        selected && "bg-slate-100",
      )}
    >
      <span className="truncate">{name}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {note && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
            {note}
          </span>
        )}
        {selected && <Check className="h-3.5 w-3.5 text-[#0d9488]" />}
      </span>
    </button>
  );
}
