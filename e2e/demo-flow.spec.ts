import { expect, test } from "@playwright/test";

/**
 * The primary product journey, end to end on the bundled demo:
 * open a demo repository → scrub the timeline → select a milestone →
 * inspect a module → enter comparison mode.
 */
test("demo repository time-travel journey", async ({ page }) => {
  // 1. Land and open the demo repository.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Watch any codebase",
  );
  await page.getByTestId("demo-chip-orbit").click();
  await expect(page.getByTestId("workspace")).toBeVisible();
  await expect(page.getByTestId("architecture-canvas")).toBeVisible();

  // Graph nodes render.
  await expect(page.locator(".react-flow__node").first()).toBeVisible({
    timeout: 20_000,
  });
  const dateLabel = page.getByTestId("timeline-date");
  const endDate = await dateLabel.textContent();

  // 2. Scrub the timeline back to the beginning via keyboard (accessible path).
  const handle = page.getByTestId("timeline-handle");
  await handle.focus();
  await page.keyboard.press("Home");
  await expect(dateLabel).not.toHaveText(endDate ?? "");
  await page.waitForTimeout(1000); // let removed nodes finish their exit animation
  const startNodes = await page.locator(".react-flow__node.react-flow__node-module").count();
  await page.keyboard.press("End");
  await page.waitForTimeout(1000); // graph transition
  const endNodes = await page.locator(".react-flow__node.react-flow__node-module").count();
  expect(endNodes).toBeGreaterThan(startNodes); // the architecture visibly grew

  // 3. Select a milestone from the timeline.
  await page.getByTestId(/milestone-marker-extraction/).first().click();
  const milestonePanel = page.getByTestId("milestone-detail");
  await expect(milestonePanel).toBeVisible();
  await expect(milestonePanel).toContainText("Detected signals");
  await expect(milestonePanel.getByRole("meter")).toBeVisible(); // confidence

  // 4. Open a module from the graph. Return to the latest snapshot first
  //    (the milestone click moved the timeline back to 2022, before the
  //    monorepo migration created packages/core/sync), then fit the view so
  //    nodes sit inside the viewport. `force` bypasses viewport actionability
  //    — React Flow positions nodes via transforms, so a valid node can
  //    register as "outside viewport".
  await handle.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Fit graph to screen" }).click();
  await page.waitForTimeout(700);
  await page.getByTestId("rf__node-mod:packages/core/sync").click({ force: true });
  const moduleDetail = page.getByTestId("module-detail");
  await expect(moduleDetail).toBeVisible();
  await expect(moduleDetail).toContainText("Main authors");

  // 5. Enter comparison mode and verify the diff renders.
  await page.getByTestId("compare-link").click();
  await expect(page.getByTestId("compare-workspace")).toBeVisible();
  await expect(page.getByText("Measured change")).toBeVisible();
  await expect(page.getByText(/commits between/i)).toBeVisible();
  // Two snapshot selectors exist and differ.
  const before = await page.getByTestId("compare-before").inputValue();
  const after = await page.getByTestId("compare-after").inputValue();
  expect(before).not.toBe(after);
});
