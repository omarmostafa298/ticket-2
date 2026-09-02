// Backend API base — same host as the page, port 4000 (matches docker-compose backend port).
const API_BASE = `${window.location.protocol}//${window.location.hostname}:4000/api`;

function getToken() { return localStorage.getItem('token'); }
function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}
function saveSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}
async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}
function requireAuth(role) {
  const token = getToken();
  const user = getUser();
  if (!token || !user) { window.location.href = 'index.html'; return null; }
  if (role && user.role !== role) {
    window.location.href = user.role === 'admin' ? 'admin-dashboard.html' : 'user-dashboard.html';
    return null;
  }
  return user;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function statusPill(status) {
  return status === 'done'
    ? '<span class="pill closed">Done</span>'
    : '<span class="pill open">Open</span>';
}
function categoryPill(category) {
  const label = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Software';
  const cls = ['network', 'hardware', 'software'].includes(category) ? category : 'software';
  return `<span class="pill category-${cls}">${label}</span>`;
}

/* ---------------- index.html: login + register ---------------- */

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');

if (loginForm) {
  const existing = getUser();
  if (existing && getToken()) {
    window.location.href = existing.role === 'admin' ? 'admin-dashboard.html' : 'user-dashboard.html';
  }

  showRegisterLink?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-box').classList.add('hidden');
    document.getElementById('register-box').classList.remove('hidden');
  });
  showLoginLink?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-box').classList.add('hidden');
    document.getElementById('login-box').classList.remove('hidden');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      saveSession(data.token, data.user);
      window.location.href = data.user.role === 'admin' ? 'admin-dashboard.html' : 'user-dashboard.html';
    } catch (err) {
      authError.textContent = err.message;
    }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      saveSession(data.token, data.user);
      window.location.href = 'user-dashboard.html';
    } catch (err) {
      authError.textContent = err.message;
    }
  });
}

/* ---------------- user-dashboard.html ---------------- */

const userTicketRows = document.getElementById('user-ticket-rows');

if (userTicketRows) {
  const user = requireAuth('user');
  if (user) {
    document.getElementById('user-name').textContent = user.username;
    document.getElementById('user-avatar').textContent = user.username.charAt(0).toUpperCase();

    async function loadMyTickets() {
      userTicketRows.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
      try {
        const tickets = await apiFetch('/tickets');
        if (tickets.length === 0) {
          userTicketRows.innerHTML = `<tr><td colspan="5">No tickets yet. Submit one above.</td></tr>`;
          return;
        }
        userTicketRows.innerHTML = tickets.map(t => `
          <tr>
            <td>${escapeHtml(t.title)}${t.description ? `<div class="row-sub">${escapeHtml(t.description)}</div>` : ''}</td>
            <td>${categoryPill(t.category)}</td>
            <td>${fmtDate(t.created_at)}</td>
            <td>${statusPill(t.status)}</td>
            <td>
              ${t.status === 'open'
                ? `<button class="btn-secondary btn-small" data-id="${t.id}" data-action="done">Lock down</button>`
                : `<button class="btn-secondary btn-small" data-id="${t.id}" data-action="reopen">Reopen</button>`}
            </td>
          </tr>
        `).join('');
      } catch (err) {
        userTicketRows.innerHTML = `<tr><td colspan="5">Failed to load tickets: ${escapeHtml(err.message)}</td></tr>`;
      }
    }

    userTicketRows.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-id]');
      if (!btn) return;
      const id = btn.dataset.id;
      const newStatus = btn.dataset.action === 'done' ? 'done' : 'open';
      btn.disabled = true;
      try {
        await apiFetch(`/tickets/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: newStatus }),
        });
        loadMyTickets();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });

    let selectedCategory = 'software';
    const categorySegmented = document.getElementById('category-segmented');
    categorySegmented?.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      selectedCategory = btn.dataset.category;
      categorySegmented.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    const newTicketForm = document.getElementById('new-ticket-form');
    const newTicketError = document.getElementById('new-ticket-error');
    newTicketForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      newTicketError.textContent = '';
      const title = document.getElementById('ticket-title').value.trim();
      const description = document.getElementById('ticket-description').value.trim();
      if (!title) { newTicketError.textContent = 'Please describe the problem in a few words.'; return; }
      try {
        await apiFetch('/tickets', {
          method: 'POST',
          body: JSON.stringify({ title, description, category: selectedCategory }),
        });
        newTicketForm.reset();
        categorySegmented?.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
        categorySegmented?.querySelector('[data-category="software"]')?.classList.add('active');
        selectedCategory = 'software';
        loadMyTickets();
      } catch (err) {
        newTicketError.textContent = err.message;
      }
    });

    document.getElementById('logout-btn').addEventListener('click', logout);
    loadMyTickets();
  }
}

/* ---------------- admin-dashboard.html ---------------- */

const adminTicketRows = document.getElementById('admin-ticket-rows');

if (adminTicketRows) {
  const user = requireAuth('admin');
  if (user) {
    document.getElementById('user-name').textContent = user.username;
    document.getElementById('user-avatar').textContent = user.username.charAt(0).toUpperCase();

    async function loadStats() {
      try {
        const stats = await apiFetch('/admin/stats');
        document.getElementById('stat-total').textContent = stats.total;
        document.getElementById('stat-open').textContent = stats.open;
        document.getElementById('stat-done').textContent = stats.done;
      } catch (err) {
        console.error(err);
      }
    }

    async function loadAllTickets() {
      adminTicketRows.innerHTML = `<tr><td colspan="7">Loading…</td></tr>`;
      try {
        const tickets = await apiFetch('/admin/tickets');
        if (tickets.length === 0) {
          adminTicketRows.innerHTML = `<tr><td colspan="7">No tickets yet.</td></tr>`;
          return;
        }
        adminTicketRows.innerHTML = tickets.map(t => `
          <tr>
            <td>#${t.id}</td>
            <td>${escapeHtml(t.reported_by)}</td>
            <td>${escapeHtml(t.title)}${t.description ? `<div class="row-sub">${escapeHtml(t.description)}</div>` : ''}</td>
            <td>${categoryPill(t.category)}</td>
            <td>${fmtDate(t.created_at)}</td>
            <td>${statusPill(t.status)}</td>
            <td>
              ${t.status === 'open'
                ? `<button class="btn-secondary btn-small" data-id="${t.id}" data-action="done">Lock down</button>`
                : `<button class="btn-secondary btn-small" data-id="${t.id}" data-action="reopen">Reopen</button>`}
            </td>
          </tr>
        `).join('');
      } catch (err) {
        adminTicketRows.innerHTML = `<tr><td colspan="7">Failed to load tickets: ${escapeHtml(err.message)}</td></tr>`;
      }
    }

    adminTicketRows.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-id]');
      if (!btn) return;
      const id = btn.dataset.id;
      const newStatus = btn.dataset.action === 'done' ? 'done' : 'open';
      btn.disabled = true;
      try {
        await apiFetch(`/tickets/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: newStatus }),
        });
        loadStats();
        loadAllTickets();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });

    document.getElementById('logout-btn').addEventListener('click', logout);
    loadStats();
    loadAllTickets();
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
