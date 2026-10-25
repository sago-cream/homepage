import { act } from 'react';
import { expect, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';

test('search matches bookmark context, keeps selection explicit, and supports keyboard choices', async () => {
    const browser = new Window();
    const bindings = {
        window: browser,
        document: browser.document,
        Element: browser.Element,
        HTMLElement: browser.HTMLElement,
        Node: browser.Node,
        localStorage: browser.localStorage,
        addEventListener: browser.addEventListener.bind(browser),
        removeEventListener: browser.removeEventListener.bind(browser),
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
    const { SettingsSearchOptions } = await import('./SettingsSearchOptions');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let selected = 'unchanged';
    let closes = 0;
    let parentEscapes = 0;
    const press = async (target: Element, key: string) => {
        await act(async () => {
            target.dispatchEvent(
                new browser.KeyboardEvent('keydown', {
                    key,
                    bubbles: true,
                    cancelable: true,
                }) as unknown as Event
            );
            await Promise.resolve();
        });
    };
    try {
        await act(async () => {
            root.render(
                <div
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            parentEscapes++;
                        }
                    }}
                >
                    <SettingsSearchOptions
                        id='test-search'
                        label='Find action'
                        initialQuery='video work'
                        value='mail'
                        options={[
                            {
                                value: 'mail',
                                label: 'Mail',
                                searchText: 'Work mail',
                            },
                            {
                                value: 'old',
                                label: 'Old action',
                                disabled: true,
                            },
                            {
                                value: 'video',
                                label: 'YouTube',
                                searchText: 'Work video https://youtube.com',
                            },
                        ]}
                        onSelect={(value) => {
                            selected = value;
                        }}
                        onClose={() => {
                            closes++;
                        }}
                    />
                </div>
            );
            await Promise.resolve();
        });
        const input = container.querySelector('input');
        if (!input) {
            throw new Error('Missing search input');
        }
        expect(document.activeElement).toBe(input);
        expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
        expect(container.querySelector('[role="option"]')?.textContent).toBe(
            'YouTube'
        );
        expect(selected).toBe('unchanged');
        await press(input, 'Enter');
        expect(selected).toBe('video');
        await act(async () => {
            container
                .querySelector<HTMLButtonElement>('[aria-label="Clear search"]')
                ?.click();
            await Promise.resolve();
        });
        expect(document.activeElement).toBe(input);
        expect(container.querySelectorAll('[role="option"]')).toHaveLength(3);
        await press(input, 'ArrowDown');
        expect(input.getAttribute('aria-activedescendant')).toBe(
            'test-search-option-2'
        );
        expect(document.activeElement).toBe(input);
        await press(input, 'Escape');
        expect(closes).toBe(1);
        expect(parentEscapes).toBe(0);
    } finally {
        await act(async () => {
            root.unmount();
            await Promise.resolve();
        });
        container.remove();
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
