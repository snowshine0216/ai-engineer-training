// tests/e2e/interview-happy-path.spec.ts
import { test, expect } from "@playwright/test";

test("sends a prompt and receives a streaming answer with done event in the timeline", async ({ page }) => {
  await page.goto("/");

  // Send a simple prompt
  await page.fill("textarea#prompt-input", "What is 2 + 2?");
  await page.click('button[aria-label="Send prompt"]');

  // Timeline should show accepted immediately
  await expect(page.locator("text=Accepted. Running.")).toBeVisible({ timeout: 5000 });

  // Status chip should switch to running
  await expect(page.locator("text=Running")).toBeVisible();

  // Answer should eventually appear
  await expect(page.locator('[aria-live="polite"]')).not.toBeEmpty({ timeout: 20000 });

  // Done should appear in timeline
  await expect(page.locator("text=Done.")).toBeVisible({ timeout: 25000 });

  // Status chip should switch to done
  await expect(page.locator("text=Done")).toBeVisible();
});
