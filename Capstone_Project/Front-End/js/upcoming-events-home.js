/**
 * Loads upcoming event promo images on home dashboards from GET /api/upcoming-events.
 * 1 image: single card. 2–6 images: carousel with dots + arrows (first: next only; middle: both; last: prev only).
 * Click an image to view it larger in a lightbox.
 */
(function () {
  'use strict';

  var root = document.getElementById('upcoming-events-root');
  if (!root) return;

  var lightbox = null;
  var lightboxImg = null;
  var lightboxClose = null;
  var lastFocus = null;
  var carouselResizeObserver = null;

  function disconnectCarouselResizeObserver() {
    if (carouselResizeObserver) {
      carouselResizeObserver.disconnect();
      carouselResizeObserver = null;
    }
  }

  function ensureLightbox() {
    if (lightbox) return;
    lightbox = document.createElement('div');
    lightbox.className = 'event-image-lightbox';
    lightbox.setAttribute('hidden', '');
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'Enlarged event image');

    var panel = document.createElement('div');
    panel.className = 'event-image-lightbox__panel';

    lightboxClose = document.createElement('button');
    lightboxClose.type = 'button';
    lightboxClose.className = 'event-image-lightbox__close';
    lightboxClose.setAttribute('aria-label', 'Close enlarged image');
    lightboxClose.innerHTML = '\u00d7';

    lightboxImg = document.createElement('img');
    lightboxImg.className = 'event-image-lightbox__img';
    lightboxImg.alt = '';

    panel.appendChild(lightboxClose);
    panel.appendChild(lightboxImg);
    lightbox.appendChild(panel);
    document.body.appendChild(lightbox);

    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    lightboxClose.addEventListener('click', function (e) {
      e.stopPropagation();
      closeLightbox();
    });
    document.addEventListener('keydown', onLightboxKeydown);
  }

  function onLightboxKeydown(e) {
    if (e.key === 'Escape' && lightbox && !lightbox.hasAttribute('hidden')) {
      closeLightbox();
    }
  }

  function openLightbox(src, alt) {
    ensureLightbox();
    lastFocus = document.activeElement;
    lightboxImg.src = src;
    lightboxImg.alt = alt || 'Upcoming event';
    lightbox.removeAttribute('hidden');
    document.body.classList.add('event-image-lightbox-open');
    lightboxClose.focus();
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hasAttribute('hidden')) return;
    lightbox.setAttribute('hidden', '');
    lightboxImg.removeAttribute('src');
    document.body.classList.remove('event-image-lightbox-open');
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try {
        lastFocus.focus();
      } catch (err) {}
    }
    lastFocus = null;
  }

  function buildSlideContent(item) {
    var inner = document.createElement('div');
    inner.className = 'event-image-card__frame';
    if (item.url) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'event-image-card__open';
      btn.setAttribute('aria-label', 'View larger: ' + (item.alt || 'Upcoming event'));
      var img = document.createElement('img');
      img.className = 'event-image-card__img';
      img.src = item.url;
      img.alt = item.alt || 'Upcoming event';
      img.loading = 'lazy';
      img.decoding = 'async';
      btn.appendChild(img);
      (function (url, alt) {
        btn.addEventListener('click', function () {
          openLightbox(url, alt);
        });
      })(item.url, item.alt || '');
      inner.appendChild(btn);
    } else {
      var ph = document.createElement('div');
      ph.className = 'event-image-card__placeholder';
      ph.setAttribute('role', 'img');
      ph.setAttribute('aria-label', 'Event image not set');
      ph.textContent = 'Event image coming soon';
      inner.appendChild(ph);
    }
    return inner;
  }

  function buildCarousel(images) {
    disconnectCarouselResizeObserver();

    var n = images.length;
    var currentIndex = 0;
    var viewport = null;
    var resizeTimer = null;

    var wrap = document.createElement('div');
    wrap.className = 'event-carousel';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-roledescription', 'carousel');
    wrap.setAttribute('aria-label', 'Upcoming events');

    viewport = document.createElement('div');
    viewport.className = 'event-carousel__viewport';

    var track = document.createElement('div');
    track.className = 'event-carousel__track';
    track.style.setProperty('--event-slide-count', String(n));

    var slides = [];
    for (var i = 0; i < n; i++) {
      var slide = document.createElement('div');
      slide.className = 'event-carousel__slide';
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      slide.setAttribute('aria-label', 'Event ' + (i + 1) + ' of ' + n);
      slide.appendChild(buildSlideContent(images[i] || {}));
      track.appendChild(slide);
      slides.push(slide);
      var slideImg = slide.querySelector('img');
      if (slideImg) {
        slideImg.addEventListener('load', function () {
          if (currentIndex === slides.indexOf(slide)) {
            scheduleViewportHeight();
          }
        });
      }
    }
    viewport.appendChild(track);
    wrap.appendChild(viewport);

    var nav = document.createElement('div');
    nav.className = 'event-carousel__nav';

    var prevWrap = document.createElement('div');
    prevWrap.className = 'event-carousel__nav-slot event-carousel__nav-slot--prev';
    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'event-carousel__arrow event-carousel__arrow--prev';
    prevBtn.setAttribute('aria-label', 'Previous event image');
    prevBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>';
    prevWrap.appendChild(prevBtn);

    var dots = document.createElement('div');
    dots.className = 'event-carousel__dots';
    dots.setAttribute('role', 'tablist');
    dots.setAttribute('aria-label', 'Choose slide');
    var dotButtons = [];
    for (var d = 0; d < n; d++) {
      (function (idx) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'event-carousel__dot';
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', 'Go to slide ' + (idx + 1));
        dot.addEventListener('click', function () {
          goTo(idx);
        });
        dots.appendChild(dot);
        dotButtons.push(dot);
      })(d);
    }

    var nextWrap = document.createElement('div');
    nextWrap.className = 'event-carousel__nav-slot event-carousel__nav-slot--next';
    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'event-carousel__arrow event-carousel__arrow--next';
    nextBtn.setAttribute('aria-label', 'Next event image');
    nextBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>';
    nextWrap.appendChild(nextBtn);

    nav.appendChild(prevWrap);
    nav.appendChild(dots);
    nav.appendChild(nextWrap);
    wrap.appendChild(nav);

    function prefersReducedMotion() {
      try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (e) {
        return false;
      }
    }

    function syncViewportHeight() {
      if (!viewport) return;
      var slide = slides[currentIndex];
      if (!slide) return;
      var h = slide.getBoundingClientRect().height;
      h = Math.max(1, Math.round(h));
      viewport.style.height = h + 'px';
    }

    function scheduleViewportHeight() {
      requestAnimationFrame(function () {
        requestAnimationFrame(syncViewportHeight);
      });
    }

    function observeActiveSlide() {
      if (typeof ResizeObserver === 'undefined') return;
      disconnectCarouselResizeObserver();
      carouselResizeObserver = new ResizeObserver(function () {
        syncViewportHeight();
      });
      carouselResizeObserver.observe(slides[currentIndex]);
    }

    function onWindowResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncViewportHeight, 100);
    }

    function applyTransform() {
      var pct = (100 / n) * currentIndex;
      track.style.transform = 'translateX(-' + pct + '%)';
      if (!prefersReducedMotion()) {
        track.style.transition = 'transform 0.35s ease';
      } else {
        track.style.transition = 'none';
      }
      for (var j = 0; j < n; j++) {
        var isActive = j === currentIndex;
        dotButtons[j].classList.toggle('is-active', isActive);
        dotButtons[j].setAttribute('aria-selected', isActive ? 'true' : 'false');
        dotButtons[j].tabIndex = isActive ? 0 : -1;
      }
      prevBtn.hidden = currentIndex === 0;
      prevBtn.setAttribute('aria-hidden', currentIndex === 0 ? 'true' : 'false');
      nextBtn.hidden = currentIndex === n - 1;
      nextBtn.setAttribute('aria-hidden', currentIndex === n - 1 ? 'true' : 'false');
      wrap.setAttribute('data-index', String(currentIndex));
      observeActiveSlide();
      scheduleViewportHeight();
    }

    function goTo(idx) {
      if (idx < 0 || idx >= n) return;
      currentIndex = idx;
      applyTransform();
    }

    prevBtn.addEventListener('click', function () {
      goTo(currentIndex - 1);
    });
    nextBtn.addEventListener('click', function () {
      goTo(currentIndex + 1);
    });

    wrap.tabIndex = 0;
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        goTo(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < n - 1) {
        e.preventDefault();
        goTo(currentIndex + 1);
      }
    });

    window.addEventListener('resize', onWindowResize);

    root.appendChild(wrap);
    applyTransform();
  }

  function render(data) {
    var images = (data && data.images) || [];
    var n = images.length;
    if (n === 0) {
      images = [{ url: null, alt: '' }];
      n = 1;
    }

    root.innerHTML = '';
    root.className = 'event-cards';
    root.removeAttribute('data-count');

    if (n === 1) {
      disconnectCarouselResizeObserver();
      root.classList.add('event-cards--count-1');
      root.setAttribute('data-count', '1');
      var article = document.createElement('article');
      article.className = 'event-image-card';
      article.appendChild(buildSlideContent(images[0]));
      root.appendChild(article);
      return;
    }

    root.classList.add('event-cards--carousel', 'event-cards--count-' + Math.min(n, 6));
    root.setAttribute('data-count', String(n));
    buildCarousel(images);
  }

  var lastPayloadKey = '';

  function payloadKey(data) {
    try {
      return JSON.stringify((data && data.images) || []);
    } catch (e) {
      return '';
    }
  }

  function refreshUpcomingEvents() {
    return fetch('/api/upcoming-events', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var key = payloadKey(data);
        if (key !== lastPayloadKey) {
          lastPayloadKey = key;
          render(data);
        }
      })
      .catch(function () {
        if (!lastPayloadKey) {
          lastPayloadKey = '__fallback__';
          render({ images: [{ url: null, alt: '' }] });
        }
      });
  }

  refreshUpcomingEvents();

  setInterval(function () {
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    refreshUpcomingEvents();
  }, 15000);
})();
