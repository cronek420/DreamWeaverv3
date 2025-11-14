const express = require('express');
const path = require('path');
const app = express();

const port = process.env.PORT || 8080;

// Serve static files from the project's root directory
app.use(express.static(__dirname));

// For any request that doesn't match a static file, serve index.html.
// This is crucial for single-page applications.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`DreamWeaver app listening on port ${port}`);
});
