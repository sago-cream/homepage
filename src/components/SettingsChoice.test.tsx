import { act, useState } from 'react';
import { expect, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';

import { SettingsChoice } from './SettingsChoice';

test('radio keys move focus and selection together, wrap, and skip disabled choices', async () => {
    const browser = new Window();
    const bindings = {
        window: browser,
        document: browser.document,
        Element: browser.Element,
        HTMLElement: browser.HTMLElement,
        Node: browser.Node,
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
    function Choices() {
        const [choice, setChoice] = useState('System');
        return (
            <div role='radiogroup' aria-label='Theme'>
                {['System', 'Light', 'Dark'].map((label) => (
                    <SettingsChoice
                        key={label}
                        disabled={label === 'Light'}
                        aria-checked={choice === label}
                        onClick={() => {
                            setChoice(label);
                        }}
                    >
                        {label}
                    </SettingsChoice>
                ))}
            </div>
        );
    }
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
        await act(async () => {
            root.render(<Choices />);
            await Promise.resolve();
        });
        container.querySelector<HTMLButtonElement>('button')?.focus();
        for (const [key, expected] of [
            ['ArrowLeft', 'Dark'],
            ['ArrowRight', 'System'],
            ['ArrowDown', 'Dark'],
            ['Home', 'System'],
            ['End', 'Dark'],
            ['ArrowUp', 'System'],
        ]) {
            // eslint-disable-next-line no-await-in-loop -- Each key starts from the prior settled selection.
            await act(async () => {
                document.activeElement?.dispatchEvent(
                    new browser.KeyboardEvent('keydown', {
                        key,
                        bubbles: true,
                        cancelable: true,
                    }) as unknown as Event
                );
                await Promise.resolve();
            });
            expect(document.activeElement?.textContent).toBe(expected);
            expect(
                container.querySelector('[aria-checked="true"]')?.textContent
            ).toBe(expected);
            expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(
                1
            );
        }
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
