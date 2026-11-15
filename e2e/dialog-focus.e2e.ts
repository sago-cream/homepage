// eslint-disable-next-line import-x/no-extraneous-dependencies -- Playwright is only used for browser tests.
import { expect, test } from '@playwright/test';

// Import through the UI so the fixture follows the same path as guest bookmarks.
test.beforeEach(async ({ page }) => {
    await page.goto('/settings/bookmarks');
    await page.locator('.bookmark-settings input[type="file"]').setInputFiles({
        name: 'bookmarks.html',
        mimeType: 'text/html',
        buffer: Buffer.from(
            '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Work</H3><DL><p><DT><A HREF="https://example.com/">Example</A></DL><p></DL>'
        ),
    });
    await expect(
        page
            .locator('.bookmark-settings')
            .getByRole('button', { name: 'Work', exact: true })
    ).toBeVisible();
});

test('editing a bookmark accepts typing immediately and saves both fields', async ({
    page,
}) => {
    await page
        .locator('.bookmark-settings')
        .getByRole('button', { name: 'Work', exact: true })
        .click();
    await page.getByRole('button', { name: /^Example: Edit/ }).click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    const editor = page.locator('.bookmark-edit-dialog');
    const title = editor.getByRole('textbox', { name: /^Title/ });
    const url = editor.getByRole('textbox', { name: /^URL/ });
    await expect(title).toBeFocused();
    await title.click();
    await title.press('End');
    await page.keyboard.type(' edited');
    await expect(title).toHaveValue('Example edited');
    await expect(title).toBeFocused();
    await url.click();
    await url.press('End');
    await page.keyboard.type('saved');
    await expect(url).toHaveValue('https://example.com/saved');
    await expect(url).toBeFocused();
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await page.getByRole('button', { name: /^Example edited: Edit/ }).click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await expect(
        page
            .locator('.bookmark-edit-dialog')
            .getByRole('textbox', { name: /^URL/ })
    ).toHaveValue('https://example.com/saved');
});

test('validation never redirects typing into another invalid field', async ({
    page,
}) => {
    await page
        .locator('.bookmark-settings')
        .getByRole('button', { name: 'Work', exact: true })
        .click();
    await page.getByRole('button', { name: /^Example: Edit/ }).click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    const editor = page.locator('.bookmark-edit-dialog');
    const title = editor.getByRole('textbox', { name: /^Title/ });
    const url = editor.getByRole('textbox', { name: /^URL/ });
    const save = editor.getByRole('button', { name: 'Save', exact: true });
    await title.fill('');
    await url.fill('invalid url');
    await save.click();
    await expect(title).toBeFocused();
    await expect(url).toHaveAttribute('aria-invalid', 'true');
    await url.click();
    await page.keyboard.type('abc');
    await expect(url).toBeFocused();
    await expect(url).toHaveValue('invalid urlabc');
    await expect(title).toHaveValue('');
    await save.click();
    await expect(title).toBeFocused();
    await title.click();
    await page.keyboard.type('New title');
    await expect(title).toBeFocused();
    await expect(title).toHaveValue('New title');
    await save.click();
    await expect(url).toBeFocused();
    await url.fill('https://example.org');
    await save.click();
    await expect(editor).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'New title', exact: true })
    ).toBeVisible();
});

test('folder title and icon search retain focus while their values rerender', async ({
    page,
}) => {
    await page
        .getByRole('button', { name: 'Work: Edit, Delete', exact: true })
        .click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    const editor = page.locator('.bookmark-edit-dialog');
    const title = editor.getByRole('textbox', {
        name: 'Folder name',
        exact: true,
    });
    await title.click();
    await title.press('End');
    await page.keyboard.type(' folder');
    await expect(title).toHaveValue('Work folder');
    await expect(title).toBeFocused();
    await editor.locator('.bookmark-workspace-icon-picker-trigger').click();
    const search = editor.locator('input[inputmode="search"]');
    await page.keyboard.type('book');
    await expect(search).toHaveValue('book');
    await expect(search).toBeFocused();
    await search.press('Escape');
    await expect(
        editor.locator('.bookmark-workspace-icon-picker-trigger')
    ).toBeFocused();
    await expect(editor).toBeVisible();
});

test('Quick Launch search accepts typing and restores focus when dismissed', async ({
    page,
}) => {
    await page.goto('/settings/quick-launch');
    const add = page
        .locator('[data-setting="quickLaunch"]')
        .getByRole('button', { name: 'Add bookmark', exact: true });
    await add.click();
    const dialog = page.locator('.settings-launch-dialog');
    const search = dialog.getByRole('searchbox');
    await expect(search).toBeFocused();
    await search.click();
    await page.keyboard.type('Example');
    await expect(search).toHaveValue('Example');
    await expect(search).toBeFocused();
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await search.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(add).toBeFocused();
});
