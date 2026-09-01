"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Shield, UserCog } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { createAdmin, deleteAdmin } from "@/app/admin/master-data/actions";

interface AdminRow {
  id: string;
  username: string;
  role: "super" | "admin";
  created_at: string;
}

export function AdminsTab({ admins }: { admins: AdminRow[] }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"super" | "admin">("admin");
  const [deleting, setDeleting] = useState<AdminRow | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      const res = await createAdmin(username, password, role);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Admin created");
        setOpen(false);
        setUsername("");
        setPassword("");
        setRole("admin");
      }
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteAdmin(deleting.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Admin deleted");
        setDeleting(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Admins</CardTitle>
        <Button onClick={() => setOpen(true)} className="bg-[#0d9488] hover:bg-[#0b7a70]">
          <Plus className="h-4 w-4" /> New Admin
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div className="flex items-center gap-2">
                {a.role === "super" ? (
                  <Shield className="h-4 w-4 text-amber-500" />
                ) : (
                  <UserCog className="h-4 w-4 text-slate-500" />
                )}
                <span className="font-medium text-[#1e3a5f]">{a.username}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{a.role}</span>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setDeleting(a)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
          {admins.length === 0 && <p className="text-sm text-slate-400">No admins yet.</p>}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Username *</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Password (min 6 chars) *</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v as "super" | "admin")} items={[{ value: "admin", label: "Admin" }, { value: "super", label: "Super" }]}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super">Super</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={pending} className="bg-[#0d9488] hover:bg-[#0b7a70]">
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete admin?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.role === "super"
                ? "Warning: deleting a super admin reduces super access."
                : "This action cannot be undone."}
            </AlertDialogDescription>
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
