/**
 * About page gallery: 3 images per slide, same carousel chrome as upcoming events (arrows + dots).
 */
(function () {
  'use strict';

  var PER_PAGE = 3;

  var root = document.getElementById('about-gallery-root');
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
    lightbox.setAttribute('aria-label', 'Enlarged gallery image');

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
    lightboxImg.alt = alt || 'Gallery image';
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

  function chunkImages(images, size) {
    var out = [];
    for (var i = 0; i < images.length; i += size) {
      out.push(images.slice(i, i + size));
    }
    return out;
  }

  function isPdfItem(item) {
    if (!item || !item.src) return false;
    if (item.kind === 'pdf') return true;
    return /\.pdf(\?|$)/i.test(item.src);
  }

  function buildSlideInner(pageItems) {
    var inner = document.createElement('div');
    inner.className = 'about-gallery-slide-inner';
    if (pageItems.length < PER_PAGE) {
      inner.classList.add('about-gallery-slide-inner--partial');
    }
    for (var i = 0; i < pageItems.length; i++) {
      (function (item) {
        var fig = document.createElement('figure');
        if (isPdfItem(item)) {
          fig.className = 'about-gallery-item about-gallery-item--pdf';
          var frame = document.createElement('div');
          frame.className = 'about-gallery-item__pdf-frame';
          var obj = document.createElement('object');
          obj.className = 'about-gallery-item__pdf-obj';
          obj.type = 'application/pdf';
          obj.data = item.src;
          obj.setAttribute('aria-label', item.alt || 'PDF document');
          var fallback = document.createElement('a');
          fallback.href = item.src;
          fallback.target = '_blank';
          fallback.rel = 'noopener noreferrer';
          fallback.className = 'about-gallery-item__pdf-fallback';
          fallback.textContent = 'Open PDF';
          obj.appendChild(fallback);
          frame.appendChild(obj);
          fig.appendChild(frame);
          inner.appendChild(fig);
          return;
        }
        fig.className = 'about-gallery-item';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'about-gallery-item__open';
        btn.setAttribute('aria-label', 'View larger: ' + (item.alt || 'Gallery image'));
        var img = document.createElement('img');
        img.src = item.src;
        img.alt = item.alt || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        btn.appendChild(img);
        btn.addEventListener('click', function () {
          openLightbox(item.src, item.alt || '');
        });
        fig.appendChild(btn);
        inner.appendChild(fig);
      })(pageItems[i]);
    }
    return inner;
  }

  function buildCarousel(pages) {
    disconnectCarouselResizeObserver();

    var n = pages.length;
    var currentIndex = 0;
    var viewport = null;
    var resizeTimer = null;

    var wrap = document.createElement('div');
    wrap.className = 'event-carousel about-gallery-carousel';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-roledescription', 'carousel');
    wrap.setAttribute('aria-label', 'Photo gallery');

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
      slide.setAttribute('aria-label', 'Gallery page ' + (i + 1) + ' of ' + n);
      slide.appendChild(buildSlideInner(pages[i]));
      track.appendChild(slide);
      slides.push(slide);
      var slideImgs = slide.querySelectorAll('img');
      for (var si = 0; si < slideImgs.length; si++) {
        slideImgs[si].addEventListener('load', scheduleViewportHeight);
        slideImgs[si].addEventListener('error', scheduleViewportHeight);
      }
      var slideObjs = slide.querySelectorAll('object.about-gallery-item__pdf-obj');
      for (var so = 0; so < slideObjs.length; so++) {
        slideObjs[so].addEventListener('load', scheduleViewportHeight);
        slideObjs[so].addEventListener('error', scheduleViewportHeight);
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
    prevBtn.setAttribute('aria-label', 'Previous gallery page');
    prevBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>';
    prevWrap.appendChild(prevBtn);

    var dots = document.createElement('div');
    dots.className = 'event-carousel__dots';
    dots.setAttribute('role', 'tablist');
    dots.setAttribute('aria-label', 'Choose page');
    var dotButtons = [];
    for (var d = 0; d < n; d++) {
      (function (idx) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'event-carousel__dot';
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', 'Go to page ' + (idx + 1));
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
    nextBtn.setAttribute('aria-label', 'Next gallery page');
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
    window.addEventListener('load', scheduleViewportHeight);

    root.appendChild(wrap);
    applyTransform();
  }

  function runGalleryWithImages(items) {
    disconnectCarouselResizeObserver();
    root.innerHTML = '';
    var pages = chunkImages(items, PER_PAGE);
    root.className = 'event-cards event-cards--carousel about-gallery-carousel-mount';
    root.setAttribute('data-count', String(pages.length));

    if (pages.length <= 1) {
      var single = document.createElement('div');
      single.className = 'about-gallery-single';
      single.appendChild(buildSlideInner(pages[0]));
      root.appendChild(single);
      return;
    }

    buildCarousel(pages);
  }

  function showGalleryEmptyState() {
    root.className = 'about-gallery-empty-mount';
    root.removeAttribute('data-count');
    root.innerHTML =
      '<p class="about-gallery-empty" role="status">Gallery photos are added here by Houston Badminton Center. Check back soon.</p>';
  }

  var lastGalleryKey = '';

  function payloadKey(d) {
    try {
      if (!d) return '';
      var images = d.images || [];
      var sc =
        typeof d.slotCount === 'number' ? d.slotCount : images.length;
      return JSON.stringify({
        revision: typeof d.revision === 'number' ? d.revision : 0,
        slotCount: sc,
        hasCustom: !!d.hasCustom,
        images: images,
      });
    } catch (e) {
      return '';
    }
  }

  function refreshGallery() {
    return fetch('/api/about-gallery-asset', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var key = payloadKey(d);
        if (key === lastGalleryKey) return;
        lastGalleryKey = key;
        var custom = [];
        if (d && d.images && d.images.length) {
          for (var i = 0; i < d.images.length; i++) {
            var row = d.images[i];
            if (row && row.url) {
              var rk =
                row.kind === 'pdf' || row.kind === 'image'
                  ? row.kind
                  : /\.pdf(\?|$)/i.test(row.url)
                    ? 'pdf'
                    : 'image';
              custom.push({ src: row.url, alt: row.alt || '', kind: rk });
            }
          }
        }
        if (custom.length > 0) {
          runGalleryWithImages(custom);
          return;
        }
        showGalleryEmptyState();
      })
      .catch(function () {
        if (!lastGalleryKey) {
          lastGalleryKey = '__fallback__';
          showGalleryEmptyState();
        }
      });
  }

  refreshGallery();

  setInterval(function () {
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    refreshGallery();
  }, 10000);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      refreshGallery();
    }
  });

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      refreshGallery();
    }
  });
})();

