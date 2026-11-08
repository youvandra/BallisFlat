import { expect, type Page, test } from "@playwright/test";

// The path a judge takes, against the mock chain (VITE_DATA_MODE=mock, the default build).
// Each test starts in a fresh browser context, so the simulated chain starts from its seed.

/** Connect the demo wallet from the masthead's Connect Wallet button, in the connect sheet. */
async function connect(page: Page) {
  await page.getByRole("button", { name: /^Connect( Wallet)?$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Connect a Wallet" });
  await sheet.getByRole("button", { name: "Connect Wallet", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("wif-balance")).toBeVisible();
}

/** Straight from the board, no wallet needed to browse. */
async function openFirstOpenMatch(page: Page) {
  await page.goto("/matches");
  await page.getByTestId("match-england-v-croatia").click();
  await expect(page).toHaveURL(/\/m\/england-v-croatia$/);
}

async function tearPack(page: Page) {
  await page.getByRole("button", { name: "Drag across the top to open" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("serial-line")).toBeVisible();
}

async function mintFirstPlayer(page: Page) {
  await openFirstOpenMatch(page);
  await page.getByRole("button", { name: "Underdog" }).click();
  await page
    .getByRole("button", { name: /if he wins/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("If he wins")).toBeVisible();
  // No wallet yet: the pick sheet asks to connect in place, then shows the mint button for the same pick.
  await expect(sheet.getByRole("button", { name: /Mint for/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Connect Wallet", exact: true }).click();
  await sheet.getByRole("button", { name: /^Mint for 1,000 \$WIF$/ }).click();
  await expect(sheet.getByText(/^Approve \$WIF/)).toBeVisible();
  await expect(page).toHaveURL(/\/open\/\d+$/, { timeout: 10_000 });
}

test("the landing is the Framer board; Launch App goes straight to matches", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  for (const name of ["Join Match", "Open Match", "Pick a Player", "Open Your Pack"]) {
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  }
  // The Framer board: deck, sealed Pack, rules zones, one Launch App button. No filter tabs.
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Tap for next/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag across the top to open" })).toBeVisible();
  await expect(page.getByText("One MVP in every match")).toBeVisible();
  await expect(page.getByText("How it plays")).toBeVisible();
  await expect(page.getByText("House rules")).toBeVisible();
  await expect(page.getByText("How claims work")).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 810) {
    await expect(page.getByText(/^London \d{2}:\d{2}$/)).toBeVisible();
  }

  await page.getByRole("link", { name: "Launch App" }).click();
  await expect(page).toHaveURL(/\/matches$/);
  // Browsing needs no wallet: the dock and the board are there, every match reads Not Joined.
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText(["Matches", "Hunt", "Binder", "Leaderboard"]);
  await expect(page.getByTestId("match-england-v-croatia")).toContainText("Not Joined");
  await connect(page);
  await expect(page.getByTestId("match-england-v-croatia")).toContainText("Not Joined");
});

test("the binder asks for a wallet in words, then opens once the masthead connects", async ({ page }) => {
  await page.goto("/binder");
  await expect(page).toHaveURL(/\/binder$/);
  const gate = page.getByTestId("wallet-gate");
  await expect(gate.getByRole("heading", { name: "Connect to open your binder" })).toBeVisible();
  // The gate points at the masthead instead of drawing its own button.
  await expect(gate.getByRole("button")).toHaveCount(0);
  await expect(gate.getByTestId("wallet-hint")).toContainText("Connect Wallet at the top right");
  await connect(page);
  await expect(page.getByRole("heading", { name: "Your binder" })).toBeVisible();
  await expect(page).toHaveURL(/\/binder$/);
});

test("pick a player, approve and mint, then tear the pack open", async ({ page }) => {
  await mintFirstPlayer(page);
  await expect(page.getByRole("heading", { name: "Your pack is here" })).toBeVisible();

  // Raw mouse moves skip Playwright's actionability wait, so let the loading veil lift first.
  await expect(page.locator(".loading-veil")).toBeHidden();
  // Drag across the crimped top to tear it (the landing's Pack Rip names its tear strip by the hint).
  const strip = page.getByRole("button", { name: "Drag across the top to open" });
  const box = await strip.boundingBox();
  if (!box) throw new Error("tear strip has no box");
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByRole("heading", { name: "Your card is out" })).toBeVisible();
  await expect(page.getByTestId("serial-line")).toHaveText(/^Card #(\d+) of \1$/);

  // A reload shows the card already out.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your card is out" })).toBeVisible();
  await expect(page.getByTestId("wif-balance")).toContainText("4,000");
});

test("the pack also opens with the keyboard", async ({ page }) => {
  await mintFirstPlayer(page);
  await tearPack(page);
});

test("a second mint for the same match is blocked", async ({ page }) => {
  await mintFirstPlayer(page);
  // Leave the pack sealed and go straight back to the match.
  await page.goto(page.url().replace(/\/open\/\d+$/, ""));
  await page
    .getByRole("button", { name: /if he wins/ })
    .nth(3)
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/You already picked .+ here/)).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Mint for/ })).toHaveCount(0);
});

test("binder: burn the warm-up winner to claim", async ({ page }) => {
  await page.goto("/binder");
  await connect(page);
  await expect(page.getByText("Claim · 1")).toBeVisible();
  // Claim lives on the back of the card: flip it first.
  await page
    .getByRole("button", { name: /card, click to flip/ })
    .first()
    .click();
  const burn = page.getByRole("button", { name: /Burn To Claim [\d,]+ \$WIF/ });
  const label = (await burn.getAttribute("aria-label")) ?? "";
  const amount = label.match(/[\d,]+/)?.[0] ?? "";
  await burn.click();
  await expect(page.getByText(`Claimed ${amount} $WIF`)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Claimed · 1")).toBeVisible();
  await expect(page.getByText("Claim · 1")).toHaveCount(0);
});

test("binder: claim and keep pays the share minus the burned keep fee, and the card stays", async ({
  page,
}) => {
  await page.goto("/binder");
  await connect(page);
  await expect(page.getByText("Claim · 1")).toBeVisible();
  await page
    .getByRole("button", { name: /card, click to flip/ })
    .first()
    .click();
  const keep = page.getByTestId("claim-keep");
  await expect(keep).toContainText("50 burned");
  const label = (await keep.getAttribute("aria-label")) ?? "";
  const amount = label.match(/Claim ([\d,]+) \$WIF/)?.[1] ?? "";
  await keep.click();
  await expect(page.getByText(`Claimed ${amount} $WIF`)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("and kept the card")).toBeVisible();
  await expect(page.getByText("Claimed · 1")).toBeVisible();
  await expect(page.getByText("Paid out and kept.")).toBeVisible();
});

test("an opened card never shows sealed again, even after a reload", async ({ page }) => {
  await mintFirstPlayer(page);
  const packUrl = new URL(page.url()).pathname;
  await page.goto("/matches");
  await expect(page.getByTestId("match-england-v-croatia").getByTestId("match-status")).toHaveText("Sealed");
  await page.goto(packUrl);
  await tearPack(page);

  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await page.goto("/matches");
    await expect(page.getByTestId("match-england-v-croatia").getByTestId("match-status")).toHaveText(
      "Joined",
    );
    await page.goto("/binder");
    await expect(page.getByText("Waiting · 1")).toBeVisible();
    await expect(page.getByRole("img", { name: /^Sealed pack/ })).toHaveCount(0);
    await page.goto(packUrl);
    await expect(page.getByRole("heading", { name: "Your card is out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Drag across the top to open" })).toHaveCount(0);
  }
});

test("rules page and leaderboard from the dock", async ({ page }) => {
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "One match. One pick. One card." })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Leaderboard" }).click();
  await expect(page).toHaveURL(/\/leaderboard$/);
  await expect(page.getByRole("heading", { name: "The table" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Top three" })).toBeVisible();
  await page.getByRole("button", { name: "This Matchday" }).click();
  await expect(page.getByRole("heading", { name: "The table" })).toBeVisible();
});

test("buy a sealed card from the market; it lands in the binder sealed", async ({ page }) => {
  await openFirstOpenMatch(page);
  await page.getByTestId("buy-sealed").filter({ visible: true }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: /^Buy .+ for 900 \$WIF$/ }).click();
  await expect(sheet.getByText("5% of the price is burned.")).toBeVisible();
  // No wallet yet: the buy confirm asks to connect in place, then the buy button takes its place.
  await sheet.getByRole("button", { name: "Connect Wallet", exact: true }).click();
  await sheet.getByRole("button", { name: "Buy for 900 $WIF" }).click();
  await expect(page.getByRole("status").filter({ hasText: "is in your binder, sealed" })).toBeVisible({
    timeout: 10_000,
  });
  await page.goto("/binder");
  await expect(page.getByText("Sealed · 1")).toBeVisible();
  await expect(page.getByTestId("wif-balance")).toContainText("4,100");
});

test("sell a sealed card, see it listed, then cancel the listing", async ({ page }) => {
  await mintFirstPlayer(page);
  await page.goto("/binder");
  // Sell lives on the back of the sealed pack: flip it first.
  await page
    .getByRole("button", { name: /flip for actions/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Sell" }).click();
  const sheet = page.getByRole("dialog");
  const price = sheet.getByLabel("Price in $WIF");
  await price.fill("0");
  await sheet.getByRole("button", { name: "List For Sale" }).click();
  await expect(sheet.getByText("Enter a price above zero, in $WIF.")).toBeVisible();
  await price.fill("1200");
  await expect(sheet.getByText("1,140 $WIF")).toBeVisible();
  await expect(sheet.getByText("60 $WIF")).toBeVisible();
  await sheet.getByRole("button", { name: "List For Sale" }).click();
  await expect(page.getByTestId("listed-badge")).toHaveText("Listed · 1,200 $WIF", { timeout: 10_000 });
  await sheet.getByRole("button", { name: "Cancel Listing" }).click();
  await expect(page.getByTestId("listed-badge")).toHaveCount(0, { timeout: 10_000 });
});
