const express = require('express');
const NodeCache = require('node-cache');
const { getStudentNotes } = require('./index.js');

const app = express();
const port = process.env.PORT || 4000;
const cache = new NodeCache({ stdTTL: 7 * 24 * 60 * 60 });

const checkCache = (req, res, next) => {
  const cachedData = cache.get(req.params.id);
  return cachedData ? res.json(cachedData) : next();
};

app.get('/', (_, res) => res.send('Server is running'));

app.get('/student/:id', checkCache, async (req, res) => {
  try {
    const { id } = req.params;
    console.time(`Processing student ${id}`);
    const studentNotes = await getStudentNotes(id);
    console.timeEnd(`Processing student ${id}`);

    if (studentNotes) {
      cache.set(id, studentNotes);
    }

    res.json(studentNotes || { error: 'Student not found' });
  } catch (error) {
    console.error(`Error processing student ${req.params.id}:`, error);
    res.status(500).json({ error: 'An error occurred while processing the request' });
  }
});

app.get('/cache-stats', (_, res) => res.json(cache.getStats()));

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));