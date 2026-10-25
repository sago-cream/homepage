import { Link2 } from 'lucide-react';

import { ActionMenu } from './ActionMenu';

export const BookmarkCard: React.FC<{
    bookmark: { title: string; url: string };
    sourceRef?: (element: Element | null) => void;
    onClick: () => void;
}> = ({ bookmark, sourceRef, onClick }) => (
    <button
        ref={sourceRef}
        type='button'
        className='bookmark-workspace-tree-item bookmark-link-item'
        title={bookmark.title}
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
    onAddToFeeds?: () => void;
    addToFeedsLabel?: string;
    labels: { edit: string; open: string; delete: string };
}> = ({
    bookmark,
    onEdit,
    onDelete,
    onAddToFeeds,
    addToFeedsLabel,
    labels,
}) => (
    <ActionMenu
        label={`${bookmark.title}: ${labels.edit}${bookmark.url ? `, ${labels.open}` : ''}${onAddToFeeds ? `, ${addToFeedsLabel}` : ''}${onDelete ? `, ${labels.delete}` : ''}`}
        items={[
            { label: labels.edit, onSelect: onEdit },
            ...(bookmark.url
                ? [{ label: labels.open, href: bookmark.url }]
                : []),
            ...(onAddToFeeds && addToFeedsLabel
                ? [{ label: addToFeedsLabel, onSelect: onAddToFeeds }]
                : []),
            ...(onDelete
                ? [{ label: labels.delete, onSelect: onDelete, danger: true }]
                : []),
        ]}
    />
);
