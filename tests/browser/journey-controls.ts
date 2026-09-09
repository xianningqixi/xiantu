import { expect, type Page } from "@playwright/test";

export async function openCurrentLocation(page: Page) {
  if (await page.locator("#location-detail").isVisible()) return;
  await page.locator(".map-place.is-current .map-travel").click();
  await expect(page.locator("#location-detail")).toBeVisible();
}

export async function selectLocations(page: Page) {
  const back = page.getByRole("button", { name: "返回地点选择", exact: true });
  // A closing Radix dialog briefly hides background roles; use the mounted detail
  // as the condition, then let click wait for the background button to be available.
  if (await page.locator("#location-detail").count()) await back.click();
  await expect(page.locator("#world-map")).toBeVisible();
}

export async function travelTo(page: Page, name: string) {
  await selectLocations(page);
  await page.locator(".local-map").getByRole("button", { name, exact: true }).click();
  await expect(page.locator(".place-heading h1")).toHaveText(name);
}

/** On phones, people share the reading surface through an explicit view switch. */
export async function showLocalPeople(page: Page) {
  const toggle = page.getByRole("button", { name: /^此处人物 ·/ });
  if (await toggle.isVisible()) await toggle.click();
}
