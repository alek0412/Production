(function () {
  "use strict";

  function pad2(n) {
    var x = parseInt(n, 10);
    if (x < 10) return "0" + x;
    return String(x);
  }

  function showMessage(el, text, kind) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.classList.remove("waiver-form-message--error", "waiver-form-message--success");
    if (kind === "success") el.classList.add("waiver-form-message--success");
    else if (kind === "error") el.classList.add("waiver-form-message--error");
  }

  var yearSelect = document.querySelector('select[name="birth_year"]');
  if (yearSelect) {
    var y = new Date().getFullYear();
    for (var i = y; i >= y - 100; i--) {
      var opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      yearSelect.appendChild(opt);
    }
  }

  var form = document.getElementById("waiver-form");
  var msgEl = document.getElementById("waiver-form-message");
  var submitBtn = document.getElementById("waiver-submit-btn");

  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    showMessage(msgEl, "", null);

    var agree = document.getElementById("agree");
    if (!agree || !agree.checked) {
      showMessage(msgEl, "You must agree to the waiver terms.", "error");
      return;
    }

    var fd = new FormData(form);
    var pw = fd.get("password") || "";
    var pw2 = fd.get("password_confirm") || "";
    if (pw !== pw2) {
      showMessage(msgEl, "Passwords do not match.", "error");
      return;
    }

    var y = parseInt(fd.get("birth_year"), 10);
    var m = parseInt(fd.get("birth_month"), 10);
    var d = parseInt(fd.get("birth_day"), 10);
    if (!y || !m || !d) {
      showMessage(msgEl, "Please select your full birth date.", "error");
      return;
    }
    var birthdate = y + "-" + pad2(m) + "-" + pad2(d);
    var testDate = new Date(y, m - 1, d);
    if (testDate.getFullYear() !== y || testDate.getMonth() !== m - 1 || testDate.getDate() !== d) {
      showMessage(msgEl, "Please enter a valid birth date.", "error");
      return;
    }

    var email = String(fd.get("email") || "").trim();
    var emPhone = String(fd.get("emergency_phone") || "").trim();
    var emEmail = String(fd.get("emergency_email") || "").trim();
    var phone = String(fd.get("mobile") || "").trim();
    if (emPhone === phone) {
      showMessage(msgEl, "Emergency phone must be different from your mobile number.", "error");
      return;
    }
    if (emEmail.toLowerCase() === email.toLowerCase()) {
      showMessage(msgEl, "Emergency email must be different from your own email.", "error");
      return;
    }

    var payload = {
      first_name: String(fd.get("first_name") || "").trim(),
      last_name: String(fd.get("last_name") || "").trim(),
      phone: phone,
      email: email,
      street_address: String(fd.get("street_address") || "").trim(),
      city: String(fd.get("city") || "").trim(),
      state: String(fd.get("state") || "").trim(),
      zip_code: String(fd.get("zip_code") || "").trim(),
      birthdate: birthdate,
      password: pw,
      emergency_first: String(fd.get("emergency_first_name") || "").trim(),
      emergency_last: String(fd.get("emergency_last_name") || "").trim(),
      relationship: String(fd.get("emergency_relationship") || "").trim(),
      emergency_phone: emPhone,
      emergency_email: emEmail,
      agree: true,
      password_confirm: pw2,
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }

    var willNavigate = false;

    fetch("/api/waiver-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
    })
      .then(function (r) {
        return r.text().then(function (t) {
          var body = {};
          try {
            body = t ? JSON.parse(t) : {};
          } catch (err) {
            body = { success: false, message: t || "Unexpected response from server." };
          }
          return { status: r.status, ok: r.ok, body: body };
        });
      })
      .then(function (res) {
        if (res.status === 201 && res.body && res.body.success) {
          willNavigate = true;
          showMessage(msgEl, res.body.message || "You’re registered. Redirecting…", "success");
          try {
            sessionStorage.setItem("hbc_customer_logged_in", "1");
          } catch (err) {}
          window.location.href = "/client/Client_Availability.html?waiver_ok=1";
          return;
        }
        var m =
          (res.body && res.body.message) ||
          (res.status === 400 ? "Please check the form and try again." : "Registration could not be completed.");
        showMessage(msgEl, m, "error");
      })
      .catch(function () {
        showMessage(
          msgEl,
          "Unable to reach the server. Open this site from the backend (http://localhost:3000) and ensure the Flask app is running for waiver registration.",
          "error"
        );
      })
      .then(function () {
        if (submitBtn && !willNavigate) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Complete registration & join HBC";
        }
      });
  });
})();
