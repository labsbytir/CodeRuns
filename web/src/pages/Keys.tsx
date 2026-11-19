import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type ApiKey } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Kbd } from "@/components/ui/kbd";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { ToastProvider } from "@/components/ui/toast";
import { Copy, Plus } from "lucide-react";

export default function Keys() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [showRevoked, setShowRevoked] = useState(true);

  useEffect(() => {
    api.listKeys().then(setKeys);
  }, []);

  const visible = (keys ?? []).filter((k) => showRevoked || !k.revoked);

  async function create() {
    if (!name.trim()) return;
    const k = await api.createKey(name.trim());
    setKeys((prev) => [k, ...(prev ?? [])]);
    setName("");
    setOpen(false);
    toast.success("API key created");
  }

  async function revoke(id: string) {
    await api.revokeKey(id);
    setKeys((prev) => (prev ?? []).map((k) => (k.id === id ? { ...k, revoked: true } : k)));
    toast.success("Key revoked");
  }

  function copy(prefix: string) {
    void navigator.clipboard?.writeText(prefix).catch(() => undefined);
    toast.success("Prefix copied");
  }

  return (
    <ToastProvider>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="show-revoked" checked={showRevoked} onCheckedChange={setShowRevoked} />
            <Label htmlFor="show-revoked">Show revoked</Label>
          </div>
          <div className="ml-auto">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger
                render={
                  <Button>
                    <Plus className="size-4" /> New key
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create API key</DialogTitle>
                  <DialogDescription>
                    Keys authenticate the daemon API.
                  </DialogDescription>
                </DialogHeader>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="key-name">Key name</FieldLabel>
                    <Input
                      id="key-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ci-runner"
                    />
                    <FieldDescription>
                      Use a descriptive name, e.g. <Kbd>ci-main</Kbd>.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
                <DialogFooter>
                  <Button onClick={create}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{k.prefix}…</code>
                </TableCell>
                <TableCell>{k.createdAt}</TableCell>
                <TableCell>{k.revoked ? "revoked" : "active"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => copy(k.prefix)}>
                      <Copy className="size-4" />
                    </Button>
                    {!k.revoked && (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button variant="outline" size="sm">
                              Revoke
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke {k.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently disables the key. Runners using
                              it will fail to authenticate.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => revoke(k.id)}>
                              Revoke key
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          Press <Kbd>⌘</Kbd> + <Kbd>C</Kbd> after selecting a prefix to copy it manually.
        </p>
      </div>
    </ToastProvider>
  );
}
