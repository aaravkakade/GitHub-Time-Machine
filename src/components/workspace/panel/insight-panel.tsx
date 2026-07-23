"use client";

import * as React from "react";
import type { RepositoryAnalysis } from "@/domains/schemas";
import { useWorkspaceStore } from "@/store/workspace-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "./overview-tab";
import { ChangesTab } from "./changes-tab";
import { MilestoneTab } from "./milestone-tab";
import { ModuleTab } from "./module-tab";
import { DebtTab } from "./debt-tab";

type TabId = "overview" | "changes" | "debt" | "selection";

export function InsightPanel({ analysis }: { analysis: RepositoryAnalysis }) {
  const selection = useWorkspaceStore((s) => s.selection);
  const [tab, setTab] = React.useState<TabId>("overview");

  // Follow the user's selection into the contextual tab.
  React.useEffect(() => {
    if (selection) setTab("selection");
    else if (tab === "selection") setTab("overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const milestone =
    selection?.type === "milestone"
      ? analysis.milestones.find((m) => m.id === selection.id)
      : undefined;
  const moduleMeta =
    selection?.type === "module" ? analysis.modules[selection.id] : undefined;

  const selectionLabel = milestone
    ? "Milestone"
    : moduleMeta
      ? "Module"
      : null;

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as TabId)}
      className="flex h-full min-h-0 flex-col"
    >
      <TabsList aria-label="Insight panel sections" className="shrink-0">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="changes">Changes</TabsTrigger>
        <TabsTrigger value="debt">Debt signals</TabsTrigger>
        {selectionLabel && (
          <TabsTrigger value="selection">
            <span className="text-accent-strong">{selectionLabel}</span>
          </TabsTrigger>
        )}
      </TabsList>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="overview">
          <OverviewTab analysis={analysis} />
        </TabsContent>
        <TabsContent value="changes">
          <ChangesTab analysis={analysis} />
        </TabsContent>
        <TabsContent value="debt">
          <DebtTab analysis={analysis} />
        </TabsContent>
        <TabsContent value="selection">
          {milestone && <MilestoneTab analysis={analysis} milestone={milestone} />}
          {moduleMeta && <ModuleTab analysis={analysis} moduleMeta={moduleMeta} />}
        </TabsContent>
      </div>
    </Tabs>
  );
}
