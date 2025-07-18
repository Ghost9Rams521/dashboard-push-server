const express = require('express');
const bodyParser = require('body-parser');
const webpush = require('web-push');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Load VAPID keys
const vapidKeys = JSON.parse(fs.readFileSync('./vapid.json', 'utf-8'));
webpush.setVapidDetails(
  'mailto:admin@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Load subscriptions
let subscriptions = [];
const subFile = './subscriptions.json';
if (fs.existsSync(subFile)) {
  subscriptions = JSON.parse(fs.readFileSync(subFile, 'utf-8'));
}

// Subscribe endpoint
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  subscriptions.push(subscription);
  fs.writeFileSync(subFile, JSON.stringify(subscriptions, null, 2));
  res.status(201).json({ message: 'Subscription added successfully.' });
});

// Notify endpoint
app.post('/api/notify', async (req, res) => {
  const { title, body } = req.body;
  const payload = JSON.stringify({ title, body });
  const results = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      results.push({ success: true });
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  }

  res.json({ sent: results.length, details: results });
});

app.get('/ping', (req, res) => {
  res.send('OK');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
