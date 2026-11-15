// Services/amenities a landlord can tick for an apartment, each with a simple
// line icon (24×24, drawn with stroke="currentColor").
const SERVICES = [
  { key: 'internet', label: 'Wi-Fi internet', icon: '<path d="M2 9a15 15 0 0 1 20 0"/><path d="M5.5 12.5a10 10 0 0 1 13 0"/><path d="M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1"/>' },
  { key: 'starlink', label: 'Starlink internet', icon: '<path d="M4 14a8 8 0 0 0 6 6"/><path d="M5 11l8 8"/><path d="M6.5 9.5 14.5 17.5 18 14 10 6z"/><path d="M15 9l3-3"/><circle cx="19" cy="5" r="1.5"/>' },
  { key: 'power', label: '24/7 electricity', icon: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>' },
  { key: 'solar', label: 'Solar backup', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' },
  { key: 'generator', label: 'Standby generator', icon: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M7 7V5h4v2"/><path d="m13 10-3 4h4l-3 4"/>' },
  { key: 'water', label: '24/7 water', icon: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>' },
  { key: 'borehole', label: 'Borehole', icon: '<path d="M12 2v8"/><path d="M8 6h8"/><path d="M12 12s4 4.2 4 7a4 4 0 0 1-8 0c0-2.8 4-7 4-7z"/>' },
  { key: 'water_tank', label: 'Water tank', icon: '<ellipse cx="12" cy="5" rx="7" ry="2.5"/><path d="M5 5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5"/><path d="M5 11.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>' },
  { key: 'security', label: '24/7 security guard', icon: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>' },
  { key: 'cctv', label: 'CCTV cameras', icon: '<path d="M3 7h13l3 4H3z"/><path d="M8 11v3a2 2 0 0 1-2 2H3"/><path d="M3 13v6"/><path d="m19 9 2-1v6l-2-1"/>' },
  { key: 'fence', label: 'Electric fence', icon: '<path d="M4 21V7l2-3 2 3v14M16 21V7l2-3 2 3v14"/><path d="M8 10h8M8 16h8"/><path d="m13 8-2 3h2l-2 3"/>' },
  { key: 'parking', label: 'Parking', icon: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>' },
  { key: 'furnished', label: 'Furnished', icon: '<path d="M4 18v2M20 18v2"/><path d="M3 11a2 2 0 0 1 4 0v3h10v-3a2 2 0 0 1 4 0v7H3z"/><path d="M6 9V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>' },
  { key: 'aircon', label: 'Air conditioning', icon: '<path d="M12 2v20M4 6l16 12M20 6 4 18"/><path d="m9 3 3 2 3-2M9 21l3-2 3 2"/>' },
  { key: 'kitchen', label: 'Gas cooker / kitchen', icon: '<path d="M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.8 1-3 2-4 .2 1.4 1 2 2 2-1-2 0-4 0-6z"/><path d="M5 22h14"/><path d="M7 18h10"/>' },
  { key: 'laundry', label: 'Laundry area', icon: '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M8 6h.01M11 6h2"/>' },
  { key: 'lounge', label: 'Shared lounge / TV', icon: '<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 22h8M12 18v4"/>' },
  { key: 'garden', label: 'Garden', icon: '<path d="M12 22V12"/><path d="M12 12C12 7 8 4 3 4c0 5 4 8 9 8z"/><path d="M12 14c0-4 3-6 8-6 0 4-3 6-8 6z"/>' },
  { key: 'balcony', label: 'Balcony', icon: '<path d="M3 21h18M4 13h16"/><path d="M6 13v8M10 13v8M14 13v8M18 13v8"/><path d="M7 13V4h10v9"/>' },
  { key: 'cleaning', label: 'Cleaning of surroundings', icon: '<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/><path d="M5 16l.6 1.4L7 18l-1.4.6L5 20l-.6-1.4L3 18l1.4-.6z"/>' },
  { key: 'prepaid_meter', label: 'Prepaid ZESCO meter', icon: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8v4H8z"/><path d="M8 15h2M14 15h2M8 18h2M14 18h2"/>' },
  { key: 'staff_quarters', label: 'Staff quarters', icon: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>' },
];

const BY_KEY = Object.fromEntries(SERVICES.map((s) => [s.key, s]));

/** "power,water,foo" -> [service objects], ignoring unknown keys, in catalogue order. */
function parseServices(value) {
  const keys = new Set(String(value || '').split(',').map((s) => s.trim()).filter(Boolean));
  return SERVICES.filter((s) => keys.has(s.key));
}

/** Form value(s) -> cleaned comma string of known keys. */
function cleanServices(input) {
  const arr = Array.isArray(input) ? input : input ? [input] : [];
  return SERVICES.filter((s) => arr.includes(s.key)).map((s) => s.key).join(',');
}

/** Inline SVG for a service icon. */
function serviceIcon(service, size = 24) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${service.icon}</svg>`;
}

module.exports = { SERVICES, BY_KEY, parseServices, cleanServices, serviceIcon };
