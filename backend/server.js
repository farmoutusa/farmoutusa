const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.use('/api/check', require('./routes/check'));

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() }),
);

// Serve built frontend in production (single-service deploy option)
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`\nCallback Window Checker backend → http://localhost:${PORT}`);
  console.log('\nSample numbers to test:');
  console.log('  +1 415 555 2671   US · California');
  console.log('  +1 212 555 1234   US · New York');
  console.log('  +44 20 7946 0958  UK · London');
  console.log('  +63 2 8123 4567   Philippines · Manila');
  console.log('  +61 2 9374 4000   Australia · Sydney');
  console.log('  +81 3 1234 5678   Japan · Tokyo\n');
});
