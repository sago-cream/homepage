import { act } from 'react';
import { expect, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';

test('menu stays in its modal, supports keyboard actions, and consumes Escape before its parent', async () => {
    const browser = new Window();
    const bindings = {
        window: browser,
        document: browser.document,
        Element: browser.Element,
        HTMLElement: browser.HTMLElement,
        Node: browser.Node,
        getComputedStyle: browser.getComputedStyle.bind(browser),
        requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
        cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const originals = new Map(
        Object.keys(bindings).map((key) => [
            key,
            Object.getOwnPropertyDescriptor(globalThis, key),
        ])
    );
    for (const [key, value] of Object.entries(bindings)) {
        Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    const { ActionMenu } = await import('./ActionMenu');
    const modal = document.createElement('dialog');
    document.body.append(modal);
    const root = createRoot(modal);
    let parentEscapes = 0;
    let selected = '';
    const pressKey = async (target: Element, value: string) => {
        await act(async () => {
            target.dispatchEvent(
                new browser.KeyboardEvent('keydown', {
                    key: value,
                    bubbles: true,
                    cancelable: true,
                }) as unknown as Event
            );
            await Promise.resolve();
        });
    };
    try {
        await act(async () => {
            await Promise.resolve();
            root.render(
                <div
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            parentEscapes++;
                        }
                    }}
                >
                    <ActionMenu
                        label='Actions'
                        items={[
                            {
                                label: 'Import',
                                onSelect: () => {
                                    selected = 'import';
                                },
                            },
                            {
                                label: 'Export',
                                onSelect: () => {
                                    selected = 'export';
                                },
                            },
                        ]}
                    />
                </div>
            );
        });
        const trigger = modal.querySelector('button');
        if (!trigger) {
            throw new Error('Missing menu trigger');
        }
        await act(async () => {
            await Promise.resolve();
            trigger.click();
        });
        const menu = modal.querySelector('[role="menu"]');
        expect(menu).toBeTruthy();
        expect(
            document.body.querySelector('[role="menu"]')?.closest('dialog')
        ).toBe(modal);
        if (!menu) {
            throw new Error('Missing menu');
        }
        await pressKey(menu, 'End');
        expect(document.activeElement?.textContent).toBe('Export');
        await pressKey(document.activeElement ?? menu, 'ArrowUp');
        expect(document.activeElement?.textContent).toBe('Import');
        await pressKey(document.activeElement ?? menu, 'Escape');
        expect(parentEscapes).toBe(0);
        expect(modal.querySelector('[role="menu"]')).toBeNull();
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        await act(async () => {
            await Promise.resolve();
            trigger.click();
        });
        const action =
            modal.querySelector<HTMLButtonElement>('[role="menuitem"]');
        await act(async () => {
            await Promise.resolve();
            action?.click();
        });
        expect(selected).toBe('import');
        expect(modal.querySelector('[role="menu"]')).toBeNull();
    } finally {
        await act(async () => {
            await Promise.resolve();
            root.unmount();
        });
        modal.remove();
        await browser.happyDOM.close();
        for (const [key, descriptor] of originals) {
            if (descriptor) {
                Object.defineProperty(globalThis, key, descriptor);
            } else {
                Reflect.deleteProperty(globalThis, key);
            }
        }
    }
});
