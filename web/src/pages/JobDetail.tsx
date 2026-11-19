import { useEffect, useState } from "react";
import { api, type Job } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ui/code-block";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";

export default function JobDetail({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    api.getJob(id).then(setJob);
  }, [id]);

  if (!job) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const pct =
    job.status === "succeeded" ? 100 : job.status === "running" ? 62 : job.status === "failed" ? 81 : 4;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          ← Jobs
        </Button>
        <h2 className="text-lg font-semibold">{job.name}</h2>
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="cursor-help rounded border px-1.5 text-xs text-muted-foreground">
                {job.id}
              </span>
            }
          />
          <TooltipContent>Full job id: {job.id}</TooltipContent>
        </Tooltip>
      </div>

      {job.status === "failed" && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>Run failed</AlertTitle>
          <AlertDescription>
            Exit code 1 after {job.durationMs}ms. See logs tab.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-base">
            Overview
            <HoverCard>
              <HoverCardTrigger
                render={
                  <span className="cursor-help text-xs font-normal text-muted-foreground underline decoration-dotted">
                    {job.command}
                  </span>
                }
              />
              <HoverCardContent className="text-xs">
                Ran at {job.createdAt} · {(job.durationMs / 1000).toFixed(1)}s
                · status {job.status}
              </HoverCardContent>
            </HoverCard>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Progress value={pct} />
          <Separator />
          <Tabs defaultValue="logs">
            <TabsList>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="meta">Metadata</TabsTrigger>
            </TabsList>
            <TabsContent value="logs">
              <ScrollArea className="h-56 rounded-md border">
                <CodeBlock>
                  <CodeBlockHeader>
                    <CodeBlockTitle>stdout</CodeBlockTitle>
                  </CodeBlockHeader>
                  <CodeBlockContent>{job.log}</CodeBlockContent>
                </CodeBlock>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="meta" className="text-sm">
              <p>ID: {job.id}</p>
              <p>Command: {job.command}</p>
              <p>Created: {job.createdAt}</p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
