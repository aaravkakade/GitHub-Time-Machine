"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [isLight, setIsLight] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setIsLight(document.documentElement.classList.contains("cc-light"));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("cc-light");
    document.documentElement.classList.toggle("cc-light", next);
    try {
      localStorage.setItem("cc-theme", next ? "light" : "dark");
    } catch {
      // Storage may be unavailable (private mode); the toggle still works.
    }
    setIsLight(next);
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      onClick={toggle}
    >
      {isLight === null ? (
        <span className="h-4 w-4" />
      ) : isLight ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </Button>
  );
}
