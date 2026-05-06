import { expect, type Page } from '@playwright/test';

const TERMINAL_HOST = '[data-testid="mb-terminal-host"]';
const TERMINAL_RUN_BUTTON = '[data-testid="mb-terminal-run"]';

/**
 * Playwright helper for V5 MB terminal interaction.
 *
 * V5 terminal is run-button-only (not interactive xterm textarea);
 * sendCommand dropped · clickRun added (Brief #8 B2 helper refresh).
 */
export class TerminalHelper {
  /** Click the terminal Run button to execute the staged tests. */
  static async clickRun(page: Page): Promise<void> {
    await page.locator(TERMINAL_RUN_BUTTON).click();
  }

  /**
   * Wait for specific text to appear in the terminal output.
   */
  static async waitForOutput(
    page: Page,
    text: string,
    timeoutMs = 15_000,
  ): Promise<void> {
    await expect(page.locator(TERMINAL_HOST)).toContainText(text, { timeout: timeoutMs });
  }

  /**
   * Read all visible text in the terminal host element via xterm DOM rows.
   */
  static async getTerminalContent(page: Page): Promise<string> {
    const rows = await page
      .locator(`${TERMINAL_HOST} .xterm-rows > div`)
      .allTextContents();
    return rows.join('\n');
  }
}
