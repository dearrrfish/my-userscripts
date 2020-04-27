// ==UserScript==
// @name         Spotify Web Sidebar Toggler
// @description  Adds the ability to toggle the main sidebar on Spotify Web using a keyboard shortcut (ctrl + alt + B), original code from https://github.com/dumptyd/slack-sidebar-toggler
// @author       dearrrfish (http://github.com/dearrrfish)
// @version      1.0.1
// @namespace    http://github.com/dearrrfish
// @include      https://open.spotify.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const combinator = {
    on(passedCombination, callback) {
      const combination = passedCombination.map(c => c.toLowerCase());
      let buffer = [];
      let skipNextKeyUp = false;

      const isCombinationMet = () => buffer.toString() === combination.toString();

      document.addEventListener('keydown', e => {
        const key = e.key.toLowerCase();
        buffer.push(key);

        if (isCombinationMet()) {
          buffer.pop();
          if (buffer.length) skipNextKeyUp = true;

          callback();
        }
      });

      document.addEventListener('keyup', e => {
        if (skipNextKeyUp) {
          skipNextKeyUp = false;
          return;
        }
        buffer = [];
      });
    }
  };

  const onLoad = callback => {
    const loadedStates = ['loaded', 'interactive', 'complete'];
    if (loadedStates.includes(document.readyState)) {
      callback();
    }
    else {
      window.addEventListener('load', () => {
        callback();
      });
    }
  };

  const style = {
    leftSidebarCollapsedClassName: 'SST-left-sidebar-collapsed',
    leftSidebarWidth: '230px',
    navbarSelector: '.Root__nav-bar',
    topbarSelector: '.Root__top-bar header'
  };
  GM_addStyle(`
    .${style.leftSidebarCollapsedClassName} ${style.topbarSelector} {
      max-width: 100vw;
    }
    .${style.leftSidebarCollapsedClassName} ${style.navbarSelector} {
      width: 0;
      transform: translate(-${style.leftSidebarWidth});
    }
    ${style.navbarSelector} {
      transition: .2s transform;
    }
  `);

  onLoad(() => {
    combinator.on(['Control', 'Alt', 'B'], () => {
      document.body.classList.toggle(style.leftSidebarCollapsedClassName);
    });
  });
})();
