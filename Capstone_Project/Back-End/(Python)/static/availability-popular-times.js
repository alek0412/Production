/**
 * Availability pages only (General_Availability + Client_Availability).
 * Loads Popular Times PDF or image from GET /api/popular-times-pdf.
 * When admin has removed the asset, payload.visible is false — hide the block entirely.
 */
(function () {
  'use strict';

  var root = document.getElementById('availability-popular-times-root');
  var container = document.getElementById('popular-times-pdf');
  if (!root || !container) return;

  var fallbackUrl = '/images/Popular-Times-at-HBC.pdf';
  var maxWidth = 960;
  var dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  /** Cap PDF raster width to viewport on phones; keep 960 on wide screens (desktop unchanged). */
  function getRenderWidthCap() {
    try {
      var w = document.documentElement ? document.documentElement.clientWidth : maxWidth;
      return Math.min(maxWidth, Math.max(280, w - 32));
    } catch (e) {
      return maxWidth;
    }
  }

  function setBlockShown(show) {
    if (show) {
      root.removeAttribute('hidden');
    } else {
      root.setAttribute('hidden', '');
    }
  }

  function renderPage(pdf, pageNum) {
    pdf.getPage(pageNum).then(function (page) {
      var cap = getRenderWidthCap();
      var baseScale = page.getViewport({ scale: 1 });
      var scale = (cap / baseScale.width) * dpr;
      var viewport = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.width = viewport.width / dpr + 'px';
      canvas.style.height = viewport.height / dpr + 'px';
      container.appendChild(canvas);
      page.render({ canvasContext: ctx, viewport: viewport });
    });
  }

  function loadPdf(url) {
    container.innerHTML = '';
    if (typeof pdfjsLib === 'undefined') {
      container.innerHTML =
        '<p style="color: var(--text-muted);">PDF viewer unavailable. <a href="' +
        url +
        '">Open PDF</a></p>';
      return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    pdfjsLib
      .getDocument(url)
      .promise.then(function (pdf) {
        for (var i = 1; i <= pdf.numPages; i++) renderPage(pdf, i);
      })
      .catch(function () {
        container.innerHTML =
          '<p style="color: var(--text-muted);">Unable to load PDF. <a href="' +
          url +
          '">Open PDF</a></p>';
      });
  }

  function loadImage(url) {
    container.innerHTML = '';
    var img = document.createElement('img');
    img.className = 'popular-times-img';
    img.src = url;
    img.alt = 'Popular times at Houston Badminton Center';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = function () {
      container.innerHTML =
        '<p style="color: var(--text-muted);">Unable to load image. <a href="' +
        url +
        '">Open file</a></p>';
    };
    container.appendChild(img);
  }

  function loadAsset(url, kind) {
    if (kind === 'image') loadImage(url);
    else loadPdf(url);
  }

  var lastAssetKey = '';

  function payloadKey(d) {
    return JSON.stringify({
      revision: d && typeof d.revision === 'number' ? d.revision : 0,
      url: d && d.url ? d.url : '',
      kind: d && d.kind ? d.kind : '',
      visible: !!(d && d.visible !== false),
    });
  }

  function refreshPopularTimes() {
    return fetch('/api/popular-times-pdf', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var key = payloadKey(d);
        if (key === lastAssetKey) return;
        lastAssetKey = key;
        if (!d) {
          container.innerHTML = '';
          setBlockShown(false);
          return;
        }
        if (d.visible === false) {
          container.innerHTML = '';
          setBlockShown(false);
          return;
        }
        setBlockShown(true);
        var url = d && d.url ? d.url : fallbackUrl;
        var kind = d && d.kind === 'image' ? 'image' : 'pdf';
        loadAsset(url, kind);
      })
      .catch(function () {
        if (!lastAssetKey) {
          lastAssetKey = '__fallback__';
          setBlockShown(true);
          loadAsset(fallbackUrl, 'pdf');
        }
      });
  }

  refreshPopularTimes();

  setInterval(function () {
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    refreshPopularTimes();
  }, 10000);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      refreshPopularTimes();
    }
  });

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      refreshPopularTimes();
    }
  });
})();
