import { describe, test } from 'bun:test';
import { RuleTester } from 'eslint';

import { dialogFocusRules } from './dialog-focus.mjs';

RuleTester.describe = describe;
RuleTester.it = test;
const tester = new RuleTester({
    languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
    },
});

tester.run('stable-dialog-ref', dialogFocusRules['stable-dialog-ref'], {
    valid: [
        '<dialog ref={dialogRef} />',
        '<dialog ref={showModalDialog} />',
        'const attach = useCallback(node => node?.showModal(), []); <dialog ref={attach} />',
        '<dialog ref={refs.dialog} />',
        '<div ref={node => node?.focus()} />',
    ],
    invalid: [
        {
            code: '<dialog ref={node => { if (node && !node.open) node.showModal(); }} />',
            errors: [{ messageId: 'unstable' }],
        },
        {
            code: '<dialog ref={function(node) { node?.showModal(); }} />',
            errors: [{ messageId: 'unstable' }],
        },
        {
            code: '<dialog ref={enabled ? node => node?.showModal() : dialogRef} />',
            errors: [{ messageId: 'unstable' }],
        },
    ],
});

tester.run(
    'no-invalid-focus-effect',
    dialogFocusRules['no-invalid-focus-effect'],
    {
        valid: [
            'function submit() { setErrors(errors); dialog.querySelector(\'[aria-invalid="true"]\')?.focus(); }',
            'useEffect(() => { input.current?.focus(); }, [isOpen]);',
            'useEffect(() => { dialog.querySelector(\'[aria-invalid="true"]\')?.scrollIntoView(); }, [errors]);',
        ],
        invalid: [
            {
                code: 'useEffect(() => { const invalid = dialog.querySelector(\'[aria-invalid="true"]\'); invalid?.focus(); }, [errors]);',
                errors: [{ messageId: 'reactiveFocus' }],
            },
            {
                code: 'React.useLayoutEffect(() => { dialog.querySelectorAll(\'input[aria-invalid="true"]\')[0]?.focus(); }, [errors]);',
                errors: [{ messageId: 'reactiveFocus' }],
            },
            {
                code: 'useEffect(() => { dialog.querySelector(\'[aria-invalid="true"]\')?.["focus"](); }, [errors]);',
                errors: [{ messageId: 'reactiveFocus' }],
            },
        ],
    }
);
