import { expect, type Locator, type Page, test } from "@playwright/test";

// The Hunt against the mock chain: a pack is bought, drawn one block later, torn, and its cards are dealt
// into the binder. Each test starts from the mock seed (Harry Kane wanted, 10,000 $WIF prize).

async function connect(page: Page) {
  await page
    .getByRole("button", { name: /^Connect( Wallet)?$/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Connect a Wallet" });
  await sheet.getByRole("button", { name: "Connect Wallet", exact: true }).click();
  await expect(sheet).toBeHidden();
}

async function buyAndTear(page: Page, tier: "silver" | "gold" | "diamond"): Promise<Locator> {
  await page.getByTestId(`buy-${tier}`).click();
  // The page blurs behind the stage: wallet steps first, then the pack large in the middle.
  const stage = page.getByRole("dialog", { name: "Your pack" });
  await expect(stage.getByText(/^Approve \$WIF/)).toBeVisible();
  await expect(stage.getByTestId("hunt-pack")).toBeVisible({ timeout: 15_000 });
  await stage.getByRole("button", { name: "Drag across the top to open" }).focus();
  await page.keyboard.press("Enter");
  await expect(stage.getByTestId("hunt-reveal")).toBeVisible({ timeout: 10_000 });
  return stage;
}

test("buy a Silver pack, tear it, and its three cards reach the binder", async ({ page }) => {
  await page.goto("/hunt");
  await expect(page.getByRole("heading", { name: "Find Kane" })).toBeVisible();
  await expect(page.getByTestId("hunt-prize")).toHaveText("10,000");

  await expect(page.getByTestId("connect-inline")).toBeVisible();
  await expect(page.getByTestId("buy-silver")).toBeDisabled();
  await connect(page);
  await expect(page.getByTestId("buy-silver")).toBeEnabled();

  const stage = await buyAndTear(page, "silver");
  // One card at a time: a tap sends the front card back and brings the next one up.
  await expect(stage.getByTestId("hunt-deck-count")).toContainText("1 / 3");
  await stage.getByRole("button", { name: /Show the next card/ }).click();
  await expect(stage.getByTestId("hunt-deck-count")).toContainText("2 / 3");
  await stage.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(stage).toBeHidden();
  await expect(page.getByTestId("hunt-cards")).toHaveText("3");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Binder" }).click();
  await expect(page.getByTestId("hunt-shelf").locator("li")).toHaveCount(3);
});

test("a pack that finds the wanted player wins; admin records the payment", async ({ page }) => {
  await page.goto("/ops");
  await connect(page);
  await page.getByRole("tab", { name: /^Hunt/ }).click();
  await page.getByRole("button", { name: "Next Pack Finds Him (Demo)" }).click();

  await page.goto("/hunt");
  const stage = await buyAndTear(page, "gold");
  await expect(stage.getByText("You found Kane")).toBeVisible();
  await stage.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByTestId("hunt-win")).toContainText("10,000");
  await expect(page.getByTestId("buy-gold")).toBeDisabled();
  await page.getByTestId("hunt-win").getByTestId("hunt-claim").click();
  await expect(page.getByTestId("hunt-win")).toContainText("Claimed");

  await page.goto("/ops");
  await page.getByRole("tab", { name: "Hunt · 1" }).click();
  const payout = page.getByTestId("payout");
  await expect(payout).toContainText("Claimed, waiting for your transfer");
  await payout.getByLabel("Transfer transaction hash").fill(`0x${"ab".repeat(32)}`);
  await payout.getByRole("button", { name: "Mark Paid" }).click();
  await expect(payout).toContainText("Paid");
  await expect(page.getByRole("tab", { name: "Hunt", exact: true })).toBeVisible();
});
