// ==UserScript==
// @name         Slack Web Sidebar Toggler
// @description  Adds the ability to toggle the main sidebar on Spotify Web using a keyboard shortcut (ctrl + alt + B), inspired by https://github.com/dumptyd/slack-sidebar-toggler
// @author       dearrrfish (http://github.com/dearrrfish)
// @version      1.0.0
// @namespace    http://github.com/dearrrfish
// @include      https://app.slack.com/client/*
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
    sidebarClassName: 'p-workspace__sidebar',
    primaryviewClassName: 'p-workspace__primary_view',
    secondaryviewClassName: 'p-workspace__secondary_view',
    bannerClassName: 'p-workspace__banner',
    clientSelector: '.p-client',
    workspaceSelector: '.p-workspace',
    expandedWorkspaceSelector: '.p-workspace.p-workspace--context-pane-expanded',
    searchPopoverModalSelector: '.c-search_modal > .popover'
  };
  GM_addStyle(`

${style.workspaceSelector} > div {
  transition: width 2s;
}

.${style.leftSidebarCollapsedClassName} ${style.workspaceSelector} {
  grid-template-columns: 0 auto;
}

.${style.leftSidebarCollapsedClassName} ${style.expandedWorkspaceSelector} {
  grid-template-columns: 0 auto 350px;
}

.${style.leftSidebarCollapsedClassName} .${style.sidebarClassName} {
  width: 0;
  opacity: 0;
  transition: width 2s, opacity 2s;
}

.${style.primaryviewClassName} {
  position: relative;
}

.${style.primaryviewClassName} > div.nav-bar-toggler {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 7px;
  height: calc(100vh - 38px);
  display: block;
  z-index: 300;
}

.${style.primaryviewClassName} > div.nav-bar-toggler:hover {
  cursor: e-resize;
  content: linear-gradient(#e66465, #9198e5);
}

@media screen and (max-width: 700px) {

  ${style.searchPopoverModalSelector} {
    min-width: unset !important;
  }

  ${style.expandedWorkspaceSelector} {
    grid-template-areas:
      "${style.sidebarClassName} ${style.primaryviewClassName}"
      "${style.sidebarClassName} ${style.secondaryviewClassName}"
      "${style.bannerClassName} ${style.bannerClassName}" !important;
    grid-template-columns: 180px auto;
    grid-template-rows: auto auto min-content;
  }

  ${style.expandedWorkspaceSelector} .${style.secondaryviewClassName} {
    width: 100%;
  }

  ${style.expandedWorkspaceSelector} .${style.secondaryviewClassName} {
    left: 0;
    right: 0;
  }

  .${style.leftSidebarCollapsedClassName} ${style.expandedWorkspaceSelector} {
    grid-template-columns: 0 auto;
  }
}
  `)


  function toggleSideBar() {
    document.body.classList.toggle(style.leftSidebarCollapsedClassName);
  }

  onLoad(() => {
    combinator.on(['Control', 'Alt', 'B'], () => {
      toggleSideBar();
    });

    const checkMainViewExist = setInterval(() => {
      const mainview = document.querySelector(`.${style.primaryviewClassName}`);
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
