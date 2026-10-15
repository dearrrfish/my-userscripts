// Authored adapter for GM_config's supported custom-element frame mode.
export function createPicviewerSettingsPanel(document) {
    const panel = document.createElement('div');
    // GM_config's tab helpers use the Document-shaped lookup on custom frames.
    panel.getElementById = id => {
        if (panel.id === id) { return panel; }
        for (const element of panel.querySelectorAll('[id]')) {
            if (element.id === id) { return element; }
        }
        return null;
    };
    return panel;
}
export function openPicviewerSettingsPanel(config, document) {
    const panel = config.frame;
    if (!panel || panel.tagName !== 'DIV') {
        throw new TypeError('Picviewer settings require their same-document panel');
    }
    if (!panel.isConnected) { document.documentElement.appendChild(panel); }
    config.open();
    // GM_config applies frameStyle only in its iframe branch, so apply it here.
    Object.assign(panel.style, config.frameStyle || {});
    panel.style.boxSizing = 'border-box';
    // Keep the existing fixed settings buttons positioned inside the panel.
    panel.style.transform = 'translateZ(0)';
    config.center();
    return panel;
}
