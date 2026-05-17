/* ═══════════════════════════════════════════════════════════════════
 *  Velox Peptides — Premium Animations JS
 *  Handles: scroll observer · hero stagger · orbs · progress bar ·
 *           featured cards · detail page · button shimmer
 * ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Bail out entirely if user prefers reduced motion ── */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var isMobile  = window.innerWidth <= 767;
  var isHome    = document.body.classList.contains('page-home');
  var isCompound = document.body.classList.contains('page-compound');
  var isStack   = document.body.classList.contains('page-stack');

  /* Featured compound slugs (from href) and stack slug */
  var FEATURED_COMPOUNDS = [
    '/compounds/retatrutide/',
    '/compounds/bpc-157/',
    '/compounds/selank/',
    '/compounds/tesamorelin/',
    '/compounds/ghk-cu/',
  ];
  var FEATURED_STACK = '/stacks/cognitive-and-sleep/';

  /* ─────────────────────────────────────────────────────────────────
   *  1. Hero section stagger (homepage only)
   * ───────────────────────────────────────────────────────────────── */
  function initHeroStagger() {
    if (!isHome) return;

    var targets = [
      { sel: '.site-header',     cls: 'vp-hero-nav',      delay: '0ms'   },
      { sel: '.h-h1',            cls: 'vp-hero-headline',  delay: '200ms' },
      { sel: '.h-sub',           cls: 'vp-hero-sub',       delay: '380ms' },
      { sel: '.h-stats-row',     cls: 'vp-hero-sub',       delay: '380ms' },
      { sel: '.h-btns',          cls: 'vp-hero-cta',       delay: '560ms' },
      { sel: '.hero-trust-bar',  cls: 'vp-hero-trust',     delay: '740ms' },
      { sel: '.hero-order-count',cls: 'vp-hero-trust',     delay: '800ms' },
    ];

    targets.forEach(function (t) {
      var el = document.querySelector(t.sel);
      if (!el) return;
      el.style.animationDelay = t.delay;
      el.classList.add(t.cls);
    });
  }

  /* ─────────────────────────────────────────────────────────────────
   *  2. Card scroll-in animations (Intersection Observer)
   * ───────────────────────────────────────────────────────────────── */
  function initCardAnimations() {
    var STAGGER_MS = isMobile ? 40 : 80;
    var cards = Array.prototype.slice.call(
      document.querySelectorAll('.cc, .cat-tile, .stack-card')
    );

    if (!cards.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el    = entry.target;
        var delay = parseInt(el.dataset.vpDelay || '0', 10);
        setTimeout(function () {
          el.classList.add('vp-in-view');
          /* Remove will-change after animation completes */
          el.addEventListener('animationend', function () {
            el.style.willChange = 'auto';
          }, { once: true });
        }, delay);
        observer.unobserve(el);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

    /* Assign stagger delays per visible row group */
    var rowBucket = {};
    cards.forEach(function (card) {
      card.classList.add('vp-ani');
      var top = Math.round(card.getBoundingClientRect().top / 10) * 10; /* 10px bucket */
      if (!rowBucket[top]) rowBucket[top] = 0;
      var delay = rowBucket[top] * STAGGER_MS;
      rowBucket[top]++;
      card.dataset.vpDelay = delay;
      observer.observe(card);
    });
  }

  /* ─────────────────────────────────────────────────────────────────
   *  3. Featured card treatment
   * ───────────────────────────────────────────────────────────────── */
  function initFeaturedCards() {
    /* Product cards — LOW STOCK badge + rotating border */
    document.querySelectorAll('.cc').forEach(function (card) {
      var link = card.querySelector('.cc-img-link, .cc-name-link, a[href]');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      var featured = FEATURED_COMPOUNDS.some(function (f) { return href.indexOf(f) !== -1; });
      if (!featured) return;
      card.classList.add('vp-featured');
      injectLowStockBadge(card);
    });

    /* Stack cards — rotating border only, no LOW STOCK badge */
    document.querySelectorAll('.stack-card').forEach(function (card) {
      var link = card.querySelector('.stack-card-link');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      if (href.indexOf(FEATURED_STACK) !== -1) {
        card.classList.add('vp-featured');
      }
    });
  }

  function injectLowStockBadge(card) {
    if (card.querySelector('.vp-popular-badge')) return;
    var badge = document.createElement('div');
    badge.className = 'vp-popular-badge';
    badge.textContent = 'LOW STOCK';
    badge.setAttribute('aria-hidden', 'true');
    card.appendChild(badge);
  }

  /* ─────────────────────────────────────────────────────────────────
   *  4. Hero background glow orbs (homepage, desktop only)
   * ───────────────────────────────────────────────────────────────── */
  function initHeroOrbs() {
    if (!isHome || isMobile) return;
    var hero = document.querySelector('.hero');
    if (!hero) return;

    var orbs = [
      { w: 700, h: 700, left: '12%',  top: '15%',  cls: 'vp-orb vp-orb-1', opacity: '.045' },
      { w: 500, h: 500, left: '72%',  top: '55%',  cls: 'vp-orb vp-orb-2', opacity: '.035' },
      { w: 350, h: 350, left: '50%',  top: '5%',   cls: 'vp-orb vp-orb-3', opacity: '.03'  },
    ];

    orbs.forEach(function (o) {
      var el = document.createElement('div');
      el.className = o.cls;
      el.style.cssText =
        'width:' + o.w + 'px;height:' + o.h + 'px;' +
        'left:' + o.left + ';top:' + o.top + ';' +
        'transform:translate(-50%,-50%);' +
        'background:radial-gradient(circle,rgba(1,211,160,' + o.opacity + ') 0%,transparent 68%);' +
        'border-radius:50%;pointer-events:none;position:absolute;' +
        'z-index:0;';
      hero.appendChild(el);
    });
  }

  /* ─────────────────────────────────────────────────────────────────
   *  6. Category card stagger (already handled by #2 observer above,
   *     but give category page cards an explicit stagger on load)
   * ───────────────────────────────────────────────────────────────── */

  /* ─────────────────────────────────────────────────────────────────
   *  7. Product detail page animations
   * ───────────────────────────────────────────────────────────────── */
  function initDetailPage() {
    if (!isCompound) return;

    /* Main hero elements animate on load */
    var imgCol = document.querySelector('.cp-img-col');
    var heroMain = document.querySelector('.cp-hero-main');
    var order  = document.querySelector('.cp-order');

    if (imgCol)    imgCol.classList.add('vp-detail-img');
    if (heroMain)  heroMain.classList.add('vp-detail-title');
    if (order)     order.classList.add('vp-detail-order');

    /* Spec table rows animate in as they scroll into view */
    var specItems = Array.prototype.slice.call(
      document.querySelectorAll('.cp-spec div, .cp-spec-table tr, .cp-section')
    );

    if (specItems.length) {
      var specObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var i = parseInt(entry.target.dataset.vpSpecIdx || '0', 10);
          setTimeout(function () {
            entry.target.classList.add('vp-spec-in');
          }, i * 50);
          specObs.unobserve(entry.target);
        });
      }, { threshold: 0.1 });

      specItems.forEach(function (el, i) {
        el.classList.add('vp-spec-item');
        el.dataset.vpSpecIdx = i;
        specObs.observe(el);
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   *  9. Scroll progress bar (compound + stack pages only)
   * ───────────────────────────────────────────────────────────────── */
  function initScrollProgress() {
    if (!isCompound && !isStack) return;

    var bar = document.createElement('div');
    bar.id = 'vp-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(bar, document.body.firstChild);

    function onScroll() {
      var docEl    = document.documentElement;
      var scrollTop = docEl.scrollTop || document.body.scrollTop;
      var scrollH  = docEl.scrollHeight - docEl.clientHeight;
      var pct = scrollH > 0 ? (scrollTop / scrollH) * 100 : 0;
      bar.style.width = pct.toFixed(2) + '%';
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); /* set initial value */
  }

  /* ─────────────────────────────────────────────────────────────────
   *  Mobile touch feedback (supplement CSS :active rules)
   * ───────────────────────────────────────────────────────────────── */
  function initTouchFeedback() {
    if (!isMobile) return;
    /* CSS :active handles most — just ensure the right elements have it.
       All interactive cards already have .cc:active in animations.css. */
  }

  /* ─────────────────────────────────────────────────────────────────
   *  INIT — run after DOM is ready
   * ───────────────────────────────────────────────────────────────── */
  function init() {
    initHeroStagger();
    initHeroOrbs();
    initCardAnimations();
    initFeaturedCards();
    initDetailPage();
    initScrollProgress();
    initTouchFeedback();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
