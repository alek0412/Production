(function () {
      var tabCustomer = document.getElementById('tab-customer');
      var tabAdmin = document.getElementById('tab-admin');
      var panelCustomer = document.getElementById('panel-customer');
      var panelAdmin = document.getElementById('panel-admin');

      function showCustomer() {
        tabCustomer.classList.add('active');
        tabCustomer.setAttribute('aria-selected', 'true');
        tabAdmin.classList.remove('active');
        tabAdmin.setAttribute('aria-selected', 'false');
        panelCustomer.classList.add('active');
        panelAdmin.classList.remove('active');
      }
      function showAdmin() {
        tabAdmin.classList.add('active');
        tabAdmin.setAttribute('aria-selected', 'true');
        tabCustomer.classList.remove('active');
        tabCustomer.setAttribute('aria-selected', 'false');
        panelAdmin.classList.add('active');
        panelCustomer.classList.remove('active');
      }

      tabCustomer.addEventListener('click', showCustomer);
      tabAdmin.addEventListener('click', showAdmin);

      var urlParams = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      var nextTarget = null;
      if (urlParams) {
        try {
          var rawNext = urlParams.get('next');
          if (rawNext) {
            var decNext = decodeURIComponent(rawNext);
            if (/^\/client\/Client_[^/]+\.html$/i.test(decNext)) {
              nextTarget = decNext;
            }
          }
        } catch (e) {}
      }
      var tabParam = urlParams ? urlParams.get('tab') : null;
      if (tabParam === 'admin') {
        showAdmin();
      } else {
        try {
          if (sessionStorage.getItem('hbc_login_tab') === 'admin') {
            sessionStorage.removeItem('hbc_login_tab');
            showAdmin();
          }
        } catch (e) {}
      }

      // Customer form
      var customerForm = document.getElementById('customer-login-form');
      var customerError = document.getElementById('customer-login-error');
      var customerBtn = document.getElementById('customer-login-btn');
      customerForm.addEventListener('submit', function (e) {
        e.preventDefault();
        customerError.hidden = true;
        customerError.textContent = '';
        customerBtn.disabled = true;
        customerBtn.textContent = 'Signing in…';
        var email = document.getElementById('customer-email').value.trim();
        var password = document.getElementById('customer-password').value;
        fetch('/api/customer-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password }),
          credentials: 'same-origin'
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.success) {
              try {
                sessionStorage.setItem('hbc_customer_logged_in', '1');
                sessionStorage.removeItem('hbc_client_preview_mode');
                if (data.firstName) {
                  sessionStorage.setItem('hbc_customer_first_name', String(data.firstName).trim());
                }
              } catch (e) {}
              var dest = '/client/Client_Availability.html?logged_in=1';
              if (nextTarget) {
                dest = nextTarget.indexOf('?') >= 0 ? nextTarget + '&logged_in=1' : nextTarget + '?logged_in=1';
              }
              window.location.href = dest;
            } else {
              customerError.textContent = data.message || 'Invalid email or password';
              customerError.hidden = false;
              customerBtn.disabled = false;
              customerBtn.textContent = 'Sign in';
            }
          })
          .catch(function () {
            customerError.textContent = 'Unable to reach server. Open the site from the backend (e.g. http://localhost:3000).';
            customerError.hidden = false;
            customerBtn.disabled = false;
            customerBtn.textContent = 'Sign in';
          });
      });

      // Admin form
      var adminForm = document.getElementById('admin-login-form');
      var adminError = document.getElementById('admin-login-error');
      var adminBtn = document.getElementById('admin-login-btn');
      adminForm.addEventListener('submit', function (e) {
        e.preventDefault();
        adminError.hidden = true;
        adminError.textContent = '';
        adminBtn.disabled = true;
        adminBtn.textContent = 'Signing in…';
        var email = document.getElementById('admin-email').value.trim();
        var password = document.getElementById('admin-password').value;
        fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password }),
          credentials: 'same-origin'
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.success) {
              window.location.href = '/admin/Admin_Dashboard.html';
            } else {
              adminError.textContent = data.message || 'Invalid email or password';
              adminError.hidden = false;
              adminBtn.disabled = false;
              adminBtn.textContent = 'Sign in';
            }
          })
          .catch(function () {
            adminError.textContent = 'Unable to reach server. Open the site from the backend (e.g. http://localhost:3000).';
            adminError.hidden = false;
            adminBtn.disabled = false;
            adminBtn.textContent = 'Sign in';
          });
      });
    })();

function validateLoginLength(username) {
    return username.length > 3;
}