// Apartment photo uploads: stored in data/uploads with random names, served at /uploads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_FILE_MB = 8;
const MAX_FILES_PER_UPLOAD = 12;
const MAX_PHOTOS_PER_APARTMENT = 30;

const TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + TYPES[file.mimetype]),
  }),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_FILES_PER_UPLOAD },
  fileFilter: (req, file, cb) => cb(null, Boolean(TYPES[file.mimetype])),
});

/** Check the file's first bytes really are a JPEG, PNG or WebP (the browser-sent type can lie). */
function isRealImage(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const b = Buffer.alloc(12);
  fs.readSync(fd, b, 0, 12, 0);
  fs.closeSync(fd);
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';
  return jpeg || png || webp;
}

function removeFile(filename) {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(filename)) return; // only ever delete our own files
  fs.rm(path.join(UPLOAD_DIR, filename), { force: true }, () => {});
}

module.exports = { UPLOAD_DIR, upload, isRealImage, removeFile, MAX_FILE_MB, MAX_FILES_PER_UPLOAD, MAX_PHOTOS_PER_APARTMENT };
