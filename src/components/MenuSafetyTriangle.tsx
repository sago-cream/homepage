import { useLayoutEffect, useRef } from 'react';

import type { MenuPoint } from '@/hooks/useMenuAim';

export const MenuSafetyTriangle = ({
    points,
}: {
    points: MenuPoint[];
}): React.JSX.Element => {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (points.length > 0) {
            ref.current?.showPopover();
        } else {
            ref.current?.hidePopover();
        }
    }, [points.length]);
    return (
        <div
            className='menu-safety-overlay'
            popover='manual'
            ref={ref}
            aria-hidden='true'
        >
            <svg className='menu-safety-triangle'>
                {points.length > 0 && (
                    <polygon
                        points={points.map(({ x, y }) => `${x},${y}`).join(' ')}
                    />
                )}
            </svg>
        </div>
    );
};
