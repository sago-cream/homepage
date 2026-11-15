const isEffect = (callee) =>
    (callee.type === 'Identifier' &&
        ['useEffect', 'useLayoutEffect'].includes(callee.name)) ||
    (callee.type === 'MemberExpression' &&
        !callee.computed &&
        ['useEffect', 'useLayoutEffect'].includes(callee.property.name));

/** @returns {boolean} Whether the subtree matches the predicate. */
const containsNode = (node, visitorKeys, predicate) => {
    if (predicate(node)) {
        return true;
    }
    return (visitorKeys[node.type] ?? []).some((key) => {
        const children = Array.isArray(node[key]) ? node[key] : [node[key]];
        return children.some(
            (child) =>
                Boolean(child) && containsNode(child, visitorKeys, predicate)
        );
    });
};

/** @type {Record<string, import("eslint").Rule.RuleModule>} */
export const dialogFocusRules = {
    'stable-dialog-ref': {
        meta: {
            type: 'problem',
            schema: [],
            messages: {
                unstable:
                    'Use a stable ref for native dialogs (useRef, useCallback, or a module-level callback). Inline refs detach and reattach on every render and can repeat modal focus initialization.',
            },
        },
        create(context) {
            return {
                JSXAttribute(node) {
                    if (
                        node.name.name !== 'ref' ||
                        node.parent.name.type !== 'JSXIdentifier' ||
                        node.parent.name.name !== 'dialog' ||
                        node.value?.type !== 'JSXExpressionContainer'
                    ) {
                        return;
                    }
                    if (
                        containsNode(
                            node.value.expression,
                            context.sourceCode.visitorKeys,
                            (child) =>
                                child.type === 'ArrowFunctionExpression' ||
                                child.type === 'FunctionExpression'
                        )
                    ) {
                        context.report({ node, messageId: 'unstable' });
                    }
                },
            };
        },
    },
    'no-invalid-focus-effect': {
        meta: {
            type: 'problem',
            schema: [],
            messages: {
                reactiveFocus:
                    'Focus invalid fields in the submit handler, not an effect. Error state changes while typing can move focus away from the field being edited.',
            },
        },
        create(context) {
            return {
                CallExpression(node) {
                    if (!isEffect(node.callee) || !node.arguments[0]) {
                        return;
                    }
                    const callback = node.arguments[0];
                    const { visitorKeys } = context.sourceCode;
                    const hasInvalidSelector = containsNode(
                        callback,
                        visitorKeys,
                        (child) =>
                            child.type === 'CallExpression' &&
                            child.callee.type === 'MemberExpression' &&
                            ['querySelector', 'querySelectorAll'].includes(
                                child.callee.property.name
                            ) &&
                            child.arguments.some(
                                (argument) =>
                                    argument.type === 'Literal' &&
                                    typeof argument.value === 'string' &&
                                    argument.value.includes('[aria-invalid')
                            )
                    );
                    const hasFocus = containsNode(
                        callback,
                        visitorKeys,
                        (child) =>
                            child.type === 'CallExpression' &&
                            child.callee.type === 'MemberExpression' &&
                            (child.callee.property.name === 'focus' ||
                                child.callee.property.value === 'focus')
                    );
                    if (hasInvalidSelector && hasFocus) {
                        context.report({ node, messageId: 'reactiveFocus' });
                    }
                },
            };
        },
    },
};
