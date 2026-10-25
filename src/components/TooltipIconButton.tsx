import type { ButtonHTMLAttributes, ReactElement } from 'react';
import { useState } from 'react';
import {
    autoUpdate,
    flip,
    FloatingPortal,
    offset,
    shift,
    useDismiss,
    useFloating,
    useFocus,
    useHover,
    useInteractions,
    useRole,
} from '@floating-ui/react';

export const TooltipIconButton = ({
    label,
    description,
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    description?: string;
}): ReactElement => {
    const [open, setOpen] = useState(false);
    const { refs, floatingStyles, context } = useFloating({
        open,
        onOpenChange: setOpen,
        placement: 'bottom',
        strategy: 'fixed',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    });
    const { getReferenceProps, getFloatingProps } = useInteractions([
        useHover(context, { delay: 250 }),
        useFocus(context),
        useDismiss(context, { ancestorScroll: true }),
        useRole(context, { role: 'tooltip' }),
    ]);
    return (
        <>
            <button
                {...props}
                {...getReferenceProps({
                    onKeyDown(event) {
                        if (open && event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            setOpen(false);
                        }
                    },
                })}
                ref={refs.setReference}
                type='button'
                aria-label={label}
                aria-description={description}
                className='bookmark-workspace-icon-button'
            >
                {children}
            </button>
            {open && (
                <FloatingPortal
                    root={context.elements.domReference?.closest<HTMLDialogElement>(
                        'dialog'
                    )}
                >
                    <div
                        ref={refs.setFloating}
                        style={floatingStyles}
                        className='settings-tooltip'
                        {...getFloatingProps()}
                    >
                        <strong>{label}</strong>
                        {description && <span>{description}</span>}
                    </div>
                </FloatingPortal>
            )}
        </>
    );
};
