import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: vi.fn() }),
}));

import { RepoInput } from "@/components/site/repo-input";
import { LiveRepoLoader } from "@/components/workspace/live-repo-loader";

describe("RepoInput", () => {
  it("shows a helpful error for invalid input and recovers", async () => {
    const user = userEvent.setup();
    render(<RepoInput />);
    const input = screen.getByTestId("repo-input");
    await user.type(input, "not a repo");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(/github\.com\/facebook\/react/i);
    expect(push).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "https://github.com/Facebook/React");
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/repo/facebook/react");
  });
});

describe("LiveRepoLoader error states", () => {
  it("surfaces analyze-request failures with the server's message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "This repository could not be analyzed.",
            hint: "It may be private.",
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<LiveRepoLoader owner="ghost" repo="missing" />);
    await waitFor(() => {
      expect(
        screen.getByText("This repository could not be analyzed."),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("It may be private.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows failure when the job errors during polling", async () => {
    const responses = [
      new Response(JSON.stringify({ status: "started" }), { status: 202 }),
      new Response(
        JSON.stringify({
          job: {
            id: "j",
            repoId: "a/b",
            mode: "lightweight",
            status: "failed",
            progress: [],
            error: "GitHub API rate limit reached.",
            startedAt: new Date().toISOString(),
            finishedAt: null,
          },
        }),
        { status: 200 },
      ),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift() ?? new Response("{}")));
    render(<LiveRepoLoader owner="a" repo="b" />);
    await waitFor(() => {
      expect(screen.getByText("GitHub API rate limit reached.")).toBeInTheDocument();
    });
  });

  it("renders the progress stages while running", async () => {
    const running = {
      job: {
        id: "j",
        repoId: "a/b",
        mode: "lightweight",
        status: "running",
        progress: [
          {
            stage: "milestones",
            label: "Detecting important milestones",
            percent: 40,
            at: new Date().toISOString(),
          },
        ],
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes("/status")) {
          return new Response(JSON.stringify(running), { status: 200 });
        }
        return new Response(JSON.stringify({ status: "started" }), { status: 202 });
      }),
    );
    render(<LiveRepoLoader owner="a" repo="b" />);
    await waitFor(() => {
      expect(screen.getByText("Analyzing repository")).toBeInTheDocument();
      expect(screen.getByText("Detecting important milestones")).toBeInTheDocument();
    });
  });
});
