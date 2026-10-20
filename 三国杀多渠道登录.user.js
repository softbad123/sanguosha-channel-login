// ==UserScript==
// @name         三国杀一将成名 · 多渠道登录
// @namespace    local.sgs.channels.browser
// @author       softbad123
// @homepageURL  https://github.com/softbad123/sanguosha-channel-login
// @supportURL   https://github.com/softbad123/sanguosha-channel-login/issues
// @version      1.1
// @description  在三国杀官网按渠道接入本人账号；支持官方扫码、官方网页登录和账号管理直达。可选保存本机可恢复的官方登录状态，绝不保存密码或验证码。
// @match        https://web.sanguosha.com/*
// @match        https://joint.vivo.com.cn/game-subaccount-login/*
// @match        https://passport.vivo.com.cn/*
// @match        https://game-login.heytap.com/game-union-h5/h5/client-login/*
// @match        http://game.xiaomi.com/oauthcallback/mioauth*
// @match        https://game.xiaomi.com/oauthcallback/mioauth*
// @match        https://10th-ly-login.sanguosha.com/steam/oauth/callback.html*
// @run-at       document-start
// @sandbox      raw
// @noframes
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @connect      account.xiaomi.com
// @connect      sgp.account.xiaomi.com
// @connect      sgp.lp.account.xiaomi.com
// @connect      account.migc.g.mi.com
// @connect      anysdk.dobest.cn
// @connect      10th-sdk-login.sanguosha.com
// @connect      10th-ly-login.sanguosha.com
// @connect      m.wegame.com.cn
// @connect      openmobile.qq.com
// @connect      xui.ptlogin2.qq.com
// @connect      ssl.ptlogin2.qq.com
// @connect      ptlogin2.qq.com
// @connect      graph.qq.com
// @connect      imgcache.qq.com
// @connect      open.weixin.qq.com
// @connect      long.open.weixin.qq.com
// @connect      passport.vivo.com.cn
// @connect      joint.vivo.com.cn
// @connect      oauth-login-drcn.platform.dbankcloud.com
// @connect      oauth-login1.cloud.huawei.com
// @connect      oauth-login.cloud.huawei.com
// @connect      id1.cloud.huawei.com
// @connect      id.cloud.huawei.com
// @connect      api.steampowered.com
// @connect      login.steampowered.com
// @connect      steamcommunity.com
// @connect      store.steampowered.com
// @connect      wpg-api.biligame.com
// @connect      game.bilibili.com
// @connect      passport.biligame.com
// @connect      id-cn.heytap.com
// @connect      id.heytap.com
// @connect      client-uc.heytapmobi.com
// @connect      isdk.heytapmobi.com
// @connect      muc.heytap.com
// @connect      captcha-sec.heytapmobi.com
// @connect      game-login.heytap.com
// @connect      web-login-api.sanguosha.com
// @connect      wwwoss.sanguosha.com
// ==/UserScript==

(() => {
  'use strict';
  if (window.top !== window) return;
  const VIVO_PENDING_NONCE_KEY = 'sgs-vivo-pending-nonce-v1';
  const VIVO_PAGE_STATE_PREFIX = 'sgs-vivo-page-state-v1:';
  const STEAM_PAGE_RESULT_PREFIX = 'sgs-steam-page-result-v1:';
  function vivoBridgeNonce() {
    const fromName = /^sgs-vivo-([a-f0-9]{16,64})$/.exec(window.name || '');
    if (fromName) return fromName[1];
    try {
      const saved = sessionStorage.getItem('sgs-vivo-bridge-nonce');
      if (/^[a-f0-9]{16,64}$/.test(saved || '')) return saved;
    } catch (_) {}
    try {
      const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      const value = hash.get('sgs_vivo');
      if (/^[a-f0-9]{16,64}$/.test(value || '')) return value;
    } catch (_) {}
    try {
      const pending = GM_getValue(VIVO_PENDING_NONCE_KEY, null);
      if (pending && /^[a-f0-9]{16,64}$/.test(pending.nonce || '') && Number(pending.expires) > Date.now()) {
        return pending.nonce;
      }
    } catch (_) {}
    return '';
  }
  function vivoPageState(nonce, phase, extra = {}) {
    if (!/^[a-f0-9]{16,64}$/.test(nonce || '')) return;
    try {
      GM_setValue(VIVO_PAGE_STATE_PREFIX + nonce, {v: 1, nonce, phase,
        at: Date.now(), expires: Date.now() + 15 * 60 * 1000, ...extra});
      console.info('[统一登录器]', {stage: 'vivo_page_bridge', phase});
    } catch (_) {}
  }
  function clearVivoPending(nonce) {
    try {
      const pending = GM_getValue(VIVO_PENDING_NONCE_KEY, null);
      if (!nonce || pending?.nonce === nonce) GM_deleteValue(VIVO_PENDING_NONCE_KEY);
    } catch (_) {}
  }
  function vivoPassportBridge() {
    const nonce = vivoBridgeNonce();
    if (!nonce) return;
    const path = location.pathname.startsWith('/') ? location.pathname.slice(0, 160) : '/';
    vivoPageState(nonce, 'passport_loaded', {path, loginPage: true});
  }
  function vivoPageBridge() {
    const resultPrefix = 'sgs-vivo-page-result-v1:';
    const nonceKey = 'sgs-vivo-bridge-nonce';
    const nonce = vivoBridgeNonce();
    if (!nonce) return;
    try { sessionStorage.setItem(nonceKey, nonce); } catch (_) {}
    try {
      document.cookie = 'vvc_pn=com.yoka.sgstenth.vivo; domain=.vivo.com.cn; path=/; secure; SameSite=None';
    } catch (_) {}
    const decode = value => {
      try { return decodeURIComponent(String(value || '')); } catch (_) { return String(value || ''); }
    };
    // The official page writes the login cookies through js-cookie. Keep a
    // transient in-page copy of those writes so a successful /h5/union/use is
    // not missed when document.cookie is not immediately readable.
    const memoryCookies = Object.create(null);
    let cookieWriteAt = 0;
    try {
      let descriptor = Object.getOwnPropertyDescriptor(document, 'cookie');
      for (let proto = Object.getPrototypeOf(document); !descriptor && proto; proto = Object.getPrototypeOf(proto)) {
        descriptor = Object.getOwnPropertyDescriptor(proto, 'cookie');
      }
      if (descriptor?.get && descriptor?.set) {
        Object.defineProperty(document, 'cookie', {
          configurable: true,
          enumerable: !!descriptor.enumerable,
          get() { return descriptor.get.call(this); },
          set(raw) {
            try {
              const first = String(raw || '').split(';')[0];
              const index = first.indexOf('=');
              if (index > 0) {
                const name = first.slice(0, index).trim();
                if (name === 'vvf_subopenid' || name === 'vvf_opentoken' || name === 'vvf_openid') {
                  memoryCookies[name] = decode(first.slice(index + 1).trim());
                  cookieWriteAt = Date.now();
                }
              }
            } catch (_) {}
            return descriptor.set.call(this, raw);
          }
        });
      }
    } catch (_) {}
    const cookies = () => {
      const out = Object.create(null);
      let raw = '';
      try { raw = String(document.cookie || ''); } catch (_) {}
      for (const part of raw.split(';')) {
        const index = part.indexOf('=');
        if (index < 0) continue;
        const name = part.slice(0, index).trim();
        if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
        out[name] = decode(part.slice(index + 1).trim());
      }
      for (const name of ['vvf_subopenid', 'vvf_opentoken', 'vvf_openid']) {
        if (!out[name] && memoryCookies[name]) out[name] = memoryCookies[name];
      }
      return out;
    };
    let sent = false, lastPhase = '', lastStateAt = 0;
    let freshLogin = false, freshAt = 0, homeSeenAt = 0;
    const officialPath = path => path === '/game-subaccount-login' || path.startsWith('/game-subaccount-login/');
    const readyRoute = () => /#\/(?:home|hold)(?:[?/]|$)/.test(location.hash) ||
      /(?:^|[?&])from=auth(?:&|$)/.test(location.search);
    const homeVisible = () => {
      try {
        const home = document.querySelector('#home');
        const shown = home && !home.hidden && (!home.getClientRects || home.getClientRects().length > 0);
        return !!shown || /切换帐号/.test(String(document.body?.innerText || ''));
      } catch (_) { return false; }
    };
    const initialCookies = cookies();
    const initialPair = String(initialCookies.vvf_subopenid || '') + '\n' + String(initialCookies.vvf_opentoken || '');
    const writeState = (phase, extra = {}, force = false) => {
      const now = Date.now();
      if (!force && phase === lastPhase && now - lastStateAt < 2500) return;
      lastPhase = phase; lastStateAt = now;
      vivoPageState(nonce, phase, extra);
    };
    writeState('bridge_loaded', {route: readyRoute() ? 'auth' : 'login',
      hasSubOpenId: !!initialCookies.vvf_subopenid, hasOpenToken: !!initialCookies.vvf_opentoken}, true);
    const capture = (href, authoritative = false, reason = '') => {
      if (sent) return;
      let url;
      try { url = new URL(String(href)); } catch (_) { return; }
      if (url.protocol !== 'https:' || url.hostname !== 'joint.vivo.com.cn' ||
        !officialPath(url.pathname)) return;
      const c = cookies();
      const pair = String(c.vvf_subopenid || '') + '\n' + String(c.vvf_opentoken || '');
      const routeReady = readyRoute(), cookiesChanged = pair !== initialPair;
      const cookieWritten = !!(freshAt && cookieWriteAt >= freshAt - 1000);
      if (!authoritative && !routeReady && !cookiesChanged &&
        !(freshLogin && (cookieWritten || homeVisible()))) return;
      const subOpenId = String(c.vvf_subopenid || '');
      const openToken = String(c.vvf_opentoken || '');
      if (!/^[A-Za-z0-9+/=_.~-]{1,2048}$/.test(subOpenId) ||
        !/^[A-Za-z0-9+/=_.~-]{8,4096}$/.test(openToken)) {
        if (authoritative || routeReady || cookiesChanged || freshLogin) {
          writeState('cookies_missing', {hasSubOpenId: !!subOpenId, hasOpenToken: !!openToken});
        }
        return;
      }
      const openId = /^[A-Za-z0-9+/=_.~-]{1,1024}$/.test(String(c.vvf_openid || '')) ? String(c.vvf_openid) : '';
      sent = true;
      const resultKey = resultPrefix + nonce;
      try {
        GM_setValue(resultKey, {v: 1, nonce, subOpenId, openToken, openId,
          href: url.href.slice(0, 2048), createdAt: Date.now(), expires: Date.now() + 120000});
        clearVivoPending(nonce);
        writeState('result_sent', {route: authoritative ? 'official' :
          reason || (freshLogin ? 'union_use' : routeReady ? 'auth' : 'cookie_change'),
          hasOpenId: !!openId}, true);
        setTimeout(() => {
          try {
            const current = GM_getValue(resultKey, null);
            if (current?.nonce === nonce) GM_deleteValue(resultKey);
          } catch (_) {}
        }, 130000);
        setTimeout(() => { try { window.close(); } catch (_) {} }, 300);
      } catch (_) { sent = false; }
    };
    const markFresh = reason => {
      freshLogin = true; freshAt = Date.now();
      for (const delay of [150, 600, 1600, 3200]) {
        setTimeout(() => { try { capture(location.href, false, reason); } catch (_) {} }, delay);
      }
    };
    const responseObject = raw => {
      if (raw == null || raw === '') return null;
      if (typeof raw === 'object') return raw;
      try { return JSON.parse(String(raw)); } catch (_) {}
      try {
        const decoded = window.MaodunCipher?.decrypt?.(String(raw));
        if (decoded?.code === 0 && typeof decoded.data === 'string') return JSON.parse(decoded.data);
      } catch (_) {}
      return null;
    };
    const maybeFresh = (raw, status, reason) => {
      if (!(status >= 200 && status < 300)) return;
      const value = responseObject(raw);
      // A 2xx /h5/union/use is the official successful hand-off. If the
      // response is encrypted by an updated SDK, cookie presence and the home
      // view are still required before capture sends anything.
      if (!value || Number(value.code) === 0) markFresh(reason);
    };
    // Adult accounts do not call AppWebClient.onVivoAccountLogin after
    // /h5/union/use. Observe the official request itself so the successful
    // hand-off cannot be missed when the Vue route stays at '#/'.
    try {
      const isUnionUse = raw => {
        try {
          const url = new URL(String(raw), location.href);
          return url.protocol === 'https:' && url.hostname === 'joint.vivo.com.cn' && url.pathname === '/h5/union/use';
        } catch (_) { return false; }
      };
      const xhrOpen = XMLHttpRequest.prototype.open;
      const xhrSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        try {
          this.__sgsVivoUnionUse = String(method || '').toLowerCase() === 'post' && isUnionUse(url);
          this.__sgsVivoUnionURL = String(url || '');
        } catch (_) {}
        return xhrOpen.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.send = function (...args) {
        if (this.__sgsVivoUnionUse) {
          this.addEventListener('load', () => {
            try {
              const finalURL = this.responseURL || this.__sgsVivoUnionURL;
              if (!isUnionUse(finalURL)) return;
              const raw = this.responseType === 'json' ? this.response : this.responseText;
              maybeFresh(raw, this.status, 'union_use');
            } catch (_) {}
          }, {once: true});
        }
        return xhrSend.apply(this, args);
      };
      if (typeof window.fetch === 'function') {
        const previousFetch = window.fetch;
        window.fetch = function (input, init) {
          const url = typeof input === 'string' ? input : input?.url;
          const request = previousFetch.call(this, input, init);
          if (isUnionUse(url)) {
            request.then(response => {
              if (!response.ok || typeof response.clone !== 'function') return;
              response.clone().text().then(raw => maybeFresh(raw, response.status, 'fetch_union_use'))
                .catch(() => {});
            }).catch(() => {});
          }
          return request;
        };
      }
    } catch (_) {}
    const client = {
      onVivoAccountLogin(href) {
        writeState('official_login_called', {route: 'official'} , true);
        freshLogin = true; freshAt = Date.now();
        capture(href, true, 'official');
        return true;
      },
      doAntiAddiction() { return true; },
      onVivoAccountLogout() {},
      addAccountSecretParam() {},
      clearHistory() {},
      getAscribeParams() { return '{}'; }
    };
    try {
      Object.defineProperty(window, 'AppWebClient', {configurable: true, get: () => client, set: () => {}});
    } catch (_) {
      try { window.AppWebClient = client; } catch (_) {}
    }
    capture(location.href);
    const timer = setInterval(() => { try { capture(location.href); } catch (_) {} }, 500);
    const stateTimer = setInterval(() => {
      if (sent) return;
      const c = cookies();
      const hasSubOpenId = !!c.vvf_subopenid, hasOpenToken = !!c.vvf_opentoken;
      if (hasSubOpenId && hasOpenToken && homeVisible()) {
        if (!homeSeenAt) homeSeenAt = Date.now();
        if (!freshLogin && Date.now() - homeSeenAt >= 6000) markFresh('home_ready');
      } else homeSeenAt = 0;
      writeState(hasSubOpenId && hasOpenToken ? 'waiting_official_login'
        : readyRoute() ? 'cookies_missing' : 'waiting_auth_cookie',
        {hasSubOpenId, hasOpenToken});
    }, 3000);
    setTimeout(() => { clearInterval(timer); clearInterval(stateTimer); }, 12 * 60 * 1000);
  }
  function oppoPageBridge() {
    const resultPrefix = 'sgs-oppo-page-result-v1:';
    const nonceKey = 'sgs-oppo-bridge-nonce';
    const readNonce = () => {
      const fromName = /^sgs-oppo-([a-f0-9]{16,64})$/.exec(window.name || '');
      if (fromName) return fromName[1];
      try {
        const saved = sessionStorage.getItem(nonceKey);
        if (/^[a-f0-9]{16,64}$/.test(saved || '')) return saved;
      } catch (_) {}
      try {
        const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
        const value = hash.get('sgs_oppo');
        if (/^[a-f0-9]{16,64}$/.test(value || '')) return value;
      } catch (_) {}
      return '';
    };
    const nonce = readNonce();
    if (!nonce) return;
    try { sessionStorage.setItem(nonceKey, nonce); } catch (_) {}
    let sent = false;
    const capture = href => {
      if (sent) return;
      let url;
      try { url = new URL(String(href)); } catch (_) { return; }
      if (url.protocol !== 'https:' || url.hostname !== 'game-login.heytap.com' ||
        !url.pathname.startsWith('/game-union-h5/h5/client-login/')) return;
      const params = new URLSearchParams(url.search);
      if (url.hash) {
        const hash = url.hash.replace(/^#/, '');
        const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash;
        try { for (const [key, value] of new URLSearchParams(query)) if (!params.has(key)) params.set(key, value); } catch (_) {}
      }
      const code = String(params.get('code') || '');
      const ticket = String(params.get('ticket') || '');
      if (!/^[A-Za-z0-9+/=_.~-]{8,4096}$/.test(code) &&
        !/^[A-Za-z0-9+/=_.~-]{8,4096}$/.test(ticket)) return;
      sent = true;
      const resultKey = resultPrefix + nonce;
      try {
        GM_setValue(resultKey, {v: 1, nonce, code, ticket,
          href: url.href.slice(0, 2048), createdAt: Date.now(), expires: Date.now() + 120000});
        setTimeout(() => {
          try {
            const current = GM_getValue(resultKey, null);
            if (current?.nonce === nonce) GM_deleteValue(resultKey);
          } catch (_) {}
        }, 130000);
      } catch (_) { sent = false; }
    };
    capture(location.href);
    const timer = setInterval(() => { try { capture(location.href); } catch (_) {} }, 500);
    setTimeout(() => clearInterval(timer), 12 * 60 * 1000);
  }
  function steamCallbackBridge() {
    const params = new URLSearchParams(location.search);
    const hash = (location.hash || '').replace(/^#/, '').replace(/^\?/, '');
    if (hash) {
      const seen = new Set(params.keys());
      for (const [key, value] of new URLSearchParams(hash)) if (!seen.has(key)) params.set(key, value);
    }
    const state = String(params.get('state') || '');
    // Steam may replace window.name while crossing its OAuth/community pages.
    // The state is already bound to this attempt and is an equally strong
    // correlation key; use it when the popup name was lost.
    const nonce = /^sgs-steam-([a-f0-9]{16,64})$/.exec(window.name || '')?.[1] ||
      (/^[a-f0-9]{32}$/.test(state) ? state : '');
    if (!nonce) return;
    const accessToken = String(params.get('access_token') || '');
    const steamid = String(params.get('steamid') || '');
    const expiresIn = Number(params.get('expires_in')) || 0;
    if (!/^[a-f0-9]{32}$/.test(state) || !/^[A-Za-z0-9._~+/=-]{8,16384}$/.test(accessToken) ||
      (steamid && !/^\d{17}$/.test(steamid)) || !(expiresIn >= 0 && expiresIn < 1e10)) return;
    const resultKey = STEAM_PAGE_RESULT_PREFIX + nonce;
    try {
      GM_setValue(resultKey, {v: 1, nonce, state, access_token: accessToken, steamid,
        expires_in: expiresIn, createdAt: Date.now(), expires: Date.now() + 120000});
      setTimeout(() => {
        try {
          const current = GM_getValue(resultKey, null);
          if (current?.nonce === nonce) GM_deleteValue(resultKey);
        } catch (_) {}
      }, 130000);
    } catch (_) {}
  }
  if (location.hostname === 'passport.vivo.com.cn') {
    vivoPassportBridge();
    return;
  }
  if (location.hostname === 'joint.vivo.com.cn' && location.pathname === '/game-subaccount-login/') {
    vivoPageBridge();
    return;
  }
  if (location.hostname === 'game-login.heytap.com' &&
    location.pathname.startsWith('/game-union-h5/h5/client-login/')) {
    oppoPageBridge();
    return;
  }
  if (location.hostname === '10th-ly-login.sanguosha.com' &&
    location.pathname === '/steam/oauth/callback.html') {
    steamCallbackBridge();
    return;
  }
  try {
    const now = Date.now();
    for (const key of GM_listValues()) {
      if (!key.startsWith('sgs-vivo-page-result-v1:') && !key.startsWith('sgs-oppo-page-result-v1:') &&
        !key.startsWith(STEAM_PAGE_RESULT_PREFIX) &&
        !key.startsWith(VIVO_PAGE_STATE_PREFIX)) continue;
      const value = GM_getValue(key, null);
      if (!value || !Number.isFinite(Number(value.expires)) || Number(value.expires) <= now) GM_deleteValue(key);
    }
    const pending = GM_getValue(VIVO_PENDING_NONCE_KEY, null);
    if (!pending || !Number.isFinite(Number(pending.expires)) || Number(pending.expires) <= now) {
      GM_deleteValue(VIVO_PENDING_NONCE_KEY);
    }
  } catch (_) {}
  /* CORE-BEGIN */
const ChannelRegistry = (() => {
  const CAPABILITIES = Object.freeze({browser: 'browser', native: 'native-required', unverified: 'unverified'});
  const nativeReason = name => name + '的网页/扫码链路尚未在当前脚本中完成适配；需要原生 SDK 签发的渠道不会伪造票据、签名或服务端交换参数。';
  const unverifiedReason = name => '已确认 ' + name + ' 的游戏侧渠道号，但客户端配置中没有可验证的网页登录端点；为避免错误落地，脚本暂不发起请求。';
  const channel = config => {
    const id = config.id;
    const contextPrefix = config.contextPrefix || 'sgs-channel-' + id;
    return Object.freeze(Object.assign({
      name: config.name,
      shortName: config.shortName || config.name + '服',
      accountLabel: config.accountLabel || config.name + '账号',
      capability: CAPABILITIES.native,
      platformId: null,
      gameChannelId: null,
      loginEndpoint: '',
      reason: nativeReason(config.name),
      storagePrefix: 'sgs-channel-' + id + '-v1:',
      accountPrefix: 'sgs-channel-' + id + '-accounts-v1:',
      contextPrefix,
      windowPrefix: contextPrefix,
      protocol: null,
      endpoints: {},
      oauth: null,
      transport: null,
      exchange: null,
      launch: null,
      bridge: null,
      callback: null,
      standardLoginMethods: [],
      authMode: 'oauth',
      loginOptions: [],
      requestPolicy: [],
      accountPage: '',
      launchPage: 'https://web.sanguosha.com/x/pc/index.php'
    }, config, {
      id,
      contextPrefix,
      windowPrefix: config.windowPrefix || contextPrefix,
      endpoints: Object.freeze(Object.assign({}, config.loginEndpoint ? {login: config.loginEndpoint} : {}, config.endpoints || {})),
      oauth: config.oauth ? Object.freeze(Object.assign({}, config.oauth)) : null,
      transport: config.transport ? Object.freeze(Object.assign({}, config.transport)) : null,
      exchange: config.exchange ? Object.freeze(Object.assign({}, config.exchange)) : null,
      launch: config.launch ? Object.freeze(Object.assign({}, config.launch)) : null,
      bridge: config.bridge ? Object.freeze(Object.assign({}, config.bridge)) : null,
      callback: config.callback ? Object.freeze(Object.assign({protocols: ['https:']}, config.callback)) : null,
      standardLoginMethods: Object.freeze(Array.isArray(config.standardLoginMethods) ? config.standardLoginMethods.slice() : []),
      loginOptions: Object.freeze(Array.isArray(config.loginOptions) ? config.loginOptions.map(item => Object.freeze(Object.assign({}, item))) : []),
      requestPolicy: Object.freeze(Array.isArray(config.requestPolicy) ? config.requestPolicy.map(rule => Object.freeze({
        origin: rule.origin,
        paths: Object.freeze(Array.isArray(rule.paths) ? rule.paths.slice() : []),
        allowRedirect: rule.allowRedirect !== false
      })) : [])
    }));
  };
  const xiaomi = channel({
    id: 'xiaomi', name: '小米', shortName: '小米服', accountLabel: '小米账号',
    capability: CAPABILITIES.browser, platformId: '10038', gameChannelId: 320052,
    storagePrefix: 'sgs-xiaomi-v1:', accountPrefix: 'sgs-xiaomi-accounts-v1:',
    contextPrefix: 'sgs-xiaomi', windowPrefix: 'sgs-xiaomi',
    loginEndpoint: 'https://10th-sdk-login.sanguosha.com/xiaomi2/app/login',
    reason: '已验证浏览器链路：小米官方 OAuth → 小米 SDK 会话 → 游卡渠道兑换 → 官网启动参数；服务器仍会校验全部票据。',
    protocol: 'yoka-xiaomi-v1',
    callback: {protocols: ['http:', 'https:'], hostname: 'game.xiaomi.com', pathname: '/oauthcallback/mioauth'},
    endpoints: {
      oauth: 'https://account.migc.g.mi.com/misdk/v2/oauth',
      session: 'https://account.migc.g.mi.com/migc-sdk-account/getLoginAppAccount_v2',
      channel: 'https://anysdk.dobest.cn/v1/login',
      launch: 'https://10th-sdk-login.sanguosha.com/xiaomi2/app/login'
    },
    oauth: {
      authorize: 'https://account.xiaomi.com/oauth2/authorize', loginEntry: 'https://account.xiaomi.com/pass/serviceLogin',
      switchAccount: 'https://account.xiaomi.com/', sid: 'passport', clientId: '2882303761517516898',
      scope: '1 3', redirectUri: 'http://game.xiaomi.com/oauthcallback/mioauth',
      params: {skip_confirm: 'false'}
    },
    standardLoginMethods: ['账号密码', '短信验证码', '扫码'],
    authMode: 'oauth',
    accountPage: 'https://account.xiaomi.com/pass/serviceLogin',
    loginOptions: [
      {id: 'xiaomi-qr', label: '小米扫码登录（面板）', kind: 'direct',
        hint: '显示小米官方二维码'},
      {id: 'xiaomi-official', label: '官方登录（密码 / 短信）', kind: 'oauth', method: 1,
        hint: '打开小米官方账号登录页'}
    ],
    requestPolicy: [
      {origin: 'https://account.migc.g.mi.com', paths: ['/misdk/v2/oauth', '/migc-sdk-account/getLoginAppAccount_v2']},
      {origin: 'https://anysdk.dobest.cn', paths: ['/v1/login']},
      {origin: 'https://10th-sdk-login.sanguosha.com', paths: ['/xiaomi2/app/login']}
    ],
    transport: {
      key: 'migc_game_sdkkey', appId: '2000202', channel: 'meng_1439_345_android',
      devAppId: '2882303761520011303', sdkVersion: 'SDK_MI_SP_3.3.0.6'
    },
    exchange: {appid: '485', packageId: '117', platformId: '10038', platformName: 'xiaomi', thirdparty: 'xiaomi'},
    launch: {url: 'https://10th-sdk-login.sanguosha.com/xiaomi2/app/login', adult: '1'},
    bridge: {channelId: 320052}
  });
  const channels = Object.freeze([
    xiaomi,
    channel({id: 'vivo', name: 'Vivo', accountLabel: 'Vivo账号', platformId: '10031', gameChannelId: 320056,
      capability: CAPABILITIES.browser, protocol: 'yoka-vivo-v1', authMode: 'direct',
      loginEndpoint: 'https://10th-sdk-login.sanguosha.com/vivo/app/login',
      reason: 'Vivo 官方网页登录态 → Vivo 子账号 → 游卡渠道兑换 → 官网启动参数；扫码和官方网页登录都会自动继续，不读取输入内容。',
      standardLoginMethods: ['账号密码', '短信验证码', '扫码'],
      accountPage: 'https://passport.vivo.com.cn/',
      loginOptions: [
        {id: 'vivo-qr', label: 'Vivo 扫码登录', kind: 'direct', hint: '显示 Vivo 官方二维码'},
        {id: 'vivo-web', label: '账号密码 / 手机验证码 / 扫码（官方网页）', kind: 'direct', mode: 'browser',
          page: 'https://joint.vivo.com.cn/game-subaccount-login/?from=login',
          hint: '打开 Vivo 官方账号登录页'}
      ],
      requestPolicy: [
        {origin: 'https://passport.vivo.com.cn', paths: ['/pass/QRCode/login/generateQRCode', '/pass/QRCode/login/checkQRCodeState', '/pass/QRCode/login/checkUserConfirm', '/v3/web/login/authorize']},
        {origin: 'https://joint.vivo.com.cn', paths: ['/game-subaccount-login/', '/h5/union/get', '/h5/union/use', '/h5/account/realName']},
        {origin: 'https://anysdk.dobest.cn', paths: ['/v1/login']},
        {origin: 'https://10th-sdk-login.sanguosha.com', paths: ['/vivo/app/login']}
      ],
      endpoints: {channel: 'https://anysdk.dobest.cn/v1/login', launch: 'https://10th-sdk-login.sanguosha.com/vivo/app/login'},
      launch: {url: 'https://10th-sdk-login.sanguosha.com/vivo/app/login', adult: '1'},
      launchPage: 'https://web.sanguosha.com/10/pc/index.php?channel_id=320056',
      bridge: {channelId: 320056}}),
    channel({id: 'oppo', name: 'OPPO', shortName: 'OPPO', accountLabel: 'HeyTap 账号', platformId: '10030', gameChannelId: 320123,
      capability: CAPABILITIES.browser, protocol: 'yoka-oppo-v1', authMode: 'direct',
      loginEndpoint: 'https://10th-sdk-login.sanguosha.com/oppo/app/login',
      reason: 'OPPO 官方 HeyTap 网页登录：手机号、账号密码、短信验证码和扫码都在同一个官方账号页完成；回调 code 只做一次性桥接，随后走 OPPO SDK 会话和游卡渠道兑换。',
      standardLoginMethods: ['手机号+密码', '手机验证码', '扫码'],
      accountPage: 'https://id.heytap.com/',
      loginOptions: [
        {id: 'oppo-web', label: 'OPPO 官方登录（手机号 / 密码 / 短信 / 扫码）', kind: 'direct', mode: 'browser',
          page: 'https://id.heytap.com/identity/web/v1/authn/auth-and-callback?bizAppKey=2CcnddQwhZJV3qjNMCzL4S&callback=https%3A%2F%2Fgame-login.heytap.com%2Fgame-union-h5%2Fh5%2Fclient-login%2Findex.html%3Fh5-next%3D1%26actId%3D90000016%26bizType%3Die&language=zh-CN&toRegisterPage=false',
          hint: '打开 OPPO 官方账号登录页'}
      ],
      requestPolicy: [
        {origin: 'https://id.heytap.com', paths: ['/identity/web/v1/authn/auth-and-callback', '/v3/auth/login', '/identity/v1/authn/', '/completion/v1/redirect-judge']},
        {origin: 'https://id-cn.heytap.com', paths: ['/identity/v1/authn/scan-code/generate-qrcode', '/identity/v1/authn/scan-code/check-qrcode', '/identity/v1/authn/check', '/identity/v1/authn/validate', '/identity/web/v1/authn/login']},
        {origin: 'https://isdk.heytapmobi.com', paths: ['/gamesdk/v2/outUser/findTokenByCode', '/gamesdk/v2/user/login']},
        {origin: 'https://anysdk.dobest.cn', paths: ['/v1/login']},
        {origin: 'https://10th-sdk-login.sanguosha.com', paths: ['/oppo/app/login']}
      ],
      endpoints: {channel: 'https://anysdk.dobest.cn/v1/login', launch: 'https://10th-sdk-login.sanguosha.com/oppo/app/login'},
      launch: {url: 'https://10th-sdk-login.sanguosha.com/oppo/app/login', adult: '1'},
      launchPage: 'https://web.sanguosha.com/10/pc/index.php?channel_id=320123',
      bridge: {channelId: 320123}}),
    channel({id: 'huawei', name: '华为', accountLabel: '华为账号', platformId: '332', gameChannelId: 320459,
      capability: CAPABILITIES.browser, protocol: 'yoka-huawei-v1', authMode: 'direct',
      loginEndpoint: 'https://10th-sdk-login.sanguosha.com/huawei/app/login',
      reason: '华为扫码沿用微端已验证的二维码 → CAS → AppAuth PKCE → 游卡兑换链路；当前版本仅提供可完成游戏接入的扫码方式。',
      accountPage: 'https://id.cloud.huawei.com/',
      loginOptions: [
        {id: 'huawei-qr', label: '华为扫码登录', kind: 'direct', hint: '显示华为官方二维码'}
      ],
      requestPolicy: [
        {origin: 'https://id.cloud.huawei.com', paths: ['/']},
        {origin: 'https://oauth-login-drcn.platform.dbankcloud.com', paths: ['/oauth2/v3/authorize', '/oauth2/v3/loginCallback', '/oauth2/ajax/getLoginWay', '/oauth2/ajax/login', '/oauth2/ajax/authorizeConfirm', '/oauth2/v3/token', '/oauth2/v3/certs']},
        {origin: 'https://oauth-login1.cloud.huawei.com', paths: ['/oauth2/v3/authorize', '/oauth2/v3/loginCallback', '/oauth2/ajax/getLoginWay', '/oauth2/ajax/login', '/oauth2/ajax/authorizeConfirm', '/oauth2/v3/token', '/oauth2/v3/certs']},
        {origin: 'https://oauth-login.cloud.huawei.com', paths: ['/oauth2/v3/authorize', '/oauth2/v3/loginCallback', '/oauth2/ajax/getLoginWay', '/oauth2/ajax/login', '/oauth2/ajax/authorizeConfirm', '/oauth2/v3/token', '/oauth2/v3/certs']},
        {origin: 'https://id1.cloud.huawei.com', paths: ['/DimensionalCode/getqrInfo', '/DimensionalCode/async', '/qrcode/login.jsp', '/CAS/remoteLogin', '/CAS/portal/loginAuth.html', '/CAS/IDM_W/ajaxHandler/jsRemoteLogin', '/CAS/IDM_W/ajaxHandler/codeRemoteLogin']},
        {origin: 'https://anysdk.dobest.cn', paths: ['/v1/login']},
        {origin: 'https://10th-sdk-login.sanguosha.com', paths: ['/huawei/app/login']}
      ],
      endpoints: {channel: 'https://anysdk.dobest.cn/v1/login', launch: 'https://10th-sdk-login.sanguosha.com/huawei/app/login'},
      launch: {url: 'https://10th-sdk-login.sanguosha.com/huawei/app/login', adult: '1'},
      launchPage: 'https://web.sanguosha.com/10/pc/index.php?channel_id=320459',
      bridge: {channelId: 320459}}),
    channel({id: 'bilibili', name: '哔哩哔哩', shortName: 'B站服', accountLabel: '哔哩哔哩账号', platformId: '50003', gameChannelId: 320046,
      capability: CAPABILITIES.browser, protocol: 'yoka-bilibili-v1', authMode: 'direct',
      loginEndpoint: 'https://10th-ly-login.sanguosha.com/bilibili/login',
      reason: 'B 站扫码沿用微端已验证的二维码 → access_key → 游卡入口；当前版本仅提供可完成游戏接入的扫码方式。',
      accountPage: 'https://passport.biligame.com/login?app_id=110547&game_id=110547',
      loginOptions: [
        {id: 'bilibili-qr', label: 'B 站扫码登录', kind: 'direct', hint: '显示哔哩哔哩官方二维码'}
      ],
      requestPolicy: [
        {origin: 'https://passport.biligame.com', paths: ['/login']},
        {origin: 'https://wpg-api.biligame.com', paths: ['/api/pcg/qrcode/login/generate', '/api/pcg/qrcode/login/status/poll']},
        {origin: 'https://game.bilibili.com', paths: ['/sdk/scanH5/']},
        {origin: 'https://10th-ly-login.sanguosha.com', paths: ['/bilibili/login']}
      ],
      endpoints: {launch: 'https://10th-ly-login.sanguosha.com/bilibili/login'},
      launch: {url: 'https://10th-ly-login.sanguosha.com/bilibili/login', adult: '1'},
      launchPage: 'https://web.sanguosha.com/10/pc/bilibiliWD_index.php?channel_id=120133',
      bridge: {type: 'bilibili', channelId: '120133', acceptChannelIds: ['120133']}}),
    channel({id: 'wegame', name: 'WeGame', accountLabel: 'WeGame账号', platformId: '326', gameChannelId: 320023,
      capability: CAPABILITIES.browser, protocol: 'yoka-wegame-v1', authMode: 'direct',
      loginEndpoint: 'https://10th-sdk-login.sanguosha.com/wegame/app/login',
      reason: '参考微端已验证的 WeGame QQ/微信扫码 → WeGame union_login → 游卡 WeGame 入口。',
      standardLoginMethods: ['QQ 扫码', '微信扫码'],
      accountPage: 'https://www.wegame.com.cn/',
      loginOptions: [
        {id: 'wegame-qq', label: 'QQ 扫码登录', kind: 'direct', provider: 'qq', hint: '显示腾讯 QQ 官方二维码'},
        {id: 'wegame-wx', label: '微信扫码登录', kind: 'direct', provider: 'wx', hint: '显示微信官方二维码'}
      ],
      requestPolicy: [
        {origin: 'https://openmobile.qq.com', paths: ['/oauth2.0/m_authorize', '/oauth2.0/m_get_redirect_url']},
        {origin: 'https://xui.ptlogin2.qq.com', paths: ['/cgi-bin/xlogin']},
        {origin: 'https://ssl.ptlogin2.qq.com', paths: ['/ptqrshow', '/ptqrlogin']},
        {origin: 'https://ptlogin2.qq.com', paths: ['/']},
        {origin: 'https://graph.qq.com', paths: ['/oauth2.0/me']},
        {origin: 'https://imgcache.qq.com', paths: ['/open/connect/widget/mobile/login/proxy.htm']},
        {origin: 'https://open.weixin.qq.com', paths: ['/connect/app/qrconnect', '/connect/qrcode/']},
        {origin: 'https://long.open.weixin.qq.com', paths: ['/connect/l/qrconnect']},
        {origin: 'https://m.wegame.com.cn', paths: ['/web/oauth2.0/union_login', '/web/oauth2.0/get_channel_info']},
        {origin: 'https://anysdk.dobest.cn', paths: ['/v1/login']},
        {origin: 'https://10th-sdk-login.sanguosha.com', paths: ['/wegame/app/login']}
      ],
      endpoints: {channel: 'https://anysdk.dobest.cn/v1/login', launch: 'https://10th-sdk-login.sanguosha.com/wegame/app/login'},
      launch: {url: 'https://10th-sdk-login.sanguosha.com/wegame/app/login', adult: '1'},
      launchPage: 'https://web.sanguosha.com/10/pc/index.php?channel_id=320023',
      bridge: {channelId: 320023}}),
    channel({id: 'steam', name: 'Steam', accountLabel: 'Steam账号', platformId: '50000', gameChannelId: 320061,
      capability: CAPABILITIES.browser, protocol: 'yoka-steam-v1', authMode: 'direct',
      loginEndpoint: 'https://10th-ly-login.sanguosha.com/steam/oauth/login',
      reason: 'Steam 官方网页 OAuth → 游卡 Steam 入口；扫码、账号密码和 Steam Guard 都在 Steam 官方页面完成。',
      standardLoginMethods: ['扫码', '账号密码', 'Steam Guard'],
      accountPage: 'https://store.steampowered.com/login/',
      loginOptions: [
        {id: 'steam-web', label: 'Steam 官方登录（扫码 / 账号密码 / Steam Guard）', kind: 'direct', mode: 'browser',
          page: 'https://store.steampowered.com/oauth/login?mobileminimal=1&response_type=token&client_id=6730F3F4&state={state}',
          hint: '打开 Steam 官方登录页'}
      ],
      requestPolicy: [
        {origin: 'https://api.steampowered.com', paths: ['/IAuthenticationService/BeginAuthSessionViaQR/v1/', '/IAuthenticationService/PollAuthSessionStatus/v1/']},
        {origin: 'https://login.steampowered.com', paths: ['/jwt/finalizelogin']},
        {origin: 'https://store.steampowered.com', paths: ['/oauth/login', '/oauth/loginform/', '/login/', '/jwt/']},
        {origin: 'https://steamcommunity.com', paths: ['/oauth/login', '/oauth/auth', '/oauth/auth_response', '/oauth/loginform/', '/login/settoken']},
        {origin: 'https://10th-ly-login.sanguosha.com', paths: ['/steam/oauth/login', '/steam/oauth/callback.html']}
      ],
      endpoints: {launch: 'https://10th-ly-login.sanguosha.com/steam/oauth/login'},
      launch: {url: 'https://10th-ly-login.sanguosha.com/steam/oauth/login', adult: '1'},
      launchPage: 'https://web.sanguosha.com/10/pc/index.php',
      bridge: {type: 'steam', channelId: '120061', acceptChannelIds: ['120061', '320061']}}),
    channel({id: '4399', name: '4399', shortName: '4399服', accountLabel: '4399账号', platformId: '10039', gameChannelId: 320029,
      capability: CAPABILITIES.browser, authMode: 'portal',
      loginEndpoint: 'https://10th-sdk-login.sanguosha.com/4399/app/login',
      reason: '4399 官方网页已提供“三国杀一将成名”服务器；登录、选服和进入游戏都由 4399 官方页面完成。',
      standardLoginMethods: ['4399账号密码', '手机验证码', '扫码', 'QQ / 微信 / 微博快捷登录'],
      accountPage: 'https://my.4399.com/yxsgs/',
      loginOptions: [
        {id: '4399-web', label: '打开 4399 官方登录 / 进入游戏', kind: 'portal', page: 'https://my.4399.com/yxsgs/',
          hint: '打开 4399 官方登录页'}
      ],
      requestPolicy: [
        {origin: 'https://my.4399.com', paths: ['/yxsgs/']}
      ]}),
    channel({id: 'feihuo', name: '飞火', shortName: '飞火服', accountLabel: '飞火账号', gameChannelId: 220005,
      capability: CAPABILITIES.browser, authMode: 'portal',
      reason: '飞火官方“三国杀：一将成名”页面提供登录与进入游戏入口；账号、实名和启动均由飞火官方页面处理。',
      standardLoginMethods: ['飞火账号登录', '页面提供的快捷登录'],
      accountPage: 'https://www.feihuo.com/game/index/slug/xsgs',
      loginOptions: [
        {id: 'feihuo-web', label: '打开 飞火 官方登录 / 进入游戏', kind: 'portal',
          page: 'https://www.feihuo.com/game/index/slug/xsgs',
          hint: '打开飞火官方登录页'}
      ],
      requestPolicy: [
        {origin: 'https://www.feihuo.com', paths: ['/game/index/slug/xsgs']}
      ]}),
    channel({id: 'shunwang', name: '顺网', shortName: '顺网服', accountLabel: '顺网账号', gameChannelId: 220021,
      capability: CAPABILITIES.browser, authMode: 'portal',
      reason: '顺网游戏保留“三国杀”官方网页入口，登录与进入游戏都在顺网官方页面完成。',
      standardLoginMethods: ['顺网账号登录', '页面提供的快捷登录'],
      accountPage: 'https://sgs.swjoy.com/',
      loginOptions: [
        {id: 'shunwang-web', label: '打开 顺网 官方登录 / 进入游戏', kind: 'portal',
          page: 'https://sgs.swjoy.com/',
          hint: '打开顺网官方登录页'}
      ],
      requestPolicy: [
        {origin: 'https://sgs.swjoy.com', paths: ['/']}
      ]}),
    channel({id: '2144', name: '2144', shortName: '2144服', accountLabel: '2144账号', gameChannelId: 220044,
      capability: CAPABILITIES.browser, authMode: 'portal',
      reason: '2144 官方“三国杀：一将成名”网页提供登录和开始游戏入口；游戏侧状态由 2144 官方页面维护。',
      standardLoginMethods: ['2144账号登录', '页面提供的快捷登录'],
      accountPage: 'https://web.2144.cn/hlsgs',
      loginOptions: [
        {id: '2144-web', label: '打开 2144 官方登录 / 进入游戏', kind: 'portal',
          page: 'https://web.2144.cn/hlsgs',
          hint: '打开 2144 官方登录页'}
      ],
      requestPolicy: [
        {origin: 'https://web.2144.cn', paths: ['/hlsgs', '/hlsgs/']}
      ]}),
    channel({id: 'zixia', name: '紫霞', shortName: '紫霞服', accountLabel: '紫霞账号', gameChannelId: 220017,
      capability: CAPABILITIES.browser, authMode: 'portal',
      reason: '紫霞游戏官方“三国杀”页面提供登录和进入游戏入口；登录、选服和启动均由紫霞官方页面处理。',
      standardLoginMethods: ['紫霞账号登录', '页面提供的快捷登录'],
      accountPage: 'https://game.zixia.com/game-xsgs',
      loginOptions: [
        {id: 'zixia-web', label: '打开 紫霞 官方登录 / 进入游戏', kind: 'portal',
          page: 'https://game.zixia.com/game-xsgs',
          hint: '打开紫霞官方登录页'}
      ],
      requestPolicy: [
        {origin: 'https://game.zixia.com', paths: ['/game-xsgs', '/zxxsgs/']}
      ]}),
    channel({id: 'qqgame', name: 'QQ 大厅', shortName: 'QQ大厅', accountLabel: 'QQ账号', gameChannelId: 120042,
      capability: CAPABILITIES.browser, authMode: 'portal',
      reason: 'QQ 大厅官方页面提供独立登录与“三国杀”入口；登录、选服和进入游戏都在腾讯官方页面完成。',
      standardLoginMethods: ['QQ扫码登录', '页面提供的其他方式'],
      accountPage: 'https://qqgame.qq.com/webappframe/?appid=10951',
      loginOptions: [
        {id: 'qqgame-web', label: '打开 QQ 大厅官方登录 / 进入游戏', kind: 'portal',
          page: 'https://qqgame.qq.com/webappframe/?appid=10951',
          hint: '打开 QQ 大厅官方登录页'}
      ],
      requestPolicy: [
        {origin: 'https://qqgame.qq.com', paths: ['/webappframe/']}
      ]}),
    channel({id: '7k7k', name: '7K7K', shortName: '7K7K服', accountLabel: '7K7K账号', gameChannelId: 520131,
      capability: CAPABILITIES.browser, authMode: 'portal',
      reason: '7K7K H5 官方页面提供“三国杀”登录与游戏入口；账号登录、实名和进入游戏均由 7K7K 官方页面处理。',
      standardLoginMethods: ['7K7K账号登录', '页面提供的快捷登录'],
      accountPage: 'https://h5.7k7k.com/game/960982bec2f555de44ea43ca8a7ef418',
      loginOptions: [
        {id: '7k7k-web', label: '打开 7K7K 官方登录 / 进入游戏', kind: 'portal',
          page: 'https://h5.7k7k.com/game/960982bec2f555de44ea43ca8a7ef418',
          hint: '打开 7K7K 官方登录页'}
      ],
      requestPolicy: [
        {origin: 'https://h5.7k7k.com', paths: ['/game/']},
        {origin: 'http://g.7k7k.com', paths: ['/games/sgsxq/'] }
      ]}),
    channel({id: 'baidu', name: '百度', shortName: '百度服', accountLabel: '百度账号', gameChannelId: 220003,
      capability: CAPABILITIES.browser, authMode: 'portal',
      reason: '百度页游中心提供“三国杀一将成名”的官方登录与游戏入口；扫码、账号密码、短信及第三方登录均在百度官方页面完成。',
      standardLoginMethods: ['扫码登录', '百度账号密码', '短信验证码', 'QQ / 微信 / 微博快捷登录'],
      accountPage: 'https://wan.baidu.com/game?gameId=19793616',
      loginOptions: [
        {id: 'baidu-web', label: '打开 百度 官方登录 / 进入游戏', kind: 'portal',
          page: 'https://wan.baidu.com/game?gameId=19793616',
          hint: '打开百度官方登录页'}
      ],
      requestPolicy: [
        {origin: 'https://wan.baidu.com', paths: ['/game']}
      ]}),
    channel({id: '360', name: '360', shortName: '360服', accountLabel: '360账号', gameChannelId: 220061,
      capability: CAPABILITIES.browser, authMode: 'portal',
      reason: '360 游戏中心提供“三国杀一将成名”独立专网，支持账号密码、手机验证码登录并从页面进入游戏。',
      standardLoginMethods: ['360账号密码', '手机验证码'],
      accountPage: 'https://sgsszn.wan.360.cn/game_login.php',
      loginOptions: [
        {id: '360-web', label: '打开 360 官方登录 / 进入游戏', kind: 'portal',
          page: 'https://sgsszn.wan.360.cn/game_login.php',
          hint: '打开 360 官方登录页'}
      ],
      requestPolicy: [
        {origin: 'https://sgsszn.wan.360.cn', paths: ['/game_login.php', '/index.html', '/login.html']}
      ]})
  ]);
  const byId = new Map(channels.map(item => [item.id, item]));
  return Object.freeze({
    CAPABILITIES, channels,
    get: id => byId.get(id) || null,
    defaultChannel: () => xiaomi,
    visibleChannels: () => channels.filter(item => item.authMode !== 'portal'),
    byCapability: capability => channels.filter(item => item.authMode !== 'portal' && item.capability === capability),
    callbackFor: href => {
      try {
        const url = new URL(href);
        return channels.find(item => item.callback && item.callback.protocols.includes(url.protocol)
          && !url.port && !url.username && !url.password && item.callback.hostname === url.hostname
          && item.callback.pathname === url.pathname) || null;
      } catch (_) { return null; }
    },
    isBrowser: item => !!item && item.capability === CAPABILITIES.browser,
    capabilityLabel: item => item && item.capability === CAPABILITIES.browser ? '浏览器可直接登录'
      : item && item.capability === CAPABILITIES.native ? '暂未适配浏览器' : '登录链未完全核实'
  });
})();

const ChannelCore = (() => {
  const CHANNEL_KEY = 'sgs-channel-active-v1';
  function storedChannel() {
    try {
      const saved = typeof GM_getValue === 'function' ? GM_getValue(CHANNEL_KEY, '') : '';
      const found = ChannelRegistry.get(saved);
      return found && found.authMode !== 'portal' ? found : ChannelRegistry.defaultChannel();
    } catch (_) { return ChannelRegistry.defaultChannel(); }
  }
  let active = storedChannel();
  function channelFor(id) {
    if (id == null) return active;
    const found = ChannelRegistry.get(id);
    if (!found) throw new Error('未知登录渠道');
    return found;
  }
  function use(id) {
    const next = channelFor(id);
    active = next;
    try { GM_setValue(CHANNEL_KEY, next.id); } catch (_) {}
    return next;
  }
  function requireBrowser(id) {
    const channel = channelFor(id);
    if (!ChannelRegistry.isBrowser(channel) || !channel.protocol) throw new Error(channel.reason);
    return channel;
  }
  const zero = new Uint8Array(16);
  const key = channel => crypto.subtle.importKey('raw', new TextEncoder().encode(channel.transport.key), 'AES-CBC', false, ['encrypt', 'decrypt']);
  const base64 = bytes => btoa(String.fromCharCode(...bytes));
  function unbase64(text) {
    if (typeof text !== 'string' || text.length > 1048576) throw new Error('SDK 响应格式错误');
    return Uint8Array.from(atob(text.trim()), c => c.charCodeAt(0));
  }
  // The SDK requires ECB. Native CBC on an isolated block with zero IV gives E_K(block).
  // Discard the extra block added by WebCrypto's mandatory CBC padding.
  async function encode(text, channel = active) {
    const raw = new TextEncoder().encode(text);
    const pad = 16 - raw.length % 16;
    const input = new Uint8Array(raw.length + pad);
    input.set(raw); input.fill(pad, raw.length);
    const k = await key(channel), output = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i += 16) {
      const encrypted = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-CBC', iv: zero}, k, input.slice(i, i + 16)));
      output.set(encrypted.subarray(0, 16), i);
    }
    return base64(output);
  }
  async function decode(text, channel = active) {
    const input = unbase64(text);
    if (!input.length || input.length % 16) throw new Error('SDK 响应长度错误');
    const k = await key(channel), output = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i += 16) {
      const c = input.slice(i, i + 16);
      // Append E_K(C xor 0x10) so the second CBC plaintext block is valid PKCS7 padding.
      const paddingInput = c.map(value => value ^ 16);
      const paddingCipher = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-CBC', iv: zero}, k, paddingInput));
      const pair = new Uint8Array(32); pair.set(c); pair.set(paddingCipher.subarray(0, 16), 16);
      const plain = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-CBC', iv: zero}, k, pair));
      output.set(plain, i);
    }
    const pad = output[output.length - 1];
    if (pad < 1 || pad > 16 || !output.slice(-pad).every(value => value === pad)) throw new Error('SDK 响应填充错误');
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(output.subarray(0, output.length - pad)));
  }
  function pathMatches(pathname, allowedPath) {
    return pathname === allowedPath || (allowedPath.endsWith('/') && pathname.startsWith(allowedPath));
  }
  function allowed(raw, channelId) {
    let url;
    try { url = new URL(raw); } catch (_) { return false; }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    const channel = channelFor(channelId);
    const endpoint = Object.values(channel.endpoints).some(value => {
      try {
        const expected = new URL(value);
        return url.origin === expected.origin && pathMatches(url.pathname, expected.pathname);
      } catch (_) { return false; }
    });
    if (endpoint) return true;
    return channel.requestPolicy.some(rule => url.origin === rule.origin
      && rule.paths.some(path => pathMatches(url.pathname, path)));
  }
  // Cookies are captured only from this attempt's official responses. Never read
  // the user's unrelated browser cookie jar and never persist this in GM storage.
  class CookieJar {
    constructor() { this.items = new Map(); }
    read(headers, rawURL) {
      let url; try { url = new URL(rawURL); } catch (_) { return; }
      for (const match of String(headers || '').matchAll(/^set-cookie:\s*([^\r\n]+)/gim)) {
        for (const line of match[1].split(/,(?=\s*[^;,\s=]+=)/)) {
          const [first, ...attributes] = line.split(';');
          const equal = first.indexOf('=');
          if (equal < 1) continue;
          const name = first.slice(0, equal).trim(), value = first.slice(equal + 1).trim();
          if (!/^[\w!#$%&'*+.^`|~-]+$/.test(name) || /[\r\n;]/.test(value)) continue;
          const attr = Object.create(null);
          for (const part of attributes) {
            const index = part.indexOf('=');
            attr[(index < 0 ? part : part.slice(0, index)).trim().toLowerCase()] = index < 0 ? '' : part.slice(index + 1).trim();
          }
          const domain = (attr.domain || url.hostname).replace(/^\./, '').toLowerCase();
          if (!domain.includes('.') || (url.hostname !== domain && !url.hostname.endsWith('.' + domain))) continue;
          const cookiePath = attr.path?.startsWith('/') ? attr.path : url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1) || '/';
          const key = domain + '\n' + cookiePath + '\n' + name;
          if (attr['max-age'] === '0' || (attr.expires && Date.parse(attr.expires) < Date.now())) {
            this.items.delete(key); continue;
          }
          this.items.set(key, {name, value, domain, path: cookiePath, hostOnly: !attr.domain});
        }
      }
    }
    forURL(rawURL) {
      let url; try { url = new URL(rawURL); } catch (_) { return []; }
      return [...this.items.values()].filter(cookie =>
        (url.hostname === cookie.domain || (!cookie.hostOnly && url.hostname.endsWith('.' + cookie.domain)))
        && (url.pathname === cookie.path || (url.pathname.startsWith(cookie.path)
          && (cookie.path.endsWith('/') || url.pathname[cookie.path.length] === '/'))));
    }
    header(url) { return this.forURL(url).map(cookie => cookie.name + '=' + cookie.value).join('; '); }
    values(url, name) { return this.forURL(url).filter(cookie => cookie.name === name).map(cookie => cookie.value); }
    clear() { this.items.clear(); }
  }
  const encodeQrMatrix = (() => {
  const ECC_CODEWORDS_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
      28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
      26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
      28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
      30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  };
  const NUM_ERROR_CORRECTION_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
      8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
      17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
      23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
      25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  };
  const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  // 版本 v 的数据模块总位数（扣掉定位、校正、时序与格式/版本信息占位）。
  // 用公式而不是查表：这一段是纯几何，能算就不该抄。
  function rawDataModules(version) {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const numAlign = Math.floor(version / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }
  function dataCodewords(version, ecc) {
    return Math.floor(rawDataModules(version) / 8)
      - ECC_CODEWORDS_PER_BLOCK[ecc][version] * NUM_ERROR_CORRECTION_BLOCKS[ecc][version];
  }
  function alignmentPositions(version) {
    if (version === 1) return [];
    const numAlign = Math.floor(version / 7) + 2;
    const size = version * 4 + 17;
    const step = version === 32 ? 26
      : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  // ---- GF(256) 与 RS 纠错 ----
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function buildGaloisTables() {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
  }());
  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }
  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i += 1) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j += 1) {
        next[j] ^= gfMul(poly[j], 1);
        next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
      }
      poly = next;
    }
    return poly;
  }
  function rsRemainder(data, degree) {
    const generator = rsGeneratorPoly(degree);
    const result = new Array(degree).fill(0);
    for (const byte of data) {
      const factor = byte ^ result[0];
      result.shift();
      result.push(0);
      for (let i = 0; i < degree; i += 1) {
        result[i] ^= gfMul(generator[i + 1], factor);
      }
    }
    return result;
  }

  // ---- 位流 ----
  function toUtf8Bytes(text) {
    const out = [];
    for (const ch of String(text)) {
      const code = ch.codePointAt(0);
      if (code < 0x80) out.push(code);
      else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return out;
  }
  function charCountBits(version) {
    return version <= 9 ? 8 : 16;
  }

  function buildCodewords(bytes, version, ecc) {
    const bits = [];
    const push = (value, length) => {
      for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
    };
    push(0b0100, 4);                       // 字节模式
    push(bytes.length, charCountBits(version));
    for (const byte of bytes) push(byte, 8);

    const capacityBits = dataCodewords(version, ecc) * 8;
    push(0, Math.min(4, capacityBits - bits.length));   // 终止符
    while (bits.length % 8 !== 0) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
      data.push(byte);
    }
    // 填充字节交替 0xEC / 0x11，直到填满数据容量。
    for (let pad = 0xec; data.length < dataCodewords(version, ecc); pad ^= 0xec ^ 0x11) {
      data.push(pad);
    }

    // 分块、逐块算纠错、再按列交织。
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version];
    const eccLen = ECC_CODEWORDS_PER_BLOCK[ecc][version];
    const shortBlockLen = Math.floor(data.length / numBlocks);
    const numShortBlocks = numBlocks - (data.length % numBlocks);
    const blocks = [];
    for (let i = 0, offset = 0; i < numBlocks; i += 1) {
      const length = shortBlockLen + (i < numShortBlocks ? 0 : 1);
      const block = data.slice(offset, offset + length);
      offset += length;
      blocks.push({ data: block, ecc: rsRemainder(block, eccLen) });
    }
    const result = [];
    for (let i = 0; i < shortBlockLen + 1; i += 1) {
      for (let b = 0; b < numBlocks; b += 1) {
        if (i < blocks[b].data.length) result.push(blocks[b].data[i]);
      }
    }
    for (let i = 0; i < eccLen; i += 1) {
      for (let b = 0; b < numBlocks; b += 1) result.push(blocks[b].ecc[i]);
    }
    return result;
  }

  // ---- 矩阵 ----
  function createMatrix(version) {
    const size = version * 4 + 17;
    const modules = [];
    const reserved = [];
    for (let y = 0; y < size; y += 1) {
      modules.push(new Uint8Array(size));
      reserved.push(new Uint8Array(size));
    }
    return { size, modules, reserved };
  }
  function setFunction(m, x, y, dark) {
    if (x < 0 || y < 0 || x >= m.size || y >= m.size) return;
    m.modules[y][x] = dark ? 1 : 0;
    m.reserved[y][x] = 1;
  }
  function drawFinder(m, cx, cy) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(m, cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
  }
  function drawFunctionPatterns(m, version, ecc) {
    const { size } = m;
    for (let i = 0; i < size; i += 1) {
      setFunction(m, 6, i, i % 2 === 0);
      setFunction(m, i, 6, i % 2 === 0);
    }
    drawFinder(m, 3, 3);
    drawFinder(m, size - 4, 3);
    drawFinder(m, 3, size - 4);

    const positions = alignmentPositions(version);
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = 0; j < positions.length; j += 1) {
        // 三个定位图案的角落不放校正图案。
        if ((i === 0 && j === 0) || (i === 0 && j === positions.length - 1)
          || (i === positions.length - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            setFunction(m, positions[i] + dx, positions[j] + dy,
              Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }
    // 格式信息占位（掩模确定后再写真值）与固定的暗模块。
    for (let i = 0; i < 9; i += 1) {
      if (i === 6) continue;
      setFunction(m, i, 8, false);
      setFunction(m, 8, i, false);
    }
    for (let i = 0; i < 8; i += 1) {
      setFunction(m, size - 1 - i, 8, false);
      setFunction(m, 8, size - 1 - i, false);
    }
    setFunction(m, 8, size - 8, true);
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i += 1) {
        const bit = ((bits >>> i) & 1) === 1;
        setFunction(m, i % 3 + size - 8 - 3, Math.floor(i / 3), bit);
        setFunction(m, Math.floor(i / 3), i % 3 + size - 8 - 3, bit);
      }
    }
    void ecc;
  }
  function drawFormatBits(m, ecc, mask) {
    const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const { size } = m;
    for (let i = 0; i <= 5; i += 1) setFunction(m, 8, i, ((bits >>> i) & 1) === 1);
    setFunction(m, 8, 7, ((bits >>> 6) & 1) === 1);
    setFunction(m, 8, 8, ((bits >>> 7) & 1) === 1);
    setFunction(m, 7, 8, ((bits >>> 8) & 1) === 1);
    for (let i = 9; i < 15; i += 1) setFunction(m, 14 - i, 8, ((bits >>> i) & 1) === 1);
    for (let i = 0; i < 8; i += 1) {
      setFunction(m, size - 1 - i, 8, ((bits >>> i) & 1) === 1);
    }
    for (let i = 8; i < 15; i += 1) {
      setFunction(m, 8, size - 15 + i, ((bits >>> i) & 1) === 1);
    }
    setFunction(m, 8, size - 8, true);
  }
  function drawCodewords(m, codewords) {
    const { size } = m;
    let index = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (m.reserved[y][x]) continue;
          const bit = index < codewords.length * 8
            ? (codewords[index >>> 3] >>> (7 - (index & 7))) & 1 : 0;
          m.modules[y][x] = bit;
          index += 1;
        }
      }
    }
  }
  function maskCondition(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    }
  }
  function applyMask(m, mask) {
    for (let y = 0; y < m.size; y += 1) {
      for (let x = 0; x < m.size; x += 1) {
        if (m.reserved[y][x]) continue;
        if (maskCondition(mask, x, y)) m.modules[y][x] ^= 1;
      }
    }
  }
  function penaltyScore(m) {
    const { size, modules } = m;
    let score = 0;
    const runScore = run => (run >= 5 ? 3 + (run - 5) : 0);
    for (let y = 0; y < size; y += 1) {
      let run = 1;
      for (let x = 1; x < size; x += 1) {
        if (modules[y][x] === modules[y][x - 1]) run += 1;
        else { score += runScore(run); run = 1; }
      }
      score += runScore(run);
    }
    for (let x = 0; x < size; x += 1) {
      let run = 1;
      for (let y = 1; y < size; y += 1) {
        if (modules[y][x] === modules[y - 1][x]) run += 1;
        else { score += runScore(run); run = 1; }
      }
      score += runScore(run);
    }
    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const v = modules[y][x];
        if (v === modules[y][x + 1] && v === modules[y + 1][x] && v === modules[y + 1][x + 1]) {
          score += 3;
        }
      }
    }
    const pattern = [1, 0, 1, 1, 1, 0, 1];
    const matches = (get, i, length) => {
      if (i + 11 > length) return false;
      for (let k = 0; k < 7; k += 1) if (get(i + k) !== pattern[k]) return false;
      for (let k = 7; k < 11; k += 1) if (get(i + k) !== 0) return false;
      return true;
    };
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (matches(i => modules[y][i], x, size)) score += 40;
        if (matches(i => modules[i][x], y, size)) score += 40;
      }
    }
    let dark = 0;
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) dark += modules[y][x];
    const percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  }

  function chooseVersion(byteLength, ecc, minVersion) {
    for (let version = Math.max(1, minVersion || 1); version <= 40; version += 1) {
      const capacity = dataCodewords(version, ecc) * 8 - 4 - charCountBits(version);
      if (byteLength * 8 <= capacity) return version;
    }
    return 0;
  }

  // 编码入口：返回 { size, modules }，modules[y][x] 为 1 表示暗模块。
  function encodeQr(text, { ecc = 'H', minVersion = 1 } = {}) {
    const level = ECC_CODEWORDS_PER_BLOCK[ecc] ? ecc : 'H';
    const bytes = toUtf8Bytes(text);
    const version = chooseVersion(bytes.length, level, minVersion);
    if (!version) return null;
    const codewords = buildCodewords(bytes, version, level);
    const matrix = createMatrix(version);
    drawFunctionPatterns(matrix, version, level);
    drawCodewords(matrix, codewords);

    let best = null;
    for (let mask = 0; mask < 8; mask += 1) {
      const trial = createMatrix(version);
      drawFunctionPatterns(trial, version, level);
      drawCodewords(trial, codewords);
      applyMask(trial, mask);
      drawFormatBits(trial, level, mask);
      const score = penaltyScore(trial);
      if (!best || score < best.score) best = { score, matrix: trial, mask };
    }
    return { size: best.matrix.size, modules: best.matrix.modules, version, mask: best.mask };
  }
    return encodeQr;
  })();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const queryURL = (base, params) => base + '?' + new URLSearchParams(params);
  function failure(code, stage) { return Object.assign(new Error(code), {stage}); }
  function assert(ok, code, stage) { if (!ok) throw failure(code, stage); }
  function fields(value, keys, stage) {
    assert(value && typeof value === 'object' && !Array.isArray(value), 'RESPONSE_SCHEMA_CHANGED', stage);
    const result = {};
    for (const key of keys) {
      const v = value[key];
      assert((typeof v === 'string' || typeof v === 'number') && String(v).length > 0 && String(v).length <= 32768,
        'RESPONSE_SCHEMA_CHANGED', stage);
      result[key] = String(v);
    }
    return result;
  }
  function validateGrant(value) {
    const result = fields(value, ['account', 'token', 'sign'], 'handoff');
    const timestamp = Number(value.timestamp);
    assert(Number.isFinite(timestamp) && timestamp > 0 && timestamp < 1e14, 'INVALID_TIMESTAMP', 'handoff');
    result.timestamp = timestamp;
    for (const key of ['open_id', 'user_type']) {
      if (typeof value[key] === 'string' || typeof value[key] === 'number') result[key] = String(value[key]);
    }
    return result;
  }
  function validateSteamGrant(value) {
    const channel = String(value?.channel_id);
    assert(['120061', '320061'].includes(channel), 'STEAM_CHANNEL_MISMATCH', 'steam_grant');
    const grant = Object.assign(validateGrant(value), {channel_id: channel});
    for (const key of ['channel_account', 'username', 'userAge', 'is_overseas']) {
      if (typeof value[key] === 'string' || typeof value[key] === 'number') {
        assert(String(value[key]).length <= 1024, 'RESPONSE_SCHEMA_CHANGED', 'steam_grant');
        grant[key] = value[key];
      }
    }
    return grant;
  }
  function validateBiliAuth(value) {
    const auth = fields(value, ['uid', 'access_key'], 'bili_auth');
    assert(typeof value.uname === 'string' && value.uname.length <= 512, 'BILI_AUTH_SCHEMA_CHANGED', 'bili_auth');
    const expires = Number(value.expires);
    assert(Number.isFinite(expires) && expires > 0 && expires < 1e11, 'BILI_AUTH_SCHEMA_CHANGED', 'bili_auth');
    return Object.assign(auth, {uname: value.uname, expires});
  }
  function validateBiliGrant(value) {
    assert(String(value?.channel_id) === '120133', 'BILI_CHANNEL_MISMATCH', 'bili_grant');
    const grant = Object.assign(validateGrant(value), {channel_id: '120133'});
    if (value.channel_account !== undefined) grant.channel_account = fields(value, ['channel_account'], 'bili_grant').channel_account;
    return grant;
  }
  function responseHeader(headers, name) {
    return String(headers || '').split(/\r?\n/).find(line => line.toLowerCase().startsWith(name.toLowerCase() + ':'))
      ?.slice(name.length + 1).trim() || '';
  }
  function uniqueParams(raw, stage) {
    const result = Object.create(null);
    for (const [k, v] of new URLSearchParams(raw)) {
      assert(!Object.hasOwn(result, k), 'DUPLICATE_FIELD', stage);
      result[k] = v;
    }
    return result;
  }
  function decodeJS(value) {
    return value.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\\/'"])/g, (_, v) =>
      v[0] === 'x' || v[0] === 'u' ? String.fromCharCode(parseInt(v.slice(1), 16)) : v);
  }
  function md5(text) {
    const bytes = new TextEncoder().encode(text);
    const length = Math.ceil((bytes.length + 9) / 64) * 64;
    const buffer = new Uint8Array(length); buffer.set(bytes); buffer[bytes.length] = 128;
    const view = new DataView(buffer.buffer);
    view.setUint32(length - 8, (bytes.length * 8) >>> 0, true);
    view.setUint32(length - 4, Math.floor(bytes.length / 0x20000000), true);
    const shift = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476;
    for (let offset = 0; offset < length; offset += 64) {
      let a = h0, b = h1, c = h2, d = h3;
      for (let i = 0; i < 64; i++) {
        const round = i >>> 4;
        const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) :
          round === 2 ? b ^ c ^ d : c ^ (b | ~d);
        const index = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
        const k = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
        const sum = (a + f + k + view.getUint32(offset + index * 4, true)) | 0;
        const n = shift[round][i % 4];
        const next = (b + ((sum << n) | (sum >>> (32 - n)))) | 0;
        a = d; d = c; c = b; b = next;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    }
    return [h0, h1, h2, h3].map(n => [0, 8, 16, 24].map(s =>
      ((n >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
  }
  function b64encode(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(s);
  }
  function b64decode(text) {
    const s = atob(text), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function qrSvgDataUrl(text) {
    const matrix = encodeQrMatrix(text, {ecc: 'M'});
    if (!matrix) throw failure('QR_ENCODING_FAILED', 'qr');
    const size = matrix.size + 8, rects = [];
    for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) rects.push('<rect x="' + (x + 4) + '" y="' + (y + 4) + '" width="1" height="1"/>');
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size +
      '" width="280" height="280" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><g fill="black">' +
      rects.join('') + '</g></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function binaryDataUrl(bytes, mime) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return 'data:' + mime + ';base64,' + btoa(s);
  }
  function requestRaw(url, options = {}, signal, channelId) {
    if (!allowed(url, channelId)) return Promise.reject(new Error('请求地址不在当前渠道的官方接口列表中'));
    const timeout = Math.min(Math.max(Number(options.timeout) || 35000, 1000), 65000);
    return new Promise((resolve, reject) => {
      let finished = false, handle;
      const finish = (fn, result) => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', cancel);
        fn(result);
      };
      const cancel = () => { finish(reject, new Error('已取消')); if (handle) handle.abort(); };
      const timer = setTimeout(() => { finish(reject, new Error('官方接口请求超时')); if (handle) handle.abort(); }, timeout + 1000);
      if (signal && signal.aborted) return cancel();
      if (signal) signal.addEventListener('abort', cancel, {once: true});
      const headers = Object.assign({Accept: '*/*'}, options.headers || {});
      const request = {
        method: options.method || (options.data === undefined ? 'GET' : 'POST'),
        url, data: options.data, headers, timeout, nocache: true,
        anonymous: options.anonymous !== false
      };
      if (options.manual) request.redirect = 'manual';
      else if (options.follow === false) request.redirect = 'error';
      if (options.responseType) request.responseType = options.responseType;
      if (options.cookieJar) request.cookie = options.cookieJar.header(url);
      try {
        handle = GM_xmlhttpRequest(Object.assign(request, {
          onload(response) {
            try {
              const status = Number(response.status);
              const finalUrl = response.finalUrl || url;
              if (!allowed(finalUrl, channelId)) throw new Error('官方接口出现意外跳转');
              if (options.manual) {
                if (!(status >= 200 && status < 400)) throw new Error('官方接口 HTTP ' + status);
              } else if (!(status >= 200 && status < 300)) throw new Error('官方接口 HTTP ' + status);
              if (options.cookieJar) options.cookieJar.read(response.responseHeaders || '', finalUrl);
              const responseText = typeof response.responseText === 'string' ? response.responseText : '';
              const bytes = options.responseType === 'arraybuffer' && response.response
                ? new Uint8Array(response.response) : null;
              const length = bytes ? bytes.byteLength : responseText.length;
              if (!Number.isFinite(length) || length > (options.limit || 1048576)) throw new Error('官方接口响应过大');
              finish(resolve, {status, responseText, bytes, responseHeaders: response.responseHeaders || '', finalUrl, response});
            } catch (error) { finish(reject, error); }
          },
          onerror: () => finish(reject, new Error('官方接口网络请求失败，请检查油猴的跨域授权')),
          ontimeout: () => finish(reject, new Error('官方接口请求超时')),
          onabort: () => finish(reject, new Error('已取消'))
        }));
      } catch (_) { finish(reject, new Error('官方接口请求未发出，请检查油猴权限')); }
    });
  }
  async function request(url, options = {}, signal, channelId) {
    return (await requestRaw(url, options, signal, channelId)).responseText;
  }
  const value = (object, name) => object && object[name] != null ? String(object[name]) : '';
  const safeCode = raw => /^-?\d{1,10}$/.test(String(raw)) ? String(raw) : '未提供';
  function requireFields(object, fields, message) {
    if (!object || fields.some(name => !value(object, name))) throw new Error(message);
  }
  function callback(raw, expectedState, channelId) {
    const channel = channelFor(channelId), rule = channel.callback;
    if (!rule) throw new Error(channel.name + '渠道没有可用的浏览器回调');
    const url = new URL(raw);
    if (!rule.protocols.includes(url.protocol) || url.hostname !== rule.hostname
      || url.port || url.username || url.password || url.pathname !== rule.pathname) throw new Error('不是本次' + channel.name + '官方回调地址');
    let params = url.searchParams;
    if (!params.get('code')) params = new URLSearchParams(url.hash.slice(1));
    const state = params.get('state'), code = params.get('code');
    if (!/^[a-f0-9]{32}$/.test(state || '') || state !== expectedState) throw new Error('授权校验不匹配，请从官网重新发起' + channel.name + '登录');
    if (!code || code.length > 4096 || /[\r\n\x00]/.test(code)) throw new Error('未取得' + channel.name + '授权码，请重新授权');
    return {state, code};
  }
  async function xiaomiConnect(code, progress, signal, checkIdentity, channel) {
    const transport = channel.transport;
    progress('正在转换' + channel.name + '官方授权…');
    const oauth = await decode(await request(channel.endpoints.oauth + '?p=' + encodeURIComponent(await encode(
      'accountType=4&code=' + code + '&isSaveSt=true&appid=' + transport.appId, channel)), {}, signal, channel.id), channel);
    code = null;
    if (value(oauth, 'code') !== '0' || value(oauth, 'uuid') === '0') throw new Error(channel.name + '授权转换失败，错误码 ' + safeCode(oauth.code));
    requireFields(oauth, ['uuid', 'st'], channel.name + '授权响应缺少必要字段');
    progress('正在取得一将成名' + channel.name + '游戏会话…');
    const sdkChannel = transport.channel;
    // SDK ReqLoginAppAccount appends raw values before AES. Only the OUTER p form field is URL-encoded.
    const plain = 'fuid=' + value(oauth, 'uuid') + '&devAppId=' + transport.devAppId + '&toke=' + value(oauth, 'st')
      + '&imei=&sdkVersion=' + transport.sdkVersion + '&channel=' + sdkChannel + '&ua=Windows&currentChannel=' + sdkChannel
      + '&imeiMd5=&firstChannel=' + sdkChannel + '&oaid=&needRealNameInfo=false&needServiceToken=true&needRiskControl=true';
    const game = await decode(await request(channel.endpoints.session, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      data: new URLSearchParams({p: await encode(plain, channel)}).toString()}, signal, channel.id), channel);
    if (value(game, 'retCode') !== '200' || value(game, 'appAccountId') === '0') throw new Error(channel.name + '游戏会话失败，错误码 ' + safeCode(game.retCode));
    requireFields(game, ['appAccountId', 'session'], channel.name + '游戏响应缺少必要字段');
    // Check the actual Xiaomi game identity before requesting a Yoka ticket or entering the game.
    await checkIdentity({id: value(game, 'appAccountId'), nickname: value(game, 'nickName')});
    if (signal && signal.aborted) throw new Error('已取消');
    progress('正在连接游卡' + channel.name + '渠道…');
    const payload = {
      appid: channel.exchange.appid, package_id: channel.exchange.packageId, platform_id: channel.exchange.platformId, platform_name: channel.exchange.platformName,
      base: {device_id: '', version_code: '347', version_name: '1.0.347', device_mobile: 'Windows', device_network: '', device_os: 'Windows',
        device_os_version: '', device_pixel: screen.width + '*' + screen.height, device_type: 'PC', device_version_code: ''},
      ext: null, data: {thirdparty: channel.exchange.thirdparty, pid: channel.exchange.platformId, gid: channel.exchange.appid, uid: value(game, 'appAccountId'), username: value(game, 'nickName'),
        session: value(game, 'session'), thirdAdult: '0', thirdRealNameStatus: '0', thirdAge: '0'}
    };
    const exchange = JSON.parse(await request(channel.endpoints.channel, {method: 'POST', headers: {'Content-Type': 'application/json; charset=utf-8'}, data: JSON.stringify(payload)}, signal, channel.id));
    if (value(exchange, 'code') !== '0') throw new Error('游卡渠道转换失败，错误码 ' + safeCode(exchange.code));
    requireFields(exchange.data, ['session'], '游卡渠道响应缺少必要字段');
    progress('正在取得' + channel.shortName + '启动参数…');
    // Same Xiaomi-specific route and default status as the supplied APK; actual account validation remains on the server.
    const launch = JSON.parse(await request(channel.endpoints.launch + '?ticket=' + encodeURIComponent(value(exchange.data, 'session')) + '&is_adult=' + encodeURIComponent(channel.launch.adult), {}, signal, channel.id));
    if (value(launch, 'code') !== '0') throw new Error(channel.shortName + '启动失败，错误码 ' + safeCode(launch.code));
    requireFields(launch.data, ['account', 'token', 'sign', 'timestamp'], channel.shortName + '启动响应缺少必要字段');
    return {channel_id: channel.bridge.channelId, account: value(launch.data, 'account'), token: value(launch.data, 'token'), sign: value(launch.data, 'sign'), timestamp: value(launch.data, 'timestamp')};
  }
  const flows = Object.freeze({
    'yoka-xiaomi-v1': Object.freeze({connect: xiaomiConnect, installBridge: xiaomiInstallBridge, connectionState: xiaomiConnectionState})
  });
  async function connect(code, progress, signal, checkIdentity = () => {}, channelId) {
    const channel = requireBrowser(channelId);
    const flow = flows[channel.protocol];
    if (!flow) throw new Error(channel.name + '渠道尚未配置可验证的浏览器登录适配');
    return flow.connect(code, progress, signal, checkIdentity, channel);
  }
  function xiaomiInstallBridge(page, credentials, emit, channel) {
    const channelId = channel.bridge.channelId;
    const original = Object.assign({}, credentials, {channel_id: channelId});
    // /x/pc usually creates CHATOL and ReqObj in inline page code before the
    // large userscript can run. A validated grant is still safe to install as
    // long as the game has not entered its login scene, so take over the
    // existing references instead of abandoning the one-use launch.
    const channelDescriptor = Object.getOwnPropertyDescriptor(page, 'channel_id');
    if (!channelDescriptor || channelDescriptor.configurable) {
      Object.defineProperty(page, 'channel_id', {get: () => channelId, set() {}, configurable: false});
    } else if (channelDescriptor.writable || channelDescriptor.set) {
      try { page.channel_id = channelId; } catch (_) {}
    }
    try {
      if (typeof page.customData === 'function') {
        const originalCustomData = page.customData;
        page.customData = function (...args) {
          const result = originalCustomData.apply(this, args);
          try { page.channel_id = channelId; } catch (_) {}
          return result;
        };
      }
    } catch (_) {}
    if (Number(page.channel_id) !== Number(channelId)) {
      throw new Error('脚本注入偏晚，页面渠道号已被占用，请刷新后重试');
    }
    let args;
    const current = Object.getOwnPropertyDescriptor(page, 'ReqObj');
    if (!current || current.configurable) {
      const existing = page.ReqObj && typeof page.ReqObj === 'object' && !Array.isArray(page.ReqObj) ? page.ReqObj : {};
      args = Object.assign(existing, original);
      Object.defineProperty(page, 'ReqObj', {
        get: () => args,
        set: incoming => Object.assign(args, incoming || {}, original),
        configurable: false
      });
    } else if (page.ReqObj && typeof page.ReqObj === 'object' && !Array.isArray(page.ReqObj)) {
      // Non-configurable data property: mutate the same object so every local
      // reference already held by the official game sees the grant too.
      args = Object.assign(page.ReqObj, original);
    } else if (current.writable) {
      args = Object.assign({}, original);
      page.ReqObj = args;
    } else if (current.set) {
      page.ReqObj = Object.assign({}, original);
      args = page.ReqObj;
    }
    if (!args || String(args.account || '') !== String(original.account || '') ||
      String(args.token || '') !== String(original.token || '') ||
      Number(args.channel_id) !== Number(channelId)) {
      throw new Error('脚本注入偏晚，启动参数未能接入，请刷新后重试');
    }
    page.__xiaomiBrowserEvent = emit;
    let delegate = typeof page.scriptContent === 'function' ? page.scriptContent : null;
    const wrap = function (name, source) {
      if (typeof delegate === 'function') {
        try { source = delegate(name, source); } catch (_) {}
      }
      if (typeof source !== 'string' || !name || !name.includes('main')) return source;
      const markers = [
        ['authHandler(e){let t=e.Protocol;', "authHandler(e){let t=e.Protocol;try{window.__xiaomiConnectionState=()=>{try{let s=WBMgr.GetInstance().IsConnected;return typeof s==='boolean'?s:null;}catch(_){return null;}};window.__xiaomiBrowserEvent('auth-result',{code:Number(t.errCode)});}catch(_){}"],
        ['notifyUserData(e){let t=e.Protocol;if(t.finished){', "notifyUserData(e){let t=e.Protocol;if(t.finished){try{window.__xiaomiBrowserEvent('user-data',{roleName:UserData.Self?String(UserData.Self.Nickname||''):'',roleId:AccountInfo.Self?String(AccountInfo.Self.UserId||''):'',serverId:AccountInfo.Self?String(AccountInfo.Self.SeverID||''):''});}catch(_){}"],
        ['enterScene(){if(NSRegressActivity2026Manager', "enterScene(){try{window.__xiaomiBrowserEvent('enter-scene',{});}catch(_){}if(NSRegressActivity2026Manager"]
      ];
      const hooks = markers.map(([find, replacement]) => {
        const matched = source.split(find).length - 1 === 1;
        if (matched) source = source.replace(find, replacement);
        return matched;
      });
      emit('game-code', {hooks});
      return source;
    };
    const scriptDescriptor = Object.getOwnPropertyDescriptor(page, 'scriptContent');
    if (!scriptDescriptor || scriptDescriptor.configurable) {
      Object.defineProperty(page, 'scriptContent', {
        configurable: true,
        get: () => wrap,
        set: value => { if (typeof value === 'function') delegate = value; }
      });
    } else {
      try { page.scriptContent = wrap; } catch (_) {}
    }
  }
  function installBridge(page, credentials, emit, channelId) {
    const channel = requireBrowser(channelId);
    const flow = flows[channel.protocol];
    if (!flow || typeof flow.installBridge !== 'function') throw new Error(channel.name + '渠道尚未配置可验证的浏览器桥接');
    return flow.installBridge(page, credentials, emit, channel);
  }
  function xiaomiConnectionState() {
    try {
      return typeof unsafeWindow.__xiaomiConnectionState === 'function' ? unsafeWindow.__xiaomiConnectionState() : null;
    } catch (_) { return null; }
  }
  function connectionState(channelId) {
    const channel = channelFor(channelId);
    const flow = channel.protocol ? flows[channel.protocol] : null;
    return flow && typeof flow.connectionState === 'function' ? flow.connectionState(channel) : null;
  }
  function createAccountStore(storage, now = () => Date.now(), makeId = () => crypto.randomUUID(), channelId) {
    const channel = channelFor(channelId);
    const prefixes = new Map(ChannelRegistry.channels.map(item => [item.accountPrefix, item]));
    const profileKey = (prefix, id) => prefix + 'profile:' + encodeURIComponent(id);
    const clean = (value, length = 80) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, length) : '';
    const validId = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,256}$/.test(value);
    function normalize(profile, prefix) {
      const owner = prefixes.get(prefix);
      if (!owner || !profile || typeof profile !== 'object' || !validId(profile.id)) return null;
      const storedOwner = typeof profile.channelId === 'string' ? channelFor(profile.channelId) : null;
      if (storedOwner && storedOwner.id !== owner.id) return null;
      return Object.assign({}, profile, {channelId: owner.id});
    }
    function locate(id, wantedChannel = '') {
      if (!validId(id)) return null;
      const wanted = wantedChannel ? channelFor(wantedChannel) : null;
      if (wantedChannel && !wanted) return null;
      const owners = wanted ? [wanted] : [channel, ...ChannelRegistry.channels.filter(item => item.id !== channel.id)];
      for (const owner of owners) {
        const key = profileKey(owner.accountPrefix, id);
        const profile = normalize(storage.get(key, null), owner.accountPrefix);
        if (profile && profile.id === id) return {profile, channel: owner, prefix: owner.accountPrefix, key};
      }
      return null;
    }
    function get(id, wantedChannel = '') {
      return locate(id, wantedChannel)?.profile || null;
    }
    function update(id, changes, create = false, wantedChannel = '') {
      if (!validId(id)) throw new Error('账号标识格式不正确');
      const found = create ? null : locate(id, wantedChannel);
      if (!found && !create) return null;
      const owner = found?.channel || (wantedChannel ? channelFor(wantedChannel) : channel);
      if (!owner) return null;
      const old = found?.profile;
      const next = Object.assign({id, channelId: owner.id, windowKey: makeId(), createdAt: now()}, old || {}, {channelId: owner.id});
      // Persist only the explicit metadata fields, never arbitrary protocol objects.
      for (const field of ['alias', 'nickname', 'roleName', 'roleId', 'serverId', 'zoneNote', 'channelAccount',
        'lastLoginMethod', 'lastLoginOption', 'lastLoginProvider']) {
        if (Object.prototype.hasOwnProperty.call(changes, field)) next[field] = clean(changes[field]);
      }
      if (Object.prototype.hasOwnProperty.call(changes, 'loginAccount')) next.loginAccount = clean(changes.loginAccount, 256);
      for (const field of ['lastAuthorizedAt', 'lastLoginAt']) if (Number.isFinite(changes[field])) next[field] = changes[field];
      storage.set(profileKey(owner.accountPrefix, id), next);
      return next;
    }
    function profiles(allChannels = true) {
      const owners = allChannels ? ChannelRegistry.channels : [channel];
      const found = new Map();
      for (const owner of owners) {
        for (const key of storage.keys()) {
          if (!key.startsWith(owner.accountPrefix + 'profile:')) continue;
          const profile = normalize(storage.get(key, null), owner.accountPrefix);
          if (profile) found.set(owner.id + '\u0000' + profile.id, profile);
        }
      }
      return [...found.values()].sort((a, b) =>
        (b.lastLoginAt || b.lastAuthorizedAt || 0) - (a.lastLoginAt || a.lastAuthorizedAt || 0));
    }
    function live(id, except = '', wantedChannel = '') {
      const wanted = wantedChannel ? channelFor(wantedChannel) : null;
      const owners = wanted ? [wanted] : ChannelRegistry.channels;
      const records = [];
      for (const owner of owners) {
        if (!owner) continue;
        for (const key of storage.keys()) {
          if (!key.startsWith(owner.accountPrefix + 'live:')) continue;
          const value = storage.get(key, null);
          if (!value || !Number.isFinite(value.expires) || value.expires <= now()) { storage.remove(key); continue; }
          if (except && value.instance === except) continue;
          const storedOwner = value.channelId ? channelFor(value.channelId) : owner;
          if (storedOwner?.id !== owner.id || value.profileId !== id) continue;
          records.push(Object.assign({}, value, {channelId: owner.id}));
        }
      }
      return records;
    }
    function ref(profile) {
      return profile && validId(profile.id) && channelFor(profile.channelId)
        ? profile.channelId + '::' + profile.id : '';
    }
    function parseRef(value) {
      if (typeof value !== 'string') return null;
      const at = value.indexOf('::');
      if (at < 1) return null;
      const wantedChannel = channelFor(value.slice(0, at));
      const id = value.slice(at + 2);
      if (!wantedChannel || !validId(id)) return null;
      return {channelId: wantedChannel.id, id};
    }
    function channelForProfile(profile) {
      return channelFor(profile?.channelId) || channel;
    }
    return {
      get, update, profiles, validId, ref, parseRef, channelForProfile,
      register: identity => update(identity.id, {nickname: identity.nickname, lastAuthorizedAt: now()}, true, channel.id),
      remove: (id, wantedChannel = '') => {
        const found = locate(id, wantedChannel);
        if (found) storage.remove(found.key);
      },
      live,
      beat: (instance, profileId, phase, ownerName = '') => {
        if (validId(profileId)) storage.set(channel.accountPrefix + 'live:' + instance, {instance, channelId: channel.id, profileId, phase: clean(phase, 24), ownerName: clean(ownerName, 100), expires: now() + 180000});
      },
      release: instance => storage.remove(channel.accountPrefix + 'live:' + instance),
      label: profile => {
        if (!profile) return '新账号';
        const owner = channelForProfile(profile);
        return profile.alias || profile.roleName || profile.nickname || owner.accountLabel + ' · ' + profile.id.slice(-4);
      }
    };
  }
  function authorization(state, method = 1, channelId) {
    const channel = requireBrowser(channelId), oauth = channel.oauth;
    if (!oauth) throw new Error(channel.name + '渠道尚未配置官方 OAuth 入口');
    const authorization = new URL(oauth.authorize);
    authorization.search = new URLSearchParams({...(oauth.params || {}), client_id: oauth.clientId,
      response_type: 'code', scope: oauth.scope, redirect_uri: oauth.redirectUri, state}).toString();
    let loginEntry = null;
    if (oauth.loginEntry) {
      loginEntry = new URL(oauth.loginEntry);
      loginEntry.search = new URLSearchParams({sid: oauth.sid, callback: authorization.href}).toString();
    }
    return {authorization, loginEntry, method};
  }
  return {
    use, active: () => active, get: id => ChannelRegistry.get(id), channels: () => ChannelRegistry.channels,
    isBrowser: id => ChannelRegistry.isBrowser(channelFor(id)), capabilityLabel: ChannelRegistry.capabilityLabel,
    authorization, encode, decode, allowed, callback, connect, installBridge, createAccountStore, connectionState,
    switchAccount: id => channelFor(id).oauth?.switchAccount || channelFor(id).accountPage || '',
    endpoints: id => channelFor(id).endpoints
  };
})();
/* CORE-END */

  const CALLBACK_CHANNEL = ChannelRegistry.callbackFor(location.href);
  const CHANNEL = CALLBACK_CHANNEL || ChannelCore.active();
  const PREFIX = CHANNEL.storagePrefix;
  const LAUNCH = PREFIX + 'launch';
  const GAME = 'https://web.sanguosha.com/x/pc/index.php';
  const ACCOUNT_CONTEXT = CHANNEL.contextPrefix + '-account-context';
  const OWNER_CONTEXT = CHANNEL.contextPrefix + '-window-owner';
  const LEGACY_TRANSIENT_PROFILE_KEY = CHANNEL.contextPrefix + '-transient-profile-v1';
  const LOGIN_PAGE = 'https://web.sanguosha.com/login/10th_client/index.html';
  const PENDING_ACCOUNT_KEY = 'sgs-unified-pending-account-v1';
  const VERSION = '1.1';
  const isBrowserChannel = ChannelRegistry.isBrowser(CHANNEL);
  const hasDirectLogin = CHANNEL.loginOptions.some(option => option.kind === 'direct');
  const hasBrowserLogin = CHANNEL.loginOptions.some(option => option.kind === 'direct' && option.mode === 'browser');
  const isPortalChannel = CHANNEL.authMode === 'portal';
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const OWNER_PATTERN = new RegExp('^' + escapeRegExp(CHANNEL.windowPrefix) + '-(manager|profile)-[a-f0-9]{32}$');
  const WINDOW_FRAGMENT = CHANNEL.windowPrefix + '-window';
  // UI changes apply only to this document; each new page starts shown at the top right.
  GM_deleteValue('sgs-xiaomi-panel-prefs'); // Discard the legacy persistent preference.
  let panelState = {hidden: false, left: null, top: null};
  const log = [];
  let stateText = isBrowserChannel
    ? (hasBrowserLogin
      ? '选择登录方式：扫码可在面板完成；账号密码、短信验证码和网页扫码在' + CHANNEL.name + '官方窗口完成，脚本会自动继续。'
      : hasDirectLogin
      ? '选择登录方式：扫码在当前面板完成；脚本不会读取账号密码、验证码或二维码内容。'
      : '点击下方按钮打开' + CHANNEL.name + '官方登录页；登录后直接在官方页面进入“三国杀一将成名”。')
    : CHANNEL.reason;
  let statusNode, logNode, loginButton, alternateLoginButton, cancelButton, importArea, active = null;
  let panelContent, loginOptionsNode, qrNode, qrImage, qrCaption, directNote, panelCollapseButton;
  const loginOptionButtons = [];
  let channelSelect, channelInfo, channelBadge, addAccountButton, switchAccountButton;
  let consumedLaunch = false;
  let panelHost = null;
  let accounts = null, expectedProfileId = null, currentProfileId = null, accountPhase = 'waiting';
  let phaseStartedAt = Date.now(), duplicateRetry = null, retryLoginButton;
  let accountsView, currentAccountNode, accountCountNode, accountActionsNode, accountFingerprint = '', entryError = false;
  let selectedProfileId = null, selectedProfileChannelId = CHANNEL.id, accountInfo, accountOpen, accountEdit, accountRemove, accountEditor, aliasInput, zoneInput;
  const profileChoices = new Map();
  let editingProfileId = null, removingProfileId = null;
  let accountInspect, accountDetails, accountDetailsText, inspectingProfileId = null;
  let saveLoginInfo = true, transientProfile = null, pendingAutoLogin = null;
  let saveLoginToggle = null, saveLoginNote = null;
  let statusCard, statusCaption, historyDetails, historyCount, historyFilterButton, historyClearButton, errorsOnly = false;
  const linkedWindows = new Map();
  const ownedWindows = new Set();
  let ownerName = '';
  function preferences() {
    return panelState;
  }
  function savePreferences(changes) { panelState = Object.assign({}, panelState, changes); }
  function selectedProfile() {
    return accounts && selectedProfileId ? accounts.get(selectedProfileId, selectedProfileChannelId) : null;
  }
  function selectProfile(profile) {
    selectedProfileId = profile?.id || null;
    selectedProfileChannelId = profile?.channelId || CHANNEL.id;
  }
  function transientProfileMatches(id, channelId = CHANNEL.id) {
    return !!id && transientProfile?.id === id && transientProfile?.channelId === channelId;
  }
  function profileById(id, channelId = CHANNEL.id) {
    if (!id) return null;
    if (transientProfileMatches(id, channelId)) return transientProfile;
    return accounts?.get(id, channelId) || null;
  }
  function saveLoginInfoEnabled() { return saveLoginInfo !== false; }
  function clearTransientProfile() {
    transientProfile = null;
    try { sessionStorage.removeItem(LEGACY_TRANSIENT_PROFILE_KEY); } catch (_) {}
  }
  function rememberTransientProfile(identity) {
    if (!identity?.id || !accounts?.validId(identity.id)) return null;
    const now = Date.now();
    const previous = transientProfileMatches(identity.id) ? transientProfile : null;
    transientProfile = Object.assign({}, previous || {}, identity, {
      id: identity.id, channelId: CHANNEL.id,
      windowKey: previous?.windowKey || randomId(), createdAt: previous?.createdAt || now,
      transient: true, expires: now + 6 * 60 * 60 * 1000
    });
    return transientProfile;
  }
  function updateTransientProfile(changes = {}) {
    if (!transientProfile) return null;
    const fields = ['alias', 'nickname', 'roleName', 'roleId', 'serverId', 'zoneNote', 'channelAccount', 'loginAccount',
      'lastLoginMethod', 'lastLoginOption', 'lastLoginProvider'];
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(changes, field)) continue;
      const value = typeof changes[field] === 'string' ? changes[field].replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 256) : '';
      if (value) transientProfile[field] = value;
    }
    for (const field of ['lastAuthorizedAt', 'lastLoginAt']) {
      if (Number.isFinite(changes[field])) transientProfile[field] = changes[field];
    }
    return transientProfile;
  }
  function rememberIdentity(identity, wantedId = '') {
    const id = wantedId || identity?.id || '';
    if (!saveLoginInfoEnabled()) {
      const existing = accounts?.get(id, CHANNEL.id) || null;
      return rememberTransientProfile({...(existing || {}), ...identity, id});
    }
    clearTransientProfile();
    return updateMatchedProfile(id, identity) || accounts.register({...identity, id});
  }
  function rememberLoginMetadata(profileId, channelId = CHANNEL.id, context = active) {
    if (!profileId) return null;
    const optionId = typeof context?.loginOptionId === 'string' ? context.loginOptionId : '';
    const provider = typeof context?.loginProvider === 'string' ? context.loginProvider
      : typeof context?.provider === 'string' ? context.provider : CHANNEL.id;
    const method = typeof context?.loginMethod === 'string' ? context.loginMethod : '';
    if (!optionId && !provider && !method) return null;
    const changes = {lastLoginMethod: method, lastLoginOption: optionId, lastLoginProvider: provider};
    if (!saveLoginInfoEnabled() || transientProfileMatches(profileId, channelId)) {
      return updateTransientProfile(changes);
    }
    return accounts.update(profileId, changes, false, channelId);
  }
  function profileChannel(profile) {
    return ChannelRegistry.get(profile?.channelId) || CHANNEL;
  }
  function accountIdentityKey(id) {
    const text = String(id || '').trim();
    const prefix = CHANNEL.id + ':';
    return text.startsWith(prefix) ? text.slice(prefix.length) : text;
  }
  function sameAccountIdentity(left, right) {
    const a = accountIdentityKey(left), b = accountIdentityKey(right);
    return !!a && a === b;
  }
  function updateMatchedProfile(id, identity) {
    if (!saveLoginInfoEnabled()) return null;
    const changes = {lastAuthorizedAt: Date.now()};
    if (typeof identity?.nickname === 'string' && identity.nickname.trim()) changes.nickname = identity.nickname;
    return accounts.update(id, changes, false, CHANNEL.id);
  }
  function profileZone(profile) {
    if (!profile) return '区服未标注';
    if (profile.zoneNote) return '区服备注：' + profile.zoneNote;
    const owner = profileChannel(profile);
    return profile.serverId ? owner.shortName + ' · 区服 ' + profile.serverId : owner.shortName + ' · 区服待游戏返回';
  }
  function switchChannel(id, options = {}) {
    const next = ChannelRegistry.get(id);
    if (!next || next.id === CHANNEL.id) return;
    if (channelSelect) channelSelect.value = CHANNEL.id;
    if (active) return status('请先取消当前授权，再切换登录渠道。');
    if (consumedLaunch && !['failed', 'disconnected'].includes(accountPhase)) {
      return status('当前页面正在使用' + CHANNEL.shortName + '账号；请回到官网登录页后再切换渠道。');
    }
    if (options.accountId) {
      try {
        sessionStorage.setItem(PENDING_ACCOUNT_KEY, JSON.stringify({
          channelId: next.id, id: String(options.accountId).slice(0, 256),
          autoLogin: !!options.autoLogin, optionId: String(options.optionId || '').slice(0, 80),
          provider: String(options.provider || '').slice(0, 32), nonce: randomId(),
          saveLoginInfo: options.saveLoginInfo !== false, expires: Date.now() + 120000
        }));
      } catch (_) {}
    }
    try { ChannelCore.use(next.id); }
    catch (error) { return status('渠道切换未完成：' + (error instanceof Error ? error.message : '未知错误')); }
    location.reload();
  }
  function setPanelVisible(visible) {
    if (!panelHost) return;
    panelHost.hidden = !visible;
    // The host reset and page CSS can override the browser's default [hidden] rule.
    panelHost.style.setProperty('display', visible ? 'block' : 'none', 'important');
  }
  function setLoginPanelCollapsed(collapsed) {
    if (!panelContent || !panelCollapseButton) return false;
    panelContent.hidden = !!collapsed;
    panelCollapseButton.textContent = collapsed ? '展开' : '收起';
    panelCollapseButton.setAttribute('aria-expanded', String(!collapsed));
    return true;
  }
  function finishLoginSurface(context = active) {
    closeLoginPopup(context);
    setLoginPanelCollapsed(true);
  }
  function positionPanel(left, top) {
    if (!panelHost) return;
    const rect = panelHost.getBoundingClientRect();
    const width = rect.width || Math.min(336, window.innerWidth - 24);
    const height = rect.height || 100;
    panelHost.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + 'px';
    panelHost.style.top = Math.max(8, Math.min(top, window.innerHeight - height - 8)) + 'px';
    panelHost.style.right = 'auto';
  }
  function showPanel(reset = false) {
    savePreferences(reset ? {hidden: false, left: null, top: null} : {hidden: false});
    if (!panelHost) return;
    setPanelVisible(true);
    setLoginPanelCollapsed(false);
    if (reset) { panelHost.style.left = 'auto'; panelHost.style.right = '16px'; panelHost.style.top = '16px'; }
    else {
      const prefs = preferences();
      if (Number.isFinite(prefs.left) && Number.isFinite(prefs.top)) positionPanel(prefs.left, prefs.top);
    }
  }
  const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  const instanceId = randomId();
  const pendingKey = state => PREFIX + 'pending:' + state;
  const resultKey = state => PREFIX + 'callback:' + state;
  const validTime = expires => typeof expires === 'number' && expires > Date.now() && expires <= Date.now() + 11 * 60 * 1000;
  function statusLevel(text) {
    if (/失败|错误码|未完成|超时|异常|不一致|未能|拦截|无效|过期|未取得|不是本次|不正确|格式错误|缺少|启动偏晚|无法/.test(text)) return 'error';
    if (/取消|仍有响应|断开|掉线|游戏已更新|已清除/.test(text)) return 'warning';
    if (/正在|等待|请在.*(授权|登录)|请.*完成授权/.test(text)) return 'progress';
    if (/已收到|成功|准备完成|已是最新|已保存|已复制|已移除|已绑定|已打开/.test(text)) return 'success';
    return 'info';
  }
  function renderStatus() {
    if (statusNode) statusNode.textContent = stateText;
    const level = !isBrowserChannel && stateText === CHANNEL.reason ? 'warning' : statusLevel(stateText);
    if (statusCard) statusCard.className = 'status-card ' + level;
    if (statusCaption) statusCaption.textContent = {info: '准备就绪', progress: '正在处理', success: '操作完成', error: '遇到问题', warning: '操作提示'}[level];
  }
  function renderHistory() {
    if (!logNode) return;
    const unusual = log.filter(item => ['error', 'warning'].includes(item.level));
    if (historyCount) historyCount.textContent = log.length + ' 条' + (unusual.length ? ' · ' + unusual.length + ' 异常' : '');
    if (historyFilterButton) {
      historyFilterButton.textContent = errorsOnly ? '显示全部' : '仅看异常';
      historyFilterButton.setAttribute('aria-pressed', String(errorsOnly));
    }
    if (historyClearButton) historyClearButton.disabled = !log.length;
    logNode.replaceChildren();
    const visible = log.map((item, index) => ({...item, current: index === log.length - 1}))
      .filter(item => !errorsOnly || ['error', 'warning'].includes(item.level)).reverse();
    if (!visible.length) {
      const empty = document.createElement('li'); empty.className = 'record-empty';
      empty.textContent = errorsOnly ? '暂无异常记录' : '暂无记录，登录和操作过程会显示在这里。'; logNode.appendChild(empty);
      return;
    }
    for (const item of visible) {
      const row = document.createElement('li'); row.className = 'record-item ' + item.level + (item.current ? ' is-current' : '');
      const meta = document.createElement('div'); meta.className = 'record-meta';
      const time = document.createElement('time'); time.dateTime = item.time;
      time.textContent = new Date(item.time).toLocaleTimeString('zh-CN', {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'});
      const badge = document.createElement('span'); badge.className = 'record-badge';
      badge.textContent = item.level === 'error' ? '异常' : item.level === 'warning' ? '注意' : item.level === 'success' ? '完成' : item.current ? '当前' : '过程';
      meta.appendChild(time); meta.appendChild(badge); row.appendChild(meta);
      const message = document.createElement('div'); message.className = 'record-message'; message.textContent = item.status;
      row.appendChild(message); logNode.appendChild(row);
    }
  }
  function status(text) {
    stateText = text;
    const level = statusLevel(text);
    log.push({time: new Date().toISOString(), status: text, level});
    if (log.length > 40) log.shift();
    renderStatus(); renderHistory();
    if (historyDetails && level === 'error') historyDetails.open = true;
  }
  function cleanup() {
    for (const key of GM_listValues()) {
      if (!key.startsWith(PREFIX)) continue;
      const stored = GM_getValue(key, null);
      if (!stored || !validTime(stored.expires)) GM_deleteValue(key);
    }
  }
  cleanup();
  function ready(fn) {
    if (document.body) return fn();
    const observer = new MutationObserver(() => { if (document.body) { observer.disconnect(); fn(); } });
    observer.observe(document, {childList: true, subtree: true});
  }
  function callbackPage() {
    const raw = location.href;
    let parsed, currentState;
    try {
      const url = new URL(raw);
      currentState = url.searchParams.get('state') || new URLSearchParams(url.hash.slice(1)).get('state');
      parsed = ChannelCore.callback(raw, currentState, CHANNEL.id);
    } catch (_) {
      status('未取得有效的' + CHANNEL.name + '授权回调，请回到三国杀官网重新发起登录。');
      ready(() => panel(true));
      return;
    }
    // Remove the OAuth code before the rest of the callback document loads resources.
    try { history.replaceState(null, '', location.pathname); } catch (_) {}
    const pending = GM_getValue(pendingKey(currentState), null);
    if (!pending || !validTime(pending.expires)) {
      status('这次授权已过期或原登录页已关闭，请回官网重新登录。');
      ready(() => panel(true));
      return;
    }
    const key = resultKey(currentState);
    GM_setValue(key, {state: currentState, code: parsed.code, expires: Date.now() + 30000});
    parsed = null;
    setTimeout(() => GM_deleteValue(key), 30000);
    status('已收到' + CHANNEL.name + '授权，请返回刚才的三国杀官网标签页。此页可以关闭。');
    ready(() => panel(true));
  }
  if (CALLBACK_CHANNEL) {
    callbackPage();
    return;
  }
  if (location.origin !== 'https://web.sanguosha.com') return;

  accounts = ChannelCore.createAccountStore({get: GM_getValue, set: GM_setValue, remove: GM_deleteValue, keys: GM_listValues}, () => Date.now(), randomId, CHANNEL.id);
  // Older builds kept a tab-scoped account snapshot even when saving was off.
  // Remove it unconditionally; opt-out state now lives only in this page's JS
  // memory and disappears on reload/navigation.
  try { sessionStorage.removeItem(LEGACY_TRANSIENT_PROFILE_KEY); } catch (_) {}
  try {
    const pendingAccount = JSON.parse(sessionStorage.getItem(PENDING_ACCOUNT_KEY) || 'null');
    sessionStorage.removeItem(PENDING_ACCOUNT_KEY);
    if (pendingAccount && pendingAccount.channelId === CHANNEL.id && validTime(pendingAccount.expires)) {
      const profile = accounts.get(String(pendingAccount.id || ''), CHANNEL.id);
      if (profile) {
        selectProfile(profile);
        pendingAutoLogin = pendingAccount.autoLogin ? pendingAccount : null;
        if (pendingAutoLogin?.saveLoginInfo === false) saveLoginInfo = false;
        stateText = pendingAutoLogin
          ? '已切换到' + CHANNEL.shortName + '，正在使用该账号最近一次登录方式…'
          : '已切换到' + CHANNEL.shortName + '并选中该账号；确认登录方式后点击“在当前窗口登录”。';
      }
    }
  } catch (_) {}
  function stableDirectKey(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }
  function installDirectHook() {
    try {
      unsafeWindow.__SGS_DIRECT_EVENT__ = event => {
        if (!event || typeof event !== 'object') return '';
        const eventToken = typeof event.clientToken === 'string' ? event.clientToken : '';
        if (active?.direct && eventToken && active.clientToken && eventToken !== active.clientToken) return '';
        if (event.type === 'ready') {
          if (!active?.direct) return '';
          const account = typeof event.account === 'string' ? event.account.trim().slice(0, 200) : '';
          if (!account) return '';
          const identityAccount = typeof event.identityAccount === 'string' ? event.identityAccount.trim().slice(0, 256) : '';
          const key = /^[A-Za-z0-9._:-]{1,200}$/.test(account) ? account : 'account-' + stableDirectKey(account);
          const id = /^[A-Za-z0-9._:-]{1,256}$/.test(identityAccount) ? identityAccount : CHANNEL.id + ':' + key;
          if (expectedProfileId && !sameAccountIdentity(expectedProfileId, id)) {
            status('授权账号与所选账号不一致，已停止接入。请先切换' + CHANNEL.name + '账号再重试。');
            active.controller.abort();
            return '';
          }
          const nickname = typeof event.nickname === 'string' && event.nickname.trim() ? event.nickname.trim().slice(0, 120) : account;
          const matchedId = expectedProfileId && sameAccountIdentity(expectedProfileId, id) ? expectedProfileId : id;
          const profile = rememberIdentity({id, nickname}, matchedId);
          if (!profile) return '';
          currentProfileId = expectedProfileId = profile.id;
          active.profileId = profile.id;
          try { directApi()?.bindProfile?.(profile.id, eventToken, saveLoginInfoEnabled()); } catch (_) {}
          rememberLoginMetadata(profile.id, profile.channelId, active);
          setAccountPhase('authorizing'); if (!profile.transient) selectProfile(profile);
          if (profile.transient) {
            try { sessionStorage.removeItem(ACCOUNT_CONTEXT); sessionStorage.removeItem('sgs-direct-profile-v1'); } catch (_) {}
          } else {
            sessionStorage.setItem(ACCOUNT_CONTEXT, profile.id);
            sessionStorage.setItem('sgs-direct-profile-v1', profile.id);
          }
          finishLoginSurface(active);
          heartbeat(); updateAccountHeading(); renderAccounts();
          status('已识别' + CHANNEL.name + '账号，正在准备进入游戏…'
            + (profile.transient ? '本次未保存账号或登录状态。' : '已保存可恢复登录状态。'));
          return profile.id;
        }
        if (event.type === 'navigate') {
          if (event.profileId && !transientProfileMatches(event.profileId, CHANNEL.id)) {
            sessionStorage.setItem('sgs-direct-profile-v1', event.profileId);
          } else {
            try { sessionStorage.removeItem('sgs-direct-profile-v1'); } catch (_) {}
          }
          return '';
        }
        if (event.type === 'game-auth') {
          const provider = typeof event.provider === 'string' ? event.provider : '';
          const accepted = provider === CHANNEL.id || (CHANNEL.id === 'wegame' && ['qq', 'wx'].includes(provider));
          if (!accepted) return '';
          const eventProfile = typeof event.profileId === 'string' ? profileById(event.profileId, CHANNEL.id) : null;
          const profile = eventProfile || profileById(currentProfileId || expectedProfileId || '', CHANNEL.id);
          if (!profile) return '';
          closeLoginPopup(active);
          if (event.success === false) {
            setAccountPhase('failed'); heartbeat(); renderAccounts();
            setLoginPanelCollapsed(false);
            status(CHANNEL.shortName + '游戏没有接受登录票据，请重新授权。');
            return '';
          }
          setAccountPhase('connected');
          setLoginPanelCollapsed(true);
          const changes = {
            lastLoginAt: Date.now(),
            ...(typeof event.serverId === 'string' && event.serverId ? {serverId: event.serverId} : {}),
            ...(typeof event.loginAccount === 'string' && event.loginAccount ? {loginAccount: event.loginAccount} : {}),
            ...(typeof event.channelAccount === 'string' && event.channelAccount ? {channelAccount: event.channelAccount} : {})
          };
          if (saveLoginInfoEnabled() && !transientProfileMatches(profile.id, profile.channelId)) {
            accounts.update(profile.id, changes, false, profile.channelId);
            selectProfile(accounts.get(profile.id, profile.channelId));
          } else updateTransientProfile(changes);
          heartbeat(); updateAccountHeading(); renderAccounts();
          status(CHANNEL.shortName + '登录票据已交给游戏，'
            + (saveLoginInfoEnabled() && !profile.transient
              ? '账号与可恢复登录状态已保存，可从账号管理直接再次登录。'
              : '本次未写入任何本地账号或可恢复登录状态。'));
          return '';
        }
        if (event.type === 'error') {
          if (active?.direct) status(directErrorText(event));
          return '';
        }
        if (event.type === 'cancel') {
          if (['superseded', 'cleanup'].includes(event.reason)) return '';
          if (active?.direct && (!active.clientToken || eventToken === active.clientToken)) {
            status('已取消' + CHANNEL.name + '扫码登录。');
          }
          return '';
        }
        return '';
      };
    } catch (_) {}
  }
  installDirectHook();
  try {
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.has(WINDOW_FRAGMENT)) {
      const nonce = fragment.get(WINDOW_FRAGMENT);
      const key = PREFIX + 'window:' + nonce;
      const entry = /^[a-f0-9]{32}$/.test(nonce || '') ? GM_getValue(key, null) : null;
      GM_deleteValue(key); sessionStorage.removeItem(LAUNCH); sessionStorage.removeItem(ACCOUNT_CONTEXT); sessionStorage.removeItem(OWNER_CONTEXT);
      history.replaceState(null, '', location.pathname + location.search);
      if (!entry || !validTime(entry.expires) || (entry.channelId && entry.channelId !== CHANNEL.id)
        || (entry.profileId && !accounts.get(entry.profileId))) {
        entryError = true; status('账号窗口入口已过期，请从账号列表重新打开。');
      } else {
        ownerName = typeof entry.ownerName === 'string' && OWNER_PATTERN.test(entry.ownerName) ? entry.ownerName : '';
        if (ownerName) sessionStorage.setItem(OWNER_CONTEXT, ownerName);
        if (entry.profileId) {
          expectedProfileId = entry.profileId;
          sessionStorage.setItem(ACCOUNT_CONTEXT, expectedProfileId);
          status('已绑定所选账号，请选择一种官方登录方式，在' + CHANNEL.name + '官方页面选择对应账号。');
        } else status('这是新的账号窗口，请选择一种官方登录方式添加账号。');
      }
    } else {
      const savedId = sessionStorage.getItem(ACCOUNT_CONTEXT);
      if (accounts.get(savedId)) expectedProfileId = savedId;
      else sessionStorage.removeItem(ACCOUNT_CONTEXT);
      const savedOwner = sessionStorage.getItem(OWNER_CONTEXT);
      if (typeof savedOwner === 'string' && OWNER_PATTERN.test(savedOwner)) ownerName = savedOwner;
    }
  } catch (_) { entryError = true; status('账号窗口初始化未完成，请从账号列表重新打开。'); }

  function profileName(profile) { return CHANNEL.windowPrefix + '-profile-' + profile.windowKey; }
  const activePhases = ['connected', 'loading', 'authorizing'];
  function setAccountPhase(phase) { accountPhase = phase; phaseStartedAt = Date.now(); }
  function heartbeat() {
    const id = currentProfileId || expectedProfileId;
    if (['connected', 'disconnected'].includes(accountPhase)) {
      try {
        const connected = ChannelCore.connectionState(CHANNEL.id);
        if (connected === false && accountPhase === 'connected') setAccountPhase('disconnected');
        else if (connected === true && accountPhase === 'disconnected') setAccountPhase('connected');
      } catch (_) {}
    }
    if (['loading', 'authorizing'].includes(accountPhase) && Date.now() - phaseStartedAt > 120000) setAccountPhase('failed');
    if (id && accounts.get(id)) accounts.beat(instanceId, id, accountPhase, ownerName);
  }
  function probeAccountWindows(id, signal) {
    const candidates = accounts.live(id, instanceId, CHANNEL.id).filter(item => activePhases.includes(item.phase));
    if (!candidates.length) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      const nonce = randomId(), key = PREFIX + 'presence-ack:' + nonce;
      const candidatesById = new Set(candidates.map(item => item.instance));
      let done = false;
      const finish = (present, cancelled = false) => {
        if (done) return; done = true;
        clearTimeout(timer); GM_removeValueChangeListener(listener); GM_deleteValue(key);
        for (const item of candidates) GM_deleteValue(PREFIX + 'presence:' + item.instance);
        if (signal) signal.removeEventListener('abort', abort);
        if (cancelled) reject(new Error('已取消')); else resolve(present);
      };
      const abort = () => finish(false, true);
      const listener = GM_addValueChangeListener(key, (_key, _old, response) => {
        if (!response || !validTime(response.expires) || response.profileId !== id || !candidatesById.has(response.instance)) return;
        if (activePhases.includes(response.phase)) finish(true);
      });
      const timer = setTimeout(() => finish(false), 1200);
      if (signal) { signal.addEventListener('abort', abort, {once: true}); if (signal.aborted) return abort(); }
      for (const item of candidates) GM_setValue(PREFIX + 'presence:' + item.instance, {reply: nonce, expires: Date.now() + 10000});
    });
  }
  function updateAccountHeading() {
    if (!accounts) return;
    const profile = profileById(currentProfileId || expectedProfileId);
    if (currentAccountNode) currentAccountNode.textContent = profile
      ? (accountPhase === 'connected' ? '当前账号：' : '待登录账号：') + accounts.label(profile) : '当前窗口未绑定账号';
    if (profile) {
      document.title = '[' + CHANNEL.shortName + ' · ' + accounts.label(profile).slice(0, 24) + '] 三国杀一将成名';
      if (!/^\/10\/pc\//.test(location.pathname)) { try { window.name = profileName(profile); } catch (_) {} }
    } else {
      if (/^\[[^\]]+\]\s*/.test(document.title)) document.title = document.title.replace(/^\[[^\]]+\]\s*/, '');
      if (!/^\/10\/pc\//.test(location.pathname)) { try { window.name = ownerName; } catch (_) {} }
    }
  }
  function syncGameAccount() {
    const id = currentProfileId || expectedProfileId;
    if (!accounts || !id || !/^\/(?:x|10|10th|login)\/pc\//.test(location.pathname)) return;
    let self, user;
    try {
      self = unsafeWindow.AccountInfo?.Self || unsafeWindow.AccountInfo?.self || null;
      user = unsafeWindow.UserData?.Self || null;
    } catch (_) { return; }
    if (!self && !user) return;
    const profile = profileById(id, CHANNEL.id);
    if (!profile) return;
    const changes = {};
    const set = (field, value, max = 120) => {
      if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) return;
      const clean = String(value).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max);
      if (clean && profile[field] !== clean) changes[field] = clean;
    };
    set('serverId', self?.SeverID || self?.ServerID || self?.server_id, 64);
    set('roleId', self?.UserId || self?.UserID, 80);
    set('roleName', user?.Nickname || user?.NickName || self?.UserName, 120);
    set('loginAccount', self?.Account, 256);
    set('channelAccount', self?.ChannelAccount, 256);
    if (!Object.keys(changes).length) return;
    let updated = null;
    if (saveLoginInfoEnabled() && !transientProfileMatches(id, CHANNEL.id)) {
      updated = accounts.update(id, changes, false, CHANNEL.id);
    } else updateTransientProfile(changes);
    if (updated && (!selectedProfileId || selectedProfileChannelId === CHANNEL.id)) selectProfile(updated);
    updateAccountHeading(); renderAccounts();
  }
  function findOwnedWindow(profile) {
    const cached = linkedWindows.get(profile.id);
    if (cached && !cached.closed) return cached;
    for (const child of ownedWindows) {
      if (child.closed) { ownedWindows.delete(child); continue; }
      try {
        if (child.name === profileName(profile) || child.sessionStorage.getItem(ACCOUNT_CONTEXT) === profile.id) {
          linkedWindows.set(profile.id, child); return child;
        }
      } catch (_) {}
    }
    return null;
  }
  function requestExistingWindow(live) {
    const nonce = randomId(), key = PREFIX + 'focus-ack:' + nonce;
    let complete = false;
    const finish = text => {
      if (complete) return;
      complete = true; clearTimeout(timer); GM_removeValueChangeListener(listener); GM_deleteValue(key); status(text);
    };
    const listener = GM_addValueChangeListener(key, (_key, _old, response) => {
      if (!response || !validTime(response.expires)) return;
      finish(response.focused ? '已返回原账号窗口。' : '原窗口已收到请求，但浏览器没有切换焦点。请从浏览器标签或任务栏切到原窗口；新版创建的账号窗口可直接返回。');
    });
    const timer = setTimeout(() => finish('未能定位原窗口。若它已关闭或掉线，可选择登录方式重新授权。'), 2000);
    for (const record of live) if (record.instance) GM_setValue(PREFIX + 'focus:' + record.instance, {expires: Date.now() + 10000, reply: nonce});
    status('正在请求原账号窗口显示…');
  }
  function focusOwnedWindow(child) {
    try {
      child.focus();
      status('已请求切回原账号窗口；若浏览器未切换，请从标签或任务栏选择该窗口。');
    } catch (_) { status('原窗口暂时无法访问，请从标签或任务栏切回；关闭后可重新打开。'); }
  }
  function bindProfileToCurrentWindow(profile, force = false) {
    if (!profile || profile.channelId !== CHANNEL.id) return false;
    const boundId = currentProfileId || expectedProfileId;
    if (boundId && boundId !== profile.id && consumedLaunch && !['failed', 'disconnected'].includes(accountPhase)) {
      status('当前窗口已登录另一个' + CHANNEL.shortName + '账号；请回到官网登录页后再切换。');
      return false;
    }
    if (boundId !== profile.id || force) {
      currentProfileId = null;
      setAccountPhase('waiting');
      consumedLaunch = false;
    }
    expectedProfileId = profile.id;
    selectProfile(profile);
    try { sessionStorage.setItem(ACCOUNT_CONTEXT, profile.id); } catch (_) {}
    heartbeat(); updateAccountHeading(); renderAccounts(true);
    return true;
  }
  function prepareCurrentWindowForNewAccount() {
    currentProfileId = expectedProfileId = null;
    consumedLaunch = false;
    clearTransientProfile();
    setAccountPhase('waiting');
    try { sessionStorage.removeItem(ACCOUNT_CONTEXT); sessionStorage.removeItem(LAUNCH); } catch (_) {}
    GM_deleteValue(CHANNEL.accountPrefix + 'live:' + instanceId);
    updateAccountHeading(); renderAccounts(true);
  }
  function loginMethodSummary() {
    const methods = [];
    for (const option of CHANNEL.loginOptions) {
      if (option.kind === 'disabled') continue;
      const label = option.mode === 'browser' || ['portal', 'official'].includes(option.kind) ? '官方网页登录'
        : option.kind === 'oauth' ? '官方授权页' : '扫码';
      if (!methods.includes(label)) methods.push(label);
    }
    return methods.join(' / ');
  }
  function preferredLoginOption(profile, hint = {}) {
    const owner = profileChannel(profile);
    const available = owner.loginOptions.filter(option => option.kind !== 'disabled');
    if (!available.length) return null;
    const optionId = hint.optionId || profile?.lastLoginOption;
    const providerName = hint.provider || profile?.lastLoginProvider;
    const byId = optionId ? available.find(option => option.id === optionId) : null;
    if (byId) return byId;
    if (providerName) {
      const byProvider = available.find(option => directProvider(option) === providerName);
      if (byProvider) return byProvider;
    }
    return available.find(option => option.kind === 'direct' && option.mode !== 'browser') ||
      available.find(option => option.kind === 'direct') || available[0];
  }
  function loginOptionMethod(option) {
    if (!option || option.kind === 'disabled') return '';
    if (option.kind === 'oauth') return '官方授权';
    if (option.mode === 'browser' || ['portal', 'official'].includes(option.kind)) return '官方网页';
    return '扫码';
  }
  function lastLoginOptionLabel(profile) {
    const option = preferredLoginOption(profile);
    return option?.label || profile?.lastLoginMethod || '尚未记录';
  }
  function revealLoginOptions() {
    if (!panelContent || !loginOptionsNode) return;
    const optionRect = loginOptionsNode.getBoundingClientRect();
    const contentRect = panelContent.getBoundingClientRect();
    const statusRect = statusCard?.getBoundingClientRect();
    const safeTop = statusRect && statusRect.height
      ? Math.max(contentRect.top, statusRect.bottom + 8) : contentRect.top;
    const safeBottom = contentRect.bottom - 10;
    let delta = 0;
    if (optionRect.top < safeTop) delta = optionRect.top - safeTop;
    else if (optionRect.bottom > safeBottom) delta = optionRect.bottom - safeBottom;
    if (Math.abs(delta) > 1) {
      panelContent.scrollTo({top: Math.max(0, panelContent.scrollTop + delta), behavior: 'smooth'});
    }
  }
  function startAccountInCurrentWindow(profile, options = {}) {
    const option = preferredLoginOption(profile);
    if (!option) return status('已绑定所选账号，但当前渠道没有可用的浏览器登录方式。');
    showPanel();
    revealLoginOptions();
    return beginSavedLogin(profile, {force: !!options.force, automatic: !!options.automatic});
  }
  function resumePendingAutoLogin() {
    const pending = pendingAutoLogin;
    pendingAutoLogin = null;
    if (!pending?.autoLogin) return;
    const profile = accounts?.get(String(pending.id || ''), CHANNEL.id);
    if (!profile) {
      status('已切换到' + CHANNEL.shortName + '，但本地账号记录不存在；请选择一种官方登录方式重新添加。');
      return;
    }
    const option = preferredLoginOption(profile, pending);
    if (!option) {
      status('已切换到' + CHANNEL.shortName + '并选中' + accounts.label(profile) + '，但当前渠道没有可用的登录方式。');
      return;
    }
    showPanel();
    revealLoginOptions();
    status('正在恢复' + accounts.label(profile) + '的本地登录状态…');
    const result = beginSavedLogin(profile, {force: true, automatic: true,
      optionId: pending.optionId || '', provider: pending.provider || ''});
    if (result && typeof result.catch === 'function') {
      result.catch(error => status(error instanceof Error ? error.message : '自动登录未完成，请重试。'));
    }
  }
  function openNewAccountWindow() {
    const name = CHANNEL.windowPrefix + '-add-' + randomId();
    const child = window.open('', name, 'width=1280,height=850,resizable=yes,scrollbars=yes');
    if (!child) return status('浏览器拦截了账号窗口，请允许官网弹出窗口后重试。');
    try {
      if (child.location.href && child.location.href !== 'about:blank') { ownedWindows.add(child); return focusOwnedWindow(child); }
    } catch (_) { return focusOwnedWindow(child); }
    const nonce = randomId();
    if (!OWNER_PATTERN.test(window.name || '')) window.name = CHANNEL.windowPrefix + '-manager-' + instanceId;
    GM_setValue(PREFIX + 'window:' + nonce, {channelId: CHANNEL.id, profileId: null, ownerName: window.name, expires: Date.now() + 600000});
    ownedWindows.add(child);
    child.location.replace(LOGIN_PAGE + '#' + WINDOW_FRAGMENT + '=' + nonce);
    status('账号窗口已打开；请在新窗口完成' + CHANNEL.name + '官方授权。');
  }
  function openAccountWindow(target = null) {
    if (!isBrowserChannel) return status(CHANNEL.reason);
    const profile = target && typeof target === 'object' ? target
      : target ? accounts.get(String(target), selectedProfileChannelId) : null;
    if (profile && profile.channelId !== CHANNEL.id) {
      const option = preferredLoginOption(profile);
      switchChannel(profile.channelId, {accountId: profile.id, autoLogin: true,
        optionId: option?.id || '', provider: profile.lastLoginProvider || '', saveLoginInfo});
      return;
    }
    const id = profile?.id || null;
    if (id && !profile) return status('该账号记录已移除，请刷新账号列表。');
    if (id) {
      if ((currentProfileId || expectedProfileId) === id) {
        showPanel();
        if (!consumedLaunch || ['failed', 'disconnected'].includes(accountPhase)) {
          return startAccountInCurrentWindow(profile, {force: true});
        }
        return status('这里就是该账号当前的游戏窗口。');
      }
      const live = accounts.live(id, instanceId, CHANNEL.id);
      const liveActive = live.some(record => ['connected', 'loading', 'authorizing'].includes(record.phase));
      if (liveActive) {
        const held = findOwnedWindow(profile);
        if (held) return focusOwnedWindow(held);
        // An unrelated/old window cannot always be activated by a userscript. Never flash a blank window as a probe.
        if (!live.some(record => record.ownerName && record.ownerName === window.name)) return requestExistingWindow(live);
      }
      // This is an explicit account-management action. It must replace the
      // current account binding instead of silently refusing because another
      // account was used earlier in this tab.
      return startAccountInCurrentWindow(profile, {force: true});
    }
    if (consumedLaunch && !['failed', 'disconnected'].includes(accountPhase)) return openNewAccountWindow();
    prepareCurrentWindowForNewAccount();
    showPanel();
    status('当前窗口已准备好添加' + CHANNEL.name + '账号，请选择一种官方登录方式。');
  }
  function renderAccounts(force = false) {
    if (!accountsView || !accounts) return;
    const profiles = accounts.profiles(true);
    const channelCount = new Set(profiles.map(profile => profile.channelId)).size;
    if (accountCountNode) accountCountNode.textContent = profiles.length + ' 个账号 · ' + channelCount + ' 个渠道';
    accountsView.hidden = !profiles.length;
    if (accountActionsNode) accountActionsNode.hidden = !profiles.length;
    const data = profiles.map(profile => ({profile, channel: profileChannel(profile),
      live: accounts.live(profile.id, '', profile.channelId).map(item => item.phase)}));
    let selected = data.find(item => item.profile.id === selectedProfileId && item.profile.channelId === selectedProfileChannelId);
    if (!selected) selected = data.find(item => item.profile.channelId === CHANNEL.id && item.profile.id === (currentProfileId || expectedProfileId)) || data[0] || null;
    selectProfile(selected?.profile || null);
    if (!selected) {
      editingProfileId = removingProfileId = inspectingProfileId = null;
    }
    const fingerprint = JSON.stringify({data: data.map(item => ({ref: accounts.ref(item.profile), profile: item.profile, live: item.live})),
      selected: selected ? accounts.ref(selected.profile) : '', currentProfileId, expectedProfileId, accountPhase, consumedLaunch, busy: !!active});
    if (!force && fingerprint === accountFingerprint) return;
    accountFingerprint = fingerprint; accountsView.replaceChildren();
    accountsView.disabled = !profiles.length;
    profileChoices.clear();
    const groups = new Map();
    for (const item of data) {
      if (!groups.has(item.profile.channelId)) groups.set(item.profile.channelId, []);
      groups.get(item.profile.channelId).push(item);
    }
    for (const [channelId, items] of groups) {
      const owner = ChannelRegistry.get(channelId);
      const group = document.createElement('optgroup'); group.label = (owner?.name || channelId) + ' · ' + items.length + ' 个账号';
      for (const {profile, live} of items) {
        const ref = accounts.ref(profile); if (!ref) continue;
        const option = document.createElement('option'); option.value = ref;
        const state = live.includes('connected') ? '游戏已打开' : live.includes('disconnected') ? '连接已断开' : live.length ? '待登录' : '未打开';
        const role = profile.roleName && profile.roleName !== accounts.label(profile) ? ' · ' + profile.roleName : '';
        const zone = profile.serverId ? ' · 区服 ' + profile.serverId : ' · 区服待返回';
        option.textContent = accounts.label(profile) + role + zone + ' · ' + state;
        option.selected = selected?.profile.id === profile.id && selected?.profile.channelId === profile.channelId;
        group.appendChild(option); profileChoices.set(ref, {id: profile.id, channelId: profile.channelId});
      }
      accountsView.appendChild(group);
    }
    accountsView.value = selected ? accounts.ref(selected.profile) : '';
    const profile = selected?.profile || null;
    const owner = profileChannel(profile);
    accountEdit.disabled = accountRemove.disabled = !profile;
    accountInspect.disabled = !profile;
    accountDetails.hidden = !profile || inspectingProfileId !== selectedProfileId;
    accountDetailsText.value = profile ? [
      '所选账号：' + accounts.label(profile),
      '所属渠道：' + owner.name + '（游戏渠道号 ' + (owner.gameChannelId || '未配置') + '）',
      '游戏账号标识：' + profile.id,
      '游戏接入账号（account）：' + (profile.loginAccount || '尚未读取，请用新版重新授权一次'),
      owner.name + '游戏昵称：' + (profile.nickname || '未返回'),
      '角色名：' + (profile.roleName || '等待游戏返回'),
      '游戏用户 ID：' + (profile.roleId || '等待游戏返回'),
      '区服：' + (profile.serverId || '等待游戏返回'),
      '最近登录方式：' + lastLoginOptionLabel(profile),
      '最近登录：' + (profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString('zh-CN', {hour12: false}) : '尚未确认')
    ].join('\n') : '';
    accountEditor.hidden = !profile || editingProfileId !== selectedProfileId;
    accountRemove.textContent = removingProfileId === selectedProfileId && profile ? '确认移除所选记录' : '移除记录';
    accountOpen.disabled = !profile;
    accountOpen.textContent = '打开账号窗口';
    if (profile) {
      const live = accounts.live(profile.id, '', profile.channelId);
      const liveActive = live.some(item => ['connected', 'loading', 'authorizing'].includes(item.phase));
      const own = profile.channelId === CHANNEL.id && (currentProfileId || expectedProfileId) === profile.id;
      accountOpen.textContent = profile.channelId !== CHANNEL.id ? '切换到' + owner.shortName + '并直接登录'
        : own ? (active ? '正在登录…' : consumedLaunch && !['failed', 'disconnected'].includes(accountPhase) ? '当前游戏窗口'
          : '直接登录所选账号')
        : liveActive ? '返回已有窗口' : '直接登录所选账号';
      accountOpen.disabled = own && (!!active || (consumedLaunch && !['failed', 'disconnected'].includes(accountPhase)));
      const recent = profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString('zh-CN', {hour12: false}) : '尚未确认游戏登录';
      accountInfo.textContent = '已选：' + accounts.label(profile) + '\n' + (profile.roleName ? '角色：' + profile.roleName + ' · ' : '')
        + profileZone(profile) + ' · 账号尾号 ' + profile.id.slice(-4) + '\n最近登录方式：' + lastLoginOptionLabel(profile)
        + '\n最近登录：' + recent;
    } else accountInfo.textContent = '还没有账号。添加并完成一次授权后，会自动出现在这里。';
    updateAccountHeading();
  }
  const focusListener = GM_addValueChangeListener(PREFIX + 'focus:' + instanceId, (_key, _old, request) => {
    if (!request || !validTime(request.expires)) return;
    GM_deleteValue(PREFIX + 'focus:' + instanceId); showPanel(); window.focus();
    if (/^[a-f0-9]{32}$/.test(request.reply || '')) setTimeout(() => {
      GM_setValue(PREFIX + 'focus-ack:' + request.reply, {expires: Date.now() + 10000, focused: document.hasFocus()});
    }, 100);
  });
  const presenceListener = GM_addValueChangeListener(PREFIX + 'presence:' + instanceId, (_key, _old, request) => {
    if (!request || !validTime(request.expires) || !/^[a-f0-9]{32}$/.test(request.reply || '')) return;
    GM_deleteValue(PREFIX + 'presence:' + instanceId); heartbeat();
    GM_setValue(PREFIX + 'presence-ack:' + request.reply, {instance: instanceId, profileId: currentProfileId || expectedProfileId, phase: accountPhase, expires: Date.now() + 10000});
  });
  const accountRefresh = setInterval(() => { heartbeat(); renderAccounts(); }, 15000);
  const gameAccountRefresh = setInterval(syncGameAccount, 2000);
  window.addEventListener('focus', () => renderAccounts());
  heartbeat();

  // Read and delete the one-navigation handoff synchronously, before official game initialization.
  if (location.pathname === '/x/pc/index.php') {
    let saved;
    try {
      const raw = sessionStorage.getItem(LAUNCH);
      sessionStorage.removeItem(LAUNCH);
      if (raw) saved = JSON.parse(raw);
      if (saved && validTime(saved.expires)) {
        if ((saved.channelId && saved.channelId !== CHANNEL.id) || !saved.args || saved.args.channel_id !== CHANNEL.bridge?.channelId) throw new Error('启动参数渠道不匹配');
        if (saved.profileId && (!profileById(saved.profileId, CHANNEL.id) || (expectedProfileId && saved.profileId !== expectedProfileId))) throw new Error('账号窗口绑定不匹配');
        currentProfileId = saved.profileId || null;
        selectedProfileId = currentProfileId; selectedProfileChannelId = CHANNEL.id;
        if (currentProfileId) { expectedProfileId = currentProfileId; sessionStorage.setItem(ACCOUNT_CONTEXT, currentProfileId); }
        setAccountPhase('loading'); heartbeat();
        // The bridge is late-safe: /x/pc may have created its CHATOL
        // placeholder before this userscript ran. Continue and take over the
        // grant instead of dropping a valid one-use login at readyState=complete.
        ChannelCore.installBridge(unsafeWindow, saved.args, (kind, extra = {}) => {
          if (kind === 'auth-result') {
            if (extra.code === 0) {
              setAccountPhase('connected');
              if (currentProfileId) {
                if (saveLoginInfoEnabled() && !transientProfileMatches(currentProfileId, CHANNEL.id)) accounts.update(currentProfileId, {lastLoginAt: Date.now()});
                else updateTransientProfile({lastLoginAt: Date.now()});
              }
              heartbeat();
            }
            else { setAccountPhase('failed'); heartbeat(); }
            status(extra.code === 0 ? '游戏服务器认证成功，正在加载角色…' : Number.isFinite(extra.code) ? '游戏服务器返回错误码 ' + extra.code : '游戏认证响应已到达，请以实际画面为准。');
            renderAccounts();
          }
          if (kind === 'user-data') {
            if (currentProfileId) {
              const changes = {roleName: extra.roleName, roleId: extra.roleId, serverId: extra.serverId};
              if (saveLoginInfoEnabled() && !transientProfileMatches(currentProfileId, CHANNEL.id)) accounts.update(currentProfileId, changes);
              else updateTransientProfile(changes);
            }
            updateAccountHeading(); renderAccounts(); status('已收到' + CHANNEL.shortName + '角色数据，正在进入大厅…');
          }
          if (kind === 'enter-scene') status('已收到进入游戏场景通知，请核对原' + CHANNEL.shortName + '角色／大厅。');
          if (kind === 'game-code' && extra.hooks.some(item => !item)) status('游戏已更新，部分状态提示无法读取；请以实际画面为准。');
        }, CHANNEL.id);
        consumedLaunch = true;
        status(CHANNEL.shortName + '启动参数已接入，正在加载官网电脑端游戏…');
      }
    } catch (error) { setAccountPhase('failed'); heartbeat(); status(error.message === '脚本启动偏晚，请重新登录并检查油猴注入设置' ? error.message : CHANNEL.shortName + '接入初始化失败，请重新授权；若重复出现，请导出诊断。'); }
    saved = null;
  } else if (location.pathname === '/10/pc/index.php' || location.pathname === '/10/pc/bilibiliWD_index.php') {
    // The embedded direct engine owns this navigation handoff. Read only the
    // stable local account id it passes through tab-scoped storage.
    let directProfile = '';
    try { directProfile = sessionStorage.getItem('sgs-direct-profile-v1') || ''; }
    catch (_) {}
    if (directProfile) {
      try { sessionStorage.removeItem('sgs-direct-profile-v1'); } catch (_) {}
      const directAccount = profileById(directProfile, CHANNEL.id);
      if (directAccount) {
        currentProfileId = expectedProfileId = directProfile;
        if (!directAccount.transient) selectProfile(directAccount);
        sessionStorage.setItem(ACCOUNT_CONTEXT, directProfile);
        // The embedded engine already owns this one-use grant. Mark it as
        // consumed so the manager cannot start a second authorization loop.
        consumedLaunch = true;
        setAccountPhase('loading'); heartbeat();
      }
    }
  } else {
    // Expired credentials are never reused by a later visit.
    sessionStorage.removeItem(LAUNCH);
  }
  function busy(value) {
    if (channelSelect) channelSelect.disabled = value;
    for (const item of loginOptionButtons) item.button.disabled = value || !isBrowserChannel || item.option.kind === 'disabled';
    if (!loginOptionButtons.length) {
      if (loginButton) loginButton.disabled = true;
      if (alternateLoginButton) alternateLoginButton.disabled = true;
    }
    if (retryLoginButton) retryLoginButton.hidden = value || !duplicateRetry;
    if (cancelButton) cancelButton.hidden = !value;
    if (importArea) importArea.hidden = !value || !isBrowserChannel;
    if (addAccountButton) addAccountButton.disabled = value || !isBrowserChannel || !CHANNEL.protocol;
    if (switchAccountButton) switchAccountButton.disabled = value || !isBrowserChannel || !ChannelCore.switchAccount(CHANNEL.id);
    if (value && qrNode) { qrNode.hidden = true; qrImage?.removeAttribute('src'); }
    renderAccounts(true);
  }
  function directApi() {
    try { return unsafeWindow.__JND_UNIFIED_LOGIN || null; } catch (_) { return null; }
  }
  function wait(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
  async function waitDirectApi(signal) {
    for (let index = 0; index < 100; index += 1) {
      if (signal?.aborted) throw new Error('已取消');
      const api = directApi();
      if (api && typeof api.start === 'function') return api;
      await wait(100);
    }
    throw new Error('扫码登录引擎尚未加载，请刷新官网页面后重试');
  }
  function directProvider(option) { return option.provider || CHANNEL.id; }
  function directErrorText(error) {
    const code = String(error?.code || error?.message || '');
    const stage = String(error?.stage || '');
    if (/LOGIN_CANCELLED/.test(code)) return '已取消';
    if (/LOGIN_FLOW_EXPIRED/.test(code) || stage === 'expiry') {
      return '本次登录流程已超时；账号记录仍保留，请重新发起登录。';
    }
    if (error?.reauthRequired) {
      return '本机保存的登录状态已失效，但账号记录仍保留；请重新完成一次官方授权后再直接登录。';
    }
    if (/SAVED_SESSION_(?:NOT_FOUND|EXPIRED|INVALID)/.test(code)) {
      return '本机保存的登录状态需要重新验证；账号记录仍保留，请完成一次官方授权。';
    }
    if (/ENTRY_UI_BUSY/.test(code)) return '登录界面正在切换，请稍后重试';
    if (/OTHER_TAB_ACTIVE/.test(code)) return '另一个窗口正在登录，请先完成或关闭它';
    if (/QR_EXPIRED/.test(code)) return CHANNEL.name + '二维码已过期，请重新发起';
    if (/STEAM_BROWSER_TIMEOUT/.test(code)) return '等待 Steam 官方登录超时，请重新打开官方登录窗口';
    if (/STEAM_(?:PAGE_RESULT_INVALID|PAGE_RESULT_EXPIRED|STATE_MISMATCH|CALLBACK_INVALID)/.test(code)) {
      return 'Steam 官方回调校验失败，本次授权已拒绝；请重新登录';
    }
    if ((/REQUEST_TIMEOUT|NETWORK_ERROR/.test(code)) && /^steam_/.test(stage)) {
      return '无法连接 Steam 官方接口，请确认浏览器能打开 store.steampowered.com，或检查网络/代理后重试';
    }
    if (/WX_QR_EXPIRED/.test(code)) return '微信二维码已过期，请重新发起';
    if (/WX_(?:CALLBACK_INVALID|APPLICATION_MISMATCH|STATE_MISMATCH|CODE_MISSING|POLL_RESPONSE_CHANGED)/.test(code)) {
      return '微信授权回调格式异常，请重新扫码';
    }
    if (/REQUEST_TIMEOUT|NETWORK_ERROR/.test(code)) return CHANNEL.name + '官方接口连接超时，请重试';
    if (/ACCOUNT_MISMATCH/.test(code)) return '扫码账号与当前账号不一致，已停止接入';
    if (/CAPTCHA/.test(code)) return '渠道要求人工验证，请在官方验证窗口中完成后再试';
    if (/VIVO_BROWSER_TIMEOUT/.test(code)) return '等待' + CHANNEL.name + '官方登录超时，请重新打开登录窗口';
    if (/VIVO_ACCOUNT_SELECTION_REQUIRED/.test(code)) return CHANNEL.name + '账号有多个子账号，无法自动判断；请先在官方页面明确选择后重试';
    if (/VIVO_REAL_NAME_REQUIRED/.test(code)) return CHANNEL.name + '账号未完成实名认证或当前状态不允许登录';
    if (/NATIVE_CONFIRMATION_REQUIRED/.test(code)) return CHANNEL.name + '要求原生客户端或未成年人确认，浏览器无法继续';
    if (/REJECTED/.test(code)) return CHANNEL.name + '官方接口拒绝了本次登录，请重试或改用官方账号页';
    const detail = code ? '（' + code + (stage ? ' · ' + stage : '') + '）' : '';
    return CHANNEL.name + '登录未完成' + detail + '，请重试或导出诊断';
  }
  function savedLoginProvider(profile, hint = {}) {
    const option = preferredLoginOption(profile, hint);
    // Older WeGame records could store the channel id (`wegame`) instead of
    // the session provider (`qq` / `wx`). Resolve through the selected login
    // option so account restoration always looks up the provider-keyed record.
    return String((option ? directProvider(option) : '') || hint.provider || profile?.lastLoginProvider || CHANNEL.id);
  }
  async function beginSavedLogin(profile, options = {}) {
    if (active) return status('已有登录流程正在进行，请先完成或取消。');
    if (!isBrowserChannel || !profile) return status('所选账号当前不可直接登录。');
    if (entryError) return status('账号窗口入口已过期，请刷新官网登录页后重试。');
    if (!bindProfileToCurrentWindow(profile, !!options.force)) return false;
    const provider = savedLoginProvider(profile, options);
    const option = preferredLoginOption(profile, {...options, provider});
    const context = {direct: true, browser: false, automatic: !!options.automatic,
      provider, profileId: profile.id, clientToken: randomId(),
      loginOptionId: option?.id || profile.lastLoginOption || '', loginProvider: provider,
      loginMethod: '已保存的官方登录状态', controller: new AbortController(),
      unsub: null, popup: null, lastDirectText: '', resume: true};
    active = context; busy(true);
    try {
      const api = await waitDirectApi(context.controller.signal);
      if (context.controller.signal.aborted) throw new Error('已取消');
      if (typeof api.resume !== 'function') throw new Error('当前登录引擎不支持账号直登，请刷新页面后重试');
      context.unsub = api.subscribe(snapshot => {
        if (active !== context) return;
        renderDirectSnapshot(snapshot);
        if (snapshot?.error) context.directError = snapshot.error;
      });
      status('正在恢复' + accounts.label(profile) + '的本地官方登录状态…');
      const resumed = await api.resume({profileId: profile.id, provider, required: true,
        clientToken: context.clientToken, saveSession: saveLoginInfoEnabled()});
      if (context.controller.signal.aborted) throw new Error('已取消');
      if (!resumed) throw new Error('SAVED_SESSION_NOT_FOUND');
      if (context.directError) throw new Error(directErrorText(context.directError));
      const snapshot = api.get ? api.get() : null;
      if (snapshot?.error) throw new Error(directErrorText(snapshot.error));
      if (snapshot?.provider) context.loginProvider = snapshot.provider;
      rememberLoginMetadata(profile.id, profile.channelId, context);
      context.loginCompleted = true;
      context.entered = true;
      setLoginPanelCollapsed(true);
      status('登录状态已恢复，正在直接进入游戏…');
      if (typeof api.enter !== 'function') throw new Error('登录引擎未提供进入游戏接口');
      await api.enter();
    } catch (error) {
      if (active === context) {
        const message = error instanceof Error ? error.message : '';
        const directFailure = {code: error?.code, stage: error?.stage,
          reauthRequired: !!error?.reauthRequired, message};
        setLoginPanelCollapsed(false);
        status(directFailure.reauthRequired || /^SAVED_SESSION_/.test(message) || /^本机没有可用/.test(message)
          ? directErrorText(directFailure) : (message || '账号直登未完成，请重新验证一次。'));
        revealLoginOptions();
      }
    } finally {
      context.controller.abort();
      if (context.unsub) { try { context.unsub(); } catch (_) {} }
      try { if (active === context && !context.entered) directApi()?.cancel?.(context.clientToken, 'cleanup'); } catch (_) {}
      if (active === context) {
        if (qrNode) qrNode.hidden = true;
        if (qrImage) qrImage.removeAttribute('src');
        active = null; busy(false);
      }
    }
  }
  function renderDirectSnapshot(snapshot) {
    if (!snapshot) return;
    if (snapshot.qr && /^data:image\//.test(snapshot.qr)) {
      qrImage.src = snapshot.qr; qrImage.hidden = false; qrNode.hidden = false;
      if (qrCaption) {
        qrCaption.replaceChildren();
        const title = document.createElement('strong'); title.textContent = '请使用手机扫码';
        const body = document.createElement('span'); body.textContent = snapshot.text || '扫码并在手机上确认登录。';
        qrCaption.append(title, body);
      }
    } else if (qrNode) {
      qrNode.hidden = true; qrImage?.removeAttribute('src');
    }
    if (snapshot.error) { status(directErrorText(snapshot.error)); return; }
    if (snapshot.text && snapshot.text !== active?.lastDirectText) {
      if (active) active.lastDirectText = snapshot.text;
      status(snapshot.text);
    }
  }
  function closeLoginPopup(context = active) {
    if (!context?.popup) return false;
    const popup = context.popup;
    context.popup = null;
    if (context.popupWatch) {
      clearInterval(context.popupWatch);
      context.popupWatch = null;
    }
    try { popup.close(); } catch (_) {}
    return true;
  }
  function watchLoginPopup(context, message, resultKeys = []) {
    if (!context.popup) return;
    const popup = context.popup;
    let closedAt = 0;
    context.popupWatch = setInterval(() => {
      if (active !== context || context.entered || context.loginCompleted || context.codeReceived ||
        context.controller.signal.aborted) return;
      let closed = false;
      try { closed = !!popup.closed; } catch (_) {}
      if (!closed) { closedAt = 0; return; }
      if (!closedAt) { closedAt = Date.now(); return; }
      if (Date.now() - closedAt < 1800) return;
      for (const key of resultKeys) {
        try { if (GM_getValue(key, null)) return; } catch (_) {}
      }
      if (context.direct) {
        try {
          const snapshot = directApi()?.get?.();
          // The official page may close itself after handing the result to the
          // engine. Only a popup closed while the engine still waits for that
          // browser login is a cancellation.
          if (snapshot?.busy && !['vivo_browser_login', 'oppo_browser_login', 'steam_browser_login'].includes(snapshot.stage)) return;
        } catch (_) {}
      }
      context.popupClosed = true;
      try { context.controller.abort(); } catch (_) {}
      try { if (context.direct) directApi()?.cancel(context.clientToken); } catch (_) {}
      status(message);
    }, 700);
  }
  async function beginDirect(option, runOptions = {}) {
    if (active) return;
    if (!isBrowserChannel) return status(CHANNEL.reason);
    if (entryError) return status('账号窗口入口已过期，请从账号列表重新打开。');
    duplicateRetry = null;
    const browserMode = option.mode === 'browser';
    const browserNonce = browserMode ? randomId() : '';
    // Steam's OAuth round-trip can rewrite window.name. Sharing one opaque
    // nonce with state lets the callback page recover the result key safely.
    const browserState = browserMode && CHANNEL.id === 'steam' ? browserNonce : '';
    const vivoNonce = CHANNEL.id === 'vivo' && browserNonce ? browserNonce : '';
    if (vivoNonce) {
      try { GM_setValue(VIVO_PENDING_NONCE_KEY, {nonce: vivoNonce, expires: Date.now() + 15 * 60 * 1000}); }
      catch (_) {}
    }
    const provider = directProvider(option);
    let profileId = runOptions.profileId || '';
    if (!profileId && expectedProfileId) {
      const bound = profileById(expectedProfileId, CHANNEL.id);
      const recordedProvider = bound?.lastLoginProvider || '';
      if (!recordedProvider || recordedProvider === provider) profileId = expectedProfileId;
      else expectedProfileId = '';
    }
    const context = {direct: true, browser: browserMode, provider, clientToken: randomId(),
      profileId,
      automatic: !!runOptions.automatic, loginOptionId: option.id || '', loginProvider: provider,
      loginMethod: loginOptionMethod(option),
      controller: new AbortController(), unsub: null, lastDirectText: '', popup: null, browserNonce, vivoNonce};
    active = context; busy(true);
    try {
      if (browserMode) {
        const page = browserState ? String(option.page).replace('{state}', encodeURIComponent(browserState)) : option.page;
        const url = safeOfficialURL(page);
        // Open synchronously inside the click handler; GM requests below are async.
        const bridgePrefix = CHANNEL.id === 'vivo' ? 'sgs-vivo-' : CHANNEL.id === 'oppo' ? 'sgs-oppo-' :
          CHANNEL.id === 'steam' ? 'sgs-steam-' : '';
        const popupName = browserMode && bridgePrefix ? bridgePrefix + browserNonce
          : 'sgs-' + CHANNEL.id + '-browser-login';
        context.popup = window.open(url.href, popupName, 'width=620,height=820');
        if (!context.popup) throw new Error(context.automatic
          ? '浏览器拦截了自动打开的' + CHANNEL.name + '官方登录窗口；请点击“' + option.label + '”继续登录。'
          : '浏览器拦截了' + CHANNEL.name + '官方登录窗口，请允许弹出窗口后重试');
        try { context.popup.opener = null; } catch (_) {}
        watchLoginPopup(context, '已关闭' + CHANNEL.name + '官方登录窗口，本次登录已取消；可重新选择登录方式。',
          ['sgs-vivo-page-result-v1:' + browserNonce, 'sgs-oppo-page-result-v1:' + browserNonce,
            'sgs-steam-page-result-v1:' + browserNonce]);
      }
      const api = await waitDirectApi(context.controller.signal);
      if (context.controller.signal.aborted) throw new Error('已取消');
      context.unsub = api.subscribe(snapshot => {
        if (active !== context) return;
        renderDirectSnapshot(snapshot);
        if (snapshot?.error) context.directError = snapshot.error;
      });
      status(browserMode
        ? CHANNEL.id === 'steam'
          ? '请在 Steam 官方页面完成扫码、账号密码或 Steam Guard 登录，脚本会自动继续。'
          : '请在' + CHANNEL.name + '官方登录窗口完成账号密码、手机验证码或扫码登录，脚本会自动继续。'
        : '正在启动' + CHANNEL.name + '官方扫码登录…');
      await api.start(context.provider, {clientToken: context.clientToken, saveSession: saveLoginInfoEnabled(),
        ...(context.profileId ? {profileId: context.profileId} : {}),
        ...(browserMode ? {mode: 'browser', nonce: browserNonce, ...(browserState ? {state: browserState} : {})} : {})});
      if (context.controller.signal.aborted) throw new Error('已取消');
      context.loginCompleted = true;
      if (context.directError) throw new Error(directErrorText(context.directError));
      const snapshot = api.get ? api.get() : null;
      if (snapshot?.error) throw new Error(directErrorText(snapshot.error));
      if (snapshot?.qr) renderDirectSnapshot(snapshot);
      context.entered = true;
      setLoginPanelCollapsed(true);
      status(browserMode ? CHANNEL.name + '官方网页登录完成，正在进入游戏…' : CHANNEL.name + '授权完成，正在进入游戏…');
      finishLoginSurface(context);
      if (typeof api.enter === 'function') await api.enter();
    } catch (error) {
      if (active === context) {
        setLoginPanelCollapsed(false);
        status(context.popupClosed ? '已关闭' + CHANNEL.name + '官方登录窗口，本次登录已取消；可重新选择登录方式。'
          : error instanceof Error ? error.message : directErrorText(error));
      }
    } finally {
      if (context.popupWatch) clearInterval(context.popupWatch);
      context.controller.abort();
      if (context.unsub) { try { context.unsub(); } catch (_) {} }
      try { if (active === context && !context.entered) directApi()?.cancel(context.clientToken, 'cleanup'); } catch (_) {}
      closeLoginPopup(context);
      if (context.vivoNonce) clearVivoPending(context.vivoNonce);
      if (active === context) {
        if (qrNode) qrNode.hidden = true;
        if (qrImage) qrImage.removeAttribute('src');
        active = null; busy(false);
      }
    }
  }
  function safeOfficialURL(raw) {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('官方页面地址格式不正确');
    const origins = new Set();
    if (CHANNEL.accountPage) { try { origins.add(new URL(CHANNEL.accountPage).origin); } catch (_) {} }
    for (const rule of CHANNEL.requestPolicy) origins.add(rule.origin);
    for (const endpoint of Object.values(CHANNEL.endpoints)) { try { origins.add(new URL(endpoint).origin); } catch (_) {} }
    if (CHANNEL.oauth) {
      for (const key of ['authorize', 'loginEntry', 'switchAccount']) if (CHANNEL.oauth[key]) {
        try { origins.add(new URL(CHANNEL.oauth[key]).origin); } catch (_) {}
      }
    }
    if (!origins.has(url.origin)) throw new Error('该地址不在当前渠道的官方页面白名单中');
    return url;
  }
  function openOfficial(option, runOptions = {}) {
    let url;
    try { url = safeOfficialURL(option.page || CHANNEL.accountPage); }
    catch (error) { return status(error.message); }
    const features = isPortalChannel ? 'width=1180,height=900,resizable=yes,scrollbars=yes' : 'width=560,height=780';
    const popup = window.open(url.href, 'sgs-' + CHANNEL.id + '-official-login', features);
    if (!popup) return status(runOptions.automatic
      ? '浏览器拦截了自动打开的' + CHANNEL.name + '官方登录窗口；请点击“' + (option.label || '官方登录') + '”继续登录。'
      : '浏览器拦截了' + CHANNEL.name + '官方登录窗口，请允许弹出窗口后重试');
    try { popup.opener = null; } catch (_) {}
    status(isPortalChannel
      ? '已打开' + CHANNEL.name + '官方登录 / 游戏页。请在官方页面完成登录，再选择“三国杀一将成名”进入游戏；脚本不会读取页面内的账号或凭据。'
      : '已打开' + CHANNEL.name + '官方登录页。账号密码、短信验证码只输入官方页面；完成官方登录后，若页面没有自动回到游戏，请回到本面板使用扫码或授权方式继续。');
  }
  function beginOption(option, runOptions = {}) {
    if (!isBrowserChannel) return status(CHANNEL.reason);
    if (!option || option.kind === 'disabled') return status(CHANNEL.reason);
    if (option.kind === 'oauth') return begin(null, option.method || 1, option.id, runOptions);
    if (option.kind === 'direct') return beginDirect(option, runOptions);
    if (option.kind === 'portal' || option.kind === 'official') return openOfficial(option, runOptions);
    return status('当前登录方式暂不可用。');
  }
  function waitForCode(context) {
    return new Promise((resolve, reject) => {
      let done = false;
      const key = resultKey(context.state);
      const finish = (fn, result) => {
        if (done) return;
        done = true; clearInterval(interval); clearTimeout(timer);
        GM_removeValueChangeListener(listener);
        context.controller.signal.removeEventListener('abort', cancel);
        context.accept = null;
        GM_deleteValue(key); GM_deleteValue(pendingKey(context.state));
        fn(result);
      };
      const cancel = () => finish(reject, new Error('已取消'));
      const accept = data => {
        if (!data || data.state !== context.state || !validTime(data.expires) || typeof data.code !== 'string' || !data.code || data.code.length > 4096) return;
        context.codeReceived = true;
        finish(resolve, data.code);
      };
      const listener = GM_addValueChangeListener(key, (_key, _old, data) => accept(data));
      const interval = setInterval(() => accept(GM_getValue(key, null)), 750);
      const timer = setTimeout(() => finish(reject, new Error(CHANNEL.name + '授权等待超时，请重新发起登录')), 10 * 60 * 1000);
      context.accept = accept;
      context.controller.signal.addEventListener('abort', cancel, {once: true});
    });
  }
  async function begin(retryProfileId = null, loginMethod = 1, optionId = '', runOptions = {}) {
    if (active) return;
    if (!isBrowserChannel) return status(CHANNEL.reason);
    if (entryError) return status('账号窗口入口已过期，请从账号列表重新打开。');
    duplicateRetry = null;
    const context = {state: randomId(), controller: new AbortController(), popup: null, accept: null,
      automatic: !!runOptions.automatic, loginOptionId: optionId, loginProvider: CHANNEL.id, loginMethod: '官方授权'};
    active = context; busy(true);
    GM_setValue(pendingKey(context.state), {expires: Date.now() + 10 * 60 * 1000});
    const entry = ChannelCore.authorization(context.state, loginMethod, CHANNEL.id);
    const authorization = entry.authorization, loginEntry = entry.loginEntry;
    try {
      const waiting = waitForCode(context);
      waiting.catch(() => {}); // Also handle cancellation before the popup has opened.
      // Open immediately within the click event; detach opener while retaining a close handle.
      context.popup = window.open('about:blank', 'sgs-' + CHANNEL.id + '-' + context.state, 'width=560,height=780');
      if (!context.popup) {
        context.controller.abort();
        try { await waiting; } catch (_) {}
        throw new Error('浏览器拦截了登录窗口，请允许此官网弹出窗口后重试');
      }
      context.popup.opener = null;
      context.popup.location.replace(loginMethod === 2 && loginEntry ? loginEntry.href : authorization.href);
      watchLoginPopup(context, '已关闭' + CHANNEL.name + '官方授权窗口，本次登录已取消；可重新选择登录方式。',
        [resultKey(context.state)]);
      status(loginMethod === 2 && loginEntry
        ? '请在' + CHANNEL.name + '官方标准登录页使用页面提供的登录方式'
          + (CHANNEL.standardLoginMethods.length ? '（可能包括' + CHANNEL.standardLoginMethods.join('、') + '）' : '')
          + '登录；凭据只输入官方页面，完成后会自动继续游戏授权。若需换号，请先使用“切换' + CHANNEL.name + '账号”。'
        : '请在新窗口完成' + CHANNEL.name + '官方授权；完成后会自动回到游戏接入流程。');
      let code = await waiting;
      if (context.popup) { try { context.popup.close(); } catch (_) {} }
      const args = await ChannelCore.connect(code, status, context.controller.signal, async identity => {
        const targetProfileId = expectedProfileId || (typeof retryProfileId === 'string' ? retryProfileId : null);
        if (targetProfileId && !sameAccountIdentity(identity.id, targetProfileId)) throw new Error('授权账号与所选账号不一致，已停止接入。请先点“切换' + CHANNEL.name + '账号”换号，再授权。');
        const probeId = targetProfileId && sameAccountIdentity(identity.id, targetProfileId) ? targetProfileId : identity.id;
        if ((!retryProfileId || !sameAccountIdentity(retryProfileId, identity.id)) && await probeAccountWindows(probeId, context.controller.signal)) {
          duplicateRetry = {id: probeId, loginMethod, optionId};
          throw new Error('该账号的其他游戏窗口仍有响应。可返回原窗口；若它未登录或已掉线，请点“仍在此窗口登录”重新授权。');
        }
        if (context.controller.signal.aborted) throw new Error('已取消');
        const profile = rememberIdentity(identity,
          targetProfileId && sameAccountIdentity(identity.id, targetProfileId) ? targetProfileId : identity.id);
        if (!profile) throw new Error('账号记录未能建立，请重试');
        rememberLoginMetadata(profile.id, profile.channelId, context);
        currentProfileId = expectedProfileId = profile.id; setAccountPhase('authorizing');
        if (!profile.transient) selectProfile(profile);
        sessionStorage.setItem(ACCOUNT_CONTEXT, profile.id); heartbeat(); updateAccountHeading(); renderAccounts();
      }, CHANNEL.id);
      code = null;
      if (context.controller.signal.aborted) throw new Error('已取消');
      // Save only the account identifier from the validated launch response, never its token/sign/ticket.
      if (saveLoginInfoEnabled() && !transientProfileMatches(currentProfileId, CHANNEL.id)) {
        accounts.update(currentProfileId, {loginAccount: args.account});
      } else updateTransientProfile({loginAccount: args.account});
      // A tab-scoped, one-use handoff; no credentials in query strings or persistent GM storage.
      sessionStorage.setItem(LAUNCH, JSON.stringify({channelId: CHANNEL.id, expires: Date.now() + 60000, args, profileId: currentProfileId}));
      status(CHANNEL.shortName + '登录准备完成，正在打开官网游戏…');
      location.assign(GAME);
    } catch (error) {
      const message = context.popupClosed ? '已关闭' + CHANNEL.name + '官方授权窗口，本次登录已取消；可重新选择登录方式。'
        : error instanceof Error ? error.message : '';
      const trusted = message.startsWith(CHANNEL.name) || /^(游卡|官方接口|浏览器拦截|请求地址|不是本次|授权校验|授权账号|该账号|账号标识|未取得|SDK 响应|已取消|启动参数|未知登录渠道)/.test(message);
      if (active === context) {
        if (accountPhase === 'authorizing') { setAccountPhase('failed'); heartbeat(); }
        status(trusted ? message : '登录接入未完成，请导出诊断后反馈最后状态。');
      }
    } finally {
      if (context.popupWatch) clearInterval(context.popupWatch);
      context.controller.abort();
      GM_deleteValue(pendingKey(context.state)); GM_deleteValue(resultKey(context.state));
      if (active === context) { active = null; busy(false); }
    }
  }
  function manual(raw) {
    if (!isBrowserChannel) return status(CHANNEL.reason);
    if (!active || !active.accept) return status('请先选择一种官方登录方式。');
    try {
      const data = ChannelCore.callback(raw, active.state, CHANNEL.id);
      active.accept({...data, expires: Date.now() + 30000});
    } catch (error) { status(/^(不是本次|授权校验|未取得)/.test(error.message) ? error.message : '回调地址格式不正确，请复制' + CHANNEL.name + '授权后地址栏的完整地址。'); }
  }
  window.addEventListener('pagehide', () => {
    clearInterval(accountRefresh); clearInterval(gameAccountRefresh); accounts.release(instanceId); GM_removeValueChangeListener(focusListener); GM_removeValueChangeListener(presenceListener);
    GM_deleteValue(PREFIX + 'focus:' + instanceId);
    GM_deleteValue(PREFIX + 'presence:' + instanceId);
    if (active) {
      active.controller.abort();
      GM_deleteValue(pendingKey(active.state)); GM_deleteValue(resultKey(active.state));
    }
  });
  function panel(callbackOnly = false) {
    const host = document.createElement('div');
    host.id = 'sgs-channel-login-panel';
    host.style.cssText = 'position:fixed;right:16px;top:16px;width:336px;max-width:calc(100vw - 24px);z-index:2147483647;';
    if (!callbackOnly) panelHost = host;
    const root = host.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
      style.textContent = `
        :host{
          all:initial;color-scheme:light dark;
          --font:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
          --panel:rgba(28,28,30,.82);--panel-solid:#1c1c1e;--elevated:rgba(58,58,60,.66);
          --field:rgba(118,118,128,.18);--field-strong:rgba(118,118,128,.28);
          --text:#f5f5f7;--text-secondary:#c7c7cc;--text-tertiary:#98989d;
          --separator:rgba(255,255,255,.12);--border:rgba(255,255,255,.15);
          --accent:#0a84ff;--accent-hover:#409cff;--accent-pressed:#0060df;
          --danger:#ff6961;--success:#30d158;--warning:#ffd60a;
          --focus:rgba(10,132,255,.55);--radius:22px;--control-radius:12px;
          --shadow:0 28px 80px rgba(0,0,0,.42),0 2px 10px rgba(0,0,0,.2);
        }
        @media (prefers-color-scheme:light){:host{
          --panel:rgba(250,250,252,.84);--panel-solid:#f2f2f7;--elevated:rgba(255,255,255,.76);
          --field:rgba(118,118,128,.12);--field-strong:rgba(118,118,128,.19);
          --text:#1d1d1f;--text-secondary:#48484a;--text-tertiary:#6e6e73;
          --separator:rgba(60,60,67,.18);--border:rgba(60,60,67,.16);
          --accent:#007aff;--accent-hover:#0a84ff;--accent-pressed:#005ecb;
          --danger:#ff3b30;--success:#248a3d;--warning:#a85f00;
          --shadow:0 26px 72px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);
        }}
        :host([hidden]){display:none!important}*{box-sizing:border-box}[hidden]{display:none!important}
        .box{
          overflow:hidden;color:var(--text);font:13px/1.55 var(--font);letter-spacing:-.003em;
          background:linear-gradient(180deg,rgba(255,255,255,.055),transparent 120px),var(--panel);
          border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);
          -webkit-backdrop-filter:blur(28px) saturate(180%);backdrop-filter:blur(28px) saturate(180%);
          -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
        }
        header{display:flex;align-items:center;gap:10px;padding:15px 17px;border-bottom:1px solid var(--separator);background:linear-gradient(180deg,rgba(255,255,255,.05),transparent)}
        .brand{flex:1;min-width:0;font-size:15px;font-weight:650;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .header-actions{display:flex;gap:6px}.header-actions button{padding:6px 9px;min-height:30px;font-size:11px;font-weight:600;background:var(--field);color:var(--text-secondary);border-color:var(--separator);box-shadow:none}
        .header-actions button:hover{background:var(--field-strong);color:var(--text)}
        .panel-content{padding:14px;max-height:calc(100vh - 96px);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--field-strong) transparent}
        .panel-content::-webkit-scrollbar,.record-list::-webkit-scrollbar{width:8px}.panel-content::-webkit-scrollbar-thumb,.record-list::-webkit-scrollbar-thumb{background:var(--field-strong);border:2px solid transparent;background-clip:padding-box;border-radius:99px}
        button{font:inherit;cursor:pointer;border:1px solid transparent;border-radius:var(--control-radius);padding:9px 14px;min-height:40px;background:var(--accent);color:#fff;font-weight:600;letter-spacing:-.006em;box-shadow:0 1px 1px rgba(0,0,0,.08);-webkit-tap-highlight-color:transparent;transition:transform 100ms ease-out,background-color 160ms ease-out,border-color 160ms ease-out,opacity 160ms ease-out}
        button:hover{background:var(--accent-hover)}button:active{transform:scale(.97);background:var(--accent-pressed)}
        button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
        button:disabled{opacity:.38;cursor:default;transform:none!important}
        .minor{min-height:32px;padding:6px 10px;font-size:11px;font-weight:550;background:var(--field);color:var(--text-secondary);border-color:var(--separator);box-shadow:none}.minor:hover{background:var(--field-strong);color:var(--text)}
        .danger{color:var(--danger)}
        .status-card{position:sticky;top:0;z-index:6;margin:0 0 12px;padding:11px 13px;border:1px solid var(--separator);border-radius:14px;background:var(--panel-solid);box-shadow:0 8px 18px rgba(0,0,0,.14)}
        .status-caption{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:700;letter-spacing:.045em;text-transform:uppercase;color:var(--text-tertiary)}
        .status-caption:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--text-tertiary);box-shadow:0 0 0 3px rgba(142,142,147,.12)}
        .status-card p{margin:5px 0 0;font-size:12px;line-height:1.7;color:var(--text-secondary);overflow-wrap:anywhere}
        .status-card.progress .status-caption:before{background:var(--accent);box-shadow:0 0 0 3px rgba(10,132,255,.16)}
        .status-card.success .status-caption:before{background:var(--success);box-shadow:0 0 0 3px rgba(48,209,88,.14)}
        .status-card.warning .status-caption:before{background:var(--warning);box-shadow:0 0 0 3px rgba(255,214,10,.14)}
        .status-card.error{background:linear-gradient(rgba(255,69,58,.10),rgba(255,69,58,.10)),var(--panel-solid);border-color:rgba(255,69,58,.30)}.status-card.error .status-caption:before{background:var(--danger);box-shadow:0 0 0 3px rgba(255,69,58,.14)}
        .channel-card{margin:0 0 12px;padding:12px;border:1px solid var(--separator);border-radius:16px;background:var(--field)}
        .channel-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.channel-head label{font-size:11px;font-weight:650;letter-spacing:.01em;color:var(--text-secondary)}
        .channel-badge{margin-left:auto;padding:3px 7px;border-radius:99px;font-size:9px;font-weight:650;color:var(--text-secondary);border:1px solid var(--separator);background:var(--field);white-space:nowrap}
        .channel-badge.browser{color:var(--success);border-color:rgba(48,209,88,.28);background:rgba(48,209,88,.10)}
        .channel-badge.native-required{color:var(--warning);border-color:rgba(255,214,10,.25);background:rgba(255,214,10,.09)}.channel-badge.unverified{color:var(--text-secondary)}
        .channel-select{display:block;width:100%;font:inherit;font-weight:550;background-color:var(--field-strong);color:var(--text);padding:9px 36px 9px 11px;border:1px solid var(--separator);border-radius:var(--control-radius);appearance:none;-webkit-appearance:none;color-scheme:light;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5l5-5' fill='none' stroke='%238e8e93' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
        .channel-select option,.channel-select optgroup{color-scheme:light;color:#1d1d1f;background-color:#fff;font-weight:550}
        .channel-select optgroup{color:#6e6e73;background-color:#f2f2f7;font-weight:650}
        .channel-select option:checked{color:#fff;background-color:#007aff}
        .channel-select:disabled{opacity:.5}.channel-info{display:block;margin-top:7px;font-size:10px;line-height:1.65;color:var(--text-tertiary);overflow-wrap:anywhere}.channel-meta{display:block;margin-top:4px;font-size:9px;line-height:1.55;color:var(--text-tertiary)}
        .login-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.login-grid button{font-size:12px;min-height:44px;line-height:1.3}.login-grid>button:last-child:nth-child(odd),.login-grid .full{grid-column:1/-1}.login-grid .secondary{background:var(--field-strong);color:var(--text);border-color:var(--separator);box-shadow:none}.login-grid .secondary:hover{background:var(--field-strong);filter:brightness(1.08)}.login-grid .secondary:active{background:var(--field-strong);filter:brightness(.94)}
        .login-hint{display:block;margin:7px 1px 11px;font-size:10px;line-height:1.65;color:var(--text-tertiary)}.retry-login{width:100%;margin-bottom:8px}
        .qr-panel{display:grid;grid-template-columns:152px 1fr;gap:12px;align-items:center;margin:0 0 11px;padding:11px;border:1px solid var(--separator);border-radius:16px;background:var(--field)}.qr-panel[hidden]{display:none}
        .qr-panel img{display:block;width:152px;height:152px;background:#fff;border-radius:12px;image-rendering:pixelated;box-shadow:0 1px 3px rgba(0,0,0,.12)}
        .qr-caption{font-size:11px;line-height:1.7;color:var(--text-secondary);overflow-wrap:anywhere}.qr-caption strong{display:block;margin-bottom:4px;color:var(--text);font-size:12px;font-weight:650}
        .direct-note{display:block;margin:0 0 12px;padding:9px 11px;border:1px solid var(--separator);border-radius:12px;background:var(--field);font-size:10px;line-height:1.65;color:var(--text-tertiary)}.direct-note[hidden]{display:none}
        .save-login{display:flex;align-items:flex-start;gap:11px;min-height:52px;margin:0 0 12px;padding:10px 12px;border:1px solid var(--separator);border-radius:14px;background:var(--field);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background-color 160ms ease-out,border-color 160ms ease-out}
        .save-login:hover{background:var(--field-strong)}.save-login.is-off{border-color:rgba(255,214,10,.24)}
        .save-login input[type="checkbox"]{flex:0 0 auto;width:18px;height:18px;margin:2px 0 0;padding:0;border-radius:5px;accent-color:var(--accent);cursor:pointer}
        .save-login-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.save-login-copy strong{font-size:12px;font-weight:650;line-height:1.35;color:var(--text)}.save-login-copy small{font-size:10px;line-height:1.55;color:var(--text-tertiary);overflow-wrap:anywhere}
        .save-login-state{font-weight:550}.save-login.is-off .save-login-state{color:var(--warning)}
        details.section-card{margin-top:10px;border:1px solid var(--separator);border-radius:16px;background:var(--field);overflow:hidden}
        summary{display:flex;align-items:center;gap:7px;cursor:pointer;list-style:none;padding:11px 12px;font-size:12px;font-weight:650;color:var(--text);user-select:none;-webkit-tap-highlight-color:transparent}summary::-webkit-details-marker{display:none}
        summary:after{content:"›";margin-left:auto;color:var(--text-tertiary);font-size:18px;line-height:1;transform:rotate(0deg);transition:transform 160ms ease-out}details[open]>summary:after{transform:rotate(90deg)}
        .summary-title{display:inline-flex;align-items:center;height:20px;line-height:20px;white-space:nowrap}
        .section-body{padding:0 11px 11px}.toolbar{display:flex;gap:6px;flex-wrap:wrap}.toolbar button{flex:1 1 auto;white-space:nowrap}
        .account-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.account-actions .account-open{grid-column:1/-1}.account-actions>button:last-child{grid-column:1/-1}
        input,textarea,select{width:100%;font:inherit;background:var(--field-strong);color:var(--text);padding:9px 10px;border:1px solid var(--separator);border-radius:var(--control-radius)}input::placeholder,textarea::placeholder{color:var(--text-tertiary)}input[type="checkbox"]{width:auto;accent-color:var(--accent)}
        .account-info{display:block;margin:8px 0;white-space:pre-line;overflow-wrap:anywhere;font-size:11px;line-height:1.65;color:var(--text-secondary)}
        .accounts{display:block;width:100%;height:136px;overflow:auto;margin:8px 0;background:var(--field-strong);color:var(--text);border:1px solid var(--separator);border-radius:var(--control-radius);font:12px/1.55 var(--font)}
        .accounts option{padding:6px 8px;border-radius:8px}.accounts option:checked{background:var(--accent);color:#fff}.account-editor input{margin-top:7px;font-size:12px}.account-editor button{margin:7px 5px 0 0}
        .record-count{display:inline-flex;align-items:center;justify-content:center;height:20px;margin-left:2px;padding:0 7px;border-radius:99px;background:var(--field-strong);color:var(--text-tertiary);font-size:9px;font-weight:550;line-height:20px;font-variant-numeric:tabular-nums;box-sizing:border-box;flex:0 0 auto}.record-tools{display:flex;gap:6px;padding:0 11px 9px}.record-tools button{flex:1;font-size:10px;padding:5px 6px}.record-list{list-style:none;padding:0 11px 0 20px;margin:0 0 11px;max-height:220px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--field-strong) transparent}
        .record-item{position:relative;border-left:1px solid var(--separator);padding:0 8px 14px 13px;margin:0}.record-item:before{content:"";position:absolute;left:-4px;top:7px;width:7px;height:7px;border-radius:50%;background:var(--text-tertiary);border:2px solid var(--panel-solid)}.record-item:last-child{padding-bottom:0;border-left-color:transparent}.record-item.error:before{background:var(--danger)}.record-item.warning:before{background:var(--warning)}.record-item.success:before{background:var(--success)}.record-item.is-current.progress:before{background:var(--accent);box-shadow:0 0 0 3px rgba(10,132,255,.16)}
        .record-meta{display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--text-tertiary);font-variant-numeric:tabular-nums}.record-badge{font-size:9px;color:var(--text-tertiary)}.record-item.is-current .record-badge{color:var(--accent)}.record-item.error .record-badge,.record-item.error .record-message{color:var(--danger)}.record-item.success .record-badge{color:var(--success)}.record-message{margin-top:3px;font-size:11px;line-height:1.7;color:var(--text-secondary);overflow-wrap:anywhere}.record-item.is-current .record-message{color:var(--text)}.record-empty{padding:9px 0 13px;font-size:11px;line-height:1.7;color:var(--text-tertiary)}
        .panel-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:12px}.panel-footer small{color:var(--text-tertiary);font-size:10px}.panel-footer button{font-size:10px}.manual-entry{margin:10px 0}.manual-entry small{display:block;margin-bottom:7px;font-size:11px;line-height:1.6;color:var(--text-secondary)}.manual-entry button{margin-top:7px}.cancel-login{width:100%;margin-top:8px}
        .security-note{margin-top:10px;border:1px solid var(--separator);border-radius:14px;background:var(--field);overflow:hidden}.security-note summary{padding:9px 11px;font-size:10px;font-weight:650;color:var(--text-secondary)}.security-note .security-body{padding:0 11px 11px;font-size:10px;line-height:1.7;color:var(--text-tertiary)}.security-note pre{margin:7px 0 0;padding:8px;border-radius:9px;background:rgba(0,0,0,.18);color:var(--text-secondary);font:9px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
        @media (prefers-reduced-transparency:reduce){.box{background:var(--panel-solid);-webkit-backdrop-filter:none;backdrop-filter:none}}
        @media (prefers-contrast:more){:host{--separator:rgba(128,128,128,.55);--border:rgba(128,128,128,.65)}.box{border-width:2px}}
        @media (prefers-reduced-motion:reduce){*,*:before,*:after{transition-duration:.01ms!important;animation-duration:.01ms!important;scroll-behavior:auto!important}button:active{transform:none}}
        @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.box{background:var(--panel-solid)}}
      `;
    root.appendChild(style);
    const box = document.createElement('section'); box.className = 'box'; root.appendChild(box);
    const header = document.createElement('header'); box.appendChild(header);
    const brand = document.createElement('span'); brand.className = 'brand'; brand.textContent = '一将成名 · ' + CHANNEL.shortName; header.appendChild(brand);
    const headerActions = document.createElement('div'); headerActions.className = 'header-actions'; header.appendChild(headerActions);
    const content = document.createElement('div'); content.className = 'panel-content'; content.id = 'sgs-login-panel-content'; panelContent = content;
    const collapse = document.createElement('button'); collapse.className = 'minor panel-collapse'; collapse.textContent = '收起';
    collapse.setAttribute('aria-controls', content.id); collapse.setAttribute('aria-expanded', 'true');
    panelCollapseButton = collapse;
    collapse.onclick = () => setLoginPanelCollapsed(!content.hidden);
    headerActions.appendChild(collapse); box.appendChild(content);
    if (!callbackOnly) {
      const hide = document.createElement('button'); hide.className = 'minor'; hide.textContent = '隐藏';
      hide.title = '可从油猴菜单的“' + CHANNEL.shortName + '：显示登录面板”重新打开';
      hide.onclick = () => { setPanelVisible(false); savePreferences({hidden: true}); };
      headerActions.appendChild(hide);
      header.style.cursor = 'move'; header.style.touchAction = 'none'; header.style.userSelect = 'none';
      header.title = '按住标题拖动；隐藏后可从油猴菜单重新显示';
      let drag = null;
      header.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button')) return;
        const rect = host.getBoundingClientRect();
        drag = {id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top};
        header.setPointerCapture(event.pointerId); event.preventDefault();
      });
      header.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id) return;
        positionPanel(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
      });
      const endDrag = event => {
        if (!drag || event.pointerId !== drag.id) return;
        try { header.releasePointerCapture(event.pointerId); } catch (_) {}
        drag = null;
        savePreferences({left: parseFloat(host.style.left), top: parseFloat(host.style.top)});
      };
      header.addEventListener('pointerup', endDrag); header.addEventListener('pointercancel', endDrag);
      window.addEventListener('resize', () => {
        const prefs = preferences();
        if (!host.hidden && Number.isFinite(prefs.left) && Number.isFinite(prefs.top)) positionPanel(prefs.left, prefs.top);
      });
    }
    statusCard = document.createElement('div'); statusCard.className = 'status-card'; content.appendChild(statusCard);
    statusCaption = document.createElement('div'); statusCaption.className = 'status-caption'; statusCard.appendChild(statusCaption);
    statusNode = document.createElement('p'); statusNode.setAttribute('role', 'status'); statusNode.setAttribute('aria-live', 'polite'); statusCard.appendChild(statusNode); renderStatus();
    if (!callbackOnly) {
      const channelCard = document.createElement('div'); channelCard.className = 'channel-card'; content.appendChild(channelCard);
      const channelHead = document.createElement('div'); channelHead.className = 'channel-head'; channelCard.appendChild(channelHead);
      const channelLabel = document.createElement('label'); channelLabel.htmlFor = 'sgs-channel-select'; channelLabel.textContent = '登录渠道'; channelHead.appendChild(channelLabel);
      channelBadge = document.createElement('span'); channelBadge.className = 'channel-badge ' + CHANNEL.capability;
      channelBadge.textContent = ChannelRegistry.capabilityLabel(CHANNEL); channelHead.appendChild(channelBadge);
      channelSelect = document.createElement('select'); channelSelect.id = 'sgs-channel-select'; channelSelect.className = 'channel-select';
      channelSelect.setAttribute('aria-label', '切换登录渠道');
      for (const [capability, label] of [[ChannelRegistry.CAPABILITIES.browser, '浏览器可直接登录'],
        [ChannelRegistry.CAPABILITIES.native, '需要官方安卓 SDK'],
        [ChannelRegistry.CAPABILITIES.unverified, '登录链未完全核实']]) {
        const items = ChannelRegistry.byCapability(capability);
        if (!items.length) continue;
        const group = document.createElement('optgroup'); group.label = label;
        for (const item of items) {
          const option = document.createElement('option'); option.value = item.id; option.textContent = item.name;
          option.selected = item.id === CHANNEL.id; group.appendChild(option);
        }
        channelSelect.appendChild(group);
      }
      channelSelect.value = CHANNEL.id;
      channelSelect.onchange = () => switchChannel(channelSelect.value);
      channelCard.appendChild(channelSelect);
      channelInfo = document.createElement('small'); channelInfo.className = 'channel-info';
      channelInfo.textContent = CHANNEL.reason + '\n账号簿跨渠道汇总保存；切换渠道不会丢失其他渠道的账号记录。'; channelCard.appendChild(channelInfo);
      if (CHANNEL.standardLoginMethods.length) {
        const methodsNode = document.createElement('small'); methodsNode.className = 'channel-meta';
        methodsNode.textContent = '官方页面提供：' + CHANNEL.standardLoginMethods.join(' · ') + '（以页面实际展示为准）';
        channelCard.appendChild(methodsNode);
      }
      const channelMeta = [CHANNEL.platformId && '平台号 ' + CHANNEL.platformId, CHANNEL.gameChannelId && '游戏渠道号 ' + CHANNEL.gameChannelId].filter(Boolean).join(' · ');
      if (channelMeta) { const metaNode = document.createElement('small'); metaNode.className = 'channel-meta'; metaNode.textContent = channelMeta; channelCard.appendChild(metaNode); }
      const saveLoginRow = document.createElement('label'); saveLoginRow.className = 'save-login';
      saveLoginToggle = document.createElement('input'); saveLoginToggle.type = 'checkbox';
      saveLoginToggle.id = 'sgs-save-login-info'; saveLoginToggle.checked = saveLoginInfoEnabled();
      saveLoginToggle.setAttribute('aria-describedby', 'sgs-save-login-note'); saveLoginRow.htmlFor = saveLoginToggle.id;
      const saveLoginCopy = document.createElement('span'); saveLoginCopy.className = 'save-login-copy';
      const saveLoginTitle = document.createElement('strong'); saveLoginTitle.textContent = '保存本次登录信息';
      const saveLoginPrivacy = document.createElement('small');
      saveLoginPrivacy.textContent = '开启后在本机保存可恢复的官方登录状态（可能包含渠道票据），账号管理可直达游戏；不保存密码或验证码。';
      saveLoginNote = document.createElement('small'); saveLoginNote.id = 'sgs-save-login-note'; saveLoginNote.className = 'save-login-state';
      saveLoginCopy.append(saveLoginTitle, saveLoginPrivacy, saveLoginNote);
      saveLoginRow.append(saveLoginToggle, saveLoginCopy);
      const syncSaveLogin = () => {
        const enabled = saveLoginInfoEnabled();
        saveLoginRow.classList.toggle('is-off', !enabled);
        saveLoginNote.textContent = enabled
          ? '已开启：保存账号与登录状态，下次可从账号管理直接登录。'
          : '已关闭：本次不新增或更新任何本地账号与登录状态。';
      };
      saveLoginToggle.onchange = () => { saveLoginInfo = saveLoginToggle.checked; syncSaveLogin(); };
      syncSaveLogin(); content.appendChild(saveLoginRow);
      loginOptionsNode = document.createElement('div'); loginOptionsNode.className = 'login-grid'; content.appendChild(loginOptionsNode);
      const options = CHANNEL.loginOptions.length ? CHANNEL.loginOptions
        : [{id: 'unavailable', label: '当前渠道暂不可用', kind: 'disabled', hint: CHANNEL.reason}];
      for (const option of options) {
        const button = document.createElement('button');
        button.textContent = option.label;
        button.title = option.hint || option.label;
        if (['portal', 'official', 'external', 'disabled'].includes(option.kind)) button.className = 'secondary';
        if (option.kind === 'disabled') button.disabled = true;
        button.onclick = () => beginOption(option);
        loginOptionsNode.appendChild(button);
        loginOptionButtons.push({button, option});
      }
      loginButton = loginOptionButtons[0]?.button || null;
      alternateLoginButton = loginOptionButtons[1]?.button || null;
      const loginHint = document.createElement('small'); loginHint.className = 'login-hint';
      loginHint.textContent = CHANNEL.loginOptions.length
        ? '' : '当前渠道没有可核实的浏览器登录入口；不会伪造票据或设备签名。';
      loginHint.hidden = CHANNEL.loginOptions.length > 0;
      content.appendChild(loginHint);
      qrNode = document.createElement('div'); qrNode.className = 'qr-panel'; qrNode.hidden = true; content.appendChild(qrNode);
      qrImage = document.createElement('img'); qrImage.alt = CHANNEL.name + '官方登录二维码'; qrImage.hidden = true; qrNode.appendChild(qrImage);
      qrCaption = document.createElement('div'); qrCaption.className = 'qr-caption'; qrNode.appendChild(qrCaption);
      directNote = document.createElement('small'); directNote.className = 'direct-note'; content.appendChild(directNote);
      directNote.textContent = hasBrowserLogin
        ? '扫码二维码由当前渠道官方接口即时生成；账号密码、短信验证码和网页扫码只在官方弹窗内完成。脚本不读取输入，是否保存可恢复登录状态由上方开关决定。'
        : '扫码二维码由当前渠道官方接口即时生成，只在本次登录面板内显示；脚本不读取账号密码、验证码或二维码内容。';
      directNote.hidden = !hasDirectLogin;
      retryLoginButton = document.createElement('button'); retryLoginButton.className = 'minor retry-login'; retryLoginButton.textContent = '仍在此窗口登录'; retryLoginButton.hidden = !duplicateRetry;
      retryLoginButton.title = '重新授权同一账号，服务器可能使原窗口下线';
      retryLoginButton.onclick = () => {
        if (!duplicateRetry) { retryLoginButton.hidden = true; return status('请先选择一种官方登录方式。'); }
        return begin(duplicateRetry.id, duplicateRetry.loginMethod, duplicateRetry.optionId || '');
      }; content.appendChild(retryLoginButton);
      currentAccountNode = document.createElement('small'); currentAccountNode.className = 'account-info'; content.appendChild(currentAccountNode);
      const manager = document.createElement('details'); manager.className = 'section-card'; manager.open = false;
      const managerTitle = document.createElement('summary'); manager.appendChild(managerTitle);
      const managerLabel = document.createElement('span'); managerLabel.className = 'summary-title'; managerLabel.textContent = '账号管理'; managerTitle.appendChild(managerLabel);
      accountCountNode = document.createElement('span'); accountCountNode.className = 'record-count'; managerTitle.appendChild(accountCountNode);
      const managerBody = document.createElement('div'); managerBody.className = 'section-body'; manager.appendChild(managerBody);
      const portalNote = document.createElement('small'); portalNote.className = 'account-info'; portalNote.hidden = !isPortalChannel;
      portalNote.textContent = '门户渠道在独立官方站点内完成登录，脚本无法读取外部账号标识，因此不会自动收录账号；上方登录入口仍可正常使用。';
      managerBody.appendChild(portalNote);
      const accountToolbar = document.createElement('div'); accountToolbar.className = 'toolbar'; managerBody.appendChild(accountToolbar);
      addAccountButton = document.createElement('button'); addAccountButton.className = 'minor'; addAccountButton.textContent = '添加账号';
      addAccountButton.disabled = isPortalChannel;
      addAccountButton.title = isPortalChannel ? '该渠道使用独立官方游戏站点，请直接使用上方的官方登录入口。' : '优先在当前窗口完成官方登录并添加账号。';
      addAccountButton.onclick = () => isPortalChannel ? status('请使用上方的官方登录入口；门户渠道的账号由渠道官方页面管理。') : openAccountWindow();
      accountToolbar.appendChild(addAccountButton);
      const refresh = document.createElement('button'); refresh.className = 'minor'; refresh.textContent = '刷新列表'; refresh.onclick = () => renderAccounts(true); accountToolbar.appendChild(refresh);
      switchAccountButton = document.createElement('button'); switchAccountButton.className = 'minor';
      switchAccountButton.textContent = '切换' + CHANNEL.name + '账号';
      switchAccountButton.title = ChannelCore.switchAccount(CHANNEL.id)
        ? '打开' + CHANNEL.name + '官方账号页，换号后再回本窗口授权'
        : '当前渠道未配置官方网页换号入口';
      switchAccountButton.onclick = () => {
        if (!isBrowserChannel) return status(CHANNEL.reason);
        let url;
        try { url = safeOfficialURL(ChannelCore.switchAccount(CHANNEL.id)); }
        catch (error) { return status(error instanceof Error ? error.message : '当前渠道未配置官方网页换号入口。'); }
        const popup = window.open(url.href, 'sgs-' + CHANNEL.id + '-account-switch', 'width=560,height=780');
        if (!popup) return status('浏览器拦截了' + CHANNEL.name + '账号窗口，请允许弹出窗口后重试。');
        popup.opener = null; status('请在' + CHANNEL.name + '官方账号页自行换号，完成后回到所选窗口重新授权。');
      }; accountToolbar.appendChild(switchAccountButton);
      accountsView = document.createElement('select'); accountsView.className = 'accounts'; accountsView.size = 5;
      accountsView.setAttribute('aria-label', '选择要管理的账号');
      accountsView.onchange = () => {
        const parsed = accounts.parseRef(accountsView.value);
        selectedProfileId = parsed?.id || null;
        selectedProfileChannelId = parsed?.channelId || CHANNEL.id;
        editingProfileId = removingProfileId = inspectingProfileId = null; renderAccounts(true);
      }; managerBody.appendChild(accountsView);
      accountInfo = document.createElement('small'); accountInfo.className = 'account-info'; managerBody.appendChild(accountInfo);
      const accountActions = document.createElement('div'); accountActionsNode = accountActions; accountActions.className = 'account-actions'; managerBody.appendChild(accountActions);
      accountOpen = document.createElement('button'); accountOpen.className = 'minor account-open';
      accountOpen.onclick = () => openAccountWindow(selectedProfile()); accountActions.appendChild(accountOpen);
      accountEdit = document.createElement('button'); accountEdit.className = 'minor'; accountEdit.textContent = '修改备注';
      accountEdit.onclick = () => {
        const profile = selectedProfile(); if (!profile) return renderAccounts(true);
        editingProfileId = profile.id; removingProfileId = null;
        aliasInput.value = profile.alias || ''; zoneInput.value = profile.zoneNote || ''; renderAccounts(true);
      }; accountActions.appendChild(accountEdit);
      accountRemove = document.createElement('button'); accountRemove.className = 'minor danger'; accountRemove.textContent = '移除记录';
      accountRemove.onclick = () => {
        const profile = selectedProfile(); if (!profile) return renderAccounts(true);
        if (removingProfileId !== profile.id) { removingProfileId = profile.id; editingProfileId = null; renderAccounts(true); return; }
        try { directApi()?.forgetSessions?.(profile.id); } catch (_) {}
        accounts.remove(profile.id, profile.channelId); editingProfileId = removingProfileId = null;
        renderAccounts(true); status('所选账号、它的本地登录状态和最近登录信息已移除；已打开的游戏不会退出。');
      }; accountActions.appendChild(accountRemove);
      accountInspect = document.createElement('button'); accountInspect.className = 'minor'; accountInspect.textContent = '查看账号信息';
      accountInspect.onclick = () => {
        inspectingProfileId = inspectingProfileId === selectedProfileId ? null : selectedProfileId; renderAccounts(true);
      }; accountActions.appendChild(accountInspect);
      accountDetails = document.createElement('div'); accountDetails.hidden = true;
      accountDetailsText = document.createElement('textarea'); accountDetailsText.readOnly = true;
      accountDetailsText.setAttribute('aria-label', '账号信息（不含登录凭据）');
      accountDetailsText.style.cssText = 'height:155px;resize:vertical;font-size:11px;line-height:1.8;margin-top:8px;';
      accountDetails.appendChild(accountDetailsText);
      const identityHint = document.createElement('small'); identityHint.className = 'account-info';
      identityHint.textContent = '这些是官方登录流程返回的账号标识；不等于绑定手机号，也不代表可使用官网密码登录。'; accountDetails.appendChild(identityHint);
      const copyIdentity = document.createElement('button'); copyIdentity.className = 'minor'; copyIdentity.textContent = '复制账号信息';
      copyIdentity.onclick = async () => {
        if (!selectedProfile() || accountDetails.hidden) return;
        try { await navigator.clipboard.writeText(accountDetailsText.value); status('账号信息已复制，不含登录凭据。'); }
        catch (_) { accountDetailsText.focus(); accountDetailsText.select(); status('已选中账号信息，请按 Ctrl+C 复制。'); }
      }; accountDetails.appendChild(copyIdentity); managerBody.appendChild(accountDetails);
      accountEditor = document.createElement('div'); accountEditor.className = 'account-editor'; accountEditor.hidden = true;
      aliasInput = document.createElement('input'); aliasInput.placeholder = '账号备注，如大号／小号'; aliasInput.maxLength = 80;
      aliasInput.setAttribute('aria-label', '账号备注'); accountEditor.appendChild(aliasInput);
      zoneInput = document.createElement('input'); zoneInput.placeholder = '区服备注（可选）'; zoneInput.maxLength = 80;
      zoneInput.setAttribute('aria-label', '区服备注'); accountEditor.appendChild(zoneInput);
      const save = document.createElement('button'); save.className = 'minor'; save.textContent = '保存备注';
      save.onclick = () => {
        const profile = selectedProfile();
        if (!editingProfileId || editingProfileId !== selectedProfileId || !profile) return renderAccounts(true);
        accounts.update(editingProfileId, {alias: aliasInput.value, zoneNote: zoneInput.value}, false, profile.channelId); editingProfileId = null;
        renderAccounts(true); status('所选账号的备注已保存。');
      }; accountEditor.appendChild(save);
      const cancelEdit = document.createElement('button'); cancelEdit.className = 'minor'; cancelEdit.textContent = '取消修改';
      cancelEdit.onclick = () => { editingProfileId = null; renderAccounts(true); }; accountEditor.appendChild(cancelEdit);
      managerBody.appendChild(accountEditor); content.appendChild(manager);
      cancelButton = document.createElement('button'); cancelButton.textContent = '取消当前登录'; cancelButton.className = 'minor cancel-login'; cancelButton.hidden = true;
      cancelButton.onclick = () => {
        if (!active) return;
        const direct = active.direct;
        active.controller.abort();
        closeLoginPopup(active);
        if (direct) { try { directApi()?.cancel(active?.clientToken); } catch (_) {} }
      }; content.appendChild(cancelButton);
      importArea = document.createElement('details'); importArea.className = 'manual-entry'; importArea.hidden = true;
      const summary = document.createElement('summary'); summary.textContent = '授权后卡在 404／空白页？'; importArea.appendChild(summary);
      const hint = document.createElement('small'); hint.textContent = '复制授权后地址栏的完整地址，粘贴到这里继续。'; importArea.appendChild(hint);
      const input = document.createElement('input'); input.type = 'password'; input.autocomplete = 'off'; input.placeholder = '粘贴' + CHANNEL.name + '授权回调地址'; importArea.appendChild(input);
      const submit = document.createElement('button'); submit.className = 'minor'; submit.textContent = '继续登录';
      submit.onclick = () => { const raw = input.value.trim(); input.value = ''; manual(raw); }; importArea.appendChild(submit); content.appendChild(importArea);
      const diagnostics = document.createElement('details'); diagnostics.className = 'section-card'; historyDetails = diagnostics;
      const label = document.createElement('summary'); diagnostics.appendChild(label);
      const recordTitle = document.createElement('span'); recordTitle.textContent = '运行记录'; label.appendChild(recordTitle);
      historyCount = document.createElement('span'); historyCount.className = 'record-count'; label.appendChild(historyCount);
      const recordTools = document.createElement('div'); recordTools.className = 'record-tools'; diagnostics.appendChild(recordTools);
      historyFilterButton = document.createElement('button'); historyFilterButton.className = 'minor';
      historyFilterButton.onclick = () => { errorsOnly = !errorsOnly; renderHistory(); }; recordTools.appendChild(historyFilterButton);
      historyClearButton = document.createElement('button'); historyClearButton.className = 'minor'; historyClearButton.textContent = '清空记录';
      historyClearButton.title = '只清空当前页面的运行记录，不影响账号或登录';
      historyClearButton.onclick = () => { log.length = 0; errorsOnly = false; renderHistory(); }; recordTools.appendChild(historyClearButton);
      logNode = document.createElement('ol'); logNode.className = 'record-list'; logNode.setAttribute('aria-label', '运行记录，最新在前');
      const download = document.createElement('button'); download.className = 'minor'; download.textContent = '导出诊断';
      download.onclick = () => {
        const report = {version: VERSION, channel: {id: CHANNEL.id, name: CHANNEL.name, capability: CHANNEL.capability,
          platformId: CHANNEL.platformId, gameChannelId: CHANNEL.gameChannelId}, scope: '阶段提示；不包含账号与会话值', events: log};
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}));
        const link = document.createElement('a'); link.href = url; link.download = CHANNEL.shortName + '浏览器诊断-' + Date.now() + '.json';
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }; recordTools.appendChild(download); diagnostics.appendChild(logNode); content.appendChild(diagnostics); renderHistory();
      const security = document.createElement('details'); security.className = 'security-note';
      const securityTitle = document.createElement('summary'); securityTitle.textContent = '安全声明：不会读取账号密码';
      security.appendChild(securityTitle);
      const securityBody = document.createElement('div'); securityBody.className = 'security-body';
      securityBody.textContent = '账号密码和短信验证码只在渠道官方页面输入，脚本不监听输入框、不读取剪贴板，也绝不保存密码或验证码。开启“保存本次登录信息”时，会按账号与渠道保存在本机可恢复的官方登录状态（可能包含渠道票据），用于账号管理直达游戏；关闭时不新增或更新账号与登录状态。授权 code 只在本机临时存储中等待一次兑换，读取后立即删除；游戏启动票据仅在当前标签页短暂保留并一次性消费。移除账号会同时清除该账号名下所有已保存登录状态。';
      const securityCode = document.createElement('pre');
      securityCode.textContent = '// 只有开启保存且已绑定 profileId 时才写会话\nif (saveSession) GM_setValue(sessionStoreKey(profileId, provider), record);\n// 授权回调读取后立即删除\nGM_deleteValue(resultKey(context.state));\n// 移除账号时清理它名下全部渠道会话\nforgetSessions(profileId);\n// 启动票据一次性消费\nsessionStorage.removeItem(LAUNCH);';
      securityBody.appendChild(securityCode); security.appendChild(securityBody); content.appendChild(security);
      const footer = document.createElement('div'); footer.className = 'panel-footer'; content.appendChild(footer);
      const note = document.createElement('small'); note.textContent = 'v' + VERSION + ' · 多渠道本地版 · ' + ChannelRegistry.visibleChannels().length + ' 个渠道';
      footer.appendChild(note);
    }
    document.body.appendChild(host);
    if (!callbackOnly) {
      const prefs = preferences();
      setPanelVisible(prefs.hidden !== true);
      if (!host.hidden && Number.isFinite(prefs.left) && Number.isFinite(prefs.top)) positionPanel(prefs.left, prefs.top);
      renderAccounts(true); updateAccountHeading(); busy(false);
      setTimeout(resumePendingAutoLogin, 0);
    }
  }
  GM_registerMenuCommand(CHANNEL.shortName + '：显示登录面板', () => showPanel());
  GM_registerMenuCommand(CHANNEL.shortName + '：重置面板位置', () => showPanel(true));
  GM_registerMenuCommand(CHANNEL.shortName + '：打开官网登录页', () => location.assign(LOGIN_PAGE));
  GM_registerMenuCommand(CHANNEL.shortName + '：清除临时授权记录', () => {
    if (active) active.controller.abort();
    try { directApi()?.cancel(); } catch (_) {}
    for (const key of GM_listValues()) if (key.startsWith(PREFIX)) GM_deleteValue(key);
    sessionStorage.removeItem(LAUNCH); status('临时授权记录已清除；游戏内退出请使用游戏自带功能。');
  });
  ready(() => panel());
})();

/* DIRECT-ENGINE-BEGIN */
(() => {
  'use strict';
  const VERSION = '1.1';
  const ORIGIN = 'https://web.sanguosha.com';
  const SESSION_KEY = 'wegame.qq.session.v1';
  const SESSION_STORE_PREFIX = 'sgs-login-session-v3:';
  // This is the local record's availability, not the channel credential lifetime.
  // Provider-specific restore checks still decide whether the ticket is usable.
  const SESSION_RECORD_EXPIRES_FOREVER = Number.MAX_SAFE_INTEGER;
  const HANDOFF_KEY = 'wegame.qq.handoff.v1';
  const EMBEDDED_HANDOFF_KEY = 'sgs-direct-handoff-v1';
  const EMBEDDED_HANDOFF_LIMIT = 65536;
  const HANDOFF_TTL = 90000;
  const TAB_KEY = 'wegame.qq.tab.v1';
  const STEAM_PENDING_KEY = 'unified.steam.pending.v1';
  const STEAM_APP = '6730F3F4';
  const STEAM_HOSTS = new Set(['api.steampowered.com', 'login.steampowered.com', 'store.steampowered.com', 'steamcommunity.com']);
  const DIRECT_CLIENT_TOKEN_KEY = 'sgs-direct-client-token-v1';
  const STEAM_PAGE_RESULT_KEY = 'sgs-steam-page-result-v1:';
  const XIAOMI_OAUTH_APP = '2882303761517516898';
  const XIAOMI_GAME_APP = '2882303761520011303';
  const XIAOMI_CALLBACK = 'http://game.xiaomi.com/oauthcallback/mioauth';
  const XIAOMI_CHANNEL = 320052;
  const HUAWEI_CHANNEL = 320459;
  const HUAWEI_APP = '111830943';
  const HUAWEI_AUTH = 'https://oauth-login-drcn.platform.dbankcloud.com';
  const HUAWEI_CALLBACK = 'com.huawei.apps.111830943:/oauth2redirect';
  const HUAWEI_HOSTS = new Set(['oauth-login-drcn.platform.dbankcloud.com', 'oauth-login1.cloud.huawei.com',
    'oauth-login.cloud.huawei.com', 'id1.cloud.huawei.com']);
  const VIVO_CHANNEL = 320056;
  const VIVO_PACKAGE = 'com.yoka.sgstenth.vivo';
  const VIVO_HOSTS = new Set(['passport.vivo.com.cn', 'joint.vivo.com.cn']);
  const VIVO_PAGE_RESULT_KEY = 'sgs-vivo-page-result-v1:';
  const VIVO_PAGE_STATE_PREFIX = 'sgs-vivo-page-state-v1:';
  const OPPO_PAGE_RESULT_KEY = 'sgs-oppo-page-result-v1:';
  const OPPO_CHANNEL = 320123;
  const BILI_CHANNEL = '120133';
  const WEGAME_CHANNEL = 320023;
  const PREFIX = 'jnd-wg-qq-';
  const CONFIG = {"wga_appid":"40000027","wga_app_key":"d41d8cd98f00b204e9800998ecf8427e","TD_SDK_APP_ID":"485","TD_CONFIG_ID":"60","any_platform_id":"326","any_platform_name":"wegame"};
  const QQ_APP = '101790992';
  const WX_APP = 'wxba26a260a325b6f8';
  const WX_HOSTS = new Set(['open.weixin.qq.com', 'long.open.weixin.qq.com']);
  const WX_UA = 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0';
  // Windows SDK 5.0.0.0, SHA-256 f5d4c5d9ab9109734470799cf7e6b8a7847e7200b0c49226abb866c1c2dfdd19.
  // Source: user's verified PC login record, 2026-09-21. App metadata and
  // observed SDK device value supplied by the user; no user access_key here.
  // Other device-value generation rules still need independent verification.
  const BILI_CONFIG = {gameId: '9869', merchantId: '239', zoneId: '9037', appKey: 'e8e2ffe549284ccc808119b321303eb9', macId: '088FC346611D'};
  // HeyTap account web QR login. Public client configuration from the official
  // wrapper-8d4d9d2b.js (uc-res-gl.heytap.com), SHA-256
  // edafccdd6726064bdd06f9ef07bd45c3072b8b632b47df5a66441488122bb92a (2026-09-21).
  // These are shipped application constants, not user credentials.
  const OPPO_HOSTS = new Set(['id-cn.heytap.com', 'id.heytap.com', 'client-uc.heytapmobi.com', 'isdk.heytapmobi.com', 'game-login.heytap.com']);
  const OPPO_ORIGIN = 'https://id-cn.heytap.com';
  const OPPO_SIGN_KEY = '4iAEb620alQ8s8c8ss8o0K8sS';
  const OPPO_SIGN_SECRET = '80620774fE983aab1E8C564e3f213b62';
  const OPPO_RSA_DER = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDpgSW5VkZ6/xvh+wMXezrOokNdiupuvuMj4RVJy44byWDupl4H37z907A26RVdFzMeyLUQB4rsDIaXdxCODlljWW+/K96uF5MsDtOFUBw7VlOclIjcYTv/YDQEul8JoXoOuy1Yf3b5sbTpTuVTcl97tAuLJ8PoGe2K7N3B1eUQqQIDAQAB';
  const OPPO_BIZ = '2CcnddQwhZJV3qjNMCzL4S'; // Official game-union H5 bizAppKey; CN suitability is runtime-verified.
  const OPPO_AC_KEY = 'CuGsbe6HdAe6vDBHFew2Di';
  const OPPO_SCENE = '7ZnczV5V9PmYBpMCKTiL'; // Official web login sceneId (prod).
  const OPPO_CALLBACK = 'https://game-login.heytap.com/game-union-h5/h5/client-login/index.html?h5-next=1&actId=90000016&bizType=ie#/login';
  // Official DingXiang slide captcha (uitb-dialog-b893b3a4.js, 2026-09-22):
  // web account captchaAppId, SDK loaded live from the official domain. The
  // author approved this remote load: a vendored copy of an active risk
  // widget would go stale and could itself be flagged.
  const OPPO_CAPTCHA_APP = '4060aaa7cc8011b8664cb83cf655c3c0';
  const OPPO_CAPTCHA_ORIGIN = 'https://captcha-sec.heytapmobi.com';
  const OPPO_CAPTCHA_SDK = OPPO_CAPTCHA_ORIGIN + '/dx-captcha/index.js';
  // Identify-engine page lives on the global domain even for CN accounts
  // (id-cn returns "path location is not configured", checked 2026-09-22).
  const OPPO_ID_ORIGIN = 'https://id.heytap.com';
  // gamesdk gateway signing (framework/network/c/c.d, disasm 2026-09-22):
  // sign = md5(oak + salt + ocs + t + id + path + query + length + longSalt),
  // MD5 lowercase hex (unioncommon util c.b). The long string is a hardcoded
  // client-side salt, not a private key in use.
  const OPPO_SDK_OAK = 'a78b923440df20ce';
  const OPPO_SDK_SALT = 'a31cfccd172003e00f5ac59c95387a3b';
  const OPPO_SDK_LONGSALT = "STORENEWMIICeAIBADANBgkqhkiG9w0BAQEFAASCAmIwggJeAgEAAoGBANYFY/UJGSzhIhpx6YM5KJ9yRHc7YeURxzb9tDvJvMfENHlnP3DtVkOIjERbpsSd76fjtZnMWY60TpGLGyrNkvuV40L15JQhHAo9yURpPQoI0eg3SLFmTEI/MUiPRCwfwYf2deqKKlsmMSysYYHX9JiGzQuWiYZaawxprSuiqDGvAgMBAAECgYEAtQ0QV00gGABISljNMy5aeDBBTSBWG2OjxJhxLRbndZM81OsMFysgC7dq+bUS6ke1YrDWgsoFhRxxTtx/2gDYciGp/c/h0Td5pGw7T9W6zo2xWI5oh1WyTnn0Xj17O9CmOk4fFDpJ6bapL+fyDy7gkEUChJ9+p66WSAlsfUhJ2TECQQD5sFWMGE2IiEuz4fIPaDrNSTHeFQQr/ZpZ7VzB2tcG7GyZRx5YORbZmX1jR7l3H4F98MgqCGs88w6FKnCpxDK3AkEA225CphAcfyiH0ShlZxEXBgIYt3V8nQuc/g2KJtiV6eeFkxmOMHbVTPGkARvt5VoPYEjwPTg43oqTDJVtlWagyQJBAOvEeJLno9aHNExvznyD4/pR4hec6qqLNgMyIYMfHCl6d3UodVvC1HO1/nMPl+4GvuRnxuoBtxj/PTe7AlUbYPMCQQDOkf4sVv58tqslO+I6JNyHy3F5RCELtuMUR6rG5x46FLqqwGQbO8ORq+m5IZHTV/Uhr4h6GXNwDQRh1EpVW0gBAkAp/v3tPI1riz6UuG0I6uf5er26yl5evPyPrjrD299L4Qy/1EIunayC7JYcSGlR01+EDYYgwUkec+QgrRC/NstV";
  // Official BSP risk-sign SDK, vendored verbatim (id.heytap.com/assets/js/bspWwas.js,
  // fetched 2026-09-21). Runs locally per request; nothing remote is loaded.
  const OPPO_BSP_SRC = "function a0_0x34d6(){var _0x2c681e=['font','GeneratorFunction','decode','arrayBuffer','vertexPosArray','path','outer','Invalid\\x20attempt\\x20to\\x20destructure\\x20non-iterable\\x20instance.\\x0aIn\\x20order\\x20to\\x20be\\x20iterable,\\x20non-array\\x20objects\\x20must\\x20have\\x20a\\x20[Symbol.iterator]()\\x20method.','little','displayName','toArray','hex','androidGlobalParamCheck','awrap','includes','try\\x20statement\\x20without\\x20catch\\x20or\\x20finally','break','lsId','AsyncIterator','Module.instantiateWasm\\x20callback\\x20failed\\x20with\\x20error:\\x20','locateFile','languages','stringify','assign','abs','Hash','MAX_VIEWPORT_DIMS','innerHeight','cwrap','connect','boolean','HEAPU8','ALPHA_BITS','globalCompositeOperation','onRuntimeInitialized','catch','DEPTH_TEST','next','threshold','ccall','indexOf','rgb(0,255,255)','hasOwnProperty','oncomplete','outerWidth','utils','UNMASKED_RENDERER_WEBGL','_pad','OfflineAudioContext','uniform2f','asm','getShaderPrecisionFormat','stackSave','padStart','falling\\x20back\\x20to\\x20ArrayBuffer\\x20instantiation','GET','inline','HIGH','async','BLUE_BITS','clearColor','outSize','stop','message','bspMr','userAgent','colorDepth','\u521d\u59cb\u5316\u5931\u8d25','_delta8','_cbf','_delta32','clientX','random_notSupported','ratio','touches','update','_invoke','shift','Content-Type','@@toStringTag','asyncIterator','_u_','FRAGMENT_SHADER','createProgram','resolve','subarray','ch32','lrt','stackAlloc','Assertion\\x20failed','Cannot\\x20call\\x20a\\x20class\\x20as\\x20a\\x20function','HEAP16','FRAGMENT','outerHeight','set','sha384','type','isGeneratorFunction','string','currentScript','host','_init','configs','error_','collect_callback_error_','getOwnPropertySymbols','createShader','HEAP8','availWidth','key','toLowerCase','executing','#069','height','precision','ripemd160','reduction','init_error_notSupported','yes','_update','linkProgram','webgl\\x20','blockSize','both\\x20async\\x20and\\x20sync\\x20fetching\\x20of\\x20the\\x20wasm\\x20failed','bufferData','getPrototypeOf','width','function','shr64_lo','platform','sum32_5','substring','rgb(255,255,0)','maxTouchPoints','warn','throw','maj32','match','setValueAtTime','HEAPF32','cpkfai','createDynamicsCompressor','display','toDataURL','Arguments','VERSION','itemSize','super_','Assertion\\x20failed:\\x20','sort','fillStyle','catchLoc','currentTime','description','sha1','toHex32','knee','url_parse_error,url_is','vertexAttribPointer','debugTest','mimeTypes','wasm_not_ready','get_bf','arc','object','appName','numItems','disconnect','Cwm\\x20fjordbank\\x20glyphs\\x20vext\\x20quiz,\\x20\ud83d\ude03','HEAPF64','normal','webdriver','return','sum64_5_hi','iii','https://dummy.com','sum32','endian','getTime','replace','1030_random_error_','alphabetic','slice','rval','precision\\x20','thisProgram','canvas','createOscillator','cbcb','unshift','cookieEnabled','same-origin','root','pathname','wrap','values','preInit','addEventListener','illegal\\x20catch\\x20attempt','getContext','ontouchstart','endsWith','canvasId','apply','prototype','undefined','suspendedStart','Set','attachShader','000','printErr','enable','invoke_init','arguments','msMaxTouchPoints','000000','random','multiply','jsdom','inherits','_sent','GREEN_BITS','bspWwas','RENDERER','FLOAT','ALIASED_LINE_WIDTH_RANGE','__await','WebGLRenderingContext','ARRAY_BUFFER','attack','uycvb','_SHADER','floor','src','TouchEvent','fillText','sum32_4','___wasm_call_ctors','myRun_error_','data:image/png;base64,','equal','...more','s0_256','tryEntries','kdni','timeZone','drawArrays','join','now','not_init','_collect_callback','precision\\x20mediump\\x20float;varying\\x20vec2\\x20varyinTexCoordinate;void\\x20main()\\x20{gl_FragColor=vec4(varyinTexCoordinate,0,1);}','buffer','call','quit','inner','isArray','queryParams','defineProperties','join32','instantiateStreaming','value','antialias','name','filter','vertexPosAttrib','shaderSource','init_timeout','toStringTag','WEBGL_debug_renderer_info','completed','wasmBinary','TRIANGLE_STRIP','monitorRunDependencies','getParameter','pending','_init_code','pop','g1_256','round','cbf_error_','tryLoc','DEPTH_BITS','sha224','MAX_TEXTURE_MAX_ANISOTROPY_EXT','[object\\x20Generator]','finallyLoc','ripemd','shr64_hi','arg','INITIAL_MEMORY','symbol','webkitOfflineAudioContext','split','reduce','rgb(255,0,255)','isTrusted','vendor','delegate','_prepareBlock','length','digest','mark','frequency','ALIASED_POINT_SIZE_RANGE','destination','create','isInitRuntime','unknown','getChannelData','constructor','toUpperCase','errorMsg','offsetUniform','LEQUAL','MAX_CUBE_MAP_TEXTURE_SIZE','bind','attribute\\x20vec2\\x20attrVertex;varying\\x20vec2\\x20varyinTexCoordinate;uniform\\x20vec2\\x20uniformOffset;void\\x20main(){varyinTexCoordinate=attrVertex+uniformOffset;gl_Position=vec4(attrVertex,0,1);}','concat','method','completion','sha256','then','LOW','ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=','utf8','The\\x20iterator\\x20does\\x20not\\x20provide\\x20a\\x20\\x27throw\\x27\\x20method','compileShader','navigationStart','sent','start','\\x20!=\\x20','setItem','application/x-www-form-urlencoded','null','enumerable','module_fatal_','push','hmac','data:application/octet-stream;base64,AGFzbQEAAAABVw5gAn9/AGADf39/AX9gAX8Bf2ADf39/AGABfwBgAABgAAF/YAJ/fwF/YAR/f39/AX9gAAF8YAV/f39/fwBgBX9/f39/AX9gBn98f39/fwF/YAN/fn8BfgIlBgFhAWEAAgFhAWIACAFhAWMACQFhAWQAAwFhAWUABgFhAWYABAMwLwIDCgMBAwAEBwABAgAFBwMCCwQAAAACBAIEBgEFDQIBBQAAAAAAAAAAAAAAAAAABAUBcAEWFgUHAQGAAoCAAgYJAX8BQYDDwQILBykKAWcCAAFoABMBaQAmAWoAIgFrAB0BbAAcAW0BAAFuACABbwAfAXAAHgkbAQBBAQsVGxoZNDMyMTAvLi0sKyopKCckJSMhCs9jL2kBA38CQCAAIgFBA3EEQANAIAEtAABFDQIgAUEBaiIBQQNxDQALCwNAIAEiAkEEaiEBIAIoAgAiA0F/cyADQYGChAhrcUGAgYKEeHFFDQALA0AgAiIBQQFqIQIgAS0AAA0ACwsgASAAawu/AwEHfyMAQRBrIggkACAIIAI2AgwjAEGgAWsiBSQAIAVBCGoiA0HQEUGQARAKGiAFIAA2AjQgBSAANgIcIAVB/////wdBfiAAayIGIAZB/////wdLGyIJNgI4IAUgACAJaiIANgIkIAUgADYCGCMAQdABayIEJAAgBCACNgLMASAEQaABaiIAQQBBKBAJIAQgBCgCzAE2AsgBAkBBACABIARByAFqIARB0ABqIAAQF0EASA0AIAMoAkxBAE4hAiADKAIAIQYgAygCSEEATARAIAMgBkFfcTYCAAsCfwJAAkAgAygCMEUEQCADQdAANgIwIANBADYCHCADQgA3AxAgAygCLCEHIAMgBDYCLAwBCyADKAIQDQELQX8gAxARDQEaCyADIAEgBEHIAWogBEHQAGogBEGgAWoQFwshACAHBH8gA0EAQQAgAygCJBEBABogA0EANgIwIAMgBzYCLCADQQA2AhwgAygCFBogA0IANwMQQQAFIAALGiADIAMoAgAgBkEgcXI2AgAgAkUNAAsgBEHQAWokACAJBEAgBSgCHCIAIAAgBSgCGEZrQQA6AAALIAVBoAFqJAAgCEEQaiQAC24BAX8jAEGAAmsiBSQAAkAgAiADTA0AIARBgMAEcQ0AIAUgAUH/AXEgAiADayIDQYACIANBgAJJIgEbEAkgAUUEQANAIAAgBUGAAhALIANBgAJrIgNB/wFLDQALCyAAIAUgAxALCyAFQYACaiQAC/ACAgJ/AX4CQCACRQ0AIAAgAToAACAAIAJqIgNBAWsgAToAACACQQNJDQAgACABOgACIAAgAToAASADQQNrIAE6AAAgA0ECayABOgAAIAJBB0kNACAAIAE6AAMgA0EEayABOgAAIAJBCUkNACAAQQAgAGtBA3EiBGoiAyABQf8BcUGBgoQIbCIANgIAIAMgAiAEa0F8cSICaiIBQQRrIAA2AgAgAkEJSQ0AIAMgADYCCCADIAA2AgQgAUEIayAANgIAIAFBDGsgADYCACACQRlJDQAgAyAANgIYIAMgADYCFCADIAA2AhAgAyAANgIMIAFBEGsgADYCACABQRRrIAA2AgAgAUEYayAANgIAIAFBHGsgADYCACACIANBBHFBGHIiAWsiAkEgSQ0AIACtQoGAgIAQfiEFIAEgA2ohAQNAIAEgBTcDGCABIAU3AxAgASAFNwMIIAEgBTcDACABQSBqIQEgAkEgayICQR9LDQALCwuABAEDfyACQYAETwRAIAAgASACEAMgAA8LIAAgAmohAwJAIAAgAXNBA3FFBEACQCAAQQNxRQRAIAAhAgwBCyACRQRAIAAhAgwBCyAAIQIDQCACIAEtAAA6AAAgAUEBaiEBIAJBAWoiAkEDcUUNASACIANJDQALCwJAIANBfHEiBEHAAEkNACACIARBQGoiBUsNAANAIAIgASgCADYCACACIAEoAgQ2AgQgAiABKAIINgIIIAIgASgCDDYCDCACIAEoAhA2AhAgAiABKAIUNgIUIAIgASgCGDYCGCACIAEoAhw2AhwgAiABKAIgNgIgIAIgASgCJDYCJCACIAEoAig2AiggAiABKAIsNgIsIAIgASgCMDYCMCACIAEoAjQ2AjQgAiABKAI4NgI4IAIgASgCPDYCPCABQUBrIQEgAkFAayICIAVNDQALCyACIARPDQEDQCACIAEoAgA2AgAgAUEEaiEBIAJBBGoiAiAESQ0ACwwBCyADQQRJBEAgACECDAELIAAgA0EEayIESwRAIAAhAgwBCyAAIQIDQCACIAEtAAA6AAAgAiABLQABOgABIAIgAS0AAjoAAiACIAEtAAM6AAMgAUEEaiEBIAJBBGoiAiAETQ0ACwsgAiADSQRAA0AgAiABLQAAOgAAIAFBAWohASACQQFqIgIgA0cNAAsLIAALFwAgAC0AAEEgcUUEQCABIAIgABAQGgsLkg0BCn8jACIJIAAQBkEQakFwcWsiAyQAIAAgACIFEAYiAkF+ciACamotAAAhByACQQNOBEAgAiEAA0AgAyAAQQFrIgRqIAUgBCAAQQNrIARBAXEbai0AADoAACAAQQNLIQggBCEAIAgNAAsLIAUtAAEhACADIAc6AAAgAyAAOgABIAIgA2pBADoAAEEAIQJBACEFIAMQBiIAQQFrIgQgACADIARqLQAAQT1GGyIAQQFrIgQgACADIARqLQAAQT1GGyEAAkAgAUUEQAJAIABBzQBJDQAgAy0ATEEKRw0AIAAgAEHNAG5rIQALAkAgAEEDcUECaw4CAgACCwwBCyAAQQNxIQggAEF8cSIKBEADQAJAIAMgAiACIANqLQAAQQpGaiILaiIELQAAIgJBwQBrIgBB/wFxQRpJDQAgAkHhAGtB/wFxQRlNBEAgAkHHAGshAAwBCyACQTBrQf8BcUEJTQRAIAJBBGohAAwBC0E+IQAgAkErRg0AQT8gAiACQS9GGyEACyAAQQJ0IQYCQCAELQABIgJBwQBrIgBB/wFxQRpJDQAgAkHhAGtB/wFxQRlNBEAgAkHHAGshAAwBCyACQTBrQf8BcUEJTQRAIAJBBGohAAwBC0E+IQAgAkErRg0AQT8gAiACQS9GGyEACyABIAVqIgcgAEEEdkEDcSAGcjoAAAJAIAQtAAEiAkHBAGsiAEH/AXFBGkkNACACQeEAa0H/AXFBGU0EQCACQccAayEADAELIAJBMGtB/wFxQQlNBEAgAkEEaiEADAELQT4hACACQStGDQBBPyACIAJBL0YbIQALIABBGHRBGHVBBHQhBgJAIAQtAAIiAkHBAGsiAEH/AXFBGkkNACACQeEAa0H/AXFBGU0EQCACQccAayEADAELIAJBMGtB/wFxQQlNBEAgAkEEaiEADAELQT4hACACQStGDQBBPyACIAJBL0YbIQALIAcgAEEYdEEYdUECdiAGcjoAAQJAIAQtAAIiAkHBAGsiAEH/AXFBGkkNACACQeEAa0H/AXFBGU0EQCACQccAayEADAELIAJBMGtB/wFxQQlNBEAgAkEEaiEADAELQT4hACACQStGDQBBPyACIAJBL0YbIQALIABBBnQhBgJAIAQtAAMiAEHBAGsiAkH/AXFBGkkNACAAQeEAa0H/AXFBGU0EQCAAQccAayECDAELIABBMGtB/wFxQQlNBEAgAEEEaiECDAELQT4hAiAAQStGDQBBPyAAIABBL0YbIQILIAcgAiAGcjoAAiAFQQNqIQUgC0EEaiICIApJDQALCwJAAkAgCEECaw4CAAECCwJAIAIgA2oiAy0AACIAQcEAayICQf8BcUEaSQ0AIABB4QBrQf8BcUEZTQRAIABBxwBrIQIMAQsgAEEwa0H/AXFBCU0EQCAAQQRqIQIMAQtBPiECIABBK0YNAEE/IAAgAEEvRhshAgsgAkECdCEEAkAgAy0AASIAQcEAayICQf8BcUEaSQ0AIABB4QBrQf8BcUEZTQRAIABBxwBrIQIMAQsgAEEwa0H/AXFBCU0EQCAAQQRqIQIMAQtBPiECIABBK0YNAEE/IAAgAEEvRhshAgsgASAFaiACQQR2QQNxIARyOgAADAELAkAgAiADaiICLQAAIgNBwQBrIgBB/wFxQRpJDQAgA0HhAGtB/wFxQRlNBEAgA0HHAGshAAwBCyADQTBrQf8BcUEJTQRAIANBBGohAAwBC0E+IQAgA0ErRg0AQT8gAyADQS9GGyEACyAAQQJ0IQQCQCACLQABIgNBwQBrIgBB/wFxQRpJDQAgA0HhAGtB/wFxQRlNBEAgA0HHAGshAAwBCyADQTBrQf8BcUEJTQRAIANBBGohAAwBC0E+IQAgA0ErRg0AQT8gAyADQS9GGyEACyABIAVqIgMgAEEEdkEDcSAEcjoAAAJAIAItAAEiAUHBAGsiAEH/AXFBGkkNACABQeEAa0H/AXFBGU0EQCABQccAayEADAELIAFBMGtB/wFxQQlNBEAgAUEEaiEADAELQT4hACABQStGDQBBPyABIAFBL0YbIQALIABBGHRBGHVBBHQhAQJAIAItAAIiAEHBAGsiAkH/AXFBGkkNACAAQeEAa0H/AXFBGU0EQCAAQccAayECDAELIABBMGtB/wFxQQlNBEAgAEEEaiECDAELQT4hAiAAQStGDQBBPyAAIABBL0YbIQILIAMgAkEYdEEYdUECdiABcjoAAQsgCSQAC3UCAnwBfiAAAn4QAiIBRAAAAAAAQI9AoyICmUQAAAAAAADgQ2MEQCACsAwBC0KAgICAgICAgIB/CyIDPgIAIAACfyABIANC6Ad+uaFEAAAAAABAj0CiIgGZRAAAAAAAAOBBYwRAIAGqDAELQYCAgIB4CzYCBAurAgIEfwF+IwBBMGsiAiQAIAIgADYCLEHIuQEgAiABakEraq03AwBBACEBA0BByLkBQci5ASkDAEKt/tXk1IX9qNgAfkIBfCIGNwMAIAZCIYinQf8BcCEDAkACQAJAAkAgAUEGaw4DAAIBAgsgAiADQRB0QRB1QQ9vNgIQIAIoAixBlAggAkEQahAHDAILIAIoAiwhBEHIuQFByLkBKQMAQq3+1eTUhf2o2AB+QgF8IgY3AwAgBkIhiKchBSACIANBEHRBEHVBD282AiQgAiAFQQNxQe8IaiwAADYCICAEQY8IIAJBIGoQBwwBCyACIAM2AgAgAigCLEGACCACEAcLIAIgAigCLCIDQQJqNgIsIAFBAWoiAUEQRw0ACyADQQA6AAIgAkEwaiQAIAAL0QEBAX8CQAJAIAAgAXNBA3EEQCABLQAAIQIMAQsgAUEDcQRAA0AgACABLQAAIgI6AAAgAkUNAyAAQQFqIQAgAUEBaiIBQQNxDQALCyABKAIAIgJBf3MgAkGBgoQIa3FBgIGChHhxDQADQCAAIAI2AgAgASgCBCECIABBBGohACABQQRqIQEgAkGBgoQIayACQX9zcUGAgYKEeHFFDQALCyAAIAI6AAAgAkH/AXFFDQADQCAAIAEtAAEiAjoAASAAQQFqIQAgAUEBaiEBIAINAAsLC8ABAQN/AkAgASACKAIQIgMEfyADBSACEBENASACKAIQCyACKAIUIgVrSwRAIAIgACABIAIoAiQRAQAPCwJAIAIoAlBBAEgEQEEAIQMMAQsgASEEA0AgBCIDRQRAQQAhAwwCCyAAIANBAWsiBGotAABBCkcNAAsgAiAAIAMgAigCJBEBACIEIANJDQEgACADaiEAIAEgA2shASACKAIUIQULIAUgACABEAoaIAIgAigCFCABajYCFCABIANqIQQLIAQLWQEBfyAAIAAoAkgiAUEBayABcjYCSCAAKAIAIgFBCHEEQCAAIAFBIHI2AgBBfw8LIABCADcCBCAAIAAoAiwiATYCHCAAIAE2AhQgACABIAAoAjBqNgIQQQALqwUBE38jAEGAAmsiBiQAQcC5AS0AAEUEQANAIANBAnQiAkHAtwFqIAJBsAtqKAIAQdHvjq56czYCACACQQRyIgRBwLcBaiAEQbALaigCAEHR746uenM2AgAgAkEIciIEQcC3AWogBEGwC2ooAgBB0e+OrnpzNgIAIAJBDHIiAkHAtwFqIAJBsAtqKAIAQdHvjq56czYCACADQQRqIgNBwABHDQALQcC5AUEBOgAAC0EAIQJBACEDA0AgBiADQQJ0aiABIAJBA3JqLQAAIAEgAkEBcmotAABBEHQgASACai0AAEEYdHIgASACQQJyai0AAEEIdHJyNgIAIAJBBGohAiADQQFqIgNBEEcNAAtBECEBIAYoAgAhBQNAIAYgAUECdGoiAyADQRxrKAIAIANBCGsoAgAiAkEPdyACQQ13cyACQQp2c2ogBWogA0E8aygCACIFQRl3IAVBDndzIAVBA3ZzajYCACABQQFqIgFBwABHDQALQQAhBSAAKAJQIg0hCiAAKAJsIg4hCyAAKAJoIg8hCCAAKAJkIhAhCSAAKAJgIhEhByAAKAJcIhIhDCAAKAJYIhMhBCAAKAJUIhQhAQNAIAEhAiAFQQJ0IgFBwLcBaigCACAHIgNBGncgA0EVd3MgA0EHd3MgAyAJcWogC2ogA0F/cyAIcWpqIAEgBmooAgBqIgcgCiIBQR53IAFBE3dzIAFBCndzIAEgAiAEc3EgAiAEcXNqaiEKIAcgDGohByAIIQsgCSEIIAMhCSAEIQwgAiEEIAVBAWoiBUHAAEcNAAsgACALIA5qNgJsIAAgCCAPajYCaCAAIAkgEGo2AmQgACAHIBFqNgJgIAAgDCASajYCXCAAIAQgE2o2AlggACABIBRqNgJUIAAgCiANajYCUCAGQYACaiQACxYAQejCAUH4wQE2AgBBoMIBQSo2AgALmQIAIABFBEBBAA8LAn8CQCAABH8gAUH/AE0NAQJAQejCASgCACgCAEUEQCABQYB/cUGAvwNGDQMMAQsgAUH/D00EQCAAIAFBP3FBgAFyOgABIAAgAUEGdkHAAXI6AABBAgwECyABQYBAcUGAwANHIAFBgLADT3FFBEAgACABQT9xQYABcjoAAiAAIAFBDHZB4AFyOgAAIAAgAUEGdkE/cUGAAXI6AAFBAwwECyABQYCABGtB//8/TQRAIAAgAUE/cUGAAXI6AAMgACABQRJ2QfABcjoAACAAIAFBBnZBP3FBgAFyOgACIAAgAUEMdkE/cUGAAXI6AAFBBAwECwtBxLkBQRk2AgBBfwVBAQsMAQsgACABOgAAQQELC7wCAAJAAkACQAJAAkACQAJAAkACQAJAAkAgAUEJaw4SAAgJCggJAQIDBAoJCgoICQUGBwsgAiACKAIAIgFBBGo2AgAgACABKAIANgIADwsgAiACKAIAIgFBBGo2AgAgACABMgEANwMADwsgAiACKAIAIgFBBGo2AgAgACABMwEANwMADwsgAiACKAIAIgFBBGo2AgAgACABMAAANwMADwsgAiACKAIAIgFBBGo2AgAgACABMQAANwMADwsgAiACKAIAQQdqQXhxIgFBCGo2AgAgACABKwMAOQMADwsgACACQQARAAALDwsgAiACKAIAIgFBBGo2AgAgACABNAIANwMADwsgAiACKAIAIgFBBGo2AgAgACABNQIANwMADwsgAiACKAIAQQdqQXhxIgFBCGo2AgAgACABKQMANwMAC3IBA38gACgCACwAAEEwa0EKTwRAQQAPCwNAIAAoAgAhA0F/IQEgAkHMmbPmAE0EQEF/IAMsAABBMGsiASACQQpsIgJqIAFB/////wcgAmtKGyEBCyAAIANBAWo2AgAgASECIAMsAAFBMGtBCkkNAAsgAguZFQISfwJ+IwBB0ABrIgckACAHIAE2AkwgB0E3aiEVIAdBOGohEQJAAkACQAJAA0AgASEJIAVB/////wcgDWtKDQEgBSANaiENAkACQAJAIAkiBS0AACIGBEADQAJAAkAgBkH/AXEiAUUEQCAFIQEMAQsgAUElRw0BIAUhBgNAIAYtAAFBJUcEQCAGIQEMAgsgBUEBaiEFIAYtAAIhCiAGQQJqIgEhBiAKQSVGDQALCyAFIAlrIgVB/////wcgDWsiFkoNByAABEAgACAJIAUQCwsgBQ0GIAcgATYCTCABQQFqIQVBfyEPAkAgASwAAUEwa0EKTw0AIAEtAAJBJEcNACABQQNqIQUgASwAAUEwayEPQQEhEgsgByAFNgJMQQAhCwJAIAUsAAAiBkEgayIBQR9LBEAgBSEKDAELIAUhCkEBIAF0IgFBidEEcUUNAANAIAcgBUEBaiIKNgJMIAEgC3IhCyAFLAABIgZBIGsiAUEgTw0BIAohBUEBIAF0IgFBidEEcQ0ACwsCQCAGQSpGBEACfwJAIAosAAFBMGtBCk8NACAKLQACQSRHDQAgCiwAAUECdCAEakHAAWtBCjYCACAKQQNqIQZBASESIAosAAFBA3QgA2pBgANrKAIADAELIBINBiAKQQFqIQYgAEUEQCAHIAY2AkxBACESQQAhEAwDCyACIAIoAgAiAUEEajYCAEEAIRIgASgCAAshECAHIAY2AkwgEEEATg0BQQAgEGshECALQYDAAHIhCwwBCyAHQcwAahAWIhBBAEgNCCAHKAJMIQYLQQAhBUF/IQgCfyAGLQAAQS5HBEAgBiEBQQAMAQsgBi0AAUEqRgRAAn8CQCAGLAACQTBrQQpPDQAgBi0AA0EkRw0AIAYsAAJBAnQgBGpBwAFrQQo2AgAgBkEEaiEBIAYsAAJBA3QgA2pBgANrKAIADAELIBINBiAGQQJqIQFBACAARQ0AGiACIAIoAgAiBkEEajYCACAGKAIACyEIIAcgATYCTCAIQX9zQR92DAELIAcgBkEBajYCTCAHQcwAahAWIQggBygCTCEBQQELIRMCQANAIAUhDiABIgwsAAAiBUH7AGtBRkkNASAMQQFqIQEgBSAOQTpsakGvDWotAAAiBUEBa0EISQ0ACyAHIAE2AkxBHCEKAkACQCAFQRtHBEAgBUUNDCAPQQBOBEAgBCAPQQJ0aiAFNgIAIAcgAyAPQQN0aikDADcDQAwCCyAARQ0JIAdBQGsgBSACEBUMAgsgD0EATg0LC0EAIQUgAEUNCAsgC0H//3txIgYgCyALQYDAAHEbIQtBACEPQYUIIRQgESEKAkACQAJAAn8CQAJAAkACQAJ/AkACQAJAAkACQAJAAkAgDCwAACIFQV9xIAUgBUEPcUEDRhsgBSAOGyIFQdgAaw4hBBUVFRUVFRUVDhUPBg4ODhUGFRUVFQIFAxUVCRUBFRUEAAsCQCAFQcEAaw4HDhULFQ4ODgALIAVB0wBGDQkMFAsgBykDQCEXQYUIDAULQQAhBQJAAkACQAJAAkACQAJAIA5B/wFxDggAAQIDBBsFBhsLIAcoAkAgDTYCAAwaCyAHKAJAIA02AgAMGQsgBygCQCANrDcDAAwYCyAHKAJAIA07AQAMFwsgBygCQCANOgAADBYLIAcoAkAgDTYCAAwVCyAHKAJAIA2sNwMADBQLIAhBCCAIQQhLGyEIIAtBCHIhC0H4ACEFCyARIQkgBUEgcSEMIAcpA0AiF1BFBEADQCAJQQFrIgkgF6dBD3FBwBFqLQAAIAxyOgAAIBdCD1YhBiAXQgSIIRcgBg0ACwsgBykDQFANAyALQQhxRQ0DIAVBBHZBhQhqIRRBAiEPDAMLIBEhBSAHKQNAIhdQRQRAA0AgBUEBayIFIBenQQdxQTByOgAAIBdCB1YhCSAXQgOIIRcgCQ0ACwsgBSEJIAtBCHFFDQIgCCARIAlrIgVBAWogBSAISBshCAwCCyAHKQNAIhdCAFMEQCAHQgAgF30iFzcDQEEBIQ9BhQgMAQsgC0GAEHEEQEEBIQ9BhggMAQtBhwhBhQggC0EBcSIPGwshFCARIQYCQCAXQoCAgIAQVARAIBchGAwBCwNAIAZBAWsiBiAXIBdCCoAiGEIKfn2nQTByOgAAIBdC/////58BViEFIBghFyAFDQALCyAYpyIJBEADQCAGQQFrIgYgCSAJQQpuIgVBCmxrQTByOgAAIAlBCUshDCAFIQkgDA0ACwsgBiEJCyATQQAgCEEASBsNDyALQf//e3EgCyATGyELAkAgBykDQCIYQgBSDQAgCA0AIBEiCSEKQQAhCAwNCyAIIBhQIBEgCWtqIgUgBSAISBshCAwMCwJ/IAhB/////wcgCEH/////B0kbIgoiDEEARyELAkACQAJAIAcoAkAiBUH0CCAFGyIJIg5BA3FFDQAgDEUNAANAIA4tAABFDQIgDEEBayIMQQBHIQsgDkEBaiIOQQNxRQ0BIAwNAAsLIAtFDQELAkACQCAOLQAARQ0AIAxBBEkNAANAIA4oAgAiBUF/cyAFQYGChAhrcUGAgYKEeHENAiAOQQRqIQ4gDEEEayIMQQNLDQALCyAMRQ0BCwNAIA4gDi0AAEUNAhogDkEBaiEOIAxBAWsiDA0ACwtBAAsiBSAJayAKIAUbIgUgCWohCiAIQQBOBEAgBiELIAUhCAwMCyAGIQsgBSEIIAotAAANDgwLCyAIBEAgBygCQAwCC0EAIQUgAEEgIBBBACALEAgMAgsgB0EANgIMIAcgBykDQD4CCCAHIAdBCGoiBTYCQEF/IQggBQshBkEAIQUCQANAIAYoAgAiCUUNAQJAIAdBBGogCRAUIgpBAEgiCQ0AIAogCCAFa0sNACAGQQRqIQYgCCAFIApqIgVLDQEMAgsLIAkNDgtBPSEKIAVBAEgNDCAAQSAgECAFIAsQCCAFRQRAQQAhBQwBC0EAIQogBygCQCEGA0AgBigCACIJRQ0BIAdBBGogCRAUIgkgCmoiCiAFSw0BIAAgB0EEaiAJEAsgBkEEaiEGIAUgCksNAAsLIABBICAQIAUgC0GAwABzEAggECAFIAUgEEgbIQUMCQsgE0EAIAhBAEgbDQlBPSEKIAAgBysDQCAQIAggCyAFQQARDAAiBUEATg0IDAoLIAcgBykDQDwAN0EBIQggFSEJIAYhCwwFCyAHIAw2AkwMAwsgBS0AASEGIAVBAWohBQwACwALIAANByASRQ0CQQEhBQNAIAQgBUECdGooAgAiAARAIAMgBUEDdGogACACEBVBASENIAVBAWoiBUEKRw0BDAkLC0EBIQ0gBUEKTw0HA0AgBCAFQQJ0aigCAA0BIAVBAWoiBUEKRw0ACwwHC0EcIQoMBAsgCCAKIAlrIgwgCCAMShsiBkH/////ByAPa0oNAkE9IQogECAGIA9qIgggCCAQSBsiBSAWSg0DIABBICAFIAggCxAIIAAgFCAPEAsgAEEwIAUgCCALQYCABHMQCCAAQTAgBiAMQQAQCCAAIAkgDBALIABBICAFIAggC0GAwABzEAgMAQsLQQAhDQwDC0E9IQoLQcS5ASAKNgIAC0F/IQ0LIAdB0ABqJAAgDQsPAEHwFhAGQfAWaiAAEA8LYgEDfxAEIgEEQCABEAYhAiAAIAAgACgCuHAiA2pBOGoiBDYCACAAIAIgA2pBAWo2ArhwIAQgARAPDwsgACAAKAK4cCIBQQFqNgK4cCAAIAAgAWoiAEE4ajYCACAAQQA6ADgLDAAgAEGQFRAANgIoCwoAIABBADYCxHALvgIBBX8jAEGwAWsiBCQAQegWLQAARQRAIARBgAlBpQEQCiIBQZAVEAxBwQhBoBYQDEGQFRAAIQJBgBVBgBUoAgAiA0EBajYCACABQagBaiIFEA1BwBYgASgCrAEgASgCqAEgAyACIAVqampqEA4aQegWQQE6AAALQbCXAUKAgICAEDcCAEGslwEgADYCAEHwJkIANwIAQfgmQgA3AgBBgCdCADcCAEGIJ0IANwIAQZAnQgA3AgBBqJcBQQA2AgBBASECQQAhAQNAIAFBIkwEQEGwlwEgAUECaiIANgIAIAFBsApqLQAAQdoAcyIDQRBNBH9B8CYgAUGxCmotAABB2gBzQRh0QRh1IANBAnRB4ApqKAIAEQAAQbSXASgCACECQbCXASgCAAUgAAshASACDQELCyAEQbABaiQAQbiXAQsTAEHwFiAAEA9B4BIQGEHAFhAYCxAAIwAgAGtBcHEiACQAIAALBgAgACQACwQAIwALqQEBBH8gACgCVCIDKAIEIgUgACgCFCAAKAIcIgZrIgQgBCAFSxsiBARAIAMoAgAgBiAEEAoaIAMgAygCACAEajYCACADIAMoAgQgBGsiBTYCBAsgAygCACEEIAUgAiACIAVLGyIFBEAgBCABIAUQChogAyADKAIAIAVqIgQ2AgAgAyADKAIEIAVrNgIECyAEQQA6AAAgACAAKAIsIgE2AhwgACABNgIUIAILvgEBBX8jAEGwAWsiACQAQegWLQAARQRAIABBgAlBpQEQCiIBQZAVEAxBwQhBoBYQDEGQFRAAIQJBgBVBgBUoAgAiA0EBajYCACABQagBaiIEEA1BwBYgASgCrAEgASgCqAEgAyACIARqampqEA4aQegWQQE6AAALQZAVEAAhAUGAFUGAFSgCACICQQFqNgIAIABBqAFqEA0gACAAKAKsASAAKAKoASACIAEgACAAampqamoQDhAFIABBsAFqJAALBABCAAsEAEEAC/YCAQd/IwBBIGsiAyQAIAMgACgCHCIENgIQIAAoAhQhBSADIAI2AhwgAyABNgIYIAMgBSAEayIBNgIUIAEgAmohBUECIQcCfwJAAkACQCAAKAI8IANBEGoiAUECIANBDGoQASIEBH9BxLkBIAQ2AgBBfwVBAAsEQCABIQQMAQsDQCAFIAMoAgwiBkYNAiAGQQBIBEAgASEEDAQLIAEgBiABKAIEIghLIglBA3RqIgQgBiAIQQAgCRtrIgggBCgCAGo2AgAgAUEMQQQgCRtqIgEgASgCACAIazYCACAFIAZrIQUgACgCPCAEIgEgByAJayIHIANBDGoQASIGBH9BxLkBIAY2AgBBfwVBAAtFDQALCyAFQX9HDQELIAAgACgCLCIBNgIcIAAgATYCFCAAIAEgACgCMGo2AhAgAgwBCyAAQQA2AhwgAEIANwMQIAAgACgCAEEgcjYCAEEAIAdBAkYNABogAiAEKAIEawshACADQSBqJAAgAAt1AQR/IwBBsAFrIgAkACAAQYAJQaUBEAoiAEGQFRAMQcEIQaAWEAxBkBUQACEBQYAVQYAVKAIAIgJBAWo2AgAgAEGoAWoiAxANQcAWIAAoAqwBIAAoAqgBIAIgASADampqahAOGkHoFkEBOgAAIABBsAFqJAALRwEBfiMAQRBrIgEkACAAKQIUIQIgASAAKAIgNgIEIAFBguifBjYCACABIAJCIIk3AwggAEHI8ABqQaYIIAEQByABQRBqJAAL1gkCBn8BfiAAIAAoArhwIgFBwQBqNgK4cCAAIAAgAWpBOGoiATYCICAAKAIcIQAjAEGgBGsiAiQAIAJCq7OP/MGjs/DbADcDmAEgAkL/pLmIxZHagpt/NwOQASACQvLmu+Ojp/2npX83A4gBIAJC58yn0NbQ67O7fzcDgAEgAkIANwN4IAJBADYCcCAAEAYiBQRAA0AgAkEwaiADaiAAIARqLQAAOgAAIAIgAigCcEEBaiIDNgJwIANBwABGBEAgAkEwaiIDIAMQEiACQQA2AnAgAiACKQN4QoAEfDcDeEEAIQMLIARBAWoiBCAFRw0ACwsgAkEwaiIAKAJAIgMgAGpBgAE6AAAgA0EBaiEEAkAgA0E3TQRAIARBN0sNASAAIARqQQBBNyADaxAJDAELIARBP00EQCAAIARqQQBBPyADaxAJCyAAIAAQEiAAQgA3AzAgAEIANwMoIABCADcDICAAQgA3AxggAEIANwMQIABCADcDCCAAQgA3AwALIAAgACkDSCAAKAJAQQN0rXwiCDcDSCAAIAg8AD8gACAIQgiIPAA+IAAgCEIQiDwAPSAAIAhCGIg8ADwgACAIQiCIPAA7IAAgCEIoiDwAOiAAIAhCMIg8ADkgACAIQjiIPAA4IAAgABASIAIgAC0AUzoAECACIAAtAFc6ABQgAiAALQBbOgAYIAIgAC0AXzoAHCACIAAtAGM6ACAgAiAALQBnOgAkIAIgAC0AazoAKCACIAAtAG86ACwgAiAALwFSOgARIAIgAC8BVjoAFSACIAAvAVo6ABkgAiAALwFeOgAdIAIgAC8BYjoAISACIAAvAWY6ACUgAiAALwFqOgApIAIgAC8BbjoALSACIAAoAlBBCHY6ABIgAiAAKAJUQQh2OgAWIAIgACgCWEEIdjoAGiACIAAoAlxBCHY6AB4gAiAAKAJgQQh2OgAiIAIgACgCZEEIdjoAJiACIAAoAmhBCHY6ACogAiAAKAJsQQh2OgAuIAIgACgCUDoAEyACIAAoAlQ6ABcgAiAAKAJYOgAbIAIgACgCXDoAHyACIAAoAmA6ACMgAiAAKAJkOgAnIAIgACgCaDoAKyACIAAoAmw6AC9BACEDIAJBoANqQQBBgAEQCSACQaABakEAQYACEAkDQCACIAJBEGogA2otAAA2AgAgAkGgA2oiAEGACCACEAdBwAAhBSACQaABaiIGEAYgBmohBANAIAAtAAAiBwRAIAQgBzoAACAEQQFqIQQgAEEBaiEAIAVBAWsiBQ0BCwsgBEEAOgAAIAYhACADQQFqIgNBIEcNAAtBwAAhAwJAAkACQAJAIAAgASIEc0EDcQ0AQQEhBQJAIABBA3FFDQADQCAEIAAtAAAiBToAACAFRQ0FIARBAWohBCADQQFrIgNBAEchBSAAQQFqIgBBA3FFDQEgAw0ACwsgBUUNAiAALQAARQ0DIANBBEkNAANAIAAoAgAiBUF/cyAFQYGChAhrcUGAgYKEeHENAiAEIAU2AgAgBEEEaiEEIABBBGohACADQQRrIgNBA0sNAAsLIANFDQELA0AgBCAALQAAIgU6AAAgBUUNAiAEQQFqIQQgAEEBaiEAIANBAWsiAw0ACwtBACEDCyAEQQAgAxAJIAFBADoAQCACQaAEaiQAC5EBAQp/IwBBEGsiASQAIAAoAggiAhAGIQMgACgCGCIEEAYhBSAAKAIUIgYQBiEHIAAoAgwiCBAGIQkgACAAIAAoArhwIgpqQThqIgs2AhwgACAKIAkgByADIAVqampqQQRqNgK4cCABIAg2AgwgASAGNgIIIAEgBDYCBCABIAI2AgAgC0G1CCABEAcgAUEQaiQAC7oBAQV/IwBB4ABrIgEkACAAKAIoIQMgACgCuHAhAkGAFUGAFSgCACIFQQFqNgIAIAAgACACakE4aiIENgIYIAAgAkE0ajYCuHAgAUHYAGoQDSABQTBqIgYgASgCXCIAIAEoAlgiAiAFIAMgBmogBGpqamoQDiEDIAEgAEHoB22sIAKsQugHfnw3AxAgAUEiaiIAQeoIIAFBEGoQByABIAM2AgQgASAANgIAIARBrgggARAHIAFB4ABqJAALDQAgACAAKAK8cDYCDAsKACAAQaAWNgIIC/kGAQt/IwBBEGsiASQAIAAoAhAiAxAGIQIgAUEANgIMIAAgACAAKAK4cCIEakE4aiIINgIUIAAgBCACQQNtIgBBAnQiBkEFaiAGQQFyIAIgAEEDbGsbakEEajYCuHBBACEGIwAiCiAAQQJ0IgRBBWogBEEBciACIABBA2xrG0EPakFwcWsiBCQAIAIhACABQQxqIQUCQCADIgJFDQAgAEUNACAAQQMgAEEDbyIDa0EAIAMbIgdqIgNBA3RBBm0hCQJAIANBAEwNACAHRQRAIAQhAANAIAAgAiwAAEECdUGwDWotAAA6AAAgACACLQAAQQR0QTBxIAItAAFBBHZyQbANai0AADoAASAAIAItAAFBAnRBPHEgAi0AAkEGdnJBsA1qLQAAOgACIAAgAi0AAkE/cUGwDWotAAA6AAMgAkEDaiECIABBBGohACAGQQNqIgYgA0gNAAsMAQsgA0EDayELIAdBAWshByAEIQADQCAAIAIsAABBAnVBsA1qLQAAOgAAAkAgAAJ/IAYgC0YEQAJAAkAgBw4CAAEECyAAIAItAABBBHRBMHEgAi0AAUEEdnJBsA1qLQAAOgABIAAgAi0AAUECdEE8cUGwDWotAAA6AAJBPQwCCyACLQAAIQwgAEE9OgACIAAgDEEEdEEwcUGwDWotAAA6AAFBPQwBCyAAIAItAABBBHRBMHEgAi0AAUEEdnJBsA1qLQAAOgABIAAgAi0AAUECdEE8cSACLQACQQZ2ckGwDWotAAA6AAIgAi0AAkE/cUGwDWotAAALOgADCyACQQNqIQIgAEEEaiEAIAZBA2oiBiADSA0ACwsgBQRAIAUgCTYCAAsgBCAJakEAOgAAC0EAIQNBACEAQQAhBiAFKAIAIgVBAmshByAELQAAIQICQCAFQQNIDQAgBUEDRwRAIAdBfnEhCQNAIAMgCGogBCADQQJqIgBqLQAAOgAAIAggA0EBciIDaiADIARqLQAAOgAAIAAhAyAGQQJqIgYgCUcNAAsLIAVBAXFFDQAgACAIaiAEIAAgAEECaiAAQQFxG2otAAA6AAALIAcgCGogBUEBcQR/IAQgB2otAAAFIAILOgAAIAVBgICAgHhHBEAgBUEBayIAQQFxBEAgACAEai0AACECCyAAIAhqIAI6AAALIAUgCGpBADoAACAKJAAgAUEQaiQAC5oCACAAQcAWNgIQIAAoAgQQBkF2TARAQbQTKAIAGgJAQX9BAAJ/QZgIEAYiAAJ/QbQTKAIAQQBIBEBBmAggAEHoEhAQDAELQZgIIABB6BIQEAsiASAARg0AGiABCyAARxtBAEgNAAJAQbgTKAIAQQpGDQBB/BIoAgAiAEH4EigCAEYNAEH8EiAAQQFqNgIAIABBCjoAAAwBCyMAQRBrIgAkACAAQQo6AA8CQAJAQfgSKAIAIgEEfyABBUHoEhARDQJB+BIoAgALQfwSKAIAIgFGDQBBuBMoAgBBCkYNAEH8EiABQQFqNgIAIAFBCjoAAAwBC0HoEiAAQQ9qQQFBjBMoAgARAQBBAUcNACAALQAPGgsgAEEQaiQACwsLDAAgACAAKAIENgIQCxQAIAAgACgCwHAgAUEBdGo2AsBwC2cBBn8jAEEQayIBJAAgACgCBCICEAYhAyAAKAIAIgQQBiEFIAAgACAAKAK4cCIGakE4aiIHNgIQIAAgBiADIAVqakEDajYCuHAgASAENgIEIAEgAjYCACAHQa4IIAEQByABQRBqJAALIQAgACgCABAGQQFMBEAgACAAKALAcCABQQF0ajYCwHALCyEAIAAoAgQQBkECTARAIAAgACgCwHAgAUEBdGo2AsBwCwsKACAAQfAWNgIECwv2CBcAQYAIC6QCJTAyeAAtKyAgIDBYMHgAJWMleAA0JXgAcmVzZXJ2ZSBwcmludAAlZDo6JXM6OiVzOjolcwAlcwolcwolcwolcwBKbVloWnpNbFpETmtSalppRkRZaUZ6TmhRRFo1UUdNM1JqT21SV05oACVsbGQAODlhYgAobnVsbCkAAAAAAABZV0tnUkhjNVZHWnZCaVp3SlhibUozWXQ1V1pqQVNQaDBUSmdWM1p1VkdhbTVXWmxjQ0pnWWlkZ2xIWnc5V0ltQkhjbFptY3YxbWJoTm1MbDVtZHZBeVA5MFRKZ1oyYjFObWEwOVdKdWt5ZWdCM2NsWm1jdjFtYmhObUxsNW1kdmd5SXBvQ014QURmd1ZXY3NVMmVnUjBkaFVHYnU5bUszbENhOQBBsAoLJFtaWFpZWl5fX1hcWl1ZUlpdW1NaUFpRWlZaV1pUWlVaSlpaWgBB4AoLQQEAAAACAAAAAwAAAAQAAAAFAAAABgAAAAcAAAAIAAAACQAAAAoAAAALAAAADAAAAA0AAAAOAAAADwAAABAAAAARAEGwCwuBA0mYSedA8/TUHkwDEHRsdkyKdZWcIKYy/HU1/DcE6d8OSR3EfdDsQLdvMvKBEsrP8KXqfdcvBh0ldrEfPqVGWGQQ3lhBV/B9ShcqAqodFs+BvpsqiHszt+8NHnP5Cz8604Pm/T28cfINGZDAFRbImhoivCNjliZkcIDUCaO2nuqxVL10gumW2Ist2u/owrr79oXEycBqvanT/34BJFSbsTdwX3wHmtHZDaE8iGdy5q9iyF9RdPWxWnNUgs1RoReptcd2Z7zZ2/S7ncCLgmQLc5Fiu9+cmx0b6559X/4i2O3NPzVM0b7UZt3Fzwsh2bUEKStIfTU625MBJhQ6GyPPsmNBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvGQAKABkZGQAAAAAFAAAAAAAACQAAAAALAAAAAAAAAAAZABEKGRkZAwoHAAEACQsYAAAJBgsAAAsABhkAAAAZGRkAQcEOCyEOAAAAAAAAAAAZAAoNGRkZAA0AAAIACQ4AAAAJAA4AAA4AQfsOCwEMAEGHDwsVEwAAAAATAAAAAAkMAAAAAAAMAAAMAEG1DwsBEABBwQ8LFQ8AAAAEDwAAAAAJEAAAAAAAEAAAEABB7w8LARIAQfsPCx4RAAAAABEAAAAACRIAAAAAABIAABIAABoAAAAaGhoAQbIQCw4aAAAAGhoaAAAAAAAACQBB4xALARQAQe8QCxUXAAAAABcAAAAACRQAAAAAABQAABQAQZ0RCwEWAEGpEQsnFQAAAAAVAAAAAAkWAAAAAAAWAAAWAAAwMTIzNDU2Nzg5QUJDREVGAEH0EQsBFQBBnBILCP//////////AEHgEgsJOjoAAAAAAAAFAEH0EgsBEgBBjBMLDhMAAAAUAAAA2FwAAAAEAEGkEwsBAQBBtBMLBf////8K','sha','forEach','UNMASKED_VENDOR_WEBGL','rotr64_lo','info','rangeMax','pct','startRendering','preRun','closePath','charAt','_digest','MAX_RENDERBUFFER_SIZE','test','wdt','init','init_fatal_','nodejsTest','amd','sum64_lo','hmacStrength','13004137','split32','MEDIUM','STENCIL_BITS','number','Object','setStatus','useProgram','exports','Generator\\x20is\\x20already\\x20running','fromCharCode','postRun','Aborted(','sum64_5_lo','get','touchCheck','keys','dispatchException','abrupt','blob:','timeOrigin','afterLoc','Generator','stack','getContextAttributes','init_error_','resolvedOptions','rect','rangeMin','createElement','startsWith','sum32_3','toString','DateTimeFormat','every','__run_env_collect','prev','fill','RED_BITS','__proto__','onAbort','innerWidth','instance','collect_callback','_dx_tmp','instantiate','MAX_VERTEX_UNIFORM_VECTORS','getItem','print','charCodeAt','Module_undefined','complete','pendingTotal','getExtension','clear','BlockHash','done','search','clientY','getSupportedExtensions','getOwnPropertyDescriptor','instantiateWasm','unknown_env','@@iterator','common','setPrototypeOf','padLength','hlct','nextLoc','11pt\\x20Arial','cbcb_error_','module_fatal','big','screen','iterator','sum64_4_hi','::null::null::','HEAP32','defineProperty','MAX_TEXTURE_SIZE','Module','getOwnPropertyDescriptors','VERTEX_SHADER','MAX_COMBINED_TEXTURE_IMAGE_UNITS','_m_','continue','HEAPU32','timeStamp','getUniformLocation','sum64','touchstart','random_fatal_','_rdm_graph','end','ft_1','beginPath','empty','MAX_VERTEX_TEXTURE_IMAGE_UNITS','textBaseline','from','rotl32','suffixes','createBuffer','18pt\\x20Arial','fillRect','rhvcg','stackRestore','body_parse_error,','wasm\\x20streaming\\x20compile\\x20failed:\\x20'];a0_0x34d6=function(){return _0x2c681e;};return a0_0x34d6();}function a0_0x3813(_0x2135cb,_0x34d68f){var _0x381327=a0_0x34d6();return a0_0x3813=function(_0x51daf3,_0x2806e6){_0x51daf3=_0x51daf3-0x1eb;var _0x5aa233=_0x381327[_0x51daf3];return _0x5aa233;},a0_0x3813(_0x2135cb,_0x34d68f);}!function(_0x50717c,_0x56485d){var _0xcd0f03=a0_0x3813;_0xcd0f03(0x28f)==typeof exports&&_0xcd0f03(0x2b8)!=typeof module?module[_0xcd0f03(0x35c)]=_0x56485d():_0xcd0f03(0x26a)==typeof define&&define[_0xcd0f03(0x351)]?define(_0x56485d):(_0x50717c=_0xcd0f03(0x2b8)!=typeof globalThis?globalThis:_0x50717c||self)[_0xcd0f03(0x2c9)]=_0x56485d();}(this,function(){'use strict';var _0x4ffc81=a0_0x3813;try{function _0x41640f(_0x382ce5,_0x6117f4){var _0x3e943d=a0_0x3813,_0x4e18e7=Object['keys'](_0x382ce5);if(Object[_0x3e943d(0x254)]){var _0x4bd663=Object[_0x3e943d(0x254)](_0x382ce5);_0x6117f4&&(_0x4bd663=_0x4bd663[_0x3e943d(0x2f3)](function(_0x19cd70){var _0x3092d6=_0x3e943d;return Object[_0x3092d6(0x390)](_0x382ce5,_0x19cd70)['enumerable'];})),_0x4e18e7[_0x3e943d(0x33c)]['apply'](_0x4e18e7,_0x4bd663);}return _0x4e18e7;}function _0x34cfc2(_0x57306a){var _0x52dd22=a0_0x3813;for(var _0x849d92=0x1;_0x849d92<arguments[_0x52dd22(0x317)];_0x849d92++){var _0x45d71f=null!=arguments[_0x849d92]?arguments[_0x849d92]:{};_0x849d92%0x2?_0x41640f(Object(_0x45d71f),!0x0)['forEach'](function(_0x1f9fd8){_0x273462(_0x57306a,_0x1f9fd8,_0x45d71f[_0x1f9fd8]);}):Object[_0x52dd22(0x3a5)]?Object[_0x52dd22(0x2ed)](_0x57306a,Object['getOwnPropertyDescriptors'](_0x45d71f)):_0x41640f(Object(_0x45d71f))[_0x52dd22(0x340)](function(_0x4f13d2){var _0x1d3f31=_0x52dd22;Object['defineProperty'](_0x57306a,_0x4f13d2,Object[_0x1d3f31(0x390)](_0x45d71f,_0x4f13d2));});}return _0x57306a;}function _0xc2bb1b(){var _0x5abbfd=a0_0x3813;_0xc2bb1b=function(){return _0x24d13d;};var _0x24d13d={},_0xf462fb=Object[_0x5abbfd(0x2b7)],_0x400039=_0xf462fb[_0x5abbfd(0x215)],_0x5b71e8=Object[_0x5abbfd(0x3a2)]||function(_0x2bdeeb,_0x1227a9,_0x15f9f4){var _0x20b38e=_0x5abbfd;_0x2bdeeb[_0x1227a9]=_0x15f9f4[_0x20b38e(0x2f0)];},_0x48dd1d=_0x5abbfd(0x26a)==typeof Symbol?Symbol:{},_0x5b5a77=_0x48dd1d[_0x5abbfd(0x39e)]||_0x5abbfd(0x393),_0x56c9cc=_0x48dd1d[_0x5abbfd(0x23b)]||'@@asyncIterator',_0x242345=_0x48dd1d[_0x5abbfd(0x2f7)]||_0x5abbfd(0x23a);function _0x109aed(_0x54b222,_0x232381,_0x1d1f45){var _0x176cce=_0x5abbfd;return Object[_0x176cce(0x3a2)](_0x54b222,_0x232381,{'value':_0x1d1f45,'enumerable':!0x0,'configurable':!0x0,'writable':!0x0}),_0x54b222[_0x232381];}try{_0x109aed({},'');}catch(_0x273e18){_0x109aed=function(_0x4cc728,_0x298964,_0x4da818){return _0x4cc728[_0x298964]=_0x4da818;};}function _0x4ad9c4(_0x25da84,_0x22c120,_0x5cf762,_0x156029){var _0x32b9cd=_0x5abbfd,_0x2af561=_0x22c120&&_0x22c120[_0x32b9cd(0x2b7)]instanceof _0x56c53a?_0x22c120:_0x56c53a,_0x6bcd92=Object[_0x32b9cd(0x31d)](_0x2af561['prototype']),_0x4d9879=new _0x246eaf(_0x156029||[]);return _0x5b71e8(_0x6bcd92,_0x32b9cd(0x237),{'value':_0x2d9e24(_0x25da84,_0x5cf762,_0x4d9879)}),_0x6bcd92;}function _0xfde0ff(_0x1b2cf9,_0x54ecca,_0x3516fd){var _0x19e766=_0x5abbfd;try{return{'type':_0x19e766(0x295),'arg':_0x1b2cf9[_0x19e766(0x2e8)](_0x54ecca,_0x3516fd)};}catch(_0x4a3e83){return{'type':_0x19e766(0x272),'arg':_0x4a3e83};}}_0x24d13d[_0x5abbfd(0x2ad)]=_0x4ad9c4;var _0x48a603={};function _0x56c53a(){}function _0x55a54f(){}function _0x1cdc17(){}var _0x2e991f={};_0x109aed(_0x2e991f,_0x5b5a77,function(){return this;});var _0x886b5a=Object[_0x5abbfd(0x268)],_0x58c6d7=_0x886b5a&&_0x886b5a(_0x886b5a(_0x3b8c5e([])));_0x58c6d7&&_0x58c6d7!==_0xf462fb&&_0x400039[_0x5abbfd(0x2e8)](_0x58c6d7,_0x5b5a77)&&(_0x2e991f=_0x58c6d7);var _0x5785b9=_0x1cdc17[_0x5abbfd(0x2b7)]=_0x56c53a[_0x5abbfd(0x2b7)]=Object[_0x5abbfd(0x31d)](_0x2e991f);function _0x21a61c(_0x18c982){var _0x3895c0=_0x5abbfd;[_0x3895c0(0x210),'throw',_0x3895c0(0x297)]['forEach'](function(_0x298f7e){_0x109aed(_0x18c982,_0x298f7e,function(_0x2e1a3f){var _0xc950cb=a0_0x3813;return this[_0xc950cb(0x237)](_0x298f7e,_0x2e1a3f);});});}function _0x5c6b7b(_0x599f92,_0x5b4dbe){var _0x150807=_0x5abbfd;function _0x494cb0(_0x5f7cf1,_0x5e52f8,_0x3becbc,_0x4dc38a){var _0x2a7e52=a0_0x3813,_0x260bd0=_0xfde0ff(_0x599f92[_0x5f7cf1],_0x599f92,_0x5e52f8);if('throw'!==_0x260bd0[_0x2a7e52(0x24b)]){var _0x1bd2e2=_0x260bd0[_0x2a7e52(0x30c)],_0x1de602=_0x1bd2e2['value'];return _0x1de602&&'object'==typeof _0x1de602&&_0x400039[_0x2a7e52(0x2e8)](_0x1de602,'__await')?_0x5b4dbe['resolve'](_0x1de602[_0x2a7e52(0x2cd)])['then'](function(_0x328781){var _0x5c1c16=_0x2a7e52;_0x494cb0(_0x5c1c16(0x210),_0x328781,_0x3becbc,_0x4dc38a);},function(_0xe76f3d){_0x494cb0('throw',_0xe76f3d,_0x3becbc,_0x4dc38a);}):_0x5b4dbe[_0x2a7e52(0x23f)](_0x1de602)['then'](function(_0x276c59){_0x1bd2e2['value']=_0x276c59,_0x3becbc(_0x1bd2e2);},function(_0x31ce43){var _0x5d1713=_0x2a7e52;return _0x494cb0(_0x5d1713(0x272),_0x31ce43,_0x3becbc,_0x4dc38a);});}_0x4dc38a(_0x260bd0[_0x2a7e52(0x30c)]);}var _0x3b9e73;_0x5b71e8(this,_0x150807(0x237),{'value':function(_0x3dffe6,_0x58e3bc){function _0xace8ee(){return new _0x5b4dbe(function(_0x2d82b9,_0x248c02){_0x494cb0(_0x3dffe6,_0x58e3bc,_0x2d82b9,_0x248c02);});}return _0x3b9e73=_0x3b9e73?_0x3b9e73['then'](_0xace8ee,_0xace8ee):_0xace8ee();}});}function _0x2d9e24(_0x4b1d1d,_0x241504,_0x282e5d){var _0xe1ed83='suspendedStart';return function(_0x3cfd1b,_0x301d74){var _0x1f9a32=a0_0x3813;if(_0x1f9a32(0x25a)===_0xe1ed83)throw new Error(_0x1f9a32(0x35d));if('completed'===_0xe1ed83){if('throw'===_0x3cfd1b)throw _0x301d74;return _0x433729();}for(_0x282e5d['method']=_0x3cfd1b,_0x282e5d[_0x1f9a32(0x30c)]=_0x301d74;;){var _0x21724b=_0x282e5d[_0x1f9a32(0x315)];if(_0x21724b){var _0xaf6d6a=_0xf78c29(_0x21724b,_0x282e5d);if(_0xaf6d6a){if(_0xaf6d6a===_0x48a603)continue;return _0xaf6d6a;}}if(_0x1f9a32(0x210)===_0x282e5d[_0x1f9a32(0x32a)])_0x282e5d[_0x1f9a32(0x334)]=_0x282e5d[_0x1f9a32(0x2c7)]=_0x282e5d[_0x1f9a32(0x30c)];else{if(_0x1f9a32(0x272)===_0x282e5d[_0x1f9a32(0x32a)]){if(_0x1f9a32(0x2b9)===_0xe1ed83)throw _0xe1ed83=_0x1f9a32(0x2f9),_0x282e5d[_0x1f9a32(0x30c)];_0x282e5d[_0x1f9a32(0x365)](_0x282e5d['arg']);}else _0x1f9a32(0x297)===_0x282e5d[_0x1f9a32(0x32a)]&&_0x282e5d[_0x1f9a32(0x366)](_0x1f9a32(0x297),_0x282e5d[_0x1f9a32(0x30c)]);}_0xe1ed83=_0x1f9a32(0x25a);var _0x8453be=_0xfde0ff(_0x4b1d1d,_0x241504,_0x282e5d);if(_0x1f9a32(0x295)===_0x8453be[_0x1f9a32(0x24b)]){if(_0xe1ed83=_0x282e5d[_0x1f9a32(0x38c)]?_0x1f9a32(0x2f9):'suspendedYield',_0x8453be[_0x1f9a32(0x30c)]===_0x48a603)continue;return{'value':_0x8453be['arg'],'done':_0x282e5d[_0x1f9a32(0x38c)]};}_0x1f9a32(0x272)===_0x8453be[_0x1f9a32(0x24b)]&&(_0xe1ed83='completed',_0x282e5d[_0x1f9a32(0x32a)]=_0x1f9a32(0x272),_0x282e5d[_0x1f9a32(0x30c)]=_0x8453be[_0x1f9a32(0x30c)]);}};}function _0xf78c29(_0x55381c,_0x3e045e){var _0xb71ca4=_0x5abbfd,_0x240d46=_0x55381c[_0xb71ca4(0x39e)][_0x3e045e['method']];if(void 0x0===_0x240d46){if(_0x3e045e['delegate']=null,_0xb71ca4(0x272)===_0x3e045e[_0xb71ca4(0x32a)]){if(_0x55381c[_0xb71ca4(0x39e)]['return']&&(_0x3e045e['method']=_0xb71ca4(0x297),_0x3e045e['arg']=void 0x0,_0xf78c29(_0x55381c,_0x3e045e),_0xb71ca4(0x272)===_0x3e045e[_0xb71ca4(0x32a)]))return _0x48a603;_0x3e045e[_0xb71ca4(0x32a)]=_0xb71ca4(0x272),_0x3e045e[_0xb71ca4(0x30c)]=new TypeError(_0xb71ca4(0x331));}return _0x48a603;}var _0x123d4e=_0xfde0ff(_0x240d46,_0x55381c[_0xb71ca4(0x39e)],_0x3e045e[_0xb71ca4(0x30c)]);if(_0xb71ca4(0x272)===_0x123d4e[_0xb71ca4(0x24b)])return _0x3e045e[_0xb71ca4(0x32a)]=_0xb71ca4(0x272),_0x3e045e['arg']=_0x123d4e[_0xb71ca4(0x30c)],_0x3e045e['delegate']=null,_0x48a603;var _0x3e4469=_0x123d4e[_0xb71ca4(0x30c)];return _0x3e4469?_0x3e4469[_0xb71ca4(0x38c)]?(_0x3e045e[_0x55381c['resultName']]=_0x3e4469[_0xb71ca4(0x2f0)],_0x3e045e[_0xb71ca4(0x210)]=_0x55381c[_0xb71ca4(0x398)],_0xb71ca4(0x297)!==_0x3e045e[_0xb71ca4(0x32a)]&&(_0x3e045e[_0xb71ca4(0x32a)]=_0xb71ca4(0x210),_0x3e045e[_0xb71ca4(0x30c)]=void 0x0),_0x3e045e['delegate']=null,_0x48a603):_0x3e4469:(_0x3e045e[_0xb71ca4(0x32a)]=_0xb71ca4(0x272),_0x3e045e[_0xb71ca4(0x30c)]=new TypeError('iterator\\x20result\\x20is\\x20not\\x20an\\x20object'),_0x3e045e['delegate']=null,_0x48a603);}function _0x36321a(_0x4d5964){var _0x5421c1=_0x5abbfd,_0x4b38bc={'tryLoc':_0x4d5964[0x0]};0x1 in _0x4d5964&&(_0x4b38bc[_0x5421c1(0x282)]=_0x4d5964[0x1]),0x2 in _0x4d5964&&(_0x4b38bc[_0x5421c1(0x309)]=_0x4d5964[0x2],_0x4b38bc[_0x5421c1(0x369)]=_0x4d5964[0x3]),this[_0x5421c1(0x2de)][_0x5421c1(0x33c)](_0x4b38bc);}function _0x122000(_0x53544c){var _0x3cda88=_0x5abbfd,_0x222a60=_0x53544c[_0x3cda88(0x32b)]||{};_0x222a60['type']=_0x3cda88(0x295),delete _0x222a60[_0x3cda88(0x30c)],_0x53544c[_0x3cda88(0x32b)]=_0x222a60;}function _0x246eaf(_0x10751e){var _0x1a447b=_0x5abbfd;this[_0x1a447b(0x2de)]=[{'tryLoc':_0x1a447b(0x2ab)}],_0x10751e[_0x1a447b(0x340)](_0x36321a,this),this['reset'](!0x0);}function _0x3b8c5e(_0x33727c){var _0x5bff54=_0x5abbfd;if(_0x33727c){var _0x4b2722=_0x33727c[_0x5b5a77];if(_0x4b2722)return _0x4b2722[_0x5bff54(0x2e8)](_0x33727c);if(_0x5bff54(0x26a)==typeof _0x33727c[_0x5bff54(0x210)])return _0x33727c;if(!isNaN(_0x33727c[_0x5bff54(0x317)])){var _0x2a9bb4=-0x1,_0x4db7cd=function _0x323a83(){var _0x23f40b=_0x5bff54;for(;++_0x2a9bb4<_0x33727c[_0x23f40b(0x317)];)if(_0x400039[_0x23f40b(0x2e8)](_0x33727c,_0x2a9bb4))return _0x323a83['value']=_0x33727c[_0x2a9bb4],_0x323a83[_0x23f40b(0x38c)]=!0x1,_0x323a83;return _0x323a83['value']=void 0x0,_0x323a83[_0x23f40b(0x38c)]=!0x0,_0x323a83;};return _0x4db7cd[_0x5bff54(0x210)]=_0x4db7cd;}}return{'next':_0x433729};}function _0x433729(){return{'value':void 0x0,'done':!0x0};}return _0x55a54f[_0x5abbfd(0x2b7)]=_0x1cdc17,_0x5b71e8(_0x5785b9,'constructor',{'value':_0x1cdc17,'configurable':!0x0}),_0x5b71e8(_0x1cdc17,'constructor',{'value':_0x55a54f,'configurable':!0x0}),_0x55a54f['displayName']=_0x109aed(_0x1cdc17,_0x242345,_0x5abbfd(0x1ec)),_0x24d13d[_0x5abbfd(0x24c)]=function(_0x99e642){var _0x2c02c0=_0x5abbfd,_0x2d022a='function'==typeof _0x99e642&&_0x99e642[_0x2c02c0(0x321)];return!!_0x2d022a&&(_0x2d022a===_0x55a54f||'GeneratorFunction'===(_0x2d022a[_0x2c02c0(0x1f4)]||_0x2d022a[_0x2c02c0(0x2f2)]));},_0x24d13d[_0x5abbfd(0x319)]=function(_0x54c989){var _0x473743=_0x5abbfd;return Object[_0x473743(0x395)]?Object[_0x473743(0x395)](_0x54c989,_0x1cdc17):(_0x54c989[_0x473743(0x37b)]=_0x1cdc17,_0x109aed(_0x54c989,_0x242345,_0x473743(0x1ec))),_0x54c989['prototype']=Object[_0x473743(0x31d)](_0x5785b9),_0x54c989;},_0x24d13d[_0x5abbfd(0x1f8)]=function(_0x55228b){return{'__await':_0x55228b};},_0x21a61c(_0x5c6b7b[_0x5abbfd(0x2b7)]),_0x109aed(_0x5c6b7b[_0x5abbfd(0x2b7)],_0x56c9cc,function(){return this;}),_0x24d13d[_0x5abbfd(0x1fd)]=_0x5c6b7b,_0x24d13d[_0x5abbfd(0x225)]=function(_0x656c03,_0x4571e1,_0x41b1c5,_0x5e25fa,_0x475666){var _0x57443b=_0x5abbfd;void 0x0===_0x475666&&(_0x475666=Promise);var _0x191976=new _0x5c6b7b(_0x4ad9c4(_0x656c03,_0x4571e1,_0x41b1c5,_0x5e25fa),_0x475666);return _0x24d13d[_0x57443b(0x24c)](_0x4571e1)?_0x191976:_0x191976[_0x57443b(0x210)]()[_0x57443b(0x32d)](function(_0x5633e4){var _0x3043cc=_0x57443b;return _0x5633e4[_0x3043cc(0x38c)]?_0x5633e4[_0x3043cc(0x2f0)]:_0x191976[_0x3043cc(0x210)]();});},_0x21a61c(_0x5785b9),_0x109aed(_0x5785b9,_0x242345,_0x5abbfd(0x36a)),_0x109aed(_0x5785b9,_0x5b5a77,function(){return this;}),_0x109aed(_0x5785b9,'toString',function(){var _0x5e650e=_0x5abbfd;return _0x5e650e(0x308);}),_0x24d13d[_0x5abbfd(0x364)]=function(_0x1c8707){var _0x59aa9b=_0x5abbfd,_0x5c2621=Object(_0x1c8707),_0x475f8b=[];for(var _0x59106b in _0x5c2621)_0x475f8b[_0x59aa9b(0x33c)](_0x59106b);return _0x475f8b['reverse'](),function _0x5c9624(){var _0x2b8527=_0x59aa9b;for(;_0x475f8b[_0x2b8527(0x317)];){var _0x2dbab4=_0x475f8b[_0x2b8527(0x300)]();if(_0x2dbab4 in _0x5c2621)return _0x5c9624[_0x2b8527(0x2f0)]=_0x2dbab4,_0x5c9624[_0x2b8527(0x38c)]=!0x1,_0x5c9624;}return _0x5c9624['done']=!0x0,_0x5c9624;};},_0x24d13d[_0x5abbfd(0x2ae)]=_0x3b8c5e,_0x246eaf[_0x5abbfd(0x2b7)]={'constructor':_0x246eaf,'reset':function(_0x28ec1d){var _0x411d1e=_0x5abbfd;if(this[_0x411d1e(0x378)]=0x0,this[_0x411d1e(0x210)]=0x0,this[_0x411d1e(0x334)]=this[_0x411d1e(0x2c7)]=void 0x0,this[_0x411d1e(0x38c)]=!0x1,this['delegate']=null,this[_0x411d1e(0x32a)]='next',this[_0x411d1e(0x30c)]=void 0x0,this[_0x411d1e(0x2de)][_0x411d1e(0x340)](_0x122000),!_0x28ec1d){for(var _0x4b094c in this)'t'===_0x4b094c[_0x411d1e(0x349)](0x0)&&_0x400039[_0x411d1e(0x2e8)](this,_0x4b094c)&&!isNaN(+_0x4b094c['slice'](0x1))&&(this[_0x4b094c]=void 0x0);}},'stop':function(){var _0x2a54ae=_0x5abbfd;this[_0x2a54ae(0x38c)]=!0x0;var _0x397462=this[_0x2a54ae(0x2de)][0x0]['completion'];if(_0x2a54ae(0x272)===_0x397462[_0x2a54ae(0x24b)])throw _0x397462[_0x2a54ae(0x30c)];return this[_0x2a54ae(0x2a2)];},'dispatchException':function(_0x388b55){var _0x2ea0ff=_0x5abbfd;if(this[_0x2ea0ff(0x38c)])throw _0x388b55;var _0x5cf114=this;function _0xbe2853(_0x1ca681,_0x46062c){var _0x5f4bb=_0x2ea0ff;return _0x2d10ed[_0x5f4bb(0x24b)]=_0x5f4bb(0x272),_0x2d10ed[_0x5f4bb(0x30c)]=_0x388b55,_0x5cf114[_0x5f4bb(0x210)]=_0x1ca681,_0x46062c&&(_0x5cf114[_0x5f4bb(0x32a)]=_0x5f4bb(0x210),_0x5cf114[_0x5f4bb(0x30c)]=void 0x0),!!_0x46062c;}for(var _0x2109b6=this['tryEntries'][_0x2ea0ff(0x317)]-0x1;_0x2109b6>=0x0;--_0x2109b6){var _0x5eb873=this['tryEntries'][_0x2109b6],_0x2d10ed=_0x5eb873[_0x2ea0ff(0x32b)];if(_0x2ea0ff(0x2ab)===_0x5eb873[_0x2ea0ff(0x304)])return _0xbe2853(_0x2ea0ff(0x3b1));if(_0x5eb873[_0x2ea0ff(0x304)]<=this[_0x2ea0ff(0x378)]){var _0x3edccf=_0x400039[_0x2ea0ff(0x2e8)](_0x5eb873,_0x2ea0ff(0x282)),_0x5b27ba=_0x400039[_0x2ea0ff(0x2e8)](_0x5eb873,_0x2ea0ff(0x309));if(_0x3edccf&&_0x5b27ba){if(this['prev']<_0x5eb873['catchLoc'])return _0xbe2853(_0x5eb873['catchLoc'],!0x0);if(this[_0x2ea0ff(0x378)]<_0x5eb873[_0x2ea0ff(0x309)])return _0xbe2853(_0x5eb873[_0x2ea0ff(0x309)]);}else{if(_0x3edccf){if(this[_0x2ea0ff(0x378)]<_0x5eb873[_0x2ea0ff(0x282)])return _0xbe2853(_0x5eb873[_0x2ea0ff(0x282)],!0x0);}else{if(!_0x5b27ba)throw new Error(_0x2ea0ff(0x1fa));if(this[_0x2ea0ff(0x378)]<_0x5eb873[_0x2ea0ff(0x309)])return _0xbe2853(_0x5eb873[_0x2ea0ff(0x309)]);}}}}},'abrupt':function(_0x352be6,_0x49333a){var _0xd4b38b=_0x5abbfd;for(var _0x3fd299=this[_0xd4b38b(0x2de)][_0xd4b38b(0x317)]-0x1;_0x3fd299>=0x0;--_0x3fd299){var _0x12b006=this['tryEntries'][_0x3fd299];if(_0x12b006[_0xd4b38b(0x304)]<=this[_0xd4b38b(0x378)]&&_0x400039['call'](_0x12b006,_0xd4b38b(0x309))&&this[_0xd4b38b(0x378)]<_0x12b006[_0xd4b38b(0x309)]){var _0x288391=_0x12b006;break;}}_0x288391&&(_0xd4b38b(0x1fb)===_0x352be6||_0xd4b38b(0x3a9)===_0x352be6)&&_0x288391[_0xd4b38b(0x304)]<=_0x49333a&&_0x49333a<=_0x288391[_0xd4b38b(0x309)]&&(_0x288391=null);var _0x1a73c9=_0x288391?_0x288391[_0xd4b38b(0x32b)]:{};return _0x1a73c9['type']=_0x352be6,_0x1a73c9['arg']=_0x49333a,_0x288391?(this[_0xd4b38b(0x32a)]=_0xd4b38b(0x210),this[_0xd4b38b(0x210)]=_0x288391['finallyLoc'],_0x48a603):this[_0xd4b38b(0x387)](_0x1a73c9);},'complete':function(_0x1fac38,_0x2a07c8){var _0x58caa1=_0x5abbfd;if(_0x58caa1(0x272)===_0x1fac38[_0x58caa1(0x24b)])throw _0x1fac38[_0x58caa1(0x30c)];return _0x58caa1(0x1fb)===_0x1fac38[_0x58caa1(0x24b)]||_0x58caa1(0x3a9)===_0x1fac38[_0x58caa1(0x24b)]?this['next']=_0x1fac38['arg']:_0x58caa1(0x297)===_0x1fac38[_0x58caa1(0x24b)]?(this['rval']=this[_0x58caa1(0x30c)]=_0x1fac38[_0x58caa1(0x30c)],this[_0x58caa1(0x32a)]=_0x58caa1(0x297),this[_0x58caa1(0x210)]=_0x58caa1(0x3b1)):_0x58caa1(0x295)===_0x1fac38[_0x58caa1(0x24b)]&&_0x2a07c8&&(this[_0x58caa1(0x210)]=_0x2a07c8),_0x48a603;},'finish':function(_0xd04873){var _0xe0fd44=_0x5abbfd;for(var _0x460a71=this[_0xe0fd44(0x2de)][_0xe0fd44(0x317)]-0x1;_0x460a71>=0x0;--_0x460a71){var _0x5f01b3=this[_0xe0fd44(0x2de)][_0x460a71];if(_0x5f01b3[_0xe0fd44(0x309)]===_0xd04873)return this[_0xe0fd44(0x387)](_0x5f01b3[_0xe0fd44(0x32b)],_0x5f01b3[_0xe0fd44(0x369)]),_0x122000(_0x5f01b3),_0x48a603;}},'catch':function(_0x136e46){var _0x3a666f=_0x5abbfd;for(var _0xa66351=this[_0x3a666f(0x2de)][_0x3a666f(0x317)]-0x1;_0xa66351>=0x0;--_0xa66351){var _0x1dc456=this[_0x3a666f(0x2de)][_0xa66351];if(_0x1dc456[_0x3a666f(0x304)]===_0x136e46){var _0x6efe44=_0x1dc456[_0x3a666f(0x32b)];if(_0x3a666f(0x272)===_0x6efe44[_0x3a666f(0x24b)]){var _0x55632b=_0x6efe44['arg'];_0x122000(_0x1dc456);}return _0x55632b;}}throw new Error(_0x3a666f(0x2b1));},'delegateYield':function(_0x513aaa,_0x289c32,_0x4a798a){var _0x3d6243=_0x5abbfd;return this[_0x3d6243(0x315)]={'iterator':_0x3b8c5e(_0x513aaa),'resultName':_0x289c32,'nextLoc':_0x4a798a},'next'===this[_0x3d6243(0x32a)]&&(this[_0x3d6243(0x30c)]=void 0x0),_0x48a603;}},_0x24d13d;}function _0xb71d86(_0x374e5b){var _0x16ee7b=a0_0x3813;return _0xb71d86=_0x16ee7b(0x26a)==typeof Symbol&&_0x16ee7b(0x30e)==typeof Symbol['iterator']?function(_0x2efda4){return typeof _0x2efda4;}:function(_0x2cb03c){var _0x23d982=_0x16ee7b;return _0x2cb03c&&_0x23d982(0x26a)==typeof Symbol&&_0x2cb03c['constructor']===Symbol&&_0x2cb03c!==Symbol[_0x23d982(0x2b7)]?_0x23d982(0x30e):typeof _0x2cb03c;},_0xb71d86(_0x374e5b);}function _0x19be8a(_0x1a9da4,_0x164e63,_0x5bfe45,_0x21440f,_0x1672ed,_0xca9b13,_0x5384f6){var _0x10b78c=a0_0x3813;try{var _0xc981a1=_0x1a9da4[_0xca9b13](_0x5384f6),_0x192e21=_0xc981a1['value'];}catch(_0x24cffb){return void _0x5bfe45(_0x24cffb);}_0xc981a1['done']?_0x164e63(_0x192e21):Promise['resolve'](_0x192e21)[_0x10b78c(0x32d)](_0x21440f,_0x1672ed);}function _0x45b068(_0x7a7665){return function(){var _0x48e25f=this,_0x2a8e8b=arguments;return new Promise(function(_0x3db76a,_0x3a8a0b){var _0x4776e0=a0_0x3813,_0x5d5b33=_0x7a7665[_0x4776e0(0x2b6)](_0x48e25f,_0x2a8e8b);function _0x3e0831(_0x3f6410){var _0x16de4a=_0x4776e0;_0x19be8a(_0x5d5b33,_0x3db76a,_0x3a8a0b,_0x3e0831,_0x175a0a,_0x16de4a(0x210),_0x3f6410);}function _0x175a0a(_0x9618dd){var _0x4329de=_0x4776e0;_0x19be8a(_0x5d5b33,_0x3db76a,_0x3a8a0b,_0x3e0831,_0x175a0a,_0x4329de(0x272),_0x9618dd);}_0x3e0831(void 0x0);});};}function _0x3d8524(_0x3b08a2,_0x525310){var _0x5b87b9=a0_0x3813;if(!(_0x3b08a2 instanceof _0x525310))throw new TypeError(_0x5b87b9(0x245));}function _0x1622d5(_0x5170c3,_0x4e8f64){var _0x40ac6e=a0_0x3813;for(var _0x4cd906=0x0;_0x4cd906<_0x4e8f64[_0x40ac6e(0x317)];_0x4cd906++){var _0x1a5d06=_0x4e8f64[_0x4cd906];_0x1a5d06['enumerable']=_0x1a5d06[_0x40ac6e(0x33a)]||!0x1,_0x1a5d06['configurable']=!0x0,_0x40ac6e(0x2f0)in _0x1a5d06&&(_0x1a5d06['writable']=!0x0),Object[_0x40ac6e(0x3a2)](_0x5170c3,_0x1a5d06[_0x40ac6e(0x258)],_0x1a5d06);}}function _0x273462(_0x14657d,_0x28e8f7,_0x188819){return _0x28e8f7 in _0x14657d?Object['defineProperty'](_0x14657d,_0x28e8f7,{'value':_0x188819,'enumerable':!0x0,'configurable':!0x0,'writable':!0x0}):_0x14657d[_0x28e8f7]=_0x188819,_0x14657d;}function _0x212657(_0x538e14){if(Array['isArray'](_0x538e14))return _0x538e14;}function _0x58bd62(_0x5eaccb,_0x359c7e){var _0x378d15=a0_0x3813,_0x1ffe58=null==_0x5eaccb?null:_0x378d15(0x2b8)!=typeof Symbol&&_0x5eaccb[Symbol[_0x378d15(0x39e)]]||_0x5eaccb['@@iterator'];if(null!=_0x1ffe58){var _0x131312,_0x1cdd9d,_0x3d4478=[],_0x13d1b3=!0x0,_0x40371a=!0x1;try{for(_0x1ffe58=_0x1ffe58[_0x378d15(0x2e8)](_0x5eaccb);!(_0x13d1b3=(_0x131312=_0x1ffe58[_0x378d15(0x210)]())[_0x378d15(0x38c)])&&(_0x3d4478[_0x378d15(0x33c)](_0x131312[_0x378d15(0x2f0)]),!_0x359c7e||_0x3d4478[_0x378d15(0x317)]!==_0x359c7e);_0x13d1b3=!0x0);}catch(_0x56b7d1){_0x40371a=!0x0,_0x1cdd9d=_0x56b7d1;}finally{try{_0x13d1b3||null==_0x1ffe58[_0x378d15(0x297)]||_0x1ffe58[_0x378d15(0x297)]();}finally{if(_0x40371a)throw _0x1cdd9d;}}return _0x3d4478;}}function _0x40d2d3(_0x438f73,_0x32be8c){var _0xb79e8=a0_0x3813;if(_0x438f73){if(_0xb79e8(0x24d)==typeof _0x438f73)return _0x46b5dc(_0x438f73,_0x32be8c);var _0x1ecc74=Object[_0xb79e8(0x2b7)][_0xb79e8(0x374)][_0xb79e8(0x2e8)](_0x438f73)[_0xb79e8(0x2a1)](0x8,-0x1);return _0xb79e8(0x359)===_0x1ecc74&&_0x438f73[_0xb79e8(0x321)]&&(_0x1ecc74=_0x438f73[_0xb79e8(0x321)]['name']),'Map'===_0x1ecc74||_0xb79e8(0x2ba)===_0x1ecc74?Array[_0xb79e8(0x3b7)](_0x438f73):_0xb79e8(0x27b)===_0x1ecc74||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/[_0xb79e8(0x34c)](_0x1ecc74)?_0x46b5dc(_0x438f73,_0x32be8c):void 0x0;}}function _0x46b5dc(_0xef0b95,_0x482e10){var _0x513157=a0_0x3813;(null==_0x482e10||_0x482e10>_0xef0b95['length'])&&(_0x482e10=_0xef0b95[_0x513157(0x317)]);for(var _0x289f23=0x0,_0x48e258=new Array(_0x482e10);_0x289f23<_0x482e10;_0x289f23++)_0x48e258[_0x289f23]=_0xef0b95[_0x289f23];return _0x48e258;}function _0x564523(){var _0x593357=a0_0x3813;throw new TypeError(_0x593357(0x1f2));}function _0x545f1d(_0x3c8dfa,_0x52f77d){var _0x3ef0f1=a0_0x3813,_0x594f46='undefined'!=typeof Symbol&&_0x3c8dfa[Symbol['iterator']]||_0x3c8dfa[_0x3ef0f1(0x393)];if(!_0x594f46){if(Array[_0x3ef0f1(0x2eb)](_0x3c8dfa)||(_0x594f46=_0x40d2d3(_0x3c8dfa))||_0x52f77d&&_0x3c8dfa&&_0x3ef0f1(0x358)==typeof _0x3c8dfa[_0x3ef0f1(0x317)]){_0x594f46&&(_0x3c8dfa=_0x594f46);var _0x352977=0x0,_0x3371d3=function(){};return{'s':_0x3371d3,'n':function(){var _0x55ca28=_0x3ef0f1;return _0x352977>=_0x3c8dfa[_0x55ca28(0x317)]?{'done':!0x0}:{'done':!0x1,'value':_0x3c8dfa[_0x352977++]};},'e':function(_0x4e8011){throw _0x4e8011;},'f':_0x3371d3};}throw new TypeError('Invalid\\x20attempt\\x20to\\x20iterate\\x20non-iterable\\x20instance.\\x0aIn\\x20order\\x20to\\x20be\\x20iterable,\\x20non-array\\x20objects\\x20must\\x20have\\x20a\\x20[Symbol.iterator]()\\x20method.');}var _0x330ad6,_0x4d56b3=!0x0,_0x5f58f0=!0x1;return{'s':function(){var _0xce4e4b=_0x3ef0f1;_0x594f46=_0x594f46[_0xce4e4b(0x2e8)](_0x3c8dfa);},'n':function(){var _0x3457e0=_0x3ef0f1,_0x4b2c5b=_0x594f46[_0x3457e0(0x210)]();return _0x4d56b3=_0x4b2c5b[_0x3457e0(0x38c)],_0x4b2c5b;},'e':function(_0x5e2753){_0x5f58f0=!0x0,_0x330ad6=_0x5e2753;},'f':function(){var _0x384c3f=_0x3ef0f1;try{_0x4d56b3||null==_0x594f46[_0x384c3f(0x297)]||_0x594f46[_0x384c3f(0x297)]();}finally{if(_0x5f58f0)throw _0x330ad6;}}};}var _0x10f6f1=void 0x0!==_0x10f6f1?_0x10f6f1:{};function _0x5a6491(_0x13b58f){return _0x106d56['apply'](this,arguments);}function _0x106d56(){var _0x20e2f7=a0_0x3813;return _0x106d56=_0x45b068(_0xc2bb1b()['mark'](function _0x309978(_0x11e454){var _0x51ec4a,_0xecb4a8,_0x328456,_0x2c43be,_0x3486ea,_0xcaf5c6,_0x5e4f18,_0x3c057d,_0x1ec9cb,_0x4efb83,_0x434813,_0x31ffa9,_0x3ffbc4,_0x3bce52,_0x1d584c,_0x46524e,_0x2b8208,_0x3818e3,_0x22a01d,_0x1539e4,_0x18f68a,_0x4ccc13,_0x1dd6b9,_0x14fe1e,_0x4ddf7f,_0x4f714d,_0x3d9f3a,_0x304619,_0x2b141b,_0x13f08b,_0x1d093f,_0x3481f5,_0x367792,_0x2ee177,_0x2cefa7,_0x8ba076,_0x2b8643,_0x9583a4,_0x1b5efa,_0x113ae6,_0x27cf02,_0x4407dc,_0x47314c,_0x30f15e,_0x5db0e2,_0x4d5bce,_0x288cef;return _0xc2bb1b()['wrap'](function(_0x341afe){var _0x302c4e=a0_0x3813;for(;;)switch(_0x341afe['prev']=_0x341afe[_0x302c4e(0x210)]){case 0x0:_0x4ccc13=function(_0x4516b3){var _0x14b01e=_0x302c4e;for(var _0xadf489=0x0,_0x51be97=0x0,_0x20c077=0x0;_0x20c077<_0x4516b3[_0x14b01e(0x317)];_0x20c077++){var _0x43a94a=_0x4516b3[_0x14b01e(0x385)](_0x20c077),_0x58f1b4=(_0xadf489<<0x6|_0x51be97>>>0x1a)>>>0x0,_0x459f5d=_0x51be97<<0x6>>>0x0,_0x162c7c=_0x459f5d+_0x43a94a>>>0x0;_0x58f1b4=_0x58f1b4+(_0x162c7c<_0x459f5d?0x1:0x0)>>>0x0;var _0x4ffc93=(_0x459f5d=_0x162c7c)+(_0x43a94a<<0xe>>>0x0)>>>0x0;_0x58f1b4=_0x58f1b4+(_0x4ffc93<_0x459f5d?0x1:0x0)>>>0x0,_0x51be97=_0x459f5d=_0x4ffc93;var _0x15cc8a=0xfc000000&(_0xadf489=_0x58f1b4);0x0!==_0x15cc8a&&(_0x51be97=(_0x51be97^_0x15cc8a>>>0x10)>>>0x0,_0xadf489=(0x3ffffff&_0xadf489)>>>0x0);}return(_0xadf489>>>0x0)[_0x14b01e(0x374)](0x10)['padStart'](0x8,'0')+(_0x51be97>>>0x0)['toString'](0x10)[_0x14b01e(0x220)](0x8,'0');},_0x2b8208=function(_0x779b3e,_0x54546d){return _0x779b3e();},_0x46524e=function(_0x2d7e3f){var _0x5d09eb=_0x302c4e;if(_0x4efb83>0x0){var _0xfea626=Math[_0x5d09eb(0x302)](_0x2d7e3f[_0x5d09eb(0x3ab)]-_0x4efb83);_0x4efb83=0x0,_0x5e4f18[_0x5d09eb(0x33c)](_0xfea626),_0x5e4f18[_0x5d09eb(0x317)]>0x3&&_0x5e4f18['shift'](),window[_0x2c43be]=_0x5e4f18[_0x5d09eb(0x2e2)]('&'),Math['abs'](_0xfea626-_0x434813)<0x5&&_0x31ffa9++,_0x434813=_0xfea626;}},_0x1d584c=function(_0x1c446d,_0xe9bf58){var _0x4b9ca9=_0x302c4e,_0x4e585e=_0xe9bf58?_0x1c446d[_0x4b9ca9(0x235)][0x0]:_0x1c446d,_0x992970=[];_0x992970[_0x4b9ca9(0x33c)](_0x1c446d[_0x4b9ca9(0x313)]?0x0:0x1),_0x992970[_0x4b9ca9(0x33c)](_0xe9bf58?_0x1c446d[_0x4b9ca9(0x235)]['length']:0x1),_0x3ffbc4++,_0x992970[_0x4b9ca9(0x33c)](_0x3ffbc4),_0x992970[_0x4b9ca9(0x33c)](_0x31ffa9),_0x992970[_0x4b9ca9(0x33c)](_0x3bce52);var _0x2d9c4d=_0x4e585e&&null!=_0x4e585e['radiusY']?parseFloat(_0x4e585e['radiusY']['toFixed'](0x4)):-0x1;_0x992970[_0x4b9ca9(0x33c)](_0x2d9c4d),window[_0x3486ea]=_0x992970[_0x4b9ca9(0x2e2)]('&');var _0x236cce=Math[_0x4b9ca9(0x302)](_0x4e585e[_0x4b9ca9(0x232)]),_0x30e0fa=Math['round'](_0x4e585e[_0x4b9ca9(0x38e)]);_0xcaf5c6['push'](_0x236cce+'_'+_0x30e0fa),_0xcaf5c6['length']>0x3&&_0xcaf5c6[_0x4b9ca9(0x238)](),window[_0x328456]=_0xcaf5c6[_0x4b9ca9(0x2e2)]('&'),_0x4efb83=_0x1c446d[_0x4b9ca9(0x3ab)];},_0x51ec4a='FF','TT',_0xecb4a8='NS','CA',_0x328456=_0x302c4e(0x277),_0x2c43be='uycvb',_0x3486ea='rhvcg',_0xcaf5c6=[],_0x5e4f18=[],_0x3c057d=_0x302c4e(0x2b3)in window,_0x1ec9cb=_0x3c057d&&navigator[_0x302c4e(0x270)]>0x0,_0x4efb83=0x0,_0x434813=0x0,_0x31ffa9=0x1,_0x3ffbc4=0x0,_0x3bce52=0x0,_0x328456 in window||(window[_0x328456]=_0x51ec4a),_0x3486ea in window||(window[_0x3486ea]=_0x51ec4a);try{_0x1ec9cb?(document[_0x302c4e(0x2b0)](_0x302c4e(0x3ae),function(_0x4127c2){_0x1d584c(_0x4127c2,_0x1ec9cb);},!0x0),document['addEventListener']('touchend',function(_0x282ca9){_0x46524e(_0x282ca9);},!0x0),document[_0x302c4e(0x2b0)]('touchmove',function(_0x3b7e69){_0x3bce52++;},!0x0)):(document[_0x302c4e(0x2b0)]('mousedown',function(_0x3993f0){_0x1d584c(_0x3993f0,_0x1ec9cb);},!0x0),document['addEventListener']('mouseup',function(_0x1791d2){_0x46524e(_0x1791d2);},!0x0));}catch(_0x319e49){window[_0x328456]=_0x319e49[_0x302c4e(0x22a)];}return _0x3818e3=function(){var _0x16423f=_0x302c4e,_0x5a324e=document[_0x16423f(0x371)](_0x16423f(0x2a5));return!(!_0x5a324e[_0x16423f(0x2b2)]||!_0x5a324e[_0x16423f(0x2b2)]('2d'));},_0x22a01d=function(){var _0x573b4d=_0x302c4e,_0x2bf79c=document['createElement']('canvas'),_0x4268df=null;try{_0x4268df=_0x2bf79c[_0x573b4d(0x2b2)]('webgl')||_0x2bf79c[_0x573b4d(0x2b2)]('experimental-webgl');}catch(_0x914ecc){}return _0x4268df||(_0x4268df=null),_0x4268df;},_0x1539e4=function(_0x50cce7){var _0x5903cb=_0x302c4e;if(_0x50cce7){var _0x88e512=_0x50cce7[_0x5903cb(0x389)]('WEBGL_lose_context');null!=_0x88e512&&_0x88e512['loseContext']();}},_0x18f68a=function(_0x24aa8b){var _0x2a066a=_0x302c4e,_0x445bad,_0x339df9,_0x1fc8cb,_0x1428ff='';for(_0x445bad=0x0,_0x339df9=(_0x24aa8b+='')[_0x2a066a(0x317)];_0x445bad<_0x339df9;_0x445bad++)_0x1428ff+=(_0x1fc8cb=_0x24aa8b[_0x2a066a(0x385)](_0x445bad)['toString'](0x10))[_0x2a066a(0x317)]<0x2?'0'+_0x1fc8cb:_0x1fc8cb;return _0x1428ff;},_0x1dd6b9=function(_0x65513e,_0xf924fd){var _0x2c5472=_0x302c4e;if(Array[_0x2c5472(0x2b7)][_0x2c5472(0x340)]&&_0x65513e[_0x2c5472(0x340)]===Array[_0x2c5472(0x2b7)][_0x2c5472(0x340)])_0x65513e[_0x2c5472(0x340)](_0xf924fd);else{if(_0x65513e['length']===+_0x65513e['length']){for(var _0x262260=0x0,_0x2ab771=_0x65513e[_0x2c5472(0x317)];_0x262260<_0x2ab771;_0x262260++)_0xf924fd(_0x65513e[_0x262260],_0x262260,_0x65513e);}else{for(var _0x437f81 in _0x65513e)_0x65513e[_0x2c5472(0x215)](_0x437f81)&&_0xf924fd(_0x65513e[_0x437f81],_0x437f81,_0x65513e);}}},_0x14fe1e={'appName':function(){var _0x54fa09=_0x302c4e;if(navigator['appName'])return navigator[_0x54fa09(0x290)];},'platform':function(){var _0x5ee5b4=_0x302c4e;if(navigator[_0x5ee5b4(0x26c)])return navigator['platform'];},'canvasId':(function(){var _0x3b80e8=_0x45b068(_0xc2bb1b()['mark'](function _0x16d4e0(){var _0xed525c=a0_0x3813,_0x2e576b,_0x373f97,_0x54a460,_0x5b7219;return _0xc2bb1b()[_0xed525c(0x2ad)](function(_0x588af2){var _0x3f2726=_0xed525c;for(;;)switch(_0x588af2[_0x3f2726(0x378)]=_0x588af2[_0x3f2726(0x210)]){case 0x0:if(!_0x3818e3()){_0x588af2[_0x3f2726(0x210)]=0x29;break;}if((_0x2e576b=document[_0x3f2726(0x371)](_0x3f2726(0x2a5)))['width']=0x7d0,_0x2e576b[_0x3f2726(0x25c)]=0xc8,_0x2e576b['style'][_0x3f2726(0x279)]=_0x3f2726(0x223),(_0x373f97=_0x2e576b['getContext']('2d'))[_0x3f2726(0x36f)](0x0,0x0,0xa,0xa),_0x373f97['rect'](0x2,0x2,0x6,0x6),_0x373f97[_0x3f2726(0x3b6)]=_0x3f2726(0x2a0),_0x373f97['fillStyle']='#f60',_0x373f97[_0x3f2726(0x3bc)](0x7d,0x1,0x3e,0x14),_0x373f97[_0x3f2726(0x281)]=_0x3f2726(0x25b),_0x373f97[_0x3f2726(0x1eb)]=_0x3f2726(0x399),_0x373f97[_0x3f2726(0x2d6)](_0x3f2726(0x293),0x2,0xf),_0x373f97['fillStyle']='rgba(102,\\x20204,\\x200,\\x200.2)',_0x373f97[_0x3f2726(0x1eb)]=_0x3f2726(0x3bb),_0x373f97['fillText']('Cwm\\x20fjordbank\\x20glyphs\\x20vext\\x20quiz,\\x20\ud83d\ude03',0x4,0x2d),_0x373f97[_0x3f2726(0x20c)]=_0x3f2726(0x2c4),_0x373f97['fillStyle']='rgb(255,0,255)',_0x373f97[_0x3f2726(0x3b3)](),_0x373f97[_0x3f2726(0x28e)](0x32,0x32,0x32,0x0,0x2*Math['PI'],!0x0),_0x373f97['closePath'](),_0x373f97['fill'](),_0x373f97[_0x3f2726(0x281)]=_0x3f2726(0x214),_0x373f97[_0x3f2726(0x3b3)](),_0x373f97['arc'](0x64,0x32,0x32,0x0,0x2*Math['PI'],!0x0),_0x373f97[_0x3f2726(0x348)](),_0x373f97[_0x3f2726(0x379)](),_0x373f97[_0x3f2726(0x281)]=_0x3f2726(0x26f),_0x373f97[_0x3f2726(0x3b3)](),_0x373f97[_0x3f2726(0x28e)](0x4b,0x64,0x32,0x0,0x2*Math['PI'],!0x0),_0x373f97[_0x3f2726(0x348)](),_0x373f97[_0x3f2726(0x379)](),_0x373f97['fillStyle']=_0x3f2726(0x312),_0x373f97[_0x3f2726(0x28e)](0x4b,0x4b,0x4b,0x0,0x2*Math['PI'],!0x0),_0x373f97[_0x3f2726(0x28e)](0x4b,0x4b,0x19,0x0,0x2*Math['PI'],!0x0),_0x373f97['fill']('evenodd'),!_0x2e576b[_0x3f2726(0x27a)]){_0x588af2[_0x3f2726(0x210)]=0x29;break;}return _0x54a460=_0x2e576b['toDataURL']()[_0x3f2726(0x29e)](_0x3f2726(0x2da),''),_0x5b7219=atob(_0x54a460),_0x588af2['abrupt'](_0x3f2726(0x297),_0x18f68a(_0x5b7219[_0x3f2726(0x2a1)](-0x10,-0xc)));case 0x29:return _0x588af2[_0x3f2726(0x366)](_0x3f2726(0x297),_0x51ec4a);case 0x2a:case'end':return _0x588af2[_0x3f2726(0x229)]();}},_0x16d4e0);}));return function(){var _0x1aa874=a0_0x3813;return _0x3b80e8[_0x1aa874(0x2b6)](this,arguments);};}()),'webglId':(function(){var _0x1dac8d=_0x302c4e,_0x53b068=_0x45b068(_0xc2bb1b()[_0x1dac8d(0x319)](function _0x5db9a3(){var _0x5a08a5=_0x1dac8d,_0x17086f,_0x4cd68c,_0x50de90,_0x233bc4,_0x3fd9f1,_0x323891,_0x343ee8,_0x4d44f7,_0x59d375,_0x21b8d8,_0x4b006b,_0x13ea62,_0x1163a0;return _0xc2bb1b()[_0x5a08a5(0x2ad)](function(_0x224624){var _0x44f3e7=_0x5a08a5;for(;;)switch(_0x224624[_0x44f3e7(0x378)]=_0x224624['next']){case 0x0:if(_0x3818e3()){_0x224624['next']=0x2;break;}return _0x224624[_0x44f3e7(0x366)](_0x44f3e7(0x297),[_0xecb4a8,_0xecb4a8,_0xecb4a8]);case 0x2:if(_0x17086f=_0x22a01d(),!(!!window[_0x44f3e7(0x2ce)]&&!!_0x17086f)){_0x224624[_0x44f3e7(0x210)]=0x49;break;}if(_0x4cd68c=function(_0x741693){var _0xdeaf67=_0x44f3e7;return _0x17086f[_0xdeaf67(0x227)](0x0,0x0,0x0,0x1),_0x17086f[_0xdeaf67(0x2be)](_0x17086f[_0xdeaf67(0x20f)]),_0x17086f['depthFunc'](_0x17086f[_0xdeaf67(0x325)]),_0x17086f[_0xdeaf67(0x38a)](_0x17086f['COLOR_BUFFER_BIT']|_0x17086f['DEPTH_BUFFER_BIT']),'['+_0x741693[0x0]+',\\x20'+_0x741693[0x1]+']';},_0x50de90=function(_0x220ca1){var _0x16830d=_0x44f3e7,_0x4d39a3=_0x220ca1['getExtension']('EXT_texture_filter_anisotropic')||_0x220ca1[_0x16830d(0x389)]('WEBKIT_EXT_texture_filter_anisotropic')||_0x220ca1[_0x16830d(0x389)]('MOZ_EXT_texture_filter_anisotropic');if(_0x4d39a3){var _0x1c8dd7=_0x220ca1['getParameter'](_0x4d39a3[_0x16830d(0x307)]);return 0x0===_0x1c8dd7&&(_0x1c8dd7=0x2),_0x1c8dd7;}return null;},_0x17086f=_0x22a01d()){_0x224624[_0x44f3e7(0x210)]=0xa;break;}return _0x224624[_0x44f3e7(0x366)](_0x44f3e7(0x297),null);case 0xa:_0x233bc4=[],_0x44f3e7(0x328),_0x44f3e7(0x2e6),_0x3fd9f1=_0x17086f[_0x44f3e7(0x3ba)](),_0x17086f['bindBuffer'](_0x17086f[_0x44f3e7(0x2cf)],_0x3fd9f1),_0x323891=new Float32Array([-0.2,-0.9,0x0,0.4,-0.26,0x0,0x0,0.732134444,0x0]),_0x17086f[_0x44f3e7(0x267)](_0x17086f['ARRAY_BUFFER'],_0x323891,_0x17086f['STATIC_DRAW']),_0x3fd9f1[_0x44f3e7(0x27d)]=0x3,_0x3fd9f1[_0x44f3e7(0x291)]=0x3,_0x343ee8=_0x17086f[_0x44f3e7(0x23e)](),_0x4d44f7=_0x17086f[_0x44f3e7(0x255)](_0x17086f[_0x44f3e7(0x3a6)]),_0x17086f[_0x44f3e7(0x2f5)](_0x4d44f7,_0x44f3e7(0x328)),_0x17086f[_0x44f3e7(0x332)](_0x4d44f7),_0x59d375=_0x17086f[_0x44f3e7(0x255)](_0x17086f[_0x44f3e7(0x23d)]),_0x17086f[_0x44f3e7(0x2f5)](_0x59d375,_0x44f3e7(0x2e6)),_0x17086f[_0x44f3e7(0x332)](_0x59d375),_0x17086f[_0x44f3e7(0x2bb)](_0x343ee8,_0x4d44f7),_0x17086f[_0x44f3e7(0x2bb)](_0x343ee8,_0x59d375),_0x17086f[_0x44f3e7(0x263)](_0x343ee8),_0x17086f[_0x44f3e7(0x35b)](_0x343ee8),_0x343ee8[_0x44f3e7(0x2f4)]=_0x17086f['getAttribLocation'](_0x343ee8,'attrVertex'),_0x343ee8[_0x44f3e7(0x324)]=_0x17086f[_0x44f3e7(0x3ac)](_0x343ee8,'uniformOffset'),_0x17086f['enableVertexAttribArray'](_0x343ee8[_0x44f3e7(0x1ef)]),_0x17086f[_0x44f3e7(0x289)](_0x343ee8[_0x44f3e7(0x2f4)],_0x3fd9f1[_0x44f3e7(0x27d)],_0x17086f[_0x44f3e7(0x2cb)],!0x1,0x0,0x0),_0x17086f[_0x44f3e7(0x21c)](_0x343ee8['offsetUniform'],0x1,0x1),_0x17086f[_0x44f3e7(0x2e1)](_0x17086f[_0x44f3e7(0x2fb)],0x0,_0x3fd9f1[_0x44f3e7(0x291)]);try{_0x233bc4[_0x44f3e7(0x33c)](_0x17086f['canvas'][_0x44f3e7(0x27a)]());}catch(_0xb11fa8){}_0x233bc4[_0x44f3e7(0x33c)]((_0x17086f[_0x44f3e7(0x38f)]()||[])[_0x44f3e7(0x2e2)](';')),_0x233bc4[_0x44f3e7(0x33c)](_0x4cd68c(_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x2cc)]))),_0x233bc4[_0x44f3e7(0x33c)](_0x4cd68c(_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x31b)]))),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x20b)])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x36c)]()[_0x44f3e7(0x2f1)]?_0x44f3e7(0x261):'no'),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x226)])),_0x233bc4['push'](_0x17086f['getParameter'](_0x17086f[_0x44f3e7(0x305)])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x2c8)])),_0x233bc4[_0x44f3e7(0x33c)](_0x50de90(_0x17086f)),_0x233bc4['push'](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x3a7)])),_0x233bc4['push'](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x326)])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f['MAX_FRAGMENT_UNIFORM_VECTORS'])),_0x233bc4['push'](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x34b)])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f['MAX_TEXTURE_IMAGE_UNITS'])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x3a3)])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f['getParameter'](_0x17086f['MAX_VARYING_VECTORS'])),_0x233bc4['push'](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f['MAX_VERTEX_ATTRIBS'])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x3b5)])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x382)])),_0x233bc4[_0x44f3e7(0x33c)](_0x4cd68c(_0x17086f['getParameter'](_0x17086f[_0x44f3e7(0x205)]))),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f['getParameter'](_0x17086f[_0x44f3e7(0x37a)])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x2ca)])),_0x233bc4['push'](_0x17086f['getParameter'](_0x17086f['SHADING_LANGUAGE_VERSION'])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f['getParameter'](_0x17086f[_0x44f3e7(0x357)])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f['VENDOR'])),_0x233bc4[_0x44f3e7(0x33c)](_0x17086f[_0x44f3e7(0x2fd)](_0x17086f[_0x44f3e7(0x27c)])),_0x21b8d8=_0x51ec4a,_0x4b006b=_0x51ec4a;try{(_0x13ea62=_0x17086f['getExtension'](_0x44f3e7(0x2f8)))&&(_0x21b8d8=_0x17086f[_0x44f3e7(0x2fd)](_0x13ea62[_0x44f3e7(0x341)]),_0x233bc4[_0x44f3e7(0x33c)](_0x21b8d8),_0x4b006b=_0x17086f[_0x44f3e7(0x2fd)](_0x13ea62[_0x44f3e7(0x219)]),_0x233bc4[_0x44f3e7(0x33c)](_0x4b006b));}catch(_0x789d71){}if(_0x17086f['getShaderPrecisionFormat']){_0x224624[_0x44f3e7(0x210)]=0x45;break;}return _0x1539e4(_0x17086f),_0x224624[_0x44f3e7(0x366)]('return',_0x233bc4);case 0x45:return _0x1dd6b9(['FLOAT','INT'],function(_0x225156){var _0xd6ed10=_0x44f3e7;_0x1dd6b9(['VERTEX',_0xd6ed10(0x247)],function(_0x15730e){var _0x2127e0=_0xd6ed10;_0x1dd6b9([_0x2127e0(0x224),_0x2127e0(0x356),_0x2127e0(0x32e)],function(_0xd58423){var _0x532266=_0x2127e0;_0x1dd6b9([_0x532266(0x25d),_0x532266(0x370),_0x532266(0x344)],function(_0x4da0af){var _0x1fe91c=_0x532266,_0x4e3e8d=_0x17086f[_0x1fe91c(0x21e)](_0x17086f[_0x15730e+_0x1fe91c(0x2d2)],_0x17086f[_0xd58423+'_'+_0x225156])[_0x4da0af];_0x1fe91c(0x25d)!==_0x4da0af&&(_0x4da0af=_0x1fe91c(0x2a3)+_0x4da0af);var _0xe0d1e2=[_0x1fe91c(0x264),_0x15730e[_0x1fe91c(0x259)](),'\\x20shader\\x20',_0xd58423[_0x1fe91c(0x259)](),'\\x20',_0x225156['toLowerCase'](),'\\x20',_0x4da0af,':',_0x4e3e8d][_0x1fe91c(0x2e2)]('');_0x233bc4[_0x1fe91c(0x33c)](_0xe0d1e2);});});});}),_0x1539e4(_0x17086f),_0x1163a0=_0x2b8208(function(){var _0x472427=_0x44f3e7;return _0x4ccc13(_0x233bc4[_0x472427(0x2e2)]('::'));}),_0x224624[_0x44f3e7(0x366)](_0x44f3e7(0x297),[_0x1163a0,_0x21b8d8,_0x4b006b]);case 0x49:return _0x1539e4(_0x17086f),_0x224624[_0x44f3e7(0x366)](_0x44f3e7(0x297),[_0x51ec4a,_0x51ec4a,_0x51ec4a]);case 0x4b:case _0x44f3e7(0x3b1):return _0x224624[_0x44f3e7(0x229)]();}},_0x5db9a3);}));return function(){return _0x53b068['apply'](this,arguments);};}()),'audioId':function(){var _0x1ee872=_0x302c4e,_0x25e2af=0x3e8;if(navigator[_0x1ee872(0x22c)][_0x1ee872(0x274)](/OS 11.+Version\\/11.+Safari/))return _0x51ec4a;var _0x408f6f=window[_0x1ee872(0x21b)]||window[_0x1ee872(0x30f)];if(null==_0x408f6f)return _0x51ec4a;var _0x578423=new _0x408f6f(0x1,0x434a90,0xac44),_0x4ef3be=_0x578423[_0x1ee872(0x2a6)]();_0x4ef3be[_0x1ee872(0x24b)]='triangle',_0x4ef3be[_0x1ee872(0x31a)][_0x1ee872(0x275)](0x2710,_0x578423[_0x1ee872(0x283)]);var _0x532edc=_0x578423[_0x1ee872(0x278)]();return _0x1dd6b9([[_0x1ee872(0x211),-0x32],[_0x1ee872(0x287),0x28],[_0x1ee872(0x234),0xc],[_0x1ee872(0x25f),-0x14],[_0x1ee872(0x2d0),0x0],['release',0.25]],function(_0x593a60){var _0x2e213e=_0x1ee872;void 0x0!==_0x532edc[_0x593a60[0x0]]&&_0x2e213e(0x26a)==typeof _0x532edc[_0x593a60[0x0]]['setValueAtTime']&&_0x532edc[_0x593a60[0x0]]['setValueAtTime'](_0x593a60[0x1],_0x578423[_0x2e213e(0x283)]);}),_0x4ef3be[_0x1ee872(0x208)](_0x532edc),_0x532edc['connect'](_0x578423[_0x1ee872(0x31c)]),_0x4ef3be[_0x1ee872(0x335)](0x0),_0x578423[_0x1ee872(0x346)](),new Promise(function(_0x5f5b17,_0xc13732){var _0x2f4461=_0x1ee872,_0x1be248=setTimeout(function(){var _0x191ef3=a0_0x3813;_0x578423[_0x191ef3(0x216)]=function(){},_0x578423=null,_0x5f5b17('TT');},_0x25e2af);_0x578423[_0x2f4461(0x216)]=function(_0x547a8e){var _0x1900d9=_0x2f4461,_0x3fee57;try{clearTimeout(_0x1be248),_0x3fee57=_0x547a8e['renderedBuffer'][_0x1900d9(0x320)](0x0)['slice'](0x1194,0x1388)[_0x1900d9(0x311)](function(_0x39b733,_0x2398ef){var _0x24e82e=_0x1900d9;return _0x39b733+Math[_0x24e82e(0x203)](_0x2398ef);},0x0)[_0x1900d9(0x374)](),_0x4ef3be[_0x1900d9(0x292)](),_0x532edc['disconnect']();}catch(_0x394dac){_0xc13732(_0x394dac);}_0x5f5b17(_0x3fee57);};});},'userAgent':function(){var _0xa83557=_0x302c4e;if(navigator['userAgent']){var _0x48df48=navigator[_0xa83557(0x22c)];return _0x48df48[_0xa83557(0x317)]>0xa0&&(_0x48df48=_0x48df48[_0xa83557(0x26e)](0x0,0xa0)+_0xa83557(0x2dc)),_0x48df48;}},'host':function(){var _0x1fd438=_0x302c4e;return location[_0x1fd438(0x24f)];},'flashEnabled':function(){},'cookieEnabled':function(){var _0xb211f9=_0x302c4e;return navigator[_0xb211f9(0x2a9)]?0x0:0x1;},'navigationStart':function(){var _0x54437e=_0x302c4e,_0xd461a4=_0x51ec4a;return performance&&(_0xd461a4=Math[_0x54437e(0x2d3)](performance[_0x54437e(0x368)])),_0xd461a4;},'referer':function(){if(document['referrer'])return document['referrer'];},'screenRes':function(){var _0x811e5a=_0x302c4e;return window[_0x811e5a(0x39d)][_0x811e5a(0x25c)]+'*'+window[_0x811e5a(0x39d)][_0x811e5a(0x269)];},'initTime':function(){},'currentTime':function(){var _0x2ba614=_0x302c4e;return new Date()[_0x2ba614(0x29d)]();},'timezone':function(){var _0xe98a73=_0x302c4e;return Intl[_0xe98a73(0x375)]()[_0xe98a73(0x36e)]()[_0xe98a73(0x2e0)];},'vebgl_vendor':function(){var _0xcb74=_0x302c4e;if(navigator[_0xcb74(0x314)])return navigator['vendor'];},'language':function(){if(navigator['languages'])return navigator['languages'];},'available_resolution':function(){var _0xc9a926=_0x302c4e;return window[_0xc9a926(0x39d)]['availHeight']+'*'+window[_0xc9a926(0x39d)][_0xc9a926(0x257)];},'mimeTypes':function(){var _0x57e030=_0x302c4e;for(var _0x5f5369=[],_0x3f25b0=0x0;_0x3f25b0<navigator['mimeTypes']['length'];_0x3f25b0++){var _0x2197e6=navigator[_0x57e030(0x28b)][_0x3f25b0];_0x5f5369[_0x57e030(0x33c)]([_0x2197e6[_0x57e030(0x284)],_0x2197e6['type'],_0x2197e6[_0x57e030(0x3b9)]]['join'](','));}return _0x5f5369;},'hlct':function(){var _0x457582=_0x302c4e;return/HeadlessChrome/[_0x457582(0x34c)](navigator[_0x457582(0x22c)])?'1':'0';},'wdt':function(){var _0x43fb43=_0x302c4e;return navigator[_0x43fb43(0x296)]?'1':'0';},'debugTest':function(){var _0x4a51a0=_0x302c4e;try{return window[_0x4a51a0(0x217)]-window[_0x4a51a0(0x37d)]>0xa0||window[_0x4a51a0(0x248)]-window[_0x4a51a0(0x206)]>0xa0?'1':'0';}catch(_0x5cc10e){return'CA';}},'lrt':function(){var _0x1b17f1=_0x302c4e;return navigator['languages']&&0x0!==navigator[_0x1b17f1(0x200)]['length']?'0':'1';},'lsId':function(){var _0x4be6b0=_0x302c4e,_0x17e8dc=_0x4be6b0(0x380),_0x5bd34a=_0xecb4a8;try{localStorage&&(_0x5bd34a=localStorage[_0x4be6b0(0x383)](_0x17e8dc),_0x5bd34a||(_0x5bd34a=_0x11e454||_0x4be6b0(0x299),localStorage[_0x4be6b0(0x337)](_0x17e8dc,_0x5bd34a)));}catch(_0xd1e6f6){}return _0x5bd34a;},'colorDepth':function(){var _0x47a493=_0x302c4e;return window[_0x47a493(0x39d)][_0x47a493(0x22d)]||_0x51ec4a;},'pct':function(){var _0x3d5cef=_0x302c4e;return'object'==(_0x3d5cef(0x2b8)==typeof process?_0x3d5cef(0x2b8):_0xb71d86(process))?'1':'0';},'nodejsTest':function(){var _0x165251=_0x302c4e;return _0x165251(0x2b8)!=typeof global||navigator['userAgent'][_0x165251(0x1f9)](_0x165251(0x2c5))?'1':'0';},'touchCheck':function(){var _0x5108d8=_0x302c4e,_0x45f3d9=0x0,_0x22a021='1';void 0x0!==navigator['maxTouchPoints']?_0x45f3d9=navigator[_0x5108d8(0x270)]:void 0x0!==navigator[_0x5108d8(0x2c1)]&&(_0x45f3d9=navigator[_0x5108d8(0x2c1)]);try{document['createEvent'](_0x5108d8(0x2d5)),_0x22a021='0';}catch(_0x3a8705){}return _0x22a021+(_0x3c057d?'0':'1')+_0x45f3d9;},'androidGlobalParamCheck':function(){var _0x4be0a2=_0x302c4e;return _0x4be0a2(0x2df)in window?'0':'1';}},_0x4ddf7f=_0x14fe1e['audioId'](),_0x4f714d=_0x2b8208(_0x14fe1e[_0x302c4e(0x2b5)]),_0x3d9f3a=_0x2b8208(_0x14fe1e['webglId']),_0x304619=_0x14fe1e[_0x302c4e(0x290)](),_0x2b141b=_0x14fe1e[_0x302c4e(0x26c)](),_0x13f08b=_0x14fe1e[_0x302c4e(0x22c)](),_0x1d093f=_0x14fe1e[_0x302c4e(0x397)](),_0x3481f5=_0x14fe1e[_0x302c4e(0x34d)](),_0x367792=_0x14fe1e[_0x302c4e(0x242)](),_0x2ee177=_0x14fe1e[_0x302c4e(0x345)](),_0x2cefa7=_0x14fe1e[_0x302c4e(0x350)](),_0x8ba076=_0x14fe1e[_0x302c4e(0x363)](),_0x2b8643=_0x14fe1e[_0x302c4e(0x2a9)](),_0x9583a4=_0x14fe1e[_0x302c4e(0x28a)](),_0x1b5efa=_0x14fe1e[_0x302c4e(0x1f7)](),_0x113ae6=Date[_0x302c4e(0x2e3)](),_0x27cf02=_0x1d093f+_0x3481f5+_0x367792+_0x2ee177+_0x2cefa7,_0x4407dc=_0x8ba076+_0x1b5efa+_0x2b8643+_0x9583a4,_0x47314c=_0x2b8208(_0x14fe1e[_0x302c4e(0x1fc)]),_0x30f15e=_0x14fe1e[_0x302c4e(0x22d)](),_0x5db0e2=_0x14fe1e[_0x302c4e(0x24f)](),_0x4d5bce=_0x14fe1e[_0x302c4e(0x333)](),_0x288cef=[_0x304619,_0x2b141b,_0x30f15e,_0x13f08b,_0x27cf02,_0x5db0e2,_0x4407dc,_0x113ae6,_0x4d5bce,'8',_0x47314c],_0x341afe[_0x302c4e(0x366)](_0x302c4e(0x297),new Promise(function(_0x157dba,_0x4978e9){var _0x341241=_0x302c4e;Promise['all']([_0x3d9f3a,_0x4f714d,_0x4ddf7f])['then'](function(_0x5e8109){var _0x520309=a0_0x3813,_0x31247d=_0x5e8109[0x0],_0x581a9c=_0x31247d[0x0];_0x288cef[_0x520309(0x33c)](_0x581a9c);var _0x58c22f=_0x31247d[0x2];_0x288cef[_0x520309(0x33c)](_0x58c22f);var _0x31384b=_0x5e8109[0x1];_0x288cef['push'](_0x31384b);var _0x299828=_0x5e8109[0x2];_0x288cef[_0x520309(0x33c)](Date['now']());var _0x8aed1d='::'[_0x520309(0x329)](_0x31384b,'::')['concat'](_0x581a9c,'::')[_0x520309(0x329)](_0x299828,'::')[_0x520309(0x329)](_0x58c22f),_0x1a509a=_0x4ccc13(_0x8aed1d);_0x288cef[_0x520309(0x33c)](_0x1a509a),_0x157dba(_0x288cef[_0x520309(0x2e2)]('::'));})[_0x341241(0x20e)](function(_0x379fcb){var _0x63722e=_0x341241;for(_0x288cef[_0x63722e(0x33c)](_0x63722e(0x252)+_0x379fcb['message']);_0x288cef[_0x63722e(0x317)]<0x10;)_0x288cef['push']('CA');_0x157dba(_0x288cef['join']('::'));});}));case 0x35:case _0x302c4e(0x3b1):return _0x341afe[_0x302c4e(0x229)]();}},_0x309978);})),_0x106d56[_0x20e2f7(0x2b6)](this,arguments);}!(function(){var _0x87b29c=a0_0x3813,_0x1e913f=_0x87b29c(0x2b8)!=typeof globalThis?globalThis:_0x87b29c(0x2b8)!=typeof window?window:_0x87b29c(0x2b8)!=typeof self?self:this;function _0x28f79e(){var _0x5c1b42=_0x87b29c;return void 0x0!==_0x10f6f1?_0x10f6f1:(_0x1e913f['Module']||(_0x1e913f['Module']={}),_0x1e913f[_0x5c1b42(0x3a4)]);}_0x1e913f[_0x87b29c(0x2c9)]=_0x1e913f[_0x87b29c(0x2c9)]||{},_0x1e913f[_0x87b29c(0x2c9)][_0x87b29c(0x2a7)]=function(_0x274859){var _0x4779c8=_0x87b29c,_0x240cc7=_0x28f79e();if(_0x4779c8(0x26a)!=typeof _0x240cc7[_0x4779c8(0x212)]){if(_0x4779c8(0x26a)==typeof _0x240cc7[_0x4779c8(0x2e5)]){var _0x39e2a8=lengthBytesUTF8(_0x274859)+0x1,_0x17eefa=_malloc(_0x39e2a8);stringToUTF8(_0x274859,_0x17eefa,_0x39e2a8),_0x240cc7['_collect_callback'](_0x17eefa),_free(_0x17eefa);}}else _0x240cc7[_0x4779c8(0x212)](_0x4779c8(0x37f),null,['string'],[_0x274859]);},_0x28f79e()['__run_env_collect']=function(_0x1bef9e){var _0x1ffa55=_0x87b29c;_0x5a6491(_0x1bef9e)[_0x1ffa55(0x32d)](function(_0x5b0ce3){var _0x2eab54=_0x1ffa55;_0x1e913f[_0x2eab54(0x2c9)]['cbcb'](_0x5b0ce3);})[_0x1ffa55(0x20e)](function(_0x488724){var _0x5044b2=_0x1ffa55;console['log']('ec\\x20error'+_0x488724[_0x5044b2(0x22a)]),_0x1e913f[_0x5044b2(0x2c9)][_0x5044b2(0x2a7)](_0x488724[_0x5044b2(0x22a)]);});};}());var _0x4886ba=Object[_0x4ffc81(0x202)]({},_0x10f6f1),_0x2372f9=_0x4ffc81(0x28f)==(_0x4ffc81(0x2b8)==typeof wx?'undefined':_0xb71d86(wx))&&'object'===(_0x4ffc81(0x2b8)==typeof WXWebAssembly?_0x4ffc81(0x2b8):_0xb71d86(WXWebAssembly));_0x4ffc81(0x28f)===('undefined'==typeof WebAssembly?_0x4ffc81(0x2b8):_0xb71d86(WebAssembly))||_0x4ffc81(0x2b8)==typeof WXWebAssembly||_0xb71d86(WXWebAssembly);var _0x1fd16b='object'===(_0x4ffc81(0x2b8)==typeof WebAssembly?_0x4ffc81(0x2b8):_0xb71d86(WebAssembly))?WebAssembly:_0x4ffc81(0x28f)===(_0x4ffc81(0x2b8)==typeof WXWebAssembly?_0x4ffc81(0x2b8):_0xb71d86(WXWebAssembly))?WXWebAssembly:{};if(!_0x2372f9&&'undefined'!=typeof window&&!window[_0x4ffc81(0x22b)]){var _0x6431da=window['eval'],_0x330500=function(_0xb29599){var _0x1246d9=_0x4ffc81;try{return _0x6431da(_0xb29599);}catch(_0x5de19a){return _0x10f6f1[_0x1246d9(0x2bd)](_0x1246d9(0x2d9)+_0x5de19a[_0x1246d9(0x22a)]+'_'+_0x5de19a[_0x1246d9(0x36b)]),-0x1;}}['bind'](null);_0x330500['toString']=_0x6431da[_0x4ffc81(0x374)],Object[_0x4ffc81(0x3a2)](window,_0x4ffc81(0x22b),{'value':_0x330500});}var _0x15861d='';'undefined'!=typeof document&&document[_0x4ffc81(0x24e)]&&(_0x15861d=document[_0x4ffc81(0x24e)][_0x4ffc81(0x2d4)]),_0x15861d=0x0!==_0x15861d[_0x4ffc81(0x213)](_0x4ffc81(0x367))?_0x15861d['substr'](0x0,_0x15861d[_0x4ffc81(0x29e)](/[?#].*/,'')['lastIndexOf']('/')+0x1):'',_0x10f6f1[_0x4ffc81(0x323)]='',_0x10f6f1[_0x4ffc81(0x2bd)]=function(_0x27c9ed,_0x17299){var _0xcd3670=_0x4ffc81;_0x10f6f1[_0xcd3670(0x323)][_0xcd3670(0x1f9)](_0x27c9ed)&&(_0x27c9ed=_0x27c9ed[_0xcd3670(0x26e)](0x0,0xa));var _0x35bf4f=_0x17299?_0x17299+_0x27c9ed:_0x27c9ed;_0x10f6f1[_0xcd3670(0x323)][_0xcd3670(0x1f9)](_0x35bf4f)||(_0x10f6f1['errorMsg']=_0x10f6f1[_0xcd3670(0x323)]+'_'+_0x35bf4f);};var _0x572938,_0x204075=_0x10f6f1[_0x4ffc81(0x384)]||console[_0x4ffc81(0x343)][_0x4ffc81(0x327)](console),_0x30b297=_0x10f6f1[_0x4ffc81(0x2bd)]||console['warn'][_0x4ffc81(0x327)](console);if(Object[_0x4ffc81(0x202)](_0x10f6f1,_0x4886ba),_0x4886ba=null,_0x10f6f1[_0x4ffc81(0x2c0)]&&_0x10f6f1[_0x4ffc81(0x2c0)],_0x10f6f1[_0x4ffc81(0x2a4)]&&_0x10f6f1[_0x4ffc81(0x2a4)],_0x10f6f1[_0x4ffc81(0x2e9)]&&_0x10f6f1[_0x4ffc81(0x2e9)],_0x10f6f1[_0x4ffc81(0x2fa)]&&(_0x572938=_0x10f6f1[_0x4ffc81(0x2fa)]),_0x10f6f1['noExitRuntime'],'object'===(_0x4ffc81(0x2b8)==typeof WebAssembly?'undefined':_0xb71d86(WebAssembly))){var _0x289c3b,_0x2db944,_0x81561b,_0x35309b,_0x2a3c39=function(_0x20acf5){return _0x10f6f1['_'+_0x20acf5];},_0x25006e=function(_0x45a032,_0x175026,_0x440cdd,_0x189bd1,_0x4f3130){var _0x4eb051=_0x4ffc81,_0x3399fe={'string':function(_0x5137fc){var _0x3032fd=a0_0x3813,_0x4d8a81=0x0;if(null!=_0x5137fc&&0x0!==_0x5137fc){var _0x546b65=0x1+(_0x5137fc[_0x3032fd(0x317)]<<0x2);_0x4d8a81=_0xefacd3(_0x546b65),_0x380570(_0x5137fc,_0x4d8a81,_0x546b65);}return _0x4d8a81;},'array':function(_0x428a92){var _0xafc888=_0xefacd3(_0x428a92['length']);return _0x3021d6(_0x428a92,_0xafc888),_0xafc888;}},_0x4749d9=_0x2a3c39(_0x45a032),_0x21df2f=[],_0x312062=0x0;if(_0x189bd1)for(var _0x25bbdd=0x0;_0x25bbdd<_0x189bd1[_0x4eb051(0x317)];_0x25bbdd++){var _0xa3a636=_0x3399fe[_0x440cdd[_0x25bbdd]];_0xa3a636?(0x0===_0x312062&&(_0x312062=_0x45d462()),_0x21df2f[_0x25bbdd]=_0xa3a636(_0x189bd1[_0x25bbdd])):_0x21df2f[_0x25bbdd]=_0x189bd1[_0x25bbdd];}var _0x2c26d1=_0x4749d9[_0x4eb051(0x2b6)](null,_0x21df2f);return _0x2c26d1=function(_0x27f5c4){return 0x0!==_0x312062&&_0x44f681(_0x312062),function(_0x4a8698){var _0x1037b4=a0_0x3813;return'string'===_0x175026?_0x251a70(_0x4a8698):_0x1037b4(0x209)===_0x175026?Boolean(_0x4a8698):_0x4a8698;}(_0x27f5c4);}(_0x2c26d1);},_0x1fc42f=function(_0x3e2fe5,_0x2979b0,_0x5787da){var _0x571fa6=_0x4ffc81;for(var _0x2b3698=_0x2979b0+_0x5787da,_0x2fe13e=_0x2979b0;_0x3e2fe5[_0x2fe13e]&&!(_0x2fe13e>=_0x2b3698);)++_0x2fe13e;if(_0x2fe13e-_0x2979b0>0x10&&_0x3e2fe5[_0x571fa6(0x2e7)]&&_0x4e7c22)return _0x4e7c22[_0x571fa6(0x1ed)](_0x3e2fe5[_0x571fa6(0x240)](_0x2979b0,_0x2fe13e));for(var _0x4cb461='';_0x2979b0<_0x2fe13e;){var _0x567063=_0x3e2fe5[_0x2979b0++];if(0x80&_0x567063){var _0x4c945d=0x3f&_0x3e2fe5[_0x2979b0++];if(0xc0!=(0xe0&_0x567063)){var _0x147943=0x3f&_0x3e2fe5[_0x2979b0++];if((_0x567063=0xe0==(0xf0&_0x567063)?(0xf&_0x567063)<<0xc|_0x4c945d<<0x6|_0x147943:(0x7&_0x567063)<<0x12|_0x4c945d<<0xc|_0x147943<<0x6|0x3f&_0x3e2fe5[_0x2979b0++])<0x10000)_0x4cb461+=String[_0x571fa6(0x35e)](_0x567063);else{var _0x386e20=_0x567063-0x10000;_0x4cb461+=String['fromCharCode'](0xd800|_0x386e20>>0xa,0xdc00|0x3ff&_0x386e20);}}else _0x4cb461+=String[_0x571fa6(0x35e)]((0x1f&_0x567063)<<0x6|_0x4c945d);}else _0x4cb461+=String[_0x571fa6(0x35e)](_0x567063);}return _0x4cb461;},_0x251a70=function(_0x105ff5,_0x188b22){return _0x105ff5?_0x1fc42f(_0x81561b,_0x105ff5,_0x188b22):'';},_0x380570=function(_0xc76438,_0x495f07,_0x2b8794){return function(_0x2bdad1,_0x57d868,_0x1d3634,_0x458ee7){var _0x4d8cd4=a0_0x3813;if(!(_0x458ee7>0x0))return 0x0;for(var _0x4548f3=_0x1d3634,_0x4af374=_0x1d3634+_0x458ee7-0x1,_0x5dd96d=0x0;_0x5dd96d<_0x2bdad1['length'];++_0x5dd96d){var _0x27c452=_0x2bdad1[_0x4d8cd4(0x385)](_0x5dd96d);if(_0x27c452>=0xd800&&_0x27c452<=0xdfff&&(_0x27c452=0x10000+((0x3ff&_0x27c452)<<0xa)|0x3ff&_0x2bdad1[_0x4d8cd4(0x385)](++_0x5dd96d)),_0x27c452<=0x7f){if(_0x1d3634>=_0x4af374)break;_0x57d868[_0x1d3634++]=_0x27c452;}else{if(_0x27c452<=0x7ff){if(_0x1d3634+0x1>=_0x4af374)break;_0x57d868[_0x1d3634++]=0xc0|_0x27c452>>0x6,_0x57d868[_0x1d3634++]=0x80|0x3f&_0x27c452;}else{if(_0x27c452<=0xffff){if(_0x1d3634+0x2>=_0x4af374)break;_0x57d868[_0x1d3634++]=0xe0|_0x27c452>>0xc,_0x57d868[_0x1d3634++]=0x80|_0x27c452>>0x6&0x3f,_0x57d868[_0x1d3634++]=0x80|0x3f&_0x27c452;}else{if(_0x1d3634+0x3>=_0x4af374)break;_0x57d868[_0x1d3634++]=0xf0|_0x27c452>>0x12,_0x57d868[_0x1d3634++]=0x80|_0x27c452>>0xc&0x3f,_0x57d868[_0x1d3634++]=0x80|_0x27c452>>0x6&0x3f,_0x57d868[_0x1d3634++]=0x80|0x3f&_0x27c452;}}}}return _0x57d868[_0x1d3634]=0x0,_0x1d3634-_0x4548f3;}(_0xc76438,_0x81561b,_0x495f07,_0x2b8794);},_0x3021d6=function(_0x5f08eb,_0x50929c){var _0x3c8e6b=_0x4ffc81;_0x2db944[_0x3c8e6b(0x249)](_0x5f08eb,_0x50929c);},_0x240c31=function(_0x236c0e){var _0x5393e0=_0x4ffc81;_0x4205b7[_0x5393e0(0x2a8)](_0x236c0e);},_0x2e465e=function(_0x319f16){var _0x426063=_0x4ffc81;_0x4c34fb[_0x426063(0x2a8)](_0x319f16);},_0x2f6b00=function(_0x46add4){var _0x4ade95=_0x4ffc81;_0x10f6f1['onAbort']&&_0x10f6f1[_0x4ade95(0x37c)](_0x46add4),_0x30b297(_0x46add4=_0x4ade95(0x360)+_0x46add4+')'),_0x397541=!0x0;},_0x5ef1cd=function(_0x441ead){var _0x3dc17c=_0x4ffc81;return _0x441ead[_0x3dc17c(0x372)](_0x2dfa76);},_0x34b42a=function(_0x57e700){var _0x20724b=_0x4ffc81;try{if(_0x57e700==_0xfcda5&&_0x572938)return new Uint8Array(_0x572938);var _0xf6e483=_0x2642f5(_0x57e700);if(_0xf6e483)return _0xf6e483;throw _0x20724b(0x266);}catch(_0x5b86f8){_0x2f6b00(_0x5b86f8);}},_0x69e6cf=function(_0x145cba){var _0x3c94fc=_0x4ffc81;for(;_0x145cba[_0x3c94fc(0x317)]>0x0;)_0x145cba[_0x3c94fc(0x238)]()(_0x10f6f1);},_0x2642f5=function(_0x8479c){var _0x356e4d=_0x4ffc81;if(_0x5ef1cd(_0x8479c))return function(_0x4a7d2d){var _0x593e84=a0_0x3813;try{for(var _0x4bae9a=_0x52ad1b(_0x4a7d2d),_0x135a3d=new Uint8Array(_0x4bae9a['length']),_0x3eebdd=0x0;_0x3eebdd<_0x4bae9a[_0x593e84(0x317)];++_0x3eebdd)_0x135a3d[_0x3eebdd]=_0x4bae9a[_0x593e84(0x385)](_0x3eebdd);return _0x135a3d;}catch(_0x166457){return _0x30b297('Converting\\x20base64\\x20string\\x20to\\x20bytes\\x20failed.'),new Uint8Array(0x0);}}(_0x8479c[_0x356e4d(0x2a1)](_0x2dfa76[_0x356e4d(0x317)]));},_0x35588b=function(_0x1c14d9){return _0xefacd3(_0x1c14d9);},_0x273695=function(_0x229a58){var _0x22de84=_0x4ffc81;function _0x31ba2d(){var _0x419b1a=a0_0x3813;_0xb831f||(_0xb831f=!0x0,_0x10f6f1['calledRun']=!0x0,_0x397541||(_0x69e6cf(_0x37a8f9),_0x10f6f1['isInitRuntime']=!0x0,_0x10f6f1['onRuntimeInitialized']&&_0x10f6f1[_0x419b1a(0x20d)](),(function(){var _0x2e28bc=_0x419b1a;if(_0x10f6f1[_0x2e28bc(0x35f)]){for('function'==typeof _0x10f6f1[_0x2e28bc(0x35f)]&&(_0x10f6f1[_0x2e28bc(0x35f)]=[_0x10f6f1['postRun']]);_0x10f6f1[_0x2e28bc(0x35f)][_0x2e28bc(0x317)];)_0x2e465e(_0x10f6f1[_0x2e28bc(0x35f)][_0x2e28bc(0x238)]());}_0x69e6cf(_0x4c34fb);}())));}_0x420f64>0x0||(!(function(){var _0x3c4b58=a0_0x3813;if(_0x10f6f1['preRun']){for(_0x3c4b58(0x26a)==typeof _0x10f6f1[_0x3c4b58(0x347)]&&(_0x10f6f1[_0x3c4b58(0x347)]=[_0x10f6f1['preRun']]);_0x10f6f1['preRun'][_0x3c4b58(0x317)];)_0x240c31(_0x10f6f1['preRun'][_0x3c4b58(0x238)]());}_0x69e6cf(_0x4205b7);}()),_0x420f64>0x0||(_0x10f6f1[_0x22de84(0x35a)]?(_0x10f6f1[_0x22de84(0x35a)]('Running...'),setTimeout(function(){setTimeout(function(){var _0x21cea0=a0_0x3813;_0x10f6f1[_0x21cea0(0x35a)]('');},0x1),_0x31ba2d();},0x1)):_0x31ba2d()));},_0x397541=!0x1,_0x4e7c22='undefined'!=typeof TextDecoder?new TextDecoder(_0x4ffc81(0x330)):void 0x0;_0x10f6f1[_0x4ffc81(0x30d)];var _0xfcda5,_0x4205b7=[],_0x37a8f9=[],_0x4c34fb=[],_0x420f64=0x0,_0xacd9fc=null,_0x4f42d4=null,_0x2dfa76='data:application/octet-stream;base64,';_0x5ef1cd(_0xfcda5=_0x4ffc81(0x33e))||(_0x3ce34c=_0xfcda5,_0xfcda5=_0x10f6f1[_0x4ffc81(0x1ff)]?_0x10f6f1['locateFile'](_0x3ce34c,_0x15861d):_0x15861d+_0x3ce34c);var _0x470c39=[null,[],[]],_0x52ad1b=_0x4ffc81(0x26a)==typeof atob?atob:function(_0x47832a){var _0x41cd7f=_0x4ffc81,_0x7e2bb9,_0x19acab,_0x3a75c2,_0x315e5d,_0x399e0d,_0x428381,_0x391e50=_0x41cd7f(0x32f),_0x44f858='',_0x39186c=0x0;_0x47832a=_0x47832a['replace'](/[^A-Za-z0-9\\+\\/\\=]/g,'');do{_0x7e2bb9=_0x391e50[_0x41cd7f(0x213)](_0x47832a['charAt'](_0x39186c++))<<0x2|(_0x315e5d=_0x391e50[_0x41cd7f(0x213)](_0x47832a[_0x41cd7f(0x349)](_0x39186c++)))>>0x4,_0x19acab=(0xf&_0x315e5d)<<0x4|(_0x399e0d=_0x391e50[_0x41cd7f(0x213)](_0x47832a[_0x41cd7f(0x349)](_0x39186c++)))>>0x2,_0x3a75c2=(0x3&_0x399e0d)<<0x6|(_0x428381=_0x391e50['indexOf'](_0x47832a['charAt'](_0x39186c++))),_0x44f858+=String[_0x41cd7f(0x35e)](_0x7e2bb9),0x40!==_0x399e0d&&(_0x44f858+=String[_0x41cd7f(0x35e)](_0x19acab)),0x40!==_0x428381&&(_0x44f858+=String[_0x41cd7f(0x35e)](_0x3a75c2));}while(_0x39186c<_0x47832a['length']);return _0x44f858;},_0x5c998c={'c':function(){var _0x41b159=_0x4ffc81;return Date[_0x41b159(0x2e3)]();},'d':function(_0x549dbe,_0x1f0c36,_0x2e403c){_0x81561b['copyWithin'](_0x549dbe,_0x1f0c36,_0x1f0c36+_0x2e403c);},'a':function(_0x14bf34){return _0x2372f9?-0x1:0x0|window['bspMr'](_0x251a70(_0x14bf34));},'b':function(_0x5a69ad,_0x46247c,_0x590a74,_0x53379d){var _0x1e304d=_0x4ffc81;for(var _0x559615,_0x2da790,_0x6e35fb,_0x3bee4e=0x0,_0x4f0daa=0x0;_0x4f0daa<_0x590a74;_0x4f0daa++){var _0x18b44d=_0x35309b[_0x46247c>>0x2],_0x5ecb0b=_0x35309b[_0x46247c+0x4>>0x2];_0x46247c+=0x8;for(var _0x1294f5=0x0;_0x1294f5<_0x5ecb0b;_0x1294f5++)_0x559615=_0x5a69ad,_0x2da790=_0x81561b[_0x18b44d+_0x1294f5],_0x6e35fb=void 0x0,_0x6e35fb=_0x470c39[_0x559615],0x0===_0x2da790||0xa===_0x2da790?((0x1===_0x559615?_0x204075:_0x30b297)(_0x1fc42f(_0x6e35fb,0x0)),_0x6e35fb[_0x1e304d(0x317)]=0x0):_0x6e35fb['push'](_0x2da790);_0x3bee4e+=_0x5ecb0b;}return _0x35309b[_0x53379d>>0x2]=_0x3bee4e,0x0;},'e':function(){var _0x183123=_0x4ffc81;if(_0x2372f9)return'wx_gfs';var _0x19f361,_0x53c3c0=[],_0x191775=[];try{var _0x24371c=new Error()[_0x183123(0x36b)],_0x1a529c=(_0x24371c+='')[_0x183123(0x310)]('\\x0a');if(_0x1a529c[_0x183123(0x317)]>0x6)for(var _0x118674=0x6;_0x118674<_0x1a529c['length']&&_0x191775[_0x183123(0x317)]<0x18;_0x118674++){var _0x4f785b=_0x1a529c[_0x118674][_0x183123(0x29e)]('https://','')[_0x183123(0x26e)](_0x1a529c[_0x118674][_0x183123(0x213)]('at\\x20')+0x3,_0x1a529c[_0x118674][_0x183123(0x213)]('at\\x20')+0x8);_0x191775['push'](_0x4f785b);}else _0x191775['push']('SE');}catch(_0x2e1215){_0x191775[_0x183123(0x33c)]('CA');}_0x53c3c0[_0x183123(0x33c)](_0x191775[_0x183123(0x2e2)]('$'));try{_0x19f361=window[_0x183123(0x217)]-window[_0x183123(0x37d)]>0xa0||window[_0x183123(0x248)]-window[_0x183123(0x206)]>0xa0?'1':'0';}catch(_0x1720c9){_0x19f361='CA';}_0x53c3c0[_0x183123(0x33c)]([_0x19f361,window[_0x183123(0x3bd)]][_0x183123(0x2e2)]('&'));var _0x4caf5f=window[_0x183123(0x277)];_0x53c3c0[_0x183123(0x33c)](_0x4caf5f||'RF'),_0x183123(0x2b8)!=typeof performance&&_0x183123(0x26a)==typeof performance[_0x183123(0x2e3)]?_0x53c3c0['push'](Math[_0x183123(0x302)](performance['now']())):_0x53c3c0['push']('FF'),_0x53c3c0[_0x183123(0x33c)](window[_0x183123(0x2d1)]?window['uycvb']:'RF');try{var _0x3cbc86=_0x53c3c0[_0x183123(0x2e2)]('::'),_0x50fac6=function(_0x40350c){var _0x524b49=_0x183123;for(var _0x45e550=0x0,_0x140d47=0x0;_0x140d47<_0x40350c['length'];++_0x140d47){var _0x452caa=_0x40350c[_0x524b49(0x385)](_0x140d47);_0x452caa>=0xd800&&_0x452caa<=0xdfff&&(_0x452caa=0x10000+((0x3ff&_0x452caa)<<0xa)|0x3ff&_0x40350c[_0x524b49(0x385)](++_0x140d47)),_0x452caa<=0x7f?++_0x45e550:_0x45e550+=_0x452caa<=0x7ff?0x2:_0x452caa<=0xffff?0x3:0x4;}return _0x45e550;}(_0x3cbc86)+0x1,_0x24dfeb=_0x35588b(_0x50fac6);return _0x380570(_0x3cbc86,_0x24dfeb,_0x50fac6),_0x24dfeb;}catch(_0x29600e){return 0x0;}},'f':function(_0x3747a1){var _0x73da81=_0x4ffc81;'function'==typeof _0x10f6f1[_0x73da81(0x377)]&&_0x10f6f1[_0x73da81(0x377)](_0x251a70(_0x3747a1));}};!(function(){var _0x565614=_0x4ffc81,_0x2e32a0={'a':_0x5c998c};function _0x252acd(_0x19c63e,_0x4cc79d){var _0x384edd=a0_0x3813,_0x4aa377,_0x24ddb6,_0x4d7818=_0x19c63e[_0x384edd(0x35c)];_0x10f6f1[_0x384edd(0x21d)]=_0x4d7818,_0x289c3b=_0x10f6f1['asm']['g'],_0x4aa377=_0x289c3b['buffer'],_0x10f6f1[_0x384edd(0x256)]=_0x2db944=new Int8Array(_0x4aa377),_0x10f6f1[_0x384edd(0x246)]=new Int16Array(_0x4aa377),_0x10f6f1[_0x384edd(0x3a1)]=new Int32Array(_0x4aa377),_0x10f6f1[_0x384edd(0x20a)]=_0x81561b=new Uint8Array(_0x4aa377),_0x10f6f1['HEAPU16']=new Uint16Array(_0x4aa377),_0x10f6f1[_0x384edd(0x3aa)]=_0x35309b=new Uint32Array(_0x4aa377),_0x10f6f1[_0x384edd(0x276)]=new Float32Array(_0x4aa377),_0x10f6f1[_0x384edd(0x294)]=new Float64Array(_0x4aa377),_0x10f6f1['asm']['m'],_0x24ddb6=_0x10f6f1['asm']['h'],_0x37a8f9[_0x384edd(0x2a8)](_0x24ddb6),function(_0x26ade3){var _0x4aa155=_0x384edd;if(_0x420f64--,_0x10f6f1[_0x4aa155(0x2fc)]&&_0x10f6f1[_0x4aa155(0x2fc)](_0x420f64),0x0==_0x420f64&&(null!==_0xacd9fc&&(clearInterval(_0xacd9fc),_0xacd9fc=null),_0x4f42d4)){var _0x447255=_0x4f42d4;_0x4f42d4=null,_0x447255();}}();}function _0x38eaf5(_0x2cf479){var _0x4ca426=a0_0x3813;_0x252acd(_0x2cf479[_0x4ca426(0x37e)]);}function _0x31c97e(_0x30e7a3){var _0x2ddca6=a0_0x3813;return(_0x572938||_0x2ddca6(0x26a)!=typeof fetch?Promise['resolve']()[_0x2ddca6(0x32d)](function(){return _0x34b42a(_0xfcda5);}):fetch(_0xfcda5,{'credentials':'same-origin'})[_0x2ddca6(0x32d)](function(_0x1ae05f){var _0x3d1a37=_0x2ddca6;if(!_0x1ae05f['ok'])throw'failed\\x20to\\x20load\\x20wasm\\x20binary\\x20file\\x20at\\x20\\x27'+_0xfcda5+'\\x27';return _0x1ae05f[_0x3d1a37(0x1ee)]();})[_0x2ddca6(0x20e)](function(){return _0x34b42a(_0xfcda5);}))['then'](function(_0x3206b4){var _0x54aa6b=_0x2ddca6;return _0x1fd16b[_0x54aa6b(0x381)](_0x3206b4,_0x2e32a0);})[_0x2ddca6(0x32d)](function(_0x5f3629){return _0x5f3629;})[_0x2ddca6(0x32d)](_0x30e7a3,function(_0x374054){_0x30b297('failed\\x20to\\x20asynchronously\\x20prepare\\x20wasm:\\x20'+_0x374054),_0x2f6b00(_0x374054);});}if(_0x420f64++,_0x10f6f1[_0x565614(0x2fc)]&&_0x10f6f1[_0x565614(0x2fc)](_0x420f64),_0x10f6f1[_0x565614(0x391)])try{return _0x10f6f1['instantiateWasm'](_0x2e32a0,_0x252acd);}catch(_0x3c7e22){return _0x30b297(_0x565614(0x1fe)+_0x3c7e22),!0x1;}_0x572938||'function'!=typeof _0x1fd16b[_0x565614(0x2ef)]||_0x5ef1cd(_0xfcda5)||'function'!=typeof fetch?_0x31c97e(_0x38eaf5):fetch(_0xfcda5,{'credentials':_0x565614(0x2aa)})[_0x565614(0x32d)](function(_0x5773fb){var _0x200c20=_0x565614;return _0x1fd16b[_0x200c20(0x2ef)](_0x5773fb,_0x2e32a0)[_0x200c20(0x32d)](_0x38eaf5,function(_0x43d21d){var _0x514d03=_0x200c20;return _0x30b297(_0x514d03(0x3c0)+_0x43d21d),_0x30b297(_0x514d03(0x221)),_0x31c97e(_0x38eaf5);});});}()),_0x10f6f1[_0x4ffc81(0x2d8)]=function(){var _0x127a24=_0x4ffc81;return(_0x10f6f1[_0x127a24(0x2d8)]=_0x10f6f1['asm']['h'])['apply'](null,arguments);},_0x10f6f1[_0x4ffc81(0x2ff)]=function(){var _0x9af74f=_0x4ffc81;return(_0x10f6f1['_init_code']=_0x10f6f1[_0x9af74f(0x21d)]['i'])[_0x9af74f(0x2b6)](null,arguments);},_0x10f6f1[_0x4ffc81(0x230)]=function(){var _0xc67ced=_0x4ffc81;return(_0x10f6f1[_0xc67ced(0x230)]=_0x10f6f1[_0xc67ced(0x21d)]['j'])[_0xc67ced(0x2b6)](null,arguments);},_0x10f6f1[_0x4ffc81(0x2e5)]=function(){var _0x14ff7f=_0x4ffc81;return(_0x10f6f1[_0x14ff7f(0x2e5)]=_0x10f6f1[_0x14ff7f(0x21d)]['k'])['apply'](null,arguments);},_0x10f6f1[_0x4ffc81(0x3b0)]=function(){var _0xbf33ee=_0x4ffc81;return(_0x10f6f1[_0xbf33ee(0x3b0)]=_0x10f6f1['asm']['l'])['apply'](null,arguments);};var _0xb831f,_0x45d462=_0x10f6f1['stackSave']=function(){var _0x29070d=_0x4ffc81;return(_0x45d462=_0x10f6f1[_0x29070d(0x21f)]=_0x10f6f1[_0x29070d(0x21d)]['n'])[_0x29070d(0x2b6)](null,arguments);},_0x44f681=_0x10f6f1[_0x4ffc81(0x3be)]=function(){var _0x53b9c2=_0x4ffc81;return(_0x44f681=_0x10f6f1[_0x53b9c2(0x3be)]=_0x10f6f1['asm']['o'])[_0x53b9c2(0x2b6)](null,arguments);},_0xefacd3=_0x10f6f1[_0x4ffc81(0x243)]=function(){var _0x2bbac5=_0x4ffc81;return(_0xefacd3=_0x10f6f1['stackAlloc']=_0x10f6f1[_0x2bbac5(0x21d)]['p'])[_0x2bbac5(0x2b6)](null,arguments);};if(_0x10f6f1['ccall']=_0x25006e,_0x10f6f1[_0x4ffc81(0x207)]=function(_0x55fda0,_0x4c343c,_0x3d8e95,_0x44f3ba){var _0x1ddf6c=_0x4ffc81,_0x2fa423=(_0x3d8e95=_0x3d8e95||[])[_0x1ddf6c(0x376)](function(_0x563572){var _0x43ac0a=_0x1ddf6c;return _0x43ac0a(0x358)===_0x563572;});return _0x1ddf6c(0x24d)!==_0x4c343c&&_0x2fa423&&!_0x44f3ba?_0x2a3c39(_0x55fda0):function(){return _0x25006e(_0x55fda0,_0x4c343c,_0x3d8e95,arguments);};},_0x4f42d4=function _0x4535ad(){_0xb831f||_0x273695(),_0xb831f||(_0x4f42d4=_0x4535ad);},_0x10f6f1['run']=_0x273695,_0x10f6f1[_0x4ffc81(0x2af)]){for('function'==typeof _0x10f6f1[_0x4ffc81(0x2af)]&&(_0x10f6f1[_0x4ffc81(0x2af)]=[_0x10f6f1[_0x4ffc81(0x2af)]]);_0x10f6f1[_0x4ffc81(0x2af)][_0x4ffc81(0x317)]>0x0;)_0x10f6f1['preInit']['pop']()();}}function _0x431d8c(_0x28ff33,_0x2a89a2,_0xbb058b){var _0x4777c9=_0x4ffc81,_0x1f8b78,_0x3f6dff,_0x555c7d=_0x5c9c80(_0x28ff33,_0x417713(_0x2a89a2),_0xbb058b),_0x2438d1=[],_0x46f3eb=_0x545f1d(Object[_0x4777c9(0x364)](_0x555c7d)[_0x4777c9(0x280)]());try{for(_0x46f3eb['s']();!(_0x1f8b78=_0x46f3eb['n']())[_0x4777c9(0x38c)];){var _0x3ce7d4=_0x1f8b78[_0x4777c9(0x2f0)];_0x2438d1[_0x4777c9(0x33c)](_0x3ce7d4+(_0x555c7d[_0x3ce7d4]?'='+(_0x3f6dff=_0x555c7d[_0x3ce7d4],encodeURIComponent(_0x3f6dff['replace'](/(\\n|\\r)/g,''))):''));}}catch(_0x64f02){_0x46f3eb['e'](_0x64f02);}finally{_0x46f3eb['f']();}return _0x2438d1['join']('&');}function _0x417713(_0x5d6edd){var _0x35e985=_0x4ffc81;if(!_0x5d6edd)return{};var _0x41985f,_0x34a83b,_0x30ca8b,_0x580055={},_0x4b9cd3=_0x545f1d(new URLSearchParams(_0x5d6edd));try{for(_0x4b9cd3['s']();!(_0x41985f=_0x4b9cd3['n']())[_0x35e985(0x38c)];){var _0x3d3320=(_0x34a83b=_0x41985f[_0x35e985(0x2f0)],_0x30ca8b=0x2,_0x212657(_0x34a83b)||_0x58bd62(_0x34a83b,_0x30ca8b)||_0x40d2d3(_0x34a83b,_0x30ca8b)||_0x564523()),_0x41e745=_0x3d3320[0x0],_0x5edef3=_0x3d3320[0x1];_0x580055[_0x41e745]=decodeURIComponent(_0x5edef3);}}catch(_0x5aeafa){_0x4b9cd3['e'](_0x5aeafa);}finally{_0x4b9cd3['f']();}return _0x580055;}function _0x5c9c80(_0x1dbf2d,_0x21d02a,_0x57e610){var _0x344fed=_0x4ffc81,_0x14d951={};if(_0x344fed(0x28f)!=(_0x344fed(0x2b8)==typeof wx?_0x344fed(0x2b8):_0xb71d86(wx))&&(_0x1dbf2d instanceof FormData||_0x1dbf2d instanceof URLSearchParams)){var _0x5c8637,_0x2dc5af=_0x545f1d(_0x1dbf2d);try{for(_0x2dc5af['s']();!(_0x5c8637=_0x2dc5af['n']())['done'];){var _0xdf91b4=_0x5c8637[_0x344fed(0x2f0)];_0x344fed(0x24d)==typeof _0xdf91b4[0x1]&&(_0x14d951[_0xdf91b4[0x0]]=_0xdf91b4[0x1]);}}catch(_0x38c0ab){_0x2dc5af['e'](_0x38c0ab);}finally{_0x2dc5af['f']();}}else{if(_0x344fed(0x338)===_0x57e610)return _0x34cfc2(_0x34cfc2({},_0x1dbf2d),_0x21d02a);}return _0x34cfc2(_0x34cfc2({},_0x14d951),_0x21d02a);}function _0x1ddd15(_0x4b34fc,_0x1e34eb,_0x34c35d){var _0x227c4c=_0x4ffc81;return _0x4b34fc(_0x34c35d={'path':_0x1e34eb,'exports':{},'require':function(_0x28d29b,_0x3d7f26){var _0x14bd79=a0_0x3813;return _0x84b5(null==_0x3d7f26&&_0x34c35d[_0x14bd79(0x1f0)]);}},_0x34c35d[_0x227c4c(0x35c)]),_0x34c35d['exports'];}function _0x84b5(){throw new Error('Dynamic\\x20requires\\x20are\\x20not\\x20currently\\x20supported\\x20by\\x20@rollup/plugin-commonjs');}var _0x33de4d=_0x4c188e;function _0x4c188e(_0x46c414,_0xf291c7){var _0x2e46a2=_0x4ffc81;if(!_0x46c414)throw new Error(_0xf291c7||_0x2e46a2(0x244));}function _0x1250a5(_0x5c8189,_0x1af030){var _0x2b7f9c=_0x4ffc81;return 0xd800==(0xfc00&_0x5c8189[_0x2b7f9c(0x385)](_0x1af030))&&(!(_0x1af030<0x0||_0x1af030+0x1>=_0x5c8189['length'])&&0xdc00==(0xfc00&_0x5c8189[_0x2b7f9c(0x385)](_0x1af030+0x1)));}function _0x2ce10a(_0x1c66b7,_0x174c79){var _0x1d3a5f=_0x4ffc81;if(Array[_0x1d3a5f(0x2eb)](_0x1c66b7))return _0x1c66b7[_0x1d3a5f(0x2a1)]();if(!_0x1c66b7)return[];var _0x34ae86=[];if('string'==typeof _0x1c66b7){if(_0x174c79){if(_0x1d3a5f(0x1f6)===_0x174c79){for((_0x1c66b7=_0x1c66b7[_0x1d3a5f(0x29e)](/[^a-z0-9]+/gi,''))[_0x1d3a5f(0x317)]%0x2!=0x0&&(_0x1c66b7='0'+_0x1c66b7),_0x127844=0x0;_0x127844<_0x1c66b7[_0x1d3a5f(0x317)];_0x127844+=0x2)_0x34ae86[_0x1d3a5f(0x33c)](parseInt(_0x1c66b7[_0x127844]+_0x1c66b7[_0x127844+0x1],0x10));}}else for(var _0x332b3d=0x0,_0x127844=0x0;_0x127844<_0x1c66b7[_0x1d3a5f(0x317)];_0x127844++){var _0x21da45=_0x1c66b7[_0x1d3a5f(0x385)](_0x127844);_0x21da45<0x80?_0x34ae86[_0x332b3d++]=_0x21da45:_0x21da45<0x800?(_0x34ae86[_0x332b3d++]=_0x21da45>>0x6|0xc0,_0x34ae86[_0x332b3d++]=0x3f&_0x21da45|0x80):_0x1250a5(_0x1c66b7,_0x127844)?(_0x21da45=0x10000+((0x3ff&_0x21da45)<<0xa)+(0x3ff&_0x1c66b7[_0x1d3a5f(0x385)](++_0x127844)),_0x34ae86[_0x332b3d++]=_0x21da45>>0x12|0xf0,_0x34ae86[_0x332b3d++]=_0x21da45>>0xc&0x3f|0x80,_0x34ae86[_0x332b3d++]=_0x21da45>>0x6&0x3f|0x80,_0x34ae86[_0x332b3d++]=0x3f&_0x21da45|0x80):(_0x34ae86[_0x332b3d++]=_0x21da45>>0xc|0xe0,_0x34ae86[_0x332b3d++]=_0x21da45>>0x6&0x3f|0x80,_0x34ae86[_0x332b3d++]=0x3f&_0x21da45|0x80);}}else{for(_0x127844=0x0;_0x127844<_0x1c66b7[_0x1d3a5f(0x317)];_0x127844++)_0x34ae86[_0x127844]=0x0|_0x1c66b7[_0x127844];}return _0x34ae86;}function _0x3ea507(_0x4175e8){var _0x17e54d=_0x4ffc81;for(var _0x2c4a57='',_0x1bbe4e=0x0;_0x1bbe4e<_0x4175e8['length'];_0x1bbe4e++)_0x2c4a57+=_0x88cbfc(_0x4175e8[_0x1bbe4e][_0x17e54d(0x374)](0x10));return _0x2c4a57;}function _0x30e4ae(_0x48512f){return(_0x48512f>>>0x18|_0x48512f>>>0x8&0xff00|_0x48512f<<0x8&0xff0000|(0xff&_0x48512f)<<0x18)>>>0x0;}function _0x5f3200(_0x10ead8,_0xc1e4be){var _0x55ee5a=_0x4ffc81;for(var _0x561243='',_0x24c99d=0x0;_0x24c99d<_0x10ead8[_0x55ee5a(0x317)];_0x24c99d++){var _0x570e7b=_0x10ead8[_0x24c99d];_0x55ee5a(0x1f3)===_0xc1e4be&&(_0x570e7b=_0x30e4ae(_0x570e7b)),_0x561243+=_0x5e5af9(_0x570e7b[_0x55ee5a(0x374)](0x10));}return _0x561243;}function _0x88cbfc(_0xfa2ea0){var _0x3168f8=_0x4ffc81;return 0x1===_0xfa2ea0[_0x3168f8(0x317)]?'0'+_0xfa2ea0:_0xfa2ea0;}function _0x5e5af9(_0x577504){var _0x43c3fc=_0x4ffc81;return 0x7===_0x577504['length']?'0'+_0x577504:0x6===_0x577504[_0x43c3fc(0x317)]?'00'+_0x577504:0x5===_0x577504[_0x43c3fc(0x317)]?_0x43c3fc(0x2bc)+_0x577504:0x4===_0x577504[_0x43c3fc(0x317)]?'0000'+_0x577504:0x3===_0x577504['length']?'00000'+_0x577504:0x2===_0x577504['length']?_0x43c3fc(0x2c2)+_0x577504:0x1===_0x577504['length']?'0000000'+_0x577504:_0x577504;}function _0x42cc2c(_0x1411b7,_0x448463,_0x407174,_0x25f3ce){var _0x1bbe25=_0x4ffc81,_0x506299=_0x407174-_0x448463;_0x33de4d(_0x506299%0x4==0x0);for(var _0x661900=new Array(_0x506299/0x4),_0x3271a2=0x0,_0x439a3b=_0x448463;_0x3271a2<_0x661900[_0x1bbe25(0x317)];_0x3271a2++,_0x439a3b+=0x4){var _0xbd9537;_0xbd9537='big'===_0x25f3ce?_0x1411b7[_0x439a3b]<<0x18|_0x1411b7[_0x439a3b+0x1]<<0x10|_0x1411b7[_0x439a3b+0x2]<<0x8|_0x1411b7[_0x439a3b+0x3]:_0x1411b7[_0x439a3b+0x3]<<0x18|_0x1411b7[_0x439a3b+0x2]<<0x10|_0x1411b7[_0x439a3b+0x1]<<0x8|_0x1411b7[_0x439a3b],_0x661900[_0x3271a2]=_0xbd9537>>>0x0;}return _0x661900;}function _0x5ca61c(_0x33b3d9,_0x4e225d){var _0x1373a1=_0x4ffc81;for(var _0x9c8b3d=new Array(0x4*_0x33b3d9[_0x1373a1(0x317)]),_0x49d901=0x0,_0x480183=0x0;_0x49d901<_0x33b3d9[_0x1373a1(0x317)];_0x49d901++,_0x480183+=0x4){var _0xb8bd9f=_0x33b3d9[_0x49d901];_0x1373a1(0x39c)===_0x4e225d?(_0x9c8b3d[_0x480183]=_0xb8bd9f>>>0x18,_0x9c8b3d[_0x480183+0x1]=_0xb8bd9f>>>0x10&0xff,_0x9c8b3d[_0x480183+0x2]=_0xb8bd9f>>>0x8&0xff,_0x9c8b3d[_0x480183+0x3]=0xff&_0xb8bd9f):(_0x9c8b3d[_0x480183+0x3]=_0xb8bd9f>>>0x18,_0x9c8b3d[_0x480183+0x2]=_0xb8bd9f>>>0x10&0xff,_0x9c8b3d[_0x480183+0x1]=_0xb8bd9f>>>0x8&0xff,_0x9c8b3d[_0x480183]=0xff&_0xb8bd9f);}return _0x9c8b3d;}function _0x2c7294(_0x5510f4,_0x41026e){return _0x5510f4>>>_0x41026e|_0x5510f4<<0x20-_0x41026e;}function _0x4511ad(_0x54f8dc,_0x2efeaf){return _0x54f8dc<<_0x2efeaf|_0x54f8dc>>>0x20-_0x2efeaf;}function _0x5b9775(_0x3faa03,_0x4965bd){return _0x3faa03+_0x4965bd>>>0x0;}function _0xf8c67d(_0x527004,_0x28a1b4,_0x640fdc){return _0x527004+_0x28a1b4+_0x640fdc>>>0x0;}function _0x16b5ec(_0x1d8b56,_0xdccdc,_0x54b687,_0x24afac){return _0x1d8b56+_0xdccdc+_0x54b687+_0x24afac>>>0x0;}function _0x8cae0e(_0x333d79,_0x45bf7e,_0x2324f0,_0x85fb54,_0x23c069){return _0x333d79+_0x45bf7e+_0x2324f0+_0x85fb54+_0x23c069>>>0x0;}function _0x3b5850(_0x4b74bd,_0x3152bc,_0x3731d4,_0xdacaf5){var _0xd0660e=_0x4b74bd[_0x3152bc],_0x424896=_0xdacaf5+_0x4b74bd[_0x3152bc+0x1]>>>0x0,_0x3ff814=(_0x424896<_0xdacaf5?0x1:0x0)+_0x3731d4+_0xd0660e;_0x4b74bd[_0x3152bc]=_0x3ff814>>>0x0,_0x4b74bd[_0x3152bc+0x1]=_0x424896;}function _0x5f410c(_0x5420c1,_0x3eb9a8,_0x8831e1,_0x499562){return(_0x3eb9a8+_0x499562>>>0x0<_0x3eb9a8?0x1:0x0)+_0x5420c1+_0x8831e1>>>0x0;}function _0x4bfa87(_0x2205a0,_0x169574,_0x298e50,_0x4fd3e2){return _0x169574+_0x4fd3e2>>>0x0;}function _0x14323e(_0xa96ca8,_0x28c01b,_0x4a5edd,_0x30b708,_0x5ae71a,_0x249e3a,_0x451625,_0x17050d){var _0x28a85f=0x0,_0x4e6854=_0x28c01b;return _0x28a85f+=(_0x4e6854=_0x4e6854+_0x30b708>>>0x0)<_0x28c01b?0x1:0x0,_0x28a85f+=(_0x4e6854=_0x4e6854+_0x249e3a>>>0x0)<_0x249e3a?0x1:0x0,_0xa96ca8+_0x4a5edd+_0x5ae71a+_0x451625+(_0x28a85f+=(_0x4e6854=_0x4e6854+_0x17050d>>>0x0)<_0x17050d?0x1:0x0)>>>0x0;}function _0x17f62b(_0x4474b2,_0x2c3690,_0xeecb20,_0x561f11,_0x2fe1d7,_0x433347,_0x252a01,_0x3ef162){return _0x2c3690+_0x561f11+_0x433347+_0x3ef162>>>0x0;}function _0x3bca35(_0x3b0933,_0x30a4b4,_0x2a34b3,_0x5aaa41,_0x7005d7,_0x4a50df,_0x5ca11a,_0x1eb63b,_0x6e6621,_0x480eb8){var _0x40ea28=0x0,_0xe8c08=_0x30a4b4;return _0x40ea28+=(_0xe8c08=_0xe8c08+_0x5aaa41>>>0x0)<_0x30a4b4?0x1:0x0,_0x40ea28+=(_0xe8c08=_0xe8c08+_0x4a50df>>>0x0)<_0x4a50df?0x1:0x0,_0x40ea28+=(_0xe8c08=_0xe8c08+_0x1eb63b>>>0x0)<_0x1eb63b?0x1:0x0,_0x3b0933+_0x2a34b3+_0x7005d7+_0x5ca11a+_0x6e6621+(_0x40ea28+=(_0xe8c08=_0xe8c08+_0x480eb8>>>0x0)<_0x480eb8?0x1:0x0)>>>0x0;}function _0x55a578(_0x4b363e,_0x4afed8,_0x291ff2,_0x408b46,_0x56f68f,_0x2a34f1,_0x44f6ce,_0x204d93,_0x2e99c4,_0x129561){return _0x4afed8+_0x408b46+_0x2a34f1+_0x204d93+_0x129561>>>0x0;}function _0x1cd57f(_0x495bb7,_0xcddc2c,_0x376a3c){return(_0xcddc2c<<0x20-_0x376a3c|_0x495bb7>>>_0x376a3c)>>>0x0;}function _0x421915(_0x1b1ade,_0x1377e1,_0x36c565){return(_0x1b1ade<<0x20-_0x36c565|_0x1377e1>>>_0x36c565)>>>0x0;}function _0x5d83b2(_0x1f2d16,_0x3e7ee8,_0x592684){return _0x1f2d16>>>_0x592684;}function _0x26cd20(_0x17120b,_0x2f48b7,_0x3a704e){return(_0x17120b<<0x20-_0x3a704e|_0x2f48b7>>>_0x3a704e)>>>0x0;}_0x4c188e[_0x4ffc81(0x2db)]=function(_0x44948f,_0x4742d6,_0x153dd7){var _0x20e47d=_0x4ffc81;if(_0x44948f!=_0x4742d6)throw new Error(_0x153dd7||_0x20e47d(0x27f)+_0x44948f+_0x20e47d(0x336)+_0x4742d6);};var _0x37ee9a={'inherits':_0x4ffc81(0x26a)==typeof Object[_0x4ffc81(0x31d)]?function(_0xc38e0f,_0x33c4f9){var _0x38d5ef=_0x4ffc81;_0xc38e0f['super_']=_0x33c4f9,_0xc38e0f[_0x38d5ef(0x2b7)]=Object[_0x38d5ef(0x31d)](_0x33c4f9['prototype'],{'constructor':{'value':_0xc38e0f,'enumerable':!0x1,'writable':!0x0,'configurable':!0x0}});}:function(_0x19a680,_0x1491c5){var _0x3ad1f8=_0x4ffc81;_0x19a680[_0x3ad1f8(0x27e)]=_0x1491c5;var _0x43fa27=function(){};_0x43fa27[_0x3ad1f8(0x2b7)]=_0x1491c5[_0x3ad1f8(0x2b7)],_0x19a680[_0x3ad1f8(0x2b7)]=new _0x43fa27(),_0x19a680[_0x3ad1f8(0x2b7)][_0x3ad1f8(0x321)]=_0x19a680;},'toArray':_0x2ce10a,'toHex':_0x3ea507,'htonl':_0x30e4ae,'toHex32':_0x5f3200,'zero2':_0x88cbfc,'zero8':_0x5e5af9,'join32':_0x42cc2c,'split32':_0x5ca61c,'rotr32':_0x2c7294,'rotl32':_0x4511ad,'sum32':_0x5b9775,'sum32_3':_0xf8c67d,'sum32_4':_0x16b5ec,'sum32_5':_0x8cae0e,'sum64':_0x3b5850,'sum64_hi':_0x5f410c,'sum64_lo':_0x4bfa87,'sum64_4_hi':_0x14323e,'sum64_4_lo':_0x17f62b,'sum64_5_hi':_0x3bca35,'sum64_5_lo':_0x55a578,'rotr64_hi':_0x1cd57f,'rotr64_lo':_0x421915,'shr64_hi':_0x5d83b2,'shr64_lo':_0x26cd20};function _0x4f71e6(){var _0x50cea2=_0x4ffc81;this['pending']=null,this[_0x50cea2(0x388)]=0x0,this[_0x50cea2(0x265)]=this['constructor'][_0x50cea2(0x265)],this['outSize']=this[_0x50cea2(0x321)]['outSize'],this[_0x50cea2(0x353)]=this[_0x50cea2(0x321)][_0x50cea2(0x353)],this[_0x50cea2(0x396)]=this[_0x50cea2(0x321)][_0x50cea2(0x396)]/0x8,this[_0x50cea2(0x29c)]=_0x50cea2(0x39c),this[_0x50cea2(0x22f)]=this[_0x50cea2(0x265)]/0x8,this[_0x50cea2(0x231)]=this[_0x50cea2(0x265)]/0x20;}var _0x249b7c=_0x4f71e6;_0x4f71e6[_0x4ffc81(0x2b7)]['update']=function(_0x308feb,_0x45c405){var _0x34690f=_0x4ffc81;if(_0x308feb=_0x37ee9a[_0x34690f(0x1f5)](_0x308feb,_0x45c405),this[_0x34690f(0x2fe)]?this['pending']=this[_0x34690f(0x2fe)]['concat'](_0x308feb):this[_0x34690f(0x2fe)]=_0x308feb,this[_0x34690f(0x388)]+=_0x308feb[_0x34690f(0x317)],this[_0x34690f(0x2fe)][_0x34690f(0x317)]>=this[_0x34690f(0x22f)]){var _0x56e29f=(_0x308feb=this[_0x34690f(0x2fe)])[_0x34690f(0x317)]%this[_0x34690f(0x22f)];this['pending']=_0x308feb['slice'](_0x308feb[_0x34690f(0x317)]-_0x56e29f,_0x308feb[_0x34690f(0x317)]),0x0===this[_0x34690f(0x2fe)]['length']&&(this[_0x34690f(0x2fe)]=null),_0x308feb=_0x37ee9a[_0x34690f(0x2ee)](_0x308feb,0x0,_0x308feb[_0x34690f(0x317)]-_0x56e29f,this[_0x34690f(0x29c)]);for(var _0x5dae2e=0x0;_0x5dae2e<_0x308feb['length'];_0x5dae2e+=this[_0x34690f(0x231)])this[_0x34690f(0x262)](_0x308feb,_0x5dae2e,_0x5dae2e+this[_0x34690f(0x231)]);}return this;},_0x4f71e6['prototype']['digest']=function(_0x4bb24a){var _0x4bfac3=_0x4ffc81;return this['update'](this[_0x4bfac3(0x21a)]()),_0x33de4d(null===this[_0x4bfac3(0x2fe)]),this['_digest'](_0x4bb24a);},_0x4f71e6['prototype'][_0x4ffc81(0x21a)]=function(){var _0xddb4a5=_0x4ffc81,_0x280518=this[_0xddb4a5(0x388)],_0x2fc04e=this['_delta8'],_0x3c9274=_0x2fc04e-(_0x280518+this['padLength'])%_0x2fc04e,_0x2155e9=new Array(_0x3c9274+this['padLength']);_0x2155e9[0x0]=0x80;for(var _0x1e504c=0x1;_0x1e504c<_0x3c9274;_0x1e504c++)_0x2155e9[_0x1e504c]=0x0;if(_0x280518<<=0x3,_0xddb4a5(0x39c)===this[_0xddb4a5(0x29c)]){for(var _0x149d2c=0x8;_0x149d2c<this[_0xddb4a5(0x396)];_0x149d2c++)_0x2155e9[_0x1e504c++]=0x0;_0x2155e9[_0x1e504c++]=0x0,_0x2155e9[_0x1e504c++]=0x0,_0x2155e9[_0x1e504c++]=0x0,_0x2155e9[_0x1e504c++]=0x0,_0x2155e9[_0x1e504c++]=_0x280518>>>0x18&0xff,_0x2155e9[_0x1e504c++]=_0x280518>>>0x10&0xff,_0x2155e9[_0x1e504c++]=_0x280518>>>0x8&0xff,_0x2155e9[_0x1e504c++]=0xff&_0x280518;}else{for(_0x2155e9[_0x1e504c++]=0xff&_0x280518,_0x2155e9[_0x1e504c++]=_0x280518>>>0x8&0xff,_0x2155e9[_0x1e504c++]=_0x280518>>>0x10&0xff,_0x2155e9[_0x1e504c++]=_0x280518>>>0x18&0xff,_0x2155e9[_0x1e504c++]=0x0,_0x2155e9[_0x1e504c++]=0x0,_0x2155e9[_0x1e504c++]=0x0,_0x2155e9[_0x1e504c++]=0x0,_0x149d2c=0x8;_0x149d2c<this[_0xddb4a5(0x396)];_0x149d2c++)_0x2155e9[_0x1e504c++]=0x0;}return _0x2155e9;};var _0x368924={'BlockHash':_0x249b7c},_0xe59030=_0x37ee9a['rotr32'];function _0x6d715e(_0x26ad43,_0x1c132b,_0x3c15dc,_0x3d5e4c){return 0x0===_0x26ad43?_0x305af3(_0x1c132b,_0x3c15dc,_0x3d5e4c):0x1===_0x26ad43||0x3===_0x26ad43?_0x55fef4(_0x1c132b,_0x3c15dc,_0x3d5e4c):0x2===_0x26ad43?_0x51f34d(_0x1c132b,_0x3c15dc,_0x3d5e4c):void 0x0;}function _0x305af3(_0xebde57,_0x6e6222,_0x59c84e){return _0xebde57&_0x6e6222^~_0xebde57&_0x59c84e;}function _0x51f34d(_0x3e11a8,_0x5854b1,_0x39b502){return _0x3e11a8&_0x5854b1^_0x3e11a8&_0x39b502^_0x5854b1&_0x39b502;}function _0x55fef4(_0xa2ce2c,_0x4bd914,_0x27f32d){return _0xa2ce2c^_0x4bd914^_0x27f32d;}function _0x72c192(_0x347104){return _0xe59030(_0x347104,0x2)^_0xe59030(_0x347104,0xd)^_0xe59030(_0x347104,0x16);}function _0x11a1a0(_0x591392){return _0xe59030(_0x591392,0x6)^_0xe59030(_0x591392,0xb)^_0xe59030(_0x591392,0x19);}function _0x2ea439(_0x5c7cf6){return _0xe59030(_0x5c7cf6,0x7)^_0xe59030(_0x5c7cf6,0x12)^_0x5c7cf6>>>0x3;}function _0x405831(_0x4d1d33){return _0xe59030(_0x4d1d33,0x11)^_0xe59030(_0x4d1d33,0x13)^_0x4d1d33>>>0xa;}var _0x3a4d22={'ft_1':_0x6d715e,'ch32':_0x305af3,'maj32':_0x51f34d,'p32':_0x55fef4,'s0_256':_0x72c192,'s1_256':_0x11a1a0,'g0_256':_0x2ea439,'g1_256':_0x405831},_0x1085be=_0x37ee9a[_0x4ffc81(0x3b8)],_0x556184=_0x37ee9a[_0x4ffc81(0x29b)],_0x3a44be=_0x37ee9a[_0x4ffc81(0x26d)],_0x211480=_0x3a4d22[_0x4ffc81(0x3b2)],_0x1dca74=_0x368924['BlockHash'],_0x59dd54=[0x5a827999,0x6ed9eba1,0x8f1bbcdc,0xca62c1d6];function _0x1d669a(){if(!(this instanceof _0x1d669a))return new _0x1d669a();_0x1dca74['call'](this),this['h']=[0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0],this['W']=new Array(0x50);}_0x37ee9a[_0x4ffc81(0x2c6)](_0x1d669a,_0x1dca74);var _0x254921=_0x1d669a;_0x1d669a[_0x4ffc81(0x265)]=0x200,_0x1d669a[_0x4ffc81(0x228)]=0xa0,_0x1d669a[_0x4ffc81(0x353)]=0x50,_0x1d669a[_0x4ffc81(0x396)]=0x40,_0x1d669a[_0x4ffc81(0x2b7)]['_update']=function(_0x164176,_0x23bb40){var _0x33fc1a=_0x4ffc81;for(var _0x1a827c=this['W'],_0x44f833=0x0;_0x44f833<0x10;_0x44f833++)_0x1a827c[_0x44f833]=_0x164176[_0x23bb40+_0x44f833];for(;_0x44f833<_0x1a827c[_0x33fc1a(0x317)];_0x44f833++)_0x1a827c[_0x44f833]=_0x1085be(_0x1a827c[_0x44f833-0x3]^_0x1a827c[_0x44f833-0x8]^_0x1a827c[_0x44f833-0xe]^_0x1a827c[_0x44f833-0x10],0x1);var _0x501df5=this['h'][0x0],_0x228e74=this['h'][0x1],_0x400901=this['h'][0x2],_0x495e05=this['h'][0x3],_0x282f70=this['h'][0x4];for(_0x44f833=0x0;_0x44f833<_0x1a827c[_0x33fc1a(0x317)];_0x44f833++){var _0x33f265=~~(_0x44f833/0x14),_0x53e26d=_0x3a44be(_0x1085be(_0x501df5,0x5),_0x211480(_0x33f265,_0x228e74,_0x400901,_0x495e05),_0x282f70,_0x1a827c[_0x44f833],_0x59dd54[_0x33f265]);_0x282f70=_0x495e05,_0x495e05=_0x400901,_0x400901=_0x1085be(_0x228e74,0x1e),_0x228e74=_0x501df5,_0x501df5=_0x53e26d;}this['h'][0x0]=_0x556184(this['h'][0x0],_0x501df5),this['h'][0x1]=_0x556184(this['h'][0x1],_0x228e74),this['h'][0x2]=_0x556184(this['h'][0x2],_0x400901),this['h'][0x3]=_0x556184(this['h'][0x3],_0x495e05),this['h'][0x4]=_0x556184(this['h'][0x4],_0x282f70);},_0x1d669a[_0x4ffc81(0x2b7)][_0x4ffc81(0x34a)]=function(_0x58b3b1){var _0x4bff8=_0x4ffc81;return'hex'===_0x58b3b1?_0x37ee9a[_0x4bff8(0x286)](this['h'],_0x4bff8(0x39c)):_0x37ee9a[_0x4bff8(0x355)](this['h'],_0x4bff8(0x39c));};var _0x3750fd=_0x37ee9a['sum32'],_0x574c96=_0x37ee9a['sum32_4'],_0x3da467=_0x37ee9a[_0x4ffc81(0x26d)],_0x99812d=_0x3a4d22[_0x4ffc81(0x241)],_0xd01a4c=_0x3a4d22[_0x4ffc81(0x273)],_0x467c62=_0x3a4d22[_0x4ffc81(0x2dd)],_0x517221=_0x3a4d22['s1_256'],_0x5bef37=_0x3a4d22['g0_256'],_0xf00612=_0x3a4d22[_0x4ffc81(0x301)],_0x38b11d=_0x368924[_0x4ffc81(0x38b)],_0x3da1da=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0xfc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x6ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];function _0x5e33a7(){if(!(this instanceof _0x5e33a7))return new _0x5e33a7();_0x38b11d['call'](this),this['h']=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],this['k']=_0x3da1da,this['W']=new Array(0x40);}_0x37ee9a[_0x4ffc81(0x2c6)](_0x5e33a7,_0x38b11d);var _0x45a9fc=_0x5e33a7;function _0x492e74(){var _0x10ddaf=_0x4ffc81;if(!(this instanceof _0x492e74))return new _0x492e74();_0x45a9fc[_0x10ddaf(0x2e8)](this),this['h']=[0xc1059ed8,0x367cd507,0x3070dd17,0xf70e5939,0xffc00b31,0x68581511,0x64f98fa7,0xbefa4fa4];}_0x5e33a7['blockSize']=0x200,_0x5e33a7[_0x4ffc81(0x228)]=0x100,_0x5e33a7[_0x4ffc81(0x353)]=0xc0,_0x5e33a7[_0x4ffc81(0x396)]=0x40,_0x5e33a7[_0x4ffc81(0x2b7)]['_update']=function(_0x410d74,_0x266b93){var _0x1dab41=_0x4ffc81;for(var _0x4caf8a=this['W'],_0xf565df=0x0;_0xf565df<0x10;_0xf565df++)_0x4caf8a[_0xf565df]=_0x410d74[_0x266b93+_0xf565df];for(;_0xf565df<_0x4caf8a[_0x1dab41(0x317)];_0xf565df++)_0x4caf8a[_0xf565df]=_0x574c96(_0xf00612(_0x4caf8a[_0xf565df-0x2]),_0x4caf8a[_0xf565df-0x7],_0x5bef37(_0x4caf8a[_0xf565df-0xf]),_0x4caf8a[_0xf565df-0x10]);var _0x4ae233=this['h'][0x0],_0x5fb8a=this['h'][0x1],_0x47fd5c=this['h'][0x2],_0xfffd25=this['h'][0x3],_0x2114c0=this['h'][0x4],_0x8b5573=this['h'][0x5],_0x4d9908=this['h'][0x6],_0x1c5c7d=this['h'][0x7];for(_0x33de4d(this['k']['length']===_0x4caf8a[_0x1dab41(0x317)]),_0xf565df=0x0;_0xf565df<_0x4caf8a[_0x1dab41(0x317)];_0xf565df++){var _0x4fd175=_0x3da467(_0x1c5c7d,_0x517221(_0x2114c0),_0x99812d(_0x2114c0,_0x8b5573,_0x4d9908),this['k'][_0xf565df],_0x4caf8a[_0xf565df]),_0x2ea34f=_0x3750fd(_0x467c62(_0x4ae233),_0xd01a4c(_0x4ae233,_0x5fb8a,_0x47fd5c));_0x1c5c7d=_0x4d9908,_0x4d9908=_0x8b5573,_0x8b5573=_0x2114c0,_0x2114c0=_0x3750fd(_0xfffd25,_0x4fd175),_0xfffd25=_0x47fd5c,_0x47fd5c=_0x5fb8a,_0x5fb8a=_0x4ae233,_0x4ae233=_0x3750fd(_0x4fd175,_0x2ea34f);}this['h'][0x0]=_0x3750fd(this['h'][0x0],_0x4ae233),this['h'][0x1]=_0x3750fd(this['h'][0x1],_0x5fb8a),this['h'][0x2]=_0x3750fd(this['h'][0x2],_0x47fd5c),this['h'][0x3]=_0x3750fd(this['h'][0x3],_0xfffd25),this['h'][0x4]=_0x3750fd(this['h'][0x4],_0x2114c0),this['h'][0x5]=_0x3750fd(this['h'][0x5],_0x8b5573),this['h'][0x6]=_0x3750fd(this['h'][0x6],_0x4d9908),this['h'][0x7]=_0x3750fd(this['h'][0x7],_0x1c5c7d);},_0x5e33a7[_0x4ffc81(0x2b7)]['_digest']=function(_0x1c3c6b){var _0x481cdb=_0x4ffc81;return _0x481cdb(0x1f6)===_0x1c3c6b?_0x37ee9a['toHex32'](this['h'],_0x481cdb(0x39c)):_0x37ee9a[_0x481cdb(0x355)](this['h'],_0x481cdb(0x39c));},_0x37ee9a['inherits'](_0x492e74,_0x45a9fc);var _0x39cf72=_0x492e74;_0x492e74[_0x4ffc81(0x265)]=0x200,_0x492e74[_0x4ffc81(0x228)]=0xe0,_0x492e74[_0x4ffc81(0x353)]=0xc0,_0x492e74[_0x4ffc81(0x396)]=0x40,_0x492e74['prototype'][_0x4ffc81(0x34a)]=function(_0x1a18f8){var _0x294f19=_0x4ffc81;return'hex'===_0x1a18f8?_0x37ee9a['toHex32'](this['h'][_0x294f19(0x2a1)](0x0,0x7),_0x294f19(0x39c)):_0x37ee9a[_0x294f19(0x355)](this['h'][_0x294f19(0x2a1)](0x0,0x7),_0x294f19(0x39c));};var _0x5f45f1=_0x37ee9a['rotr64_hi'],_0x43df38=_0x37ee9a[_0x4ffc81(0x342)],_0x184b3e=_0x37ee9a[_0x4ffc81(0x30b)],_0x15c163=_0x37ee9a[_0x4ffc81(0x26b)],_0x1446b9=_0x37ee9a[_0x4ffc81(0x3ad)],_0x4e29fb=_0x37ee9a['sum64_hi'],_0x199966=_0x37ee9a[_0x4ffc81(0x352)],_0x1f8cd6=_0x37ee9a[_0x4ffc81(0x39f)],_0x2bf93d=_0x37ee9a['sum64_4_lo'],_0x40caad=_0x37ee9a[_0x4ffc81(0x298)],_0x509a14=_0x37ee9a[_0x4ffc81(0x361)],_0x4830d1=_0x368924[_0x4ffc81(0x38b)],_0x154bc5=[0x428a2f98,0xd728ae22,0x71374491,0x23ef65cd,0xb5c0fbcf,0xec4d3b2f,0xe9b5dba5,0x8189dbbc,0x3956c25b,0xf348b538,0x59f111f1,0xb605d019,0x923f82a4,0xaf194f9b,0xab1c5ed5,0xda6d8118,0xd807aa98,0xa3030242,0x12835b01,0x45706fbe,0x243185be,0x4ee4b28c,0x550c7dc3,0xd5ffb4e2,0x72be5d74,0xf27b896f,0x80deb1fe,0x3b1696b1,0x9bdc06a7,0x25c71235,0xc19bf174,0xcf692694,0xe49b69c1,0x9ef14ad2,0xefbe4786,0x384f25e3,0xfc19dc6,0x8b8cd5b5,0x240ca1cc,0x77ac9c65,0x2de92c6f,0x592b0275,0x4a7484aa,0x6ea6e483,0x5cb0a9dc,0xbd41fbd4,0x76f988da,0x831153b5,0x983e5152,0xee66dfab,0xa831c66d,0x2db43210,0xb00327c8,0x98fb213f,0xbf597fc7,0xbeef0ee4,0xc6e00bf3,0x3da88fc2,0xd5a79147,0x930aa725,0x6ca6351,0xe003826f,0x14292967,0xa0e6e70,0x27b70a85,0x46d22ffc,0x2e1b2138,0x5c26c926,0x4d2c6dfc,0x5ac42aed,0x53380d13,0x9d95b3df,0x650a7354,0x8baf63de,0x766a0abb,0x3c77b2a8,0x81c2c92e,0x47edaee6,0x92722c85,0x1482353b,0xa2bfe8a1,0x4cf10364,0xa81a664b,0xbc423001,0xc24b8b70,0xd0f89791,0xc76c51a3,0x654be30,0xd192e819,0xd6ef5218,0xd6990624,0x5565a910,0xf40e3585,0x5771202a,0x106aa070,0x32bbd1b8,0x19a4c116,0xb8d2d0c8,0x1e376c08,0x5141ab53,0x2748774c,0xdf8eeb99,0x34b0bcb5,0xe19b48a8,0x391c0cb3,0xc5c95a63,0x4ed8aa4a,0xe3418acb,0x5b9cca4f,0x7763e373,0x682e6ff3,0xd6b2b8a3,0x748f82ee,0x5defb2fc,0x78a5636f,0x43172f60,0x84c87814,0xa1f0ab72,0x8cc70208,0x1a6439ec,0x90befffa,0x23631e28,0xa4506ceb,0xde82bde9,0xbef9a3f7,0xb2c67915,0xc67178f2,0xe372532b,0xca273ece,0xea26619c,0xd186b8c7,0x21c0c207,0xeada7dd6,0xcde0eb1e,0xf57d4f7f,0xee6ed178,0x6f067aa,0x72176fba,0xa637dc5,0xa2c898a6,0x113f9804,0xbef90dae,0x1b710b35,0x131c471b,0x28db77f5,0x23047d84,0x32caab7b,0x40c72493,0x3c9ebe0a,0x15c9bebc,0x431d67c4,0x9c100d4c,0x4cc5d4be,0xcb3e42b6,0x597f299c,0xfc657e2a,0x5fcb6fab,0x3ad6faec,0x6c44198c,0x4a475817];function _0x5705f9(){var _0x3d0d36=_0x4ffc81;if(!(this instanceof _0x5705f9))return new _0x5705f9();_0x4830d1[_0x3d0d36(0x2e8)](this),this['h']=[0x6a09e667,0xf3bcc908,0xbb67ae85,0x84caa73b,0x3c6ef372,0xfe94f82b,0xa54ff53a,0x5f1d36f1,0x510e527f,0xade682d1,0x9b05688c,0x2b3e6c1f,0x1f83d9ab,0xfb41bd6b,0x5be0cd19,0x137e2179],this['k']=_0x154bc5,this['W']=new Array(0xa0);}_0x37ee9a[_0x4ffc81(0x2c6)](_0x5705f9,_0x4830d1);var _0x4b5fe8=_0x5705f9;function _0x532295(_0x16e57d,_0x387472,_0x59711c,_0xc84594,_0x1156e5){var _0x7010fb=_0x16e57d&_0x59711c^~_0x16e57d&_0x1156e5;return _0x7010fb<0x0&&(_0x7010fb+=0x100000000),_0x7010fb;}function _0x3e2a99(_0x13229e,_0xd55dde,_0x1c8f7d,_0x5be7c7,_0x52bfe9,_0x2353b2){var _0x2b7606=_0xd55dde&_0x5be7c7^~_0xd55dde&_0x2353b2;return _0x2b7606<0x0&&(_0x2b7606+=0x100000000),_0x2b7606;}function _0x13b1e9(_0x27b3cb,_0x4f8052,_0x3c3ca4,_0xa4080c,_0x49216a){var _0x486ca9=_0x27b3cb&_0x3c3ca4^_0x27b3cb&_0x49216a^_0x3c3ca4&_0x49216a;return _0x486ca9<0x0&&(_0x486ca9+=0x100000000),_0x486ca9;}function _0x9b8567(_0x1ca50f,_0x418759,_0x1291e8,_0xc61d72,_0x1c7f43,_0x146bfa){var _0x441bbd=_0x418759&_0xc61d72^_0x418759&_0x146bfa^_0xc61d72&_0x146bfa;return _0x441bbd<0x0&&(_0x441bbd+=0x100000000),_0x441bbd;}function _0x21252b(_0xf6cdd0,_0x3a64f7){var _0x543a7a=_0x5f45f1(_0xf6cdd0,_0x3a64f7,0x1c)^_0x5f45f1(_0x3a64f7,_0xf6cdd0,0x2)^_0x5f45f1(_0x3a64f7,_0xf6cdd0,0x7);return _0x543a7a<0x0&&(_0x543a7a+=0x100000000),_0x543a7a;}function _0xfbb9b9(_0xbc19d9,_0x5542f4){var _0x15b489=_0x43df38(_0xbc19d9,_0x5542f4,0x1c)^_0x43df38(_0x5542f4,_0xbc19d9,0x2)^_0x43df38(_0x5542f4,_0xbc19d9,0x7);return _0x15b489<0x0&&(_0x15b489+=0x100000000),_0x15b489;}function _0x4efb60(_0x5de5be,_0x7d2460){var _0x52123f=_0x5f45f1(_0x5de5be,_0x7d2460,0xe)^_0x5f45f1(_0x5de5be,_0x7d2460,0x12)^_0x5f45f1(_0x7d2460,_0x5de5be,0x9);return _0x52123f<0x0&&(_0x52123f+=0x100000000),_0x52123f;}function _0x4ee0db(_0x3d9676,_0xa0ae28){var _0x31cc6=_0x43df38(_0x3d9676,_0xa0ae28,0xe)^_0x43df38(_0x3d9676,_0xa0ae28,0x12)^_0x43df38(_0xa0ae28,_0x3d9676,0x9);return _0x31cc6<0x0&&(_0x31cc6+=0x100000000),_0x31cc6;}function _0x3fc40e(_0x513311,_0x27c7ca){var _0x32d148=_0x5f45f1(_0x513311,_0x27c7ca,0x1)^_0x5f45f1(_0x513311,_0x27c7ca,0x8)^_0x184b3e(_0x513311,_0x27c7ca,0x7);return _0x32d148<0x0&&(_0x32d148+=0x100000000),_0x32d148;}function _0x3fbddb(_0x38c4d5,_0x3a8718){var _0x59c7e9=_0x43df38(_0x38c4d5,_0x3a8718,0x1)^_0x43df38(_0x38c4d5,_0x3a8718,0x8)^_0x15c163(_0x38c4d5,_0x3a8718,0x7);return _0x59c7e9<0x0&&(_0x59c7e9+=0x100000000),_0x59c7e9;}function _0x3f7953(_0x1be6fd,_0x1bc6ce){var _0x4d56d2=_0x5f45f1(_0x1be6fd,_0x1bc6ce,0x13)^_0x5f45f1(_0x1bc6ce,_0x1be6fd,0x1d)^_0x184b3e(_0x1be6fd,_0x1bc6ce,0x6);return _0x4d56d2<0x0&&(_0x4d56d2+=0x100000000),_0x4d56d2;}function _0x58a292(_0xd4a740,_0x2956fd){var _0x4bf05e=_0x43df38(_0xd4a740,_0x2956fd,0x13)^_0x43df38(_0x2956fd,_0xd4a740,0x1d)^_0x15c163(_0xd4a740,_0x2956fd,0x6);return _0x4bf05e<0x0&&(_0x4bf05e+=0x100000000),_0x4bf05e;}function _0x56f0f7(){var _0x1289a8=_0x4ffc81;if(!(this instanceof _0x56f0f7))return new _0x56f0f7();_0x4b5fe8[_0x1289a8(0x2e8)](this),this['h']=[0xcbbb9d5d,0xc1059ed8,0x629a292a,0x367cd507,0x9159015a,0x3070dd17,0x152fecd8,0xf70e5939,0x67332667,0xffc00b31,0x8eb44a87,0x68581511,0xdb0c2e0d,0x64f98fa7,0x47b5481d,0xbefa4fa4];}_0x5705f9[_0x4ffc81(0x265)]=0x400,_0x5705f9['outSize']=0x200,_0x5705f9[_0x4ffc81(0x353)]=0xc0,_0x5705f9['padLength']=0x80,_0x5705f9[_0x4ffc81(0x2b7)]['_prepareBlock']=function(_0xba1a62,_0x2a56aa){var _0x598372=_0x4ffc81;for(var _0x33a5ad=this['W'],_0x34762b=0x0;_0x34762b<0x20;_0x34762b++)_0x33a5ad[_0x34762b]=_0xba1a62[_0x2a56aa+_0x34762b];for(;_0x34762b<_0x33a5ad[_0x598372(0x317)];_0x34762b+=0x2){var _0x1735a2=_0x3f7953(_0x33a5ad[_0x34762b-0x4],_0x33a5ad[_0x34762b-0x3]),_0x9881a=_0x58a292(_0x33a5ad[_0x34762b-0x4],_0x33a5ad[_0x34762b-0x3]),_0x5da094=_0x33a5ad[_0x34762b-0xe],_0x5d027c=_0x33a5ad[_0x34762b-0xd],_0x3bb6b2=_0x3fc40e(_0x33a5ad[_0x34762b-0x1e],_0x33a5ad[_0x34762b-0x1d]),_0x3c9b53=_0x3fbddb(_0x33a5ad[_0x34762b-0x1e],_0x33a5ad[_0x34762b-0x1d]),_0x2ed622=_0x33a5ad[_0x34762b-0x20],_0x1fc3dd=_0x33a5ad[_0x34762b-0x1f];_0x33a5ad[_0x34762b]=_0x1f8cd6(_0x1735a2,_0x9881a,_0x5da094,_0x5d027c,_0x3bb6b2,_0x3c9b53,_0x2ed622,_0x1fc3dd),_0x33a5ad[_0x34762b+0x1]=_0x2bf93d(_0x1735a2,_0x9881a,_0x5da094,_0x5d027c,_0x3bb6b2,_0x3c9b53,_0x2ed622,_0x1fc3dd);}},_0x5705f9[_0x4ffc81(0x2b7)][_0x4ffc81(0x262)]=function(_0x9a17cf,_0xeae2ea){var _0x1636fc=_0x4ffc81;this[_0x1636fc(0x316)](_0x9a17cf,_0xeae2ea);var _0x624fa0=this['W'],_0x39a708=this['h'][0x0],_0x3a7ae6=this['h'][0x1],_0x4fe7fd=this['h'][0x2],_0x4cf3ed=this['h'][0x3],_0x1a3c18=this['h'][0x4],_0x12772f=this['h'][0x5],_0x3e842c=this['h'][0x6],_0x571566=this['h'][0x7],_0x1429b9=this['h'][0x8],_0x3385d3=this['h'][0x9],_0x262c09=this['h'][0xa],_0x3802c7=this['h'][0xb],_0x23a422=this['h'][0xc],_0x58f53c=this['h'][0xd],_0x4e675c=this['h'][0xe],_0x4556cd=this['h'][0xf];_0x33de4d(this['k'][_0x1636fc(0x317)]===_0x624fa0[_0x1636fc(0x317)]);for(var _0x109bf6=0x0;_0x109bf6<_0x624fa0[_0x1636fc(0x317)];_0x109bf6+=0x2){var _0x2108dc=_0x4e675c,_0x6d5efd=_0x4556cd,_0x32e80c=_0x4efb60(_0x1429b9,_0x3385d3),_0x2bbbf9=_0x4ee0db(_0x1429b9,_0x3385d3),_0x695b78=_0x532295(_0x1429b9,_0x3385d3,_0x262c09,_0x3802c7,_0x23a422),_0x4b14ab=_0x3e2a99(_0x1429b9,_0x3385d3,_0x262c09,_0x3802c7,_0x23a422,_0x58f53c),_0x23352f=this['k'][_0x109bf6],_0x27d570=this['k'][_0x109bf6+0x1],_0x63ecf7=_0x624fa0[_0x109bf6],_0x40b549=_0x624fa0[_0x109bf6+0x1],_0x5cdc60=_0x40caad(_0x2108dc,_0x6d5efd,_0x32e80c,_0x2bbbf9,_0x695b78,_0x4b14ab,_0x23352f,_0x27d570,_0x63ecf7,_0x40b549),_0x5246f4=_0x509a14(_0x2108dc,_0x6d5efd,_0x32e80c,_0x2bbbf9,_0x695b78,_0x4b14ab,_0x23352f,_0x27d570,_0x63ecf7,_0x40b549);_0x2108dc=_0x21252b(_0x39a708,_0x3a7ae6),_0x6d5efd=_0xfbb9b9(_0x39a708,_0x3a7ae6),_0x32e80c=_0x13b1e9(_0x39a708,_0x3a7ae6,_0x4fe7fd,_0x4cf3ed,_0x1a3c18),_0x2bbbf9=_0x9b8567(_0x39a708,_0x3a7ae6,_0x4fe7fd,_0x4cf3ed,_0x1a3c18,_0x12772f);var _0x2f39f8=_0x4e29fb(_0x2108dc,_0x6d5efd,_0x32e80c,_0x2bbbf9),_0x48ee34=_0x199966(_0x2108dc,_0x6d5efd,_0x32e80c,_0x2bbbf9);_0x4e675c=_0x23a422,_0x4556cd=_0x58f53c,_0x23a422=_0x262c09,_0x58f53c=_0x3802c7,_0x262c09=_0x1429b9,_0x3802c7=_0x3385d3,_0x1429b9=_0x4e29fb(_0x3e842c,_0x571566,_0x5cdc60,_0x5246f4),_0x3385d3=_0x199966(_0x571566,_0x571566,_0x5cdc60,_0x5246f4),_0x3e842c=_0x1a3c18,_0x571566=_0x12772f,_0x1a3c18=_0x4fe7fd,_0x12772f=_0x4cf3ed,_0x4fe7fd=_0x39a708,_0x4cf3ed=_0x3a7ae6,_0x39a708=_0x4e29fb(_0x5cdc60,_0x5246f4,_0x2f39f8,_0x48ee34),_0x3a7ae6=_0x199966(_0x5cdc60,_0x5246f4,_0x2f39f8,_0x48ee34);}_0x1446b9(this['h'],0x0,_0x39a708,_0x3a7ae6),_0x1446b9(this['h'],0x2,_0x4fe7fd,_0x4cf3ed),_0x1446b9(this['h'],0x4,_0x1a3c18,_0x12772f),_0x1446b9(this['h'],0x6,_0x3e842c,_0x571566),_0x1446b9(this['h'],0x8,_0x1429b9,_0x3385d3),_0x1446b9(this['h'],0xa,_0x262c09,_0x3802c7),_0x1446b9(this['h'],0xc,_0x23a422,_0x58f53c),_0x1446b9(this['h'],0xe,_0x4e675c,_0x4556cd);},_0x5705f9[_0x4ffc81(0x2b7)][_0x4ffc81(0x34a)]=function(_0xc36405){var _0x5c7ae4=_0x4ffc81;return _0x5c7ae4(0x1f6)===_0xc36405?_0x37ee9a['toHex32'](this['h'],_0x5c7ae4(0x39c)):_0x37ee9a[_0x5c7ae4(0x355)](this['h'],'big');},_0x37ee9a[_0x4ffc81(0x2c6)](_0x56f0f7,_0x4b5fe8);var _0x164c32=_0x56f0f7;_0x56f0f7[_0x4ffc81(0x265)]=0x400,_0x56f0f7[_0x4ffc81(0x228)]=0x180,_0x56f0f7['hmacStrength']=0xc0,_0x56f0f7[_0x4ffc81(0x396)]=0x80,_0x56f0f7[_0x4ffc81(0x2b7)][_0x4ffc81(0x34a)]=function(_0x157085){var _0x5f8a38=_0x4ffc81;return _0x5f8a38(0x1f6)===_0x157085?_0x37ee9a[_0x5f8a38(0x286)](this['h'][_0x5f8a38(0x2a1)](0x0,0xc),_0x5f8a38(0x39c)):_0x37ee9a['split32'](this['h'][_0x5f8a38(0x2a1)](0x0,0xc),_0x5f8a38(0x39c));};var _0x38cc6e={'sha1':_0x254921,'sha224':_0x39cf72,'sha256':_0x45a9fc,'sha384':_0x164c32,'sha512':_0x4b5fe8},_0x2e8dff=_0x37ee9a['rotl32'],_0x17d35c=_0x37ee9a['sum32'],_0x18f82f=_0x37ee9a[_0x4ffc81(0x373)],_0x10ead0=_0x37ee9a[_0x4ffc81(0x2d7)],_0x3d6122=_0x368924['BlockHash'];function _0x23a86c(){var _0x22318a=_0x4ffc81;if(!(this instanceof _0x23a86c))return new _0x23a86c();_0x3d6122[_0x22318a(0x2e8)](this),this['h']=[0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0],this[_0x22318a(0x29c)]=_0x22318a(0x1f3);}_0x37ee9a['inherits'](_0x23a86c,_0x3d6122);var _0x28d222=_0x23a86c;function _0x242b2c(_0xac4a9c,_0x21e596,_0x5c642a,_0x1b664a){return _0xac4a9c<=0xf?_0x21e596^_0x5c642a^_0x1b664a:_0xac4a9c<=0x1f?_0x21e596&_0x5c642a|~_0x21e596&_0x1b664a:_0xac4a9c<=0x2f?(_0x21e596|~_0x5c642a)^_0x1b664a:_0xac4a9c<=0x3f?_0x21e596&_0x1b664a|_0x5c642a&~_0x1b664a:_0x21e596^(_0x5c642a|~_0x1b664a);}function _0x16705f(_0x5f1a9c){return _0x5f1a9c<=0xf?0x0:_0x5f1a9c<=0x1f?0x5a827999:_0x5f1a9c<=0x2f?0x6ed9eba1:_0x5f1a9c<=0x3f?0x8f1bbcdc:0xa953fd4e;}function _0x25dcaa(_0x269497){return _0x269497<=0xf?0x50a28be6:_0x269497<=0x1f?0x5c4dd124:_0x269497<=0x2f?0x6d703ef3:_0x269497<=0x3f?0x7a6d76e9:0x0;}_0x23a86c[_0x4ffc81(0x265)]=0x200,_0x23a86c[_0x4ffc81(0x228)]=0xa0,_0x23a86c[_0x4ffc81(0x353)]=0xc0,_0x23a86c[_0x4ffc81(0x396)]=0x40,_0x23a86c[_0x4ffc81(0x2b7)][_0x4ffc81(0x262)]=function(_0x1f955e,_0xa0640b){for(var _0x3e0b71=this['h'][0x0],_0x344023=this['h'][0x1],_0x4f8739=this['h'][0x2],_0x3f9d17=this['h'][0x3],_0x2b814b=this['h'][0x4],_0x58b078=_0x3e0b71,_0x270355=_0x344023,_0x5bfa56=_0x4f8739,_0x584f49=_0x3f9d17,_0x5c9885=_0x2b814b,_0x4a8fa5=0x0;_0x4a8fa5<0x50;_0x4a8fa5++){var _0x428163=_0x17d35c(_0x2e8dff(_0x10ead0(_0x3e0b71,_0x242b2c(_0x4a8fa5,_0x344023,_0x4f8739,_0x3f9d17),_0x1f955e[_0xf2e48d[_0x4a8fa5]+_0xa0640b],_0x16705f(_0x4a8fa5)),_0x6e809b[_0x4a8fa5]),_0x2b814b);_0x3e0b71=_0x2b814b,_0x2b814b=_0x3f9d17,_0x3f9d17=_0x2e8dff(_0x4f8739,0xa),_0x4f8739=_0x344023,_0x344023=_0x428163,_0x428163=_0x17d35c(_0x2e8dff(_0x10ead0(_0x58b078,_0x242b2c(0x4f-_0x4a8fa5,_0x270355,_0x5bfa56,_0x584f49),_0x1f955e[_0x349c69[_0x4a8fa5]+_0xa0640b],_0x25dcaa(_0x4a8fa5)),_0x244354[_0x4a8fa5]),_0x5c9885),_0x58b078=_0x5c9885,_0x5c9885=_0x584f49,_0x584f49=_0x2e8dff(_0x5bfa56,0xa),_0x5bfa56=_0x270355,_0x270355=_0x428163;}_0x428163=_0x18f82f(this['h'][0x1],_0x4f8739,_0x584f49),this['h'][0x1]=_0x18f82f(this['h'][0x2],_0x3f9d17,_0x5c9885),this['h'][0x2]=_0x18f82f(this['h'][0x3],_0x2b814b,_0x58b078),this['h'][0x3]=_0x18f82f(this['h'][0x4],_0x3e0b71,_0x270355),this['h'][0x4]=_0x18f82f(this['h'][0x0],_0x344023,_0x5bfa56),this['h'][0x0]=_0x428163;},_0x23a86c[_0x4ffc81(0x2b7)][_0x4ffc81(0x34a)]=function(_0x25834e){var _0x31fe1b=_0x4ffc81;return _0x31fe1b(0x1f6)===_0x25834e?_0x37ee9a['toHex32'](this['h'],_0x31fe1b(0x1f3)):_0x37ee9a[_0x31fe1b(0x355)](this['h'],'little');};var _0xf2e48d=[0x0,0x1,0x2,0x3,0x4,0x5,0x6,0x7,0x8,0x9,0xa,0xb,0xc,0xd,0xe,0xf,0x7,0x4,0xd,0x1,0xa,0x6,0xf,0x3,0xc,0x0,0x9,0x5,0x2,0xe,0xb,0x8,0x3,0xa,0xe,0x4,0x9,0xf,0x8,0x1,0x2,0x7,0x0,0x6,0xd,0xb,0x5,0xc,0x1,0x9,0xb,0xa,0x0,0x8,0xc,0x4,0xd,0x3,0x7,0xf,0xe,0x5,0x6,0x2,0x4,0x0,0x5,0x9,0x7,0xc,0x2,0xa,0xe,0x1,0x3,0x8,0xb,0x6,0xf,0xd],_0x349c69=[0x5,0xe,0x7,0x0,0x9,0x2,0xb,0x4,0xd,0x6,0xf,0x8,0x1,0xa,0x3,0xc,0x6,0xb,0x3,0x7,0x0,0xd,0x5,0xa,0xe,0xf,0x8,0xc,0x4,0x9,0x1,0x2,0xf,0x5,0x1,0x3,0x7,0xe,0x6,0x9,0xb,0x8,0xc,0x2,0xa,0x0,0x4,0xd,0x8,0x6,0x4,0x1,0x3,0xb,0xf,0x0,0x5,0xc,0x2,0xd,0x9,0x7,0xa,0xe,0xc,0xf,0xa,0x4,0x1,0x5,0x8,0x7,0x6,0x2,0xd,0xe,0x0,0x3,0x9,0xb],_0x6e809b=[0xb,0xe,0xf,0xc,0x5,0x8,0x7,0x9,0xb,0xd,0xe,0xf,0x6,0x7,0x9,0x8,0x7,0x6,0x8,0xd,0xb,0x9,0x7,0xf,0x7,0xc,0xf,0x9,0xb,0x7,0xd,0xc,0xb,0xd,0x6,0x7,0xe,0x9,0xd,0xf,0xe,0x8,0xd,0x6,0x5,0xc,0x7,0x5,0xb,0xc,0xe,0xf,0xe,0xf,0x9,0x8,0x9,0xe,0x5,0x6,0x8,0x6,0x5,0xc,0x9,0xf,0x5,0xb,0x6,0x8,0xd,0xc,0x5,0xc,0xd,0xe,0xb,0x8,0x5,0x6],_0x244354=[0x8,0x9,0x9,0xb,0xd,0xf,0xf,0x5,0x7,0x7,0x8,0xb,0xe,0xe,0xc,0x6,0x9,0xd,0xf,0x7,0xc,0x8,0x9,0xb,0x7,0x7,0xc,0x7,0x6,0xf,0xd,0xb,0x9,0x7,0xf,0xb,0x8,0x6,0x6,0xe,0xc,0xd,0x5,0xe,0xd,0xd,0x7,0x5,0xf,0x5,0x8,0xb,0xe,0xe,0x6,0xe,0x6,0x9,0xc,0x9,0xc,0x5,0xf,0x8,0x8,0x5,0xc,0x9,0xc,0x5,0xe,0x6,0x8,0xd,0x6,0x5,0xf,0xd,0xb,0xb],_0x1d7abb={'ripemd160':_0x28d222};function _0x1c1456(_0x3787be,_0x16fd82,_0x545a80){var _0x401742=_0x4ffc81;if(!(this instanceof _0x1c1456))return new _0x1c1456(_0x3787be,_0x16fd82,_0x545a80);this[_0x401742(0x204)]=_0x3787be,this[_0x401742(0x265)]=_0x3787be['blockSize']/0x8,this[_0x401742(0x228)]=_0x3787be['outSize']/0x8,this[_0x401742(0x2ea)]=null,this['outer']=null,this[_0x401742(0x250)](_0x37ee9a[_0x401742(0x1f5)](_0x16fd82,_0x545a80));}var _0x4cd590=_0x1c1456;_0x1c1456[_0x4ffc81(0x2b7)][_0x4ffc81(0x250)]=function(_0xb6e1ce){var _0x1b79af=_0x4ffc81;_0xb6e1ce[_0x1b79af(0x317)]>this['blockSize']&&(_0xb6e1ce=new this['Hash']()['update'](_0xb6e1ce)[_0x1b79af(0x318)]()),_0x33de4d(_0xb6e1ce[_0x1b79af(0x317)]<=this[_0x1b79af(0x265)]);for(var _0x2cd1b4=_0xb6e1ce[_0x1b79af(0x317)];_0x2cd1b4<this[_0x1b79af(0x265)];_0x2cd1b4++)_0xb6e1ce[_0x1b79af(0x33c)](0x0);for(_0x2cd1b4=0x0;_0x2cd1b4<_0xb6e1ce[_0x1b79af(0x317)];_0x2cd1b4++)_0xb6e1ce[_0x2cd1b4]^=0x36;for(this[_0x1b79af(0x2ea)]=new this['Hash']()[_0x1b79af(0x236)](_0xb6e1ce),_0x2cd1b4=0x0;_0x2cd1b4<_0xb6e1ce[_0x1b79af(0x317)];_0x2cd1b4++)_0xb6e1ce[_0x2cd1b4]^=0x6a;this[_0x1b79af(0x1f1)]=new this[(_0x1b79af(0x204))]()[_0x1b79af(0x236)](_0xb6e1ce);},_0x1c1456[_0x4ffc81(0x2b7)]['update']=function(_0x517d09,_0x5a42a2){var _0x2e97fb=_0x4ffc81;return this['inner'][_0x2e97fb(0x236)](_0x517d09,_0x5a42a2),this;},_0x1c1456[_0x4ffc81(0x2b7)]['digest']=function(_0x2954d2){var _0x388221=_0x4ffc81;return this[_0x388221(0x1f1)]['update'](this[_0x388221(0x2ea)][_0x388221(0x318)]()),this[_0x388221(0x1f1)][_0x388221(0x318)](_0x2954d2);};var _0x50f4e6=_0x1ddd15(function(_0x44d58e,_0x30c9da){var _0x1d195d=_0x4ffc81,_0x781a74=_0x30c9da;_0x781a74[_0x1d195d(0x218)]=_0x37ee9a,_0x781a74[_0x1d195d(0x394)]=_0x368924,_0x781a74[_0x1d195d(0x33f)]=_0x38cc6e,_0x781a74[_0x1d195d(0x30a)]=_0x1d7abb,_0x781a74[_0x1d195d(0x33d)]=_0x4cd590,_0x781a74[_0x1d195d(0x285)]=_0x781a74[_0x1d195d(0x33f)][_0x1d195d(0x285)],_0x781a74[_0x1d195d(0x32c)]=_0x781a74[_0x1d195d(0x33f)][_0x1d195d(0x32c)],_0x781a74[_0x1d195d(0x306)]=_0x781a74[_0x1d195d(0x33f)][_0x1d195d(0x306)],_0x781a74[_0x1d195d(0x24a)]=_0x781a74[_0x1d195d(0x33f)]['sha384'],_0x781a74['sha512']=_0x781a74['sha']['sha512'],_0x781a74[_0x1d195d(0x25e)]=_0x781a74[_0x1d195d(0x30a)][_0x1d195d(0x25e)];}),_0x3fbd4d=_0x4ffc81(0x28f)==(_0x4ffc81(0x2b8)==typeof wx?'undefined':_0xb71d86(wx))&&'object'==(_0x4ffc81(0x2b8)==typeof WXWebAssembly?_0x4ffc81(0x2b8):_0xb71d86(WXWebAssembly)),_0x34f095=!0x1,_0x46fd51=null,_0x2ad483='',_0x5a7cb3='',_0x478090=_0x4ffc81(0x28f)===(_0x4ffc81(0x2b8)==typeof WebAssembly?_0x4ffc81(0x2b8):_0xb71d86(WebAssembly))||_0x4ffc81(0x28f)===(_0x4ffc81(0x2b8)==typeof WXWebAssembly?'undefined':_0xb71d86(WXWebAssembly));function _0x4b6071(_0x56cdb1,_0x444c5e){var _0x580cff=_0x4ffc81;return _0x56cdb1+_0x580cff(0x3a0)+_0x444c5e+'\\x20';}function _0x512ac6(_0x121001){var _0x3e596f=_0x4ffc81;return{'x-euler-const':_0x4b6071(_0x3e596f(0x354),_0x1273a5(_0x121001)),'x-euler-headers':''};}function _0x4fd0a8(_0x5d35a1){var _0x57bd1b=_0x4ffc81,_0xb0f07d={'path':'','queryParams':''};if(_0x3fbd4d||_0x57bd1b(0x2b8)==typeof URL){var _0x29e671=_0x5d35a1[_0x57bd1b(0x213)]('/',_0x5d35a1[_0x57bd1b(0x213)]('://')+0x3);if(-0x1!==_0x29e671){var _0x2b2b0f=_0x5d35a1['indexOf']('?');-0x1!==_0x2b2b0f?(_0xb0f07d[_0x57bd1b(0x1f0)]=_0x5d35a1[_0x57bd1b(0x26e)](_0x29e671,_0x2b2b0f),_0xb0f07d[_0x57bd1b(0x2ec)]=_0x5d35a1['substring'](_0x2b2b0f+0x1)):_0xb0f07d['path']=_0x5d35a1[_0x57bd1b(0x26e)](_0x29e671);}}else{var _0x27b92c=new URL(_0x5d35a1,_0x57bd1b(0x29a));_0xb0f07d['path']=_0x27b92c[_0x57bd1b(0x2ac)],_0xb0f07d[_0x57bd1b(0x2ec)]=null==_0x27b92c?void 0x0:_0x27b92c[_0x57bd1b(0x38d)][_0x57bd1b(0x2a1)](0x1);}return _0xb0f07d;}function _0x3be223(_0xf1fde3){var _0x20a571=_0x4ffc81;_0x2ad483[_0x20a571(0x1f9)](_0xf1fde3)||(_0x2ad483=_0x2ad483+'_'+_0xf1fde3);}function _0x2d35bc(_0x284017){var _0x44594a=_0x4ffc81;_0x5a7cb3[_0x44594a(0x1f9)](_0x284017)||(_0x5a7cb3=_0x5a7cb3+'_'+_0x284017);}function _0x1273a5(_0x195025){var _0xc15774=_0x4ffc81,_0x594f1e=_0x195025;return void 0x0!==_0x10f6f1&&null!=_0x10f6f1['errorMsg']&&_0x10f6f1[_0xc15774(0x323)]['length']>0x0&&(_0x594f1e=_0x594f1e+_0xc15774(0x3a8)+_0x10f6f1[_0xc15774(0x323)]),_0x2ad483[_0xc15774(0x317)]>0x0&&(_0x594f1e=_0x594f1e+'_e'+_0x2ad483),_0x5a7cb3[_0xc15774(0x317)]>0x0&&(_0x594f1e=_0x594f1e+'_d'+_0x5a7cb3),(_0x594f1e=_0x594f1e+_0xc15774(0x23c)+(_0xc15774(0x2b8)!=typeof navigator?navigator[_0xc15774(0x22c)]:_0xc15774(0x392)))[_0xc15774(0x26e)](0x0,0x1f4);}var _0x11f8ca,_0x4cfff9=(function(){var _0x13138c=_0x4ffc81;function _0x5c8ff4(_0x12702e){_0x3d8524(this,_0x5c8ff4),this['configs']=_0x12702e;}var _0x20cff9,_0x4e9e3a,_0x3cc8db,_0x4caa09;return _0x20cff9=_0x5c8ff4,_0x4e9e3a=[{'key':_0x13138c(0x34e),'value':(_0x4caa09=_0x45b068(_0xc2bb1b()['mark'](function _0x199908(_0x59a276){var _0x4cd141=_0x13138c;return _0xc2bb1b()[_0x4cd141(0x2ad)](function(_0x1acecc){var _0x2a194c=_0x4cd141;for(;;)switch(_0x1acecc['prev']=_0x1acecc[_0x2a194c(0x210)]){case 0x0:if(_0x1acecc[_0x2a194c(0x378)]=0x0,_0x2d35bc(_0x2a194c(0x2bf)),this[_0x2a194c(0x251)]=Object[_0x2a194c(0x202)](this[_0x2a194c(0x251)],_0x59a276),_0x1acecc[_0x2a194c(0x378)]=0x3,_0x478090){_0x1acecc['next']=0x7;break;}return _0x3be223(_0x2a194c(0x260)),_0x1acecc['abrupt'](_0x2a194c(0x297));case 0x7:if(!_0x34f095){_0x1acecc[_0x2a194c(0x210)]=0x9;break;}return _0x1acecc[_0x2a194c(0x366)]('return');case 0x9:if(!_0x46fd51){_0x1acecc[_0x2a194c(0x210)]=0xb;break;}return _0x1acecc['abrupt']('return',_0x46fd51);case 0xb:return _0x46fd51=new Promise(function(_0x29806c,_0x1ac637){var _0xd46fc9=_0x2a194c,_0x3dca7a=setTimeout(function(){var _0x920bd9=a0_0x3813;_0x3be223(_0x920bd9(0x2f6)),_0x29806c();},0x1770),_0x48dd08=function(_0x16e432){var _0x28604d=a0_0x3813;if(_0x2d35bc(_0x28604d(0x28d)),_0x3fbd4d)clearTimeout(_0x16e432),_0x29806c();else try{var _0x16084d=function(_0x4485fa){var _0x4f6b1a=_0x28604d;try{_0x10f6f1[_0x4f6b1a(0x212)](_0x4f6b1a(0x37f),_0x4f6b1a(0x339),[_0x4f6b1a(0x24d)],[_0x4485fa]),_0x34f095=!0x0,clearTimeout(_0x16e432),_0x29806c();}catch(_0x77e8ec){_0x3be223(_0x4f6b1a(0x253)+_0x77e8ec['message']),_0x29806c();}};_0x11f8ca[_0x28604d(0x2a7)]=_0x16084d,'undefined'!=typeof window&&(window[_0x28604d(0x2c9)]=window[_0x28604d(0x2c9)]||_0x11f8ca,window[_0x28604d(0x2c9)][_0x28604d(0x2a7)]=_0x16084d),_0x10f6f1[_0x28604d(0x230)]();}catch(_0x37ef2f){_0x3be223(_0x28604d(0x303)+_0x37ef2f[_0x28604d(0x22a)]),_0x29806c();}};void 0x0!==_0x10f6f1&&(_0x10f6f1[_0xd46fc9(0x31e)]?_0x48dd08(_0x3dca7a):_0x10f6f1[_0xd46fc9(0x20d)]=function(){_0x48dd08(_0x3dca7a);});}),_0x1acecc[_0x2a194c(0x366)](_0x2a194c(0x297),_0x46fd51);case 0xf:return _0x1acecc[_0x2a194c(0x378)]=0xf,_0x1acecc['t0']=_0x1acecc['catch'](0x3),_0x3be223(_0x2a194c(0x36d)+_0x1acecc['t0'][_0x2a194c(0x22a)]),console[_0x2a194c(0x271)](_0x1acecc['t0']||_0x2a194c(0x22e)),_0x1acecc[_0x2a194c(0x366)](_0x2a194c(0x297),_0x1acecc['t0']);case 0x14:_0x1acecc[_0x2a194c(0x210)]=0x19;break;case 0x16:_0x1acecc['prev']=0x16,_0x1acecc['t1']=_0x1acecc[_0x2a194c(0x20e)](0x0),_0x3be223(_0x2a194c(0x34f)+(_0x1acecc['t1']&&_0x1acecc['t1'][_0x2a194c(0x22a)]||_0x2a194c(0x31f)));case 0x19:case _0x2a194c(0x3b1):return _0x1acecc['stop']();}},_0x199908,this,[[0x0,0x16],[0x3,0xf]]);})),function(_0xba922d){var _0x4ec9fb=_0x13138c;return _0x4caa09[_0x4ec9fb(0x2b6)](this,arguments);})},{'key':_0x13138c(0x2a7),'value':function(_0x4a11b2){var _0x2f0cbe=_0x13138c;try{_0x10f6f1[_0x2f0cbe(0x212)]('collect_callback','null',['string'],[_0x4a11b2]),_0x34f095=!0x0;}catch(_0x548b3b){_0x3be223(_0x2f0cbe(0x39a)+_0x548b3b['message']);}}},{'key':_0x13138c(0x2c3),'value':function(_0x162510,_0x182c2d,_0x1c722c,_0x13f2f6){var _0xa49a61=_0x13138c;try{_0x34f095||_0x3be223(_0xa49a61(0x2e4));var _0x3e0842=[];_0x162510=_0xa49a61(0x24d)==typeof _0x162510?_0x162510[_0xa49a61(0x322)]():'',_0x3e0842['push'](_0x162510);var _0x30d7f3,_0x2cf5e7=new Map(),_0x1dca63=[],_0x14e0ab='';_0x13f2f6 instanceof Map?_0x1dca63=_0x13f2f6['keys']():'object'===_0xb71d86(_0x13f2f6)&&null!==_0x13f2f6&&(_0x1dca63=Object['keys'](_0x13f2f6));var _0x50504f,_0x24fdea=_0xa49a61(0x3b4),_0x2f576b=_0x545f1d(_0x1dca63);try{for(_0x2f576b['s']();!(_0x50504f=_0x2f576b['n']())[_0xa49a61(0x38c)];){var _0x15e708=_0x50504f['value'],_0x21d453=_0x13f2f6 instanceof Map?_0x13f2f6['get'](_0x15e708):_0x13f2f6[_0x15e708];null!=_0x21d453&&''!==_0x21d453&&(['content-type',_0xa49a61(0x239)][_0xa49a61(0x1f9)](_0x15e708)?_0x24fdea=_0x21d453:_0x2cf5e7[_0xa49a61(0x249)](_0x15e708['toLowerCase'](),_0x21d453));}}catch(_0x47692c){_0x2f576b['e'](_0x47692c);}finally{_0x2f576b['f']();}var _0x20cd4c=Array[_0xa49a61(0x3b7)](_0x2cf5e7['keys']())[_0xa49a61(0x280)]();_0x30d7f3=_0x20cd4c[_0xa49a61(0x2e2)](';');var _0x2dad64,_0x27a890=_0x545f1d(_0x20cd4c);try{for(_0x27a890['s']();!(_0x2dad64=_0x27a890['n']())[_0xa49a61(0x38c)];){var _0x4d2935=_0x2dad64[_0xa49a61(0x2f0)];_0x14e0ab=_0x14e0ab+_0x4d2935+':'+_0x2cf5e7[_0xa49a61(0x362)](_0x4d2935)+'\\x0a';}}catch(_0xc56fd5){_0x27a890['e'](_0xc56fd5);}finally{_0x27a890['f']();}var _0x3ad3ff='/',_0xd3fc48='';if(_0x1c722c)try{var _0x4be017=_0x4fd0a8(_0x1c722c);_0x3ad3ff=_0x4be017[_0xa49a61(0x1f0)][_0xa49a61(0x2b4)]('/')?_0x4be017[_0xa49a61(0x1f0)]:_0x4be017[_0xa49a61(0x1f0)]+'/',_0xd3fc48=_0x431d8c(_0x182c2d,_0x4be017[_0xa49a61(0x2ec)],_0x24fdea);}catch(_0x1a4fea){return _0x512ac6(_0x1a4fea[_0xa49a61(0x22a)]+_0xa49a61(0x288)+_0x1c722c);}_0x3e0842[_0xa49a61(0x33c)](_0x3ad3ff),_0x3e0842['push'](_0xd3fc48),_0x3e0842['push'](_0x14e0ab),_0x3e0842[_0xa49a61(0x33c)](_0x30d7f3);var _0x450ced='';try{if(_0xa49a61(0x222)===_0x162510||null===_0x182c2d||''===_0x182c2d||_0xa49a61(0x338)===_0x24fdea||!_0x3fbd4d&&(_0xa49a61(0x2b8)!=typeof FormData&&_0x182c2d instanceof FormData||_0xa49a61(0x2b8)!=typeof URLSearchParams&&_0x182c2d instanceof URLSearchParams))_0x450ced='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';else{var _0x378597=_0xa49a61(0x24d)==typeof _0x182c2d?_0x182c2d:JSON[_0xa49a61(0x201)](_0x182c2d);_0x450ced=_0x50f4e6[_0xa49a61(0x32c)]()[_0xa49a61(0x236)](_0x378597)[_0xa49a61(0x318)](_0xa49a61(0x1f6));}}catch(_0x57346d){return _0x512ac6(_0xa49a61(0x3bf)+_0x57346d[_0xa49a61(0x22a)]);}_0x3e0842[_0xa49a61(0x33c)](_0x450ced);var _0x4fa2c8=_0x3e0842[_0xa49a61(0x2e2)]('\\x0a'),_0x10615c='';try{if(!_0x478090)return _0x512ac6(_0xa49a61(0x233));if(void 0x0===_0x10f6f1)return _0x512ac6(_0xa49a61(0x386));if(!_0x10f6f1[_0xa49a61(0x31e)])return _0x512ac6(_0xa49a61(0x28c));_0x10615c=_0x10f6f1['ccall']('rdm_graph',_0xa49a61(0x24d),[_0xa49a61(0x24d)],[_0x4fa2c8]);}catch(_0x2e2a27){return _0x512ac6(_0xa49a61(0x29f)+_0x2e2a27['message']);}return{'x-euler-const':_0x10615c,'x-euler-headers':_0x30d7f3};}catch(_0x8a0f22){return _0x512ac6(_0xa49a61(0x3af)+(_0x8a0f22&&_0x8a0f22[_0xa49a61(0x22a)]||_0xa49a61(0x31f)));}}}],_0x4e9e3a&&_0x1622d5(_0x20cff9[_0x13138c(0x2b7)],_0x4e9e3a),_0x3cc8db&&_0x1622d5(_0x20cff9,_0x3cc8db),Object[_0x13138c(0x3a2)](_0x20cff9,'prototype',{'writable':!0x1}),_0x5c8ff4;}());try{(_0x11f8ca=new _0x4cfff9({'debug':!0x1}))['init']()[_0x4ffc81(0x20e)](function(){});}catch(_0x18a2f5){_0x3be223(_0x4ffc81(0x33b)+(_0x18a2f5&&_0x18a2f5[_0x4ffc81(0x22a)]||_0x4ffc81(0x31f))),_0x11f8ca={'init':(_0x16a3cc=_0x45b068(_0xc2bb1b()[_0x4ffc81(0x319)](function _0xdce43f(){var _0x558daa=_0x4ffc81;return _0xc2bb1b()[_0x558daa(0x2ad)](function(_0x34013c){var _0x3e81e3=_0x558daa;for(;;)switch(_0x34013c[_0x3e81e3(0x378)]=_0x34013c[_0x3e81e3(0x210)]){case 0x0:case'end':return _0x34013c[_0x3e81e3(0x229)]();}},_0xdce43f);})),function(){var _0x29cb41=_0x4ffc81;return _0x16a3cc[_0x29cb41(0x2b6)](this,arguments);}),'random':function(){var _0x2a3efc=_0x4ffc81;return _0x512ac6(_0x2a3efc(0x39b));},'cbcb':function(){}};}return _0x11f8ca;}catch(_0x370a58){return{'init':function(){var _0x4a31e9=_0x4ffc81;return Promise[_0x4a31e9(0x23f)]();},'random':function(){var _0x520965=_0x4ffc81;return{'x-euler-const':'13004130::null::null::bundle_fatal_'+(_0x370a58&&_0x370a58[_0x520965(0x22a)]||_0x520965(0x31f))+'::Vnbs=Ab=','x-euler-headers':''};},'cbcb':function(){}};}var _0x16a3cc,_0x3ce34c;});";
  const QQ_HOSTS = new Set(['openmobile.qq.com', 'xui.ptlogin2.qq.com',
    'ssl.ptlogin2.qq.com', 'ptlogin2.qq.com', 'graph.qq.com']);
  const API_HOSTS = new Set(['m.wegame.com.cn', 'anysdk.dobest.cn',
    '10th-sdk-login.sanguosha.com', 'web-login-api.sanguosha.com',
    'wpg-api.biligame.com', '10th-ly-login.sanguosha.com']);
  const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36';
  const GAME_ROUTES = Object.freeze({
    xiaomi: Object.freeze({path: '/x/pc/index.php', channel: XIAOMI_CHANNEL, query: false, delivery: 'bootstrap'}),
    vivo: Object.freeze({path: '/10/pc/index.php', channel: VIVO_CHANNEL, query: true, delivery: 'callback'}),
    huawei: Object.freeze({path: '/10/pc/index.php', channel: HUAWEI_CHANNEL, query: true, delivery: 'callback'}),
    oppo: Object.freeze({path: '/10/pc/index.php', channel: OPPO_CHANNEL, query: true, delivery: 'callback'}),
    qq: Object.freeze({path: '/10/pc/index.php', channel: WEGAME_CHANNEL, query: true, delivery: 'callback'}),
    wx: Object.freeze({path: '/10/pc/index.php', channel: WEGAME_CHANNEL, query: true, delivery: 'callback'}),
    bilibili: Object.freeze({path: '/10/pc/bilibiliWD_index.php', channel: BILI_CHANNEL, query: true, delivery: 'callback'}),
    steam: Object.freeze({path: '/10/pc/index.php', channel: null, query: true, delivery: 'callback'})
  });
  const page = unsafeWindow;
  // This copy is hosted by the multichannel userscript. The source panel is
  // suppressed and only the normalized start/get/enter API is used.
  if (!page.__JND_HOST) page.__JND_HOST = {kind: 'micro', source: 'sgs-multichannel'};
  if (typeof page.__SGS_DIRECT_EVENT__ !== 'function') page.__SGS_DIRECT_EVENT__ = () => {};
  const EMBEDDED = page.__JND_HOST?.source === 'sgs-multichannel';
  if (location.origin !== ORIGIN || window.top !== window) return;

  function failure(code, stage) {
    return Object.assign(new Error(code), {stage});
  }
  function assert(ok, code, stage) { if (!ok) throw failure(code, stage); }
  function fields(value, keys, stage) {
    assert(value && typeof value === 'object' && !Array.isArray(value), 'RESPONSE_SCHEMA_CHANGED', stage);
    const result = {};
    for (const key of keys) {
      const v = value[key];
      assert((typeof v === 'string' || typeof v === 'number') && String(v).length > 0 &&
        String(v).length <= 32768, 'RESPONSE_SCHEMA_CHANGED', stage);
      result[key] = String(v);
    }
    return result;
  }
  function validateGrant(value) {
    const stage = 'handoff';
    assert(value && typeof value === 'object' && !Array.isArray(value) &&
      Object.prototype.toString.call(value) === '[object Object]',
      'RESPONSE_SCHEMA_CHANGED', stage);
    const keys = Object.keys(value);
    assert(keys.length <= 64, 'RESPONSE_SCHEMA_CHANGED', stage);
    const result = Object.create(null);
    for (const key of keys) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(key) ||
        key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) continue;
      const item = descriptor.value;
      if (typeof item === 'string') {
        assert(item.length <= 8192, 'RESPONSE_SCHEMA_CHANGED', stage);
        result[key] = item;
      } else if (typeof item === 'number') {
        assert(Number.isFinite(item), 'RESPONSE_SCHEMA_CHANGED', stage);
        result[key] = item;
      } else if (typeof item === 'boolean') {
        result[key] = item;
      }
    }
    for (const key of ['account', 'token', 'sign']) {
      const item = result[key];
      assert((typeof item === 'string' || typeof item === 'number') && String(item).length > 0,
        'RESPONSE_SCHEMA_CHANGED', stage);
      result[key] = String(item);
    }
    const timestamp = Number(result.timestamp);
    assert(Number.isFinite(timestamp) && timestamp > 0 && timestamp < 1e14,
      'INVALID_TIMESTAMP', stage);
    result.timestamp = timestamp;
    if (result.channel_id !== undefined) {
      assert((typeof result.channel_id === 'string' || typeof result.channel_id === 'number') &&
        String(result.channel_id).length <= 32, 'RESPONSE_SCHEMA_CHANGED', stage);
    }
    return result;
  }
  function gameAuthFields() {
    let self = null;
    try { self = page.AccountInfo?.Self || page.AccountInfo?.self || null; } catch (_) {}
    const fields = {};
    for (const [name, value] of [
      ['serverId', self?.SeverID || self?.ServerID],
      ['loginAccount', self?.Account],
      ['channelAccount', self?.ChannelAccount]
    ]) {
      if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) {
        fields[name] = String(value).trim().slice(0, 256);
      }
    }
    return fields;
  }
  let boundClientToken = '';
  function emitGameAuth(provider, success, extra = {}) {
    try {
      page.__SGS_DIRECT_EVENT__({type: 'game-auth', provider, success: success !== false,
        clientToken: boundClientToken, ...gameAuthFields(), ...extra});
    } catch (_) {}
  }
  // The official GameMain in every build we have inspected gates scene entry on
  // Laya.Browser.window.fontLoaded. A stale false/undefined value used to make
  // platformLoginBack write AccountInfo and then return before the scene switch,
  // which is exactly the "loading, then back to login" failure. Read the
  // official entry function itself so a future build that removes this gate is
  // not blocked forever by a flag the game no longer reads.
  function entryRequiresFont(game) {
    try {
      const source = Function.prototype.toString.call(game?.EnterLoginScene || '');
      if (source && !source.includes('[native code]')) return source.includes('fontLoaded');
    } catch (_) {}
    return true;
  }
  function loginReadiness(game, fontGate = true) {
    const state = {parseConfiged: false, preloaded: false, fontLoaded: false,
      checkLoaded: null, fontGate: !!fontGate, loadingView: false, ready: false, reason: ''};
    if (!game) { state.reason = 'GAME_EXPORT_PENDING'; return state; }
    try { state.parseConfiged = !!game.parseConfiged; } catch (_) {}
    try { state.preloaded = !!game.preloaded; } catch (_) {}
    try { state.loadingView = !!game.loadingView; } catch (_) {}
    let font;
    try { font = page.Laya?.Browser?.window?.fontLoaded; } catch (_) {}
    state.fontLoaded = font === true;
    if (!state.parseConfiged) state.reason = 'CONFIG_PENDING';
    else if (!state.preloaded) state.reason = 'PRELOAD_PENDING';
    else if (typeof game.CheckLoaded === 'function') {
      try { state.checkLoaded = !!game.CheckLoaded(); }
      catch (_) { state.checkLoaded = false; }
      if (!state.checkLoaded) state.reason = 'CHECKLOADED_PENDING';
    }
    if (!state.reason && state.fontGate && !state.fontLoaded) state.reason = 'FONT_PENDING';
    state.ready = !state.reason;
    return state;
  }
  // A late injection can happen after the game has already removed its loading
  // view. Official EnterLoginScene touches loadingView.ResetProgress() whenever
  // preloaded is true, so provide a no-op view for that one call instead of
  // letting a TypeError abort the handoff.
  function callPlatformLoginBack(game, payload) {
    let stub = null;
    try {
      if (game?.preloaded && !game.loadingView) {
        stub = {ResetProgress() {}, ShowParseConfig() {}, ShowProgress() {}, ShowError() {},
          parent: {removeChild() {}}, destroy() {}};
        game.loadingView = stub;
      }
      return game.platformLoginBack(payload);
    } finally {
      if (stub && game.loadingView === stub) game.loadingView = null;
    }
  }
  function installRequestBootstrap(provider, channel, grant, name) {
    const original = {...grant, channel_id: channel};
    const channelDescriptor = Object.getOwnPropertyDescriptor(page, 'channel_id');
    if (!channelDescriptor || channelDescriptor.configurable) {
      Object.defineProperty(page, 'channel_id', {configurable: false, get: () => channel, set() {}});
    } else {
      try { page.channel_id = channel; } catch (_) {}
    }
    assert(String(page.channel_id) === String(channel), 'PLATFORM_CHANNEL_MISMATCH', provider + '_bootstrap');

    let request = original;
    const requestDescriptor = Object.getOwnPropertyDescriptor(page, 'ReqObj');
    if (!requestDescriptor || requestDescriptor.configurable) {
      const existing = page.ReqObj && typeof page.ReqObj === 'object' && !Array.isArray(page.ReqObj) ? page.ReqObj : {};
      request = Object.assign(existing, original);
      Object.defineProperty(page, 'ReqObj', {
        configurable: false,
        get: () => request,
        set: incoming => {
          if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
            Object.assign(request, incoming, original);
          }
        }
      });
    } else if (page.ReqObj && typeof page.ReqObj === 'object' && !Array.isArray(page.ReqObj)) {
      request = Object.assign(page.ReqObj, original);
    } else if (requestDescriptor.writable) {
      page.ReqObj = original;
      request = page.ReqObj;
    } else if (requestDescriptor.set) {
      page.ReqObj = original;
      request = page.ReqObj;
    }
    assert(request && String(request.account || '') === String(original.account || '') &&
      String(request.token || '') === String(original.token || '') &&
      String(request.channel_id) === String(channel),
      'PLATFORM_BOOTSTRAP_UNAVAILABLE', provider + '_bootstrap');

    const previous = page.scriptContent;
    let delegate = typeof previous === 'function' ? previous : null;
    const wrap = function (scriptName, source) {
      if (typeof delegate === 'function') {
        try { source = delegate(scriptName, source); } catch (_) {}
      }
      if (typeof source !== 'string' || !scriptName || !scriptName.includes('main')) return source;
      const markers = [
        ['authHandler(e){let t=e.Protocol;',
          "authHandler(e){let t=e.Protocol;try{window.__SGS_DIRECT_EVENT__({type:'game-auth',provider:'xiaomi',success:Number(t.errCode)===0,code:String(Number(t.errCode)||0)})}catch(_){}"],
        ['notifyUserData(e){let t=e.Protocol;if(t.finished){',
          "notifyUserData(e){let t=e.Protocol;if(t.finished){try{const a=AccountInfo.Self||{};window.__SGS_DIRECT_EVENT__({type:'game-auth',provider:'xiaomi',success:true,serverId:String(a.SeverID||''),loginAccount:String(a.Account||''),channelAccount:String(a.ChannelAccount||'')})}catch(_){}"]
      ];
      for (const [find, replacement] of markers) {
        if (source.split(find).length === 2) source = source.replace(find, replacement);
      }
      return source;
    };
    const scriptDescriptor = Object.getOwnPropertyDescriptor(page, 'scriptContent');
    if (!scriptDescriptor || scriptDescriptor.configurable) {
      Object.defineProperty(page, 'scriptContent', {
        configurable: true,
        get: () => wrap,
        set: value => { if (typeof value === 'function') delegate = value; }
      });
    } else {
      try { page.scriptContent = wrap; } catch (_) {}
    }
    consumeHandoff(name);
  }
  // The host userscript keeps credentials only in this tab. A one-time
  // sessionStorage handoff survives the same-tab navigation and is consumed
  // before the game bootstrap can observe it; nothing is written to GM storage.
  function readHandoff() {
    if (!EMBEDDED) {
      return GM_getValue(HANDOFF_KEY, null);
    }
    try {
      const raw = sessionStorage.getItem(EMBEDDED_HANDOFF_KEY);
      if (typeof raw !== 'string' || !raw || raw.length > EMBEDDED_HANDOFF_LIMIT) return null;
      return JSON.parse(raw);
    } catch (_) { return null; }
  }
  function writeHandoff(value) {
    if (!EMBEDDED) { GM_setValue(HANDOFF_KEY, value); return; }
    const raw = JSON.stringify(value);
    assert(typeof raw === 'string' && raw.length <= EMBEDDED_HANDOFF_LIMIT, 'HANDOFF_TOO_LARGE', 'handoff');
    sessionStorage.setItem(EMBEDDED_HANDOFF_KEY, raw);
  }
  function discardHandoff() {
    if (!EMBEDDED) { GM_deleteValue(HANDOFF_KEY); return; }
    try { sessionStorage.removeItem(EMBEDDED_HANDOFF_KEY); } catch (_) {}
  }
  function consumeHandoff(name) {
    const current = readHandoff();
    if (current?.name === name) discardHandoff();
    if (window.name === name) window.name = '';
  }
  function cleanupHandoff() {
    if (!EMBEDDED) {
      const old = GM_getValue(HANDOFF_KEY, null);
      if (old && !(old.expires > Date.now())) GM_deleteValue(HANDOFF_KEY);
      return;
    }
    try {
      const raw = sessionStorage.getItem(EMBEDDED_HANDOFF_KEY);
      if (!raw) return;
      const value = JSON.parse(raw);
      if (!(value?.expires > Date.now())) sessionStorage.removeItem(EMBEDDED_HANDOFF_KEY);
    } catch (_) { try { sessionStorage.removeItem(EMBEDDED_HANDOFF_KEY); } catch (_) {} }
  }
  // A session record is keyed by the host account and the exact auth provider.
  // WeGame QQ and WeChat therefore never overwrite each other, even when the
  // same profile later switches provider. A tab marker still contains only a
  // record id, never a token.
  const SESSION_PROVIDERS = new Set(['qq', 'wx', 'bilibili', 'steam', 'oppo', 'xiaomi', 'vivo', 'huawei']);
  const SESSION_PROFILE_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;
  let legacySessionMigrated = false;
  function sessionText(value, limit = 32768) {
    return (typeof value === 'string' || typeof value === 'number') && String(value).length > 0 &&
      String(value).length <= limit ? String(value) : '';
  }
  function sessionStoreKey(profileId, provider) {
    return SESSION_STORE_PREFIX + encodeURIComponent(profileId || '') + ':' + encodeURIComponent(provider || '');
  }
  function sessionStoreRecord(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    const provider = sessionText(record.provider, 32);
    const profileId = sessionText(record.profileId, 256);
    const id = sessionText(record.id, 64);
    // Records migrated from the pre-profile-keyed store have no profile id.
    // They are still discoverable by provider + saved record id; new records
    // are always written with a validated profile id by remember()/bindProfile().
    if (!SESSION_PROVIDERS.has(provider) || (profileId && !SESSION_PROFILE_PATTERN.test(profileId)) ||
      !/^[a-f0-9]{32}$/.test(id)) return null;
    const expires = Number(record.expires);
    const result = {v: 3, provider, profileId, id,
      expires: Number.isFinite(expires) && expires > 0 ? expires : SESSION_RECORD_EXPIRES_FOREVER,
      created: Number(record.created) || 0, updated: Number(record.updated) || 0,
      account: sessionText(record.account, 256), device: sessionText(record.device, 256),
      session: sessionText(record.session, 32768)};
    if (provider === 'qq' || provider === 'wx') {
      const wg = record.wegame;
      if (wg && typeof wg === 'object') result.wegame = {
        ...copiedFields(wg, ['openid', 'access_token', 'uid', 'channel']),
        ct: sessionText(wg.ct, 32768),
        atExpires: Number(wg.atExpires) || 0
      };
    } else if (provider === 'bilibili') {
      const b = record.bili;
      if (b && typeof b === 'object') result.bili = {
        ...copiedFields(b, ['uid', 'access_key', 'uname']), expires: Number(b.expires) || 0
      };
    } else if (provider === 'steam') {
      const s = record.steam;
      if (s && typeof s === 'object') result.steam = {
        ...copiedFields(s, ['access_token', 'steamID']),
        expires: Number(s.expires) || 0, retainedUntil: Number(s.retainedUntil) || 0
      };
    } else if (provider === 'oppo') {
      const o = record.oppo;
      if (o && typeof o === 'object') result.oppo = {
        ...copiedFields(o, ['token', 'ssoid', 'accountName']), credentialType: 'game-ticket'
      };
    } else if (provider === 'huawei') {
      const auth = record[provider]?.auth;
      if (auth && typeof auth === 'object') result[provider] = {auth: {
        ...copiedFields(auth, ['uid', 'session', 'username', 'gameUID']), expires: Number(auth.expires) || 0
      }};
    } else if (provider === 'xiaomi' || provider === 'vivo') {
      const auth = record[provider];
      if (auth && typeof auth === 'object') result[provider] =
        copiedFields(auth, ['uid', 'session', 'username']);
    }
    return result;
  }
  function migrateLegacySession() {
    if (legacySessionMigrated) return;
    legacySessionMigrated = true;
    let legacy = null;
    try { legacy = GM_getValue(SESSION_KEY, null); } catch (_) { return; }
    if (!legacy || typeof legacy !== 'object') return;
    const provider = sessionText(legacy.provider, 32);
    const record = sessionStoreRecord({...legacy, provider, profileId: ''});
    if (!record) { try { GM_deleteValue(SESSION_KEY); } catch (_) {} return; }
    const key = sessionStoreKey('', provider);
    try {
      const existing = sessionStoreRecord(GM_getValue(key, null));
      if (!existing || record.updated >= existing.updated) GM_setValue(key, record);
      GM_deleteValue(SESSION_KEY);
    } catch (_) {}
  }
  function sessionRecords() {
    migrateLegacySession();
    const records = [];
    let keys = [];
    try { keys = GM_listValues(); } catch (_) { return records; }
    for (const key of keys) {
      if (typeof key !== 'string' || !key.startsWith(SESSION_STORE_PREFIX)) continue;
      try {
        const record = sessionStoreRecord(GM_getValue(key, null));
        if (record) records.push({key, record});
      } catch (_) {}
    }
    return records;
  }
  function savedSession(provider = '', profileId = '', id = '') {
    let best = null;
    for (const {record} of sessionRecords()) {
      if (provider && record.provider !== provider) continue;
      if (profileId && record.profileId !== profileId) continue;
      if (id && record.id !== id) continue;
      if (!best || Number(record.updated || 0) > Number(best.updated || 0)) best = record;
    }
    return best;
  }
  function sessionForAttempt(a) {
    const provider = a?.provider || '';
    const profileId = a?.__sgsProfileId || a?.profileId || '';
    return (profileId && savedSession(provider, profileId)) || savedSession(provider, '', a?.savedId || '') ||
      savedSession('', profileId);
  }
  function copiedFields(value, keys) {
    const result = {};
    if (!value || typeof value !== 'object') return result;
    for (const key of keys) {
      const item = value[key];
      if ((typeof item === 'string' || typeof item === 'number') && String(item).length > 0 &&
        String(item).length <= 32768) result[key] = String(item);
    }
    return result;
  }
  function isWeGameTab() {
    if (EMBEDDED) return false;
    try {
      const id = sessionStorage.getItem(TAB_KEY);
      return !!id && !!savedSession('', '', id);
    } catch (_) { return false; }
  }
  if (location.pathname === '/login/x/index' && isWeGameTab()) {
    location.replace(ORIGIN + '/login/index.html'); return;
  }
  // Preserve the verified channel's official bootstrap contract. No auth in URLs.
  if (location.pathname === '/10/pc/index.php' || location.pathname === '/10/pc/bilibiliWD_index.php' ||
    location.pathname === '/x/pc/index.php') {
    if (!window.name.startsWith(PREFIX)) {
      if (isWeGameTab()) location.replace(ORIGIN + '/login/index.html');
      return;
    }
    const name = window.name;
    let grant, payload;
    try {
      const handoff = readHandoff();
      if (handoff?.name === name) {
        if (handoff.expires > Date.now() && handoff.expires <= Date.now() + HANDOFF_TTL + 5000) {
          grant = handoff.grant; payload = handoff;
        }
      }
    } catch (_) {}
    if (/^[a-f0-9]{16,64}$/.test(payload?.clientToken || '')) {
      boundClientToken = payload.clientToken;
      try { page.__SGS_DIRECT_CLIENT_TOKEN__ = boundClientToken; } catch (_) {}
    }
    const finishHandoff = () => consumeHandoff(name);
    if (location.pathname === '/x/pc/index.php') {
      if (payload?.provider !== 'xiaomi' || !grant) {
        consumeHandoff(name);
        return;
      }
      try {
        if (EMBEDDED) assert(/^[a-f0-9]{32}$/.test(payload.id || ''), 'SAVED_SESSION_INVALID', 'xiaomi_bootstrap');
        else {
          const saved = savedSession('xiaomi', '', payload.id);
          assert(saved?.id === payload.id && saved.provider === 'xiaomi' && saved.expires > Date.now(),
            'SAVED_SESSION_EXPIRED', 'xiaomi_bootstrap');
        }
        const result = validateGrant(grant);
        installRequestBootstrap('xiaomi', XIAOMI_CHANNEL, result, name);
      } catch (error) {
        consumeHandoff(name);
        console.error('[统一登录器]', {stage: 'xiaomi_bootstrap', error: error.message});
      }
      return;
    }
    if (location.pathname === '/10/pc/bilibiliWD_index.php') {
      if (payload?.provider !== 'bilibili') { consumeHandoff(name); return; }
      try {
        const auth = validateBiliAuth(payload.bili);
        assert(auth.expires * 1000 > Date.now(), 'SAVED_SESSION_EXPIRED', 'bili_handoff');
        const result = validateBiliGrant(payload.grant);
        if (EMBEDDED) assert(/^[a-f0-9]{32}$/.test(payload.id || ''), 'SAVED_SESSION_INVALID', 'bili_handoff');
        else {
          const saved = savedSession('bilibili', '', payload.id);
          assert(saved?.id === payload.id && saved.provider === 'bilibili', 'SAVED_SESSION_EXPIRED', 'bili_handoff');
          assert(result.account === saved.account, 'ACCOUNT_MISMATCH', 'bili_handoff');
        }
        deliverBili(auth, result, payload.id, finishHandoff);
      } catch (error) {
        consumeHandoff(name);
        console.error('[统一登录器]', {stage: 'bili_handoff', error: error.message});
      }
      return;
    }
    if (payload?.provider === 'bilibili') {
      // Bilibili can redirect from bilibiliWD_index.php to the common 10/pc
      // entry after the official page has consumed its own routing.  Do not
      // throw away the verified grant merely because the path changed.
      if (!grant || !payload.bili) { consumeHandoff(name); return; }
      try {
        const auth = validateBiliAuth(payload.bili);
        assert(auth.expires * 1000 > Date.now(), 'SAVED_SESSION_EXPIRED', 'bili_handoff');
        const result = validateBiliGrant(payload.grant);
        if (EMBEDDED) assert(/^[a-f0-9]{32}$/.test(payload.id || ''), 'SAVED_SESSION_INVALID', 'bili_handoff');
        else {
          const saved = savedSession('bilibili', '', payload.id);
          assert(saved?.id === payload.id && saved.provider === 'bilibili', 'SAVED_SESSION_EXPIRED', 'bili_handoff');
          assert(result.account === saved.account, 'ACCOUNT_MISMATCH', 'bili_handoff');
        }
        deliverBili(auth, result, payload.id, finishHandoff);
      } catch (error) {
        consumeHandoff(name);
        console.error('[统一登录器]', {stage: 'bili_handoff', error: error.message});
      }
      return;
    }
    if (payload?.provider === 'steam') {
      try {
        if (EMBEDDED) assert(/^[a-f0-9]{32}$/.test(payload.id || ''), 'SAVED_SESSION_INVALID', 'steam_handoff');
        else {
          const saved = savedSession('steam', '', payload.id);
          assert(saved?.id === payload.id && saved.provider === 'steam', 'SAVED_SESSION_EXPIRED', 'steam_handoff');
        }
        const result = validateSteamGrant(grant);
        if (!EMBEDDED) {
          const saved = savedSession('steam', '', payload.id);
          assert(result.account === saved.account, 'ACCOUNT_MISMATCH', 'steam_handoff');
        }
        deliverSteam(result, payload.id, finishHandoff);
      } catch (error) {
        consumeHandoff(name);
        console.error('[统一登录器]', {stage: 'steam_handoff', error: error.message});
      }
      return;
    }
    if (['vivo', 'huawei', 'oppo', 'qq', 'wx'].includes(payload?.provider)) {
      try {
        const savedProvider = payload.provider;
        const provider = ['qq', 'wx'].includes(savedProvider) ? 'wegame' : savedProvider;
        const stage = provider + '_handoff';
        if (EMBEDDED) assert(/^[a-f0-9]{32}$/.test(payload.id || ''), 'SAVED_SESSION_INVALID', stage);
        else {
          const saved = savedSession(savedProvider, '', payload.id);
          assert(saved?.id === payload.id && saved.provider === savedProvider && saved.expires > Date.now(),
            'SAVED_SESSION_EXPIRED', stage);
        }
        const result = validateGrant(grant);
        const channel = GAME_ROUTES[savedProvider].channel;
        deliverPlatformGrant(provider, channel, result, payload.id, savedProvider, finishHandoff);
      } catch (error) {
        consumeHandoff(name);
        console.error('[统一登录器]', {stage: payload.provider + '_handoff', error: error.message});
      }
      return;
    }
    if (!grant) { consumeHandoff(name); return; }
    if (!EMBEDDED && ['vivo', 'huawei'].includes(payload?.provider)) {
      const saved = savedSession(payload.provider, '', payload.id);
      if (saved?.provider !== payload.provider || saved.id !== payload.id || saved.expires <= Date.now()) return;
    }
    try { grant = validateGrant(grant); } catch (_) { return; }
    const channel = GAME_ROUTES[payload?.provider]?.channel || WEGAME_CHANNEL;
    let request = {...grant, channel_id: channel};
    Object.defineProperty(page, 'channel_id', {configurable: true, get: () => channel, set: () => {}});
    Object.defineProperty(page, 'ReqObj', {
      configurable: true, get: () => request,
      set: value => { request = {...value, ...grant, channel_id: channel}; }
    });
    consumeHandoff(name);
    return;
  }

  function gameReadiness(game, fontGate, boundAt) {
    const state = loginReadiness(game, fontGate);
    if (!state.ready && game && Date.now() - boundAt >= 1500) {
      const configKnown = typeof game.parseConfiged === 'boolean';
      const preloadKnown = typeof game.preloaded === 'boolean';
      // A future build may replace these flags with a different ready signal.
      // Once the real game export has settled and neither old flag exists, let
      // the official callback decide instead of waiting forever on a dead flag.
      if (!configKnown && !preloadKnown && state.checkLoaded === null) {
        state.unknownContract = true;
        state.ready = true;
        state.reason = '';
      }
    }
    return state;
  }

  function installGameRequest(channel, grant, stage) {
    let request = {...grant, channel_id: channel};
    const channelDescriptor = Object.getOwnPropertyDescriptor(page, 'channel_id');
    if (!channelDescriptor || channelDescriptor.configurable) {
      Object.defineProperty(page, 'channel_id', {configurable: false, get: () => channel, set() {}});
    } else {
      assert(String(page.channel_id) === String(channel), 'PLATFORM_CHANNEL_MISMATCH', stage);
    }
    const requestDescriptor = Object.getOwnPropertyDescriptor(page, 'ReqObj');
    if (!requestDescriptor || requestDescriptor.configurable) {
      const existing = page.ReqObj && typeof page.ReqObj === 'object' && !Array.isArray(page.ReqObj)
        ? page.ReqObj : {};
      request = Object.assign(existing, grant, {channel_id: channel});
      Object.defineProperty(page, 'ReqObj', {
        configurable: false,
        get: () => request,
        set: incoming => {
          if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
            Object.assign(request, incoming, grant, {channel_id: channel});
          }
        }
      });
    } else if (page.ReqObj && typeof page.ReqObj === 'object' && !Array.isArray(page.ReqObj)) {
      request = Object.assign(page.ReqObj, grant, {channel_id: channel});
    } else if (requestDescriptor.writable || requestDescriptor.set) {
      page.ReqObj = request;
      request = page.ReqObj;
    }
    assert(String(request.channel_id) === String(channel), 'PLATFORM_CHANNEL_MISMATCH', stage);
    return () => request;
  }

  // One delivery state machine for every channel that exposes the official
  // GameMain.platformLoginBack bridge. It deliberately has no dependency on
  // observing EnterLoginScene once: the game may export late, may call the
  // entry before config/font completion, or may replace its exported class.
  function deliverGameGrant(provider, label, channel, grant, savedId, savedProvider, finishHandoff, options = {}) {
    const stage = provider + '_handoff';
    const expectedPaths = options.expectedPaths || [options.expectedPath || '/10/pc/index.php'];
    assert(expectedPaths.includes(location.pathname), 'PLATFORM_ROUTE_MISMATCH', stage);
    const routeChannels = new URLSearchParams(location.search).getAll('channel_id');
    assert(routeChannels.length <= 1 && routeChannels.every(value => value === String(channel)),
      'PLATFORM_CHANNEL_MISMATCH', stage);
    const getRequest = installGameRequest(channel, grant, stage);
    const hasCredential = () => {
      try {
        const self = page.AccountInfo?.Self;
        return !!(self && (self.Token || self.Ticket || self.WeGameTicket || self.PlatformID));
      } catch (_) { return false; }
    };
    let game = null, originalEntry = null, gate = null, fontGate = true, boundAt = 0;
    let complete = false, entryCalled = false, pendingEntry = false, platformCalled = false;
    let platformCalledAt = 0, platformCallActive = false, deliveryAttempts = 0;
    let exportInstalled = false, exported, candidateSeen = null;
    let logoutContext = null, logoutOriginal = null, logoutGate = null;
    const previous = Object.getOwnPropertyDescriptor(page, 'Sgs');
    const deadline = Date.now() + 120000;
    handoffToast(label + ' 登录已收到，正在等待游戏就绪…');
    const readiness = () => gameReadiness(game, fontGate, boundAt);
    const isReady = () => readiness().ready;
    const report = (available, reason) => {
      let snapshot = {};
      try { snapshot = readiness(); } catch (_) {}
      console[available ? 'info' : 'error']('[统一登录器]',
        {stage, available, source: 'Sgs.platformLoginBack', ...snapshot, ...(reason ? {reason} : {})});
      handoffToast(available ? label + ' 登录已交给游戏，正在进入…'
        : label + ' 登录交接失败：' + (reason || '游戏未就绪'), !available);
      emitGameAuth(provider, available, available ? {} : {code: String(reason || 'GAME_HANDOFF_FAILED').slice(0, 160)});
    };
    const current = (requireChannel = false) => {
      const saved = savedSession(savedProvider, '', savedId);
      if (saved) assert(saved.id === savedId && saved.provider === savedProvider && saved.expires > Date.now(),
        'SAVED_SESSION_EXPIRED', stage);
      else assert(EMBEDDED && /^[a-f0-9]{32}$/.test(savedId), 'SAVED_SESSION_INVALID', stage);
      if (requireChannel || page.ReqObj?.channel_id !== undefined) {
        assert(String(page.ReqObj?.channel_id) === String(channel), 'PLATFORM_CHANNEL_MISMATCH', stage);
      }
      options.validate?.();
      assert(Date.now() < deadline, 'PLATFORM_GAME_CALLBACK_UNAVAILABLE', stage);
    };
    const getExport = () => exported;
    const restoreExport = () => {
      if (!exportInstalled) return;
      exportInstalled = false;
      const descriptor = Object.getOwnPropertyDescriptor(page, 'Sgs');
      if (descriptor?.get !== getExport || descriptor?.set !== setExport) return;
      if (exported !== undefined) Object.defineProperty(page, 'Sgs',
        {value: exported, writable: true, enumerable: previous?.enumerable ?? true, configurable: true});
      else if (previous) Object.defineProperty(page, 'Sgs', previous);
      else delete page.Sgs;
    };
    const finish = (available, reason) => {
      if (complete) return;
      complete = true; clearInterval(timer);
      if (game?.EnterLoginScene === gate) game.EnterLoginScene = originalEntry;
      restoreLogoutGate();
      restoreExport();
      try { options.cleanup?.(); } catch (_) {}
      if (available) {
        report(true);
        try { finishHandoff(); } catch (_) {}
      } else if (reason) report(false, reason);
    };
    const enterOriginal = (context, args) => {
      // A callback that did not actually populate AccountInfo must never be
      // followed by the unauthenticated entry: that is the exact path which
      // calls GameContext.GotoLogout() and sends the tab back to /login/x/index.
      // In a real page AccountInfo is present; the empty-object allowance is
      // only for a deliberately minimal test harness.
      let hasAccountInfo = false;
      try { hasAccountInfo = !!page.AccountInfo; } catch (_) {}
      if (hasAccountInfo && !hasCredential()) {
        pendingEntry = true;
        return;
      }
      try {
        const result = originalEntry.apply(context, args);
        entryCalled = true; pendingEntry = false;
        finish(true);
        return result;
      } catch (error) {
        finish(false, error.message);
        throw error;
      }
    };
    const invokePlatform = () => {
      if (complete || platformCalled) return;
      current(true);
      assert(typeof game?.platformLoginBack === 'function',
        'PLATFORM_GAME_CALLBACK_UNAVAILABLE', stage);
      platformCalled = true; platformCalledAt = Date.now(); platformCallActive = true;
      deliveryAttempts += 1;
      try {
        callPlatformLoginBack(game, {code: 0, data: getRequest()});
      } catch (error) {
        platformCalled = false;
        throw error;
      } finally {
        platformCallActive = false;
      }
      pendingEntry = !entryCalled && !complete;
    };
    function restoreLogoutGate() {
      if (!logoutContext || logoutContext.GotoLogout !== logoutGate) return;
      try { logoutContext.GotoLogout = logoutOriginal; } catch (_) {}
      logoutContext = null; logoutOriginal = null; logoutGate = null;
    }
    // Some game revisions export Sgs after the resource loader has already
    // called EnterLoginScene.  The scene guard is a second, version-independent
    // place to stop that one unauthenticated redirect while this verified
    // handoff is still alive.  It never changes a successful login path and is
    // removed as soon as the grant has been handed to the official callback.
    const installLogoutGate = () => {
      if (complete) return;
      try {
        const context = page.GameContext;
        if (!context || typeof context.GotoLogout !== 'function') return;
        if (logoutGate && context.GotoLogout === logoutGate) return;
        if (context.GotoLogout.__sgsHandoffGuard) return;
        const original = context.GotoLogout;
        const guarded = function (...args) {
          if (complete) return original.apply(this, args);
          try { current(); } catch (_) { return original.apply(this, args); }
          if (hasCredential()) return original.apply(this, args);
          pendingEntry = true;
          try { if (isReady() && !platformCalled) invokePlatform(); } catch (_) {}
          return undefined;
        };
        guarded.__sgsHandoffGuard = true;
        logoutContext = context; logoutOriginal = original; logoutGate = guarded;
        try { context.GotoLogout = guarded; } catch (_) {
          try { Object.defineProperty(context, 'GotoLogout',
            {configurable: true, writable: true, value: guarded}); }
          catch (_) { restoreLogoutGate(); }
        }
      } catch (_) {}
    };
    const bind = candidate => {
      if (!candidate || typeof candidate.EnterLoginScene !== 'function' ||
        typeof candidate.platformLoginBack !== 'function') return false;
      if (candidate === game && gate && candidate.EnterLoginScene === gate) return true;
      if (game && game.EnterLoginScene === gate) game.EnterLoginScene = originalEntry;
      game = candidate; originalEntry = game.EnterLoginScene; boundAt = Date.now();
      installLogoutGate();
      platformCalled = false; platformCalledAt = 0; platformCallActive = false;
      entryCalled = false; pendingEntry = false;
      try { Object.defineProperty(game, '__sgsEntryContract', {configurable: true,
        value: Function.prototype.toString.call(originalEntry).slice(0, 4000)}); } catch (_) {}
      try {
        const entrySource = Function.prototype.toString.call(originalEntry);
        fontGate = !entrySource.includes('[native code]') && entrySource.includes('fontLoaded');
      } catch (_) { fontGate = true; }
      gate = function (...args) {
        if (complete) return originalEntry.apply(this, args);
        const explicitResult = args[0] === true;
        // Never let the unauthenticated entry run while a verified grant is
        // waiting. Older builds call EnterLoginScene(false), then notice that
        // AccountInfo is empty and immediately navigate to /login/x/index.
        // Deferring that draw is what makes the handoff timing-independent.
        if (!isReady()) { pendingEntry = true; return; }
        if (platformCalled) {
          if (entryCalled) return originalEntry.apply(this, args);
          // The official callback always uses EnterLoginScene(true), but a
          // future build may call it without the flag.  Once the official
          // platformLoginBack has populated AccountInfo, force the authenticated
          // form so WeGame/Steam never fall back into their native loginTicket
          // branch and so no unauthenticated entry can call GotoLogout.
          if (explicitResult || platformCallActive) return enterOriginal(this, [true]);
          pendingEntry = true;
          return;
        }
        try {
          invokePlatform();
          if (!entryCalled && !complete) pendingEntry = true;
          return;
        } catch (error) {
          finish(false, error.message);
          throw error;
        }
      };
      game.EnterLoginScene = gate;
      if (isReady()) {
        if (!platformCalled) invokePlatform();
        else if (!entryCalled) enterOriginal(game, [true]);
      }
      return true;
    };
    function setExport(value) {
      exported = value;
      if (value && value !== candidateSeen) {
        candidateSeen = value;
        bind(value);
      }
    }
    const timer = setInterval(() => {
      if (complete) return;
      try {
        installLogoutGate();
        current();
        const candidate = page.Sgs;
        if (candidate && (candidate !== game || candidate.EnterLoginScene !== gate)) {
          candidateSeen = candidate;
          bind(candidate);
        }
        if (platformCalled && !entryCalled && Date.now() - platformCalledAt >= 350 && isReady()) {
          enterOriginal(game, [true]);
          return;
        }
        if (!platformCalled && isReady()) invokePlatform();
      } catch (error) { finish(false, error.message); }
    }, 100);
    window.addEventListener('pagehide', () => {
      if (complete) return;
      complete = true; clearInterval(timer);
      if (game?.EnterLoginScene === gate) game.EnterLoginScene = originalEntry;
      restoreLogoutGate();
      restoreExport();
    }, {once: true});
    try {
      current();
      installLogoutGate();
      if (page.Sgs) bind(page.Sgs);
      else {
        assert(!previous || previous.configurable, 'PLATFORM_EXPORT_UNAVAILABLE', stage);
        exported = previous?.value; exportInstalled = true;
        Object.defineProperty(page, 'Sgs', {configurable: true, enumerable: true, get: getExport, set: setExport});
      }
    } catch (error) { finish(false, error.message); }
  }

  function deliverPlatformGrant(provider, channel, grant, savedId, savedProvider = provider, finishHandoff = () => {}) {
    const label = {vivo: 'Vivo', huawei: '华为', oppo: 'OPPO', wegame: 'WeGame'}[provider];
    assert(label, 'PROVIDER_UNAVAILABLE', provider + '_handoff');
    deliverGameGrant(provider, label, channel, grant, savedId, savedProvider, finishHandoff);
  }


  function validateSteamGrant(value) {
    const channel = String(value?.channel_id);
    assert(['120061', '320061'].includes(channel), 'STEAM_CHANNEL_MISMATCH', 'steam_grant');
    const grant = {...validateGrant(value), channel_id: channel};
    for (const key of ['channel_account', 'username', 'userAge', 'is_overseas']) {
      if (typeof value[key] === 'string' || typeof value[key] === 'number') {
        assert(String(value[key]).length <= 1024, 'RESPONSE_SCHEMA_CHANGED', 'steam_grant');
        grant[key] = value[key];
      }
    }
    return grant;
  }
  function deliverSteam(grant, savedId, finishHandoff = () => {}) {
    deliverGameGrant('steam', 'Steam', grant.channel_id, grant, savedId, 'steam', finishHandoff, {
      expectedPath: '/10/pc/index.php',
      validate: () => {
        const saved = savedSession('steam', '', savedId);
        if (saved) assert(saved.account === grant.account, 'ACCOUNT_MISMATCH', 'steam_handoff');
        assert(String(page.ReqObj?.channel_id) === String(grant.channel_id),
          'STEAM_CHANNEL_MISMATCH', 'steam_handoff');
      }
    });
  }


  function validateBiliAuth(value) {
    const auth = fields(value, ['uid', 'access_key'], 'bili_auth');
    assert(typeof value.uname === 'string' && value.uname.length <= 512,
      'BILI_AUTH_SCHEMA_CHANGED', 'bili_auth');
    const expires = Number(value.expires);
    assert(Number.isFinite(expires) && expires > 0 && expires < 1e11,
      'BILI_AUTH_SCHEMA_CHANGED', 'bili_auth');
    return {...auth, uname: value.uname, expires};
  }
  function validateBiliGrant(value) {
    assert(String(value?.channel_id) === '120133', 'BILI_CHANNEL_MISMATCH', 'bili_grant');
    const grant = {...validateGrant(value), channel_id: '120133'};
    if (value.channel_account !== undefined) grant.channel_account = fields(value, ['channel_account'], 'bili_grant').channel_account;
    return grant;
  }
  function handoffToast(text, error = false) {
    try {
      const id = 'sgs-direct-handoff-toast';
      let node = document.getElementById(id);
      if (!node) {
        node = document.createElement('div');
        node.id = id; node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite');
        node.style.cssText = 'position:fixed;right:18px;top:18px;z-index:2147483647;max-width:360px;' +
          'padding:12px 15px;border-radius:14px;font:13px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text",' +
          '"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#f5f5f7;background:rgba(28,28,30,.92);' +
          'border:1px solid rgba(255,255,255,.16);box-shadow:0 12px 36px rgba(0,0,0,.34);' +
          '-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);' +
          'transition:opacity 180ms ease,transform 180ms ease;transform:translateY(-4px)';
        (document.body || document.documentElement).append(node);
        requestAnimationFrame(() => { node.style.opacity = '1'; node.style.transform = 'translateY(0)'; });
        node.style.opacity = '0';
      }
      node.textContent = text;
      node.style.background = error ? 'rgba(255,69,58,.94)' : 'rgba(28,28,30,.92)';
      clearTimeout(node.__sgsHandoffTimer);
      node.__sgsHandoffTimer = setTimeout(() => {
        node.style.opacity = '0'; node.style.transform = 'translateY(-4px)';
        setTimeout(() => node.remove(), 220);
      }, error ? 15000 : 6500);
    } catch (_) {}
  }
  function deliverBili(auth, grant, savedId, finishHandoff = () => {}) {
    deliverGameGrant('bilibili', 'B 站', '120133', grant, savedId, 'bilibili', finishHandoff, {
      expectedPaths: ['/10/pc/bilibiliWD_index.php', '/10/pc/index.php'],
      validate: () => {
        assert(auth.expires * 1000 > Date.now(), 'SAVED_SESSION_EXPIRED', 'bili_handoff');
        const saved = savedSession('bilibili', '', savedId);
        if (saved) assert(saved.account === grant.account, 'ACCOUNT_MISMATCH', 'bili_handoff');
      },
      cleanup: () => { auth = null; }
    });
  }

  const random = () => crypto.randomUUID().replaceAll('-', '');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const queryURL = (base, params) => base + '?' + new URLSearchParams(params);
  function parseURL(raw, hosts, stage) {
    let u;
    try { u = new URL(raw); } catch (_) { throw failure('ENDPOINT_INVALID', stage); }
    assert(u.protocol === 'https:' && hosts.has(u.hostname) && !u.username && !u.password &&
      (!u.port || u.port === '443'), 'ENDPOINT_DENIED', stage);
    return u;
  }
  function isProxy(raw) {
    try {
      const u = new URL(raw);
      return u.origin === 'https://imgcache.qq.com' && !u.username && !u.password &&
        u.pathname === '/open/connect/widget/mobile/login/proxy.htm';
    } catch (_) { return false; }
  }
  function uniqueParams(raw, stage) {
    const result = Object.create(null);
    for (const [k, v] of new URLSearchParams(raw)) {
      assert(!Object.hasOwn(result, k), 'DUPLICATE_FIELD', stage);
      result[k] = v;
    }
    return result;
  }
  function decodeJS(value) {
    // Parse literal escapes, never execute Tencent's returned script.
    return value.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\\/'"])/g, (_, v) =>
      v[0] === 'x' || v[0] === 'u' ? String.fromCharCode(parseInt(v.slice(1), 16)) : v);
  }
  function hash33(value) {
    let hash = 0;
    for (const ch of value) hash = (Math.imul(hash, 33) + ch.charCodeAt(0)) | 0;
    return hash & 0x7fffffff;
  }

  // Local QR encoder adapted from src/qrcode.js; no CDN or QR upload service.
  // Preserve timing modules at (6,8)/(8,6) when reserving format information.
  const encodeBiliQR = (() => {
  const ECC_CODEWORDS_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
      28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
      26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
      28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
      30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  };
  const NUM_ERROR_CORRECTION_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
      8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
      17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
      23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
      25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  };
  const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  // 版本 v 的数据模块总位数（扣掉定位、校正、时序与格式/版本信息占位）。
  // 用公式而不是查表：这一段是纯几何，能算就不该抄。
  function rawDataModules(version) {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const numAlign = Math.floor(version / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }
  function dataCodewords(version, ecc) {
    return Math.floor(rawDataModules(version) / 8)
      - ECC_CODEWORDS_PER_BLOCK[ecc][version] * NUM_ERROR_CORRECTION_BLOCKS[ecc][version];
  }
  function alignmentPositions(version) {
    if (version === 1) return [];
    const numAlign = Math.floor(version / 7) + 2;
    const size = version * 4 + 17;
    const step = version === 32 ? 26
      : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  // ---- GF(256) 与 RS 纠错 ----
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function buildGaloisTables() {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
  }());
  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }
  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i += 1) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j += 1) {
        next[j] ^= gfMul(poly[j], 1);
        next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
      }
      poly = next;
    }
    return poly;
  }
  function rsRemainder(data, degree) {
    const generator = rsGeneratorPoly(degree);
    const result = new Array(degree).fill(0);
    for (const byte of data) {
      const factor = byte ^ result[0];
      result.shift();
      result.push(0);
      for (let i = 0; i < degree; i += 1) {
        result[i] ^= gfMul(generator[i + 1], factor);
      }
    }
    return result;
  }

  // ---- 位流 ----
  function toUtf8Bytes(text) {
    const out = [];
    for (const ch of String(text)) {
      const code = ch.codePointAt(0);
      if (code < 0x80) out.push(code);
      else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return out;
  }
  function charCountBits(version) {
    return version <= 9 ? 8 : 16;
  }

  function buildCodewords(bytes, version, ecc) {
    const bits = [];
    const push = (value, length) => {
      for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
    };
    push(0b0100, 4);                       // 字节模式
    push(bytes.length, charCountBits(version));
    for (const byte of bytes) push(byte, 8);

    const capacityBits = dataCodewords(version, ecc) * 8;
    push(0, Math.min(4, capacityBits - bits.length));   // 终止符
    while (bits.length % 8 !== 0) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
      data.push(byte);
    }
    // 填充字节交替 0xEC / 0x11，直到填满数据容量。
    for (let pad = 0xec; data.length < dataCodewords(version, ecc); pad ^= 0xec ^ 0x11) {
      data.push(pad);
    }

    // 分块、逐块算纠错、再按列交织。
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version];
    const eccLen = ECC_CODEWORDS_PER_BLOCK[ecc][version];
    const shortBlockLen = Math.floor(data.length / numBlocks);
    const numShortBlocks = numBlocks - (data.length % numBlocks);
    const blocks = [];
    for (let i = 0, offset = 0; i < numBlocks; i += 1) {
      const length = shortBlockLen + (i < numShortBlocks ? 0 : 1);
      const block = data.slice(offset, offset + length);
      offset += length;
      blocks.push({ data: block, ecc: rsRemainder(block, eccLen) });
    }
    const result = [];
    for (let i = 0; i < shortBlockLen + 1; i += 1) {
      for (let b = 0; b < numBlocks; b += 1) {
        if (i < blocks[b].data.length) result.push(blocks[b].data[i]);
      }
    }
    for (let i = 0; i < eccLen; i += 1) {
      for (let b = 0; b < numBlocks; b += 1) result.push(blocks[b].ecc[i]);
    }
    return result;
  }

  // ---- 矩阵 ----
  function createMatrix(version) {
    const size = version * 4 + 17;
    const modules = [];
    const reserved = [];
    for (let y = 0; y < size; y += 1) {
      modules.push(new Uint8Array(size));
      reserved.push(new Uint8Array(size));
    }
    return { size, modules, reserved };
  }
  function setFunction(m, x, y, dark) {
    if (x < 0 || y < 0 || x >= m.size || y >= m.size) return;
    m.modules[y][x] = dark ? 1 : 0;
    m.reserved[y][x] = 1;
  }
  function drawFinder(m, cx, cy) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(m, cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
  }
  function drawFunctionPatterns(m, version, ecc) {
    const { size } = m;
    for (let i = 0; i < size; i += 1) {
      setFunction(m, 6, i, i % 2 === 0);
      setFunction(m, i, 6, i % 2 === 0);
    }
    drawFinder(m, 3, 3);
    drawFinder(m, size - 4, 3);
    drawFinder(m, 3, size - 4);

    const positions = alignmentPositions(version);
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = 0; j < positions.length; j += 1) {
        // 三个定位图案的角落不放校正图案。
        if ((i === 0 && j === 0) || (i === 0 && j === positions.length - 1)
          || (i === positions.length - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            setFunction(m, positions[i] + dx, positions[j] + dy,
              Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }
    // 格式信息占位（掩模确定后再写真值）与固定的暗模块。
    for (let i = 0; i < 9; i += 1) {
      if (i === 6) continue;
      setFunction(m, i, 8, false);
      setFunction(m, 8, i, false);
    }
    for (let i = 0; i < 8; i += 1) {
      setFunction(m, size - 1 - i, 8, false);
      setFunction(m, 8, size - 1 - i, false);
    }
    setFunction(m, 8, size - 8, true);
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i += 1) {
        const bit = ((bits >>> i) & 1) === 1;
        setFunction(m, i % 3 + size - 8 - 3, Math.floor(i / 3), bit);
        setFunction(m, Math.floor(i / 3), i % 3 + size - 8 - 3, bit);
      }
    }
    void ecc;
  }
  function drawFormatBits(m, ecc, mask) {
    const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const { size } = m;
    for (let i = 0; i <= 5; i += 1) setFunction(m, 8, i, ((bits >>> i) & 1) === 1);
    setFunction(m, 8, 7, ((bits >>> 6) & 1) === 1);
    setFunction(m, 8, 8, ((bits >>> 7) & 1) === 1);
    setFunction(m, 7, 8, ((bits >>> 8) & 1) === 1);
    for (let i = 9; i < 15; i += 1) setFunction(m, 14 - i, 8, ((bits >>> i) & 1) === 1);
    for (let i = 0; i < 8; i += 1) {
      setFunction(m, size - 1 - i, 8, ((bits >>> i) & 1) === 1);
    }
    for (let i = 8; i < 15; i += 1) {
      setFunction(m, 8, size - 15 + i, ((bits >>> i) & 1) === 1);
    }
    setFunction(m, 8, size - 8, true);
  }
  function drawCodewords(m, codewords) {
    const { size } = m;
    let index = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (m.reserved[y][x]) continue;
          const bit = index < codewords.length * 8
            ? (codewords[index >>> 3] >>> (7 - (index & 7))) & 1 : 0;
          m.modules[y][x] = bit;
          index += 1;
        }
      }
    }
  }
  function maskCondition(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    }
  }
  function applyMask(m, mask) {
    for (let y = 0; y < m.size; y += 1) {
      for (let x = 0; x < m.size; x += 1) {
        if (m.reserved[y][x]) continue;
        if (maskCondition(mask, x, y)) m.modules[y][x] ^= 1;
      }
    }
  }
  function penaltyScore(m) {
    const { size, modules } = m;
    let score = 0;
    const runScore = run => (run >= 5 ? 3 + (run - 5) : 0);
    for (let y = 0; y < size; y += 1) {
      let run = 1;
      for (let x = 1; x < size; x += 1) {
        if (modules[y][x] === modules[y][x - 1]) run += 1;
        else { score += runScore(run); run = 1; }
      }
      score += runScore(run);
    }
    for (let x = 0; x < size; x += 1) {
      let run = 1;
      for (let y = 1; y < size; y += 1) {
        if (modules[y][x] === modules[y - 1][x]) run += 1;
        else { score += runScore(run); run = 1; }
      }
      score += runScore(run);
    }
    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const v = modules[y][x];
        if (v === modules[y][x + 1] && v === modules[y + 1][x] && v === modules[y + 1][x + 1]) {
          score += 3;
        }
      }
    }
    const pattern = [1, 0, 1, 1, 1, 0, 1];
    const matches = (get, i, length) => {
      if (i + 11 > length) return false;
      for (let k = 0; k < 7; k += 1) if (get(i + k) !== pattern[k]) return false;
      for (let k = 7; k < 11; k += 1) if (get(i + k) !== 0) return false;
      return true;
    };
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (matches(i => modules[y][i], x, size)) score += 40;
        if (matches(i => modules[i][x], y, size)) score += 40;
      }
    }
    let dark = 0;
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) dark += modules[y][x];
    const percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  }

  function chooseVersion(byteLength, ecc, minVersion) {
    for (let version = Math.max(1, minVersion || 1); version <= 40; version += 1) {
      const capacity = dataCodewords(version, ecc) * 8 - 4 - charCountBits(version);
      if (byteLength * 8 <= capacity) return version;
    }
    return 0;
  }

  // 编码入口：返回 { size, modules }，modules[y][x] 为 1 表示暗模块。
  function encodeQr(text, { ecc = 'H', minVersion = 1 } = {}) {
    const level = ECC_CODEWORDS_PER_BLOCK[ecc] ? ecc : 'H';
    const bytes = toUtf8Bytes(text);
    const version = chooseVersion(bytes.length, level, minVersion);
    if (!version) return null;
    const codewords = buildCodewords(bytes, version, level);
    const matrix = createMatrix(version);
    drawFunctionPatterns(matrix, version, level);
    drawCodewords(matrix, codewords);

    let best = null;
    for (let mask = 0; mask < 8; mask += 1) {
      const trial = createMatrix(version);
      drawFunctionPatterns(trial, version, level);
      drawCodewords(trial, codewords);
      applyMask(trial, mask);
      drawFormatBits(trial, level, mask);
      const score = penaltyScore(trial);
      if (!best || score < best.score) best = { score, matrix: trial, mask };
    }
    return { size: best.matrix.size, modules: best.matrix.modules, version, mask: best.mask };
  }
    return encodeQr;
  })();

  // Capture this attempt's cookies from response headers and pin them on later
  // requests. Never read the user's unrelated browser cookies or use GM_cookie.
  class Cookies {
    constructor() { this.items = new Map(); }
    read(headers, rawURL) {
      const url = new URL(rawURL);
      for (const match of headers.matchAll(/^set-cookie:\s*([^\r\n]+)/gim)) {
        // Some transports combine header lines. Expires contains a comma too.
        for (const line of match[1].split(/,(?=\s*[^;,\s=]+=)/)) {
          const [first, ...attributes] = line.split(';');
          const equal = first.indexOf('=');
          if (equal < 1) continue;
          const name = first.slice(0, equal).trim(), value = first.slice(equal + 1).trim();
          if (!/^[\w!#$%&'*+.^`|~-]+$/.test(name) || /[\r\n;]/.test(value)) continue;
          const attr = Object.create(null);
          for (const part of attributes) {
            const i = part.indexOf('=');
            attr[(i < 0 ? part : part.slice(0, i)).trim().toLowerCase()] = i < 0 ? '' : part.slice(i + 1).trim();
          }
          const domain = (attr.domain || url.hostname).replace(/^\./, '').toLowerCase();
          if (url.hostname !== domain && !url.hostname.endsWith('.' + domain)) continue;
          if (!domain.includes('.')) continue;
          const path = attr.path?.startsWith('/') ? attr.path : url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1) || '/';
          const key = domain + '\n' + path + '\n' + name;
          if (attr['max-age'] === '0' || (attr.expires && Date.parse(attr.expires) < Date.now())) {
            this.items.delete(key); continue;
          }
          this.items.set(key, {name, value, domain, path, hostOnly: !attr.domain});
        }
      }
    }
    forURL(rawURL) {
      const u = new URL(rawURL);
      return [...this.items.values()].filter(c =>
        (u.hostname === c.domain || (!c.hostOnly && u.hostname.endsWith('.' + c.domain))) &&
        (u.pathname === c.path || (u.pathname.startsWith(c.path) &&
          (c.path.endsWith('/') || u.pathname[c.path.length] === '/'))));
    }
    header(url) { return this.forURL(url).map(c => c.name + '=' + c.value).join('; '); }
    qrsig() {
      const values = this.forURL('https://ssl.ptlogin2.qq.com/ptqrlogin').filter(c => c.name === 'qrsig');
      assert(values.length === 1 && values[0].value, 'QQ_QRSIG_UNAVAILABLE', 'qq_qr');
      return values[0].value;
    }
    clear() { this.items.clear(); }
  }

  const diagnostics = [];
  let attempt = null, busy = false, disposed = false;
  let middle = null, ui = null, releaseLock = null, lockOwnerToken = '';
  let runGeneration = 0, activeRunGeneration = 0;
  let microError = null; // 微端桥用：最近一次失败的 {code, stage}，start／cancel 时清空
  function record(stage, started, status, code) {
    const entry = {version: VERSION, stage, ms: Math.round(performance.now() - started), status, ...(code ? {code} : {})};
    diagnostics.push(entry);
    if (diagnostics.length > 80) diagnostics.shift();
    console.info('[统一登录器]', JSON.stringify(entry)); // No bodies, query strings, cookies or credentials.
  }
  function active(a) {
    assert(!disposed && attempt === a && Date.now() < a.expires, 'ATTEMPT_EXPIRED', a.stage);
    if (a.restored) assert(sessionForAttempt(a)?.id === a.savedId, 'SAVED_SESSION_EXPIRED', a.stage);
  }
  function normalizeClientToken(value) {
    const token = typeof value === 'string' ? value : '';
    assert(/^[a-f0-9]{16,64}$/.test(token), 'CLIENT_TOKEN_INVALID', 'setup');
    return token;
  }
  function emitDirectEvent(event) {
    const token = event?.clientToken || attempt?.clientToken || boundClientToken || '';
    try { return page.__SGS_DIRECT_EVENT__({...event, clientToken: token}); } catch (_) { return ''; }
  }
  function setBrowserNotice(a, text) {
    if (!a || !text || a.browserNotice === text) return;
    if (attempt && attempt !== a) return;
    a.browserNotice = text;
    if (ui?.output && ui.output.textContent !== text) ui.output.textContent = text;
  }
  function transport(a, url, options = {}) {
    active(a);
    const stage = options.stage || a.stage;
    const hosts = options.qq ? QQ_HOSTS : options.wx ? WX_HOSTS : options.oppo ? OPPO_HOSTS :
      options.vivo ? VIVO_HOSTS : API_HOSTS;
    const timeout = options.timeout || 20000;
    parseURL(url, hosts, stage);
    const started = performance.now();
    return new Promise((resolve, reject) => {
      let settled = false, handle;
      const finish = (error, response) => {
        if (settled) return;
        settled = true; clearTimeout(timer); a.requests.delete(cancel);
        record(stage, started, response?.status || 0, error?.message);
        if (error) reject(error); else resolve(response);
      };
      const cancel = () => { finish(failure('REQUEST_CANCELLED', stage)); handle?.abort(); };
      const timer = setTimeout(() => { finish(failure('REQUEST_TIMEOUT', stage)); handle?.abort(); }, timeout);
      a.requests.add(cancel);
      const received = response => {
        if (settled) return;
        try {
          active(a);
          const finalURL = response.finalUrl || url;
          if (!(options.qq && isProxy(finalURL))) parseURL(finalURL, hosts, stage);
          assert(response.status >= 200 && response.status < 300, 'HTTP_' + response.status, stage);
          const length = options.binary ? response.response?.byteLength : response.responseText?.length;
          assert(Number.isFinite(length) && length <= (options.limit || 1048576), 'RESPONSE_TOO_LARGE', stage);
          if (options.qq || options.oppo || options.wx) a.cookies.read(response.responseHeaders || '', finalURL);
          finish(null, response);
        } catch (error) { finish(error, response); return; }
      };
      try {
        handle = GM_xmlhttpRequest({
          method: options.body === undefined ? 'GET' : 'POST', url,
          // Do not set anonymous/redirect/fetch: they force fetch mode in Chrome
          // and can hide Set-Cookie. Native XHR follows the official HTTPS chain.
          timeout, nocache: true,
          ...(options.form && !options.vivo && !options.bili ? {anonymous: true} : {}),
          ...(options.vivo ? {anonymous: false} : {}),
          ...(options.binary ? {responseType: 'arraybuffer'} : {}),
          ...(options.qq || options.oppo || options.wx ? {cookie: a.cookies.header(url)} : {}),
          headers: options.qq ? {'User-Agent': UA, 'Accept': '*/*',
            ...(a.loginURL ? {Referer: a.loginURL} : {})} : options.wx ?
            {'User-Agent': WX_UA, 'Accept': '*/*', ...(a.wxReferer ? {Referer: a.wxReferer} : {})} : options.oppo ? options.headers :
            {'Accept': 'application/json',
              'Content-Type': options.form ? 'application/x-www-form-urlencoded' : 'application/json',
              ...(options.headers || {})},
          data: options.body === undefined ? undefined : options.form ? new URLSearchParams(options.body).toString() : JSON.stringify(options.body),
          onload: received,
          onerror: r => { const e = failure('NETWORK_ERROR', stage); finish(e, r); },
          ontimeout: r => { const e = failure('REQUEST_TIMEOUT', stage); finish(e, r); },
          onabort: r => { const e = failure('REQUEST_CANCELLED', stage); finish(e, r); }
        });
      } catch (cause) {
        const error = failure('GM_REQUEST_UNAVAILABLE', stage);
        finish(error);
      }
    });
  }
  async function json(a, stage, url, body) {
    a.stage = stage;
    const response = await transport(a, url, {body, stage, limit: 131072});
    let value;
    try { value = JSON.parse(response.responseText); } catch (_) { throw failure('INVALID_JSON', stage); }
    assert(value && typeof value === 'object' && !Array.isArray(value), 'RESPONSE_SCHEMA_CHANGED', stage);
    return value;
  }
  function success(value, stage) {
    assert(value.code === 0, 'OFFICIAL_REJECTED_' + (Number.isInteger(value.code) ? value.code : 'UNKNOWN'), stage);
    return value;
  }
  async function qqText(a, url) {
    return (await transport(a, url, {qq: true})).responseText;
  }
  function callback(a, raw) {
    const u = new URL(raw);
    assert(u.protocol === 'auth:' && u.host === 'tauth.qq.com' && u.pathname === '/' &&
      !u.username && !u.password, 'QQ_CALLBACK_TARGET_MISMATCH', 'qq_callback');
    let values = uniqueParams((u.hash || u.search).slice(1), 'qq_callback');
    if (values.response) {
      try { values = JSON.parse(values.response); } catch (_) { throw failure('QQ_CALLBACK_INVALID', 'qq_callback'); }
    }
    assert(values?.state === a.state && !values.error && String(values.ret || '0') === '0',
      'QQ_CALLBACK_STATE_MISMATCH', 'qq_callback');
    return fields(values, ['openid', 'access_token'], 'qq_callback');
  }
  async function proxy(a, raw) {
    assert(isProxy(raw), 'QQ_PROXY_INVALID', 'qq_callback');
    const u = new URL(raw);
    const values = uniqueParams([u.search.slice(1), u.hash.slice(1)].filter(Boolean).join('&'), 'qq_callback');
    assert(values.appid === QQ_APP, 'QQ_APPLICATION_MISMATCH', 'qq_callback');
    if (/^[a-f0-9]{32}$/i.test(values.openid || '') && /^[a-f0-9]{32}$/i.test(values.access_token || '')) {
      return {openid: values.openid, access_token: values.access_token};
    }
    assert(values.redirect_uri_key && values.redirect_uri_key.length <= 8192, 'QQ_PROXY_KEY_MISSING', 'qq_callback');
    const text = await qqText(a, queryURL('https://openmobile.qq.com/oauth2.0/m_get_redirect_url', {keystr: values.redirect_uri_key}));
    const match = /^\s*_Callback\((.*)\);?\s*$/s.exec(text);
    assert(match, 'QQ_PROXY_RESPONSE_CHANGED', 'qq_callback');
    let value;
    try { value = JSON.parse(match[1]); } catch (_) { throw failure('QQ_PROXY_INVALID_JSON', 'qq_callback'); }
    assert(String(value.ret) === '0' && typeof value.url === 'string', 'QQ_PROXY_REJECTED', 'qq_callback');
    return callback(a, value.url);
  }
  async function redeem(a) {
    a.stage = 'qq_callback';
    if (isProxy(a.redirect)) return proxy(a, a.redirect);
    const response = await transport(a, a.redirect, {qq: true});
    if (isProxy(response.finalUrl)) return proxy(a, response.finalUrl);
    const match = /(?:location(?:\.href)?|location\.replace)\s*(?:=|\()\s*['"](auth:\/\/tauth\.qq\.com\/[^'"\s<>]+)['"]/.exec(response.responseText);
    assert(match, 'QQ_AUTH_CALLBACK_NOT_RETURNED', 'qq_callback');
    return callback(a, decodeJS(match[1]));
  }
  async function prepare(a) {
    a.stage = 'qq_authorize';
    const auth = await qqText(a, queryURL('https://openmobile.qq.com/oauth2.0/m_authorize', {
      client_id: QQ_APP, scope: 'get_simple_userinfo', response_type: 'token', redirect_uri: 'auth://tauth.qq.com/',
      display: 'mobile', style: 'qr', pf: 'openmobile_android', isadd: '1', cancel_display: '1',
      switch: '1', compat_v: '1', state: a.state
    }));
    const match = /var\s+src\s*=\s*"([^"\n]+)"/.exec(auth);
    assert(match, 'QQ_AUTH_PAGE_CHANGED', a.stage);
    a.loginURL = decodeJS(match[1]);
    const u = parseURL(a.loginURL, QQ_HOSTS, a.stage);
    a.query = uniqueParams(u.search.slice(1), a.stage);
    assert(u.hostname === 'xui.ptlogin2.qq.com' && u.pathname === '/cgi-bin/xlogin' &&
      a.query.pt_3rd_aid === QQ_APP && a.query.state === a.state && a.query.force_qr === '1', 'QQ_APPLICATION_MISMATCH', a.stage);
    a.stage = 'qq_login_page';
    const html = await qqText(a, a.loginURL);
    assert(html.includes('id="qrimg"'), 'QQ_QR_CAPABILITY_UNAVAILABLE', a.stage);
    a.version = /ptui_version\s*=\s*encodeURIComponent\("([0-9]+)"\)/.exec(html)?.[1] || '';
    a.stage = 'qq_qr';
    const image = await transport(a, queryURL('https://ssl.ptlogin2.qq.com/ptqrshow', {
      s: '8', e: '0', appid: a.query.appid, type: '0', t: Math.random().toString(),
      u1: a.query.s_url, daid: a.query.daid, pt_3rd_aid: QQ_APP
    }), {qq: true, binary: true, limit: 262144});
    const bytes = new Uint8Array(image.response);
    assert(bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v) &&
      String.fromCharCode(...bytes.slice(12,16)) === 'IHDR', 'QQ_QR_IMAGE_INVALID', a.stage);
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert([size.getUint32(16), size.getUint32(20)].every(v => v >= 32 && v <= 2048), 'QQ_QR_IMAGE_INVALID', a.stage);
    a.qrsig = a.cookies.qrsig(); // Fail before asking for a scan if browser hides it.
    a.image = URL.createObjectURL(new Blob([bytes], {type: 'image/png'}));
    ui.screen.alt = 'QQ'; ui.screen.src = a.image; ui.screen.hidden = false;
    a.stage = 'waiting_scan';
  }
  async function waitForQQ(a) {
    while (!a.redirect) {
      active(a);
      a.stage = 'qq_poll';
      const text = await qqText(a, queryURL('https://ssl.ptlogin2.qq.com/ptqrlogin', {
        u1: a.query.s_url, from_ui: '1', type: '1', ptlang: '2052', ptqrtoken: String(hash33(a.qrsig)),
        daid: a.query.daid, aid: a.query.appid, pt_3rd_aid: QQ_APP,
        pt_openlogin_data: new URL(a.loginURL).search.slice(1) + '&pt_flex=1', device: '2', ptopt: '1',
        pt_uistyle: a.query.style, jsver: a.version, r: Math.random().toString()
      }));
      const match = /^\s*ptuiCB\((.*)\);?\s*$/s.exec(text);
      assert(match, 'QQ_POLL_RESPONSE_CHANGED', a.stage);
      const args = [...match[1].matchAll(/'((?:\\.|[^'\\])*)'/g)].map(m => decodeJS(m[1]));
      assert(args.length >= 5 && /^\d+$/.test(args[0]), 'QQ_POLL_SCHEMA_CHANGED', a.stage);
      const code = Number(args[0]);
      if (code === 0) { a.redirect = args[2]; a.expires = Date.now() + 600000; return; }
      assert(code === 66 || code === 67, code === 65 ? 'QQ_QR_EXPIRED' : 'QQ_REJECTED_' + code, a.stage);
      a.stage = code === 67 ? 'waiting_confirmation' : 'waiting_scan';
      await sleep(3100);
    }
  }
  // Tencent app QR page verified 2026-09-21 with the APK's AppID/package.
  // Official padauth.js SHA-256: 291a1a27006e98f4290635efa323679d5bd229e03b2e2246ee979de5c80fddbc.
  // QR issuance/polling verified; complete browser authorization needs runtime QA.
  function wxCallback(a, raw) {
    let u;
    try { u = new URL(raw); } catch (_) { throw failure('WX_CALLBACK_INVALID', 'wx_callback'); }
    assert(u.protocol === WX_APP + ':' && u.hostname === 'oauth' && !u.username && !u.password &&
      !u.port && !u.hash && (u.pathname === '' || u.pathname === '/'), 'WX_APPLICATION_MISMATCH', 'wx_callback');
    const p = uniqueParams(u.search.slice(1), 'wx_callback');
    assert(p.state === a.state, 'WX_STATE_MISMATCH', 'wx_callback');
    assert(typeof p.code === 'string' && /^[A-Za-z0-9_-]{8,256}$/.test(p.code), 'WX_CODE_MISSING', 'wx_callback');
    return p.code;
  }
  function wxPollResult(text) {
    // Strict assignment parser: no eval, remote script execution or arbitrary redirects.
    const p = Object.create(null);
    const assignment = /\s*window\.(wx_errcode|wx_redirecturl|wx_nickname)\s*=\s*(\d+|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\s*;\s*/y;
    let offset = 0;
    while (offset < text.length) {
      if (!text.slice(offset).trim()) break;
      assignment.lastIndex = offset;
      const m = assignment.exec(text);
      assert(m && !Object.hasOwn(p, m[1]), 'WX_POLL_RESPONSE_CHANGED', 'wx_poll');
      p[m[1]] = m[1] === 'wx_errcode' ? Number(m[2]) : decodeJS(m[2].slice(1, -1));
      offset = assignment.lastIndex;
    }
    assert(Number.isInteger(p.wx_errcode), 'WX_POLL_RESPONSE_CHANGED', 'wx_poll');
    return p;
  }
  async function prepareWX(a) {
    a.stage = 'wx_authorize';
    a.wxReferer = 'https://open.weixin.qq.com/';
    const r = await transport(a, queryURL('https://open.weixin.qq.com/connect/app/qrconnect', {
      appid: WX_APP, bundleid: 'com.tencent.yoka.newsgs', scope: 'snsapi_userinfo', state: a.state
    }), {wx: true});
    const html = r.responseText;
    const uuid = /\buuid:\s*"([A-Za-z0-9_-]{8,128})"/.exec(html)?.[1];
    assert(uuid && /\bappid:\s*"wxba26a260a325b6f8"/.test(html) &&
      html.includes('https://open.weixin.qq.com/connect/qrcode/' + uuid), 'WX_QR_CAPABILITY_UNAVAILABLE', a.stage);
    a.stage = 'wx_qr';
    const image = await transport(a, 'https://open.weixin.qq.com/connect/qrcode/' + uuid,
      {wx: true, binary: true, limit: 262144});
    const bytes = new Uint8Array(image.response);
    // Unlike QQ's PNG, the observed official WeChat endpoint returns JPEG.
    const png = bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v) &&
      String.fromCharCode(...bytes.slice(12,16)) === 'IHDR';
    const jpeg = bytes.length >= 16 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 &&
      bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
    assert(png || jpeg, 'WX_QR_IMAGE_INVALID', a.stage);
    a.wxUUID = uuid;
    a.image = URL.createObjectURL(new Blob([bytes], {type: png ? 'image/png' : 'image/jpeg'}));
    ui.screen.alt = '以微信登录 WeGame'; ui.screen.src = a.image; ui.screen.hidden = false;
    setBrowserNotice(a, '请使用微信扫描二维码');
    a.stage = 'waiting_scan';
  }
  async function waitForWX(a) {
    while (!a.wxCode) {
      active(a); a.stage = 'wx_poll';
      let r;
      try {
        r = await transport(a, queryURL('https://long.open.weixin.qq.com/connect/l/qrconnect', {
          uuid: a.wxUUID, f: 'url', _: String(Date.now())
        }), {wx: true, timeout: 65000, limit: 32768});
      } catch (error) {
        if (!['REQUEST_TIMEOUT', 'NETWORK_ERROR'].includes(error.message)) throw error;
        active(a); await sleep(2000); continue;
      }
      const p = wxPollResult(r.responseText), code = p.wx_errcode;
      if (code === 405) {
        setBrowserNotice(a, '微信已确认，正在兑换 WeGame 登录票据…');
        a.wxCode = wxCallback(a, p.wx_redirecturl);
        a.expires = Date.now() + 600000;
        a.cookies.clear(); a.wxUUID = ''; a.wxReferer = '';
        hideQR(a); return;
      }
      assert(code === 404 || code === 408, code === 402 ? 'WX_QR_EXPIRED' : 'WX_REJECTED_' + code, a.stage);
      a.stage = code === 404 ? 'waiting_confirmation' : 'waiting_scan';
      setBrowserNotice(a, code === 404 ? '已扫码，请在手机微信中确认登录' : '请使用微信扫描二维码');
      await sleep(code === 404 ? 1000 : 2000);
    }
  }
  function md5(text) {
    const bytes = new TextEncoder().encode(text);
    const length = Math.ceil((bytes.length + 9) / 64) * 64;
    const buffer = new Uint8Array(length); buffer.set(bytes); buffer[bytes.length] = 128;
    const view = new DataView(buffer.buffer);
    view.setUint32(length - 8, (bytes.length * 8) >>> 0, true);
    view.setUint32(length - 4, Math.floor(bytes.length / 0x20000000), true);
    const shift = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476;
    for (let offset = 0; offset < length; offset += 64) {
      let a = h0, b = h1, c = h2, d = h3;
      for (let i = 0; i < 64; i++) {
        const round = i >>> 4;
        const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) :
          round === 2 ? b ^ c ^ d : c ^ (b | ~d);
        const index = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
        const k = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
        const sum = (a + f + k + view.getUint32(offset + index * 4, true)) | 0;
        const n = shift[round][i % 4];
        const next = (b + ((sum << n) | (sum >>> (32 - n)))) | 0;
        a = d; d = c; c = b; b = next;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    }
    return [h0, h1, h2, h3].map(n => [0, 8, 16, 24].map(s =>
      ((n >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
  }
  // Source: Steam Community CLSTAMP 11009756, login chunk
  // 45f3a40d35b495ce0fbb (2026-09-21). QR -> poll -> jwt/finalizelogin ->
  // community transfer -> application OAuth. Browser JWTs are never SGS tokens.
  // SGS source: vivo 1.0.343, SteamLoginManager / SteamWebviewLoginDlg.
  function steamOAuthURL(state) {
    return queryURL('https://steamcommunity.com/oauth/login',
      {mobileminimal: '1', response_type: 'token', client_id: STEAM_APP, state});
  }
  function responseHeader(headers, name) {
    return String(headers || '').split(/\r?\n/).find(line => line.toLowerCase().startsWith(name.toLowerCase() + ':'))?.slice(name.length + 1).trim() || '';
  }
  // Official QRC component at account.xiaomi.com, checked 2026-09-29.
  // OAuth binding: WebLogin in com.yoka.sgstenth.mi 1.0.343. The registered
  // HTTP callback is metadata only; redirects are validated before requesting.
  function xiaomiURL(raw, stage = 'xiaomi_qr') {
    let u;
    try { u = new URL(raw); } catch (_) { throw failure('ENDPOINT_DENIED', stage); }
    // Regional account / long-poll hosts are selected by the official service.
    // Accept that namespace without hard-coding Singapore or an IP location.
    assert(/^(?:(?:[a-z0-9-]+\.)?(?:lp\.)?)?account\.xiaomi\.com$/.test(u.hostname) ||
      u.hostname === 'account.migc.g.mi.com', 'ENDPOINT_DENIED', stage);
    return parseURL(raw, new Set([u.hostname]), stage);
  }
  function xiaomiRequest(a, raw, image = false, options = {}) {
    return isolatedRequest(a, xiaomiURL(raw, options.stage || 'xiaomi_qr').href, image, options);
  }
  function isolatedRequest(a, url, image = false, options = {}) {
    active(a);
    const stage = options.stage || 'xiaomi_qr';
    a.stage = stage;
    const started = performance.now();
    return new Promise((resolve, reject) => {
      let done = false, handle;
      const finish = (error, result) => {
        if (done) return;
        done = true; a.requests.delete(cancel);
        record(stage, started, result?.status || 0, error?.message);
        if (error) reject(error); else resolve(result);
      };
      const cancel = () => { finish(failure('REQUEST_CANCELLED', stage)); handle?.abort(); };
      a.requests.add(cancel);
      try {
        // The initiating flow owns its cookies. Browser account cookies can
        // otherwise skip QR confirmation and redirect straight to OAuth.
        handle = GM_xmlhttpRequest({method: options.body === undefined ? 'GET' : 'POST', url, redirect: 'manual', anonymous: true,
          timeout: Math.min(options.timeout || 20000, Math.max(1, a.expires - Date.now())), nocache: true,
          responseType: image ? 'arraybuffer' : 'text', cookie: a.cookies.header(url),
          headers: {Accept: image ? 'image/png' : '*/*', 'Content-Type': options.json ? 'application/json' : 'application/x-www-form-urlencoded', ...options.headers},
          data: options.body === undefined ? undefined : options.raw ? options.body :
            options.json ? JSON.stringify(options.body) : new URLSearchParams(options.body).toString(),
          onload: r => {
            if (done) return;
            try {
              active(a);
              assert((r.finalUrl || url) === url, 'REDIRECT_TRANSPORT_UNAVAILABLE', stage);
              assert(r.status >= 200 && r.status < 400, 'HTTP_' + r.status, stage);
              if (image) {
                const bytes = new Uint8Array(r.response || []);
                assert(r.status === 200 && bytes.length > 8 && bytes.length <= 262144 &&
                  [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v),
                  'QR_IMAGE_INVALID', stage);
              } else {
                if (r.status >= 300 && r.responseText == null) r.responseText = '';
                assert(typeof r.responseText === 'string' && r.responseText.length <= 524288,
                  'RESPONSE_TOO_LARGE', stage);
              }
              a.cookies.read(r.responseHeaders || '', url);
              finish(null, r);
            } catch (error) { finish(error, r); }
          },
          onerror: r => { const e = failure('NETWORK_ERROR', stage); finish(e, r); },
          ontimeout: r => { const e = failure('REQUEST_TIMEOUT', stage); finish(e, r); },
          onabort: r => { const e = failure('REQUEST_CANCELLED', stage); finish(e, r); }
        });
      } catch (cause) {
        const error = failure('GM_REQUEST_UNAVAILABLE', stage);
        finish(error);
      }
    });
  }
  function xiaomiChallenge(value) {
    const stage = 'xiaomi_qr';
    success(value, stage);
    const qr = parseURL(value.qr, new Set(['account.xiaomi.com']), stage);
    const link = xiaomiURL(value.loginUrl, stage);
    const poll = xiaomiURL(value.lp, stage);
    assert(qr.pathname === '/pass/qr/login' && link.pathname === '/longPolling/login' &&
      /^(?:[a-z0-9-]+\.)?account\.xiaomi\.com$/.test(link.hostname) &&
      /^(?:[a-z0-9-]+\.)?lp\.account\.xiaomi\.com$/.test(poll.hostname) &&
      poll.pathname === '/lp/s' && !qr.hash && !link.hash && !poll.hash, 'QR_TARGET_MISMATCH', stage);
    const q = uniqueParams(qr.search.slice(1), stage), l = uniqueParams(link.search.slice(1), stage);
    for (const key of ['ticket', 'dc', 'sid', 'ts']) {
      assert(typeof q[key] === 'string' && q[key].length > 0 && q[key].length <= 4096 &&
        q[key] === l[key], 'QR_TICKET_MISMATCH', stage);
    }
    assert(l.sid === 'oauth2.0', 'APPLICATION_MISMATCH', stage);
    const timeout = Number(value.timeout);
    assert(Number.isFinite(timeout) && timeout > 0 && timeout <= 300, 'QR_EXPIRY_INVALID', stage);
    const p = uniqueParams(poll.search.slice(1), stage);
    assert(p.k && p.k.length <= 4096, 'QR_TICKET_MISMATCH', stage);
    return {qr: qr.href, link: link.href, poll: poll.href, expires: Date.now() + timeout * 1000};
  }
  async function prepareXiaomi(a) {
    let url = queryURL('https://account.xiaomi.com/oauth2/authorize', {
      client_id: XIAOMI_OAUTH_APP, response_type: 'code', scope: '1 3',
      redirect_uri: XIAOMI_CALLBACK, state: a.state, _locale: 'zh_CN'
    });
    let login;
    for (let i = 0; i < 10; i++) {
      const r = await xiaomiRequest(a, url);
      if (r.status < 300) { login = new URL(url); break; }
      const next = responseHeader(r.responseHeaders, 'location');
      assert(next, 'REDIRECT_LOCATION_MISSING', 'xiaomi_qr');
      url = xiaomiURL(new URL(next, url).href).href;
    }
    assert(login && login.hostname === 'account.xiaomi.com' &&
      ['/fe/service/login', '/pass/serviceLogin'].includes(login.pathname), 'LOGIN_TARGET_MISMATCH', 'xiaomi_qr');
    const params = uniqueParams(login.search.slice(1), 'xiaomi_qr');
    assert(params.client_id === XIAOMI_OAUTH_APP && params.sid === 'oauth2.0', 'APPLICATION_MISMATCH', 'xiaomi_qr');
    // loginUrl already returns JSON. Passing _json=true is retained in the
    // ticket's confirmation flow and makes a normal browser display raw JSON.
    delete params._; delete params._json; params._dc = String(Date.now());
    const r = await xiaomiRequest(a, queryURL('https://account.xiaomi.com/longPolling/loginUrl', params));
    let value;
    try { value = JSON.parse(r.responseText.replace(/^(?:&&&START&&&|@json:)/, '')); }
    catch (_) { throw failure('INVALID_JSON', 'xiaomi_qr'); }
    const challenge = xiaomiChallenge(value);
    const image = await xiaomiRequest(a, challenge.qr, true);
    active(a); hideQR(a);
    a.expires = Math.min(a.expires, challenge.expires);
    a.xiaomiChallenge = challenge;
    a.image = URL.createObjectURL(new Blob([image.response], {type: 'image/png'}));
    ui.screen.alt = '小米扫码登录'; ui.screen.src = a.image; ui.screen.hidden = false;
    ui.oppoLink.href = challenge.link; ui.oppoLink.textContent = challenge.link; ui.oppoLink.hidden = false;
    // Keep the initiating cookie jar and poll ticket together in memory until
    // confirmation. A second tab authorizes this ticket, not its own game tab.
  }
  function xiaomiJSON(text, stage) {
    let value;
    try {
      // Preserve native Java long IDs before JSON.parse can round them.
      const raw = text.replace(/^(?:&&&START&&&|@json:)/, '')
        .replace(/(?<!\\)("(?:uuid|appAccountId)"\s*:\s*)(\d+)(?=\s*[,}])/g, '$1"$2"');
      value = JSON.parse(raw);
    } catch (_) { throw failure('INVALID_JSON', stage); }
    assert(value && typeof value === 'object' && !Array.isArray(value), 'RESPONSE_SCHEMA_CHANGED', stage);
    return value;
  }
  function xiaomiCallback(a, raw) {
    let u;
    try { u = new URL(raw); } catch (_) { throw failure('XIAOMI_CALLBACK_INVALID', 'xiaomi_oauth'); }
    assert(u.origin + u.pathname === XIAOMI_CALLBACK && !u.username && !u.password && !u.hash,
      'XIAOMI_CALLBACK_TARGET_MISMATCH', 'xiaomi_oauth');
    const v = uniqueParams(u.search.slice(1), 'xiaomi_oauth');
    assert(v.state === a.state && !v.error, 'XIAOMI_CALLBACK_STATE_MISMATCH', 'xiaomi_oauth');
    assert(typeof v.code === 'string' && v.code.length > 0 && v.code.length <= 4096 && !/[&=\r\n]/.test(v.code),
      'XIAOMI_CODE_INVALID', 'xiaomi_oauth');
    return v.code;
  }
  async function waitForXiaomi(a) {
    if (!a.xiaomiLocation) {
      const r = await xiaomiRequest(a, a.xiaomiChallenge.poll, false,
        {stage: 'xiaomi_poll', timeout: 315000});
      const v = success(xiaomiJSON(r.responseText, 'xiaomi_poll'), 'xiaomi_poll');
      a.xiaomiLocation = xiaomiURL(fields(v, ['location'], 'xiaomi_poll').location, 'xiaomi_poll').href;
      hideQR(a); delete a.xiaomiChallenge;
      // QR confirmation is complete. Bound the following OAuth exchanges
      // separately; a used or expired QR is never silently issued again.
      a.expires = Date.now() + 180000;
    }
    let url = a.xiaomiLocation;
    for (let i = 0; i < 12; i++) {
      if (url.startsWith(XIAOMI_CALLBACK + '?')) {
        a.xiaomiCode = xiaomiCallback(a, url); delete a.xiaomiLocation; return;
      }
      const r = await xiaomiRequest(a, url, false, {stage: 'xiaomi_oauth'});
      let next = responseHeader(r.responseHeaders, 'location');
      if (!next && /^(?:&&&START&&&|@json:|\s*\{)/.test(r.responseText)) {
        const v = xiaomiJSON(r.responseText, 'xiaomi_oauth');
        assert(v.code === 0 || v.code === 302, 'XIAOMI_AUTHORIZATION_REQUIRED', 'xiaomi_oauth');
        next = v.location || v.data?.location;
      }
      assert(typeof next === 'string' && next, 'XIAOMI_AUTHORIZATION_REQUIRED', 'xiaomi_oauth');
      url = new URL(next, url).href;
      if (url.startsWith(XIAOMI_CALLBACK + '?')) xiaomiCallback(a, url);
      else xiaomiURL(url, 'xiaomi_oauth');
      a.xiaomiLocation = url;
    }
    throw failure('REDIRECT_LIMIT', 'xiaomi_oauth');
  }
  async function xiaomiCipher(value, decrypt = false) {
    // SDK AESEncryption: AES-128-ECB + PKCS#7, public shipped protocol key.
    // WebCrypto exposes CBC. Its first block with a zero IV is ECB; an extra
    // correctly encrypted padding block lets CBC decrypt one arbitrary block.
    const stage = 'xiaomi_sdk';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('migc_game_sdkkey'),
      'AES-CBC', false, ['encrypt', 'decrypt']);
    const iv = new Uint8Array(16);
    let bytes;
    if (decrypt) {
      assert(typeof value === 'string' && /^[A-Za-z0-9+/=\s]+$/.test(value) && value.length <= 65536,
        'XIAOMI_CIPHER_INVALID', stage);
      bytes = b64decode(value.replace(/\s/g, ''));
      assert(bytes.length > 0 && bytes.length % 16 === 0, 'XIAOMI_CIPHER_INVALID', stage);
    } else {
      const plain = new TextEncoder().encode(value);
      assert(plain.length <= 16384, 'REQUEST_TOO_LARGE', stage);
      const padding = 16 - plain.length % 16;
      bytes = new Uint8Array(plain.length + padding); bytes.set(plain); bytes.fill(padding, plain.length);
    }
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 16) {
      const block = bytes.slice(i, i + 16);
      if (decrypt) {
        const pad = await crypto.subtle.encrypt({name: 'AES-CBC', iv: block}, key, new Uint8Array(16).fill(16));
        const pair = new Uint8Array(32); pair.set(block); pair.set(new Uint8Array(pad).slice(0, 16), 16);
        out.set(new Uint8Array(await crypto.subtle.decrypt({name: 'AES-CBC', iv}, key, pair)), i);
      } else {
        out.set(new Uint8Array(await crypto.subtle.encrypt({name: 'AES-CBC', iv}, key, block)).slice(0, 16), i);
      }
    }
    if (!decrypt) return b64encode(out);
    const padding = out[out.length - 1];
    assert(padding >= 1 && padding <= 16 && out.slice(-padding).every(v => v === padding), 'XIAOMI_CIPHER_INVALID', stage);
    return new TextDecoder('utf-8', {fatal: true}).decode(out.slice(0, -padding));
  }
  async function xiaomiSDK(a, path, plain, post = false) {
    assert(['/misdk/v2/oauth', '/migc-sdk-account/getLoginAppAccount_v2'].includes(path), 'ENDPOINT_DENIED', 'xiaomi_sdk');
    const p = await xiaomiCipher(plain); active(a);
    const base = 'https://account.migc.g.mi.com' + path;
    const r = await xiaomiRequest(a, post ? base : queryURL(base, {p}), false,
      {stage: 'xiaomi_sdk', ...(post ? {body: {p}} : {})});
    return xiaomiJSON(await xiaomiCipher(r.responseText, true), 'xiaomi_sdk');
  }
  function xiaomiGameCredentials(value) {
    assert(value.retCode === 200, 'XIAOMI_GAME_ACCOUNT_REJECTED', 'xiaomi_sdk');
    const v = fields(value, ['appAccountId', 'session'], 'xiaomi_sdk');
    assert(/^\d{1,20}$/.test(v.appAccountId) && v.session.length <= 4096,
      'XIAOMI_GAME_ACCOUNT_INVALID', 'xiaomi_sdk');
    return {uid: v.appAccountId, session: v.session,
      username: typeof value.nickName === 'string' ? value.nickName.slice(0, 128) : ''};
  }
  async function exchangeXiaomi(a) {
    if (!a.xiaomi && !a.session) {
      if (!a.xiaomiOAuth) {
        if (!a.xiaomiCode) {
          if (!a.xiaomiChallenge && !a.xiaomiLocation) await prepareXiaomi(a);
          await waitForXiaomi(a);
        }
        const v = success(await xiaomiSDK(a, '/misdk/v2/oauth',
          // ViewLoginLayout.WebLoginListenerImpl sends type 4 to the SDK;
          // 40001 is the UI message / WebView bundle type, not this API enum.
          'accountType=4&code=' + a.xiaomiCode + '&isSaveSt=true&appid=2000202'), 'xiaomi_sdk');
        assert(!v.needBindMid, 'XIAOMI_ACCOUNT_BINDING_REQUIRED', 'xiaomi_sdk');
        a.xiaomiOAuth = fields(v, ['uuid', 'st'], 'xiaomi_sdk');
        assert(/^\d{1,20}$/.test(a.xiaomiOAuth.uuid) && !/[&=\r\n]/.test(a.xiaomiOAuth.st),
          'XIAOMI_ACCOUNT_INVALID', 'xiaomi_sdk');
        delete a.xiaomiCode; a.cookies.clear();
      }
      const plain = 'fuid=' + a.xiaomiOAuth.uuid + '&devAppId=' + XIAOMI_GAME_APP + '&toke=' + a.xiaomiOAuth.st +
        '&imei=&sdkVersion=SDK_MI_SP_3.3.0.6&channel=meng_1439_345_android&ua=Windows' +
        '&currentChannel=meng_1439_345_android' +
        '&imeiMd5=&firstChannel=meng_1439_345_android&oaid=&needRealNameInfo=false&needServiceToken=true&needRiskControl=true';
      a.xiaomi = xiaomiGameCredentials(await xiaomiSDK(a, '/migc-sdk-account/getLoginAppAccount_v2', plain, true));
      delete a.xiaomiOAuth;
    }
    if (!a.session) {
      // Current APK manifest / PlatformSdk: app 485, package 117, platform
      // 10038. Verified against AnySDK with the owned native session 2026-09-29.
      const r = success(await json(a, 'sgs_session', 'https://anysdk.dobest.cn/v1/login', {
        appid: '485', channel: '', package_id: '117', platform_id: '10038', platform_name: 'xiaomi',
        base: {group_id: '0', device_id: a.device, version_code: '347', version_name: '1.0.347',
          device_mobile: '', device_network: '', device_os: 'android', device_os_version: '', device_pixel: '', device_type: '1', device_version_code: ''},
        ext: JSON.stringify({session_type: 'st_dummy'}),
        data: {thirdparty: 'xiaomi', pid: '10038', gid: '485', uid: a.xiaomi.uid, username: a.xiaomi.username,
          session: a.xiaomi.session, thirdAdult: '0', thirdRealNameStatus: '0', thirdAge: '0'}
      }), 'sgs_session');
      let data = r.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) { throw failure('RESPONSE_SCHEMA_CHANGED', 'sgs_session'); }
      }
      a.session = fields(data, ['session'], 'sgs_session').session;
    }
    if (!a.grant) {
      // sgs_mobile_client_channel_info.LoginXiaomi2New; channel 320052 in
      // sgs_channel_info_conf. The native-session exchange was runtime verified.
      const v = success(await json(a, 'sgs_grant', queryURL('https://10th-sdk-login.sanguosha.com/xiaomi2/app/login',
        {ticket: a.session, is_adult: '1'})), 'sgs_grant');
      const grant = validateGrant(v.data);
      assert(!a.account || a.account === grant.account, 'ACCOUNT_MISMATCH', 'sgs_grant');
      a.account = grant.account; a.grant = grant; a.grantExpires = Date.now() + 90000;
      remember(a);
    }
    return a.grant;
  }
  // Account web app.e29e7580.js and joint MaodunCipher v1, checked 2026-10-02.
  // Public RSA encryption keys, never private keys or user credentials. Both
  // envelopes completed the live QR-to-SGS exchange before this browser port.
  // Official passport app.e29e7580.js, checked 2026-10-03, SHA-256
  // 69c33e5bc8af7c394a5d67621234102551089746d9b690ab7642f88eb2d1aa60.
  // QR + joint subaccount exchange verified live; public keys are app metadata.
  const vivoCipher = (() => {
    const WEB_MODULUS = "805db57ee970019b3797aaeef0cd9f2cf0cef58e3ed33385d036e5cfb9ce9ab19818322970fc1e80d60bbe942b705ab66237c2cd517e9f5c5dfa4f21898c5dc20829f68881f5408de0c2ebfaa3995ed58ac412434003a7df0fadbb44b01b02ac38d23e0831ad179979c9f8c0ba74d8c0b76e7376aa6633e6a365176c6746aab19bc4f4b9958dff919ca471efa2fadc4eeef61f25ebc763283979a3867e98cdf3febae8beb49aff97a6a776ef673755c6e36d85b96490a58e16671d1f9c3de0329fa3f97a771bd1a7d0868cb3d0b9c046244fe750bd36fe1abc6fd16c6803da8e1ab1b6845c9eb33e00f1444e1edf8124846338e97726989790480e782d2278dd";
    const UNION_MODULUS = "9bb31499728ff7e06b31a2e46cc48d8f2499a36b7aca03c6179f8208135ea0ade4e424b571d4bebbe2a14a9c4fca57e8e1a4b7b498aa990b45e9f4f83ebcdc13e7676629e6c5c861de3de36a2de08a63053c9abace3ece76d92cd38517ba9dba1d8ccb29b896020541ae6f419a6d2bc72516dc583051822db04028770ed704494236a652268e496d55bc274ac9e9acfe901840df9b15804bdfb15b8553d451abe76f8153d53560102cc40a2ab924bb7064af70f13751e3b9b5177b057208b3246cd2e9ee41a4bb408bd77868c9b4d0b13320905d4cc656af0748e725bcaafe6c0d593891f138e929a45cb0feee475eadf7b70a60bdaed7fba6117592d1dbbbb9";
    const utf8 = text => new TextEncoder().encode(text);
    const text = bytes => new TextDecoder('utf-8', {fatal:true}).decode(bytes);
    const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2,'0')).join('');
    const unhex = value => {
      if (!/^(?:[a-f\d]{2})+$/i.test(value)) throw failure('VIVO_CIPHER_INVALID', 'vivo_crypto');
      return Uint8Array.from(value.match(/../g), byte => parseInt(byte,16));
    };
    const concat = (...parts) => {
      const out = new Uint8Array(parts.reduce((n,part)=>n+part.length,0));
      let pos=0;for(const part of parts){out.set(part,pos);pos+=part.length;}return out;
    };
    const randomKey = () => utf8(hex(crypto.getRandomValues(new Uint8Array(8))));
    function rsa(plain, modulus) {
      const size=modulus.length/2;
      if(plain.length>size-11) throw failure('VIVO_CIPHER_INVALID', 'vivo_crypto');
      const block=new Uint8Array(size);block[1]=2;
      const padding=crypto.getRandomValues(new Uint8Array(size-plain.length-3));
      for(let i=0;i<padding.length;i++)while(padding[i]===0)padding[i]=crypto.getRandomValues(new Uint8Array(1))[0];
      block.set(padding,2);block.set(plain,size-plain.length);
      const n=BigInt('0x'+modulus);let value=BigInt('0x'+hex(block)),exponent=65537n,result=1n;
      while(exponent){if(exponent&1n)result=result*value%n;value=value*value%n;exponent>>=1n;}
      return unhex(result.toString(16).padStart(size*2,'0'));
    }
    async function aes(key,iv,plain,decrypt=false) {
      const imported=await crypto.subtle.importKey('raw',key,'AES-CBC',false,[decrypt?'decrypt':'encrypt']);
      return new Uint8Array(await crypto.subtle[decrypt?'decrypt':'encrypt']({name:'AES-CBC',iv},imported,plain));
    }
    async function webEnvelope(fields) {
      const key=randomKey(),iv=utf8('16-Bytes--String');
      const plain=Object.entries(fields).map(([name,value])=>encodeURIComponent(name)+'='+encodeURIComponent(String(value))).join('&');
      const body={encData:hex(await aes(key,iv,utf8(plain))),encKey:btoa(String.fromCharCode(...rsa(key,WEB_MODULUS))),encVer:'1_1_2'};
      return {body,decode:async raw=>JSON.parse(raw.startsWith('enc:')?text(await aes(key,iv,unhex(raw.slice(4)),true)):raw)};
    }
    function crc32(bytes){let value=-1;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=value>>>1^((value&1)?0xedb88320:0);}return(value^-1)>>>0;}
    function u16(value){return new Uint8Array([value>>>8,value&255]);}
    function u32(value){return new Uint8Array([value>>>24,value>>>16&255,value>>>8&255,value&255]);}
    function unionCipher(){
      const key=randomKey(),iv=randomKey();
      // Official MaodunCipher v1 request: protocol 0x20, magic 0xcb, key v1,
      // RSA PKCS#1 v1.5, plugin namespace, AES-CBC, CRC32 of the envelope header.
      const wrapped=rsa(key,UNION_MODULUS);
      const body=concat(u16(32),u16(203),u16(1),new Uint8Array([65,18]),utf8('com.vivo.sdkplugin'),iv,u16(wrapped.length),wrapped);
      const header=concat(u16(body.length+10),new Uint8Array(4),u32(crc32(body)),body);
      return {
        async encrypt(plain){const result=concat(header,await aes(key,iv,utf8(plain)));return btoa(String.fromCharCode(...result)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');},
        async decrypt(raw){
          if(typeof raw!=='string'||raw.length>524288||!/^[A-Za-z\d_+\/-]+={0,2}$/.test(raw))throw failure('VIVO_CIPHER_INVALID', 'vivo_crypto');
          const data=Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
          if(data.length<54)throw failure('VIVO_CIPHER_INVALID', 'vivo_crypto');
          const view=new DataView(data.buffer),headerLength=view.getUint16(0),lengthOffset=data[17]+34;
          if(lengthOffset+2>data.length)throw failure('VIVO_CIPHER_INVALID', 'vivo_crypto');
          const payloadOffset=lengthOffset+2+view.getUint16(lengthOffset);
          if(view.getUint16(12)!==203||headerLength!==payloadOffset||payloadOffset>=data.length||(data.length-payloadOffset)%16)throw failure('VIVO_CIPHER_INVALID', 'vivo_crypto');
          return text(await aes(key,iv,data.slice(payloadOffset),true));
        }
      };
    }
    return {webEnvelope, unionCipher};
  })();
  function vivoURL(raw, stage) {
    const u = parseURL(raw, VIVO_HOSTS, stage);
    const paths = u.hostname === 'passport.vivo.com.cn' ?
      ['/pass/QRCode/login/generateQRCode', '/pass/QRCode/login/checkQRCodeState',
        '/pass/QRCode/login/checkUserConfirm', '/v3/web/login/authorize'] :
      ['/game-subaccount-login/', '/h5/union/get', '/h5/union/use', '/h5/account/realName'];
    assert(paths.includes(u.pathname) && !u.hash, 'ENDPOINT_DENIED', stage);
    return u;
  }
  async function vivoRequest(a, stage, raw, body) {
    const r = await isolatedRequest(a, vivoURL(raw, stage).href, false, {stage, body});
    active(a); return r;
  }
  async function vivoWeb(a, name, values) {
    const stage = 'vivo_qr', timeStamp = Date.now();
    const envelope = await vivoCipher.webEnvelope({...values, countryCode: 'CN', deviceType: 'pc', timeStamp,
      nounce: md5(String(timeStamp) + Math.floor(Math.random() * 1000)), locale: 'zh_CN', authcookie: 1, e: 3, msminv: '26060500'});
    active(a);
    const r = await vivoRequest(a, stage, 'https://passport.vivo.com.cn/pass/QRCode/login/' + name, envelope.body);
    assert(r.status === 200, 'OFFICIAL_REDIRECT_REQUIRED', stage);
    let value;
    try { value = await envelope.decode(r.responseText); }
    catch (_) { throw failure('VIVO_CIPHER_INVALID', stage); }
    active(a);
    assert(value && Number.isInteger(value.code), 'RESPONSE_SCHEMA_CHANGED', stage);
    return value;
  }
  async function prepareVivo(a) {
    let scanCodeNum = a.vivoQR;
    if (!scanCodeNum) {
      const r = success(await vivoWeb(a, 'generateQRCode', {QRCodeScene: 'pcLogin'}), 'vivo_qr');
      scanCodeNum = fields(r.data, ['scanCodeNum'], 'vivo_qr').scanCodeNum;
    }
    assert(/^VIVO_ACCOUNT:[A-Za-z\d+/_-]+={0,2}$/.test(scanCodeNum) && scanCodeNum.length <= 2048,
      'VIVO_QR_INVALID', 'vivo_qr');
    const matrix = encodeBiliQR(scanCodeNum, {ecc: 'M'});
    assert(matrix, 'VIVO_QR_ENCODING_FAILED', 'vivo_qr');
    const size = matrix.size + 8, rects = [];
    for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) rects.push(`<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>`);
    }
    hideQR(a); a.vivoQR = scanCodeNum;
    a.image = URL.createObjectURL(new Blob([
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="280" height="280" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><g fill="black">${rects.join('')}</g></svg>`
    ], {type: 'image/svg+xml'}));
    ui.screen.alt = 'vivo 扫码登录'; ui.screen.src = a.image; ui.screen.hidden = false;
  }
  async function waitForVivo(a) {
    while (!a.vivoConfirmed) {
      active(a);
      const r = await vivoWeb(a, a.vivoScanned ? 'checkUserConfirm' : 'checkQRCodeState',
        {scanCodeNum: a.vivoQR, ...(a.vivoScanned ? {rememberMe: false, clientId: '67'} : {})});
      if (r.code === 15015 || r.code === 15021) { await sleep(2000); continue; }
      if (r.code === 15016 || r.code === 15022) {
        delete a.vivoQR; delete a.vivoScanned; a.cookies.clear(); hideQR(a);
        throw failure(r.code === 15016 ? 'QR_EXPIRED' : 'LOGIN_CANCELLED', 'vivo_qr');
      }
      success(r, 'vivo_qr');
      const {openid} = fields(r.data, ['openid'], 'vivo_qr');
      if (!a.vivoScanned) a.vivoScanned = openid;
      else {
        assert(openid === a.vivoScanned, 'ACCOUNT_MISMATCH', 'vivo_qr');
        const authCookie = a.cookies.forURL('https://passport.vivo.com.cn/').some(c =>
          c.name === 'vivo_account_cookie_iqoo_authtoken' && !!c.value);
        console.info('[统一登录器]', JSON.stringify({stage: 'vivo_cookie_capability', available: authCookie,
          source: 'GM_xmlhttpRequest.responseHeaders', reason: authCookie ? 'AUTH_COOKIE_CAPTURED' : 'AUTH_COOKIE_NOT_EXPOSED'}));
        a.vivoConfirmed = true; a.vivoIdentity = openid;
        delete a.vivoQR; delete a.vivoScanned; hideQR(a);
      }
    }
  }
  async function authorizeVivo(a) {
    const target = 'https://joint.vivo.com.cn/game-subaccount-login/?from=login';
    let url = 'https://passport.vivo.com.cn/v3/web/login/authorize?' +
      new URLSearchParams({client_id: '67', redirect_uri: target});
    for (let hop = 0; hop < 6; hop++) {
      const u = vivoURL(url, 'vivo_authorize');
      const authorization = u.hostname === 'passport.vivo.com.cn' && u.pathname === '/v3/web/login/authorize';
      assert(authorization ? u.searchParams.getAll('client_id').length === 1 &&
        u.searchParams.get('client_id') === '67' && u.searchParams.getAll('redirect_uri').length === 1 &&
        u.searchParams.get('redirect_uri') === target :
        u.hostname === 'joint.vivo.com.cn' && u.pathname === '/game-subaccount-login/' &&
        u.searchParams.getAll('from').length === 1 && u.searchParams.get('from') === 'login' &&
        [...u.searchParams.keys()].every(key => key === 'from' || key === 'openid') &&
        (!u.searchParams.has('openid') || (u.searchParams.getAll('openid').length === 1 &&
          u.searchParams.get('openid') === a.vivoIdentity)),
      'ENDPOINT_DENIED', 'vivo_authorize');
      const r = await vivoRequest(a, 'vivo_authorize', url);
      if (r.status >= 300) {
        const next = responseHeader(r.responseHeaders, 'location');
        assert(next, 'REDIRECT_TRANSPORT_UNAVAILABLE', 'vivo_authorize');
        const destination = new URL(next, url);
        console.info('[统一登录器]', JSON.stringify({stage: 'vivo_authorize_route', status: r.status,
          host: VIVO_HOSTS.has(destination.hostname) ? destination.hostname : 'FOREIGN_HOST',
          path: ['/', '/v3/web/login/authorize', '/game-subaccount-login/'].includes(destination.pathname) ? destination.pathname : 'OTHER_PATH',
          hashPresent: !!destination.hash, accountParameterPresent: destination.searchParams.has('openid')}));
        url = vivoURL(destination.href, 'vivo_authorize').href;
      } else {
        assert(r.status === 200 && u.hostname === 'joint.vivo.com.cn', 'VIVO_AUTHORIZATION_REQUIRED', 'vivo_authorize');
        a.vivoAuthorized = true; return;
      }
    }
    throw failure('REDIRECT_LIMIT', 'vivo_authorize');
  }
  async function waitForVivoBrowser(a) {
    const deadline = Date.now() + 10 * 60 * 1000;
    a.stage = 'vivo_browser_login';
    while (Date.now() < deadline) {
      active(a);
      let value;
      try {
        value = await vivoBrowserValue(a, '/h5/union/get', {gamePackage: VIVO_PACKAGE});
      } catch (error) {
        if (['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'HTTP_502', 'HTTP_503', 'HTTP_504'].includes(error.message)) {
          await sleep(2000);
          continue;
        }
        throw error;
      }
      const code = Number(value.code);
      if (code === 0) {
        a.stage = 'vivo_account';
        return value;
      }
      if ([30101, 30103, 50100, 50200, 50101].includes(code) || value.authPending) {
        a.stage = 'vivo_browser_login';
        await sleep(2000);
        continue;
      }
      if (code === 601 || code === 602) throw failure('VIVO_REAL_NAME_REQUIRED', 'vivo_account');
      throw failure('OFFICIAL_REJECTED_' + (Number.isInteger(code) ? code : 'UNKNOWN'), 'vivo_account');
    }
    throw failure('VIVO_BROWSER_TIMEOUT', 'vivo_browser_login');
  }
  async function waitForVivoPage(a) {
    const stage = 'vivo_browser_login';
    const nonce = String(a.browserNonce || '');
    assert(/^[a-f0-9]{16,64}$/.test(nonce), 'VIVO_BROWSER_NONCE_MISSING', stage);
    const key = VIVO_PAGE_RESULT_KEY + nonce;
    const stateKey = VIVO_PAGE_STATE_PREFIX + nonce;
    const deadline = Date.now() + 10 * 60 * 1000;
    let lastNotice = '';
    const noticeFor = phase => ({
      passport_loaded: 'Vivo 官方登录页已打开，请完成密码、短信验证码或扫码登录',
      bridge_loaded: 'Vivo 官方登录页已连接，请继续完成登录；完成后会自动继续',
      waiting_auth_cookie: '等待 Vivo 官方登录页返回登录态…',
      cookies_missing: 'Vivo 官方登录页尚未返回登录态，请确认已完成登录',
      waiting_official_login: '已连接 Vivo 官方登录页，等待你完成登录…',
      official_login_called: 'Vivo 官方页面已确认登录，正在读取一次性结果…',
      result_sent: 'Vivo 登录结果已收到，正在兑换游戏账号…'
    })[phase] || '';
    setBrowserNotice(a, '请在 Vivo 官方登录窗口完成登录，完成后会自动继续');
    while (Date.now() < deadline) {
      active(a);
      let state = null;
      try { state = GM_getValue(stateKey, null); } catch (_) {}
      if (state && state.nonce === nonce && Number(state.expires) > Date.now()) {
        const notice = noticeFor(state.phase);
        if (notice && notice !== lastNotice) { lastNotice = notice; setBrowserNotice(a, notice); }
      }
      let value = null;
      try { value = GM_getValue(key, null); } catch (_) {}
      if (value) {
        try { GM_deleteValue(key); } catch (_) {}
        assert(value.v === 1 && value.nonce === nonce, 'VIVO_PAGE_RESULT_INVALID', stage);
        const createdAt = Number(value.createdAt), expires = Number(value.expires);
        assert(Number.isFinite(createdAt) && Number.isFinite(expires) &&
          expires > Date.now() && Date.now() - createdAt <= 120000, 'VIVO_PAGE_RESULT_EXPIRED', stage);
        let href;
        try { href = new URL(String(value.href)); } catch (_) { throw failure('VIVO_PAGE_ORIGIN_MISMATCH', stage); }
        assert(href.protocol === 'https:' && href.hostname === 'joint.vivo.com.cn' &&
          href.pathname.startsWith('/game-subaccount-login/'), 'VIVO_PAGE_ORIGIN_MISMATCH', stage);
        const subOpenId = String(value.subOpenId || ''), openToken = String(value.openToken || '');
        assert(/^[A-Za-z0-9+/=_.~-]{1,2048}$/.test(subOpenId), 'VIVO_PAGE_RESULT_INVALID', stage);
        assert(/^[A-Za-z0-9+/=_.~-]{8,4096}$/.test(openToken), 'VIVO_PAGE_RESULT_INVALID', stage);
        const openId = typeof value.openId === 'string' ? value.openId.slice(0, 1024) : '';
        try { GM_deleteValue(stateKey); } catch (_) {}
        setBrowserNotice(a, 'Vivo 官方登录结果已收到，正在兑换游戏账号…');
        a.stage = 'vivo_account';
        return {subOpenId, openToken, openId};
      }
      await sleep(500);
    }
    throw failure('VIVO_BROWSER_TIMEOUT', stage);
  }
  async function vivoUnion(a, path, values, post = false, encrypted = true) {
    const cipher = vivoCipher.unionCipher();
    const params = encrypted ? {jvq_param: await cipher.encrypt(new URLSearchParams(values).toString())} : values;
    const url = 'https://joint.vivo.com.cn' + path;
    const r = await vivoRequest(a, 'vivo_account', post ? url : url + '?' + new URLSearchParams(params), post ? params : undefined);
    assert(r.status === 200, 'VIVO_AUTHORIZATION_REQUIRED', 'vivo_account');
    let value;
    try { value = JSON.parse(r.responseText); }
    catch (_) {
      try { value = JSON.parse(await cipher.decrypt(r.responseText)); }
      catch (_) { throw failure('VIVO_CIPHER_INVALID', 'vivo_account'); }
    }
    active(a); return success(value, 'vivo_account');
  }
  async function vivoBrowserValue(a, path, values, post = false, encrypted = true) {
    const cipher = vivoCipher.unionCipher();
    const params = encrypted ? {jvq_param: await cipher.encrypt(new URLSearchParams(values).toString())} : values;
    const url = 'https://joint.vivo.com.cn' + path;
    const r = await transport(a, post ? url : url + '?' + new URLSearchParams(params), {
      vivo: true, form: post, body: post ? params : undefined, stage: 'vivo_account',
      timeout: 35000, limit: 262144,
      headers: {Accept: 'application/json, text/plain, */*',
        Referer: 'https://joint.vivo.com.cn/game-subaccount-login/?from=login'}
    });
    if (r.status !== 200) throw failure('HTTP_' + r.status, 'vivo_account');
    let value;
    try { value = JSON.parse(r.responseText); }
    catch (_) {
      try { value = JSON.parse(await cipher.decrypt(r.responseText)); }
      catch (_) {
        // A logged-out GM request can follow the official authorize redirect
        // back to the passport HTML page. Treat that as "still waiting", never
        // as a credential or a successful account response.
        if (/passport\.vivo\.com\.cn|\/v3\/web\/login\/authorize|<html/i.test(r.responseText || '')) {
          return {code: 30101, authPending: true};
        }
        throw failure('VIVO_CIPHER_INVALID', 'vivo_account');
      }
    }
    active(a);
    assert(value && typeof value === 'object' && Object.hasOwn(value, 'code'),
      'RESPONSE_SCHEMA_CHANGED', 'vivo_account');
    if (Number.isFinite(Number(value.code))) value.code = Number(value.code);
    return value;
  }
  async function vivoBrowser(a, path, values, post = false, encrypted = true) {
    return success(await vivoBrowserValue(a, path, values, post, encrypted), 'vivo_account');
  }
  function vivoAccountChoice(value, realName) {
    const stage = 'vivo_account';
    assert(realName.data?.accountRealName === true, 'VIVO_REAL_NAME_REQUIRED', stage);
    assert(!value.extraData?.minor && !value.extraData?.forceNative, 'VIVO_NATIVE_CONFIRMATION_REQUIRED', stage);
    const accounts = value.data?.subAccounts;
    assert(Array.isArray(accounts) && accounts.length === 1 && accounts[0].lastLogin === true,
      'VIVO_ACCOUNT_SELECTION_REQUIRED', stage);
    assert(!accounts[0].frozenFlag, 'VIVO_ACCOUNT_UNAVAILABLE', stage);
    return fields(accounts[0], ['subOpenId'], stage).subOpenId;
  }
  async function exchangeVivo(a) {
    if (!a.vivo && !a.session) {
      if (a.mode === 'browser') {
        const result = await waitForVivoPage(a);
        a.vivo = {uid: result.subOpenId, session: result.openToken,
          username: result.openId || result.subOpenId || ''};
      } else {
        const values = {gamePackage: VIVO_PACKAGE};
        const accountRequest = (path, body, post = false, encrypted = true) =>
          vivoUnion(a, path, body, post, encrypted);
        if (!a.vivoConfirmed) {
          if (!a.vivoQR || !a.image) await prepareVivo(a);
          await waitForVivo(a);
        }
        if (!a.vivoAuthorized) await authorizeVivo(a);
        const account = await accountRequest('/h5/union/get', values);
        const realName = await accountRequest('/h5/account/realName', values, false, false);
        const uid = vivoAccountChoice(account, realName);
        const used = await accountRequest('/h5/union/use', {...values, subOpenId: uid,
          ...(account.extraInfo ? {extraInfo: account.extraInfo} : {})}, true);
        assert(!used.extraData?.minor && !used.extraData?.forceNative && !used.noticeData?.content && used.vipRecall !== 1,
          'VIVO_NATIVE_CONFIRMATION_REQUIRED', 'vivo_account');
        assert(typeof used.data === 'string' && used.data.length > 0 && used.data.length <= 4096,
          'RESPONSE_SCHEMA_CHANGED', 'vivo_account');
        a.vivo = {uid, session: used.data, username: String(account.data.nickName || '')};
        a.cookies.clear(); delete a.vivoConfirmed; delete a.vivoAuthorized; delete a.vivoIdentity;
      }
    }
    if (!a.session) {
      const r = success(await json(a, 'sgs_session', 'https://anysdk.dobest.cn/v1/login', {
        appid: '485', channel: '', package_id: '128', platform_id: '10031', platform_name: 'vivo',
        base: {group_id: '0', device_id: a.device, version_code: '343', version_name: '1.0.343',
          device_mobile: '', device_network: '', device_os: 'android', device_os_version: '', device_pixel: '', device_type: '1', device_version_code: ''},
        ext: JSON.stringify({session_type: 'st_dummy'}),
        data: {thirdparty: 'vivo', pid: '10031', gid: '485', uid: a.vivo.uid, username: a.vivo.username,
          session: a.vivo.session, thirdAdult: '0', thirdRealNameStatus: '1', thirdAge: '0'}
      }), 'sgs_session');
      let data = r.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) { throw failure('RESPONSE_SCHEMA_CHANGED', 'sgs_session'); }
      }
      a.session = fields(data, ['session'], 'sgs_session').session;
    }
    if (!a.grant) {
      const r = success(await json(a, 'sgs_grant', queryURL('https://10th-sdk-login.sanguosha.com/vivo/app/login',
        {ticket: a.session, is_adult: '1'})), 'sgs_grant');
      const grant = validateGrant(r.data);
      assert(!a.account || a.account === grant.account, 'ACCOUNT_MISMATCH', 'sgs_grant');
      a.account = grant.account; a.grant = grant; a.grantExpires = Date.now() + 90000;
      remember(a);
    }
    return a.grant;
  }

  // Huawei Account web SDK, 2026-10-03: webLogin/portal/index-entry-legacy.js
  // SHA-256 23a45a3e786ef0e30f3d7d6fbf1959b0de94bd72ca4bcf0e77734f59ded4d250.
  // QR -> CAS -> AppAuth PKCE -> AnySDK -> SGS verified with the owned account.
  // Chrome/Tampermonkey QR confirmation and main-site hall entry verified on 2026-10-03.
  function huaweiURL(raw, stage = 'huawei_auth') {
    const u = parseURL(raw, HUAWEI_HOSTS, stage);
    const paths = u.hostname === 'id1.cloud.huawei.com' ? ['/DimensionalCode/getqrInfo', '/DimensionalCode/async',
      '/qrcode/login.jsp', '/CAS/remoteLogin', '/CAS/portal/loginAuth.html',
      '/CAS/IDM_W/ajaxHandler/jsRemoteLogin', '/CAS/IDM_W/ajaxHandler/codeRemoteLogin'] :
      ['/oauth2/v3/authorize', '/oauth2/v3/loginCallback', '/oauth2/ajax/getLoginWay', '/oauth2/ajax/login',
        '/oauth2/ajax/authorizeConfirm', '/oauth2/v3/token', '/oauth2/v3/certs'];
    assert(paths.includes(u.pathname) && !u.hash, 'ENDPOINT_DENIED', stage); return u;
  }
  function huaweiText(value) {
    // Decode the official config's HTML entities without creating DOM content.
    assert(typeof value === 'string' && value.length <= 131072, 'HUAWEI_CONFIG_INVALID', 'huawei_auth');
    return value.replace(/&(?:#(x[\da-f]+|\d+)|amp|quot|apos|lt|gt);/gi, (whole, n) => {
      if (n) { const cp = /^x/i.test(n) ? parseInt(n.slice(1), 16) : Number(n);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole; }
      return {'&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>'}[whole.toLowerCase()];
    });
  }
  async function huaweiRequest(a, stage, url, body, fromLoginAuth = false) {
    const u = huaweiURL(url, stage);
    const r = await isolatedRequest(a, u.href, false, {stage, body, timeout: 35000,
      headers: {Origin: HUAWEI_AUTH, Referer: HUAWEI_AUTH + '/oauth2/v3/authorize',
        interfaceVersion: 'v3', fromLoginAuth: String(fromLoginAuth)}});
    assert(r.status === 200, 'OFFICIAL_REDIRECT_REQUIRED', stage);
    let v; try { v = JSON.parse(r.responseText); } catch (_) { throw failure('INVALID_JSON', stage); }
    assert(v && typeof v === 'object' && !Array.isArray(v), 'RESPONSE_SCHEMA_CHANGED', stage);
    active(a); return v;
  }
  function huaweiCallbackParams(a, raw) {
    const u = huaweiURL(raw), p = uniqueParams(u.search.slice(1), 'huawei_auth');
    assert(u.hostname !== 'id1.cloud.huawei.com' && u.pathname === '/oauth2/v3/loginCallback' &&
      p.client_id === HUAWEI_APP && p.redirect_uri === HUAWEI_CALLBACK && p.state === a.state &&
      p.nonce === a.huawei.nonce && p.response_type === 'code' && p.code_challenge_method === 'S256' &&
      p.code_challenge === a.huawei.params.code_challenge && p.scope === 'openid profile',
    'HUAWEI_CALLBACK_BINDING_MISMATCH', 'huawei_auth');
    return p;
  }
  function huaweiCASBody(h, codeLogin = false) {
    const b = {pageToken: h.si.pageToken, pageTokenKey: h.si.pageTokenKey};
    const keys = ['loginUrl', 'clientID', 'reqClientType', 'loginChannel', 'lang', 'service', 'localStorageID', 'state', 'terminalType'];
    if (!codeLogin) keys.push('themeName', 'countryCode', 'scope', 'quickAuth');
    for (const k of keys) if (h.cfg[k] !== undefined) b[k] = h.cfg[k];
    if (!codeLogin) Object.assign(b, {jsSiteID: h.cfg.currentSiteID, notAuthTypeRemoteLogin: 'true'});
    return {...b, languageCode: h.cfg.lang};
  }
  async function huaweiCAS(a, name, body) {
    const h = a.huawei;
    assert(['jsRemoteLogin', 'codeRemoteLogin'].includes(name), 'ENDPOINT_DENIED', 'huawei_cas');
    const r = await huaweiRequest(a, 'huawei_cas', queryURL(h.cfg.localHttpsAjaxPath + '/ajaxHandler/' + name,
      {cVersion: h.cfg.cookieVersion, reflushCode: String(Math.random())}), body);
    if (r.localStorageID) h.cfg.localStorageID = huaweiText(r.localStorageID);
    return r;
  }
  const huaweiBase64URL = bytes => b64encode(new Uint8Array(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function prepareHuawei(a) {
    const h = a.huawei ||= {verifier: random() + random(), nonce: random()};
    if (!h.qr) {
      h.params = {access_type: 'offline', response_type: 'code', client_id: HUAWEI_APP, ui_locales: 'zh-CN',
        redirect_uri: HUAWEI_CALLBACK, state: a.state, scope: 'openid profile', nonce: h.nonce,
        include_granted_scopes: 'true', code_challenge_method: 'S256',
        code_challenge: huaweiBase64URL(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(h.verifier)))};
      const r = await huaweiRequest(a, 'huawei_setup', HUAWEI_AUTH + '/oauth2/ajax/getLoginWay', h.params);
      assert(r.isSuccess === 'true' && r.loginInteractInfo?.loginType === 'CAS_JS_SDK', 'HUAWEI_AUTH_UNAVAILABLE', 'huawei_setup');
      h.si = r.loginInteractInfo.cas?.casJsSdkInfo;
      h.cVersion = r.loginInteractInfo.cas?.casJsSdkAdditionInfo?.cVersion;
      fields(h.si, ['pageToken', 'pageTokenKey', 'hwidConfig'], 'huawei_setup');
      let cfg; try { cfg = JSON.parse(decodeURIComponent(h.si.hwidConfig)); }
      catch (_) { throw failure('HUAWEI_CONFIG_INVALID', 'huawei_setup'); }
      h.cfg = Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, typeof v === 'string' ? huaweiText(v) : v]));
      fields(h.cfg, ['localStorageID', 'cookieVersion', 'service', 'getqrContent', 'asyncURL'], 'huawei_setup');
      assert(h.cfg.clientID === HUAWEI_APP && h.cfg.localHttpsAjaxPath === 'https://id1.cloud.huawei.com/CAS/IDM_W',
        'HUAWEI_APP_MISMATCH', 'huawei_setup');
      huaweiCallbackParams(a, h.cfg.service);
      const init = await huaweiCAS(a, 'jsRemoteLogin', huaweiCASBody(h));
      assert(String(init.errorCode) === '10006003', 'HUAWEI_FRESH_SESSION_REQUIRED', 'huawei_setup');
      const q = huaweiURL(h.cfg.getqrContent), poll = huaweiURL(h.cfg.asyncURL);
      assert(q.hostname === 'id1.cloud.huawei.com' && q.pathname === '/DimensionalCode/getqrInfo' &&
        poll.hostname === q.hostname && poll.pathname === '/DimensionalCode/async', 'ENDPOINT_DENIED', 'huawei_qr');
      const qr = await huaweiRequest(a, 'huawei_qr', q.origin + q.pathname, uniqueParams(q.search.slice(1), 'huawei_qr'));
      fields(qr, ['content', 'qrToken'], 'huawei_qr');
      const link = huaweiURL(qr.content, 'huawei_qr'), qp = uniqueParams(link.search.slice(1), 'huawei_qr');
      assert(link.hostname === 'id1.cloud.huawei.com' && link.pathname === '/qrcode/login.jsp' &&
        typeof qp.qRCode === 'string' && qp.qRCode.length > 0 && qp.qRCode.length <= 2048,
      'HUAWEI_QR_INVALID', 'huawei_qr');
      h.qr = {...qr, code: /[?&]qRCode=([^&]*)/.exec(qr.content)?.[1]};
    }
    const matrix = encodeBiliQR(h.qr.content, {ecc: 'M'});
    assert(matrix, 'HUAWEI_QR_ENCODING_FAILED', 'huawei_qr');
    const size = matrix.size + 8, rects = [];
    for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) rects.push(`<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>`);
    }
    hideQR(a);
    a.image = URL.createObjectURL(new Blob([
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="280" height="280" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><g fill="black">${rects.join('')}</g></svg>`
    ], {type: 'image/svg+xml'}));
    ui.screen.alt = '华为扫码登录'; ui.screen.src = a.image; ui.screen.hidden = false;
    ui.oppoLink.href = h.qr.content; ui.oppoLink.textContent = h.qr.content; ui.oppoLink.hidden = false;
  }
  function huaweiCode(a, raw) {
    let u; try { u = new URL(raw); } catch (_) { throw failure('HUAWEI_CALLBACK_INVALID', 'huawei_auth'); }
    assert(u.protocol === 'com.huawei.apps.' + HUAWEI_APP + ':' && !u.host && u.pathname === '/oauth2redirect' &&
      !u.hash && !u.username && !u.password, 'HUAWEI_CALLBACK_INVALID', 'huawei_auth');
    const p = uniqueParams(u.search.slice(1), 'huawei_auth');
    assert(p.state === a.state && !p.error, 'HUAWEI_STATE_MISMATCH', 'huawei_auth');
    return fields(p, ['code'], 'huawei_auth').code;
  }
  async function huaweiIdentity(a, tokens, jwks) {
    const stage = 'huawei_token', h = a.huawei;
    fields(tokens, ['access_token', 'id_token'], stage);
    const parts = tokens.id_token.split('.');
    assert(parts.length === 3 && tokens.id_token.length <= 16384 && parts.every(p => /^[A-Za-z\d_-]+$/.test(p)), 'HUAWEI_JWT_INVALID', stage);
    const bytes = p => b64decode(p.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - p.length % 4) % 4));
    let header, claims;
    try { header = JSON.parse(new TextDecoder().decode(bytes(parts[0]))); claims = JSON.parse(new TextDecoder().decode(bytes(parts[1]))); }
    catch (_) { throw failure('HUAWEI_JWT_INVALID', stage); }
    assert(header.alg === 'RS256' && typeof header.kid === 'string' && Array.isArray(jwks?.keys), 'HUAWEI_JWT_INVALID', stage);
    const keys = jwks.keys.filter(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig'));
    assert(keys.length === 1, 'HUAWEI_SIGNING_KEY_UNAVAILABLE', stage);
    let verified = false;
    try {
      const key = await crypto.subtle.importKey('jwk', keys[0], {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
      verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    } catch (_) {}
    active(a); assert(verified, 'HUAWEI_SIGNATURE_INVALID', stage);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud], now = Date.now() / 1000;
    assert(claims.iss === 'https://accounts.huawei.com' && aud.length === 1 && aud[0] === HUAWEI_APP &&
      (!claims.azp || claims.azp === HUAWEI_APP) && claims.nonce === h.nonce &&
      Number.isFinite(claims.exp) && claims.exp > now && Number.isFinite(claims.iat) && claims.iat <= now + 60,
    'HUAWEI_TOKEN_BINDING_MISMATCH', stage);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tokens.access_token)));
    active(a); assert(claims.at_hash === huaweiBase64URL(digest.slice(0, 16)), 'HUAWEI_ACCESS_TOKEN_MISMATCH', stage);
    assert(typeof claims.openid === 'string' && claims.openid.length > 0 && claims.openid.length <= 768 &&
      Number.isFinite(Number(tokens.expires_in)) && Number(tokens.expires_in) > 0 && Number(tokens.expires_in) <= 86400,
    'HUAWEI_TOKEN_INVALID', stage);
    return {uid: claims.openid, session: tokens.access_token, username: String(claims.nickname || claims.display_name || '').slice(0, 128),
      expires: Math.min(claims.exp * 1000, Date.now() + tokens.expires_in * 1000)};
  }
  async function authorizeHuawei(a) {
    if (!a.huawei?.qr) await prepareHuawei(a);
    const h = a.huawei;
    assert(!h.confirmationUsed, 'HUAWEI_CONFIRMATION_CONSUMED', 'huawei_auth');
    let result;
    for (;;) {
      result = await huaweiRequest(a, 'huawei_poll', h.cfg.asyncURL, {qrToken: h.qr.qrToken});
      const code = String(result.resultCode);
      if (code === '0') break;
      assert(['103000200', '103000202'].includes(code), code === '103000201' ? 'QR_EXPIRED' : 'HUAWEI_QR_REJECTED', 'huawei_poll');
      await sleep(2000); active(a);
    }
    h.confirmationUsed = true; hideQR(a); a.expires = Date.now() + 180000;
    fields(result, ['userID', 'code', 'userAccount'], 'huawei_poll');
    const body = {...huaweiCASBody(h, true), appID: 'com.huawei.hwidweb', qrCode: h.qr.code};
    for (const key of ['userID', 'siteID', 'accountType', 'code', 'userAccount', 'opType']) if (result[key] !== undefined) body[key] = result[key];
    let r = await huaweiCAS(a, 'codeRemoteLogin', body);
    assert(String(r.isSuccess) === '1', 'HUAWEI_CAS_REJECTED', 'huawei_cas');
    let cb = huaweiText(fields(r, ['callbackURL'], 'huawei_cas').callbackURL), u = huaweiURL(cb);
    if (u.hostname === 'id1.cloud.huawei.com' && u.pathname === '/CAS/remoteLogin') {
      r = await huaweiCAS(a, 'jsRemoteLogin', huaweiCASBody(h));
      assert(String(r.isSuccess) === '1', 'HUAWEI_CAS_REJECTED', 'huawei_cas');
      cb = huaweiText(fields(r, ['callbackURL'], 'huawei_cas').callbackURL);
    }
    const params = huaweiCallbackParams(a, cb);
    r = await huaweiRequest(a, 'huawei_authorize', HUAWEI_AUTH + '/oauth2/ajax/login', params, true);
    assert(r.isSuccess === 'true', 'HUAWEI_AUTHORIZATION_REQUIRED', 'huawei_authorize');
    if (!r.code) {
      const sig = r.signatureInfo, scopes = r.scopeInfo;
      assert(sig && scopes && sig.client_id === HUAWEI_APP && sig.redirect_uri === HUAWEI_CALLBACK && sig.state === a.state &&
        Object.keys(scopes).length > 0 && Object.keys(scopes).every(k => ['openid', 'profile'].includes(k)),
      'HUAWEI_SCOPE_CONFIRMATION_REQUIRED', 'huawei_authorize');
      r = await huaweiRequest(a, 'huawei_authorize', HUAWEI_AUTH + '/oauth2/ajax/authorizeConfirm',
        {...sig, ...(h.cVersion ? {cVersion: h.cVersion} : {}), authorize_scope: Object.keys(scopes).join(' '), pageToken: h.si.pageToken});
    }
    const code = huaweiCode(a, r.code);
    const tokens = await huaweiRequest(a, 'huawei_token', HUAWEI_AUTH + '/oauth2/v3/token',
      {grant_type: 'authorization_code', client_id: HUAWEI_APP, code, redirect_uri: HUAWEI_CALLBACK, code_verifier: h.verifier});
    const keys = await huaweiRequest(a, 'huawei_keys', 'https://oauth-login.cloud.huawei.com/oauth2/v3/certs');
    const auth = await huaweiIdentity(a, tokens, keys);
    a.cookies.clear(); a.huawei = {auth};
  }
  async function exchangeHuawei(a) {
    try {
      if (!a.session && !a.huawei?.auth) await authorizeHuawei(a);
      const h = a.huawei;
      if (!a.session) assert(h.auth.expires > Date.now(), 'SAVED_SESSION_EXPIRED', 'huawei_token');
      if (!a.session) {
        // APK 1.0.347 SHA-256 5fee34555cdd23e19bf70d713a69a22db195e533cca03475996d1d4f771f79b5.
        // PlatformExecutor=newhuawei/332; TD_CONFIG_ID=376; TD_GROUP_ID absent.
        const r = success(await json(a, 'sgs_session', 'https://anysdk.dobest.cn/v1/login', {
          appid: '485', channel: '', package_id: '376', platform_id: '332', platform_name: 'newhuawei',
          base: {group_id: '0', device_id: a.device, version_code: '347', version_name: '1.0.347', device_mobile: '',
            device_network: '', device_os: 'android', device_os_version: '', device_pixel: '', device_type: '1', device_version_code: ''},
          ext: JSON.stringify({session_type: 'st_dummy'}), data: {thirdparty: 'newhuawei', pid: '332', gid: '485',
            uid: h.auth.uid, username: h.auth.username, session: h.auth.session, thirdAdult: '0', thirdRealNameStatus: '0', thirdAge: '0'}
        }), 'sgs_session');
        assert(r.data?.thirdparty === 'newhuawei' && String(r.data.cId) === '332', 'HUAWEI_CHANNEL_MISMATCH', 'sgs_session');
        const uid = fields(r.ext, ['uid'], 'sgs_session').uid;
        assert(!h.gameUID || h.gameUID === uid, 'ACCOUNT_MISMATCH', 'sgs_session');
        h.gameUID = uid; a.session = fields(r.data, ['session'], 'sgs_session').session;
      }
      if (!a.grant) {
        // Current hall.AppPlatform + UserSdkManager supply status=1 for Huawei.
        const r = success(await json(a, 'sgs_grant', queryURL('https://10th-sdk-login.sanguosha.com/huawei/app/login',
          {ticket: a.session, is_adult: '1'})), 'sgs_grant');
        if (h?.gameUID) assert(String(r.data?.third_account_id) === h.gameUID, 'ACCOUNT_MISMATCH', 'sgs_grant');
        const grant = validateGrant(r.data);
        assert(!a.account || a.account === grant.account, 'ACCOUNT_MISMATCH', 'sgs_grant');
        a.account = grant.account; a.grant = grant; a.grantExpires = Date.now() + 90000; remember(a);
      }
      return a.grant;
    } catch (error) { a.renewalFailed = true; throw error; }
  }

  function steamRequest(a, stage, url, body, manual = false) {
    active(a); a.stage = stage;
    parseURL(url, STEAM_HOSTS, stage);
    const started = performance.now();
    return new Promise((resolve, reject) => {
      let done = false, handle;
      const finish = (error, response) => {
        if (done) return;
        done = true; clearTimeout(timer); a.requests.delete(cancel);
        record(stage, started, response?.status || 0, error?.message);
        error ? reject(error) : resolve(response);
      };
      const cancel = () => { finish(failure('REQUEST_CANCELLED', stage)); handle?.abort(); };
      const timer = setTimeout(() => { finish(failure('REQUEST_TIMEOUT', stage)); handle?.abort(); }, 25000);
      a.requests.add(cancel);
      try {
        handle = GM_xmlhttpRequest({method: body === undefined ? 'GET' : 'POST', url,
          timeout: 25000, nocache: true, responseType: 'text', cookie: a.cookies.header(url),
          ...(manual ? {redirect: 'manual'} : {}),
          headers: {Accept: '*/*', 'Content-Type': 'application/x-www-form-urlencoded'},
          data: body === undefined ? undefined : new URLSearchParams(body).toString(),
          onload: r => {
            try {
              active(a); parseURL(r.finalUrl || url, STEAM_HOSTS, stage);
              assert(r.status >= 200 && r.status < (manual ? 400 : 300), 'HTTP_' + r.status, stage);
              // TM's fetch-backed manual redirect can omit the empty body.
              if (manual && r.status >= 300 && r.responseText == null) r.responseText = '';
              assert(typeof r.responseText === 'string' && r.responseText.length <= 524288, 'RESPONSE_TOO_LARGE', stage);
              if (stage === 'steam_preflight') console.info('[统一登录器]', JSON.stringify({stage,
                status: r.status, hasLocation: !!responseHeader(r.responseHeaders, 'location'),
                hasSetCookie: !!responseHeader(r.responseHeaders, 'set-cookie')}));
              a.cookies.read(r.responseHeaders || '', r.finalUrl || url);
              finish(null, r);
            } catch (error) { finish(error); }
          },
          onerror: () => finish(failure('NETWORK_ERROR', stage)),
          ontimeout: () => finish(failure('REQUEST_TIMEOUT', stage)),
          onabort: () => finish(failure('REQUEST_CANCELLED', stage))
        });
      } catch (_) { finish(failure('GM_REQUEST_UNAVAILABLE', stage)); }
    });
  }
  async function steamAPI(a, method, input, stage) {
    assert(['BeginAuthSessionViaQR', 'PollAuthSessionStatus'].includes(method), 'ENDPOINT_INVALID', stage);
    const r = await steamRequest(a, stage, 'https://api.steampowered.com/IAuthenticationService/' + method + '/v1/',
      {input_json: JSON.stringify(input)});
    const result = responseHeader(r.responseHeaders, 'x-eresult');
    assert(result === '1', 'STEAM_RESULT_' + (/^\d+$/.test(result) ? result : 'MISSING'), stage);
    let value;
    try { value = JSON.parse(r.responseText).response; } catch (_) { throw failure('INVALID_JSON', stage); }
    assert(value && typeof value === 'object' && !Array.isArray(value), 'RESPONSE_SCHEMA_CHANGED', stage);
    return value;
  }
  function steamQRURL(value) {
    const u = parseURL(value, new Set(['s.team']), 'steam_qr');
    assert(/^\/q\/\d+\/\d+$/.test(u.pathname) && !u.search && !u.hash, 'STEAM_QR_TARGET_MISMATCH', 'steam_qr');
    return u.href;
  }
  function renderSteamQR(a) {
    const matrix = encodeBiliQR(steamQRURL(a.steamChallenge.challenge_url), {ecc: 'M'});
    assert(matrix, 'STEAM_QR_ENCODING_FAILED', 'steam_qr');
    const size = matrix.size + 8, rects = [];
    for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) rects.push(`<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>`);
    }
    hideQR(a);
    a.image = URL.createObjectURL(new Blob([
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="280" height="280" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><g fill="black">${rects.join('')}</g></svg>`
    ], {type: 'image/svg+xml'}));
    ui.screen.alt = 'Steam 登录'; ui.screen.src = a.image; ui.screen.hidden = false;
  }
  function steamCheckpoint(a) {
    if (EMBEDDED) return;
    // One owned attempt, 30-minute local diagnostic retention, private extension
    // storage. It is not a claim about Steam token lifetime. No QR is persisted.
    if (!a.steamWeb && !a.steam) return;
    a.steamPendingUntil ||= Date.now() + 1800000;
    GM_setValue(STEAM_PENDING_KEY, {v: 1, state: a.state, expires: a.steamPendingUntil,
      steamWeb: a.steamWeb, steam: a.steam, cookies: [...a.cookies.items.entries()]});
  }
  function restoreSteamCheckpoint(a) {
    if (EMBEDDED) return;
    const r = GM_getValue(STEAM_PENDING_KEY, null);
    if (!r) return;
    if (r.v !== 1 || !/^[a-f0-9]{32}$/.test(r.state) || !(r.expires > Date.now()) || r.expires > Date.now() + 1800000) {
      GM_deleteValue(STEAM_PENDING_KEY); return;
    }
    if (r.steam) a.steam = validateSteamAuth(r.steam, !r.steam.steamID);
    if (r.steamWeb) {
      fields(r.steamWeb, ['refresh_token', 'steamID', 'sessionid'], 'steam_restore');
      assert(/^\d{17}$/.test(r.steamWeb.steamID), 'STEAM_ACCOUNT_INVALID', 'steam_restore');
      a.steamWeb = r.steamWeb;
    }
    assert(Array.isArray(r.cookies) && r.cookies.length <= 40, 'STEAM_COOKIE_SCHEMA_CHANGED', 'steam_restore');
    for (const [key, c] of r.cookies) {
      assert(typeof key === 'string' && c && ['steamcommunity.com', 'steampowered.com', 'login.steampowered.com'].includes(c.domain) &&
        typeof c.name === 'string' && typeof c.value === 'string' && c.value.length <= 16384 && !/[\r\n;]/.test(c.value) &&
        typeof c.path === 'string' && c.path.startsWith('/'), 'STEAM_COOKIE_SCHEMA_CHANGED', 'steam_restore');
      a.cookies.items.set(key, c);
    }
    a.state = r.state; a.steamPendingUntil = r.expires; a.expires = r.expires;
  }
  async function waitForSteamPage(a) {
    const stage = 'steam_browser_login';
    const nonce = String(a.browserNonce || '');
    assert(/^[a-f0-9]{16,64}$/.test(nonce), 'STEAM_BROWSER_NONCE_MISSING', stage);
    const key = STEAM_PAGE_RESULT_KEY + nonce;
    const deadline = Date.now() + 10 * 60 * 1000;
    setBrowserNotice(a, '请在 Steam 官方页面选择扫码、账号密码或 Steam Guard 登录');
    while (Date.now() < deadline) {
      active(a);
      let value = null;
      try { value = GM_getValue(key, null); } catch (_) {}
      if (value) {
        try { GM_deleteValue(key); } catch (_) {}
        assert(value.v === 1 && value.nonce === nonce, 'STEAM_PAGE_RESULT_INVALID', stage);
        const createdAt = Number(value.createdAt), expires = Number(value.expires);
        assert(Number.isFinite(createdAt) && Number.isFinite(expires) &&
          expires > Date.now() && Date.now() - createdAt <= 120000, 'STEAM_PAGE_RESULT_EXPIRED', stage);
        assert(typeof value.state === 'string' && value.state === a.state, 'STEAM_STATE_MISMATCH', stage);
        const access_token = String(value.access_token || '');
        const steamID = String(value.steamid || '');
        assert(/^[A-Za-z0-9._~+/=-]{8,16384}$/.test(access_token), 'STEAM_PAGE_RESULT_INVALID', stage);
        assert(!steamID || /^\d{17}$/.test(steamID), 'STEAM_ACCOUNT_INVALID', stage);
        const seconds = Number(value.expires_in) || 0;
        assert(seconds >= 0 && seconds < 1e10, 'STEAM_TOKEN_SCHEMA_CHANGED', stage);
        setBrowserNotice(a, 'Steam 官方登录结果已收到，正在兑换游戏账号…');
        a.stage = 'steam_oauth';
        return {access_token, steamID, expires: seconds ? Date.now() + seconds * 1000 : 0,
          retainedUntil: Date.now() + 86400000};
      }
      await sleep(500);
    }
    throw failure('STEAM_BROWSER_TIMEOUT', stage);
  }
  function steamJWTPayload(token) {
    const parts = String(token).split('.');
    assert(parts.length === 3 && parts[1].length < 16384, 'STEAM_TOKEN_SCHEMA_CHANGED', 'steam_poll');
    try { return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))); }
    catch (_) { throw failure('STEAM_TOKEN_SCHEMA_CHANGED', 'steam_poll'); }
  }
  function validateSteamAuth(value, allowMissingSteamID = false) {
    const r = fields(value, ['access_token'], 'steam_auth');
    r.steamID = typeof value?.steamID === 'string' ? value.steamID : '';
    assert(allowMissingSteamID ? (!r.steamID || /^\d{17}$/.test(r.steamID)) : /^\d{17}$/.test(r.steamID),
      'STEAM_ACCOUNT_INVALID', 'steam_auth');
    assert(Number.isFinite(value.retainedUntil) && value.retainedUntil > Date.now() && value.retainedUntil <= Date.now() + 86400000,
      'SAVED_SESSION_EXPIRED', 'steam_auth');
    const expires = Number(value.expires) || 0;
    assert(expires === 0 || (Number.isFinite(expires) && expires > Date.now()), 'SAVED_SESSION_EXPIRED', 'steam_auth');
    return {...r, expires, retainedUntil: value.retainedUntil};
  }
  function steamOAuthCallback(a, raw) {
    const u = parseURL(raw, new Set(['10th-ly-login.sanguosha.com']), 'steam_oauth');
    const p = uniqueParams(u.hash.slice(1), 'steam_oauth');
    assert(p.state === a.state, 'STEAM_STATE_MISMATCH', 'steam_oauth');
    const {access_token} = fields(p, ['access_token'], 'steam_oauth');
    const seconds = Number(p.expires_in) || 0;
    assert(seconds >= 0 && seconds < 1e10, 'STEAM_TOKEN_SCHEMA_CHANGED', 'steam_oauth');
    if (p.steamid) assert(p.steamid === a.steamWeb.steamID, 'ACCOUNT_MISMATCH', 'steam_oauth');
    return {access_token, steamID: a.steamWeb.steamID, expires: seconds ? Date.now() + seconds * 1000 : 0,
      retainedUntil: Date.now() + 86400000};
  }
  function steamConsent(a, html, permission = false) {
    // Official /oauth/login response: #openidForm posts to /oauth/auth.
    // Parse inert HTML, bind every authorization to the original app/state.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const forms = doc.querySelectorAll(permission ? 'form#authForm' : 'form#openidForm');
    assert(forms.length === 1, 'STEAM_OAUTH_FORM_UNAVAILABLE', 'steam_oauth');
    const form = forms[0];
    const target = new URL(form.getAttribute('action'), 'https://steamcommunity.com');
    assert(target.href === 'https://steamcommunity.com/oauth/' + (permission ? 'auth_response' : 'auth') &&
      form.getAttribute('method')?.toUpperCase() === 'POST', 'STEAM_OAUTH_FORM_TARGET_MISMATCH', 'steam_oauth');
    const params = Object.create(null);
    const allowed = new Set(permission ? ['client_id', 'redirect_uri', 'state', 'nonce', 'response_type', 'client_nonce'] :
      ['action', 'client_id', 'state', 'mobileminimal', 'response_type', 'client_nonce', 'nonce']);
    for (const input of form.querySelectorAll('input[type="hidden"]')) {
      const name = input.getAttribute('name'), value = input.getAttribute('value') || '';
      assert(allowed.has(name) && !Object.hasOwn(params, name), 'STEAM_OAUTH_FORM_SCHEMA_CHANGED', 'steam_oauth');
      params[name] = value;
    }
    console.info('[统一登录器]', JSON.stringify({stage: 'steam_consent', action: params.action,
      appMatches: params.client_id === STEAM_APP, stateMatches: params.state === a.state,
      hasNonce: !!params.nonce, hasClientNonce: !!params.client_nonce, permission}));
    assert(params.client_id === STEAM_APP && params.state === a.state && params.response_type === 'token' &&
      (permission || params.mobileminimal === '1'), 'STEAM_OAUTH_FORM_BINDING_MISMATCH', 'steam_oauth');
    assert(params.nonce, 'STEAM_OAUTH_FORM_SCHEMA_CHANGED', 'steam_oauth');
    if (permission) {
      assert(params.redirect_uri === 'https://10th-ly-login.sanguosha.com/steam/oauth/callback.html',
        'STEAM_OAUTH_FORM_TARGET_MISMATCH', 'steam_oauth');
      const scopes = [...form.querySelectorAll('.oauthPermissionText')].map(x => x.textContent.trim());
      console.info('[统一登录器]', JSON.stringify({stage: 'steam_permission', scopes}));
      assert(scopes.length === 1 && /SteamID/.test(scopes[0]), 'STEAM_OAUTH_SCOPE_CHANGED', 'steam_oauth');
      params.response = 'allow';
    } else assert(params.action === 'steam_openid_login', 'STEAM_OAUTH_FORM_SCHEMA_CHANGED', 'steam_oauth');
    return params;
  }
  async function prepareSteam(a) {
    // Verify redirect visibility BEFORE asking for the single user scan.
    const initial = await steamRequest(a, 'steam_preflight', steamOAuthURL(a.state), undefined, true);
    const redirect = responseHeader(initial.responseHeaders, 'location');
    assert(redirect && initial.status >= 300, 'STEAM_REDIRECT_UNAVAILABLE', 'steam_preflight');
    const target = new URL(redirect, steamOAuthURL(a.state));
    assert(target.origin === 'https://steamcommunity.com' && target.pathname === '/oauth/loginform/',
      'STEAM_PREFLIGHT_SESSION_PRESENT', 'steam_preflight');
    let sid = a.cookies.forURL('https://steamcommunity.com/').find(c => c.name === 'sessionid')?.value;
    if (!sid) {
      // Fetch-backed manual redirects omit Set-Cookie in Chrome. The official
      // login document publishes this same CSRF session in g_sessionID.
      // Read only that scalar; never execute the returned document.
      const page = await steamRequest(a, 'steam_session', target.href);
      const end = new URL(page.finalUrl || target.href);
      assert(end.origin === target.origin && end.pathname === target.pathname,
        'STEAM_SESSION_PAGE_MISMATCH', 'steam_session');
      sid = a.cookies.forURL(target.href).find(c => c.name === 'sessionid')?.value;
      if (!sid) {
        const matches = [...page.responseText.matchAll(/\bg_sessionID\s*=\s*["']([a-f0-9]{24,64})["']\s*;/g)];
        assert(matches.length === 1, 'STEAM_SESSION_COOKIE_UNAVAILABLE', 'steam_session');
        sid = matches[0][1];
        a.cookies.read('Set-Cookie: sessionid=' + sid + '; Path=/; Secure', target.href);
      }
    }
    assert(sid && /^[a-f0-9]{24,64}$/.test(sid), 'STEAM_SESSION_COOKIE_UNAVAILABLE', 'steam_preflight');
    a.steamSessionID = sid;
    a.steamChallenge = await steamAPI(a, 'BeginAuthSessionViaQR',
      {device_details: {device_friendly_name: navigator.userAgent, platform_type: 2}, website_id: 'Community'}, 'steam_qr');
    fields(a.steamChallenge, ['client_id', 'request_id', 'challenge_url'], 'steam_qr');
    assert(/^\d+$/.test(a.steamChallenge.client_id) && Number(a.steamChallenge.interval) > 0 &&
      Number(a.steamChallenge.interval) <= 30, 'STEAM_QR_SCHEMA_CHANGED', 'steam_qr');
    renderSteamQR(a);
  }
  async function waitForSteam(a) {
    while (!a.steamWeb) {
      await sleep(Math.max(1000, Number(a.steamChallenge.interval) * 1000)); active(a);
      const r = await steamAPI(a, 'PollAuthSessionStatus',
        {client_id: a.steamChallenge.client_id, request_id: a.steamChallenge.request_id}, 'steam_poll');
      if (r.refresh_token) {
        const {refresh_token, access_token} = fields(r, ['refresh_token', 'access_token'], 'steam_poll');
        // Parsing is only for correlation; server verification remains mandatory.
        const token = steamJWTPayload(access_token);
        assert(/^\d{17}$/.test(token.sub) && Number(token.exp) * 1000 > Date.now(), 'STEAM_ACCOUNT_INVALID', 'steam_poll');
        a.steamWeb = {refresh_token, steamID: token.sub, sessionid: a.steamSessionID};
        a.expires = Date.now() + 1800000;
        steamCheckpoint(a); hideQR(a); delete a.steamChallenge;
        return;
      }
      assert(!r.agreement_session_url, 'STEAM_AGREEMENT_REQUIRED', 'steam_poll');
      if (r.new_client_id) {
        assert(/^\d+$/.test(r.new_client_id), 'STEAM_QR_SCHEMA_CHANGED', 'steam_poll');
        a.steamChallenge.client_id = r.new_client_id;
      }
      if (r.new_challenge_url) { a.steamChallenge.challenge_url = steamQRURL(r.new_challenge_url); renderSteamQR(a); }
    }
  }
  async function authorizeSteam(a) {
    const w = a.steamWeb;
    if (!w.finalized) {
      const r = await steamRequest(a, 'steam_finalize', 'https://login.steampowered.com/jwt/finalizelogin',
        {nonce: w.refresh_token, sessionid: w.sessionid, redir: steamOAuthURL(a.state)});
      let value;
      try { value = JSON.parse(r.responseText); } catch (_) { throw failure('INVALID_JSON', 'steam_finalize'); }
      assert(String(value.steamID) === w.steamID, 'ACCOUNT_MISMATCH', 'steam_finalize');
      assert(Array.isArray(value.transfer_info), 'RESPONSE_SCHEMA_CHANGED', 'steam_finalize');
      const transfers = value.transfer_info.filter(t => {
        try { return new URL(t.url).origin === 'https://steamcommunity.com'; } catch (_) { return false; }
      });
      assert(transfers.length === 1, 'STEAM_TRANSFER_UNAVAILABLE', 'steam_finalize');
      const transfer = transfers[0];
      const u = parseURL(transfer.url, new Set(['steamcommunity.com']), 'steam_transfer');
      assert(u.pathname === '/login/settoken', 'STEAM_TRANSFER_TARGET_MISMATCH', 'steam_transfer');
      fields(transfer.params, ['nonce', 'auth'], 'steam_transfer');
      w.transfer = transfer; w.finalized = true; steamCheckpoint(a);
    }
    if (!w.transferred) {
      const r = await steamRequest(a, 'steam_transfer', w.transfer.url, {...w.transfer.params, steamID: w.steamID});
      let value;
      try { value = JSON.parse(r.responseText); } catch (_) { throw failure('INVALID_JSON', 'steam_transfer'); }
      assert(value.result === 1, 'STEAM_TRANSFER_REJECTED', 'steam_transfer');
      w.transferred = true; steamCheckpoint(a);
    }
    let r = await steamRequest(a, 'steam_oauth', steamOAuthURL(a.state), undefined, true);
    if (!responseHeader(r.responseHeaders, 'location') && r.status === 200) {
      const params = steamConsent(a, r.responseText);
      r = await steamRequest(a, 'steam_consent', 'https://steamcommunity.com/oauth/auth', params, true);
    }
    if (!responseHeader(r.responseHeaders, 'location') && r.status === 200) {
      const params = steamConsent(a, r.responseText, true);
      r = await steamRequest(a, 'steam_permission', 'https://steamcommunity.com/oauth/auth_response', params, true);
    }
    const redirect = responseHeader(r.responseHeaders, 'location');
    assert(redirect, 'STEAM_OAUTH_REDIRECT_UNAVAILABLE', 'steam_oauth');
    a.steam = steamOAuthCallback(a, new URL(redirect, steamOAuthURL(a.state)).href);
    steamCheckpoint(a);
  }
  function steamSigned(access_token, timestamp = Math.floor(Date.now() / 1000)) {
    return {access_token, timestamp, sign: md5('access_token=' + access_token + '&timestamp=' + timestamp + '9YeFQW05TdB8JHjDsc1XiU6tOrm4xvk2')};
  }
  async function exchangeSteam(a) {
    if (a.mode === 'browser' && !a.steam) {
      a.steam = await waitForSteamPage(a);
    } else if (!a.steam && !a.steamWeb) {
      if (!a.steamChallenge) await prepareSteam(a);
      else if (!a.image) renderSteamQR(a);
      await waitForSteam(a);
    }
    if (!a.steam) await authorizeSteam(a);
    a.steam = validateSteamAuth(a.steam, !a.steamWeb);
    if (!a.grant) {
      a.stage = 'steam_grant';
      const r = await transport(a, 'https://10th-ly-login.sanguosha.com/steam/oauth/login',
        {body: steamSigned(a.steam.access_token), form: true, limit: 131072});
      let value;
      try { value = JSON.parse(r.responseText); } catch (_) { throw failure('INVALID_JSON', 'steam_grant'); }
      success(value, 'steam_grant');
      console.info('[统一登录器]', JSON.stringify({stage: 'steam_grant_schema', fields: Object.keys(value.data || {}), channel: value.data?.channel_id}));
      const grant = validateSteamGrant(value.data);
      assert(!a.account || a.account === grant.account, 'ACCOUNT_MISMATCH', 'steam_grant');
      a.account = grant.account; a.grant = grant; a.grantExpires = Date.now() + 90000;
      a.steam.retainedUntil = Date.now() + 86400000;
      remember(a); if (!EMBEDDED) GM_deleteValue(STEAM_PENDING_KEY); delete a.steamWeb; a.cookies.clear();
    }
    return a.grant;
  }

  function biliSigned(input, key, timestamp = Math.floor(Date.now() / 1000)) {
    assert(typeof key === 'string' && key.length > 0 && key.length <= 512,
      'BILI_APPLICATION_CONFIG_MISSING', 'bili_config');
    const data = {...input, timestamp: String(timestamp)};
    assert(!Object.hasOwn(data, 'sign'), 'BILI_DUPLICATE_SIGNATURE', 'bili_sign');
    data.sign = md5(Object.keys(data).sort().map(k => String(data[k])).join('') + key);
    return data;
  }
  async function biliPost(a, stage, path, input) {
    a.stage = stage;
    const response = await transport(a, 'https://wpg-api.biligame.com' + path,
      {form: true, bili: true, body: biliSigned(input, BILI_CONFIG.appKey), limit: 131072});
    let r;
    try { r = JSON.parse(response.responseText); } catch (_) { throw failure('INVALID_JSON', stage); }
    assert(r && typeof r === 'object' && !Array.isArray(r) && Number.isInteger(r.code),
      'BILI_RESPONSE_SCHEMA_CHANGED', stage);
    return r;
  }
  function biliQRURL(r) {
    const data = fields(r, ['ticket', 'redirect_url', 'game_base_id'], 'bili_qr');
    const u = parseURL(data.redirect_url, new Set(['game.bilibili.com']), 'bili_qr');
    assert(u.pathname === '/sdk/scanH5/' && !u.search && !u.hash && data.game_base_id === '110547' &&
      data.ticket.length <= 1024, 'BILI_QR_TARGET_MISMATCH', 'bili_qr');
    u.search = new URLSearchParams({ticket: data.ticket, fromNative: '1', id: data.game_base_id});
    return u.href;
  }
  async function prepareBili(a) {
    assert(BILI_CONFIG.appKey && BILI_CONFIG.macId, 'BILI_APPLICATION_CONFIG_MISSING', 'bili_config');
    if (!a.biliChallenge) {
      a.biliChallenge = success(await biliPost(a, 'bili_generate', '/api/pcg/qrcode/login/generate',
        {game_id: BILI_CONFIG.gameId}), 'bili_generate');
    }
    const text = biliQRURL(a.biliChallenge);
    const matrix = encodeBiliQR(text, {ecc: 'M'});
    assert(matrix, 'BILI_QR_ENCODING_FAILED', 'bili_qr');
    const size = matrix.size + 8, paths = [];
    for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) paths.push('M' + (x + 4) + ',' + (y + 4) + 'h1v1h-1z');
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size * 5 + '" height="' + size * 5 +
      '" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges"><path fill="white" d="M0 0h' + size +
      'v' + size + 'H0z"/><path fill="black" d="' + paths.join('') + '"/></svg>';
    a.image = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
    ui.screen.alt = 'bilibili 扫码登录'; ui.screen.src = a.image; ui.screen.hidden = false;
    a.stage = 'waiting_scan';
  }
  async function waitForBili(a) {
    while (!a.bili) {
      active(a);
      let r;
      try {
        r = await biliPost(a, 'bili_poll', '/api/pcg/qrcode/login/status/poll', {
          game_id: BILI_CONFIG.gameId, is_gov_ver: '1', mac_id: BILI_CONFIG.macId,
          merchant_id: BILI_CONFIG.merchantId, ticket: a.biliChallenge.ticket, zone_id: BILI_CONFIG.zoneId
        });
      } catch (error) {
        if (!['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'HTTP_502', 'HTTP_503', 'HTTP_504'].includes(error.message)) throw error;
        active(a); await sleep(2000); continue;
      }
      if (r.code === 0) {
        assert(Number(r.user_limit_status || 0) === 0, 'BILI_ACCOUNT_RESTRICTED', 'bili_auth');
        a.bili = validateBiliAuth(r);
        a.expires = Date.now() + 600000;
        hideQR(a); delete a.biliChallenge; return;
      }
      assert(r.code === 122022 || r.code === 122024,
        r.code === 122023 ? 'BILI_QR_EXPIRED' : 'OFFICIAL_REJECTED_' + r.code, 'bili_poll');
      a.stage = r.code === 122024 ? 'waiting_confirmation' : 'waiting_scan';
      await sleep(2000);
    }
  }
  async function exchangeBili(a) {
    if (!a.bili) {
      if (!a.image) await prepareBili(a);
      await waitForBili(a);
    }
    assert(a.bili.expires * 1000 > Date.now(), 'SAVED_SESSION_EXPIRED', 'bili_auth');
    if (!a.grant) {
      const r = success(await json(a, 'bili_grant', queryURL('https://10th-ly-login.sanguosha.com/bilibili/login',
        {access_key: a.bili.access_key})), 'bili_grant');
      assert(String(r.data?.channel_id) === '120133', 'BILI_CHANNEL_MISMATCH', 'bili_grant');
      const grant = validateBiliGrant(r.data);
      assert(!a.account || a.account === grant.account, 'ACCOUNT_MISMATCH', 'bili_grant');
      a.account = grant.account; a.grant = grant; a.grantExpires = Date.now() + 90000;
      remember(a);
    }
    return a.grant;
  }
  // ---- OPPO (HeyTap account web QR) ----
  const te = new TextEncoder(), td = new TextDecoder();
  function b64encode(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(s);
  }
  function b64decode(text) {
    const s = atob(text), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  const ascii16 = () => random().slice(0, 16);
  let oppoRsaKey = null;
  function oppoRsa() {
    return oppoRsaKey ||= crypto.subtle.importKey('spki', b64decode(OPPO_RSA_DER),
      {name: 'RSA-OAEP', hash: 'SHA-1'}, false, ['encrypt']);
  }
  async function oppoEnvelope(a, stage, url, body, extraHeaders = {}, useTE = false) {
    active(a); a.stage = stage;
    const payload = JSON.stringify(body);
    const ts = String(Date.now());
    const hmacKey = await crypto.subtle.importKey('raw', te.encode(OPPO_SIGN_SECRET),
      {name: 'HMAC', hash: 'SHA-1'}, false, ['sign']);
    const signMsg = 'requestBody=' + md5(payload) + '&requestTime=' + ts + '&signAlgorithm=HMAC1_SK' + OPPO_SIGN_KEY;
    const sign = b64encode(new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, te.encode(signMsg))));
    const keyBytes = te.encode(ascii16()), ivBytes = te.encode(ascii16());
    const rsa = await oppoRsa();
    const wrap = async v => b64encode(new Uint8Array(await crypto.subtle.encrypt({name: 'RSA-OAEP'}, rsa, v)));
    const aesKey = await crypto.subtle.importKey('raw', keyBytes, {name: 'AES-CTR'}, false, ['encrypt', 'decrypt']);
    const ctr = {name: 'AES-CTR', counter: ivBytes, length: 128}; // CryptoJS-compatible for any realistic IV.
    const cipher = b64encode(new Uint8Array(await crypto.subtle.encrypt(ctr, aesKey, te.encode(payload))));
    const envelope = [await wrap(keyBytes), await wrap(ivBytes), cipher].join('.');
    const zone = -new Date().getTimezoneOffset() / 60;
    const headers = {'Content-Type': 'application/json', 'X-Sign-Key': OPPO_SIGN_KEY, 'X-Sign': sign,
      'X-Envelope-Version': 'V1', 'X-RequestTime': ts, 'X-Biz-AppKey': OPPO_BIZ, 'X-App-AcAppKey': OPPO_AC_KEY,
      'X-Device-Brand': 'HEYTAP', 'X-Device-ClientType': 'WEB', 'X-Web-Client-Type': 'pc',
      'X-App-FromHT': 'true', 'X-App-OverseaClient': 'false', 'Accept-Language': 'zh-CN',
      'X-App-DeviceId': md5(navigator.userAgent), 'X-Timezone': 'GMT' + (zone >= 0 ? '+' : '') + zone,
      ...extraHeaders};
    if (useTE) Object.assign(headers, await oppoTEHeaders(stage, 'POST', body, url, ts));
    const response = await transport(a, url, {oppo: true, body: envelope, headers, stage, limit: 262144});
    let text = response.responseText, value = text;
    if (text.startsWith('"')) {
      try { value = JSON.parse(text); } catch (_) { throw failure('OPPO_ENVELOPE_INVALID', stage); }
    } else if (text.startsWith('{')) {
      try { return JSON.parse(text); } catch (_) { throw failure('INVALID_JSON', stage); }
    }
    assert(typeof value === 'string' && value.length <= 262144, 'OPPO_ENVELOPE_INVALID', stage);
    const plain = await crypto.subtle.decrypt(ctr, aesKey, b64decode(value));
    try { return JSON.parse(td.decode(plain)); } catch (_) { throw failure('INVALID_JSON', stage); }
  }
  function oppoData(value, stage) {
    assert(value && typeof value === 'object' && value.code === 200 &&
      value.data && typeof value.data === 'object',
      'OPPO_REJECTED_' + (Number.isInteger(value?.code) ? value.code : 'UNKNOWN'), stage);
    return value.data;
  }
  let oppoBspReady = null;
  function oppoBsp(stage) {
    return oppoBspReady ||= (async () => {
      // Inject into the page context: the userscript sandbox blocks eval, and
      // the real page window also gives the most faithful fingerprint. Both
      // host pages allow inline scripts (no CSP on /login/index.html;
      // script-src 'unsafe-inline' on /10/pc/index.php, checked 2026-09-22).
      if (!page.bspWwas?.init) {
        const tag = document.createElement('script');
        tag.textContent = OPPO_BSP_SRC;
        (document.head || document.documentElement).append(tag);
        tag.remove();
      }
      assert(page.bspWwas?.init && page.bspWwas?.random, 'OPPO_TE_UNAVAILABLE', stage);
      await page.bspWwas.init();
      return page.bspWwas;
    })();
  }
  async function oppoTEHeaders(stage, method, body, url, ts) {
    const bsp = await oppoBsp(stage);
    const sorted = body && typeof body === 'object' ?
      Object.keys(body).sort().reduce((o, k) => (o[k] = body[k], o), {}) : body;
    const r = await bsp.random(method, sorted, url,
      {'Content-Type': 'application/json', 'X-RequestTime': ts});
    const sig = r && r['x-euler-const'];
    // Official failure markers are 'null::null' / '_fatal_'; never substring-
    // match the base64 payload, which can contain arbitrary letter sequences.
    assert(typeof sig === 'string' && /^\d{8}::[0-9a-f]{64}::\d{10,16}::/.test(sig) &&
      !sig.includes('null::null') && !sig.includes('_fatal_'), 'OPPO_TE_UNAVAILABLE', stage);
    return r;
  }
  async function oppoIdentify(a, processToken) {
    // Official secondary verification (identify-engine.js): iframe the engine
    // page, then run its 'identify' channel handshake — the iframe broadcasts
    // "identify$$channel_loaded$$", we answer "identify$$message_channel_port_passed$$"
    // with a MessageChannel port; result arrives as {type:'validate_success',ticket}.
    active(a); a.stage = 'oppo_identify';
    const url = OPPO_ID_ORIGIN + '/identify-engine-web?sceneId=' + OPPO_SCENE +
      '&bizAppKey=' + OPPO_BIZ + '&region=CN&processToken=' + encodeURIComponent(processToken);
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0008;display:flex;align-items:center;justify-content:center';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;position:relative;width:400px;height:70vh;max-height:640px;overflow:hidden';
    const close = document.createElement('button');
    close.textContent = '×'; close.setAttribute('aria-label', '取消验证');
    close.style.cssText = 'position:absolute;right:6px;top:2px;border:0;background:none;font-size:20px;cursor:pointer;color:#666;z-index:2';
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.style.cssText = 'border:0;width:100%;height:100%';
    box.append(close, frame); overlay.append(box);
    document.body.append(overlay);
    let onMsg = null;
    const cleanup = () => { window.removeEventListener('message', onMsg); overlay.remove(); };
    try {
      const ticket = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(failure('OPPO_IDENTIFY_TIMEOUT', 'oppo_identify')); }, 300000);
        close.addEventListener('click', () => { clearTimeout(timer); cleanup(); reject(failure('OPPO_IDENTIFY_CLOSED', 'oppo_identify')); });
        const deliver = d => {
          if (d && d.type === 'validate_success') {
            clearTimeout(timer); cleanup();
            typeof d.ticket === 'string' && d.ticket ? resolve(d.ticket) :
              reject(failure('OPPO_IDENTIFY_NO_TICKET', 'oppo_identify'));
          } else if (d && d.type === 'close') {
            clearTimeout(timer); cleanup(); reject(failure('OPPO_IDENTIFY_CLOSED', 'oppo_identify'));
          }
        };
        onMsg = e => {
          // Diagnostic: origin + message shape only, never payload contents.
          console.info('[统一登录器]', JSON.stringify({stage: 'oppo_identify_msg', origin: e.origin,
            kind: typeof e.data === 'string' ? 'str:' + e.data.slice(0, 40) : 'obj:' + String(e.data && e.data.type)}));
          if (e.origin !== OPPO_ID_ORIGIN) return;
          if (e.data && e.data.type) { deliver(e.data); return; }
          // Deployed identify-engine-web prefixes the channel name with its
          // delegator tag (ie-index.js vh class, 2026-09-22).
          if (e.data === '[MessageChannelDelegator-name]: identify$$channel_loaded$$') {
            const channel = new MessageChannel();
            channel.port1.onmessage = ev => deliver(ev.data);
            frame.contentWindow.postMessage('[MessageChannelDelegator-name]: identify$$message_channel_port_passed$$',
              OPPO_ID_ORIGIN, [channel.port2]);
          }
        };
        window.addEventListener('message', onMsg);
        // Re-handshake if the engine page navigates/reloads inside the frame.
        frame.addEventListener('load', () => { /* fresh page will broadcast again; listener already in place */ });
      });
      return ticket;
    } finally { cleanup(); }
  }
  async function oppoCaptcha(a) {
    // Server demanded human verification (check code 101001). Show the
    // official slide widget and return captchaCode in the official wrapped
    // form: JSON {success, provider:'DINGXIANG', result: JSON{ret,ticket}}.
    active(a); a.stage = 'oppo_captcha';
    if (!page._dx?.Captcha) {
      await new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = OPPO_CAPTCHA_SDK; tag.crossOrigin = 'anonymous';
        tag.onload = resolve;
        tag.onerror = () => reject(failure('OPPO_CAPTCHA_SDK_UNAVAILABLE', 'oppo_captcha'));
        (document.head || document.documentElement).append(tag);
      });
    }
    assert(page._dx?.Captcha, 'OPPO_CAPTCHA_SDK_UNAVAILABLE', 'oppo_captcha');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0008;display:flex;align-items:center;justify-content:center';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;padding:20px;position:relative;width:320px;min-height:220px;box-sizing:border-box';
    const close = document.createElement('button');
    close.textContent = '×'; close.setAttribute('aria-label', '取消验证');
    close.style.cssText = 'position:absolute;right:6px;top:2px;border:0;background:none;font-size:20px;cursor:pointer;color:#666;z-index:2';
    const container = document.createElement('div');
    container.style.cssText = 'width:280px;margin:0 auto';
    box.append(close, container); overlay.append(box);
    document.body.append(overlay);
    try {
      const ticket = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(failure('OPPO_CAPTCHA_TIMEOUT', 'oppo_captcha')), 120000);
        const done = fn => v => { clearTimeout(timer); fn(v); };
        close.addEventListener('click', () => done(reject)(failure('OPPO_CAPTCHA_CANCELLED', 'oppo_captcha')));
        // Full official option set (uitb-dialog ve constructor): the libs
        // overrides keep sub-resource loads on the official captcha domain.
        const captcha = page._dx.Captcha(container, {appId: OPPO_CAPTCHA_APP, language: 'zh_CN', width: 280,
          isSaaS: false, apiServer: OPPO_CAPTCHA_ORIGIN,
          constIDServer: OPPO_CAPTCHA_ORIGIN + '/udid/c1',
          constID_js: OPPO_CAPTCHA_ORIGIN + '/dx-captcha/libs/const-id.js',
          ua_js: OPPO_CAPTCHA_ORIGIN + '/dx-captcha/libs/greenseer.js',
          publicPath: OPPO_CAPTCHA_ORIGIN + '/dx-captcha/',
          style: 'embed', constID_options: {iframeUrl: false}, de: null,
          voiceLanguage: 'cn', showVoice: false,
          success: done(resolve), fail() {/* 滑块内部允许重试,等待 success */}});
        if (captcha && typeof captcha.on === 'function') {
          captcha.on('loadFail', () => done(reject)(failure('OPPO_CAPTCHA_LOADFAIL', 'oppo_captcha')));
          captcha.on('ready', () => console.info('[统一登录器]', JSON.stringify({stage: 'oppo_captcha', event: 'ready'})));
        }
      });
      assert(ticket !== undefined && String(ticket).length <= 4096, 'OPPO_CAPTCHA_SCHEMA_CHANGED', 'oppo_captcha');
      return JSON.stringify({success: true, provider: 'DINGXIANG',
        result: JSON.stringify({ret: 0, ticket})});
    } finally { overlay.remove(); }
  }
  function oppoConfirmURL(qid) {
    return 'https://muc.heytap.com/account-auth/qrcode-login/index.html?isTranslucentBar=false' +
      '&interruptbackkey=false&nativeType=account://platform.usercenter.com/accountScanLogin' +
      '&intercept=true&src=usercenter-web&qid=' + qid;
  }
  async function prepareOppo(a) {
    const data = oppoData(await oppoEnvelope(a, 'oppo_qr', OPPO_ORIGIN + '/identity/v1/authn/scan-code/generate-qrcode',
      {appId: 'usercenter-web'}), 'oppo_qr');
    const {qid, qrcodeUrl} = fields(data, ['qid', 'qrcodeUrl'], 'oppo_qr');
    const image = await transport(a, qrcodeUrl, {oppo: true, binary: true, limit: 262144, stage: 'oppo_qr'});
    const bytes = new Uint8Array(image.response);
    // Official QR endpoint returns JPEG (checked 2026-09-21).
    assert(bytes.length >= 16 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 &&
      bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217, 'OPPO_QR_IMAGE_INVALID', 'oppo_qr');
    a.oppoQid = qid;
    a.image = URL.createObjectURL(new Blob([bytes], {type: 'image/jpeg'}));
    ui.screen.alt = 'OPPO 扫码登录'; ui.screen.src = a.image; ui.screen.hidden = false;
    ui.oppoLink.textContent = ui.oppoLink.href = oppoConfirmURL(qid);
    ui.oppoLink.hidden = false;
    a.stage = 'waiting_scan';
  }
  async function waitForOppo(a) {
    while (!a.oppoConfirmed) {
      active(a); a.stage = 'oppo_poll';
      const data = oppoData(await oppoEnvelope(a, 'oppo_poll', OPPO_ORIGIN + '/identity/v1/authn/scan-code/check-qrcode',
        {qid: a.oppoQid}), 'oppo_poll');
      const status = data.qrCodeStatus;
      if (status === 'CONFIRMED') { a.oppoConfirmed = true; hideQR(a); return; }
      assert(status === 'INITIAL' || status === 'SCANNED',
        status === 'CANCELED_LOGIN' || status === 'CANCELED_AUTHORIZE' ? 'OPPO_QR_CANCELED' : 'OPPO_QR_STATUS_' + status, 'oppo_poll');
      a.stage = status === 'SCANNED' ? 'waiting_confirmation' : 'waiting_scan';
      await sleep(3000);
    }
  }
  async function waitForOppoPage(a) {
    const stage = 'oppo_browser_login';
    const nonce = String(a.browserNonce || '');
    assert(/^[a-f0-9]{16,64}$/.test(nonce), 'OPPO_BROWSER_NONCE_MISSING', stage);
    const key = OPPO_PAGE_RESULT_KEY + nonce;
    const deadline = Date.now() + 10 * 60 * 1000;
    setBrowserNotice(a, '请在 OPPO 官方登录窗口完成手机号、密码、短信或扫码登录，完成后会自动继续');
    while (Date.now() < deadline) {
      active(a);
      let value = null;
      try { value = GM_getValue(key, null); } catch (_) {}
      if (value) {
        try { GM_deleteValue(key); } catch (_) {}
        assert(value.v === 1 && value.nonce === nonce, 'OPPO_PAGE_RESULT_INVALID', stage);
        const createdAt = Number(value.createdAt), expires = Number(value.expires);
        assert(Number.isFinite(createdAt) && Number.isFinite(expires) &&
          expires > Date.now() && Date.now() - createdAt <= 120000, 'OPPO_PAGE_RESULT_EXPIRED', stage);
        let href;
        try { href = new URL(String(value.href)); } catch (_) { throw failure('OPPO_PAGE_ORIGIN_MISMATCH', stage); }
        assert(href.protocol === 'https:' && href.hostname === 'game-login.heytap.com' &&
          href.pathname.startsWith('/game-union-h5/h5/client-login/'), 'OPPO_PAGE_ORIGIN_MISMATCH', stage);
        const code = typeof value.code === 'string' ? value.code : '';
        const ticket = typeof value.ticket === 'string' ? value.ticket : '';
        assert(/^[A-Za-z0-9+/=_.~-]{8,4096}$/.test(code) ||
          /^[A-Za-z0-9+/=_.~-]{8,4096}$/.test(ticket), 'OPPO_PAGE_RESULT_INVALID', stage);
        setBrowserNotice(a, 'OPPO 官方登录结果已收到，正在兑换游戏账号…');
        a.stage = 'oppo_account';
        return {code, ticket};
      }
      await sleep(500);
    }
    throw failure('OPPO_BROWSER_TIMEOUT', stage);
  }
  async function exchangeOppo(a) {
    if (!a.session && !a.oppo && !a.oppoAccount && !a.oppoCode && !a.oppoConfirmed) {
      if (a.mode === 'browser') {
        const result = await waitForOppoPage(a);
        assert(result.code, 'OPPO_TICKET_EXCHANGE_UNAVAILABLE', 'oppo_browser_login');
        a.oppoCode = result.code;
      } else {
        if (!a.oppoQid) await prepareOppo(a);
        await waitForOppo(a);
      }
    }
    if (a.oppoConfirmed && !a.oppoCode) {
      // Web-side chain, official scan-login page flow (index-8a1f3023.js): the
      // confirmed qid is the accountId. Official clients always send the BSP
      // risk header on check (useSignHeaderInterceptor); vendored bspWwas
      // computes it with this browser's genuine fingerprint.
      let checkValue = await oppoEnvelope(a, 'oppo_check', OPPO_ORIGIN + '/identity/v1/authn/check',
        {accountId: a.oppoQid, sceneId: OPPO_SCENE, fromRegisterPage: false, deviceToken: '{}'},
        {'X-Validation-Method': 'scan'}, true);
      if (checkValue?.code === 101001) {
        // Official retry: solve the human-verification widget, then resubmit
        // check with captchaCode/captchaAppId (use-validate-a4d83ab4.js).
        const captchaCode = await oppoCaptcha(a);
        checkValue = await oppoEnvelope(a, 'oppo_check', OPPO_ORIGIN + '/identity/v1/authn/check',
          {accountId: a.oppoQid, sceneId: OPPO_SCENE, fromRegisterPage: false, deviceToken: '{}',
            captchaCode, captchaAppId: OPPO_CAPTCHA_APP},
          {'X-Validation-Method': 'scan'}, true);
      }
      const check = oppoData(checkValue, 'oppo_check');
      const {processToken} = fields(check, ['processToken'], 'oppo_check');
      const validate = oppoData(await oppoEnvelope(a, 'oppo_validate', OPPO_ORIGIN + '/identity/v1/authn/validate',
        {processToken, validateParam: {}}, {'X-Validation-Method': 'scan'}), 'oppo_validate');
      // Secondary verification: engine iframe when the server asks; otherwise
      // validate carries the ticket directly.
      let ticket = typeof validate.ticket === 'string' && validate.ticket ? validate.ticket : '';
      if (!ticket) {
        assert(validate.verificationUrl, 'OPPO_VALIDATE_SCHEMA_CHANGED', 'oppo_validate');
        ticket = await oppoIdentify(a, processToken);
      }
      const judge = oppoData(await oppoEnvelope(a, 'oppo_judge', OPPO_ORIGIN + '/completion/v1/redirect-judge',
        {processToken, ticket, reRegister: false}), 'oppo_judge');
      assert(!judge.completionUrl, 'OPPO_COMPLETION_REQUIRED', 'oppo_judge');
      const login = oppoData(await oppoEnvelope(a, 'oppo_login', OPPO_ORIGIN + '/identity/web/v1/authn/login',
        {processToken, ticket, callback: OPPO_CALLBACK, codeChallenge: ''}), 'oppo_login');
      console.info('[统一登录器]', JSON.stringify({stage: 'oppo_login_schema', fields: Object.keys(login)}));
      let code = '';
      for (const value of Object.values(login)) {
        const match = typeof value === 'string' && /[?&]code=([^&]+)/.exec(value);
        if (match) { code = match[1]; break; }
      }
      if (!code && typeof login.code === 'string') code = login.code;
      assert(code && code.length <= 4096, 'OPPO_LOGIN_SCHEMA_CHANGED', 'oppo_login');
      a.oppoCode = code; a.oppoConfirmed = false; delete a.oppoQid;
    }
    if (a.oppoCode && !a.oppoAccount && !a.oppo) {
      a.oppoAccount = await exchangeOppoToken(a);
      delete a.oppoCode;
    }
    if (!a.oppo) {
      a.oppo = await exchangeOppoGameAccount(a);
      delete a.oppoAccount;
    }
    if (!a.grant) {
      const grant = await exchangeOppoGrant(a);
      assert(!a.account || a.account === grant.account, 'ACCOUNT_MISMATCH', 'sgs_grant');
      a.account = grant.account; a.grant = grant; a.grantExpires = Date.now() + 90000;
      remember(a);
    }
    return a.grant;
  }
  function oppoSDKHeaders(url, timestamp = Date.now()) {
    const t = String(timestamp);
    const javaEncode = v => [...String(v)].map(ch => /[A-Za-z0-9.*_-]/.test(ch) ? ch :
      ch === ' ' ? '+' : '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join('');
    const ua = javaEncode('OPPO/PGFM10/33/android/V13.1.0/6100206/1001/0');
    const ocs = javaEncode('OPPO/PGFM10/33/android/V13.1.0/6100206/1001/0/ColorOS/0');
    const id = '11#';
    const parsed = new URL(url);
    const path = parsed.pathname, query = decodeURIComponent(parsed.search.slice(1));
    let material = OPPO_SDK_OAK + OPPO_SDK_SALT + ocs + t + id + path + query;
    material += String(material.length) + OPPO_SDK_LONGSALT;
    return {'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json',
      'User-Agent': ua, 't': t, 'id': id, 'ocs': ocs, 'oak': OPPO_SDK_OAK, 'pid': '1001',
      'sdkversion': '6100206', 'sign': md5(material)};
  }
  async function exchangeOppoToken(a) {
    // WebLoginCode2TokenRequest (official SDK service bb class): POST JSON
    // OutLoginReq to isdk.heytapmobi.com/gamesdk/outUser/findTokenByCode.
    // The gateway verifies an MD5 sign header over
    // oak+salt+ocs+t+id+path+query+length+longSalt (c/c.d, 2026-09-22);
    // device fields are fixed browser-side values, consistent with the sign.
    a.stage = 'oppo_token';
    const body = {code: a.oppoCode, launchId: '', requestId: random(), androidId: '',
      appPackage: 'com.sgs10th.nearme.gamecenter', appVersion: '1.0.344', brand: 'OPPO',
      deviceModel: 'PGFM10', deviceName: '', hardwareType: 'web', osVersion: '33', sdkVersion: '6100206'};
    const path = '/gamesdk/v2/outUser/findTokenByCode';
    const headers = oppoSDKHeaders('https://isdk.heytapmobi.com' + path);
    const response = await transport(a, 'https://isdk.heytapmobi.com' + path,
      {oppo: true, body, stage: 'oppo_token', limit: 262144, headers});
    let value;
    try { value = JSON.parse(response.responseText); } catch (_) { throw failure('INVALID_JSON', 'oppo_token'); }
    assert(value && typeof value === 'object', 'RESPONSE_SCHEMA_CHANGED', 'oppo_token');
    const data = value.data && typeof value.data === 'object' ? value.data : value;
    console.info('[统一登录器]', JSON.stringify({stage: 'oppo_token_schema', code: value.code,
      // Value shapes only (lengths), never contents — hunting for an ssoid carrier.
      shapes: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v.length : typeof v]))}));
    const token = typeof data.token === 'string' && data.token || typeof data.primaryToken === 'string' && data.primaryToken;
    assert(token && token.length <= 4096, 'OPPO_REJECTED_' +
      (String(value.code).replace(/[^A-Za-z0-9_-]/g, '').toUpperCase().slice(0, 40) || 'UNKNOWN'), 'oppo_token');
    return {accountToken: token};
  }
  function oppoGameCredentials(value) {
    const stage = 'oppo_game_account';
    assert(value && String(value.code) === '200', 'OPPO_GAME_ACCOUNT_REJECTED', stage);
    assert(Array.isArray(value.gameAccounts) && value.gameAccounts.length === 1,
      'OPPO_GAME_ACCOUNT_SELECTION_REQUIRED', stage);
    const game = value.gameAccounts[0];
    assert(game && game.pkgName === 'com.sgs10th.nearme.gamecenter', 'OPPO_GAME_PACKAGE_MISMATCH', stage);
    const parent = fields(value.userDto, ['userId'], stage).userId;
    assert(game.userId === parent, 'OPPO_GAME_ACCOUNT_OWNER_MISMATCH', stage);
    // Only the single, owned account path is supported. Preserve explicit
    // server confirmation requirements; do not select a shared account.
    assert(game.accountSharingTag === 0 && !game.accountSharingId && !value.accountSharingId &&
      game.needFaceScan === false && game.needLoginPop === false &&
      !game.accountIsProtected && !game.tradeLimit,
      'OPPO_GAME_ACCOUNT_CONFIRMATION_REQUIRED', stage);
    const ssoid = fields(game, ['id'], stage).id;
    const token = fields(value, ['ticket'], stage).ticket;
    assert(ssoid.length <= 4096 && token.length <= 4096, 'OPPO_GAME_ACCOUNT_SCHEMA_CHANGED', stage);
    return {credentialType: 'game-ticket', token, ssoid,
      accountName: typeof game.accountName === 'string' ? game.accountName.slice(0, 128) : ''};
  }
  async function exchangeOppoGameAccount(a) {
    a.stage = 'oppo_game_account';
    const token = fields(a.oppoAccount, ['accountToken'], a.stage).accountToken;
    assert(token.length <= 4096, 'OPPO_ACCOUNT_TOKEN_INVALID', a.stage);
    // URI.getQuery() in the SDK signs decoded percent escapes, retaining '+'.
    const url = 'https://isdk.heytapmobi.com/gamesdk/v2/user/login?adId=&pkgName=' +
      'com.sgs10th.nearme.gamecenter&token=' + encodeURIComponent(token);
    const response = await transport(a, url, {oppo: true, stage: a.stage,
      limit: 262144, headers: oppoSDKHeaders(url)});
    let value;
    try { value = JSON.parse(response.responseText); } catch (_) { throw failure('INVALID_JSON', a.stage); }
    const credentials = oppoGameCredentials(value);
    console.info('[统一登录器]', {stage: a.stage, code: 200, accountCount: 1});
    return credentials;
  }
  async function exchangeOppoGrant(a) {
    // Same anysdk v1/login contract as the verified WeGame route, with the OPPO
    // native APK's own constants (manifest 1.0.344: appid 485, package_id 78,
    // group 205; ThirdLoginMessage pid 10030). Grant endpoint name follows the
    // wegame/bilibili pattern and is marked for runtime verification.
    assert(a.oppo?.credentialType === 'game-ticket' && a.oppo.token && a.oppo.ssoid,
      'OPPO_TOKEN_SCHEMA_CHANGED', 'sgs_session');
    const data = {thirdparty: 'oppo', pid: '10030', gid: '485', uid: a.oppo.ssoid,
      username: a.oppo.accountName || '', session: a.oppo.token,
      thirdAdult: '0', thirdRealNameStatus: '0', thirdAge: '0'};
    const r = success(await json(a, 'sgs_session', 'https://anysdk.dobest.cn/v1/login', {
      appid: CONFIG.TD_SDK_APP_ID, channel: '', package_id: '78', platform_id: '10030', platform_name: 'oppo',
      base: {group_id: '205', device_id: a.device, version_code: '344', version_name: '1.0.344',
        device_mobile: '', device_network: '', device_os: 'android', device_os_version: '', device_pixel: '', device_type: '1', device_version_code: ''},
      ext: JSON.stringify({session_type: 'st_dummy'}), data
    }), 'sgs_session');
    let payload = r.data;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) { throw failure('RESPONSE_SCHEMA_CHANGED', 'sgs_session'); }
    }
    a.session = fields(payload, ['session'], 'sgs_session').session;
    a.stage = 'sgs_grant';
    const g = success(await json(a, 'sgs_grant', queryURL('https://10th-sdk-login.sanguosha.com/oppo/app/login', {
      ticket: a.session, is_adult: '1' // Official SDK default for the verified WeGame route; OPPO path pending runtime QA.
    })), 'sgs_grant');
    console.info('[统一登录器]', JSON.stringify({stage: 'oppo_grant_schema', fields: Object.keys(g.data || {}), channel: g.data?.channel_id}));
    return validateGrant(g.data);
  }

  async function exchange(a) {
    active(a);
    if (a.provider === 'vivo') return exchangeVivo(a);
    if (a.provider === 'huawei') return exchangeHuawei(a);
    if (a.provider === 'xiaomi') return exchangeXiaomi(a);
    if (a.provider === 'steam') return exchangeSteam(a);
    if (a.provider === 'bilibili') return exchangeBili(a);
    if (a.provider === 'oppo') return exchangeOppo(a);
    if (a.provider === 'wx' && !a.wegame && !a.wxCode && !a.session) {
      if (!a.wxUUID) await prepareWX(a);
      await waitForWX(a);
    }
    if (a.provider !== 'wx' && !a.qq && !a.wegame && !a.session) {
      if (!a.redirect) { if (!a.image) await prepare(a); await waitForQQ(a); }
      a.qq = await redeem(a);
      hideQR(a); a.cookies.clear(); a.qrsig = ''; a.redirect = '';
    }
    if (!a.session && !a.wegame) {
      if (!a.wegameResponse) a.wegameResponse = await json(a, 'wegame', 'https://m.wegame.com.cn/web/oauth2.0/union_login', {
        appid: CONFIG.wga_appid, app_key: CONFIG.wga_app_key, login_type: 'game_login',
        third_type: a.provider === 'wx' ? 1 : 0, login_state_type: a.provider === 'wx' ? 1 : 2,
        login_state_openid: a.provider === 'wx' ? '' : a.qq.openid,
        login_state_token: a.provider === 'wx' ? a.wxCode : a.qq.access_token
      });
      const r = success(a.wegameResponse, 'wegame');
      a.wegame = {...fields(r, ['openid', 'access_token'], 'wegame'),
        uid: String(r.pc_rail_id || r.openid), channel: String(r.channel_result || '00000000'),
        ...nativeSession(r)};
    }
    if (!a.session) {
      if (!a.wegame.access_token || (a.wegame.atExpires && Date.now() >= a.wegame.atExpires)) await refreshNative(a);
      const wg = a.wegame;
      if (!a.channel) {
        const r = await json(a, 'channel', queryURL('https://m.wegame.com.cn/web/oauth2.0/get_channel_info', {
          access_token: wg.access_token, channel: '00000000'
        }));
        a.channel = String(r.last_month_channel || wg.channel);
      }
      const ext = {session_type: 'st_dummy', sessionId: 'hy_gameid', pfkey: 'pfKey',
        pf: (a.provider === 'wx' ? 'WeChat' : 'QQ') + '_m-' + a.channel + '-android-00000000-wegame_m_' + CONFIG.wga_appid + '_' + wg.uid,
        openid: wg.openid, openkey: wg.access_token};
      const r = success(await json(a, 'sgs_session', 'https://anysdk.dobest.cn/v1/login', {
        appid: CONFIG.TD_SDK_APP_ID, channel: CONFIG.TD_CHANNEL_ID || CONFIG.channel_id || '',
        package_id: CONFIG.TD_CONFIG_ID, platform_id: CONFIG.any_platform_id, platform_name: CONFIG.any_platform_name,
        base: {group_id: CONFIG.TD_GROUP_ID || '0', device_id: a.device, version_code: '314', version_name: '1.0.314',
          device_mobile: '', device_network: '', device_os: 'android', device_os_version: '', device_pixel: '', device_type: '1', device_version_code: ''},
        ext: JSON.stringify(ext), data: {thirdparty: CONFIG.any_platform_name, pid: CONFIG.any_platform_id,
          gid: CONFIG.TD_SDK_APP_ID, uid: wg.uid, username: wg.openid, session: wg.access_token,
          thirdAdult: '0', thirdRealNameStatus: '0', thirdAge: '0'}
      }), 'sgs_session');
      let data = r.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) { throw failure('RESPONSE_SCHEMA_CHANGED', 'sgs_session'); }
      }
      a.session = fields(data, ['session'], 'sgs_session').session;
    }
    if (!a.grant) {
      const r = success(await json(a, 'sgs_grant', queryURL('https://10th-sdk-login.sanguosha.com/wegame/app/login', {
        ticket: a.session, is_adult: '1' // Official SDK default for this verified route.
      })), 'sgs_grant');
      const grant = validateGrant(r.data);
      assert(!a.account || a.account === grant.account, 'ACCOUNT_MISMATCH', 'sgs_grant');
      a.account = grant.account; a.grant = grant; a.grantExpires = Date.now() + 90000;
      remember(a);
    }
    return a.grant;
  }

  // NativeLogin.loginSuccess (official APK 1.0.314) uses at_expires seconds
  // from receipt, minus one second, and saves ct for refresh_ct_proxy. The
  // server's is_timeout response revokes renewal. Never invent an 8-hour lease.
  function nativeSession(r) {
    const seconds = Number(r.at_expires);
    const atExpires = Number.isFinite(seconds) && seconds > 1 && seconds < 1e9 ?
      Date.now() + (seconds - 1) * 1000 : 0;
    const ct = typeof r.ct === 'string' && r.ct.length <= 32768 ? r.ct : '';
    return {atExpires, ct};
  }
  async function refreshNative(a) {
    assert(a.wegame.ct, 'SAVED_SESSION_EXPIRED', 'restore');
    const r = await json(a, 'channel_restore', 'https://m.wegame.com.cn/web/oauth2.0/refresh_ct_proxy', {
      appid: CONFIG.wga_appid, app_key: CONFIG.wga_app_key, openid: a.wegame.openid, ct: a.wegame.ct
    });
    if (Object.hasOwn(r, 'code')) success(r, 'channel_restore');
    assert(Number(r.is_timeout || 0) !== 1, 'SAVED_SESSION_EXPIRED', 'channel_restore');
    assert(!r.openid || r.openid === a.wegame.openid, 'ACCOUNT_MISMATCH', 'channel_restore');
    const auth = nativeSession(r);
    assert(auth.ct && auth.atExpires > Date.now(), 'RESPONSE_SCHEMA_CHANGED', 'channel_restore');
    a.wegame = {...a.wegame, ...fields(r, ['access_token'], 'channel_restore'), ...auth};
    if (a.account) remember(a);
  }
  function remembered(options = {}) {
    return savedSession(options.provider || '', options.profileId || '', options.id || '');
  }
  function remember(a) {
    if (!a || (attempt && attempt !== a)) return false;
    if (!a.savedId) { a.savedId = random(); a.created = Date.now(); }
    a.expires = Infinity; // QR deadline is not an authenticated session lifetime.
    if (a.saveSession === false) return false;
    const provider = a.provider || 'qq';
    const profileId = sessionText(a.__sgsProfileId || a.profileId, 256);
    if (!SESSION_PROVIDERS.has(provider) || !SESSION_PROFILE_PATTERN.test(profileId)) return false;
    const record = sessionStoreRecord({v: 3, provider, profileId, id: a.savedId,
      expires: SESSION_RECORD_EXPIRES_FOREVER, created: a.created || Date.now(), updated: Date.now(), account: a.account,
      device: a.device, session: a.session, wegame: a.wegame, bili: a.bili,
      steam: a.steam, oppo: a.oppo, xiaomi: a.xiaomi, vivo: a.vivo,
      huawei: a.huawei});
    // Provider payloads are retained only after the protocol-specific validation
    // and only when the user opted into local session restoration.
    if (!record || (provider === 'bilibili' && !record.bili) ||
      (provider === 'steam' && !record.steam) || (provider === 'oppo' && !record.oppo)) return false;
    try { GM_setValue(sessionStoreKey(profileId, provider), record); }
    catch (_) { return false; }
    delete a.qq; delete a.wxCode; delete a.wxUUID; delete a.wegameResponse;
    return true;
  }
  function forgetSessions(profileId) {
    const wanted = sessionText(profileId, 256);
    if (!SESSION_PROFILE_PATTERN.test(wanted)) return 0;
    let removed = 0;
    for (const {key, record} of sessionRecords()) {
      if (record.profileId !== wanted) continue;
      try { GM_deleteValue(key); removed += 1; } catch (_) {}
    }
    return removed;
  }
  function forget(a) {
    if (a?.provider === 'steam') { try { GM_deleteValue(STEAM_PENDING_KEY); } catch (_) {} }
    if (a?.savedId) {
      for (const {key, record} of sessionRecords()) {
        if (record.id !== a.savedId || (a.provider && record.provider !== a.provider)) continue;
        try { GM_deleteValue(key); } catch (_) {}
      }
      try {
        const legacy = GM_getValue(SESSION_KEY, null);
        if (legacy?.id === a.savedId) GM_deleteValue(SESSION_KEY);
      } catch (_) {}
    }
    try { if (sessionStorage.getItem(TAB_KEY) === a?.savedId) sessionStorage.removeItem(TAB_KEY); } catch (_) {}
    try { if (a?.savedId && GM_getValue(HANDOFF_KEY, null)?.id === a.savedId) GM_deleteValue(HANDOFF_KEY); } catch (_) {}
    discardHandoff();
  }
  function bindProfile(profileId, clientToken = '', saveSession = true) {
    const current = attempt;
    if (!current || (clientToken && current.clientToken !== clientToken)) return false;
    const cleaned = sessionText(profileId, 256);
    if (!SESSION_PROFILE_PATTERN.test(cleaned)) return false;
    current.__sgsProfileId = cleaned;
    current.profileId = cleaned;
    current.saveSession = saveSession !== false;
    if (current.saveSession) remember(current);
    return true;
  }
  function canReplaySavedAuth(a) {
    if (!a || !a.provider) return false;
    const now = Date.now();
    if (a.provider === 'qq' || a.provider === 'wx') {
      return !!(a.wegame && (a.wegame.access_token || a.wegame.ct));
    }
    if (a.provider === 'bilibili') {
      return !!(a.bili?.access_key && Number(a.bili.expires) * 1000 > now);
    }
    if (a.provider === 'steam') {
      return !!(a.steam?.access_token && Number(a.steam.retainedUntil) > now);
    }
    if (a.provider === 'oppo') return !!(a.oppo?.token && a.oppo?.ssoid);
    if (a.provider === 'xiaomi' || a.provider === 'vivo') {
      return !!a[a.provider]?.session;
    }
    if (a.provider === 'huawei') {
      return !!(a[a.provider]?.auth?.session && Number(a[a.provider].auth.expires) > now);
    }
    return false;
  }
  function staleGrantRejected(error) {
    return !!error && ['sgs_grant', 'bili_grant', 'steam_grant'].includes(error.stage) &&
      /^(?:OFFICIAL_REJECTED_|SAVED_SESSION_EXPIRED)/.test(error.message || '');
  }
  function gameRouteForAttempt(a) {
    const route = GAME_ROUTES[a?.provider || ''];
    return route && location.pathname === route.path ? route : null;
  }
  function invalidateOnError(a, error) {
    if (a && attempt && attempt !== a) return;
    const clientToken = a?.clientToken || '';
    if (a && error.stage === 'channel_restore' && error.message === 'RESPONSE_SCHEMA_CHANGED') {
      // An unsupported renewal response is not proof of revoked credentials.
      // Keep the saved checkpoint until an explicit channel click replaces it;
      // never trap that click in the same failed renewal or auto-start a scan.
      a.renewalFailed = true;
    }
    if (/^OFFICIAL_REJECTED_|ACCOUNT_MISMATCH|SAVED_SESSION_EXPIRED|BILI_CHANNEL_MISMATCH/.test(error.message)) {
      // A rejected ticket is a re-authorization signal, not proof that the
      // account itself should be removed. Keep both the account and the saved
      // upstream credential available for a later explicit retry.
      if (a) a.reauthRequired = true;
      error.reauthRequired = true;
      restoreMiddle(clientToken); clearAttempt(clientToken);
    }
  }
  function unlock(expectedToken = '') {
    if (!releaseLock) return;
    if (expectedToken && lockOwnerToken !== expectedToken) return;
    const release = releaseLock;
    releaseLock = null; lockOwnerToken = '';
    release();
  }
  async function resume(options = {}) {
    const provider = sessionText(options.provider, 32);
    const profileId = sessionText(options.profileId, 256);
    const required = options.required === true;
    let saved = savedSession(provider, profileId);
    if (!saved && profileId) {
      saved = sessionRecords().map(item => item.record)
        .filter(record => record.profileId === profileId)
        .sort((left, right) => Number(right.updated || 0) - Number(left.updated || 0))[0] || null;
    }
    if (!saved && !provider && !profileId) saved = remembered();
    if (!saved) {
      if (required) throw failure('SAVED_SESSION_NOT_FOUND', 'restore');
      return false;
    }
    try {
      if (saved.provider === 'bilibili') {
        saved.bili = validateBiliAuth(saved.bili);
        assert(saved.bili.expires * 1000 > Date.now(), 'SAVED_SESSION_EXPIRED', 'restore');
      } else if (saved.provider === 'steam') {
        if (!(Number(saved.steam?.retainedUntil) > 0)) {
          saved.steam = {...saved.steam, retainedUntil: Date.now() + 86400000};
        }
        saved.steam = validateSteamAuth(saved.steam, true);
      } else if (saved.provider === 'oppo') {
        assert(saved.oppo?.credentialType === 'game-ticket' && saved.oppo.token && saved.oppo.ssoid,
          'SAVED_SESSION_INVALID', 'restore');
      } else if (saved.provider === 'qq' || saved.provider === 'wx') {
        assert(saved.session || saved.wegame?.access_token || saved.wegame?.ct, 'SAVED_SESSION_INVALID', 'restore');
        if (!saved.session && saved.wegame?.atExpires && Date.now() >= saved.wegame.atExpires && !saved.wegame.ct) {
          throw failure('SAVED_SESSION_EXPIRED', 'restore');
        }
      } else {
        assert(saved.session, 'SAVED_SESSION_INVALID', 'restore');
      }
    } catch (error) {
      // Never discard the last recoverable record just because this attempt
      // could not validate it. A stale record must remain available for an
      // explicit re-authorization and for future automatic recovery.
      if (required) throw error;
      return false;
    }
    if (attempt) {
      if (!required) return false;
      const previousToken = attempt.clientToken || '';
      restoreMiddle(previousToken);
      clearAttempt(previousToken);
    }
    if (releaseLock) unlock(lockOwnerToken);
    busy = true; setProvidersBusy(true);
    const clientToken = normalizeClientToken(options.clientToken || random());
    const generation = ++runGeneration;
    activeRunGeneration = generation;
    try {
      await acquireLock(clientToken);
      if (activeRunGeneration !== generation) { unlock(clientToken); return; }
      assert(!disposed, 'PAGE_CLOSED', 'restore');
      attempt = {state: random(), provider: saved.provider, savedId: saved.id, created: saved.created, clientToken,
        generation, mode: 'restore', restored: true, saveSession: options.saveSession !== false,
        __sgsProfileId: profileId || saved.profileId, expires: Infinity, device: saved.device || random(),
        account: saved.account, session: saved.session, wegame: saved.wegame, bili: saved.bili,
        steam: saved.steam, oppo: saved.oppo, xiaomi: saved.xiaomi, vivo: saved.vivo,
        huawei: saved.huawei, stage: 'restore', cookies: new Cookies(), requests: new Set()};
      let rebuilt = false;
      // Prefer a still-valid saved SGS session. If only that session became
      // stale, rebuild it once from the provider credential that is already
      // stored locally. This applies to every supported provider, not WeGame
      // alone, and is safe because the upstream credential is revalidated by
      // the provider-specific exchange.
      try {
        await exchange(attempt);
      } catch (error) {
        if (!staleGrantRejected(error) || !canReplaySavedAuth(attempt)) throw error;
        attempt.session = ''; attempt.grant = null; delete attempt.grantExpires;
        attempt.stage = 'restore'; rebuilt = true;
        await exchange(attempt);
      }
      if (rebuilt) remember(attempt);
      // Account management can run on the game page itself. That page has no
      // official login box, so a successful restore must navigate directly
      // through the same one-time handoff used by the normal Enter button.
      if (gameRouteForAttempt(attempt)) {
        openGame(attempt);
        return true;
      }
      await showMiddle(attempt);
      return true;
    } catch (error) {
      if (activeRunGeneration !== generation) return;
      invalidateOnError(attempt, error);
      if (attempt?.clientToken === clientToken) clearAttempt(clientToken);
      if (required) throw error;
      if (!disposed) errorUI(error, clientToken);
      return false;
    } finally {
      unlock(clientToken);
      if (activeRunGeneration === generation) { busy = false; setProvidersBusy(false); }
    }
  }

  function hideQR(a) {
    if (a && attempt && attempt !== a) return;
    if (ui) { ui.screen.hidden = true; ui.screen.removeAttribute('src'); }
    if (ui?.oppoLink) { ui.oppoLink.hidden = true; ui.oppoLink.removeAttribute('href'); ui.oppoLink.textContent = ''; }
    if (a?.image) { URL.revokeObjectURL(a.image); a.image = ''; }
  }
  function setProvidersBusy(value) {
    for (const key of ['qq', 'wx', 'bilibili', 'steam', 'oppo', 'xiaomi', 'vivo', 'huawei']) if (ui?.[key]) ui[key].disabled = value;
  }
  function clearAttempt(expectedToken = '') {
    const a = attempt;
    const ownedToken = a?.clientToken || '';
    if (a && expectedToken && ownedToken !== expectedToken) return false;
    attempt = null;
    if (a) {
      for (const cancel of [...a.requests]) cancel();
      hideQR(a); a.cookies.clear();
      for (const key of Object.keys(a)) delete a[key];
    }
    unlock(expectedToken || ownedToken);
    return !!a;
  }
  async function acquireLock(clientToken = '') {
    assert(navigator.locks?.request, 'WEB_LOCKS_UNAVAILABLE', 'setup');
    return new Promise((resolve, reject) => {
      navigator.locks.request('jnd-wegame-qq-login', {ifAvailable: true}, async lock => {
        if (!lock) { reject(failure('OTHER_TAB_ACTIVE', 'setup')); return; }
        lockOwnerToken = clientToken;
        await new Promise(release => { releaseLock = release; resolve(); });
      }).catch(() => reject(failure('WEB_LOCK_FAILED', 'setup')));
    });
  }
  function errorUI(error, clientToken = '') {
    if (clientToken && attempt && attempt.clientToken !== clientToken) return;
    const current = attempt;
    const eventToken = clientToken || current?.clientToken || boundClientToken || '';
    const provider = current?.provider || '';
    const code = /^[A-Z][A-Z_0-9-]*$/.test(error?.message || '') ? error.message : 'LOGIN_FLOW_FAILED';
    const stage = /^[a-z_]+$/.test(error?.stage || '') ? error.stage : current?.stage || 'setup';
    const reauthRequired = !!(error?.reauthRequired || current?.reauthRequired);
    const recoverable = error?.recoverable === true;
    const detail = {error: code, stage, version: VERSION,
      ...(reauthRequired ? {reauthRequired: true} : {}),
      ...(recoverable ? {recoverable: true} : {})};
    microError = {code, stage, ...(reauthRequired ? {reauthRequired: true} : {}),
      ...(recoverable ? {recoverable: true} : {})};
    ui.output.textContent = JSON.stringify(detail, null, 2);
    ui.menu.hidden = false; ui.handle.setAttribute('aria-expanded', 'true');
    record(stage, performance.now(), 0, code);
    emitDirectEvent({type: 'error', provider, code, stage, clientToken: eventToken,
      reauthRequired, recoverable});
  }
  function expireAttempt(expectedToken = '') {
    const current = attempt;
    if (!current || (expectedToken && current.clientToken !== expectedToken) ||
      Date.now() < Number(current.expires || 0)) return false;
    const clientToken = current.clientToken || '';
    const error = failure('LOGIN_FLOW_EXPIRED', 'expiry');
    error.recoverable = true;
    if (!disposed) errorUI(error, clientToken);
    // Expiry only invalidates this in-memory flow. The account and its saved
    // upstream credential remain available for the next direct-login attempt.
    restoreMiddle(clientToken);
    clearAttempt(clientToken);
    return true;
  }
  function cancelFlow(clientToken = '', reason = 'user') {
    const current = attempt;
    if (!current) return false;
    const token = typeof clientToken === 'string' ? clientToken : '';
    if (token && current.clientToken !== token) return false;
    const provider = current.provider || '';
    const eventToken = current.clientToken || token;
    const cancelReason = ['user', 'popup_closed', 'superseded', 'cleanup'].includes(reason) ? reason : 'user';
    microError = null;
    restoreMiddle(eventToken);
    clearAttempt(eventToken);
    if (ui) ui.output.textContent = '';
    // Internal cleanup must not overwrite the real error that just failed.
    // Only an explicit user action or a closed login surface is a cancellation.
    if (!['superseded', 'cleanup'].includes(cancelReason)) {
      emitDirectEvent({type: 'cancel', provider, clientToken: eventToken, reason: cancelReason});
    }
    return true;
  }
  function restoreMiddle(expectedToken = '') {
    if (!middle) return false;
    if (expectedToken && middle.ownerToken && middle.ownerToken !== expectedToken) return false;
    if (!expectedToken && attempt?.clientToken && middle.ownerToken &&
      middle.ownerToken !== attempt.clientToken) return false;
    middle.node.remove(); middle.box.classList.remove('jnd-wg-active');
    for (const [node, display] of middle.hidden) node.style.display = display;
    middle.box.classList.toggle('login-box-unity', middle.wasUnity);
    middle = null;
    return true;
  }
  async function entryDOM(a) {
    const read = () => {
      const box = document.querySelector('.login-box'), choice = document.querySelector('#selectGame');
      return box && choice ? {box, choice} : null;
    };
    const found = read(); if (found) return found;
    return new Promise((resolve, reject) => {
      const done = (error, result) => {
        observer.disconnect(); clearTimeout(timer); a.requests.delete(cancel);
        if (error) reject(error); else resolve(result);
      };
      const cancel = () => done(failure('PAGE_CLOSED', 'entry_ui'));
      const observer = new MutationObserver(() => { const result = read(); if (result) done(null, result); });
      const timer = setTimeout(() => done(failure('OFFICIAL_ENTRY_DOM_CHANGED', 'entry_ui')), 10000);
      a.requests.add(cancel); observer.observe(document.documentElement, {childList: true, subtree: true});
    });
  }
  async function showMiddle(a) {
    active(a);
    if (middle) {
      if (middle.ownerToken === a.clientToken) return;
      throw failure('ENTRY_UI_BUSY', 'entry_ui');
    }
    const result = success(await json(a, 'entry_config', 'https://web-login-api.sanguosha.com/v1_1/background/info'), 'entry_config');
    // Official /login/x/index uses MICRO_ENV_FLAG_10TH and only gameId 100.
    // 10th-client.0b24.js, checked 2026-09-21; SHA-256:
    // 8835472d253415c4e6b15c38083dd6a8e04737e11f13d76e685991cdc94ecc44.
    // Keep the official wide artwork and base 732px frame; do not stretch a
    // 273px tile from the three-entry page. Recheck config/DOM at runtime.
    const image = fields(result.data?.['100client_game'], ['img', 'flag_img'], 'entry_config');
    for (const value of Object.values(image)) parseURL(value, new Set(['wwwoss.sanguosha.com']), 'entry_config');
    // The official web nickname lookup accepts a CAS account name. There is
    // no verified pre-game UserID lookup for this channel; leave its slot empty.
    active(a);
    const {box, choice: officialChoice} = await entryDOM(a);
    active(a);
    const node = document.createElement('div'); node.id = 'jnd-wg-game-choice';
    node.className = officialChoice.className;
    const style = document.createElement('style');
    // The host pages share the base frame/account styles. These dimensions
    // come from 10th-client.0b24.css (SHA-256 75cc9ec8234a7b202897ab03c5e3ad0feb58e81f91e741fb385dc321dbc66b19).
    style.textContent = '.login-box.jnd-wg-active #sgsPassApp,.login-box.jnd-wg-active #toggleThirdLogin,.login-box.jnd-wg-active #selectGame{display:none!important}#jnd-wg-game-choice .game-item[gid="100"]{height:202px;width:550px;background-repeat:no-repeat;position:relative}#jnd-wg-game-choice .game-label{pointer-events:none}#jnd-wg-game-choice .goto-btn:disabled{opacity:.45;cursor:default}';
    const list = document.createElement('div'); list.className = 'game-list';
    const card = document.createElement('div'); card.className = 'game-item on';
    card.setAttribute('gid', '100');
    card.setAttribute('aria-label', '三国杀·一将成名');
    card.style.backgroundImage = 'url("' + image.img + '")';
    const flag = document.createElement('label'); flag.className = 'game-label';
    flag.style.backgroundImage = 'url("' + image.flag_img + '")'; card.append(flag);
    list.append(card);
    const row = document.createElement('div'); row.className = 'account-box';
    const accountInfo = document.createElement('div'); accountInfo.className = 'account-info';
    const name = document.createElement('span'); name.className = 'nickname ell'; name.textContent = '';
    const logout = document.createElement('a'); logout.className = 'quit-btn'; logout.href = '#'; logout.textContent = '退出登录';
    logout.addEventListener('click', e => { e.preventDefault(); void logoutAccount(a); });
    const enter = document.createElement('input'); enter.type = 'button'; enter.className = 'goto-btn'; enter.title = '进入游戏';
    enter.addEventListener('click', () => enterGame(a));
    accountInfo.append(name, logout); row.append(accountInfo, enter); node.append(style, list, row);
    const hidden = [...box.querySelectorAll('#sgsPassApp,#toggleThirdLogin,#selectGame')].map(el => [el, el.style.display]);
    for (const [el] of hidden) el.style.display = 'none';
    middle = {node, hidden, box, enter, ownerToken: a.clientToken,
      wasUnity: box.classList.contains('login-box-unity')};
    box.classList.remove('login-box-unity');
    box.classList.add('jnd-wg-active'); box.append(node);
    a.stage = 'ready'; ui.output.textContent = '扫码成功';
    let returnedProfileId = '';
    try {
      returnedProfileId = emitDirectEvent({
        type: 'ready', provider: a.provider, account: a.account || '',
        identityAccount: a.provider === 'xiaomi' ? (a.xiaomi?.uid || '') : '',
        nickname: a.provider === 'xiaomi' ? (a.xiaomi?.username || '') : '', clientToken: a.clientToken
      }) || '';
    } catch (_) {}
    const profileId = SESSION_PROFILE_PATTERN.test(returnedProfileId) ? returnedProfileId :
      (SESSION_PROFILE_PATTERN.test(a.__sgsProfileId || a.profileId || '') ? (a.__sgsProfileId || a.profileId) : '');
    if (profileId) bindProfile(profileId, a.clientToken, a.saveSession !== false);
  }
  // Presentation from https://login.dobest.cn/sdo/Logout/appLogout.php,
  // css/exit.css and images/{loading,bg}.png, checked 2026-09-21.
  // CSS SHA-256: 8958c4eea6d1d8b4d546ba8eb6b56c5b0ecf6b7d95c2001075e7568755241420.
  // These are the original sprites, not a remote executable dependency.
  const LOGOUT_ART = {
    loading: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQQAAAE8CAMAAAAR/z/4AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAVxQTFRF+Pj4+/v7+fn59vb29PT08PDw+vr68vLy9/f38fHx9fX18/Pz6urq5eXl4uLit7e3PK/o5ubm7Ozs7u7u6Ojo5+fn4+Pj4eHh6enp6+vr7e3t5OTk4ODgsLCwttr109PTvr6+7+/v5/P8/f7/bMPu9Pr+srKytbW1u7u71dXVwcHBurq6mNXzw+f4ubm5uLi4ysrK1tbWzc3Ny8vLxMTE19fX9/v+0uj5s7Oz8Pf9/P3/6vf97vb9dsXueMfvUbfqlM3xR7Pp7ff9xsbGz+v5uNv1zMzMxcXFvb29jNDxyOj5yOP4v7+/vN32j9HyasLtXbrrbsDttra20ez6RrLp2+36sbGx6PP8ZsDtwMDAuuP3rtz19vv+vOT3tLS0RLLpw8PDwsLCzs7OrNz18fj9RrPpyMjIycnJ0un5ZL/t6vT87/f9acLtvLy8/Pz83d3d/f39/v7+////AAAAgBjaegAAAHR0Uk5T/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wD2dMVrAAADwElEQVR42uzc509aURiAcRRnK0XwYkHbqmUIKu69R92jarV772kZ/39S7NVzm7RpYvSQvLzPc3MSvt5fONwTcvP6CrornuYrfdiaX2jW18L8loeQ3ExkZxR+B2ayic3kOcJen9q90Ld3hvA0EVeLEL//wkX4/kDxz+K9hIuwlFSMkFxyEZpVPyGbQQABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAqBiED5rHiTx/5SJ8UT1Y5rGL8E71iKFnLsLsnOJhU3OzLsL4xEEiu6xQYDmbOPg87iLEpyYW948UDqA72l+ceB8/m702PXW8vbt6R1uru9vHU9Nns9eGg/Iavnv5Hn39Nh4/H0UYFLidg8WrDQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAsIyQlxcIIIAAAggggAACCCCUGyEnLxBAAAEEEEAAAYTyIZzICwQQQAABBBBAKBNClbxAAAEEEEAAoRwIdfICAQQQQAABhHIgVMsLBBBAAAEEEMqB4JMXCCCAAAII1hEa5AUCCCCAAIJ1BL+8QAABBBBAsI5wTV4ggAACCCBYR6iRFwgggAACCNYRrssLBBBAAAEE6wj18gIBBBBAsIvQKC8QQAABBBCsI9TKCwQQQAABBOsIXfK6eoQWeYFgBaFNXiBYQQjLCwQrCDF5gWAFoUleIIBgCyEqLxCsIDjyAsEKQkReIFhBCMkLBCsIAXmBAIIthHZ5gWAFoVVeIIBgC+GGvEAAAQSLCDflBQIIthBuyQsEGwiZoLwyV41QJBBAAAEEEED4F0LBPxS8rayHpRUcaygYBH8q0xpQV3uoNZPyG4SxoZDSxoYMwkDACUXU5YScSGDAIKScSNRRVyQacaIpgzDZFGtSWDQW+xMhrLNYODxpELpb2lr09fueX3oIjbUa6yqtbg+hXmWNpeUhHNao7dD7j9GvtqB3WPKprKG0+g1Cf1211jyE3iq19XoIJ2rzENJ5taUNwg8Qir6Ngto2DEKnXoROg7CjF2HHIDzRi9BjEHp0AuRBcHtjEF7rRRg1CKMgFH3reg9L6wZhJacWYcUgfMwXNAKc3vQngzCodzuMGIS1nMrypWvNILzN5bQyDHvbwae2Qd5U4XUdEEAAAQQQ/o+Q7qzI0hdCGOmoyEYuhNDxsyLrAAEEEEAAAQQQLo/AoRkEEEAAAYS/+iXAAH7LJZyR+putAAAAAElFTkSuQmCC',
    bg: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAEECAMAAAAS6JRXAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAARFQTFRF8/Pz9PT0+Pj49fX19/f3sLCwBZXtGMH1Tsb2CafwBpruE7z0DbPzELf0OLn0Pr/1RsP2B6DvCq7yFr/1Vcr3MrPyLa7xKanwX8/4W833FrXzJ6nwKbTyNrn0Or71Ssn2Rsb2Tcb2IKjwU8r3Wc33GK3xFbj0Ja3xV8z3Jq3xUMv3CJbtLsD1Dq/yPMf2EqHvG7TzH8L1MLv0N8X2L7LyGKfwK67xKbz1QsL2EJzuUcn3CZvuGrz0OMb2P8L1DaLvI8D1Jrn0CZftNMT2IqnwHqTvC5zuW874C6jwNr718fHx8vLy7+/v+fn59vb28PDw+vr6+/v76+vr/Pz87e3t7u7u/f397Ozs/v7+////AAAAWKKhHgAAAFt0Uk5T////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////AJz6uLwAAADhSURBVHja7MjpXgFxFIfxI2IiM4RSkSxF2QrtCyqkSJZs938hzf9zXv4uYA7m++55yFPqRJXLaw97offMoZJohFg1R+mwcvrsY4XHMGnK67mf3SU1jQKm7tEua96bRYZhVIp77OrELIN0Pfa5w87iukKRbD3IbmoR5YI+nrysfLuvpNqUd7OH4wOl9eamJbCXvewle20DGgGxawbWb02A2PUHVmn1gIw1ADLWF5CxvoGMJYIDWLCcwIL1A2QsF7BgbQELVh/IWL9AxhoCsWsMxK4pWKU1BxuxFsBem7T+BRgAMQcN8hsU57YAAAAASUVORK5CYII='
  };
  async function logoutTransition() {
    // Fail explicitly if the packaged official artwork cannot be decoded.
    await Promise.all(Object.values(LOGOUT_ART).map(src => new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => reject(failure('LOGOUT_ASSET_UNAVAILABLE', 'logout')), 2000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(failure('LOGOUT_ASSET_UNAVAILABLE', 'logout')); };
      image.src = src;
    })));
    assert(!disposed, 'PAGE_CLOSED', 'logout');
    const host = document.createElement('div'); host.id = 'jnd-wegame-logout';
    const root = host.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = `:host{all:initial;display:block;position:fixed;inset:0;background:#fff;z-index:2147483647;font:12px/1.5 serif;color:#666}*{padding:0;margin:0;box-sizing:content-box}.topBox{width:215px;margin:100px auto;background:url("${LOGOUT_ART.loading}") no-repeat;height:40px;padding:20px;overflow:hidden}.message{text-align:center}.exitLoding{background:url("${LOGOUT_ART.loading}") left -300px no-repeat;height:10px;width:216px;margin:10px 0 0}.exitLoding span{display:block;background:url("${LOGOUT_ART.bg}") repeat-x;height:10px}`;
    const box = document.createElement('div'); box.className = 'topBox';
    const message = document.createElement('p'); message.className = 'message';
    const percent = document.createElement('span');
    message.append('系统正在为您退出，请稍候... ', percent, '%'); // Exact official copy approved by the user.
    const bar = document.createElement('p'); bar.className = 'exitLoding';
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', '退出登录');
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
    const fill = document.createElement('span'); bar.append(fill);
    box.append(message, bar); root.append(style, box); document.body.append(host);
    try {
      // Official CheckTimeout: 0..30 in steps of 2, then 30..100 in steps
      // of 7, one step every 40ms. This is presentation, not server progress.
      for (let step = 0; step <= 25 && !disposed; step++) {
        const value = step <= 15 ? step * 2 : (step - 15) * 7 + 30;
        fill.style.width = value + '%'; percent.textContent = String(value);
        bar.setAttribute('aria-valuenow', String(value));
        await sleep(40);
      }
    } finally { host.remove(); }
  }
  async function logoutAccount(a) {
    if (busy || disposed || attempt !== a) return;
    const clientToken = a.clientToken || '';
    busy = true; ui.qq.disabled = true;
    try {
      // Revoke local restoration before any animation; closing/reloading this
      // page during the transition must not restore the logged-out account.
      forget(a); clearAttempt(clientToken); ui.output.textContent = ''; ui.menu.hidden = true;
      ui.handle.setAttribute('aria-expanded', 'false');
      await logoutTransition();
    } catch (error) {
      if (!disposed) errorUI(error);
    } finally {
      if (!disposed) { restoreMiddle(clientToken); busy = false; ui.qq.disabled = false; }
    }
  }

  async function enterGame(a) {
    if (busy || !a || !middle || middle.ownerToken !== a.clientToken) return;
    busy = true; middle.enter.disabled = true;
    let navigating = false;
    try {
      active(a); await acquireLock();
      assert(a.savedId, 'SAVED_SESSION_INVALID', 'handoff');
      // Only a restored attempt depends on the persistent session record. A
      // fresh scan must remain enterable even when the save switch is off.
      if (a.restored) assert(sessionForAttempt(a)?.id === a.savedId, 'SAVED_SESSION_EXPIRED', 'handoff');
      // A selection page may remain open longer than its initial game grant.
      if (!a.grant || Date.now() >= a.grantExpires) {
        delete a.grant; delete a.session; await exchange(a);
      }
      openGame(a); navigating = true;
    } catch (error) {
      invalidateOnError(a, error);
      errorUI(error); unlock();
    } finally { if (!navigating) { busy = false; if (middle) middle.enter.disabled = false; } }
  }
  function openGame(a) {
    active(a);
    assert(a.grant && Date.now() < a.grantExpires, 'GRANT_EXPIRED', 'handoff');
    const name = PREFIX + random();
    const isBili = a.provider === 'bilibili';
    const isSteam = a.provider === 'steam';
    const payload = isSteam ? {grant: validateSteamGrant(a.grant)} : isBili ?
      {bili: validateBiliAuth(a.bili), grant: validateBiliGrant(a.grant)} : {grant: validateGrant(a.grant)};
    const savedProvider = a.provider || 'qq';
    const route = GAME_ROUTES[savedProvider];
    assert(route, 'PROVIDER_UNAVAILABLE', 'handoff');
    const routeChannel = route.channel ?? payload.grant?.channel_id;
    assert(routeChannel !== null && routeChannel !== undefined && String(routeChannel) !== '',
      'PLATFORM_CHANNEL_MISMATCH', 'handoff');
    writeHandoff({name, id: a.savedId, provider: savedProvider, clientToken: a.clientToken,
      expires: Date.now() + HANDOFF_TTL, ...payload});
    // Only an opaque routing nonce crosses the navigation. Standalone mode uses
    // private GM storage; the embedded host uses one-time tab storage and
    // consumes it synchronously at document-start.
    try {
      if (!EMBEDDED) sessionStorage.setItem(TAB_KEY, a.savedId);
      window.name = name;
      if (a.__sgsProfileId && a.saveSession !== false) sessionStorage.setItem('sgs-direct-profile-v1', a.__sgsProfileId);
      else sessionStorage.removeItem('sgs-direct-profile-v1');
      emitDirectEvent({type: 'navigate', provider: a.provider, account: a.account || '',
        profileId: a.__sgsProfileId || '', clientToken: a.clientToken});
      location.assign(ORIGIN + route.path +
        (route.query ? '?channel_id=' + encodeURIComponent(String(routeChannel)) : ''));
    }
    catch (_) { window.name = ''; discardHandoff(); throw failure('NAVIGATION_FAILED', 'handoff'); }
    delete a.grant; delete a.session;
  }
  async function start(provider = 'qq', options = {}) {
    const mode = ['vivo', 'oppo', 'steam'].includes(provider) && options?.mode === 'browser' ? 'browser' : 'qr';
    assert(['qq', 'wx', 'bilibili', 'steam', 'oppo', 'xiaomi', 'vivo', 'huawei'].includes(provider), 'PROVIDER_UNAVAILABLE', 'setup');
    const profileId = sessionText(options?.profileId, 256);
    if (profileId) assert(SESSION_PROFILE_PATTERN.test(profileId), 'PROFILE_ID_INVALID', 'setup');
    const saveSession = options?.saveSession !== false;
    const clientToken = normalizeClientToken(options?.clientToken || random());
    const generation = ++runGeneration;
    activeRunGeneration = generation;
    if (middle && (attempt?.provider || 'qq') === provider && attempt?.grant && Date.now() < attempt.grantExpires) {
      middle.node.scrollIntoView({block: 'center'}); return;
    }
    busy = true; setProvidersBusy(true); ui.output.textContent = '';
    try {
      const requestedState = mode === 'browser' && options?.state ? String(options.state) : '';
      if (requestedState) assert(/^[a-f0-9]{32}$/.test(requestedState), 'BROWSER_STATE_INVALID', 'setup');
      // A new explicit start supersedes the previous flow. Releasing its lock and
      // clearing its attempt before acquiring ours prevents a stale finally block
      // from cancelling the provider the user just selected.
      if (attempt) {
        const previousToken = attempt.clientToken || '';
        restoreMiddle(previousToken);
        clearAttempt(previousToken);
      }
      if (releaseLock) unlock(lockOwnerToken);
      assert(!disposed, 'PAGE_CLOSED', 'setup');
      await acquireLock(clientToken);
      if (activeRunGeneration !== generation) { unlock(clientToken); return; }
      assert(!disposed, 'PAGE_CLOSED', 'setup');
      attempt = {state: requestedState || random(), provider, mode, device: random(), clientToken, generation,
        saveSession, profileId, __sgsProfileId: profileId,
        expires: Date.now() + (mode === 'browser' ? 11 * 60 * 1000 : 10 * 60 * 1000),
        stage: 'setup', cookies: new Cookies(), requests: new Set()};
      if (provider === 'steam' && mode === 'qr') restoreSteamCheckpoint(attempt);
      if (mode === 'browser' && options?.nonce) attempt.browserNonce = String(options.nonce);
      if (!releaseLock) await acquireLock(clientToken);
      const a = attempt;
      assert(a && a.clientToken === clientToken, 'ATTEMPT_EXPIRED', 'setup');
      active(a);
      // Preserve completed exchange stages on an interrupted run. A used game
      // grant is never replayed, nor is an expired grant relabelled as fresh.
      if (a.grant && Date.now() >= a.grantExpires) {
        restoreMiddle(a.clientToken); delete a.grant; delete a.session;
      }
      if (!a.grant) restoreMiddle(a.clientToken);
      await exchange(a);
      if (activeRunGeneration !== generation || attempt !== a) return;
      await showMiddle(a);
    } catch (error) {
      if (activeRunGeneration !== generation) return;
      const current = attempt;
      if (current?.clientToken && current.clientToken !== clientToken) return;
      invalidateOnError(current, error);
      hideQR(current); errorUI(error, clientToken);
      if (!current?.redirect && !current?.qq && !current?.wxCode && !current?.wegame && !current?.bili && !current?.biliChallenge &&
        !current?.steamChallenge && !current?.steamWeb && !current?.steam && !current?.oppoQid && !current?.oppoConfirmed &&
        !current?.oppoCode && !current?.oppoAccount && !current?.oppo && !current?.xiaomiChallenge &&
        !current?.xiaomiLocation && !current?.xiaomiCode && !current?.xiaomiOAuth && !current?.xiaomi &&
        !current?.vivoQR && !current?.vivoConfirmed && !current?.vivo && !current?.huawei) clearAttempt(clientToken);
    } finally {
      unlock(clientToken);
      if (activeRunGeneration === generation) { busy = false; setProvidersBusy(false); }
    }
  }
  function mount() {
    if (document.getElementById('jnd-wegame-login')) {
      console.error('[统一登录器]', {error: 'OLD_SCRIPT_ACTIVE', version: VERSION}); return;
    }
    const host = document.createElement('div'); host.id = 'jnd-wegame-login';
    host.style.cssText = 'position:fixed;right:24px;top:120px;z-index:2147483646';
    const root = host.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = ':host{font:14px system-ui;color:#202124}button{font:inherit;cursor:pointer;border:1px solid #bbb;border-radius:8px;background:#fff;color:#202124;padding:10px 16px}button:disabled{opacity:.45;cursor:default}#handle{background:#263445;color:white;border:0;touch-action:none;user-select:none}#menu{position:absolute;right:0;top:48px;width:280px;max-width:calc(100vw - 32px);background:white;padding:14px;border:1px solid #ddd;border-radius:12px;box-shadow:0 6px 24px #0003}#menu[hidden],img[hidden]{display:none}.option{display:block;width:100%;margin:6px 0}img{display:block;max-width:100%;margin:auto}output{display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px}';
    const handle = document.createElement('button'); handle.id = 'handle'; handle.textContent = '统一登录器'; handle.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div'); menu.id = 'menu'; menu.hidden = true;
    const qq = document.createElement('button'); qq.className = 'option'; qq.textContent = '以 QQ 登录 WeGame';
    const wx = document.createElement('button'); wx.className = 'option'; wx.textContent = '以微信登录 WeGame';
    const bilibili = document.createElement('button'); bilibili.className = 'option'; bilibili.textContent = 'bilibili 扫码登录';
    const steam = document.createElement('button'); steam.className = 'option'; steam.textContent = 'Steam 登录';
    const oppo = document.createElement('button'); oppo.className = 'option'; oppo.textContent = 'OPPO 扫码登录';
    const xiaomi = document.createElement('button'); xiaomi.className = 'option'; xiaomi.textContent = '小米扫码登录';
    const vivo = document.createElement('button'); vivo.className = 'option'; vivo.textContent = 'vivo 扫码登录';
    const huawei = document.createElement('button'); huawei.className = 'option'; huawei.textContent = '华为扫码登录';
    const screen = document.createElement('img'); screen.hidden = true; screen.alt = 'QQ';
    const oppoLink = document.createElement('a'); oppoLink.hidden = true; oppoLink.target = '_blank'; oppoLink.rel = 'noreferrer';
    oppoLink.style.cssText = 'display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px;font-size:12px';
    const output = document.createElement('output'); output.setAttribute('aria-live', 'polite');
    menu.append(qq, wx, bilibili, steam, oppo, xiaomi, vivo, huawei, screen, oppoLink, output); root.append(style, handle, menu); document.body.append(host);
    ui = {host, handle, menu, qq, wx, bilibili, steam, oppo, xiaomi, vivo, huawei, screen, oppoLink, output};
    let down = null, moved = false;
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const r = host.getBoundingClientRect(); down = {x: e.clientX, y: e.clientY, left: r.left, top: r.top};
      moved = false; handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 5) moved = true;
      if (!moved) return;
      host.style.right = 'auto'; host.style.left = Math.max(0, Math.min(innerWidth - host.offsetWidth, down.left + dx)) + 'px';
      host.style.top = Math.max(0, Math.min(innerHeight - handle.offsetHeight, down.top + dy)) + 'px';
      menu.style.right = parseFloat(host.style.left) < 310 ? 'auto' : '0';
      menu.style.left = parseFloat(host.style.left) < 310 ? '0' : 'auto';
    });
    handle.addEventListener('pointerup', () => { down = null; });
    handle.addEventListener('pointercancel', () => { down = null; moved = true; });
    handle.addEventListener('click', () => {
      if (moved) { moved = false; return; }
      menu.hidden = !menu.hidden; handle.setAttribute('aria-expanded', String(!menu.hidden));
    });
    qq.addEventListener('click', () => start('qq'));
    wx.addEventListener('click', () => start('wx'));
    bilibili.addEventListener('click', () => start('bilibili'));
    steam.addEventListener('click', () => start('steam'));
    oppo.addEventListener('click', () => start('oppo'));
    xiaomi.addEventListener('click', () => start('xiaomi'));
    vivo.addEventListener('click', () => start('vivo'));
    huawei.addEventListener('click', () => start('huawei'));
    const expiryTimer = setInterval(() => {
      if (attempt && Date.now() >= attempt.expires) expireAttempt(attempt.clientToken || '');
    }, 1000);
    window.addEventListener('pagehide', () => {
      disposed = true; clearInterval(expiryTimer); clearAttempt();
    }, {once: true});
    cleanupHandoff();
    // 微端桥（仅壳内）：隐藏浮动按钮，把二维码与状态投影给壳，由壳的原生弹窗呈现；
    // 流程本身不变，壳只调用 start／cancel。blob 二维码转成 data URL 才能跨窗口显示。
    // 投影是归一化的：所有渠道都是同一形状 {qr: data URL 或空, text: 玩家可读的一句话, error: {code, stage} 或 null}；
    // 浮动面板里的 JSON 诊断只留在面板和 console，不进壳。
    if (page.__JND_HOST?.kind === 'micro') {
      host.style.display = 'none';
      const listeners = new Set();
      let qrData = '', qrSource = '';
      const ERROR_TEXT = {
        LOGIN_CANCELLED: '已取消', OTHER_TAB_ACTIVE: '另一个窗口正在登录，请先完成或关闭它',
        QR_EXPIRED: '二维码已过期，请重新发起', REQUEST_TIMEOUT: '连接超时，请重试', NETWORK_ERROR: '网络连接失败，请重试',
        ACCOUNT_MISMATCH: '扫码账号与当前账号不一致', WEB_LOCKS_UNAVAILABLE: '当前环境不支持扫码登录',
        VIVO_BROWSER_TIMEOUT: '等待 Vivo 官方登录超时，请重新打开登录窗口',
        OPPO_BROWSER_TIMEOUT: '等待 OPPO 官方登录超时，请重新打开登录窗口',
        STEAM_BROWSER_TIMEOUT: '等待 Steam 官方登录超时，请重新打开官方登录窗口',
        STEAM_PAGE_RESULT_INVALID: 'Steam 官方回调格式异常，请重新登录',
        STEAM_STATE_MISMATCH: 'Steam 回调状态不匹配，本次授权已拒绝',
        STEAM_PAGE_RESULT_EXPIRED: 'Steam 官方回调已过期，请重新登录',
        VIVO_ACCOUNT_SELECTION_REQUIRED: 'Vivo 账号有多个子账号，请先在官方页面明确选择后重试',
        VIVO_REAL_NAME_REQUIRED: 'Vivo 账号未完成实名认证或当前状态不允许登录',
        BILI_GAME_CALLBACK_UNAVAILABLE: '已进入游戏页，但游戏没有就绪，未能交接触摸登录回调',
        BILI_CHANNEL_MISMATCH: 'B 站游戏页渠道号不匹配，请刷新后重试',
      };
      const humanError = code => {
        if (ERROR_TEXT[code]) return ERROR_TEXT[code];
        if (/_QR_EXPIRED$/.test(code)) return ERROR_TEXT.QR_EXPIRED;
        if (/_REJECTED/.test(code)) return '对方拒绝了本次登录，请重试';
        if (/_TIMEOUT$/.test(code)) return ERROR_TEXT.REQUEST_TIMEOUT;
        if (/^ERR_|NETWORK/.test(code)) return ERROR_TEXT.NETWORK_ERROR;
        return '登录未完成，请重试';
      };
      const humanText = () => {
        if (microError) return humanError(microError.code);
        if (!attempt) return '';
        if (attempt.stage === 'ready') return attempt.mode === 'browser' ? '官方网页登录成功，正在进入游戏' : '扫码成功，正在进入游戏';
        if (attempt.mode === 'browser') return attempt.browserNotice || '请在官方登录窗口完成登录，完成后会自动继续';
        if (attempt.browserNotice) return attempt.browserNotice;
        if (!ui.screen.hidden && qrData) return '请用手机扫码';
        return '正在获取二维码…';
      };
      const snapshot = () => ({busy, provider: attempt?.provider || null, mode: attempt?.mode || '', stage: attempt?.stage || '',
        notice: attempt?.browserNotice || '', qr: ui.screen.hidden ? '' : qrData,
        text: humanText(), error: microError ? {...microError} : null});
      const notify = () => { const s = snapshot(); for (const l of [...listeners]) { try { l(s); } catch (_) {} } };
      const refreshQr = async () => {
        const src = ui.screen.hidden ? '' : ui.screen.getAttribute('src') || '';
        if (src === qrSource) { notify(); return; }
        qrSource = src; qrData = '';
        if (src) {
          try {
            const blob = await (await fetch(src)).blob();
            qrData = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => resolve(''); r.readAsDataURL(blob); });
          } catch (_) { qrData = ''; }
          if (qrSource !== src) return;
        }
        notify();
      };
      const observer = new MutationObserver(records => {
        if (records.some(r => r.target === screen)) void refreshQr(); else notify();
      });
      observer.observe(screen, {attributes: true, attributeFilter: ['src', 'hidden']});
      observer.observe(output, {childList: true, characterData: true, subtree: true});
      const resumeSession = resume;
      const bindLoginProfile = bindProfile;
      const forgetProfileSessions = forgetSessions;
      page.__JND_UNIFIED_LOGIN = Object.freeze({
        version: VERSION,
        providers: Object.freeze(['qq', 'wx', 'steam', 'oppo', 'vivo', 'huawei', 'xiaomi', 'bilibili']),
        start(provider, options = {}) { microError = null; const p = start(provider, options); notify(); return Promise.resolve(p).finally(notify); },
        resume(options = {}) {
          microError = null;
          const p = resumeSession(options);
          notify();
          return Promise.resolve(p).finally(notify);
        },
        bindProfile(profileId, clientToken = '', saveSession = true) {
          const bound = bindLoginProfile(profileId, clientToken, saveSession);
          notify();
          return bound;
        },
        forgetSessions(profileId) {
          const removed = forgetProfileSessions(profileId);
          notify();
          return removed;
        },
        hasSession(provider = '', profileId = '') {
          return !!savedSession(provider, profileId);
        },
        cancel(clientToken = '', reason = 'user') {
          const cancelled = cancelFlow(clientToken, reason);
          if (cancelled) notify();
          return cancelled;
        },
        enter() { return attempt ? enterGame(attempt) : Promise.resolve(); },
        get: snapshot,
        subscribe(listener) { listeners.add(listener); try { listener(snapshot()); } catch (_) {} return () => listeners.delete(listener); },
      });
    }
    // The host userscript owns account restoration and starts providers only
    // from an explicit user action.
    if (page.__JND_HOST?.source !== 'sgs-multichannel') void resume();
    window.addEventListener('pageshow', event => {
      // A bfcache restore has no live closure or credential handoff remaining.
      if (event.persisted && disposed) location.reload();
    });
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, {once: true});
})();
/* DIRECT-ENGINE-END */
