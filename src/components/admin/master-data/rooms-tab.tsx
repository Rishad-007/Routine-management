"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createRoom, updateRoom, deleteRoom } from "@/app/admin/master-data/actions";
import type { RoomRow } from "@/lib/types";

export function RoomsTab({ rooms }: { rooms: RoomRow[] }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<RoomRow | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<RoomRow | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      const res = await createRoom(name);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Room added");
        setName("");
      }
    });
  }

  function handleUpdate() {
    if (!editing) return;
    startTransition(async () => {
      const res = await updateRoom(editing.id, editName);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Room updated");
        setEditing(null);
      }
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteRoom(deleting.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Room deleted");
        setDeleting(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rooms</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Room name (e.g. Room 101)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-xs"
          />
          <Button onClick={handleCreate} disabled={pending} className="bg-[#0d9488] hover:bg-[#0b7a70]">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        <div className="space-y-2">
          {rooms.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              {editing?.id === r.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="max-w-xs" />
                  <Button size="sm" onClick={handleUpdate} disabled={pending}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <p className="font-medium text-[#1e3a5f]">{r.name}</p>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditing(r);
                        setEditName(r.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(r)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {rooms.length === 0 && <p className="text-sm text-slate-400">No rooms yet.</p>}
        </div>
      </CardContent>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete room?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
