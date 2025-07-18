const express = require('express');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;
const subFile = path.join(__dirname, 'subscriptions.json');

// --- UTILITAIRES & MIDDLEWARES ---
// Logger HTTP
app.use(morgan('dev'));
// CORS, gère preflight aussi
const corsOptions = {
  origin: 'https://dashboard.skinora-market.com',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
// Corps JSON
app.use(express.json());

// --- GESTION DES SUBSCRIPTIONS ---
let subscriptions = [];
// Charge (ou crée) le fichier JSON des subs
if (fs.existsSync(subFile)) {
  try {
    subscriptions = JSON.parse(fs.readFileSync(subFile, 'utf-8'));
  } catch (err) {
    console.error('❌ Erreur lecture subscriptions.json :', err);
    subscriptions = [];
  }
} else {
  fs.writeFileSync(subFile, '[]');
}

// --- CLÉS VAPID ---
const vapidPath = path.join(__dirname, 'vapid.json');
if (!fs.existsSync(vapidPath)) {
  console.error('❌ Le fichier vapid.json est introuvable');
  process.exit(1);
}
const { publicKey, privateKey } = JSON.parse(fs.readFileSync(vapidPath, 'utf-8'));
webpush.setVapidDetails(
  'mailto:admin@example.com',
  publicKey,
  privateKey
);

// Récupère la clé publique pour le client
app.get('/api/vapidPublicKey', (req, res) => {
  res.json({ publicKey });
});

// --- ROUTES ---
// Test de vie
app.get('/ping', (req, res) => res.send('OK'));

// Abonnement
app.post('/api/subscribe', (req, res) => {
  console.log('📬 Requête /subscribe reçu :', req.body);
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription payload' });
  }

  const exists = subscriptions.some(s => s.endpoint === subscription.endpoint);
  if (!exists) {
    subscriptions.push(subscription);
    fs.writeFileSync(subFile, JSON.stringify(subscriptions, null, 2));
    console.log('✅ Nouvelle subscription enregistrée :', subscription.endpoint);
  } else {
    console.log('ℹ️ Subscription existante, pas de doublon :', subscription.endpoint);
  }

  res.status(201).json({ message: 'Subscription added successfully.' });
});

// Envoi de notifications
app.post('/api/notify', async (req, res) => {
  console.log('📤 Requête /notify reçu :', req.body);
  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'Missing title or body' });
  }

  const payload = JSON.stringify({ title, body });
  const details = [];

  for (const sub of subscriptions) {
    try {
      const response = await webpush.sendNotification(sub, payload);
      console.log(`✅ Push vers ${sub.endpoint} statusCode=`, response.statusCode);
      details.push({ endpoint: sub.endpoint, success: true, statusCode: response.statusCode });
    } catch (err) {
      console.error(`❌ Échec push vers ${sub.endpoint}`);
      console.error('StatusCode:', err.statusCode, 'Body:', err.body);
      console.error(err.stack);
      details.push({ endpoint: sub.endpoint, success: false, statusCode: err.statusCode, body: err.body });
    }
  }

  // Réponse détaillée pour debug client
  res.json({ sent: details.filter(d => d.success).length, total: details.length, details });
});

// --- ERROR HANDLING ---
// Middleware erreurs
app.use((err, req, res, next) => {
  console.error('💥 Middleware Error:', err.stack || err);
  res.status(500).json({ error: 'Internal Server Error' });
});
// Safe exit on unhandled rejections
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

// --- LANCEMENT ---
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
