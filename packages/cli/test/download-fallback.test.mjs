import test from 'node:test';
import assert from 'node:assert/strict';
import { getMirrorUrl, download } from '../dist/index.js';

test('getMirrorUrl correctly maps between Greasy Fork and Sleazy Fork domains', () => {
  assert.equal(
    getMirrorUrl('https://update.greasyfork.org/scripts/454120/script.user.js'),
    'https://update.sleazyfork.org/scripts/454120/script.user.js'
  );
  assert.equal(
    getMirrorUrl('https://greasyfork.org/scripts/454120/code.user.js'),
    'https://sleazyfork.org/scripts/454120/code.user.js'
  );
  assert.equal(
    getMirrorUrl('https://update.sleazyfork.org/scripts/454120/script.user.js'),
    'https://update.greasyfork.org/scripts/454120/script.user.js'
  );
  assert.equal(
    getMirrorUrl('https://sleazyfork.org/scripts/454120/code.user.js'),
    'https://greasyfork.org/scripts/454120/code.user.js'
  );
  assert.equal(
    getMirrorUrl('https://example.com/scripts/454120/script.user.js'),
    null
  );
  assert.equal(
    getMirrorUrl('not-a-valid-url'),
    null
  );
});

test('download automatically falls back to Sleazy Fork when Greasy Fork returns 404', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes('greasyfork.org')) {
        return new Response('Not Found', { status: 404 });
      }
      if (urlStr.includes('sleazyfork.org')) {
        return new Response('// ==UserScript==\n// @name SleazyFork Fallback\n// ==/UserScript==', { status: 200 });
      }
      return originalFetch(url, options);
    };

    const content = await download('https://update.greasyfork.org/scripts/454120/script.user.js');
    assert.match(content, /@name SleazyFork Fallback/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('download falls back when Greasy Fork redirects to login page', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes('greasyfork.org')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://greasyfork.org/en/users/sign_in?return_to=%2Fscripts%2F454120' }
        });
      }
      if (urlStr.includes('sleazyfork.org')) {
        return new Response('// ==UserScript==\n// @name Login Fallback Success\n// ==/UserScript==', { status: 200 });
      }
      return originalFetch(url, options);
    };

    const content = await download('https://greasyfork.org/scripts/454120/code.user.js');
    assert.match(content, /@name Login Fallback Success/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('download falls back when Greasy Fork returns "no longer anonymously available" HTML', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes('greasyfork.org')) {
        return new Response('<p>This script is no longer anonymously available on this site. Log in...</p>', { status: 200 });
      }
      if (urlStr.includes('sleazyfork.org')) {
        return new Response('// ==UserScript==\n// @name HTML Guard Fallback Success\n// ==/UserScript==', { status: 200 });
      }
      return originalFetch(url, options);
    };

    const content = await download('https://greasyfork.org/scripts/454120/code.user.js');
    assert.match(content, /@name HTML Guard Fallback Success/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('download injects Cookie header for greasyfork/sleazyfork when GREASYFORK_COOKIE is set', async () => {
  const originalFetch = globalThis.fetch;
  const originalCookie = process.env.GREASYFORK_COOKIE;
  process.env.GREASYFORK_COOKIE = 'secret_session_token_12345';
  try {
    let capturedHeaders = null;
    globalThis.fetch = async (url, options) => {
      capturedHeaders = options.headers;
      return new Response('// ==UserScript==\n// @name Auth Script\n// ==/UserScript==', { status: 200 });
    };

    await download('https://update.sleazyfork.org/scripts/454120/script.user.js');
    assert.equal(capturedHeaders?.Cookie, 'secret_session_token_12345');
  } finally {
    if (originalCookie !== undefined) {
      process.env.GREASYFORK_COOKIE = originalCookie;
    } else {
      delete process.env.GREASYFORK_COOKIE;
    }
    globalThis.fetch = originalFetch;
  }
});

test('download does not inject Cookie header for untrusted external domains', async () => {
  const originalFetch = globalThis.fetch;
  const originalCookie = process.env.GREASYFORK_COOKIE;
  process.env.GREASYFORK_COOKIE = 'secret_session_token_12345';
  try {
    let capturedHeaders = null;
    globalThis.fetch = async (url, options) => {
      capturedHeaders = options.headers;
      return new Response('console.log("ok");', { status: 200 });
    };

    await download('https://example.com/unrelated.js');
    assert.equal(capturedHeaders?.Cookie, undefined);
  } finally {
    if (originalCookie !== undefined) {
      process.env.GREASYFORK_COOKIE = originalCookie;
    } else {
      delete process.env.GREASYFORK_COOKIE;
    }
    globalThis.fetch = originalFetch;
  }
});

test('download failure preserves error message and does not leak credentials', async () => {
  const originalFetch = globalThis.fetch;
  const originalCookie = process.env.GREASYFORK_COOKIE;
  process.env.GREASYFORK_COOKIE = 'super_secret_cookie_leak_test';
  try {
    globalThis.fetch = async () => new Response('Internal Server Error', { status: 500 });

    await assert.rejects(
      async () => {
        await download('https://update.greasyfork.org/scripts/454120/script.user.js');
      },
      (err) => {
        assert.ok(!String(err).includes('super_secret_cookie_leak_test'));
        assert.match(String(err), /Source download HTTP 500/);
        return true;
      }
    );
  } finally {
    if (originalCookie !== undefined) {
      process.env.GREASYFORK_COOKIE = originalCookie;
    } else {
      delete process.env.GREASYFORK_COOKIE;
    }
    globalThis.fetch = originalFetch;
  }
});
