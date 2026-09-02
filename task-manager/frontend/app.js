const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const emailField = document.getElementById('email-field');
    const passwordField = document.getElementById('password-field');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    emailField.classList.remove('has-error');
    passwordField.classList.remove('has-error');

    let valid = true;
    if (!email || !email.includes('@')) {
      emailField.classList.add('has-error');
      valid = false;
    }
    if (!password) {
      passwordField.classList.add('has-error');
      valid = false;
    }
    if (!valid) return;

    // TODO: replace with your real auth API call to the backend.
    sessionStorage.setItem('helpdesk_user_email', email);
    window.location.href = 'dashboard.html';
  });
}

const userNameEl = document.getElementById('user-name');
if (userNameEl) {
  const email = sessionStorage.getItem('helpdesk_user_email') || 'user@meinhardt.com';
  const namePart = email.split('@')[0];
  userNameEl.textContent = namePart;
  const avatar = document.getElementById('user-avatar');
  if (avatar) avatar.textContent = namePart.charAt(0).toUpperCase();
}

const newTicketBtn = document.getElementById('new-ticket-btn');
if (newTicketBtn) {
  newTicketBtn.addEventListener('click', function () {
    // TODO: open a "new ticket" form/modal wired to your backend's create-ticket endpoint.
    alert('Wire this button up to your create-ticket API endpoint.');
  });
}
