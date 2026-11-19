import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

export default function Settings() {
  const [parallelism, setParallelism] = useState([4]);
  const [notifications, setNotifications] = useState(true);

  return (
    <Tabs defaultValue="general" className="flex flex-col gap-4">
      <TabsList className="self-start">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="runner">Runner</TabsTrigger>
      </TabsList>
      <TabsContent value="general">
        <form
          className="flex max-w-lg flex-col gap-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="daemon-url">Daemon URL</FieldLabel>
              <Input id="daemon-url" placeholder="http://localhost:8080" />
              <FieldDescription>
                Where the dashboard sends API requests.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="log-level">Log level</FieldLabel>
              <NativeSelect id="log-level" defaultValue="info">
                <NativeSelectOption value="debug">debug</NativeSelectOption>
                <NativeSelectOption value="info">info</NativeSelectOption>
                <NativeSelectOption value="warn">warn</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="motd">Welcome message</FieldLabel>
              <Textarea id="motd" placeholder="Shown on the jobs page…" rows={3} />
            </Field>
            <Field orientation="horizontal">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="notif">Notifications</FieldLabel>
                <FieldDescription>Email on run failure.</FieldDescription>
              </div>
              <Switch id="notif" checked={notifications} onCheckedChange={setNotifications} />
            </Field>
          </FieldGroup>
          <div className="flex gap-2">
            <Button type="submit">Save</Button>
            <Sheet>
              <SheetTrigger
                render={<Button variant="outline">Danger zone</Button>}
              />
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Danger zone</SheetTitle>
                  <SheetDescription>
                    Reset all dashboard settings to defaults.
                  </SheetDescription>
                </SheetHeader>
                <SheetFooter>
                  <Button variant="destructive">Reset settings</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </form>
      </TabsContent>
      <TabsContent value="runner">
        <div className="flex max-w-lg flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Max parallelism: {parallelism[0]}</Label>
            <Slider
              value={parallelism}
              onValueChange={(v) => setParallelism(Array.isArray(v) ? [...v] : [v])}
              min={1}
              max={16}
              step={1}
            />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
