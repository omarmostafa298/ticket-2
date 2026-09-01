const API_URL = window.API_URL || `http://${window.location.hostname}:4000/api`;

// ---- Views ----
const authView = document.getElementById('auth-view');
const userView = document.getElementById('user-view');
const adminView = document.getElementById('admin-view');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');
const showLoginText = document.getElementById('show-login-text');

showRegisterLink.addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  showRegisterLink.parentElement.classList.add('hidden');
  showLoginText.classList.remove('hidden');
});

showLoginLink.addEventListener('click', (e) => {
  e.preventDefault();
  registerForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  showLoginText.classList.add('hidden');
  showRegisterLink.parentElement.classList.remove('hidden');
});

// ---- Auth state ----

function saveSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function getSession() {
  const token = localStorage.getItem('token');
  const userRaw = localStorage.getItem('user');
  if (!token || !userRaw) return null;
  return { token, user: JSON.parse(userRaw) };
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function authHeaders() {
  const session = getSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}

// ---- Register / Login ----

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;

  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      registerError.textContent = data.error || 'Registration failed';
      return;
    }
    saveSession(data.token, data.user);
    enterApp();
  } catch (err) {
    registerError.textContent = 'Could not reach the server.';
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.textContent = data.error || 'Login failed';
      return;
    }
    saveSession(data.token, data.user);
    enterApp();
  } catch (err) {
    loginError.textContent = 'Could not reach the server.';
  }
});

document.getElementById('logout-btn-user').addEventListener('click', logout);
document.getElementById('logout-btn-admin').addEventListener('click', logout);

function logout() {
  clearSession();
  location.reload();
}

// ---- Entry point: decide which view to show ----

function enterApp() {
  const session = getSession();
  if (!session) {
    authView.classList.remove('hidden');
    userView.classList.add('hidden');
    adminView.classList.add('hidden');
    return;
  }
  authView.classList.add('hidden');

  if (session.user.role === 'admin') {
    userView.classList.add('hidden');
    adminView.classList.remove('hidden');
    document.getElementById('admin-welcome').textContent = `Signed in as ${session.user.username} (admin)`;
    loadStats();
  } else {
    adminView.classList.add('hidden');
    userView.classList.remove('hidden');
    document.getElementById('user-welcome').textContent = `Signed in as ${session.user.username}`;
    updateNotifyButton();
    loadTickets();
  }
}

// ==================== USER VIEW ====================

const ticketForm = document.getElementById('ticket-form');
const ticketList = document.getElementById('ticket-list');
const notifyBtn = document.getElementById('notify-btn');

function updateNotifyButton() {
  if (!('Notification' in window)) {
    notifyBtn.textContent = 'Notifications not supported';
    notifyBtn.disabled = true;
    return;
  }
  if (Notification.permission === 'granted') {
    notifyBtn.textContent = 'Notifications enabled';
    notifyBtn.disabled = true;
  } else {
    notifyBtn.textContent = 'Enable Notifications';
    notifyBtn.disabled = false;
  }
}

notifyBtn.addEventListener('click', async () => {
  await Notification.requestPermission();
  updateNotifyButton();
});

ticketForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('title').value;
  const description = document.getElementById('description').value;

  await fetch(`${API_URL}/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title, description }),
  });

  ticketForm.reset();
  loadTickets();
});

async function loadTickets() {
  try {
    const res = await fetch(`${API_URL}/tickets`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) return logout();
    const tickets = await res.json();
    renderTickets(tickets);
  } catch (err) {
    ticketList.innerHTML = '<li>Failed to load tickets. Is the backend running?</li>';
  }
}

function renderTickets(tickets) {
  ticketList.innerHTML = '';
  if (tickets.length === 0) {
    ticketList.innerHTML = '<li>No problems reported yet.</li>';
    return;
  }
  for (const t of tickets) {
    const li = document.createElement('li');
    li.className = 'ticket-item' + (t.status === 'done' ? ' done' : '');

    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'ticket-title';
    title.textContent = t.title;
    info.appendChild(title);

    if (t.description) {
      const desc = document.createElement('div');
      desc.className = 'ticket-meta';
      desc.textContent = t.description;
      info.appendChild(desc);
    }

    const meta = document.createElement('div');
    meta.className = 'ticket-meta';
    meta.textContent = 'Reported: ' + new Date(t.created_at).toLocaleString();
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'ticket-actions';
    const btn = document.createElement('button');
    btn.textContent = t.status === 'done' ? 'Mark Not Done' : 'Mark Done';
    btn.addEventListener('click', () => toggleStatus(t));
    actions.appendChild(btn);

    li.appendChild(info);
    li.appendChild(actions);
    ticketList.appendChild(li);
  }
}

async function toggleStatus(ticket) {
  const newStatus = ticket.status === 'done' ? 'open' : 'done';
  await fetch(`${API_URL}/tickets/${ticket.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status: newStatus }),
  });
  loadTickets();
}

// ==================== ADMIN VIEW ====================

async function loadStats() {
  try {
    const res = await fetch(`${API_URL}/admin/stats`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) return logout();
    const stats = await res.json();
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-done').textContent = stats.done;
    document.getElementById('stat-open').textContent = stats.open;
  } catch (err) {
    console.error('Failed to load stats', err);
  }
}

const viewDbBtn = document.getElementById('view-db-btn');
const dbView = document.getElementById('db-view');
const dbTableBody = document.getElementById('db-table-body');
let dbVisible = false;

viewDbBtn.addEventListener('click', async () => {
  dbVisible = !dbVisible;
  if (dbVisible) {
    viewDbBtn.textContent = 'Hide Database';
    dbView.classList.remove('hidden');
    await loadAllTickets();
  } else {
    viewDbBtn.textContent = 'View Database';
    dbView.classList.add('hidden');
  }
});

async function loadAllTickets() {
  try {
    const res = await fetch(`${API_URL}/admin/tickets`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) return logout();
    const tickets = await res.json();
    renderDbTable(tickets);
  } catch (err) {
    dbTableBody.innerHTML = '<tr><td colspan="7">Failed to load data.</td></tr>';
  }
}

function renderDbTable(tickets) {
  dbTableBody.innerHTML = '';
  if (tickets.length === 0) {
    dbTableBody.innerHTML = '<tr><td colspan="7">No tickets yet.</td></tr>';
    return;
  }
  for (const t of tickets) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.id}</td>
      <td>${escapeHtml(t.reported_by)}</td>
      <td>${escapeHtml(t.title)}</td>
      <td>${escapeHtml(t.description || '')}</td>
      <td>${new Date(t.created_at).toLocaleString()}</td>
      <td>${t.closed_at ? new Date(t.closed_at).toLocaleString() : '-'}</td>
      <td><span class="badge ${t.status}">${t.status === 'done' ? 'Done' : 'Not Done'}</span></td>
    `;
    dbTableBody.appendChild(tr);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Init ----
enterApp();
