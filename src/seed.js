// Resets the database and fills it with demo data.  Run: npm run seed
const fs = require('node:fs');
const path = require('node:path');

const dbFile = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'zambia_apartments.db');
for (const f of [dbFile, dbFile + '-wal', dbFile + '-shm']) fs.rmSync(f, { force: true });

// Photos belong to the database being wiped, so remove uploaded files too (only our random-named images).
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads');
if (fs.existsSync(uploadDir)) {
  for (const name of fs.readdirSync(uploadDir)) {
    if (/^[a-f0-9]{32}\.(jpg|png|webp|pdf)$/.test(name)) fs.rmSync(path.join(uploadDir, name), { force: true });
  }
}

// Saved emails belong to the old data too.
const outboxDir = process.env.OUTBOX_DIR || path.join(__dirname, '..', 'data', 'outbox');
if (fs.existsSync(outboxDir)) {
  for (const name of fs.readdirSync(outboxDir)) if (name.endsWith('.html')) fs.rmSync(path.join(outboxDir, name), { force: true });
}

const bcrypt = require('bcryptjs');
const { run, transaction } = require('./db');
const { currentPeriod } = require('./helpers');
const { DEMO_PHOTOS, demoPhotoFile } = require('./demo-photos');

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

  // ---- Photos -------------------------------------------------------------
  // Demo photos are files in public/demo-photos (see src/demo-photos.js). Two of Mwila's
  // listings (the Rhodes Park studio and the Ibex Hill townhouse) are left without
  // photos on purpose, to show the "add photos" prompts.
  let photoTurn = 0;
  const pick = (list) => list[photoTurn % list.length];
  const addPhotos = (aptId, kind) => {
    const set = [
      [pick(DEMO_PHOTOS[kind]), kind === 'houses' ? 'Front of the house' : 'The building', 'outside'],
      [pick(DEMO_PHOTOS.living), 'Living room', 'living'],
      [pick(DEMO_PHOTOS.bedroom), 'Main bedroom', 'bedroom'],
      [pick(DEMO_PHOTOS.kitchen), 'Kitchen', 'kitchen'],
      [pick(DEMO_PHOTOS.bathroom), 'Bathroom', 'bathroom'],
    ];
    if (photoTurn % 3 === 0) set.push([pick(DEMO_PHOTOS.outdoor), 'Outside seating area', 'yard']);
    set.forEach(([id, caption, room], i) =>
      run('INSERT INTO apartment_photos (apartment_id, filename, caption, sort_order, room) VALUES (?, ?, ?, ?, ?)', aptId, demoPhotoFile(id), caption, i, room)
    );
    photoTurn++;
  };
  addPhotos(a1, 'blocks');
  addPhotos(a4, 'blocks');
  addPhotos(a5, 'blocks');
  addPhotos(a6, 'houses');
  addPhotos(a7, 'houses');
  addPhotos(a8, 'blocks');
  addPhotos(a9, 'houses');
  void a3;

  // ---- Eight more landlords, each with three homes (two rented) -----------
  // A tiny seeded random generator so the demo data is the same on every run.
  let rngState = 20261115;
  const rand = () => ((rngState = (rngState * 1103515245 + 12345) % 2147483648) / 2147483648);
  const choose = (arr) => arr[Math.floor(rand() * arr.length)];

  const prefixes = { mtn: ['096', '076'], airtel: ['097', '077'], zamtel: ['095'] };
  let phoneNo = 700;
  const phoneFor = (network) => `${choose(prefixes[network])} 555 ${String(++phoneNo).padStart(4, '0')}`;

  const LANDLORDS = [
    { name: 'Chipo Sakala', email: 'chipo', city: 'Lusaka', homes: [
      ['Garden 3-bedroom house', 'Woodlands', 3, 2, 11000, 'houses', 'Plot 45, Chindo Road', 'internet,solar,borehole,security,fence,parking,garden,staff_quarters'],
      ['Modern 2-bedroom flat', 'Roma', 2, 2, 8500, 'blocks', 'Roma Park, Zambezi Road', 'internet,solar,water_tank,security,cctv,parking,balcony'],
      ['Bedsitter near UNZA', 'Roma', 1, 1, 3200, 'blocks', null, 'internet,water,security,prepaid_meter'],
    ]},
    { name: 'Mulenga Chileshe', email: 'mulenga', city: 'Kitwe', homes: [
      ['Family house in Nkana East', 'Nkana East', 3, 2, 7000, 'houses', 'Mukuba Road, Nkana East', 'borehole,security,fence,parking,garden,generator'],
      ['Riverside 2-bedroom flat', 'Riverside', 2, 1, 4800, 'blocks', null, 'internet,water_tank,security,parking'],
      ['Townhouse near Copperbelt University', 'Riverside', 2, 2, 5600, 'blocks', 'Jambo Drive, Riverside', 'internet,solar,security,cctv,parking,laundry'],
    ]},
    { name: 'Lweendo Hamoonga', email: 'lweendo', city: 'Livingstone', homes: [
      ['Cottage near Victoria Falls', 'Nottie Broadie', 2, 1, 5200, 'houses', 'Nottie Broadie, off Mosi-oa-Tunya Road', 'aircon,garden,parking,solar,internet'],
      ['3-bedroom house in Libuyu', 'Libuyu', 3, 2, 6800, 'houses', null, 'borehole,security,fence,parking,garden'],
      ['Studio flat in town', 'Dambwa', 1, 1, 2600, 'blocks', null, 'internet,furnished,water,security'],
    ]},
    { name: 'Thandiwe Ngoma', email: 'thandiwe', city: 'Ndola', homes: [
      ['Executive house in Kansenshi', 'Kansenshi', 4, 3, 13500, 'houses', 'Kansenshi, near Ndola Golf Club', 'internet,solar,generator,borehole,security,cctv,fence,parking,garden,staff_quarters'],
      ['2-bedroom flat in Itawa', 'Itawa', 2, 1, 4200, 'blocks', null, 'water_tank,security,parking,prepaid_meter'],
      ['Garden flat in Northrise', 'Northrise', 2, 2, 5900, 'blocks', 'Northrise, Kabompo Road', 'garden,security,borehole,parking,internet'],
    ]},
    { name: 'Kalaba Musonda', email: 'kalaba', city: 'Kabwe', homes: [
      ['3-bedroom house in Highridge', 'Highridge', 3, 2, 5000, 'houses', null, 'borehole,security,fence,parking,garden'],
      ['Flat near Kabwe town centre', 'Bwacha', 2, 1, 3000, 'blocks', null, 'water_tank,prepaid_meter,security'],
      ['Family house in Bwacha', 'Bwacha', 3, 1, 3800, 'houses', 'Bwacha, near Kabwe General Hospital', 'borehole,parking,garden,fence'],
    ]},
    { name: 'Nchimunya Mweemba', email: 'nchimunya', city: 'Lusaka', homes: [
      ['Furnished 2-bedroom in Olympia', 'Olympia', 2, 2, 9800, 'blocks', 'Olympia Park, Mosi-oa-Tunya Road', 'internet,starlink,furnished,solar,security,cctv,parking,aircon'],
      ['Avondale family house', 'Avondale', 4, 2, 9000, 'houses', null, 'borehole,solar,security,fence,parking,garden,staff_quarters'],
      ['Shared student room', 'Kalingalinga', 1, 1, 1800, 'blocks', null, 'internet,water,security,cleaning,lounge'],
    ]},
    { name: 'Mwansa Bwalya', email: 'mwansa', city: 'Chingola', homes: [
      ['Mine-side 3-bedroom house', 'Nchanga North', 3, 2, 6200, 'houses', 'Nchanga North, near the golf course', 'borehole,generator,security,fence,parking,garden'],
      ['Compact 1-bedroom flat', 'Kabundi', 1, 1, 2400, 'blocks', null, 'water_tank,prepaid_meter,security'],
      ['2-bedroom flat with parking', 'Nchanga South', 2, 1, 3900, 'blocks', null, 'parking,security,water_tank,internet'],
    ]},
    { name: 'Sibongile Lungu', email: 'sibongile', city: 'Chipata', homes: [
      ['Hillside 3-bedroom house', 'Hillside', 3, 2, 5500, 'houses', 'Hillside, near Chipata Golf Club', 'borehole,solar,security,fence,parking,garden'],
      ['Moth 2-bedroom house', 'Moth', 2, 1, 3500, 'houses', null, 'borehole,parking,garden,prepaid_meter'],
      ['Town flat near the market', 'Kanjala', 1, 1, 2200, 'blocks', null, 'water_tank,security,prepaid_meter'],
    ]},
  ];

  const TENANTS = [
    ['Chilufya Mumba', 'Nurse, Levy Mwanawasa Hospital'], ['Lubinda Mubita', 'Civil engineer'],
    ['Inonge Sitali', 'Bank teller'], ['Musonda Kangwa', 'Mining technician'],
    ['Twaambo Hamweemba', 'Accountant'], ['Kelvin Banda', 'Police officer'],
    ['Mirriam Phiri', 'Shop owner'], ['Joseph Mwape', 'Lecturer'],
    ['Grace Nyirenda', 'Pharmacist'], ['Emmanuel Zimba', 'Driver'],
    ['Ruth Chisanga', 'Teacher'], ['Brian Simwanza', 'IT support'],
    ['Esther Kabaso', 'Nurse'], ['Moses Tembo', 'Electrician'],
    ['Precious Mwale', 'Student, UNZA'], ['Daniel Siame', 'Agronomist'],
  ];
  const HOUSEHOLDS = [
    [1, 'Just me'], [2, 'My husband'], [2, 'My wife'], [3, 'My wife and our baby'],
    [4, 'My husband and our two children'], [5, 'My wife, our three children'], [2, 'My younger brother'],
    [3, 'My sister and her son'], [6, 'My wife, four children and my mother'], [1, 'Just me, working nights'],
  ];
  const ISSUES = [
    ['problem', 'Plumbing', 'Toilet keeps running', 'The toilet cistern never stops filling.', 'normal'],
    ['problem', 'Power / load-shedding', 'Inverter not charging', 'The backup batteries are not charging when ZESCO power is on.', 'urgent'],
    ['problem', 'Security', 'Gate motor broken', 'The electric gate has to be pushed open by hand.', 'normal'],
    ['problem', 'Water supply', 'Low water pressure', 'Very low pressure in the shower in the mornings.', 'low'],
    ['problem', 'Structure / roof', 'Roof leaking in the rain', 'Water comes through the ceiling in the second bedroom when it rains.', 'urgent'],
    ['problem', 'Pests', 'Termites near the back door', 'There are termite trails on the wooden door frame.', 'normal'],
    ['improvement', 'Security', 'Security light at the gate', 'A motion-sensor light at the gate would help at night.', 'low'],
    ['improvement', 'Other', 'Shade net for the car park', 'The car gets very hot in October; a shade net would help.', 'low'],
    ['improvement', 'Appliances', 'Replace the old geyser', 'The geyser takes very long to heat; a solar geyser would save power.', 'low'],
  ];
  const RESPONSES = ['A technician is coming this week.', 'Fixed on Saturday. Let me know if it happens again.', 'Good idea, I will budget for it next month.'];
  const STARTS = ['2025-11-01', '2026-01-01', '2026-02-15', '2026-04-01', '2026-05-01', '2026-07-01', '2026-08-15'];

  let tenantIdx = 0;
  LANDLORDS.forEach((l, li) => {
    const lid = user(l.name, `${l.email}@landlord.test`, phoneFor(choose(['mtn', 'airtel', 'zamtel'])), 'landlord');
    l.homes.forEach(([title, hood, bed, bath, rent, kind, addr, svcKeys], hi) => {
      const aptId = apt(lid, title, hood, l.city, bed, bath, rent,
        `${title} in ${hood}, ${l.city}. Well kept, secure and close to shops and transport.`, '');
      run('UPDATE apartments SET services = ?, address = ? WHERE id = ?', svcKeys, addr, aptId);
      addPhotos(aptId, kind);
      if (hi === 2) return; // third home stays available

      // Two rented homes per landlord
      const [tname, job] = TENANTS[tenantIdx++];
      const first = tname.split(' ')[0].toLowerCase();
      const network = choose(['mtn', 'airtel', 'zamtel']);
      const phone = phoneFor(network);
      const tid = user(tname, `${first}@tenant.test`, phone, 'tenant', job, `${choose(['Mother', 'Brother', 'Sister', 'Uncle'])} · ${phoneFor('mtn')}`);
      const [occ, note] = choose(HOUSEHOLDS);
      const start = choose(STARTS);
      const tId = tenancy(aptId, tid, start, occ, note);

      // Payment history from the start month to now; ~1 in 4 haven't paid this month yet
      const months = Math.max(1, Math.min(8, Math.round((Date.now() - new Date(start)) / (30 * 864e5))));
      const paidNow = rand() > 0.25;
      for (let m = -months + 1; m <= 0; m++) {
        if (m === 0 && !paidNow) {
          if (rand() > 0.5) pay(tId, aptId, tid, rent, currentPeriod(0), network, phone, 'failed', 1);
          continue;
        }
        pay(tId, aptId, tid, rent, currentPeriod(m), network, phone, 'success', 4 - m * 30 + Math.floor(rand() * 4));
      }

      // 0–2 issues each, in mixed states
      const count = Math.floor(rand() * 3);
      for (let k = 0; k < count; k++) {
        const [kind2, cat, ititle, desc, urg] = choose(ISSUES);
        const status = choose(['open', 'open', 'in_progress', 'resolved']);
        issue(tId, aptId, tid, kind2, cat, ititle, desc, urg, status, status === 'open' ? null : choose(RESPONSES), 1 + Math.floor(rand() * 40));
      }
    });
    void li;
  });
});

// ---------- Listing fees, workers, reviews and notifications ----------
{
  const { all, get } = require('./db');
  const fees = require('./fees');
  const dayOffset = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  transaction(() => {
    // Every demo apartment has its listing fee paid for a while, except one, to show a hidden listing.
    all('SELECT id, rent_amount FROM apartments ORDER BY id').forEach((a, i) => {
      run('UPDATE apartments SET listing_paid_until = ? WHERE id = ?', i === 4 ? dayOffset(-3) : dayOffset(5 + ((i * 7) % 50)), a.id);
    });
    const mwila = get("SELECT id FROM users WHERE email = 'mwila@landlord.test'").id;
    all('SELECT id, rent_amount FROM apartments WHERE landlord_id = ? ORDER BY id', mwila).forEach((a, i) => {
      if (i === 4) return;
      run(`INSERT INTO fee_payments (user_id, kind, target_id, months, amount, method, network, phone, provider, reference, status, paid_until, created_at, paid_at)
           VALUES (?, 'listing', ?, 1, ?, 'mobile_money', 'mtn', '097 555 0101', 'simulator', ?, 'success', ?, ?, ?)`,
        mwila, a.id, fees.listingFee(a.rent_amount), 'ZM-SEEDL' + a.id, get('SELECT listing_paid_until AS u FROM apartments WHERE id = ?', a.id).u, daysAgo(20), daysAgo(20));
    });

    // Workers: [name, email, phone, trade, headline, bio, skills, years, city, areas, rates, listedDays, featuredDays]
    const WORKERS = [
      ['Joseph Mumba', 'joseph', '097 600 1001', 'plumber', 'Qualified plumber: geysers, leaks and borehole pumps', 'Trade-tested plumber (TEVETA Level 3) with 12 years of work across Lusaka. I install and repair geysers, fix leaks and burst pipes, unblock drains and service borehole pumps and pressure tanks.\n\nPast work includes maintenance for two apartment complexes in Kabulonga and Woodlands.', 'Geyser installation, Leak repair, Drain unblocking, Borehole pumps, Pressure tanks', 12, 'Lusaka', 'Kabulonga, Woodlands, Ibex Hill, Rhodes Park', 'Call-out K150, then by the job', 40, 25],
      ['Grace Chileshe', 'grace', '096 600 1002', 'electrician', 'Registered electrician for wiring, DB boards and prepaid meters', 'ERB-registered electrician. Rewiring, fault finding, distribution boards, changeover switches for generators, prepaid ZESCO meter moves and safety certificates for rentals.', 'House wiring, Fault finding, DB boards, Changeover switches, Inspection certificates', 9, 'Lusaka', 'All of Lusaka', 'Fault finding from K200', 55, 0],
      ['Peter Sakala', 'peter', '097 600 1003', 'solar', 'Solar and inverter systems that keep the lights on', 'I design and install solar and inverter backup for homes and flats, from small 1 kVA systems to full off-grid. Battery replacement and servicing too.', 'Inverters, Lithium batteries, Solar panels, Load-shedding backup', 7, 'Lusaka', 'Lusaka and Chongwe', 'Free quote', 30, 0],
      ['Mary Banda', 'mary', '095 600 1004', 'cleaner', 'Move-in and move-out deep cleaning', 'Small cleaning team (3 people) for end-of-tenancy and move-in cleans, carpets, windows and ovens. We bring our own equipment.', 'Deep cleaning, End of tenancy, Carpets, Windows', 5, 'Lusaka', 'Rhodes Park, Chelstone, Chilenje', '2-bedroom deep clean K800', 20, 0],
      ['Chisomo Phiri', 'chisomo', '097 600 1005', 'builder', 'Builder for repairs, extensions and boundary walls', 'Bricklaying, plastering, boundary walls, cracks and small extensions. I can also manage painting and tiling with my team.', 'Bricklaying, Plastering, Boundary walls, Crack repair', 15, 'Kitwe', 'Kitwe and Ndola', 'Priced per job', 45, 0],
      ['Brian Tembo', 'brian', '096 600 1006', 'carpenter', 'Fitted wardrobes, kitchen units and door repairs', 'Carpenter making built-in wardrobes and kitchen cupboards to measure. Door and window frame repairs, locks fitted.', 'Wardrobes, Kitchen units, Doors, Ceilings', 10, 'Livingstone', 'Livingstone', 'Free measuring', 15, 0],
      ['Esther Lungu', 'esther', '097 600 1007', 'pest', 'Termites, cockroaches and rodents gone for good', 'Licensed pest control for flats and houses. Termite treatment before building, fumigation and follow-up visits.', 'Termites, Fumigation, Rodents, Bed bugs', 6, 'Ndola', 'Ndola and Kitwe', 'Fumigation from K450', 25, 0],
      ['Davies Mwanza', 'davies', '097 600 1008', 'painter', 'Interior and exterior painting', 'Painter with a team of four. Interior repaints between tenants, exterior walls and roofs.', 'Interior painting, Exterior painting, Roof painting', 8, 'Lusaka', 'Lusaka', 'From K25 per square metre', -5, 0], // listing expired: hidden
    ];
    const workerIds = {};
    WORKERS.forEach(([name, key, phone, trade, headline, bio, skills, years, city, areas, rates, listedDays, featDays]) => {
      const uid = user(name, key + '@worker.test', phone, 'worker');
      workerIds[key] = Number(run(
        `INSERT INTO workers (user_id, trade, headline, bio, skills, experience_years, city, areas, rates, subscription_until, featured_until, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        uid, trade, headline, bio, skills, years, city, areas, rates, dayOffset(listedDays), featDays ? dayOffset(featDays) : null, daysAgo(60)
      ).lastInsertRowid);
      run(`INSERT INTO fee_payments (user_id, kind, target_id, months, amount, method, bank, account_name, provider, reference, status, paid_until, created_at, paid_at)
           VALUES (?, 'worker', ?, 1, ?, 'bank', 'zanaco', ?, 'simulator', ?, 'success', ?, ?, ?)`,
        uid, workerIds[key], fees.WORKER_MONTHLY, name, 'ZM-SEEDW' + workerIds[key], dayOffset(listedDays), daysAgo(25), daysAgo(25));
    });

    // Reviews from landlords and tenants: [worker, reviewer email, stars, comment, days ago]
    const REVIEWS = [
      ['joseph', 'mwila@landlord.test', 5, 'Replaced the geyser in Kabulonga the same day. Clean work and fair price.', 30],
      ['joseph', 'natasha@tenant.test', 5, 'Fixed a leaking pipe under the sink quickly and explained what was wrong.', 18],
      ['joseph', 'chanda@landlord.test', 4, 'Good work on the borehole pump, came a day later than promised.', 9],
      ['grace', 'mwila@landlord.test', 5, 'Found a fault two other electricians missed. Very professional.', 40],
      ['grace', 'mutale@tenant.test', 5, 'Moved our prepaid meter and fitted extra sockets. Neat and safe.', 22],
      ['grace', 'bupe@tenant.test', 4, 'Good job, polite and on time.', 6],
      ['peter', 'chanda@landlord.test', 4, 'Inverter works well through load-shedding.', 12],
      ['mary', 'natasha@tenant.test', 5, 'The flat was spotless for move-in.', 3],
      ['chisomo', 'chanda@landlord.test', 3, 'Wall is solid but the job ran over by a week.', 15],
    ];
    REVIEWS.forEach(([w, email, rating, comment, ago]) => {
      const reviewer = get('SELECT id FROM users WHERE email = ?', email);
      if (reviewer) run('INSERT INTO worker_reviews (worker_id, reviewer_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)', workerIds[w], reviewer.id, rating, comment, daysAgo(ago));
    });

    // A few unread notifications so the bell has something to show.
    const note = (email, kind, text, link, ago) => {
      const u = get('SELECT id FROM users WHERE email = ?', email);
      run('INSERT INTO notifications (user_id, kind, text, link, created_at) VALUES (?, ?, ?, ?, ?)', u.id, kind, text, link, daysAgo(ago));
    };
    note('mwila@landlord.test', 'listing_hidden', 'Self-contained single room is hidden from the site: its listing fee is due.', '/landlord/apartments/5?tab=listing', 3);
    note('mwila@landlord.test', 'payment_received', 'Rent received: K 9,500.00 from Natasha Phiri', '/landlord/payments', 1);
    note('natasha@tenant.test', 'issue_updated', 'Your landlord replied about your report.', '/tenant?tab=issues', 2);
    note('joseph@worker.test', 'worker_reviewed', 'New 4-star review from Chanda Mulenga', '/workers/' + workerIds.joseph, 9);
  });
}

console.log('Database seeded with demo data.');
console.log('Demo logins are listed in README.md.');
