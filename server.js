const express = require('express');
const { getStudentNotes } = require('./index.js');

const app = express();
const port = process.env.PORT || 4000;

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Server is running');
});

app.get('/student/:id', async (req, res) => {
  try {
    const studentId = req.params.id;
    const studentNotes = await getStudentNotes(studentId);
    res.json(studentNotes);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});