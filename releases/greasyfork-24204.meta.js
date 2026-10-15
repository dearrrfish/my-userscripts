// ==UserScript==
// @name                 Picviewer CE+ [FM-Compat]
// @name:zh-CN           Picviewer CE+ [FM-Compat]
// @name:zh-TW           Picviewer CE+ [FM-Compat]
// @name:ja              Picviewer CE+ [FM-Compat]
// @name:pt-BR           Picviewer CE+ [FM-Compat]
// @name:ru              Picviewer CE+ [FM-Compat]
// @author               NLF && ywzhaiqi && hoothin
// @description          Powerful picture viewing tool online, which can popup/scale/rotate/batch save pictures automatically
// @description:zh-CN    在线看图工具，支持图片翻转、旋转、缩放、弹出大图、批量保存
// @description:zh-TW    線上看圖工具，支援圖片翻轉、旋轉、縮放、彈出大圖、批量儲存
// @description:ja       画像を強力に閲覧できるツール。ポップアップ表示、拡大・縮小、回転、一括保存などの機能を自動で実行できます
// @description:pt-BR    Poderosa ferramenta de visualização de imagens on-line, que pode pop-up/dimensionar/girar/salvar em lote imagens automaticamente
// @description:ru       Мощный онлайн-инструмент для просмотра изображений, который может автоматически отображать/масштабировать/вращать/пакетно сохранять изображения
// @icon                 data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAMAAADXqc3KAAAAV1BMVEUAAAD////29vbKysoqKioiIiKysrKhoaGTk5N9fX3z8/Pv7+/r6+vk5OTb29vOzs6Ojo5UVFQzMzMZGRkREREMDAy4uLisrKylpaV4eHhkZGRPT08/Pz/IfxjQAAAAgklEQVQoz53RRw7DIBBAUb5pxr2m3/+ckfDImwyJlL9DDzQgDIUMRu1vWOxTBdeM+onApENF0qHjpkOk2VTwLVEF40Kbfj1wK8AVu2pQA1aBBYDHJ1wy9Cf4cXD5chzNAvsAnc8TjoLAhIzsBao9w1rlVTIvkOYMd9nm6xPi168t9AYkbANdajpjcwAAAABJRU5ErkJggg==
// @namespace            https://github.com/hoothin/UserScripts
// @homepage             https://pv.hoothin.com/
// @supportURL           https://github.com/hoothin/UserScripts/issues
// @connect              www.google.com
// @connect              www.google.com.hk
// @connect              www.google.co.jp
// @connect              ipv4.google.com
// @connect              image.baidu.com
// @connect              www.tineye.com
// @connect              hoothin.com
// @connect              *
// @grant                GM_log
// @grant                GM_getValue
// @grant                GM_setValue
// @grant                GM_deleteValue
// @grant                GM_addStyle
// @grant                GM_openInTab
// @grant                GM_setClipboard
// @grant                GM_xmlhttpRequest
// @grant                GM_registerMenuCommand
// @grant                GM_notification
// @grant                GM_download
// @grant                GM.getValue
// @grant                GM.setValue
// @grant                GM.deleteValue
// @grant                GM.addStyle
// @grant                GM.openInTab
// @grant                GM.setClipboard
// @grant                GM.xmlHttpRequest
// @grant                GM.registerMenuCommand
// @grant                GM.notification
// @grant                unsafeWindow
// @require              https://update.greasyfork.org/scripts/6158/23710/GM_config%20CN.js
// @require              https://update.greasyfork.org/scripts/438080/1945644/pvcep_rules.js
// @require              https://update.greasyfork.org/scripts/440698/1945643/pvcep_lang.js
// @require              https://cdn.jsdelivr.net/npm/video.js@8.23.3/dist/video.min.js
// @match                *://*/*
// @exclude              http://www.toodledo.com/tasks/*
// @exclude              http*://maps.google.com*/*
// @exclude              *://www.google.*/_/chrome/newtab*
// @exclude              *://mega.*/*
// @exclude              *://*.mega.*/*
// @exclude              *://onedrive.live.com/*
// @exclude              *://teams.live.com/*
// @run-at               document-end
// @created              2011-6-15
// @contributionURL      https://ko-fi.com/hoothin
// @contributionAmount   1
// @version              2026.9.29.1
// @downloadURL          https://raw.githubusercontent.com/dearrrfish/my-userscripts/master/releases/greasyfork-24204.user.js
// @updateURL            https://raw.githubusercontent.com/dearrrfish/my-userscripts/master/releases/greasyfork-24204.meta.js
// ==/UserScript==
