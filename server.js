const express = require('express');
const { getStudentNotes } = require('./index.js');

const app = express();
const port = 3000; // You can change this port if needed

app.get('/student/:id', async (req, res) => {
  try {
    const studentId = req.params.id;
    const studentNotes = await getStudentNotes(studentId);
    res.json(studentNotes);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});