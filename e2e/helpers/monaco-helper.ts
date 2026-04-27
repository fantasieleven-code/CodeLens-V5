import { Page } from '@playwright/test';

const MONACO_SELECTOR = '.monaco-editor .view-lines';
const MONACO_INPUT = '.monaco-editor textarea[aria-label="Editor content"], .monaco-editor textarea.inputarea, .monaco-editor textarea';

/**
 * Playwright helper for realistic Monaco editor interaction.
 * Used in E2E tests for typing, reading content, and file operations.
 */
export class MonacoHelper {
  /** Click into Monaco and type code character by character with realistic delay.
   *  Newer Monaco versions use the EditContext API (no accessible textarea), so
   *  DOM-level typing is unreliable. We set the model value directly via the
   *  Monaco JS API — tests no longer need realistic keystroke timing here since
   *  typing signals aren't scored in MB2. */
  static async typeCode(page: Page, code: string, _delayMs = 80): Promise<void> {
    await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(
      () => !!(window as any).monaco?.editor?.getEditors?.()?.length,
      { timeout: 10000 },
    );
    await page.evaluate((text) => {
      const editors = (window as any).monaco.editor.getEditors();
      const focused = editors.find((e: any) => e.hasTextFocus?.()) ?? editors[0];
      const model = focused.getModel();
      const currentValue = model.getValue();
      // Append to current value (sequential typing semantics).
      model.setValue(currentValue + text);
    }, code);
  }

  /** Read the full content of the active Monaco editor model. */
  static async getContent(page: Page): Promise<string> {
    return page.evaluate(() => {
      const editor = (window as any).monaco?.editor?.getEditors?.()?.[0];
      if (!editor) throw new Error('No Monaco editor instance found');
      return editor.getModel()?.getValue() ?? '';
    });
  }

  /** Clear the editor content via the Monaco JS API (Cmd+A/Ctrl+A no longer
   *  works reliably on EditContext-based Monaco). */
  static async selectAll(page: Page): Promise<void> {
    await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(
      () => !!(window as any).monaco?.editor?.getEditors?.()?.length,
      { timeout: 10000 },
    );
    await page.evaluate(() => {
      const editors = (window as any).monaco.editor.getEditors();
      const focused = editors.find((e: any) => e.hasTextFocus?.()) ?? editors[0];
      focused.getModel().setValue('');
    });
  }

  /** Trigger file save (Cmd+S / Ctrl+S). */
  static async saveFile(page: Page): Promise<void> {
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+s`);
  }

  /**
   * Simulate a paste action into the editor.
   * Sets clipboard content then triggers Cmd+V / Ctrl+V.
   * Useful for testing paste-detection behavior signals.
   */
  static async pasteCode(page: Page, code: string): Promise<void> {
    const input = page.locator(MONACO_INPUT);
    await input.click();
    await page.evaluate((text) => navigator.clipboard.writeText(text), code);
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+v`);
  }

  /** Wait for a file-saved indicator to appear in the UI. */
  static async waitForSaved(page: Page, timeoutMs = 5000): Promise<void> {
    await page.locator(
      '[data-testid*="saved"], [class*="saved"], [class*="Saved"]'
    ).waitFor({ state: 'visible', timeout: timeoutMs });
  }

  /**
   * Click a file in the file tree by its full path.
   *
   * Brief #14 D22 · page testid encodes full path (`mb-filetree-item-${path}`)
   * but visible button text is basename only (FileTree.tsx:39). Earlier
   * `.filter({ hasText })` with the full path matched zero buttons. Switch
   * to testid-direct lookup — the testid contract is unambiguous.
   */
  static async clickFile(page: Page, filePath: string): Promise<void> {
    await page.locator(`[data-testid="mb-filetree-item-${filePath}"]`).click();
    // Brief wait for Monaco to load the file model
    await page.waitForTimeout(300);
  }
}
