// Run once after creating tables in Supabase: node seed.js
require('dotenv').config();
const bcrypt   = require('bcryptjs');
const supabase = require('./supabase');

async function insert(table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw new Error(`[${table}] ${error.message}`);
  return data;
}

async function seed() {
  console.log('Seeding database…\n');

  // ── 1. Admin ───────────────────────────────────────────────────────────────
  const { data: existingAdmin } = await supabase
    .from('users').select('id').eq('email', 'admin@clinic.ng').maybeSingle();

  if (existingAdmin) {
    console.log('✓ Admin already exists, skipping.');
  } else {
    await insert('users', {
      name: 'Admin User', email: 'admin@clinic.ng',
      password: bcrypt.hashSync('admin123', 10), role: 'admin'
    });
    console.log('✓ Admin created  →  admin@clinic.ng / admin123');
  }

  // ── 2. Doctors ─────────────────────────────────────────────────────────────
  const doctors = [
    { name: 'Dr. Chidi Eze',      email: 'c.eze@clinic.ng',      specialty: 'General Practitioner', phone: '08011111111', duty: 'On Duty'  },
    { name: 'Dr. Adaeze Nwofor',  email: 'a.nwofor@clinic.ng',   specialty: 'Gynecologist',         phone: '08022222222', duty: 'On Duty'  },
    { name: 'Dr. Kabir Ibrahim',  email: 'k.ibrahim@clinic.ng',  specialty: 'Ophthalmologist',      phone: '08033333333', duty: 'On Duty'  },
    { name: 'Dr. Taiwo Adesanya', email: 't.adesanya@clinic.ng', specialty: 'Pediatrician',         phone: '08055555555', duty: 'Off Duty' },
  ];

  const staffIds = {};

  for (const d of doctors) {
    const { data: exUser } = await supabase.from('users').select('id').eq('email', d.email).maybeSingle();

    let userId;
    if (exUser) {
      userId = exUser.id;
      console.log(`  (user ${d.email} exists)`);
    } else {
      const u = await insert('users', {
        name: d.name, email: d.email,
        password: bcrypt.hashSync('doctor123', 10), role: 'doctor'
      });
      userId = u.id;
    }

    const { data: exStaff } = await supabase.from('staff').select('id').eq('user_id', userId).maybeSingle();
    if (exStaff) {
      staffIds[d.name] = exStaff.id;
      console.log(`✓ ${d.name} already exists.`);
    } else {
      const s = await insert('staff', {
        user_id: userId, name: d.name, specialty: d.specialty,
        phone: d.phone, email: d.email, duty_status: d.duty, role: 'doctor'
      });
      staffIds[d.name] = s.id;
      console.log(`✓ ${d.name} created  →  ${d.email} / doctor123`);
    }
  }

  // Extra non-doctor staff
  const extras = [
    { name: 'Nurse Blessing Okonkwo', email: 'b.okonkwo@clinic.ng', specialty: 'Head Nurse', phone: '08044444444', role: 'nurse' },
    { name: 'Pharm. Funke Odeyemi',   email: 'f.odeyemi@clinic.ng', specialty: 'Pharmacist', phone: '08066666666', role: 'pharmacist' },
  ];
  for (const e of extras) {
    const { data: ex } = await supabase.from('staff').select('id').eq('email', e.email).maybeSingle();
    if (!ex) {
      await insert('staff', { name: e.name, email: e.email, specialty: e.specialty, phone: e.phone, duty_status: 'On Duty', role: e.role });
      console.log(`✓ ${e.name} created`);
    } else {
      console.log(`✓ ${e.name} already exists.`);
    }
  }

  // ── 3. Patients ────────────────────────────────────────────────────────────
  const patientDefs = [
    { name: 'Amara Johnson',     email: 'patient@email.com',   phone: '08012345678', age: 34, gender: 'Female', diagnosis: 'Hypertension',  status: 'Active',   pw: 'patient123' },
    { name: 'Chukwuemeka Obi',   email: 'chukwu@email.com',   phone: '08098765432', age: 51, gender: 'Male',   diagnosis: 'Diabetes',      status: 'Active',   pw: 'pass123' },
    { name: 'Fatima Musa',       email: 'fatima@email.com',   phone: '08055544433', age: 28, gender: 'Female', diagnosis: 'Malaria',       status: 'Pending',  pw: 'pass123' },
    { name: 'Emeka Nwosu',       email: 'emeka@email.com',    phone: '08033221100', age: 45, gender: 'Male',   diagnosis: 'Glaucoma',      status: 'Active',   pw: 'pass123' },
    { name: 'Ngozi Uchenna',     email: 'ngozi@email.com',    phone: '08077889900', age: 26, gender: 'Female', diagnosis: 'Prenatal Care', status: 'Inactive', pw: 'pass123' },
    { name: 'Babatunde Adeyemi', email: 'baba@email.com',     phone: '08011223344', age: 60, gender: 'Male',   diagnosis: 'Arthritis',     status: 'Active',   pw: 'pass123' },
  ];

  const patientIds = {};

  for (const p of patientDefs) {
    const { data: exUser } = await supabase.from('users').select('id').eq('email', p.email).maybeSingle();

    let userId;
    if (exUser) {
      userId = exUser.id;
    } else {
      const u = await insert('users', {
        name: p.name, email: p.email,
        password: bcrypt.hashSync(p.pw, 10), role: 'patient'
      });
      userId = u.id;
    }

    const { data: exPat } = await supabase.from('patients').select('id').eq('user_id', userId).maybeSingle();
    if (exPat) {
      patientIds[p.name] = exPat.id;
      console.log(`✓ Patient ${p.name} already exists.`);
    } else {
      const pat = await insert('patients', {
        user_id: userId, name: p.name, age: p.age, gender: p.gender,
        phone: p.phone, diagnosis: p.diagnosis, status: p.status
      });
      patientIds[p.name] = pat.id;
      const note = p.email === 'patient@email.com' ? '  ← default patient login' : '';
      console.log(`✓ Patient ${p.name} created${note}`);
    }
  }

  // ── 4. Appointments ────────────────────────────────────────────────────────
  const { data: existingAppts } = await supabase.from('appointments').select('id').limit(1);
  if (existingAppts && existingAppts.length > 0) {
    console.log('✓ Appointments already exist, skipping.');
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const tom   = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const day3  = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

    const appts = [
      { patient: 'Amara Johnson',     doctor: 'Dr. Chidi Eze',     date: today, time: '09:00 AM', reason: 'General Checkup',   status: 'Scheduled' },
      { patient: 'Chukwuemeka Obi',   doctor: 'Dr. Adaeze Nwofor', date: today, time: '10:30 AM', reason: 'Blood Pressure',    status: 'Scheduled' },
      { patient: 'Fatima Musa',       doctor: 'Dr. Chidi Eze',     date: today, time: '12:00 PM', reason: 'Malaria Follow-up', status: 'Done'      },
      { patient: 'Emeka Nwosu',       doctor: 'Dr. Kabir Ibrahim',  date: tom,   time: '02:15 PM', reason: 'Eye Exam',          status: 'Scheduled' },
      { patient: 'Ngozi Uchenna',     doctor: 'Dr. Adaeze Nwofor', date: tom,   time: '03:30 PM', reason: 'Prenatal Visit',    status: 'Cancelled' },
      { patient: 'Babatunde Adeyemi', doctor: 'Dr. Chidi Eze',     date: day3,  time: '11:00 AM', reason: 'Arthritis Review',  status: 'Scheduled' },
    ];

    for (const a of appts) {
      const pid = patientIds[a.patient];
      const did = staffIds[a.doctor];
      if (!pid || !did) { console.log(`  ⚠ Skipping: missing ID for ${a.patient} / ${a.doctor}`); continue; }
      await supabase.from('appointments').insert({ patient_id: pid, doctor_id: did, date: a.date, time: a.time, reason: a.reason, status: a.status });
    }
    console.log('✓ Sample appointments created');
  }

  console.log('\n✅ Seed complete!\n');
  console.log('  Admin   → admin@clinic.ng    / admin123');
  console.log('  Doctor  → c.eze@clinic.ng    / doctor123  (Dr. Chidi Eze)');
  console.log('  Patient → patient@email.com  / patient123  (Amara Johnson)\n');
  process.exit(0);
}

seed().catch(e => { console.error('\n❌ Seed failed:', e.message); process.exit(1); });
