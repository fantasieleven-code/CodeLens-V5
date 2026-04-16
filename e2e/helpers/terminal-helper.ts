import { Page } from '@playwright/test';

const TERMINAL_SELECTOR = '[class*="terminal"], [class*="Terminal"], [data-testid="terminal"]';
const XTERM_TEXTAREA = '.xterm-helper-textarea';

/**
 * Playwright helper for xterm.js terminal interaction.
 * Used in E2E tests for sending commands and reading terminal output.
 */
export class TerminalHelper {
  /** Type a command into the terminal and press Enter. */
  static async sendCommand(page: Page, command: string): Promise<void> {
    const textarea = page.locator(XTERM_TEXTAREA);
    // Click the terminal area first to ensure focus
    const terminal = page.locator(TERMINAL_SELECTOR).first();
    await terminal.click();
    await textarea.pressSequentially(command, { delay: 30 });
    await page.keyboard.press('Enter');
  }

  /**
   * Wait for specific text to appear in the terminal output.
   * Polls the terminal buffer until the text is found or timeout is reached.
   */
  static async waitForOutput(
    page: Page,
    text: string,
    timeoutMs = 5000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const content = await this.getTerminalContent(page);
      if (content.includes(text)) return;
      await page.waitForTimeout(250);
    }
    throw new Error(
      `Terminal output did not contain "${text}" within ${timeoutMs}ms`,
    );
  }

  /**
   * Read all text currently in the xterm.js terminal buffer.
   * Returns the concatenated content of all buffer rows.
   */
  static async getTerminalContent(page: Page): Promise<string> {
    return page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return '';
      // Access the xterm.js Terminal instance attached to the DOM element
      const term = (el as any)._xterm ?? (el as any).__xterm;
      if (term?.buffer?.active) {
        const buf = term.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < buf.length; i++) {
          const line = buf.getLine(i);
          if (line) lines.push(line.translateToString(true));
        }
        return lines.join('\n');
      }
      // Fallback: read visible text from DOM rows
      const rows = el.querySelectorAll('.xterm-rows > div');
      return Array.from(rows)
        .map((r) => (r as HTMLElement).textContent ?? '')
        .join('\n');
    }, TERMINAL_SELECTOR);
  }
}
