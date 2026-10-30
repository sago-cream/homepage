import type { ButtonHTMLAttributes } from 'react';

export const SettingsChoice: React.FC<
    ButtonHTMLAttributes<HTMLButtonElement>
> = ({ 'aria-checked': checked, ...props }) => (
    <button
        {...props}
        type='button'
        role='radio'
        aria-checked={checked}
        tabIndex={checked === true || checked === 'true' ? 0 : -1}
        onKeyDown={(event) => {
            const keys = [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
            ];
            if (!keys.includes(event.key)) {
                return;
            }
            event.preventDefault();
            const options = [
                ...(event.currentTarget
                    .closest('[role="radiogroup"]')
                    ?.querySelectorAll<HTMLButtonElement>(
                        '[role="radio"]:not(:disabled)'
                    ) ?? []),
            ];
            const index = options.indexOf(event.currentTarget);
            let next: number;
            if (event.key === 'Home') {
                next = 0;
            } else if (event.key === 'End') {
                next = options.length - 1;
            } else {
                const direction =
                    event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                        ? -1
                        : 1;
                next = (index + direction + options.length) % options.length;
            }
            options[next]?.focus();
            options[next]?.click();
        }}
    />
);
