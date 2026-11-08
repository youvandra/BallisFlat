import { expect, test } from "@playwright/test";
import sharp from "sharp";

const out = (name: string) => `docs/media/${name}.webp`;
// The README uses only these, at 1440 wide in WebP; the rest of the walk just gets the app into each state.
const keep = ["landing", "market", "binder", "hunt"];

test("readme screenshots", async ({ page }) => {
  const shot = async (name: string) => {
    await page.mouse.move(1, 1);
    await page.waitForLoadState("networkidle");
    const png = await page.screenshot();
    if (keep.includes(name)) await sharp(png).webp({ quality: 82 }).toFile(out(name));
    if (name === "pack-opened") {
      // the card alone, for the README hero
      await sharp(png)
        .extract({ left: 578, top: 200, width: 366, height: 532 })
        .webp({ quality: 90 })
        .toFile("docs/media/card.webp");
    }
  };

  await page.goto("/");
  await page.waitForTimeout(4000);
  await shot("landing");

  await page.goto("/matches");
  await page.waitForTimeout(1200);
  await shot("matches");

  await page.getByTestId("match-england-v-croatia").click();
  await page.waitForTimeout(1200);
  await shot("market");

  // A player with generated art, so the README card shows the art rather than the number fallback.
  await page
    .getByRole("button", { name: /^Jude Bellingham, number .*if he wins/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Connect Wallet", exact: true }).click();
  await expect(sheet.getByRole("button", { name: /^Mint for/ })).toBeVisible();
  await page.waitForTimeout(500);
  await shot("pick");
  await sheet.getByRole("button", { name: /^Mint for/ }).click();
  await expect(page).toHaveURL(/\/open\/\d+$/, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await shot("pack-sealed");
  await page.getByRole("button", { name: "Drag across the top to open" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("serial-line")).toBeVisible();
  await page.waitForTimeout(2500);
  await shot("pack-opened");

  await page.goto("/binder");
  await page.waitForTimeout(1500);
  await shot("binder");

  await page.goto("/hunt");
  await expect(page.getByTestId("hunt-wanted-left")).toBeVisible();
  await page.waitForTimeout(1500);
  await shot("hunt");

  await page.goto("/leaderboard");
  await page.waitForTimeout(1200);
  await shot("leaderboard");
});
