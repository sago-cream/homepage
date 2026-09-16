/* eslint-disable no-await-in-loop -- Pointer actions must run in sequence. */
import { act, cloneElement } from 'react';
import { expect, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import { useMenuAim } from '@/hooks/useMenuAim';
import { LinkCategory } from './LinkCategory';

test('renders nested folders beyond the fourth layer without flattening their labels', () => {
    const tree = (
        <LinkCategory
            categoryData={{
                category: 'Test',
                icon: <span />,
                iconName: 'Folder',
                links: [],
                children: [
                    {
                        id: 'a',
                        title: 'One',
                        type: 'folder',
                        children: [
                            {
                                id: 'b',
                                title: 'Two',
                                type: 'folder',
                                children: [
                                    {
                                        id: 'c',
                                        title: 'Three',
                                        type: 'folder',
                                        children: [
                                            {
                                                id: 'd',
                                                title: 'Four',
                                                type: 'folder',
                                                children: [
                                                    {
                                                        id: 'leaf',
                                                        title: 'Destination',
                                                        type: 'link',
                                                        url: 'https://example.com',
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }}
            clickedCategory={1}
            clickedFolderPath={['a', 'b', 'c', 'd']}
            index={0}
            isMouseNav
            padding='16px'
            onSelectCategory={() => undefined}
            onSelectFolder={() => undefined}
            onSelectLink={() => undefined}
        />
    );
    const html = renderToStaticMarkup(tree);
    const closed = renderToStaticMarkup(
        cloneElement(tree, { clickedFolderPath: [] }, undefined)
    );
    expect(closed.match(/class="bookmark-submenu"/g)).toHaveLength(1);
    expect(closed).not.toContain('Destination');
    expect(html.match(/class="bookmark-submenu"/g)).toHaveLength(4);
    expect(html).toContain('<span>Four</span>');
    expect(html).toContain('<span>Destination</span>');
});

test('coordinates sibling intent, reversal, return, timeout, scrolling and clicks', async () => {
    const browser = new Window();
    const bindings = {
        window: browser,
        document: browser.document,
        Element: browser.Element,
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
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let clicks = 0;
    function Harness() {
        const aim = useMenuAim(true);
        return (
            <div ref={aim.ref} data-menu-level data-active={aim.activeId}>
                <div data-menu-row='a'>
                    <button>A</button>
                    <div className='bookmark-submenu'>Child</div>
                </div>
                <div data-menu-row='b'>
                    <button
                        onClick={() => {
                            clicks++;
                        }}
                    >
                        B
                    </button>
                    <div className='bookmark-submenu'>Other</div>
                </div>
            </div>
        );
    }
    try {
        await act(async () => {
            root.render(<Harness />);
            await Promise.resolve();
        });
        const row = container.querySelector('[data-menu-row="a"]');
        const sibling = container.querySelector('[data-menu-row="b"]');
        const menu = row?.querySelector('.bookmark-submenu');
        if (!row || !sibling || !menu) {
            throw new Error('Expected mounted menu');
        }
        let left = 480;
        menu.getBoundingClientRect = () =>
            new browser.DOMRect(left, 16, 240, 400);
        const active = () =>
            container.querySelector<HTMLElement>('[data-menu-level]')?.dataset
                .active;
        const move = async (target: Element, x: number, y: number) => {
            await act(async () => {
                target.dispatchEvent(
                    new browser.PointerEvent('pointermove', {
                        pointerType: 'mouse',
                        clientX: x,
                        clientY: y,
                        bubbles: true,
                    }) as unknown as Event
                );
                await Promise.resolve();
            });
        };
        for (const direction of [1, -1]) {
            left = direction === 1 ? 480 : 0;
            await move(row, 350, 140);
            await move(sibling, 350 + direction * 50, 170);
            expect(active()).toBe('a');
            await move(sibling, 350 + direction * 40, 170);
            expect(active()).toBe('b');
            await move(row, 350, 140);
            await move(menu, left + 120, 200);
            await move(row, 350, 140);
            await move(sibling, 350 + direction * 50, 170);
            expect(active()).toBe('b');
            await move(row, 350, 140);
            await move(sibling, 350 + direction * 50, 170);
            await act(async () => {
                await new Promise((resolve) => {
                    setTimeout(resolve, 330);
                });
            });
            expect(active()).toBe('b');
        }
        left = 480;
        await move(row, 350, 140);
        await move(sibling, 400, 170);
        await act(async () => {
            sibling.querySelector('button')?.click();
            await Promise.resolve();
        });
        expect(clicks).toBe(1);
        await act(async () => {
            document.dispatchEvent(
                new browser.Event('scroll') as unknown as Event
            );
            await Promise.resolve();
        });
        expect(active()).toBe('a');
        await move(row, 350, 140);
        await move(document.body, 800, 800);
        expect(active()).toBeUndefined();
    } finally {
        await act(async () => {
            root.unmount();
            await Promise.resolve();
        });
        for (const [key, descriptor] of originals) {
            if (descriptor) {
                Object.defineProperty(globalThis, key, descriptor);
            } else {
                Reflect.deleteProperty(globalThis, key);
            }
        }
        await browser.happyDOM.close();
    }
});
