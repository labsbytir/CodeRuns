import { useEffect, useMemo, useState } from "react";
import { api, type Job } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { MoreHorizontal, Plus } from "lucide-react";

const PAGE_SIZE = 5;

function statusVariant(s: Job["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (s === "succeeded") return "default";
  if (s === "failed") return "destructive";
  if (s === "running") return "secondary";
  return "outline";
}

export default function Jobs({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");

  useEffect(() => {
    api.listJobs().then(setJobs);
  }, []);

  const filtered = useMemo(() => {
    const list = jobs ?? [];
    return list.filter(
      (j) =>
        (status === "all" || j.status === status) &&
        (q === "" || j.name.toLowerCase().includes(q.toLowerCase())),
    );
  }, [jobs, q, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const drawerJob = jobs?.find((j) => j.id === drawerId) ?? null;

  async function runNew() {
    if (!name.trim()) return;
    const job = await api.runJob(name.trim(), command.trim() || "echo hello");
    setJobs((prev) => [job, ...(prev ?? [])]);
    setName("");
    setCommand("");
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter jobs…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Plus className="size-4" /> Run new
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Run a job</DialogTitle>
                <DialogDescription>
                  Queue a one-off run on the daemon.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="job-name">Name</Label>
                  <Input
                    id="job-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="nightly-build"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="job-cmd">Command</Label>
                  <Input
                    id="job-cmd"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="npm run build"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={runNew}>Queue run</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {jobs === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No jobs found</EmptyTitle>
            <EmptyDescription>
              Try a different filter, or queue a new run.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Run new
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="font-medium">
                  <button
                    type="button"
                    className="underline-offset-4 hover:underline"
                    onClick={() => onSelect(j.id)}
                  >
                    {j.name}
                  </button>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(j.status)}>{j.status}</Badge>
                </TableCell>
                <TableCell>{j.createdAt.slice(0, 10)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onSelect(j.id)}>
                        View details
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDrawerId(j.id)}>
                        Quick preview
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setPage((p) => Math.max(1, p - 1));
              }}
            />
          </PaginationItem>
          {Array.from({ length: pages }, (_, i) => (
            <PaginationItem key={i}>
              <PaginationLink
                href="#"
                isActive={page === i + 1}
                onClick={(e) => {
                  e.preventDefault();
                  setPage(i + 1);
                }}
              >
                {i + 1}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setPage((p) => Math.min(pages, p + 1));
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      <Drawer open={drawerId !== null} onOpenChange={(o) => !o && setDrawerId(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{drawerJob?.name ?? "Job"}</DrawerTitle>
            <DrawerDescription>
              {drawerJob?.id} · {drawerJob?.command}
            </DrawerDescription>
          </DrawerHeader>
          <pre className="mx-4 mb-6 overflow-auto rounded-md bg-muted p-4 text-xs">
            {drawerJob?.log}
          </pre>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
