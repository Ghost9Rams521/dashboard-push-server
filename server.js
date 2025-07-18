const express = require('express');
const bodyParser = require('body-parser');
const webpush = require('web-push');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const subFile = './subscriptions.json';
let subscriptions = [];

// Assure que le fichier existe
if (fs.existsSync(subFile)) {
  try {
    subscriptions = JSON.parse(fs.readFileSync(subFile, 'utf-8'));
  } catch (err) {
    console.error("Erreur lecture subscriptions.json :", err);
    subscriptions = [];
  }
} else {
  fs.writeFileSync(subFile, '[]');
}

// 🔒 Middleware CORS - autorise uniquement ton domaine (à ajuster si besoin)
app.use(cors({
  origin: 'https://dashboard.skinora-market.com',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Middleware JSON
app.use(bodyParser.json());

// Chargement des clés VAPID
const vapidKeys = JSON.parse(fs.readFileSync('./vapid.json', 'utf-8'));
webpush.setVapidDetails(
  'mailto:admin@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Endpoint d'abonnement
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;

  // Évite les doublons
  const isAlreadySubscribed = subscriptions.some(sub => sub.endpoint === subscription.endpoint);
  if (!isAlreadySubscribed) {
    subscriptions.push(subscription);
    fs.writeFileSync(subFile, JSON.stringify(subscriptions, null, 2));
    console.log("✅ Subscription enregistrée :", subscription.endpoint);
  }

  res.status(201).json({ message: 'Subscription added successfully.' });
});

// Endpoint d'envoi de notification
app.post('/api/notify', async (req, res) => {
  const { title, body } = req.body;
  const payload = JSON.stringify({ title, body });
  const results = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      results.push({ success: true });
    } catch (error) {
      console.warn("❌ Échec d'envoi à :", sub.endpoint);
      console.warn(error.message);
      results.push({ success: false, error: error.message });
    }
  }

  res.json({ sent: results.length, details: results });
});

// Ping pour test de vie
app.get('/ping', (req, res) => {
  res.send('OK');
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
