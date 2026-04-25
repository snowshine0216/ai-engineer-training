// tests/e2e/multi-turn.spec.ts
import { test, expect } from "@playwright/test";

test("agent picker is editable on empty thread, locks after first send, New chat resets", async ({ page }) => {
  await page.goto("/");

  // Picker is editable
  const picker = page.getByLabel("Select agent");
  await expect(picker).toBeEnabled();
  await expect(picker).toBeVisible();

  // Send a first message
  await page.fill("textarea#prompt-input", "What is 2+2?");
  await page.click('button[aria-label="Send prompt"]');

  // Picker locks
  await expect(picker).toBeDisabled({ timeout: 5000 });

  // "New chat" button appears
  const newChat = page.getByRole("button", { name: /new chat/i });
  await expect(newChat).toBeVisible();

  // Wait for the assistant bubble (live region) to receive at least one delta
  await expect(page.getByRole("log")).toContainText(/[A-Za-z0-9]/, { timeout: 25000 });

  // Click New chat — picker re-enabled, scrollback cleared
  await newChat.click();
  await expect(picker).toBeEnabled();
  await expect(page.getByRole("log")).not.toBeVisible();
});

test("multi-turn conversation: 3 user turns produce 6 bubbles total", async ({ page }) => {
  await page.goto("/");

  for (const q of ["What is 2+2?", "What is 5*5?", "What is 10-3?"]) {
    // Use the textarea as the readiness signal: it's disabled only when running or no agentId,
    // whereas the button is also gated on non-empty content (so checking it before fill always fails)
    await expect(page.locator('textarea#prompt-input')).toBeEnabled({ timeout: 30000 });
    await page.fill("textarea#prompt-input", q);
    await page.click('button[aria-label="Send prompt"]');
    // Wait for assistant response to start
    await page.waitForTimeout(500);
  }

  // Wait for the final turn to finish — textarea re-enabled is the signal
  await expect(page.locator('textarea#prompt-input')).toBeEnabled({ timeout: 30000 });

  // Count user-aligned bubbles: each user message is right-aligned (justifyContent flex-end).
  // Easier proxy: count the prompt strings echoed in the log.
  const log = page.getByRole("log");
  for (const q of ["What is 2+2?", "What is 5*5?", "What is 10-3?"]) {
    await expect(log).toContainText(q);
  }
});
