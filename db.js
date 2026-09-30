const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const db = new Database(path.join(__dirname, 'health.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    email      TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    role       TEXT    NOT NULL CHECK(role IN ('admin','doctor','patient')),
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS staff (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name        TEXT    NOT NULL,
    specialty   TEXT,
    phone       TEXT,
    email       TEXT,
    duty_status TEXT    NOT NULL DEFAULT 'On Duty' CHECK(duty_status IN ('On Duty','Off Duty')),
    role        TEXT    NOT NULL DEFAULT 'doctor',
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS patients (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name       TEXT    NOT NULL,
    age        INTEGER,
    gender     TEXT,
    phone      TEXT,
    diagnosis  TEXT,
    address    TEXT,
    status     TEXT    NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive','Pending')),
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id    INTEGER NOT NULL REFERENCES staff(id)    ON DELETE CASCADE,
    date         TEXT    NOT NULL,
    time         TEXT    NOT NULL,
    reason       TEXT,
    status       TEXT    NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Done','Cancelled')),
    created_at   TEXT    DEFAULT (datetime('now'))
  );
`);

// ── Seed ─────────────────────────────────────────────────────────────────────
function seed() {
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  if (count > 0) return; // already seeded

  const hash = (pw) => bcrypt.hashSync(pw, 10);

  // Users
  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)'
  );

  const adminId   = insertUser.run('Admin User',       'admin@clinic.ng',    hash('admin123'),   'admin').lastInsertRowid;
  const doctorId1 = insertUser.run('Dr. Chidi Eze',    'doctor@clinic.ng',   hash('doctor123'),  'doctor').lastInsertRowid;
  const doctorId2 = insertUser.run('Dr. Adaeze Nwofor','adaeze@clinic.ng',   hash('doc456'),     'doctor').lastInsertRowid;
  const doctorId3 = insertUser.run('Dr. Kabir Ibrahim','kabir@clinic.ng',    hash('doc789'),     'doctor').lastInsertRowid;
  const doctorId4 = insertUser.run('Dr. Taiwo Adesanya','taiwo@clinic.ng',   hash('doc000'),     'doctor').lastInsertRowid;
  const patientId = insertUser.run('Amara Johnson',    'patient@email.com',  hash('patient123'), 'patient').lastInsertRowid;

  // Staff
  const insertStaff = db.prepare(
    'INSERT INTO staff (user_id, name, specialty, phone, email, duty_status, role) VALUES (?,?,?,?,?,?,?)'
  );

  const s1 = insertStaff.run(doctorId1, 'Dr. Chidi Eze',      'General Practitioner', '08011111111', 'c.eze@clinic.ng',       'On Duty',  'doctor').lastInsertRowid;
  const s2 = insertStaff.run(doctorId2, 'Dr. Adaeze Nwofor',  'Gynecologist',         '08022222222', 'a.nwofor@clinic.ng',    'On Duty',  'doctor').lastInsertRowid;
  const s3 = insertStaff.run(doctorId3, 'Dr. Kabir Ibrahim',  'Ophthalmologist',      '08033333333', 'k.ibrahim@clinic.ng',   'On Duty',  'doctor').lastInsertRowid;
  const s4 = insertStaff.run(doctorId4, 'Dr. Taiwo Adesanya', 'Pediatrician',         '08055555555', 't.adesanya@clinic.ng',  'Off Duty', 'doctor').lastInsertRowid;
  insertStaff.run(null,      'Nurse Blessing Okonkwo', 'Head Nurse',    '08044444444', 'b.okonkwo@clinic.ng',   'On Duty',  'nurse');
  insertStaff.run(null,      'Pharm. Funke Odeyemi',   'Pharmacist',    '08066666666', 'f.odeyemi@clinic.ng',   'On Duty',  'pharmacist');

  // Patients
  const insertPatient = db.prepare(
    'INSERT INTO patients (user_id, name, age, gender, phone, diagnosis, status) VALUES (?,?,?,?,?,?,?)'
  );

  const p1 = insertPatient.run(patientId, 'Amara Johnson',       34, 'Female', '08012345678', 'Hypertension',  'Active').lastInsertRowid;
  const p2 = insertPatient.run(null,      'Chukwuemeka Obi',     51, 'Male',   '08098765432', 'Diabetes',      'Active').lastInsertRowid;
  const p3 = insertPatient.run(null,      'Fatima Musa',         28, 'Female', '08055544433', 'Malaria',       'Pending').lastInsertRowid;
  const p4 = insertPatient.run(null,      'Emeka Nwosu',         45, 'Male',   '08033221100', 'Glaucoma',      'Active').lastInsertRowid;
  const p5 = insertPatient.run(null,      'Ngozi Uchenna',       26, 'Female', '08077889900', 'Prenatal Care', 'Inactive').lastInsertRowid;
  const p6 = insertPatient.run(null,      'Babatunde Adeyemi',   60, 'Male',   '08011223344', 'Arthritis',     'Active').lastInsertRowid;

  // Appointments
  const today = new Date().toISOString().slice(0, 10);
  const tom   = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const day3  = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

  const insertAppt = db.prepare(
    'INSERT INTO appointments (patient_id, doctor_id, date, time, reason, status) VALUES (?,?,?,?,?,?)'
  );

  insertAppt.run(p1, s1, today, '09:00 AM', 'General Checkup',  'Scheduled');
  insertAppt.run(p2, s2, today, '10:30 AM', 'Blood Pressure',   'Scheduled');
  insertAppt.run(p3, s1, today, '12:00 PM', 'Malaria Follow-up','Done');
  insertAppt.run(p4, s3, tom,   '02:15 PM', 'Eye Exam',         'Scheduled');
  insertAppt.run(p5, s2, tom,   '03:30 PM', 'Prenatal Visit',   'Cancelled');
  insertAppt.run(p6, s1, day3,  '11:00 AM', 'Arthritis Review', 'Scheduled');
}

seed();

module.exports = db;
