/**
 * klaviyo-events.js — Klaviyo onsite e-commerce tracking for Velox Peptides.
 * Company (public) ID XqYUdD is loaded via the onsite snippet in <head>.
 * Uses the queue API (window.klaviyo.push) so calls are safe before klaviyo.js loads.
 * Mirrors the GA4 events. Powers abandoned-cart (Started Checkout) and reorder/
 * revenue (Placed Order) flows. Client-side only — no private key here.
 */
(function () {
  'use strict';
  window.klaviyo = window.klaviyo || [];

  // Shared helpers other scripts (checkout, payment-complete) can call.
  window.vpk = {
    identify: function (email, props) {
      if (!email) return;
      var p = { $email: String(email).trim().toLowerCase() };
      if (props) { for (var key in props) if (props.hasOwnProperty(key)) p[key] = props[key]; }
      window.klaviyo.push(['identify', p]);
    },
    track: function (name, props) {
      if (!name) return;
      window.klaviyo.push(['track', name, props || {}]);
    }
  };

  // ── Product pages: Viewed Product + Added to Cart ──────────────────────────
  var form = document.getElementById('order-form');
  if (!form) return;

  var slug  = form.getAttribute('data-compound') || '';
  var name  = form.getAttribute('data-name') || '';
  var url   = location.origin + (form.getAttribute('data-url') || location.pathname);
  var catEl = document.querySelector('.cp-eyebrow');
  var cat   = catEl ? catEl.textContent.replace(/^[\s—\-]+/, '').trim() : '';

  function selectedPrice() {
    var s = form.querySelector('input[name="size"]:checked');
    return s ? (parseFloat(s.getAttribute('data-price')) || 0) : 0;
  }

  window.vpk.track('Viewed Product', {
    ProductName: name, ProductID: slug, SKU: slug,
    Categories: cat ? [cat] : [], URL: url, Price: selectedPrice()
  });

  // Fire only when the add will actually succeed (mirror compound.js gating).
  form.addEventListener('submit', function () {
    var ack  = form.querySelector('input[name="ack"]');
    var size = form.querySelector('input[name="size"]:checked');
    if ((ack && !ack.checked) || !size) return;
    var price = selectedPrice();
    window.vpk.track('Added to Cart', {
      $value: price,
      AddedItemProductName: name, AddedItemProductID: slug, AddedItemSKU: slug,
      AddedItemCategories: cat ? [cat] : [], AddedItemPrice: price,
      AddedItemVariant: size.value, AddedItemURL: url
    });
  });
}());
