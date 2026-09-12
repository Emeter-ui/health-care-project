// Injected into every dashboard page.
// Verifies the session on load and populates user info in the UI.
(async function () {
  let user;
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) throw new Error('not authenticated');
    user = await res.json();
  } catch {
    window.location.href = 'login.html';
    return;
  }

  // Guard: make sure this page matches the user's role
  const page = window.location.pathname.split('/').pop();
  const rolePageMap = {
    admin:   'admin.html',
    doctor:  'doctor.html',
    patient: 'patient.html',
  };
  if (rolePageMap[user.role] && page !== rolePageMap[user.role]) {
    window.location.href = rolePageMap[user.role];
    return;
  }

  // Expose globally so each page script can read it
  window.CURRENT_USER = user;

  // Fill in name / avatar wherever the placeholders exist
  document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = user.name; });
  document.querySelectorAll('[data-user-initials]').forEach(el => {
    const parts = user.name.split(' ');
    el.textContent = (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  });

  // Dispatch event so page scripts know auth is ready
  document.dispatchEvent(new CustomEvent('auth:ready', { detail: user }));
})();

// Logout handler — called by every dashboard's Logout link
async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.href = 'index.html';
}
