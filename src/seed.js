// Resets the database and fills it with demo data.  Run: npm run seed
const fs = require('node:fs');
const path = require('node:path');

const dbFile = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'zambia_apartments.db');
for (const f of [dbFile, dbFile + '-wal', dbFile + '-shm']) fs.rmSync(f, { force: true });

// Photos belong to the database being wiped, so remove uploaded files too (only our random-named images).
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads');
if (fs.existsSync(uploadDir)) {
  for (const name of fs.readdirSync(uploadDir)) {
    if (/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) fs.rmSync(path.join(uploadDir, name), { force: true });
  }
}

const bcrypt = require('bcryptjs');
const { run, transaction } = require('./db');
const { currentPeriod } = require('./helpers');

// Demo accounts all share this password (see README).
const DEMO_PASSWORD = 'demo1234';
const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);

const user = (name, email, phone, role, occupation = null, emergency = null) =>
  Number(
    run('INSERT INTO users (name, email, phone, password_hash, role, occupation, emergency_contact) VALUES (?, ?, ?, ?, ?, ?, ?)',
      name, email, phone, hash, role, occupation, emergency).lastInsertRowid
  );

const apt = (landlord, title, hood, city, bed, bath, rent, desc, amenities) =>
  Number(
    run(`INSERT INTO apartments (landlord_id, title, neighbourhood, city, bedrooms, bathrooms, rent_amount, description, amenities)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, landlord, title, hood, city, bed, bath, rent, desc, amenities).lastInsertRowid
  );

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 19).replace('T', ' ');

transaction(() => {
  const mwila = user('Mwila Banda', 'mwila@landlord.test', '097 555 0101', 'landlord');
  const chanda = user('Chanda Mulenga', 'chanda@landlord.test', '096 555 0202', 'landlord');

  const natasha = user('Natasha Phiri', 'natasha@tenant.test', '097 555 0303', 'tenant', 'Nurse, UTH', 'Joseph Phiri · 096 555 0909');
  const mutale = user('Mutale Zulu', 'mutale@tenant.test', '096 555 0404', 'tenant', 'Software developer', 'Bwalya Zulu · 097 555 0808');
  const bupe = user('Bupe Tembo', 'bupe@tenant.test', '095 555 0505', 'tenant', 'Teacher');
  const kondwani = user('Kondwani Mwale', 'kondwani@tenant.test', '077 555 0606', 'tenant', 'Accountant'); // not linked yet

  // Mwila's apartments (Lusaka)
  const a1 = apt(mwila, 'Modern 2-bedroom with balcony', 'Kabulonga', 'Lusaka', 2, 2, 9500,
    'Bright, fully tiled flat on the first floor of a quiet walled complex. Open-plan kitchen and lounge, a balcony over the garden, and built-in wardrobes in both bedrooms.',
    'Solar backup, Borehole, Electric fence, Guard, Parking, Prepaid ZESCO meter');
  const a2 = apt(mwila, 'Cosy studio near Levy Junction', 'Rhodes Park', 'Lusaka', 1, 1, 4500,
    'Compact furnished studio a short walk from Levy Junction mall. Ideal for a young professional. Kitchenette, queen bed and fibre Wi-Fi.',
    'Furnished, Wi-Fi, Water tank, Inverter backup');
  const a3 = apt(mwila, 'Executive 3-bedroom townhouse', 'Ibex Hill', 'Lusaka', 3, 3, 22000,
    'Spacious townhouse with a private garden, staff quarters and a full solar system for load-shedding. Close to international schools and embassies.',
    'Full solar system, Staff quarters, Garden, Electric fence, Double garage');
  const a4 = apt(mwila, 'Family 3-bedroom flat', 'Chelstone', 'Lusaka', 3, 2, 6500,
    'Ground-floor flat in a family-friendly area near Chelstone shopping centre. Large kitchen, a store room and secure parking.',
    'Borehole, Parking, Store room, Wall fence');
  const a5 = apt(mwila, 'Self-contained single room', 'Chilenje', 'Lusaka', 1, 1, 2000,
    'Affordable self-contained room with its own kitchenette and bathroom, close to Chilenje market and the minibus stop.',
    'Prepaid meter, Tiled floor, Water tank');

  // Chanda's apartments (Copperbelt / Livingstone)
  const a6 = apt(chanda, 'Garden flat in Parklands', 'Parklands', 'Kitwe', 2, 1, 5500,
    'Peaceful two-bedroom flat with a shared garden in one of Kitwe’s quietest suburbs, near Freedom Park mall.',
    'Garden, Guard, Borehole, Inverter backup');
  const a7 = apt(chanda, 'Garden cottage near Mosi-oa-Tunya', 'Dambwa', 'Livingstone', 2, 2, 6000,
    'Quiet two-bedroom cottage with a veranda and mango trees, 15 minutes from Victoria Falls.',
    'Veranda, Air conditioning, Parking, Solar geyser');
  const a8 = apt(chanda, 'Student-friendly single room', 'Riverside', 'Kitwe', 1, 1, 1500,
    'Single room with a private bathroom, a short walk from Copperbelt University. Water and refuse collection included.',
    'Near CBU, Water included, Study desk');
  const a9 = apt(chanda, '4-bedroom house with staff quarters', 'Northrise', 'Ndola', 4, 4, 15000,
    'Detached four-bedroom house with staff quarters, a large yard and a standby generator.',
    'Generator, Staff quarters, Large yard, Electric fence');

  // Services (icons on the listing) and any other features (free text)
  const services = (aptId, keys, extras = '') => run('UPDATE apartments SET services = ?, amenities = ? WHERE id = ?', keys, extras, aptId);
  services(a1, 'internet,solar,borehole,security,fence,parking,prepaid_meter,balcony', 'Built-in wardrobes');
  services(a2, 'internet,furnished,water_tank,solar,security', 'Walk to Levy Junction mall');
  services(a3, 'internet,solar,power,borehole,security,cctv,fence,parking,garden,staff_quarters,kitchen,laundry', 'Double garage, Near international schools');
  services(a4, 'borehole,parking,fence,water_tank,prepaid_meter', 'Store room');
  services(a5, 'prepaid_meter,water_tank,security', 'Near Chilenje market');
  services(a6, 'garden,security,borehole,solar,parking', 'Near Freedom Park mall');
  services(a7, 'aircon,parking,solar,garden,internet', 'Veranda, Mango trees, 15 min to Victoria Falls');
  services(a8, 'internet,water,security,cleaning,lounge', 'Near CBU, Study desk');
  services(a9, 'generator,staff_quarters,fence,security,cctv,parking,garden,borehole', 'Large yard');

  // Private street addresses (landlord-only, used for the map)
  const address = (aptId, text) => run('UPDATE apartments SET address = ? WHERE id = ?', text, aptId);
  address(a1, 'Lukasu Road, Kabulonga');
  address(a4, 'Kamloops Road, Chelstone');
  address(a6, 'Parklands, near Freedom Park Mall');

  // Active tenancies
  const tenancy = (aptId, tenantId, start, occupants = null, note = null) => {
    run("UPDATE apartments SET status = 'occupied' WHERE id = ?", aptId);
    return Number(
      run('INSERT INTO tenancies (apartment_id, tenant_id, start_date, occupants, household_note) VALUES (?, ?, ?, ?, ?)',
        aptId, tenantId, start, occupants, note).lastInsertRowid
    );
  };
  const t1 = tenancy(a1, natasha, '2026-03-01', 2, 'My younger sister, who is studying at UNZA');
  const t2 = tenancy(a4, mutale, '2026-06-01', 5, 'My wife, our two children (ages 3 and 6) and my mother');
  const t3 = tenancy(a6, bupe, '2026-01-15'); // household not given yet, to show the reminder

  // Payments
  let n = 0;
  const pay = (t, aptId, tenantId, amount, period, network, phone, status, ago) =>
    run(`INSERT INTO payments (tenancy_id, apartment_id, tenant_id, amount, period, network, phone, provider, reference, status, created_at, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'simulator', ?, ?, ?, ?)`,
      t, aptId, tenantId, amount, period, network, phone, `ZM-DEMO-${String(++n).padStart(4, '0')}`, status, daysAgo(ago), status === 'success' ? daysAgo(ago) : null);

  for (let m = -4; m <= 0; m++) pay(t1, a1, natasha, 9500, currentPeriod(m), 'airtel', '097 555 0303', 'success', 3 - m * 30);
  for (let m = -3; m <= -1; m++) pay(t2, a4, mutale, 6500, currentPeriod(m), 'mtn', '096 555 0404', 'success', 5 - m * 30);
  pay(t2, a4, mutale, 6500, currentPeriod(0), 'mtn', '096 555 0404', 'failed', 2);
  for (let m = -5; m <= 0; m++) pay(t3, a6, bupe, 5500, currentPeriod(m), 'zamtel', '095 555 0505', 'success', 8 - m * 30);

  // Issues
  const issue = (t, aptId, tenantId, kind, category, title, desc, urgency, status, response, ago) =>
    run(`INSERT INTO issues (tenancy_id, apartment_id, tenant_id, kind, category, title, description, urgency, status, landlord_response, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t, aptId, tenantId, kind, category, title, desc, urgency, status, response, daysAgo(ago), daysAgo(ago));

  issue(t1, a1, natasha, 'problem', 'Plumbing', 'Kitchen tap is leaking', 'The kitchen tap drips all the time, even when fully closed. There is water collecting under the sink.', 'normal', 'in_progress', 'Plumber is booked for Thursday morning.', 4);
  issue(t1, a1, natasha, 'improvement', 'Power / load-shedding', 'Add a bigger inverter battery', 'During load-shedding the backup only lasts about 3 hours. A second battery would cover the evening.', 'low', 'open', null, 2);
  issue(t1, a1, natasha, 'problem', 'Electrical', 'Bedroom socket not working', null, 'normal', 'resolved', 'Electrician replaced the socket on Monday.', 40);
  issue(t2, a4, mutale, 'problem', 'Water supply', 'No water from the borehole since yesterday', 'The pump makes a noise but no water comes out. We have been buying water.', 'urgent', 'open', null, 1);
  issue(t3, a6, bupe, 'improvement', 'Other', 'Mosquito nets for the windows', 'Would it be possible to fit mosquito netting to the bedroom windows before the rainy season?', 'low', 'open', null, 6);

  // A pending application and an unused invite
  run('INSERT INTO applications (apartment_id, tenant_id, message, occupants, household_note, created_at) VALUES (?, ?, ?, ?, ?, ?)', a2, kondwani,
    'Hello, I have just started a new job in town and would like to move in at the start of next month. I am quiet and tidy.',
    1, 'Just me', daysAgo(1));
  run("INSERT INTO invites (code, apartment_id, landlord_id, tenant_name) VALUES ('LSK1-2026', ?, ?, 'New tenant')", a2, mwila);
  void a3; void a5; void a7; void a8; void a9;
});

console.log('Database seeded with demo data.');
console.log('Demo logins are listed in README.md.');
