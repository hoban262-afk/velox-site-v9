/*
 * chat-widget.js — Velox on-site assistant widget.
 *
 * Self-contained: injects its own CSS, renders a floating bubble + chat panel,
 * talks to POST /api/chat, and (when a user shares an email) triggers the
 * Researcher's Handbook via POST /api/newsletter/signup.
 *
 * It activates wherever this script is included. For now it's only on the
 * hidden /chat-test/ page. To go live, add one <script src> line to the site
 * pages (see /chat-test/ for the exact snippet).
 */
(function () {
  'use strict';
  if (window.__veloxChatLoaded) return;
  window.__veloxChatLoaded = true;

  var ACCENT = '#01D3A0';
  var messages = [];          // {role, content}
  var emailCaptured = false;
  var busy = false;
  var opened = false;
  var greeted = false;
  var userEmail = null;
  var SID = (function(){ try{ var k=sessionStorage.getItem('vcw_sid'); if(k) return k; var v='c'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); sessionStorage.setItem('vcw_sid',v); return v; }catch(e){ return 'c'+Date.now().toString(36); } })();

  // A few natural openers, picked at random so it never feels canned.
  var GREETINGS = [
    "Hey, Matt here from Velox. What are you working on? Happy to help you find the right compound or talk through testing and shipping.",
    "Hi, I'm Matt from the Velox team. What can I help with? Whether it's picking a compound, our testing, or where your order is, ask away.",
    "Hey, Matt from Velox. What are you after today? I can help you choose, talk you through how everything's tested, or sort out shipping.",
    "Hi there, Matt here. What's on your mind? I can point you to the right compound or answer anything on testing and delivery."
  ];
  function pickGreeting() { return GREETINGS[Math.floor(Math.random() * GREETINGS.length)]; }

  // ── styles ────────────────────────────────────────────────────────────────
  var css = '' +
  '.vcw-btn{position:fixed;right:20px;bottom:calc(var(--vpdock-h, 0px) + 20px);z-index:99998;display:inline-flex;align-items:center;gap:9px;' +
    'background:' + ACCENT + ';color:#021;border:0;border-radius:999px;padding:13px 18px;font:800 14px Inter,Arial,sans-serif;' +
    'cursor:pointer;box-shadow:0 10px 34px -8px rgba(1,211,160,.6);transition:transform .15s ease,box-shadow .2s ease}' +
  '.vcw-btn:hover{transform:translateY(-2px);box-shadow:0 14px 40px -8px rgba(1,211,160,.7)}' +
  '.vcw-btn svg{width:18px;height:18px}' +
  '.vcw-panel{position:fixed;right:20px;bottom:20px;z-index:99999;width:380px;max-width:calc(100vw - 32px);' +
    'height:600px;max-height:calc(100vh - 40px);background:#0b0f14;border:1px solid #1f262d;border-radius:18px;' +
    'display:none;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px -20px rgba(0,0,0,.85);' +
    'font-family:Inter,Arial,sans-serif}' +
  '.vcw-panel.vcw-open{display:flex}' +
  '.vcw-head{display:flex;align-items:center;gap:10px;padding:15px 16px;background:linear-gradient(135deg,#0e141b,#0a0e13);' +
    'border-bottom:1px solid #1f262d}' +
  '.vcw-dot{width:9px;height:9px;border-radius:50%;background:' + ACCENT + ';box-shadow:0 0 8px ' + ACCENT + '}' +
  '.vcw-title{font-size:14px;font-weight:800;color:#fff;line-height:1.1}' +
  '.vcw-sub{font-size:10.5px;color:#6B7280;letter-spacing:.04em;margin-top:2px}' +
  '.vcw-x{margin-left:auto;background:transparent;border:0;color:#9aa3ad;font-size:22px;line-height:1;cursor:pointer;padding:2px 6px}' +
  '.vcw-x:hover{color:#fff}' +
  '.vcw-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#0b0f14}' +
  '.vcw-row{display:flex}' +
  '.vcw-row.user{justify-content:flex-end}' +
  '.vcw-bubble{max-width:84%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.5;white-space:normal;word-wrap:break-word}' +
  '.vcw-row.bot .vcw-bubble{background:#141b22;color:#e5e7eb;border:1px solid #1f262d;border-bottom-left-radius:4px}' +
  '.vcw-row.user .vcw-bubble{background:' + ACCENT + ';color:#021;font-weight:600;border-bottom-right-radius:4px}' +
  '.vcw-bubble a{color:' + ACCENT + ';font-weight:600;text-decoration:underline;text-underline-offset:2px}' +
  '.vcw-row.user .vcw-bubble a{color:#021}' +
  '.vcw-typing{display:inline-flex;gap:4px;align-items:center}' +
  '.vcw-typing span{width:6px;height:6px;border-radius:50%;background:#6B7280;animation:vcwBlink 1.2s infinite}' +
  '.vcw-typing span:nth-child(2){animation-delay:.2s}.vcw-typing span:nth-child(3){animation-delay:.4s}' +
  '@keyframes vcwBlink{0%,80%,100%{opacity:.3}40%{opacity:1}}' +
  '.vcw-foot{border-top:1px solid #1f262d;padding:10px;background:#0a0e13}' +
  '.vcw-inwrap{display:flex;gap:8px;align-items:flex-end}' +
  '.vcw-in{flex:1;resize:none;max-height:96px;background:#0e141b;border:1px solid #2a323a;color:#fff;border-radius:11px;' +
    'padding:11px 12px;font:inherit;font-size:13.5px;line-height:1.4;outline:none}' +
  '.vcw-in:focus{border-color:' + ACCENT + '}' +
  '.vcw-send{background:' + ACCENT + ';color:#021;border:0;border-radius:11px;padding:0 14px;height:42px;font:800 14px Inter,Arial;cursor:pointer}' +
  '.vcw-send:disabled{opacity:.5;cursor:default}' +
  '.vcw-legal{font-size:10px;color:#4b5563;text-align:center;margin-top:7px;line-height:1.4}' +
  // ── mobile: full-width bottom sheet, dvh so the address bar can't clip it ──
  '.vcw-chips{display:flex;flex-wrap:wrap;gap:7px;padding:2px 16px 8px}' +
  '.vcw-chip{background:#141b22;border:1px solid #2a323a;color:#cbd5e1;border-radius:999px;padding:7px 12px;font-size:12.5px;cursor:pointer;font-family:inherit}' +
  '.vcw-chip:hover{border-color:' + ACCENT + ';color:#fff}' +
  '@media (max-width:600px){' +
    '.vcw-panel{right:0;left:0;bottom:0;width:100%;max-width:100%;height:85vh;height:85dvh;max-height:85dvh;border-radius:16px 16px 0 0;border-left:0;border-right:0;border-bottom:0}' +
    '.vcw-btn{right:14px;bottom:calc(var(--vpdock-h, 112px) + 14px);padding:11px 14px;font-size:13px}' +
    '.vcw-btn svg{width:16px;height:16px}' +
    '.vcw-head{padding:13px 14px}' +
    '.vcw-bubble{max-width:88%}' +
    'body.page-compound .vcw-btn,body.page-stack .vcw-btn{display:none!important}' +
  '}';

  function injectCss() {
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Escape, then linkify https URLs and site paths, then **bold** and newlines.
  function render(text) {
    var html = esc(text);
    var stash = [];
    function keep(h) { stash.push(h); return '\u0000' + (stash.length - 1) + '\u0000'; }
    // 1) named markdown links [text](url-or-path) -> clickable with the name as the label
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, function (m, txt, url) {
      var ext = /^https?:/.test(url);
      return keep('<a href="' + url + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + txt + '</a>');
    });
    // 1b) bracketed bare path [/compounds/x/] -> link with a readable name
    html = html.replace(/\[(\/[a-z0-9][a-z0-9\-\/]*\/)\]/gi, function (m, path) {
      var seg = path.replace(/\/+$/, '').split('/').pop().replace(/-/g, ' ');
      var name = seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : 'this page';
      return keep('<a href="' + path + '">' + name + '</a>');
    });
    // 2) bare full URLs
    html = html.replace(/(https?:\/\/[^\s<)]+)/g, function (u) {
      return keep('<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>');
    });
    // 3) bare site paths (fallback if Matt forgets the markdown form)
    html = html.replace(/(^|[\s(])(\/[a-z0-9][a-z0-9\-\/]*\/)/g, function (m, pre, path) {
      return pre + keep('<a href="' + path + '">' + path + '</a>');
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/\u0000(\d+)\u0000/g, function (m, i) { return stash[i]; });
    return html;
  }
  var EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;

  // ── conversation persistence (survives reloads within the session) ────────
  var STATE_KEY = 'vcw_state';
  function saveState() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({
        messages: messages.slice(-24), emailCaptured: emailCaptured,
        userEmail: userEmail, greeted: greeted,
      }));
    } catch (e) { /* ignore */ }
  }
  function loadState() {
    try {
      var raw = sessionStorage.getItem(STATE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && Array.isArray(s.messages)) ? s : null;
    } catch (e) { return null; }
  }

  // ── DOM ─────────────────────────────────────────────────────────────────
  var btn, panel, msgsEl, inputEl, sendEl, subEl;

  // Header status line. "typing…" while Matt composes, otherwise "Online now".
  function setStatus(typing) {
    if (!subEl) return;
    subEl.textContent = typing ? 'typing…' : 'Online now';
    subEl.style.color = typing ? ACCENT : '';
  }

  function build() {
    btn = document.createElement('button');
    btn.className = 'vcw-btn';
    btn.setAttribute('aria-label', 'Chat with Matt from Velox');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/></svg>' +
      '<span>Chat</span>';
    btn.addEventListener('click', toggle);

    panel = document.createElement('div');
    panel.className = 'vcw-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat with Matt from Velox');
    panel.innerHTML =
      '<div class="vcw-head"><span class="vcw-dot"></span>' +
        '<div><div class="vcw-title">Matt</div><div class="vcw-sub">Online now</div></div>' +
        '<button class="vcw-x" aria-label="Close chat">&times;</button></div>' +
      '<div class="vcw-msgs"></div>' +
      '<div class="vcw-foot"><div class="vcw-inwrap">' +
        '<textarea class="vcw-in" rows="1" placeholder="Ask a question…" aria-label="Type your message"></textarea>' +
        '<button class="vcw-send">Send</button>' +
      '</div><div class="vcw-legal">Research reagents for in vitro use only. Not medical advice.</div></div>';

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    msgsEl = panel.querySelector('.vcw-msgs');
    inputEl = panel.querySelector('.vcw-in');
    sendEl = panel.querySelector('.vcw-send');
    subEl = panel.querySelector('.vcw-sub');

    panel.querySelector('.vcw-x').addEventListener('click', toggle);
    sendEl.addEventListener('click', onSend);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
    });
    inputEl.addEventListener('input', function () {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
    });
  }

  function toggle() {
    opened = !panel.classList.contains('vcw-open');
    panel.classList.toggle('vcw-open', opened);
    btn.style.display = opened ? 'none' : 'inline-flex';
    if (opened) {
      if (!restored) restorePriorChat();
      if (!messages.length && !greeted) connectThenGreet(pickGreeting());
      setTimeout(function () { inputEl.focus(); }, 50);
    }
  }

  // Re-paint a conversation from earlier this session (no "connecting" delay,
  // it was already a live chat). Returns true if anything was restored.
  var restored = false;
  function restorePriorChat() {
    restored = true;
    var s = loadState();
    if (!s || !s.messages.length) return false;
    messages = s.messages;
    emailCaptured = !!s.emailCaptured;
    userEmail = s.userEmail || null;
    greeted = true;
    messages.forEach(function (m) {
      addBubble(m.role === 'user' ? 'user' : 'bot', m.content);
    });
    return true;
  }

  function addBubble(role, text) {
    var row = document.createElement('div');
    row.className = 'vcw-row ' + (role === 'user' ? 'user' : 'bot');
    var b = document.createElement('div');
    b.className = 'vcw-bubble';
    b.innerHTML = render(text);
    row.appendChild(b);
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    setStatus(false);
    if (role === 'bot') {
      var cm = String(text).match(/VELOX-[A-Z0-9]{6}/);
      if (cm) { try { localStorage.setItem('vp_ref', JSON.stringify({ code: cm[0], ts: Date.now() })); } catch (e) {} }
    }
    return b;
  }

  function showTyping() {
    setStatus(true);
    var row = document.createElement('div');
    row.className = 'vcw-row bot';
    row.innerHTML = '<div class="vcw-bubble"><span class="vcw-typing"><span></span><span></span><span></span></span></div>';
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return row;
  }

  // Show a brief "Connecting to agent" status, then drop in the first message —
  // so opening the chat feels like reaching a real person, not an instant bot.
  function connectThenGreet(message) {
    if (greeted) return;
    greeted = true;
    setStatus(true);
    var row = document.createElement('div');
    row.className = 'vcw-row bot';
    row.innerHTML = '<div class="vcw-bubble" style="display:flex;align-items:center;gap:8px">' +
      '<span class="vcw-typing"><span></span><span></span><span></span></span>' +
      '<span style="color:#9aa3ad;font-size:12.5px">Connecting to agent\u2026</span></div>';
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    setTimeout(function () {
      row.remove(); addBubble('bot', message);
      messages.push({ role: 'assistant', content: message }); saveState();
      showChips();
    }, 1600 + Math.random() * 900);
  }

  // Fire-and-forget handbook signup when the user shares an email.
  function maybeCaptureEmail(text) {
    if (emailCaptured) return null;
    var m = text.match(EMAIL_RE);
    if (!m) return null;
    var email = m[0];
    emailCaptured = true;
    userEmail = email;
    try {
      fetch('/api/newsletter/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      }).catch(function () {});
    } catch (e) { /* ignore */ }
    return email;
  }

  // Starter quick-replies under the greeting to lower the blank-box barrier.
  function showChips() {
    var items = ['Help me choose', 'Is it tested?', "Where's my order?", 'Shipping and delivery'];
    var wrap = document.createElement('div'); wrap.className = 'vcw-chips';
    items.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'vcw-chip'; b.textContent = c;
      b.addEventListener('click', function () { wrap.remove(); inputEl.value = c; onSend(); });
      wrap.appendChild(b);
    });
    msgsEl.appendChild(wrap); msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  // Split a longer reply into up to two natural messages on a sentence boundary,
  // so Matt "texts" like a person instead of dumping one block.
  function splitReply(text) {
    text = String(text || '').trim();
    if (text.length < 120) return [text];
    // never chop an email, a code, or a link across bubbles
    if (/VELOX-[A-Z0-9]{6}/.test(text)) return [text];
    if (/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i.test(text)) return [text];
    if (/\]\(|https?:\/\//.test(text)) return [text];
    // split only on sentence punctuation FOLLOWED BY a space (so "me.com" stays intact)
    var parts = text.replace(/([.!?])\s+/g, '$1\u0001').split('\u0001').filter(function (x) { return x.trim(); });
    if (parts.length < 2) return [text];
    var mid = Math.ceil(parts.length / 2);
    var a = parts.slice(0, mid).join(' ').trim();
    var b = parts.slice(mid).join(' ').trim();
    return b ? [a, b] : [a];
  }

  // Believable "typing" time for a chunk (much slower than before, scales with length).
  function typeDelay(t) { return Math.min(4500, Math.max(1400, 1000 + t.length * 35)); }

  function onSend() {
    if (busy) return;
    var existingChips = msgsEl.querySelector('.vcw-chips'); if (existingChips) existingChips.remove();
    var text = (inputEl.value || '').trim();
    if (!text) return;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    addBubble('user', text);
    messages.push({ role: 'user', content: text });
    saveState();

    var capturedEmail = maybeCaptureEmail(text);
    var note = capturedEmail
      ? 'The user just shared their email (' + capturedEmail + '). Confirm warmly in one line and keep helping. A 15% first-order code is being attached automatically, so do NOT invent a code or tell them to check their inbox.'
      : '';

    busy = true; sendEl.disabled = true;
    var typing = showTyping();

    // The greeting is stored in `messages` for display/persistence, but the API
    // history must start with a user turn — drop any leading assistant turns.
    var apiMessages = messages.slice();
    while (apiMessages.length && apiMessages[0].role !== 'user') apiMessages.shift();

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages, note: note, page: location.pathname, sid: SID, email: userEmail }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        var reply = (d && d.reply) ||
          "Sorry, something went wrong there. Try again, or email support@veloxpeps.com and a real person will sort it.";
        messages.push({ role: 'assistant', content: reply });
        saveState();
        var parts = splitReply(reply);
        var firstTyping = typing;            // reuse the indicator already on screen
        (function deliver(i) {
          if (i >= parts.length) { busy = false; sendEl.disabled = false; inputEl.focus(); return; }
          var t = parts[i];
          var indicator = (i === 0) ? firstTyping : showTyping();
          setTimeout(function () {
            indicator.remove();
            addBubble('bot', t);
            deliver(i + 1);
          }, typeDelay(t));
        })(0);
      })
      .catch(function () {
        typing.remove();
        addBubble('bot', "Sorry, I couldn't reach the server. Give it another go in a sec.");
        busy = false; sendEl.disabled = false; inputEl.focus();
      });
  }

  function maybeProactive() {
    try {
      if (window.innerWidth < 768) return;                       // never hijack a phone screen
      if (!/(\/compounds\/|\/cart\/|\/checkout\/)/.test(location.pathname)) return;
      if (sessionStorage.getItem('vcw_nudged')) return;
      var prior = loadState();                                    // already chatting this session? don't barge in
      if (prior && prior.messages && prior.messages.length) return;
      setTimeout(function () {
        if (opened || messages.length) return;
        sessionStorage.setItem('vcw_nudged', '1');
        panel.classList.add('vcw-open'); opened = true; btn.style.display = 'none';
        connectThenGreet("Anything I can help with on this one? Happy to talk you through how it's tested, or help you find the right thing. There's a discount on first orders too if you're close.");
      }, 30000);
    } catch (e) { /* ignore */ }
  }

  function init() {
    injectCss();
    build();
    maybeProactive();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
