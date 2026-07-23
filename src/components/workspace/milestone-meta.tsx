import {
  Baby,
  Boxes,
  CircleDot,
  Flame,
  FolderTree,
  GitBranchPlus,
  Package,
  Rocket,
  Scissors,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { MilestoneCategory } from "@/domains/schemas";

export const MILESTONE_META: Record<
  MilestoneCategory,
  { icon: LucideIcon; label: string }
> = {
  founding: { icon: Baby, label: "Founding" },
  restructure: { icon: FolderTree, label: "Restructure" },
  "framework-adoption": { icon: Package, label: "Framework" },
  "dependency-shift": { icon: Boxes, label: "Dependencies" },
  testing: { icon: ShieldCheck, label: "Testing" },
  "ci-cd": { icon: GitBranchPlus, label: "CI/CD" },
  extraction: { icon: Scissors, label: "Extraction" },
  migration: { icon: Wrench, label: "Migration" },
  release: { icon: Rocket, label: "Release" },
  "growth-surge": { icon: TrendingUp, label: "Growth" },
  "mass-deletion": { icon: Trash2, label: "Deletion" },
  refactor: { icon: Wrench, label: "Refactor" },
  hotspot: { icon: Flame, label: "Hotspot" },
};

export const DEFAULT_MILESTONE_META = { icon: CircleDot, label: "Milestone" };
