import type { ReactElement, ReactNode } from 'react';
import { useRef, useState } from 'react';
import {
    autoUpdate,
    flip,
    FloatingFocusManager,
    FloatingPortal,
    offset,
    shift,
    size,
    useClick,
    useDismiss,
    useFloating,
    useInteractions,
    useListNavigation,
    useRole,
    useTypeahead,
} from '@floating-ui/react';
import { MoreVertical } from 'lucide-react';

interface ActionMenuItem {
    label: string;
    icon?: ReactNode;
    href?: string;
    danger?: boolean;
    onSelect?: () => void;
}

export const ActionMenu = ({
    label,
    items,
}: {
    label: string;
    items: ActionMenuItem[];
}): ReactElement => {
    const [open, setOpen] = useState(false);
    // Floating UI uses null to represent no active menu item.
    // eslint-disable-next-line unicorn/no-null -- Required by the library API.
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const listRef = useRef<Array<HTMLElement | null>>([]);
    const labelsRef = useRef(items.map((item) => item.label));
    labelsRef.current = items.map((item) => item.label);
    const { refs, floatingStyles, context } = useFloating({
        open,
        onOpenChange: setOpen,
        placement: 'bottom-end',
        strategy: 'fixed',
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(4),
            flip({ padding: 8 }),
            shift({ padding: 8 }),
            size({
                padding: 8,
                apply({ availableHeight, elements }) {
                    const menu = elements.floating;
                    menu.style.maxHeight = `${Math.max(0, availableHeight)}px`;
                },
            }),
        ],
    });
    const { getReferenceProps, getFloatingProps, getItemProps } =
        useInteractions([
            useClick(context),
            useDismiss(context, { ancestorScroll: true }),
            useRole(context, { role: 'menu' }),
            useListNavigation(context, {
                listRef,
                activeIndex,
                onNavigate: setActiveIndex,
                loop: true,
            }),
            useTypeahead(context, {
                listRef: labelsRef,
                activeIndex,
                onMatch: setActiveIndex,
            }),
        ]);

    return (
        <>
            <button
                ref={refs.setReference}
                className='bookmark-action-menu-trigger'
                type='button'
                aria-label={label}
                title={label}
                {...getReferenceProps()}
            >
                <MoreVertical aria-hidden />
            </button>
            {open && (
                <FloatingPortal
                    root={context.elements.domReference?.closest<HTMLDialogElement>(
                        'dialog'
                    )}
                >
                    <FloatingFocusManager context={context} modal={false}>
                        <div
                            ref={refs.setFloating}
                            className='bookmark-action-menu'
                            style={floatingStyles}
                            {...getFloatingProps({
                                onKeyDownCapture(event) {
                                    if (event.key === 'Escape') {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setOpen(false);
                                    }
                                },
                            })}
                        >
                            {items.map((item, index) => {
                                const props = getItemProps({
                                    role: 'menuitem',
                                    className: item.danger
                                        ? 'danger'
                                        : undefined,
                                    tabIndex: activeIndex === index ? 0 : -1,
                                    onClick: () => {
                                        setOpen(false);
                                        const trigger =
                                            context.elements.domReference;
                                        if (trigger instanceof HTMLElement) {
                                            trigger.focus({
                                                preventScroll: true,
                                            });
                                        }
                                        item.onSelect?.();
                                    },
                                });
                                const content = (
                                    <>
                                        {item.icon}
                                        <span>{item.label}</span>
                                    </>
                                );
                                const ref = (element: HTMLElement | null) => {
                                    listRef.current[index] = element;
                                };
                                return item.href ? (
                                    <a
                                        key={item.label}
                                        ref={ref}
                                        href={item.href}
                                        target='_blank'
                                        rel='noreferrer'
                                        {...props}
                                    >
                                        {content}
                                    </a>
                                ) : (
                                    <button
                                        key={item.label}
                                        ref={ref}
                                        type='button'
                                        {...props}
                                    >
                                        {content}
                                    </button>
                                );
                            })}
                        </div>
                    </FloatingFocusManager>
                </FloatingPortal>
            )}
        </>
    );
};
