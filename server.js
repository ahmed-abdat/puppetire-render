const express = require('express');
const NodeCache = require('node-cache');
const { getStudentNotes } = require('./index.js');

const app = express();
const port = process.env.PORT || 4000;

// Initialize cache with a standard TTL of 1 week (in seconds)
const cache = new NodeCache({ stdTTL: 7 * 24 * 60 * 60 });

// Middleware to check cache
const checkCache = (req, res, next) => {
  const studentId = req.params.id;
  const cachedData = cache.get(studentId);
  if (cachedData) {
    return res.json(cachedData);
  }
  next();
};

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Server is running');
});

app.get('/student/:id', checkCache, async (req, res) => {
  try {
    const studentId = req.params.id;
    console.time(`Processing student ${studentId}`);
    const studentNotes = await getStudentNotes(studentId);
    console.timeEnd(`Processing student ${studentId}`);

    if (studentNotes) {
      // Cache the result
      cache.set(studentId, studentNotes);
    }

    res.json(studentNotes || { error: 'Student not found' });
  } catch (error) {
    console.error(`Error processing student ${req.params.id}:`, error);
    res.status(500).json({ error: 'An error occurred while processing the request' });
  }
});

// Cache stats endpoint
app.get('/cache-stats', (req, res) => {
  res.json(cache.getStats());
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});