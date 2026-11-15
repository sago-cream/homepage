/** Open mounted dialogs once without repeating focus setup on rerenders. */
export const showModalDialog = (dialog: HTMLDialogElement | null): void => {
    if (dialog && !dialog.open) {
        dialog.showModal();
    }
};
