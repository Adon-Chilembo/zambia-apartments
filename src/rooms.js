// The sections landlords upload photos into, in the order tenants see them.
const ROOMS = [
  { key: 'outside', example: 'e.g. Front gate', label: 'Outside & entrance', hint: 'The front of the building or house, the gate and the way in. This is usually the best cover photo.' },
  { key: 'living', example: 'e.g. Sitting room with dining area', label: 'Living room', hint: 'The sitting room and any dining area. Take it from a corner so the whole room shows.' },
  { key: 'kitchen', example: 'e.g. Fitted kitchen', label: 'Kitchen', hint: 'Counters, cupboards, the sink and the stove.' },
  { key: 'bedroom', example: 'e.g. Main bedroom with wardrobe', label: 'Bedrooms', hint: 'One or two photos of each bedroom, including any built-in wardrobes.' },
  { key: 'bathroom', example: 'e.g. En-suite shower', label: 'Bathrooms', hint: 'The shower or bath, the toilet and the basin.' },
  { key: 'yard', example: 'e.g. Parking for two cars', label: 'Yard, parking & extras', hint: 'Garden, parking, laundry area, solar panels, borehole, water tank, the view.' },
];

// Photos without a section (uploaded before sections existed) go here until the landlord moves them.
const OTHER = { key: 'other', label: 'Other photos', hint: 'These photos are not in a section yet. Choose a room for each one so tenants can find them.' };

const BY_KEY = Object.fromEntries([...ROOMS, OTHER].map((r) => [r.key, r]));

/** The section for a stored room value (unknown or empty values count as "other"). */
const roomOf = (key) => BY_KEY[key] || OTHER;

/** True if the value is one of the sections a landlord can pick. */
const isRoom = (key) => ROOMS.some((r) => r.key === key);

/** Split photos (already in display order) into sections. Every room is listed; "other" only when it has photos. */
function groupByRoom(photos) {
  const groups = ROOMS.map((room) => ({ room, photos: photos.filter((p) => p.room === room.key) }));
  const rest = photos.filter((p) => !isRoom(p.room));
  if (rest.length) groups.push({ room: OTHER, photos: rest });
  return groups;
}

/** Best guess at a section from a caption, for photos uploaded before sections existed. */
function guessRoom(caption) {
  const c = String(caption || '').toLowerCase();
  if (/bed ?room|wardrobe/.test(c)) return 'bedroom';
  if (/bath|toilet|shower|basin/.test(c)) return 'bathroom';
  if (/kitchen|stove|pantry/.test(c)) return 'kitchen';
  if (/living|lounge|sitting|dining/.test(c)) return 'living';
  if (/garden|yard|parking|garage|seating|pool|view|balcony|veranda|solar|borehole|tank|laundry/.test(c)) return 'yard';
  if (/front|building|entrance|gate|outside|exterior|house|street/.test(c)) return 'outside';
  return null;
}

module.exports = { ROOMS, OTHER, roomOf, isRoom, groupByRoom, guessRoom };
