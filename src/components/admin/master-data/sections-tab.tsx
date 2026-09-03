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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { createSection, updateSection, deleteSection } from "@/app/admin/master-data/actions";
import type { SectionRow, ClassRow, RoomRow } from "@/lib/types";

interface Props {
  sections: SectionRow[];
  classes: ClassRow[];
  rooms: RoomRow[];
}

export function SectionsTab({ sections, classes, rooms }: Props) {
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [fixed, setFixed] = useState(true);
  const [editing, setEditing] = useState<SectionRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editClass, setEditClass] = useState("");
  const [editRoom, setEditRoom] = useState("");
  const [editFixed, setEditFixed] = useState(true);
  const [deleting, setDeleting] = useState<SectionRow | null>(null);
  const [pending, startTransition] = useTransition();

  const classMap = Object.fromEntries(classes.map((c) => [c.id, c.name]));
  const roomMap = Object.fromEntries(rooms.map((r) => [r.id, r.name]));

  function handleCreate() {
    startTransition(async () => {
      const res = await createSection(classId, name, roomId || null, fixed);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Section added");
        setName("");
        setClassId("");
        setRoomId("");
      }
    });
  }

  function handleUpdate() {
    if (!editing) return;
    startTransition(async () => {
      const res = await updateSection(editing.id, editClass, editName, editRoom || null, editFixed);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Section updated");
        setEditing(null);
      }
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteSection(deleting.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Section deleted");
        setDeleting(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-slate-50 p-4">
          <p className="mb-3 text-sm font-medium text-slate-600">Add section</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Class</Label>
              <Select value={classId} onValueChange={(v) => setClassId(v ?? "")} items={classes.map(c => ({ value: c.id, label: c.name }))}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Section name</Label>
              <Input placeholder="e.g. A" value={name} onChange={(e) => setName(e.target.value)} className="w-28" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Room (required)</Label>
              <Select value={roomId} onValueChange={(v) => setRoomId(v ?? "")} items={rooms.map(r => ({ value: r.id, label: r.name }))}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={fixed} onChange={(e) => setFixed(e.target.checked)} />
              Fixed room
            </label>
            <Button onClick={handleCreate} disabled={pending || !classId || !name.trim() || !roomId} className="bg-[#0d9488] hover:bg-[#0b7a70]">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {sections.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              {editing?.id === s.id ? (
                <div className="flex flex-1 flex-wrap items-end gap-2">
                  <Select value={editClass} onValueChange={(v) => setEditClass(v ?? "")} items={classes.map(c => ({ value: c.id, label: c.name }))}>
                    <SelectTrigger className="w-40">
                      <SelectValue>{classMap[editClass]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-24" />
                  <Select value={editRoom} onValueChange={(v) => setEditRoom(v ?? "")} items={rooms.map(r => ({ value: r.id, label: r.name }))}>
                    <SelectTrigger className="w-40">
                      <SelectValue>{editRoom ? roomMap[editRoom] : "Select room"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {rooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editFixed} onChange={(e) => setEditFixed(e.target.checked)} />
                    Fixed
                  </label>
                  <Button size="sm" onClick={handleUpdate} disabled={pending || !editClass || !editName.trim() || !editRoom}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div>
                    <p className="font-medium text-[#1e3a5f]">{classMap[s.class_id]} — Section {s.name}</p>
                    <p className="text-xs text-slate-500">
                      {s.room_id ? `Room: ${roomMap[s.room_id]}` : "No fixed room"}
                      {s.fixed_room ? " · Fixed" : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditing(s);
                        setEditName(s.name);
                        setEditClass(s.class_id);
                        setEditRoom(s.room_id ?? "");
                        setEditFixed(s.fixed_room);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(s)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {sections.length === 0 && <p className="text-sm text-slate-400">No sections yet.</p>}
        </div>
      </CardContent>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete section?</AlertDialogTitle>
            <AlertDialogDescription>This will also delete its routine. This action cannot be undone.</AlertDialogDescription>
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
