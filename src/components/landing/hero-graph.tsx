"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface EraNode {
  id: string;
  x: number;
  y: number;
  r: number;
  hue: 1 | 2 | 3 | 4 | 5;
  fresh?: boolean;
}

interface Era {
  year: string;
  label: string;
  nodes: EraNode[];
  edges: [string, string][];
}

/** Four scripted "eras" of a fictional architecture, looping forever. */
const ERAS: Era[] = [
  {
    year: "2019",
    label: "A single service",
    nodes: [
      { id: "app", x: 280, y: 170, r: 26, hue: 1 },
      { id: "db", x: 360, y: 230, r: 14, hue: 3 },
      { id: "cfg", x: 200, y: 230, r: 11, hue: 1 },
    ],
    edges: [
      ["app", "db"],
      ["app", "cfg"],
    ],
  },
  {
    year: "2020",
    label: "An API grows",
    nodes: [
      { id: "app", x: 250, y: 150, r: 30, hue: 1 },
      { id: "db", x: 355, y: 235, r: 17, hue: 3 },
      { id: "cfg", x: 165, y: 225, r: 11, hue: 1 },
      { id: "api", x: 360, y: 110, r: 20, hue: 2, fresh: true },
      { id: "auth", x: 425, y: 175, r: 13, hue: 2, fresh: true },
    ],
    edges: [
      ["app", "db"],
      ["app", "cfg"],
      ["api", "app"],
      ["api", "auth"],
      ["auth", "db"],
    ],
  },
  {
    year: "2022",
    label: "Realtime joins the party",
    nodes: [
      { id: "app", x: 235, y: 160, r: 32, hue: 1 },
      { id: "db", x: 340, y: 250, r: 19, hue: 3 },
      { id: "cfg", x: 150, y: 240, r: 10, hue: 1 },
      { id: "api", x: 355, y: 105, r: 24, hue: 2 },
      { id: "auth", x: 435, y: 165, r: 14, hue: 2 },
      { id: "ws", x: 160, y: 90, r: 18, hue: 4, fresh: true },
      { id: "queue", x: 250, y: 60, r: 13, hue: 4, fresh: true },
      { id: "cache", x: 440, y: 250, r: 12, hue: 3, fresh: true },
    ],
    edges: [
      ["app", "db"],
      ["app", "cfg"],
      ["api", "app"],
      ["api", "auth"],
      ["auth", "db"],
      ["ws", "app"],
      ["ws", "queue"],
      ["queue", "app"],
      ["api", "cache"],
    ],
  },
  {
    year: "2024",
    label: "Extracted into packages",
    nodes: [
      { id: "app", x: 220, y: 175, r: 27, hue: 1 },
      { id: "db", x: 320, y: 265, r: 18, hue: 3 },
      { id: "api", x: 350, y: 100, r: 26, hue: 2 },
      { id: "auth", x: 440, y: 150, r: 14, hue: 2 },
      { id: "ws", x: 150, y: 95, r: 19, hue: 4 },
      { id: "queue", x: 250, y: 55, r: 13, hue: 4 },
      { id: "cache", x: 445, y: 240, r: 12, hue: 3 },
      { id: "sdk", x: 105, y: 245, r: 16, hue: 5, fresh: true },
      { id: "proto", x: 300, y: 180, r: 12, hue: 5, fresh: true },
    ],
    edges: [
      ["app", "db"],
      ["api", "app"],
      ["api", "auth"],
      ["auth", "db"],
      ["ws", "app"],
      ["ws", "queue"],
      ["queue", "app"],
      ["api", "cache"],
      ["sdk", "proto"],
      ["app", "proto"],
      ["api", "proto"],
    ],
  },
];

const HOLD_MS = 3200;

export function HeroGraph() {
  const reducedMotion = useReducedMotion() ?? false;
  const [era, setEra] = React.useState(reducedMotion ? ERAS.length - 1 : 0);

  React.useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(
      () => setEra((e) => (e + 1) % ERAS.length),
      HOLD_MS,
    );
    return () => clearInterval(timer);
  }, [reducedMotion]);

  const current = ERAS[era];
  const nodeById = new Map(current.nodes.map((n) => [n.id, n]));

  return (
    <div
      className="relative select-none"
      aria-label={`Animated preview: a dependency graph evolving over time, currently showing ${current.year} — ${current.label}`}
      role="img"
    >
      <svg viewBox="0 0 560 320" className="h-auto w-full">
        <AnimatePresence>
          {current.edges.map(([a, b]) => {
            const na = nodeById.get(a);
            const nb = nodeById.get(b);
            if (!na || !nb) return null;
            return (
              <motion.line
                key={`${a}-${b}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 0.45,
                  x1: na.x,
                  y1: na.y,
                  x2: nb.x,
                  y2: nb.y,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.9, ease: "easeInOut" }}
                stroke="var(--line-2)"
                strokeWidth={1.2}
              />
            );
          })}
        </AnimatePresence>
        <AnimatePresence>
          {current.nodes.map((n) => (
            <motion.g key={n.id}>
              <motion.circle
                cx={n.x}
                cy={n.y}
                r={n.r}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1, cx: n.x, cy: n.y, r: n.r }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{
                  duration: reducedMotion ? 0 : 0.9,
                  ease: [0.16, 1, 0.3, 1],
                }}
                fill={`color-mix(in srgb, var(--cluster-${n.hue}) 22%, transparent)`}
                stroke={`color-mix(in srgb, var(--cluster-${n.hue}) 65%, transparent)`}
                strokeWidth={1.4}
              />
              {n.fresh && !reducedMotion && (
                <motion.circle
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  initial={{ opacity: 0.7, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.8, cx: n.x, cy: n.y, r: n.r }}
                  transition={{ duration: 1.6, ease: "easeOut" }}
                  fill="none"
                  stroke="var(--add)"
                  strokeWidth={1.5}
                />
              )}
            </motion.g>
          ))}
        </AnimatePresence>
      </svg>

      {/* Era scrubber */}
      <div className="mt-2 flex items-center gap-3 px-2">
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            animate={{ width: `${((era + 1) / ERAS.length) * 100}%` }}
            transition={{ duration: reducedMotion ? 0 : 0.6, ease: "easeOut" }}
          />
        </div>
        <div className="w-28 text-right">
          <span className="font-mono text-xs text-ink-1">{current.year}</span>
          <span className="ml-2 hidden text-[10px] text-ink-3 sm:inline">
            {current.label}
          </span>
        </div>
      </div>
    </div>
  );
}
