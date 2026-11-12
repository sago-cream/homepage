import { Link2 } from 'lucide-react';

import { ActionMenu } from './ActionMenu';

export const BookmarkCard: React.FC<{
    bookmark: { title: string; url: string };
    sourceRef?: (element: Element | null) => void;
    selected?: boolean;
    onClick: () => void;
}> = ({ bookmark, sourceRef, selected, onClick }) => (
    <button
        ref={sourceRef}
        type='button'
        className='bookmark-workspace-tree-item bookmark-link-item'
        title={bookmark.title}
        aria-pressed={selected}
        onClick={onClick}
    >
        <Link2 aria-hidden='true' />
        <span className='bookmark-settings-link-copy'>
            <strong>{bookmark.title}</strong>
        </span>
    </button>
);

export const BookmarkActions: React.FC<{
    bookmark: { title: string; url?: string };
    onEdit: () => void;
    onDelete?: () => void;
    onAddToQuickLaunch?: () => void;
    addToQuickLaunchLabel?: string;
    labels: { edit: string; open: string; delete: string };
}> = ({
    bookmark,
    onEdit,
    onDelete,
    onAddToQuickLaunch,
    addToQuickLaunchLabel,
    labels,
}) => (
    <ActionMenu
        label={`${bookmark.title}: ${labels.edit}${bookmark.url ? `, ${labels.open}` : ''}${onAddToQuickLaunch ? `, ${addToQuickLaunchLabel}` : ''}${onDelete ? `, ${labels.delete}` : ''}`}
        items={[
            { label: labels.edit, onSelect: onEdit },
            ...(bookmark.url
                ? [{ label: labels.open, href: bookmark.url }]
                : []),
            ...(onAddToQuickLaunch && addToQuickLaunchLabel
                ? [
                      {
                          label: addToQuickLaunchLabel,
                          onSelect: onAddToQuickLaunch,
                      },
                  ]
                : []),
            ...(onDelete
                ? [{ label: labels.delete, onSelect: onDelete, danger: true }]
                : []),
        ]}
    />
);
