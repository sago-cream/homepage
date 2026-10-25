import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import type { BookmarkControls } from '@/hooks/useBookmarks';
import { useKeybinds } from '@/hooks/useKeybinds';
import { useLocale } from '@/hooks/useLocale';
import { normalizeHotkey } from '@/utils/keybinds';
import type { Keybind } from '@/utils/keybinds';
import { getSearchItems, getSlashCommandResults } from '@/utils/search';
import { SettingsDropdown } from './SettingsDropdown';

export const KeybindSettingsSection = ({
    bookmarkControls,
    openDropdownId,
    onOpenDropdownChange,
}: {
    bookmarkControls: BookmarkControls;
    openDropdownId?: string;
    onOpenDropdownChange: (id: string | undefined) => void;
}): ReactElement => {
    const { t } = useLocale();
    const { keybinds, saveKeybinds } = useKeybinds();
    const addButtonRef = useRef<HTMLButtonElement>(null);
    const pendingKeybindRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const id = pendingKeybindRef.current;
        if (id && keybinds.some((binding) => binding.id === id)) {
            pendingKeybindRef.current = undefined;
            document
                .querySelector<HTMLButtonElement>(`[id="keybind-action-${id}"]`)
                ?.focus();
        }
    }, [keybinds]);
    const [error, setError] = useState<{ id?: string; message: string }>();
    const bookmarks = getSearchItems(bookmarkControls.bookmarkTree);
    const commands = getSlashCommandResults('/');
    const save = (next: readonly Keybind[]) => {
        setError(
            saveKeybinds(next) ? undefined : { message: t.keybindSaveFailed }
        );
    };
    const update = (id: string, change: Partial<Keybind>) => {
        save(
            keybinds.map((binding) =>
                binding.id === id ? { ...binding, ...change } : binding
            )
        );
    };
    const setHotkey = (id: string, value: string) => {
        const key = normalizeHotkey(value);
        if (key === undefined) {
            setError({ id, message: t.keybindLetterRequired });
        } else if (
            key !== '' &&
            keybinds.some((binding) => binding.id !== id && binding.key === key)
        ) {
            setError({ id, message: t.keybindDuplicate });
        } else {
            update(id, { key });
        }
    };

    return (
        <section className='settings-page-section settings-keybinds'>
            <div className='settings-section-heading'>
                <h2>{t.keybinds}</h2>
            </div>
            <div className='settings-card'>
                {keybinds.length === 0 ? (
                    <p className='settings-row-description settings-keybind-empty'>
                        {t.keybindsEmpty}
                    </p>
                ) : undefined}
                {keybinds.map((binding, index) => {
                    const missingBookmark =
                        binding.target.startsWith('bookmark:') &&
                        !bookmarks.some(
                            (bookmark) =>
                                `bookmark:${bookmark.id}` === binding.target
                        );
                    return (
                        <div
                            className='settings-row settings-keybind-row'
                            key={binding.id}
                        >
                            <div className='settings-keybind-action'>
                                <span
                                    className='settings-row-label'
                                    id={`keybind-action-${binding.id}-label`}
                                >
                                    {t.keybindAction} {index + 1}
                                </span>
                                <SettingsDropdown
                                    id={`keybind-action-${binding.id}`}
                                    labelledBy={`keybind-action-${binding.id}-label`}
                                    value={binding.target}
                                    options={[
                                        {
                                            value: '',
                                            label: t.keybindSelectAction,
                                        },
                                        ...commands.map((command) => ({
                                            value: `command:${command.command}`,
                                            label: command.label,
                                        })),
                                        ...bookmarks.map((bookmark) => ({
                                            value: `bookmark:${bookmark.id}`,
                                            label: `${bookmark.title} — ${bookmark.pathLabel}`,
                                            searchText: bookmark.title,
                                        })),
                                        ...(missingBookmark
                                            ? [
                                                  {
                                                      value: binding.target,
                                                      label: t.keybindBookmarkUnavailable,
                                                      disabled: true,
                                                  },
                                              ]
                                            : []),
                                    ]}
                                    isOpen={openDropdownId === binding.id}
                                    onOpenChange={(isOpen) => {
                                        onOpenDropdownChange(
                                            isOpen ? binding.id : undefined
                                        );
                                    }}
                                    onChange={(target) => {
                                        update(binding.id, { target });
                                    }}
                                />
                            </div>
                            <label className='settings-hotkey-field'>
                                <span className='settings-row-label'>
                                    {t.hotkey}
                                </span>
                                <input
                                    className='settings-select settings-hotkey-input'
                                    type='text'
                                    value={binding.key.toUpperCase()}
                                    maxLength={1}
                                    autoComplete='off'
                                    autoCapitalize='off'
                                    spellCheck={false}
                                    placeholder='A–Z'
                                    aria-invalid={error?.id === binding.id}
                                    aria-describedby={
                                        error?.id === binding.id
                                            ? 'keybind-error'
                                            : undefined
                                    }
                                    onFocus={(event) => {
                                        event.currentTarget.select();
                                    }}
                                    onKeyDown={(event) => {
                                        if (
                                            !event.nativeEvent.isComposing &&
                                            !event.ctrlKey &&
                                            !event.metaKey &&
                                            !event.altKey &&
                                            event.key.length === 1
                                        ) {
                                            event.preventDefault();
                                            setHotkey(binding.id, event.key);
                                        }
                                    }}
                                    onPaste={(event) => {
                                        event.preventDefault();
                                        setHotkey(
                                            binding.id,
                                            event.clipboardData.getData('text')
                                        );
                                    }}
                                    onChange={(event) => {
                                        setHotkey(
                                            binding.id,
                                            event.target.value
                                        );
                                    }}
                                />
                            </label>
                            <button
                                className='bookmark-workspace-icon-button settings-keybind-remove'
                                type='button'
                                aria-label={`${t.removeKeybind} ${index + 1}`}
                                onClick={() => {
                                    onOpenDropdownChange(undefined);
                                    const next =
                                        keybinds.at(index + 1) ??
                                        keybinds.at(index - 1);
                                    save(
                                        keybinds.filter(
                                            (item) => item.id !== binding.id
                                        )
                                    );
                                    requestAnimationFrame(() => {
                                        const target =
                                            next && next.id !== binding.id
                                                ? document.querySelector<HTMLButtonElement>(
                                                      `[id="keybind-action-${next.id}"]`
                                                  )
                                                : addButtonRef.current;
                                        target?.focus();
                                    });
                                }}
                            >
                                <Trash2 size={18} aria-hidden />
                            </button>
                        </div>
                    );
                })}
            </div>
            {error ? (
                <p
                    id='keybind-error'
                    className='bookmark-manager-error'
                    role='alert'
                >
                    {error.message}
                </p>
            ) : undefined}
            <div className='settings-keybind-footer'>
                <button
                    ref={addButtonRef}
                    className='bookmark-workspace-primary-button'
                    type='button'
                    onClick={() => {
                        const id = globalThis.crypto.randomUUID();
                        pendingKeybindRef.current = id;
                        save([...keybinds, { id, target: '', key: '' }]);
                    }}
                >
                    <Plus size={18} aria-hidden />
                    {t.addKeybind}
                </button>
            </div>
        </section>
    );
};
