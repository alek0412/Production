/**
 * General_Membership + Client_Membership only.
 * Loads pricing asset from GET /api/membership-pricing; respects visible:false (admin Remove).
 * Click thumbnail to zoom (image or PDF). Escape / backdrop / × to close.
 */
(function () {
  'use strict';

  var DEFAULT_ALT =
    'Houston Badminton Center — Pricing: membership, drop-in day passes, court reservations, locker rentals';

  var host = document.getElementById('membership-pricing-asset-host');
  if (!host) return;

  var fig = host.closest('figure');

  /* —— Lightbox (membership pages only) —— */
  var lb = null;
  var closeBtn = null;
  var panel = null;
  var bigImg = null;
  var bigIframe = null;
  var activeThumb = null;

  function ensureLightbox() {
    if (lb) return;

    lb = document.createElement('div');
    lb.className = 'pricing-lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Enlarged pricing sheet');

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pricing-lightbox-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';

    panel = document.createElement('div');
    panel.className = 'pricing-lightbox-panel';

    bigImg = document.createElement('img');
    bigImg.className = 'pricing-lightbox-img';
    bigImg.alt = '';

    bigIframe = document.createElement('iframe');
    bigIframe.className = 'pricing-lightbox-iframe';
    bigIframe.setAttribute('title', 'Pricing sheet');
    bigIframe.style.display = 'none';

    panel.appendChild(bigImg);
    panel.appendChild(bigIframe);
    lb.appendChild(closeBtn);
    lb.appendChild(panel);
    document.body.appendChild(lb);

    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeLightbox();
    });

    lb.addEventListener('click', function (e) {
      if (closeBtn.contains(e.target)) return;
      if (e.target === bigImg) return;
      if (e.target === bigIframe) return;
      closeLightbox();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lb && lb.classList.contains('is-open')) {
        closeLightbox();
      }
    });
  }

  function openLightbox() {
    if (!activeThumb) return;
    ensureLightbox();
    var thumb = activeThumb;
    if (thumb.tagName === 'OBJECT') {
      var dataUrl = thumb.getAttribute('data') || '';
      bigImg.style.display = 'none';
      bigIframe.style.display = 'block';
      bigIframe.src = dataUrl;
    } else {
      bigIframe.style.display = 'none';
      bigImg.style.display = '';
      bigImg.src = thumb.currentSrc || thumb.src;
      bigImg.alt = thumb.getAttribute('alt') || '';
    }
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeLightbox() {
    if (!lb) return;
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
    if (bigIframe) bigIframe.src = 'about:blank';
    if (activeThumb) {
      activeThumb.focus();
    }
  }

  function bindLightboxToThumb(thumb) {
    if (!thumb) return;
    ensureLightbox();
    activeThumb = thumb;

    thumb.style.cursor = 'zoom-in';
    if (!thumb.hasAttribute('tabindex')) {
      thumb.setAttribute('tabindex', '0');
    }

    thumb.addEventListener('click', function (e) {
      e.preventDefault();
      openLightbox();
    });
    thumb.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox();
      }
    });
  }

  /* —— API + mount —— */
  function setFigureShown(show) {
    if (!fig) return;
    if (show) {
      fig.removeAttribute('hidden');
    } else {
      fig.setAttribute('hidden', '');
    }
  }

  function mountThumb(kind, url) {
    host.innerHTML = '';
    var el;
    if (kind === 'pdf') {
      el = document.createElement('object');
      el.id = 'pricing-sheet-thumb';
      el.className = 'membership-pricing-pdf-thumb';
      el.type = 'application/pdf';
      el.data = url;
      el.setAttribute('aria-label', DEFAULT_ALT);
    } else {
      el = document.createElement('img');
      el.id = 'pricing-sheet-thumb';
      el.className = 'membership-pricing-img';
      el.src = url;
      el.alt = DEFAULT_ALT;
    }
    host.appendChild(el);
    bindLightboxToThumb(el);
  }

  var lastPricingKey = '';

  function payloadKey(data) {
    return JSON.stringify({
      url: data && data.url ? data.url : '',
      kind: data && data.kind ? data.kind : '',
      visible: !!(data && data.visible !== false),
    });
  }

  function refreshMembershipPricing() {
    return fetch('/api/membership-pricing', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var key = payloadKey(data);
        if (key === lastPricingKey) return;
        lastPricingKey = key;
      if (!data) {
        host.innerHTML = '';
        setFigureShown(false);
        return;
      }
      if (data.visible === false) {
        host.innerHTML = '';
        setFigureShown(false);
        return;
      }
      if (typeof data.url !== 'string') {
        setFigureShown(false);
        return;
      }
      setFigureShown(true);
      if (data.kind === 'pdf') {
        mountThumb('pdf', data.url);
      } else {
        mountThumb('image', data.url);
      }
      })
      .catch(function () {
        if (!lastPricingKey) {
          lastPricingKey = '__fallback__';
          host.innerHTML = '';
          setFigureShown(false);
        }
      });
  }

  refreshMembershipPricing();

  setInterval(function () {
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    refreshMembershipPricing();
  }, 15000);
})();
