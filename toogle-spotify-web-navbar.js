// ==UserScript==
// @name         Spotify Web Sidebar Toggler
// @description  Adds the ability to toggle the main sidebar on Spotify Web using a keyboard shortcut (ctrl + alt + B), original code from https://github.com/dumptyd/slack-sidebar-toggler
// @author       dearrrfish (http://github.com/dearrrfish)
// @version      1.1.0
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
    mainviewSelector: '.Root__main-view',
    topbarSelector: '.Root__top-bar header',
    buttonSelector: '.Root__top-bar header button[title="Go back"]'
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
    ${style.mainviewSelector} > div.nav-bar-toggler {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 7px;
      height: 100%;
      display: block;
    }
    ${style.mainviewSelector} > div.nav-bar-toggler:hover {
      content: linear-gradient(#e66465, #9198e5);
    }
  `);


  function toggleSideBar() {
    document.body.classList.toggle(style.leftSidebarCollapsedClassName);
  }

  onLoad(() => {
    combinator.on(['Control', 'Alt', 'B'], () => {
      toggleSideBar();
    });

    const checkMainViewExist = setInterval(() => {
      const mainview = document.querySelector(style.mainviewSelector);
      if (mainview) {
        const toggler = document.createElement('div');
        toggler.classList.add('nav-bar-toggler')
        toggler.onmousedown = (evt) => {
          evt.preventDefault();
          toggleSideBar();
        }
        mainview.appendChild(toggler);
        clearInterval(checkMainViewExist);
      }
    }, 500)

  });
})();
