import { act, cloneElement } from 'react';
import { expect, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

test.each([false, true])(
    'Floating UI grace, return, slow crossing and cleanup (debug=%s)',
    async (debug) => {
        const browser = new Window();
        const bindings = {
            window: browser,
            document: browser.document,
            Element: browser.Element,
            HTMLElement: browser.HTMLElement,
            Node: browser.Node,
            getComputedStyle: browser.getComputedStyle.bind(browser),
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
            Object.defineProperty(globalThis, key, {
                configurable: true,
                value,
            });
        }
        const { FloatingNode, FloatingTree } =
            await import('@floating-ui/react');
        const { useMenuAim, MenuAimDebugContext } =
            await import('@/hooks/useMenuAim');
        const container = document.createElement('div');
        document.body.append(container);
        const root = createRoot(container);
        let clicks = 0;
        function Item({ id }: { id: string }) {
            const aim = useMenuAim(true);
            return (
                <FloatingNode id={aim.nodeId}>
                    <button
                        data-row={id}
                        data-open={aim.open}
                        data-triangle={aim.triangle.length}
                        ref={aim.refs.setReference}
                        {...aim.getReferenceProps()}
                        onClick={() => {
                            clicks++;
                        }}
                    >
                        {id}
                    </button>
                    <div
                        data-menu={id}
                        ref={aim.refs.setFloating}
                        {...aim.getFloatingProps()}
                    >
                        Child
                    </div>
                </FloatingNode>
            );
        }

        function Harness() {
            return (
                <MenuAimDebugContext value={debug}>
                    <FloatingTree>
                        <Item id='a' />
                        <Item id='b' />
                    </FloatingTree>
                </MenuAimDebugContext>
            );
        }
        try {
            await act(async () => {
                root.render(<Harness />);
                await Promise.resolve();
            });
            const row = container.querySelector<HTMLElement>('[data-row="a"]');
            const sibling =
                container.querySelector<HTMLElement>('[data-row="b"]');
            const menu =
                container.querySelector<HTMLElement>('[data-menu="a"]');
            if (!row || !sibling || !menu) {
                throw new Error('Missing menu fixture');
            }
            row.getBoundingClientRect = () =>
                new browser.DOMRect(240, 100, 240, 56);
            menu.getBoundingClientRect = () =>
                new browser.DOMRect(480, 16, 240, 400);
            const dispatch = async (
                target: Element,
                type: string,
                x: number,
                y: number
            ) => {
                await act(async () => {
                    target.dispatchEvent(
                        new browser.MouseEvent(type, {
                            clientX: x,
                            clientY: y,
                            bubbles:
                                type !== 'mouseenter' && type !== 'mouseleave',
                        }) as unknown as Event
                    );
                    await Promise.resolve();
                });
            };
            await dispatch(row, 'mouseenter', 350, 140);
            expect(row.dataset.open).toBe('true');
            expect(document.body.style.pointerEvents).toBe('none');
            await dispatch(row, 'mouseleave', 400, 156);
            expect(row.dataset.triangle).toBe(debug ? '3' : '0');
            await dispatch(document.body, 'mousemove', 430, 175);
            expect(row.dataset.open).toBe('true');
            await dispatch(menu, 'mousemove', 520, 200);
            expect(row.dataset.open).toBe('true');
            // Returning to the trigger starts a new protected crossing too.
            await dispatch(row, 'mousemove', 350, 140);
            await dispatch(row, 'mouseenter', 350, 140);
            await dispatch(row, 'mouseleave', 400, 156);
            await dispatch(document.body, 'mousemove', 430, 175);
            expect(row.dataset.open).toBe('true');
            await dispatch(menu, 'mousemove', 520, 200);
            await dispatch(document.body, 'mousemove', 350, 210);
            expect(row.dataset.open).toBe('false');
            await dispatch(sibling, 'mouseenter', 350, 210);
            expect(sibling.dataset.open).toBe('true');
            await act(async () => {
                sibling.click();
                await Promise.resolve();
            });
            expect(clicks).toBe(1);
            await dispatch(sibling, 'mouseleave', 350, 210);
            await dispatch(document.body, 'mousemove', 800, 800);
            expect(document.body.style.pointerEvents).toBe('');
            await dispatch(row, 'mouseenter', 350, 140);
            await dispatch(row, 'mouseleave', 400, 156);
            await dispatch(document.body, 'mousemove', 430, 175);
            expect(row.dataset.open).toBe('true');
            await act(async () => {
                await new Promise((resolve) => {
                    setTimeout(resolve, 60);
                });
            });
            expect(row.dataset.open).toBe('true');
            await dispatch(menu, 'mousemove', 520, 200);
            await act(async () => {
                await new Promise((resolve) => {
                    setTimeout(resolve, 60);
                });
            });
            expect(row.dataset.open).toBe('true');
            await dispatch(document.body, 'mousemove', 350, 210);
            expect(row.dataset.open).toBe('false');
            // Happy DOM does not implement the native popover API.
            Object.defineProperties(browser.HTMLElement.prototype, {
                showPopover: { configurable: true, value: () => undefined },
                hidePopover: { configurable: true, value: () => undefined },
            });
            const { LinkCategory } = await import('./LinkCategory');
            await act(async () => {
                root.render(
                    <MenuAimDebugContext value={debug}>
                        <FloatingTree>
                            <LinkCategory
                                categoryData={{
                                    category: 'Short list',
                                    icon: <span />,
                                    iconName: 'Folder',
                                    links: [],
                                    children: [
                                        {
                                            id: 'leaf',
                                            title: 'Item',
                                            type: 'link',
                                            url: 'https://example.com',
                                        },
                                    ],
                                }}
                                clickedFolderPath={[]}
                                index={0}
                                isMouseNav
                                padding='100px'
                                onSelectCategory={() => undefined}
                                onSelectFolder={() => undefined}
                                onSelectLink={() => undefined}
                            />
                        </FloatingTree>
                    </MenuAimDebugContext>
                );
                await Promise.resolve();
            });
            const category = container.querySelector<HTMLElement>('.category');
            const panel = container.querySelector<HTMLElement>('.links');
            const items = container.querySelector<HTMLElement>(
                '.bookmark-category-items'
            );
            if (!category || !panel || !items) {
                throw new Error('Missing category items fixture');
            }
            category.getBoundingClientRect = () =>
                new browser.DOMRect(0, 100, 240, 56);
            panel.getBoundingClientRect = () =>
                new browser.DOMRect(240, 0, 240, 900);
            items.getBoundingClientRect = () =>
                new browser.DOMRect(240, 100, 240, 112);
            await dispatch(category, 'mouseenter', 100, 140);
            expect(items.style.pointerEvents).toBe('auto');
            expect(panel.style.pointerEvents).toBe('');
            expect(
                container.querySelectorAll('.menu-safety-overlay')
            ).toHaveLength(0);
            await dispatch(category, 'mouseleave', 200, 156);
            expect(
                container.querySelectorAll('.menu-safety-overlay')
            ).toHaveLength(debug ? 1 : 0);
            await dispatch(document.body, 'mousemove', 220, 160);
            expect(category.getAttribute('aria-expanded')).toBe('true');
            // Inside the old full-panel triangle, but outside the item-list triangle.
            await dispatch(document.body, 'mousemove', 225, 300);
            expect(category.getAttribute('aria-expanded')).toBe('false');
            expect(
                container.querySelectorAll('.menu-safety-overlay')
            ).toHaveLength(0);
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
    }
);

test('renders nested folders beyond the fourth layer without flattening their labels', async () => {
    const { LinkCategory } = await import('./LinkCategory');
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
