import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Calendar } from "@/components/ui/calendar";
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
} from "@/components/ui/pagination";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const chartData = [
  { day: "Mon", runs: 12 },
  { day: "Tue", runs: 19 },
  { day: "Wed", runs: 8 },
  { day: "Thu", runs: 24 },
  { day: "Fri", runs: 15 },
];

const chartConfig: ChartConfig = {
  runs: { label: "Runs", color: "var(--chart-1)" },
};

const leaders = [
  { name: "ci-main", runs: 42, initials: "CI" },
  { name: "nightly", runs: 27, initials: "NI" },
  { name: "local-dev", runs: 13, initials: "LD" },
];

export default function Reports() {
  const [range, setRange] = useState("7d");
  const [date, setDate] = useState<Date | undefined>(new Date("2026-11-19"));
  const [threshold, setThreshold] = useState([10]);
  const [granularity, setGranularity] = useState("day");
  const [failedOnly, setFailedOnly] = useState(false);
  const [metric, setMetric] = useState("runs");
  const [cmdOpen, setCmdOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => { if (v) setRange(v); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline">
                {date ? date.toDateString() : "Pick a date"}
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0">
            <Calendar mode="single" selected={date} onSelect={setDate} />
          </PopoverContent>
        </Popover>
        <Button variant="outline" onClick={() => setCmdOpen((v) => !v)}>
          Command palette
        </Button>
      </div>

      {cmdOpen && (
        <Command className="rounded-lg border">
          <CommandInput placeholder="Search reports…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Reports">
              <CommandItem onSelect={() => setCmdOpen(false)}>
                Weekly summary
              </CommandItem>
              <CommandItem onSelect={() => setCmdOpen(false)}>
                Failure breakdown
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total runs", value: "82" },
          { label: "Success rate", value: "91%" },
          { label: "Median duration", value: "18.4s" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{s.value}</CardContent>
          </Card>
        ))}
      </div>

      <ResizablePanelGroup orientation="horizontal" className="rounded-lg border">
        <ResizablePanel defaultSize={60}>
          <Card className="border-0 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Runs per day ({range})</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-56 w-full">
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="runs" fill="var(--color-runs)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={40}>
          <div className="flex h-full flex-col gap-3 p-4">
            <div className="flex flex-col gap-1.5">
              <Label>Min runs threshold: {threshold[0]}</Label>
              <Slider
                value={threshold}
                onValueChange={(v) => setThreshold(Array.isArray(v) ? [...v] : [v])}
                min={0}
                max={30}
                step={1}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Granularity</Label>
              <RadioGroup value={granularity} onValueChange={setGranularity} className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="day" id="g-day" />
                  <Label htmlFor="g-day">Day</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="week" id="g-week" />
                  <Label htmlFor="g-week">Week</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="failed-only"
                checked={failedOnly}
                onCheckedChange={(v) => setFailedOnly(v === true)}
              />
              <Label htmlFor="failed-only">Failed runs only</Label>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Metric</Label>
              <ToggleGroup
                value={[metric]}
                onValueChange={(v) => { if (v[0]) setMetric(v[0]); }}
              >
                <ToggleGroupItem value="runs">Runs</ToggleGroupItem>
                <ToggleGroupItem value="duration">Duration</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Runner</TableHead>
                    <TableHead>Runs</TableHead>
                    <TableHead className="text-right">Owner</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaders.map((l) => (
                    <TableRow key={l.name}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell>{l.runs}</TableCell>
                      <TableCell className="text-right">
                        <Avatar className="ml-auto size-7">
                          <AvatarFallback>{l.initials}</AvatarFallback>
                        </Avatar>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
        />
        <ContextMenuContent>
          <ContextMenuItem>Export CSV</ContextMenuItem>
          <ContextMenuItem>Copy table</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#" isActive>
              1
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      <Accordion>
        <AccordionItem value="notes">
          <AccordionTrigger>Report notes</AccordionTrigger>
          <AccordionContent>
            Threshold ≥ {threshold[0]} · granularity {granularity} · metric {metric} ·
            {failedOnly ? " failed only" : " all runs"}.
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button variant="outline" size="sm">
              Advanced options
            </Button>
          }
        />
        <CollapsibleContent className="pt-2 text-sm text-muted-foreground">
          Includes queued runners and warm-up time. <Spinner className="ml-2 inline" />
        </CollapsibleContent>
      </Collapsible>

      <Carousel className="mx-10">
        <CarouselContent>
          {leaders.map((l) => (
            <CarouselItem key={l.name} className="basis-1/2">
              <AspectRatio ratio={16 / 9} className="rounded-lg border bg-muted">
                <div className="flex h-full items-center justify-center text-sm font-medium">
                  {l.name} · {l.runs} runs
                </div>
              </AspectRatio>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
}
