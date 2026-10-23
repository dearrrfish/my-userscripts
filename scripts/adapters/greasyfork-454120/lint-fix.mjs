import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { lintConfig } from '../../../packages/converter/dist/index.js';

const require = createRequire(import.meta.resolve('../../../packages/converter/dist/index.js'));
const eslint = require('eslint');

const unusedCatchRule = {
  meta: {
    name: 'unused-catch',
    type: 'suggestion',
    docs: {
      description: 'Remove unused catch parameters to satisfy no-unused-vars'
    },
    fixable: 'code'
  },
  create(context) {
    return {
      CatchClause(node) {
        if (!node.param) return;
        const variables = context.sourceCode.getDeclaredVariables(node);
        const paramVar = variables.find(v => v.name === node.param.name);
        if (paramVar && paramVar.references.length === 0) {
          const sourceCode = context.sourceCode;
          const openParen = sourceCode.getTokenBefore(node.param);
          const closeParen = sourceCode.getTokenAfter(node.param);
          context.report({
            node: node.param,
            message: 'Unused catch param',
            fix(fixer) {
              return fixer.removeRange([openParen.range[0], closeParen.range[1]]);
            }
          });
        }
      }
    };
  }
};

export function applyLintFix(source, profile) {
  if (!profile) {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    profile = JSON.parse(fs.readFileSync(path.join(root, 'profiles/firemonkey-3.9-firefox-157.0.json'), 'utf8'));
  }

  let result = source;

  // 1. Remove obsolete globals comment (redeclares builtin globals under modern ESLint)
  result = result.replace(
    '/* globals unsafeWindow, window, document, navigator, atob, btoa, location, localStorage, fetch, console, alert, confirm, prompt, setInterval, setTimeout, clearTimeout, FileReader, FormData, Blob, URL, URLSearchParams, TextEncoder, CompressionStream, DecompressionStream, Response, MutationObserver, DOMParser, GM, GM_getValue, GM_setValue, GM_deleteValue, GM_listValues, GM_notification, GM_openInTab, GM_registerMenuCommand */\n',
    ''
  );

  // 2. Control regex: annotate ASCII character range check
  result = result.replace(
    '        if (keyword.match(/^[\\x00-\\x7F]+$/)) {',
    '        // eslint-disable-next-line no-control-regex\n        if (keyword.match(/^[\\x00-\\x7F]+$/)) {'
  );

  // 3. Irregular whitespace: replace raw non-breaking spaces with escape sequences
  const nbsp = '\u00a0';
  result = result.replace(
    `Pages: \${curPage}${nbsp} ${nbsp} ${nbsp}Go `,
    'Pages: ${curPage}\\u00a0 \\u00a0 \\u00a0Go '
  );

  // 4. scoringModeToggler: scope variable declaration to if-block
  result = result.replace(
    `    let scoringModeToggler = null;
    if (hasManagementRole && inResourceArea) {
        scoringModeToggler = addIgnoreToggler('rinsp-highlight-unscored-thread-toggler', 'rinsp-highlight-unscored-thread-mode');`,
    `    if (hasManagementRole && inResourceArea) {
        const scoringModeToggler = addIgnoreToggler('rinsp-highlight-unscored-thread-toggler', 'rinsp-highlight-unscored-thread-mode');`
  );

  // 5. hiddenStateChangeObserver: scope variable declaration to if-block
  result = result.replace(
    `    let hiddenStateChangeObserver = null;
    const postListForm = document.querySelector('#main > form[name="delatc"]');
    if (postListForm) {
        let lastHiddenPostCount = 0;
        hiddenStateChangeObserver = createMutationObserver(async () => {`,
    `    const postListForm = document.querySelector('#main > form[name="delatc"]');
    if (postListForm) {
        let lastHiddenPostCount = 0;
        const hiddenStateChangeObserver = createMutationObserver(async () => {`
  );

  // 6. divider = null: remove dead assignment
  result = result.replace(
    `        threadList.reverse();
    } else {
        divider = null;
    }`,
    `        threadList.reverse();
    }`
  );

  // 7. td = addElem(row, 'td') inside selectedRecords.slice
  result = result.replace(
    `                const row = addElem(tbody, 'tr');
                const th = addElem(row, 'th');
                const td = addElem(row, 'td');
                setAreaScoped(row, record.fid);`,
    `                const row = addElem(tbody, 'tr');
                const th = addElem(row, 'th');
                addElem(row, 'td');
                setAreaScoped(row, record.fid);`
  );

  // 8. Dead functions fetchCheckBountyEnded & console_info
  result = result.replace(
    `    async function fetchCheckBountyEnded(postId) {
        const bountyStatus = await fetchCheckBountyStatus(postId);
        return bountyStatus == null ? null : bountyStatus.ended === 2;
    }`,
    `    /* async function fetchCheckBountyEnded(postId) {
        const bountyStatus = await fetchCheckBountyStatus(postId);
        return bountyStatus == null ? null : bountyStatus.ended === 2;
    } */`
  );

  result = result.replace(
    `function console_info() {
    let out = document.querySelector('#rinsp-debug-console');
    if (out == null) {
        out = addElem(document.body, 'pre', null, { id: 'rinsp-debug-console', style: 'position:fixed;top:20px;left:20px;width:40em;max-height:30em;outline:5px solid #CCC;background:#FFF9;color:#000;overflow:auto;z-index:99999;' });
    }
    out.textContent += Array.from(arguments).join(', ') + '\\n';
    out.scrollTop = 10000000;
}`,
    `/* function console_info() {
    let out = document.querySelector('#rinsp-debug-console');
    if (out == null) {
        out = addElem(document.body, 'pre', null, { id: 'rinsp-debug-console', style: 'position:fixed;top:20px;left:20px;width:40em;max-height:30em;outline:5px solid #CCC;background:#FFF9;color:#000;overflow:auto;z-index:99999;' });
    }
    out.textContent += Array.from(arguments).join(', ') + '\\n';
    out.scrollTop = 10000000;
} */`
  );

  const linter = new eslint.Linter();
  const baseConfig = lintConfig(result, profile);
  const configWithCatchFix = {
    ...baseConfig,
    plugins: {
      ...baseConfig.plugins,
      local: {
        rules: {
          'unused-catch': unusedCatchRule
        }
      }
    },
    rules: {
      ...baseConfig.rules,
      'local/unused-catch': 'error'
    }
  };

  // Pass 1: verifyAndFix with unused catch fixer
  let fixRes = linter.verifyAndFix(result, configWithCatchFix);
  result = fixRes.output;

  // Pass 2: Suggestions application loop (eqeqeq, no-useless-escape, preserve-caught-error)
  for (let pass = 0; pass < 5; pass++) {
    fixRes = linter.verifyAndFix(result, baseConfig);
    result = fixRes.output;

    const messages = linter.verify(result, baseConfig);
    const fixes = [];
    for (const m of messages) {
      if (m.suggestions && m.suggestions.length > 0) {
        const sug = m.suggestions.find(s => ['removeEscape', 'replaceOperator', 'includeCause'].includes(s.messageId)) || m.suggestions[0];
        if (sug && sug.fix) {
          fixes.push(sug.fix);
        }
      }
    }
    if (fixes.length === 0) break;
    fixes.sort((a, b) => b.range[0] - a.range[0]);
    for (const fix of fixes) {
      result = result.slice(0, fix.range[0]) + fix.text + result.slice(fix.range[1]);
    }
  }

  // Pass 3: Final verifyAndFix pass to ensure clean formatting
  fixRes = linter.verifyAndFix(result, baseConfig);
  result = fixRes.output;

  return result;
}
