// tests/e2e/forced-retry-recovery.spec.ts
import { test, expect } from "@playwright/test";

test.skip(
  process.env.DEMO_MODE !== "true",
  "Requires DEMO_MODE=true to exercise the injected retry path",
);

test("demo mode injects a failure and the UI shows retrying then recovered", async ({ page }) => {
  await page.goto("/");

  await page.fill("textarea#prompt-input", "Tell me something interesting.");
  await page.click('button[aria-label="Send prompt"]');

  // Should show retrying row
  await expect(page.locator("text=Provider throttled. Retrying.")).toBeVisible({ timeout: 10000 });

  // Should show recovered row after attempt 2 succeeds
  await expect(page.locator("text=Recovered on attempt 2.")).toBeVisible({ timeout: 25000 });

  // Final answer should be in the answer pane
  await expect(page.locator('[aria-live="polite"]')).not.toBeEmpty({ timeout: 30000 });

  // Done row should be the last timeline row
  await expect(page.locator("text=Done.")).toBeVisible({ timeout: 30000 });
});
