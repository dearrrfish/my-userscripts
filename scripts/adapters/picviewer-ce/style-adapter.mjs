// Authored adapter: independent of FireMonkey's void-returning GM_addStyle.
export function createPicviewerStyle(document, cssText) {
    const styleElement = document.createElement('style');
    styleElement.textContent = cssText;
    const parent = document.head || document.documentElement;
    parent.appendChild(styleElement);
    return styleElement;
}
