const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.PRIVATE_KEY?.replace(/\\n/g, '\n');

const getAccessToken = async () => {
  const jwtClient = new google.auth.JWT(
    SERVICE_ACCOUNT_EMAIL,
    null,
    PRIVATE_KEY,
    ['https://www.googleapis.com/auth/firebase.messaging']
  );

  const tokens = await jwtClient.authorize();
  return tokens.access_token;
};

app.post('/send-notification', async (req, res) => {
  try {
    const { tokens, notification, data } = req.body;

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ error: 'Tokens requeridos' });
    }

    if (!notification || !notification.title || !notification.body) {
      return res.status(400).json({ error: 'Notification title y body requeridos' });
    }

    const accessToken = await getAccessToken();

    const results = [];
    for (const token of tokens) {
      try {
        const message = {
          message: {
            token: token,
            notification: {
              title: notification.title,
              body: notification.body,
            },
            data: data ? Object.fromEntries(
              Object.entries(data).map(([key, value]) => [key, String(value)])
            ) : undefined,
            android: {
              priority: 'high',
            },
            apns: {
              headers: {
                'apns-priority': '10',
              },
            },
          },
        };

        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          results.push({ token, success: false, error: errorText });
        } else {
          results.push({ token, success: true });
        }
      } catch (error) {
        results.push({ token, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
      success: true,
      sent: successCount,
      total: tokens.length,
      results: results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor FCM V1 corriendo en puerto ${PORT}`);
});

