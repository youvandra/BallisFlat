import { expect, test } from "@playwright/test";

// The demo build has no API: /stats says where the live numbers are, and the leaderboard links to it.
test("the stats page opens from the leaderboard", async ({ page }) => {
  await page.goto("/leaderboard");
  await page.getByRole("link", { name: "See All Stats" }).click();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole("heading", { name: "Ball is Flat in numbers" })).toBeVisible();
  await expect(page.getByText("The numbers come from the live API")).toBeVisible();
  await expect(page.getByRole("link", { name: /Hunt/ }).first()).toBeVisible();
});
