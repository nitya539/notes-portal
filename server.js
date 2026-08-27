const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Setup folders ----------
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ---------- Database (simple JSON file) ----------
const dbFile = path.join(__dirname, 'db.json');
const adapter = new FileSync(dbFile);
const db = low(adapter);
db.defaults({ notes: [] }).write();

// ---------- View engine ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- Middleware ----------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));
app.use(express.urlencoded({ extended: true }));

// ---------- File upload config ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|doc|docx|ppt|pptx|txt|jpg|jpeg|png/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    if (ext) cb(null, true);
    else cb(new Error('Only PDF, Word, PPT, TXT, and image files are allowed'));
  }
});

// ---------- Routes ----------

// Home: list all notes, with optional subject filter/search
app.get('/', (req, res) => {
  const search = (req.query.search || '').toLowerCase();
  let notes = db.get('notes').value();

  if (search) {
    notes = notes.filter(n =>
      n.title.toLowerCase().includes(search) ||
      n.subject.toLowerCase().includes(search)
    );
  }

  notes = notes.slice().sort((a, b) => b.uploadedAt - a.uploadedAt);
  res.render('index', { notes, search: req.query.search || '' });
});

// Upload form page
app.get('/upload', (req, res) => {
  res.render('upload', { error: null });
});

// Handle upload
app.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.render('upload', { error: err.message });
    }
    if (!req.file) {
      return res.render('upload', { error: 'Please choose a file to upload.' });
    }

    const { title, subject, uploader } = req.body;
    if (!title || !subject) {
      fs.unlinkSync(req.file.path);
      return res.render('upload', { error: 'Title and Subject are required.' });
    }

    db.get('notes')
      .push({
        id: Date.now().toString(),
        title,
        subject,
        uploader: uploader || 'Anonymous',
        filename: req.file.filename,
        originalName: req.file.originalname,
        uploadedAt: Date.now()
      })
      .write();

    res.redirect('/');
  });
});

// Delete a note (simple, no auth — fine for a college class project)
app.post('/delete/:id', (req, res) => {
  const note = db.get('notes').find({ id: req.params.id }).value();
  if (note) {
    const filePath = path.join(uploadsDir, note.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.get('notes').remove({ id: req.params.id }).write();
  }
  res.redirect('/');
});

// Health check (useful for Render)
app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
