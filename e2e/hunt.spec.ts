import { expect, type Locator, type Page, test } from "@playwright/test";

/** A filter key is a list on desktop and a dropdown on a phone: open it first when it is one. */
async function pickFilter(page: Page, testId: string, key: string) {
  const trigger = page.getByTestId(testId);
  if (await trigger.isVisible()) await trigger.click();
  await page.getByTestId(`${testId}-${key}`).click();
}

// The Hunt against the mock chain: a pack is bought, drawn one block later, torn, and its cards are dealt
// into the binder. Each test starts from the mock seed (three Harry Kane cards in a 1,000-card deck,
// 10,000 $WIF prize each).

async function connect(page: Page) {
  await page
    .getByRole("button", { name: /^Connect( Wallet)?$/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Connect a Wallet" });
  await sheet.getByRole("button", { name: "Connect Wallet", exact: true }).click();
  await expect(sheet).toBeHidden();
}

async function buyAndTear(page: Page, tier: "silver" | "gold" | "diamond", free = false): Promise<Locator> {
  await page.getByTestId(`buy-${tier}`).click();
  // The page blurs behind the stage: wallet steps first, then the pack large in the middle.
  const stage = page.getByRole("dialog", { name: "Your pack" });
  if (!free) await expect(stage.getByText(/^Approve \$WIF/)).toBeVisible();
  await expect(stage.getByTestId("hunt-pack")).toBeVisible({ timeout: 15_000 });
  await stage.getByRole("button", { name: "Drag across the top to open" }).focus();
  await page.keyboard.press("Enter");
  await expect(stage.getByTestId("hunt-reveal")).toBeVisible({ timeout: 10_000 });
  return stage;
}

test("buy a Silver pack, tear it, mint the one card you want; only that card reaches the binder", async ({
  page,
}) => {
  await page.goto("/hunt");
  await expect(page.getByRole("heading", { name: "Find Kane" })).toBeVisible();
  await expect(page.getByTestId("hunt-prize")).toHaveText("10,000");
  await expect(page.getByTestId("hunt-wanted-left")).toHaveText("3 of 3");

  await expect(page.getByTestId("connect-inline")).toBeVisible();
  await expect(page.getByTestId("buy-silver")).toBeDisabled();
  await connect(page);
  await expect(page.getByTestId("buy-silver")).toBeEnabled();

  const stage = await buyAndTear(page, "silver");
  // One card at a time: a tap sends the front card back and brings the next one up.
  await expect(stage.getByTestId("hunt-deck-count")).toContainText("1 / 3");
  await stage.getByRole("button", { name: /Show the next card/ }).click();
  await expect(stage.getByTestId("hunt-deck-count")).toContainText("2 / 3");
  // Opening mints nothing; this card is kept on purpose.
  await stage.getByTestId("hunt-mint").click();
  await expect(stage.getByTestId("hunt-minted")).toBeVisible();
  await stage.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(stage).toBeHidden();
  await expect(page.getByTestId("hunt-cards")).toHaveText("1");

  // The opened pack stays one tap away for the rest of its cards.
  await page.getByRole("button", { name: /Silver #\d+, 2 to mint/ }).click();
  await expect(stage.getByTestId("hunt-deck-count")).toContainText("1 / 3");
  await stage.getByRole("button", { name: "Close", exact: true }).last().click();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Binder" }).click();
  await expect(page.getByTestId("hunt-shelf").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("binder-filter-hunt")).toContainText("1");
  await pickFilter(page, "binder-filter", "matches");
  await expect(page.getByTestId("hunt-shelf")).toHaveCount(0);
  await pickFilter(page, "binder-filter", "hunt");
  await expect(page.getByTestId("hunt-shelf").locator("li")).toHaveCount(1);
});

test("a pack that finds a wanted card wins its prize; the deck stays open; admin records the payment", async ({
  page,
}) => {
  await page.goto("/ops");
  await connect(page);
  await page.getByRole("tab", { name: /^Hunt/ }).click();
  await page.getByRole("button", { name: "Next Pack Finds Him (Demo)" }).click();

  await page.goto("/hunt");
  const stage = await buyAndTear(page, "gold");
  await expect(stage.getByText("You found Kane")).toBeVisible();
  await stage.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByTestId("hunt-win")).toContainText("10,000");
  await expect(page.getByTestId("hunt-wanted-left")).toHaveText("2 of 3");
  await expect(page.getByTestId("buy-gold")).toBeEnabled();
  await page.getByTestId("hunt-win").getByTestId("hunt-claim").click();
  await expect(page.getByTestId("hunt-win")).toContainText("Claimed");

  // The prize counts on the leaderboard (All Time) as soon as the card is found.
  await page.goto("/leaderboard");
  await expect(page.getByTestId("leader-me").first()).toContainText("1 Hunt find");

  await page.goto("/ops");
  await page.getByRole("tab", { name: "Hunt · 1" }).click();
  const payout = page.getByTestId("payout");
  await expect(payout).toContainText("Claimed, waiting for your transfer");
  await payout.getByLabel("Transfer transaction hash").fill(`0x${"ab".repeat(32)}`);
  await payout.getByRole("button", { name: "Mark Paid" }).click();
  await expect(payout).toContainText("Paid");
  await expect(page.getByRole("tab", { name: "Hunt", exact: true })).toBeVisible();
});

test("a free Silver allowlist gives each listed wallet one pack", async ({ page }) => {
  await page.goto("/ops");
  await connect(page);
  await page.getByRole("tab", { name: /^Hunt/ }).click();
  const silver = page.getByTestId("tier-editor-0");
  await silver.getByLabel("Price in $WIF").fill("0");
  await silver.getByRole("checkbox").check();
  await silver
    .getByTestId("tier-allowlist-0")
    .fill("wallet\n0xba11f1a70000000000000000000000000000fa11\n0x0000000000000000000000000000000000000b0b\n");
  await expect(silver).toContainText("2 wallets");
  await page.getByTestId("tier-save-0").click();
  await expect(silver).toContainText("now free");

  await page.goto("/hunt");
  await expect(page.getByTestId("buy-silver")).toHaveText("Open Free Silver");
  const stage = await buyAndTear(page, "silver", true);
  await expect(stage.getByTestId("hunt-deck-count")).toContainText("1 / 3");
  await stage.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByTestId("buy-silver")).toHaveText("Free Pack Used");
  await expect(page.getByTestId("buy-silver")).toBeDisabled();

  // Back in the admin panel the live list is already in the box, ready to take new wallets.
  await page.goto("/ops");
  await page.getByRole("tab", { name: /^Hunt/ }).click();
  const box = page.getByTestId("tier-editor-0").getByTestId("tier-allowlist-0");
  await expect(box).toHaveValue(/0xBa11F1A70000000000000000000000000000Fa11/i);
  await expect(box).toHaveValue(/0x0000000000000000000000000000000000000B0b/i);
  await expect(page.getByTestId("tier-editor-0")).toContainText("The live list (2 wallets) is loaded");
});
