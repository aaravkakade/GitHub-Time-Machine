"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { RepositoryAnalysis } from "@/domains/schemas";
import { useWorkspaceStore } from "@/store/workspace-store";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { RepoHeader } from "./repo-header";
import { Timeline } from "./timeline/timeline";
import { InsightPanel } from "./panel/insight-panel";

const ArchitectureCanvas = dynamic(
  () => import("./canvas/architecture-canvas"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3 text-center">
          <Skeleton className="mx-auto h-40 w-40 rounded-full" />
          <p className="text-xs text-ink-3">Preparing architecture canvas…</p>
        </div>
      </div>
    ),
  },
);

export function Workspace({ analysis }: { analysis: RepositoryAnalysis }) {
  const init = useWorkspaceStore((s) => s.init);
  const panelOpen = useWorkspaceStore((s) => s.panelOpen);
  const setPanelOpen = useWorkspaceStore((s) => s.setPanelOpen);
  const reducedMotion = useReducedMotion() ?? false;
  const [mobileView, setMobileView] = React.useState<"graph" | "insights">(
    "graph",
  );

  // Initialize synchronously on first render so children see correct state.
  const initialized = React.useRef(false);
  if (!initialized.current) {
    init(analysis);
    initialized.current = true;
  }
  React.useEffect(() => init(analysis), [analysis, init]);

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="flex h-dvh flex-col bg-surface-0"
      data-testid="workspace"
    >
      <RepoHeader analysis={analysis} />

      {/* Mobile view switcher */}
      <div className="flex justify-center border-b border-line-0 bg-surface-1 py-1.5 md:hidden">
        <Segmented
          ariaLabel="Workspace view"
          value={mobileView}
          onChange={setMobileView}
          options={[
            { value: "graph", label: "Architecture" },
            { value: "insights", label: "Insights" },
          ]}
        />
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Canvas */}
        <div
          className={`relative min-w-0 flex-1 ${mobileView === "insights" ? "hidden md:block" : ""}`}
        >
          <ArchitectureCanvas analysis={analysis} />
          <Button
            size="icon"
            variant="secondary"
            aria-label={panelOpen ? "Hide insight panel" : "Show insight panel"}
            onClick={() => setPanelOpen(!panelOpen)}
            className="absolute top-3 right-3 z-10 hidden md:inline-flex"
          >
            {panelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Insight panel — sidebar on desktop, full pane on mobile */}
        <aside
          aria-label="Insight panel"
          className={`w-full border-line-0 bg-surface-1 md:w-[380px] md:border-l lg:w-[400px] ${
            mobileView === "insights" ? "block" : "hidden"
          } ${panelOpen ? "md:block" : "md:hidden"}`}
        >
          <InsightPanel analysis={analysis} />
        </aside>
      </div>

      <Timeline analysis={analysis} />
    </motion.div>
  );
}
