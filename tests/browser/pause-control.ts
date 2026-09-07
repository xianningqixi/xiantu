import type { Page } from "@playwright/test";
/** Click the real pause control as soon as a durable checkpoint is reported.
 * Faster Workers can finish a small world before a polling test locates the button.
 */
export async function installPauseControl(page: Page) {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event) => {
          const target = (window as any).__pauseAfterCheckpoint;
          if (target && event.data?.progress?.completed >= target) {
            (window as any).__pauseAfterCheckpoint = null;
            const button = [...document.querySelectorAll("button")].find(
              (button) => button.textContent?.trim() === "暂停",
            );
            button?.click();
          }
        });
      }
    };
  });
}
export async function armPause(page: Page, checkpoint = 3) {
  await page.evaluate((value) => {
    (window as any).__pauseAfterCheckpoint = value;
  }, checkpoint);
}
