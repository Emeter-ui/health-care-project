require('dotenv').config();
const express      = require('express');
const session      = require('express-session');
const bcrypt       = require('bcryptjs');
const path         = require('path');
const nodemailer   = require('nodemailer');
const supabase     = require('./supabase');

// ── Email ─────────────────────────────────────────────────────────────────────
function getTransporter() {
  if (!process.env.EMAIL_FROM || !process.env.EMAIL_PASS ||
      process.env.EMAIL_FROM.startsWith('your-')) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_FROM, pass: process.env.EMAIL_PASS }
  });
}

async function sendConfirmationEmail({ to, patientName, doctorName, date, time, reason }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[Email] Skipped — configure EMAIL_FROM and EMAIL_PASS in .env');
    return;
  }
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  await transporter.sendMail({
    from: `"Smart Healthcare Clinic" <${process.env.EMAIL_FROM}>`,
    to,
    subject: 'Your Appointment Has Been Confirmed — Smart Healthcare Clinic',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:#0d6efd;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">🏥 Smart Healthcare Clinic</h1>
        </div>
        <div style="padding:28px;">
          <h2 style="color:#1a202c;margin:0 0 8px;">Appointment Confirmed ✅</h2>
          <p style="color:#4a5568;margin:0 0 24px;">Dear <strong>${patientName}</strong>, your appointment has been confirmed by your doctor.</p>
          <div style="background:#f0f4f8;border-radius:10px;padding:20px;margin-bottom:24px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#718096;font-size:13px;width:38%;">Doctor</td><td style="padding:8px 0;color:#1a202c;font-weight:600;">${doctorName}</td></tr>
              <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Date</td><td style="padding:8px 0;color:#1a202c;font-weight:600;">${formattedDate}</td></tr>
              <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Time</td><td style="padding:8px 0;color:#1a202c;font-weight:600;">${time}</td></tr>
              <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Reason</td><td style="padding:8px 0;color:#1a202c;font-weight:600;">${reason}</td></tr>
            </table>
          </div>
          <p style="color:#4a5568;font-size:13px;margin:0 0 8px;">⏰ Please arrive <strong>15 minutes</strong> before your appointment time.</p>
          <p style="color:#4a5568;font-size:13px;margin:0;">📋 Bring any previous medical records or prescriptions.</p>
        </div>
        <div style="background:#f7fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="color:#718096;font-size:12px;margin:0;">Smart Healthcare Clinic — Appointment Management System</p>
        </div>
      </div>`
  });
}

const app  = express();
const PORT = process.env.PORT || 4500;

// ── Supabase session store ────────────────────────────────────────────────────
class SupabaseStore extends session.Store {
  async get(sid, cb) {
    try {
      const { data } = await supabase.from('sessions').select('sess,expire').eq('sid', sid).maybeSingle();
      if (!data) return cb(null, null);
      if (new Date(data.expire) < new Date()) {
        await supabase.from('sessions').delete().eq('sid', sid);
        return cb(null, null);
      }
      cb(null, data.sess);
    } catch (e) { cb(e); }
  }
  async set(sid, sess, cb) {
    try {
      const expire = new Date(Date.now() + (sess.cookie?.maxAge || 8 * 60 * 60 * 1000));
      await supabase.from('sessions').upsert({ sid, sess, expire: expire.toISOString() });
      cb(null);
    } catch (e) { cb(e); }
  }
  async destroy(sid, cb) {
    try {
      await supabase.from('sessions').delete().eq('sid', sid);
      cb(null);
    } catch (e) { cb(e); }
  }
  async touch(sid, sess, cb) {
    try {
      const expire = new Date(Date.now() + (sess.cookie?.maxAge || 8 * 60 * 60 * 1000));
      await supabase.from('sessions').update({ expire: expire.toISOString() }).eq('sid', sid);
      cb(null);
    } catch (e) { cb(e); }
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use(session({
  store: new SupabaseStore(),
  secret: process.env.SESSION_SECRET || 'shams-healthcare-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000, sameSite: 'none', secure: process.env.NODE_ENV === 'production' }
}));

// ── Auth helpers ──────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user)             return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// ── Map appointment rows (Supabase nested → flat) ─────────────────────────────
function mapAppt(a) {
  return {
    id:           a.id,
    patient_id:   a.patient_id,
    doctor_id:    a.doctor_id,
    date:         a.date,
    time:         a.time,
    reason:       a.reason,
    status:       a.status,
    created_at:   a.created_at,
    patient_name: a.patients?.name  || 'Unknown',
    doctor_name:  a.staff?.name     || 'Unknown',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(req.session.user);
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role)
    return res.status(400).json({ error: 'Email, password and role are required.' });

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .eq('role', role)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid email or password.' });

  const redirectMap = { admin: 'admin.html', doctor: 'doctor.html', patient: 'patient.html' };
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ redirect: redirectMap[role], role: user.role, name: user.name });
});

// POST /api/auth/register  (patients AND doctors)
app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, email, phone, dob, gender, password, registerRole, specialty } = req.body;

  if (!firstName || !lastName || !email || !password)
    return res.status(400).json({ error: 'First name, last name, email and password are required.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const role  = registerRole === 'doctor' ? 'doctor' : 'patient';
  const name  = `${firstName.trim()} ${lastName.trim()}`;
  const lmail = email.trim().toLowerCase();

  // Check duplicate
  const { data: existing } = await supabase
    .from('users').select('id').eq('email', lmail).maybeSingle();
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const hash = bcrypt.hashSync(password, 10);

  const { data: newUser, error: uErr } = await supabase
    .from('users')
    .insert({ name, email: lmail, password: hash, role })
    .select()
    .single();
  if (uErr) return res.status(500).json({ error: uErr.message });

  if (role === 'doctor') {
    const { error: sErr } = await supabase.from('staff').insert({
      user_id:    newUser.id,
      name,
      specialty:  specialty?.trim() || null,
      phone:      phone?.trim()     || null,
      email:      lmail,
      duty_status:'On Duty',
      role:       'doctor'
    });
    if (sErr) return res.status(500).json({ error: sErr.message });

    req.session.user = { id: newUser.id, name, email: lmail, role: 'doctor' };
    return res.status(201).json({ redirect: 'doctor.html', role: 'doctor', name });
  } else {
    const { error: pErr } = await supabase.from('patients').insert({
      user_id: newUser.id,
      name,
      gender:  gender  || null,
      phone:   phone?.trim() || null,
      status:  'Active'
    });
    if (pErr) return res.status(500).json({ error: pErr.message });

    req.session.user = { id: newUser.id, name, email: lmail, role: 'patient' };
    return res.status(201).json({ redirect: 'patient.html', role: 'patient', name });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════

// GET /api/dashboard/stats
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const [pRes, tRes, dRes, rRes] = await Promise.all([
      supabase.from('patients').select('*', { count: 'exact', head: true }),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('date', today).eq('status', 'Scheduled'),
      supabase.from('staff').select('*', { count: 'exact', head: true }).eq('duty_status', 'On Duty').eq('role', 'doctor'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'Scheduled'),
    ]);
    res.json({
      totalPatients:  pRes.count ?? 0,
      todayAppts:     tRes.count ?? 0,
      doctorsOnDuty:  dRes.count ?? 0,
      pendingReports: rRes.count ?? 0,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/dashboard/upcoming
app.get('/api/dashboard/upcoming', requireAuth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('appointments')
    .select('time, reason, patients(name), staff(name)')
    .eq('date', today)
    .eq('status', 'Scheduled')
    .order('time')
    .limit(6);
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(a => ({
    time: a.time, reason: a.reason,
    patient_name: a.patients?.name, doctor_name: a.staff?.name
  })));
});

// GET /api/dashboard/recent-patients
app.get('/api/dashboard/recent-patients', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('patients').select('name, age, status')
    .order('created_at', { ascending: false }).limit(5);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ════════════════════════════════════════════════════════════════════════════
// PATIENTS
// ════════════════════════════════════════════════════════════════════════════

// GET /api/patients
app.get('/api/patients', requireAuth, async (req, res) => {
  const { user } = req.session;
  let query = supabase.from('patients').select('*').order('created_at', { ascending: false });
  if (user.role === 'patient') query = query.eq('user_id', user.id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/patients
app.post('/api/patients', requireRole('admin'), async (req, res) => {
  const { firstName, lastName, age, gender, phone, diagnosis, address } = req.body;
  if (!firstName || !lastName)
    return res.status(400).json({ error: 'First name and last name are required.' });

  const { data, error } = await supabase
    .from('patients')
    .insert({ name: `${firstName.trim()} ${lastName.trim()}`, age: age || null, gender: gender || null, phone: phone || null, diagnosis: diagnosis || null, address: address || null, status: 'Active' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ════════════════════════════════════════════════════════════════════════════
// APPOINTMENTS
// ════════════════════════════════════════════════════════════════════════════

// GET /api/appointments
app.get('/api/appointments', requireAuth, async (req, res) => {
  const { user } = req.session;
  let query = supabase
    .from('appointments')
    .select('*, patients(name), staff(name)')
    .order('date', { ascending: false });

  if (user.role === 'patient') {
    // Get patient record for this user
    const { data: pat } = await supabase.from('patients').select('id').eq('user_id', user.id).maybeSingle();
    if (!pat) return res.json([]);
    query = query.eq('patient_id', pat.id);
  } else if (user.role === 'doctor') {
    const { data: staff } = await supabase.from('staff').select('id').eq('user_id', user.id).maybeSingle();
    if (!staff) return res.json([]);
    query = query.eq('doctor_id', staff.id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(mapAppt));
});

// POST /api/appointments
app.post('/api/appointments', requireAuth, async (req, res) => {
  const { patient_id, doctor_id, date, time, reason } = req.body;
  if (!patient_id || !doctor_id || !date || !time || !reason)
    return res.status(400).json({ error: 'All fields are required.' });

  const { data, error } = await supabase
    .from('appointments')
    .insert({ patient_id, doctor_id, date, time, reason, status: 'Pending' })
    .select('*, patients(name), staff(name)')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(mapAppt(data));
});

// PUT /api/appointments/:id
app.put('/api/appointments/:id', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!['Pending','Scheduled','Confirmed','Done','Cancelled'].includes(status))
    return res.status(400).json({ error: 'Invalid status.' });

  const { data, error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'Appointment not found.' });

  // Send confirmation email when doctor accepts (Pending → Confirmed)
  if (status === 'Confirmed') {
    (async () => {
      try {
        const { data: pat } = await supabase.from('patients').select('name, user_id').eq('id', data.patient_id).maybeSingle();
        const { data: stf } = await supabase.from('staff').select('name').eq('id', data.doctor_id).maybeSingle();
        if (pat?.user_id) {
          const { data: usr } = await supabase.from('users').select('email').eq('id', pat.user_id).maybeSingle();
          if (usr?.email) {
            await sendConfirmationEmail({
              to: usr.email, patientName: pat.name,
              doctorName: stf?.name || 'Your Doctor',
              date: data.date, time: data.time, reason: data.reason
            });
            console.log(`[Email] Confirmation sent to ${usr.email}`);
          }
        }
      } catch (e) { console.error('[Email] Failed:', e.message); }
    })();
  }

  res.json({ id: data.id, status: data.status });
});

// ════════════════════════════════════════════════════════════════════════════
// STAFF
// ════════════════════════════════════════════════════════════════════════════

// GET /api/staff/me
app.get('/api/staff/me', requireRole('doctor'), async (req, res) => {
  const { data, error } = await supabase
    .from('staff').select('*').eq('user_id', req.session.user.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'Staff profile not found.' });
  res.json(data);
});

// GET /api/staff
app.get('/api/staff', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('staff').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/staff
app.post('/api/staff', requireRole('admin'), async (req, res) => {
  const { firstName, lastName, specialty, phone, email, duty_status } = req.body;
  if (!firstName || !lastName || !specialty)
    return res.status(400).json({ error: 'Name and specialty are required.' });

  const { data, error } = await supabase
    .from('staff')
    .insert({ name: `${firstName.trim()} ${lastName.trim()}`, specialty, phone: phone || null, email: email || null, duty_status: duty_status || 'On Duty', role: 'doctor' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/staff/:id
app.put('/api/staff/:id', requireRole('admin'), async (req, res) => {
  const { specialty, phone, duty_status } = req.body;
  const updates = {};
  if (specialty   !== undefined) updates.specialty   = specialty;
  if (phone       !== undefined) updates.phone       = phone;
  if (duty_status !== undefined) updates.duty_status = duty_status;

  const { data, error } = await supabase
    .from('staff').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'Staff member not found.' });
  res.json(data);
});

// DELETE /api/staff/:id
app.delete('/api/staff/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabase.from('staff').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🏥 Smart Healthcare → http://localhost:${PORT}`);
    console.log(`   Database: Supabase (${process.env.SUPABASE_URL})\n`);
  });
}

module.exports = app;
