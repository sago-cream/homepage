import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    safePolygon,
    useFloating,
    useFloatingNodeId,
    useFloatingParentNodeId,
    useFloatingTree,
    useHover,
    useInteractions,
} from '@floating-ui/react';
import type { HandleClose, Placement } from '@floating-ui/react';

export const MenuAimDebugContext = createContext(false);

export interface MenuPoint {
    x: number;
    y: number;
}

const emptyTriangle: readonly MenuPoint[] = [];

// The overlay is illustrative; Floating UI owns all hit testing and timing.
export const useMenuAim = (
    enabled: boolean,
    forcedOpen = false
): ReturnType<typeof useInteractions> & {
    refs: ReturnType<typeof useFloating>['refs'];
    nodeId: string | undefined;
    open: boolean;
    triangle: readonly MenuPoint[];
    setPlacement: React.Dispatch<React.SetStateAction<Placement>>;
    clearTriangle: () => void;
} => {
    const debug = useContext(MenuAimDebugContext);
    const [hovered, setHovered] = useState(false);
    const [triangle, setTriangle] =
        useState<readonly MenuPoint[]>(emptyTriangle);
    const [placement, setPlacement] = useState<Placement>('right-start');
    const nodeId = useFloatingNodeId();
    const parentId = useFloatingParentNodeId();
    const tree = useFloatingTree();
    const open = forcedOpen || (enabled && hovered);
    const { refs, context } = useFloating({
        nodeId,
        placement,
        open,
        onOpenChange: setHovered,
    });
    const handleClose = useMemo(() => {
        const handler: HandleClose = (args) => {
            // Each crossing needs fresh intent and landing state.
            const polygon = safePolygon({
                blockPointerEvents: true,
                // Keep slow crossings safe without independent idle-close timers.
                requireIntent: false,
            });
            if (!debug) {
                return polygon(args);
            }
            const bounds = args.elements.floating?.getBoundingClientRect();
            if (bounds && bounds.width > 0 && bounds.height > 0) {
                const edge = args.placement.startsWith('left')
                    ? bounds.right
                    : bounds.left;
                setTriangle([
                    { x: args.x, y: args.y },
                    { x: edge, y: bounds.top },
                    { x: edge, y: bounds.bottom },
                ]);
            }
            return polygon({
                ...args,
                onClose: () => {
                    setTriangle(emptyTriangle);
                    args.onClose();
                },
            });
        };
        handler.__options = { blockPointerEvents: true };
        return handler;
    }, [debug]);
    const hover = useHover(context, {
        enabled: enabled && !forcedOpen,
        mouseOnly: true,
        handleClose,
    });
    const interactions = useInteractions([hover]);
    useEffect(() => {
        if (!enabled) {
            setHovered(false);
        }
        if (!open || forcedOpen || !debug) {
            setTriangle(emptyTriangle);
        }
    }, [enabled, open, forcedOpen, debug]);
    useEffect(() => {
        if (hovered) {
            tree?.events.emit('bookmark-hover', { nodeId, parentId });
        }
    }, [hovered, nodeId, parentId, tree]);
    useEffect(() => {
        const onSiblingOpen = (
            event: Readonly<{
                nodeId: string;
                parentId: string | null;
            }>
        ) => {
            if (event.parentId === parentId && event.nodeId !== nodeId) {
                setHovered(false);
            }
        };
        tree?.events.on('bookmark-hover', onSiblingOpen);
        return () => {
            tree?.events.off('bookmark-hover', onSiblingOpen);
        };
    }, [tree, parentId, nodeId]);
    const clearTriangle = useCallback(() => {
        setTriangle(emptyTriangle);
    }, []);
    return {
        ...interactions,
        refs,
        nodeId,
        open,
        triangle,
        setPlacement,
        clearTriangle,
    };
};
