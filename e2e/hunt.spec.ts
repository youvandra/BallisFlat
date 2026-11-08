import { expect, test } from "@playwright/test";

// The Hunt against the mock chain: a pack is bought, sealed for a block, opened, and its cards land in
// the binder. Each test starts from the mock seed (Harry Kane wanted, 46 crowd packs in the pot).

test("buy a Silver pack: it opens one block later and its three cards reach the binder", async ({ page }) => {
  await page.goto("/hunt");
  await expect(page.getByRole("heading", { name: "Find Kane" })).toBeVisible();
  const pot = await page.getByTestId("hunt-pot").innerText();

  // No wallet yet: the buy buttons wait for one, connected from the masthead.
  await expect(page.getByTestId("connect-inline")).toBeVisible();
  await expect(page.getByTestId("buy-silver")).toBeDisabled();
  await page
    .getByRole("button", { name: /^Connect( Wallet)?$/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Connect a Wallet" });
  await sheet.getByRole("button", { name: "Connect Wallet", exact: true }).click();
  await expect(page.getByTestId("buy-silver")).toBeEnabled();

  await page.getByTestId("buy-silver").click();
  await expect(page.getByText(/^Approve \$WIF/)).toBeVisible();
  await expect(page.getByTestId("hunt-reveal")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("hunt-cards")).toHaveText("3");
  await expect(page.getByTestId("hunt-pot")).not.toHaveText(pot);

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Binder" }).click();
  await expect(page.getByTestId("hunt-shelf").locator("li")).toHaveCount(3);
});
