import { useState } from "react";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Keys from "./pages/Keys";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Showcase from "./pages/Showcase";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type Tab = "jobs" | "keys" | "reports" | "settings" | "gallery";

const TABS: { id: Tab; label: string }[] = [
  { id: "jobs", label: "Jobs" },
  { id: "keys", label: "API Keys" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
  { id: "gallery", label: "Gallery" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("jobs");
  const [jobId, setJobId] = useState<string | null>(null);

  const active = TABS.find((t) => t.id === tab)!;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <span className="px-2 text-sm font-semibold">CodeRuns</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {TABS.map((t) => (
                  <SidebarMenuItem key={t.id}>
                    <SidebarMenuButton
                      isActive={tab === t.id}
                      onClick={() => {
                        setTab(t.id);
                        setJobId(null);
                      }}
                    >
                      {t.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <SidebarTrigger />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#" onClick={(e) => e.preventDefault()}>
                  CodeRuns
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{jobId ? "Job detail" : active.label}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <Menubar>
              <MenubarMenu>
                <MenubarTrigger>File</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem onSelect={() => setTab("jobs")}>Jobs</MenubarItem>
                  <MenubarItem onSelect={() => setTab("reports")}>Reports</MenubarItem>
                  <MenubarItem onSelect={() => setTab("settings")}>Settings</MenubarItem>
                </MenubarContent>
              </MenubarMenu>
              <MenubarMenu>
                <MenubarTrigger>Help</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem onSelect={() => setTab("gallery")}>
                    Component gallery
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
          </div>
        </header>
        <main className="p-4">
          {tab === "jobs" &&
            (jobId ? (
              <JobDetail id={jobId} onBack={() => setJobId(null)} />
            ) : (
              <Jobs onSelect={(id) => setJobId(id)} />
            ))}
          {tab === "keys" && <Keys />}
          {tab === "reports" && <Reports />}
          {tab === "settings" && <Settings />}
          {tab === "gallery" && <Showcase />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
