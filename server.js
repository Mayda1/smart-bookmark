import app from './api/index.js';

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Backend API Server running on http://localhost:${PORT}`);
});
