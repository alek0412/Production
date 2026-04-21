/**
 * Alternate Services — coach & Minami reach-out; Contact page — info@ mailto.
 * Send: opens default email app (mailto:). If that does not work, user can use common webmail providers in the browser.
 */
(function () {
  'use strict';

  function gmailComposeUrl(to, subject, body) {
    return (
      'https://mail.google.com/mail/?view=cm&fs=1&to=' +
      encodeURIComponent(to) +
      '&su=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(body)
    );
  }

  function outlookComposeUrl(to, subject, body) {
    return (
      'https://outlook.live.com/mail/0/deeplink/compose?to=' +
      encodeURIComponent(to) +
      '&subject=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(body)
    );
  }

  function yahooComposeUrl(to, subject, body) {
    return (
      'https://compose.mail.yahoo.com/?to=' +
      encodeURIComponent(to) +
      '&subject=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(body)
    );
  }

  function showFallback(afterEl, id, to, subject, body) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('p');
      el.id = id;
      el.className = 'email-compose-fallback';
      el.setAttribute('role', 'note');
      afterEl.parentNode.insertBefore(el, afterEl.nextSibling);
    }
    el.hidden = false;
    el.textContent = '';
    el.appendChild(
      document.createTextNode(
        "If your email app didn't open, compose in your browser (you may need to sign in): "
      )
    );
    var aG = document.createElement('a');
    aG.href = gmailComposeUrl(to, subject, body);
    aG.target = '_blank';
    aG.rel = 'noopener noreferrer';
    aG.textContent = 'Gmail';
    el.appendChild(aG);
    el.appendChild(document.createTextNode(' · '));
    var aO = document.createElement('a');
    aO.href = outlookComposeUrl(to, subject, body);
    aO.target = '_blank';
    aO.rel = 'noopener noreferrer';
    aO.textContent = 'Outlook.com';
    el.appendChild(aO);
    el.appendChild(document.createTextNode(' · '));
    var aY = document.createElement('a');
    aY.href = yahooComposeUrl(to, subject, body);
    aY.target = '_blank';
    aY.rel = 'noopener noreferrer';
    aY.textContent = 'Yahoo Mail';
    el.appendChild(aY);
    el.appendChild(document.createTextNode(' · or any other webmail provider.'));
  }

  var select = document.getElementById('coach-select');
  var emailBox = document.getElementById('coach-email');
  var messageBox = document.getElementById('session-message');
  var sendBtn = document.getElementById('open-email');

  if (select && emailBox && sendBtn) {
    var PERSONAL_TRAINER = 'personal-trainer';

    function updateToField() {
      var val = select.value;
      if (val === PERSONAL_TRAINER) {
        emailBox.value = '';
        emailBox.readOnly = false;
        emailBox.placeholder = "Enter your trainer's email";
      } else {
        emailBox.value = val || '';
        emailBox.readOnly = true;
        emailBox.placeholder = "Select a coach above or enter your trainer's email";
      }
    }

    select.addEventListener('change', updateToField);

    sendBtn.addEventListener('click', function () {
      var to = emailBox.value ? emailBox.value.trim() : '';
      if (!to) {
        alert("Please select a coach or enter your trainer's email.");
        return;
      }
      var subject = 'Training inquiry — Houston Badminton Center';
      var messageText =
        messageBox && messageBox.value
          ? messageBox.value.trim()
          : "Hi, I'm interested in scheduling a training session. Please let me know your availability.";
      window.location.href =
        'mailto:' +
        to +
        '?subject=' +
        encodeURIComponent(subject) +
        '&body=' +
        encodeURIComponent(messageText);
      showFallback(sendBtn, 'coach-email-fallback', to, subject, messageText);
    });
  }

  var minamiSend = document.getElementById('minami-send');
  var minamiMessage = document.getElementById('minami-message');
  if (minamiSend) {
    minamiSend.addEventListener('click', function () {
      var to = 'minami.hm33@gmail.com';
      var subject = 'Massage session inquiry — Houston Badminton Center';
      var messageText =
        minamiMessage && minamiMessage.value
          ? minamiMessage.value.trim()
          : "Hi Mika, I'd like to inquire about booking a massage session. Please let me know your availability.";
      window.location.href =
        'mailto:' +
        to +
        '?subject=' +
        encodeURIComponent(subject) +
        '&body=' +
        encodeURIComponent(messageText);
      showFallback(minamiSend, 'minami-email-fallback', to, subject, messageText);
    });
  }

  var contactSend = document.getElementById('contact-send');
  var contactMessage = document.getElementById('contact-message');
  var contactName = document.getElementById('contact-name');
  var contactReplyEmail = document.getElementById('contact-email');
  if (contactSend) {
    contactSend.addEventListener('click', function () {
      var to = 'info@houstonbadmintoncenter.com';
      var subject = 'Question for Houston Badminton Center';
      var bodyCore =
        contactMessage && contactMessage.value
          ? contactMessage.value.trim()
          : "Hi, I have a question for Houston Badminton Center. Please get back to me when you can.";
      var namePart =
        contactName && contactName.value ? contactName.value.trim() : '';
      var replyPart =
        contactReplyEmail && contactReplyEmail.value
          ? contactReplyEmail.value.trim()
          : '';
      var header = '';
      if (namePart) header += 'Name: ' + namePart + '\n';
      if (replyPart) header += 'Reply-to: ' + replyPart + '\n';
      if (header) header += '\n';
      var messageText = header + bodyCore;
      window.location.href =
        'mailto:' +
        to +
        '?subject=' +
        encodeURIComponent(subject) +
        '&body=' +
        encodeURIComponent(messageText);
      showFallback(contactSend, 'contact-email-fallback', to, subject, messageText);
    });
  }

  /** Contact "Open in Google Maps": explicit empty origin= so the start field is not prefilled as "Your location". */
  var mapLink = document.getElementById('contact-directions-generic');
  if (mapLink) {
    mapLink.addEventListener('click', function (e) {
      var address =
        mapLink.getAttribute('data-address') || '10550 West Airport Blvd, Stafford, TX 77477';
      var dest = encodeURIComponent(address);
      var webUrl = 'https://www.google.com/maps/dir/?api=1&origin=&destination=' + dest;
      var ua = navigator.userAgent || '';
      var isAndroid = /Android/i.test(ua);
      var isApple =
        /iPhone|iPad|iPod/i.test(ua) ||
        (typeof navigator.platform === 'string' &&
          navigator.platform === 'MacIntel' &&
          navigator.maxTouchPoints > 1);

      if (isApple) {
        e.preventDefault();
        window.open(webUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      if (isAndroid) {
        e.preventDefault();
        var intentPath =
          'intent://www.google.com/maps/dir/?api=1&origin=&destination=' + dest;
        var intentUrl =
          intentPath +
          '#Intent;scheme=https;package=com.google.android.apps.maps;S.browser_fallback_url=' +
          encodeURIComponent(webUrl) +
          ';end';
        window.location.href = intentUrl;
        return;
      }
    });
  }
})();
