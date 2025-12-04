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
    console.log('📨 Recibida solicitud de notificación');
    const { tokens, notification, data } = req.body;

    console.log('📋 Tokens recibidos:', tokens?.length || 0);
    console.log('📋 Notification:', notification);
    console.log('📋 Data:', data);

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      console.log('❌ Error: Tokens requeridos');
      return res.status(400).json({ error: 'Tokens requeridos' });
    }

    if (!notification || !notification.title || !notification.body) {
      console.log('❌ Error: Notification title y body requeridos');
      return res.status(400).json({ error: 'Notification title y body requeridos' });
    }

    if (!PROJECT_ID || !SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
      console.log('❌ Error: Variables de entorno no configuradas');
      return res.status(500).json({ error: 'Configuración del servidor incompleta' });
    }

    console.log('🔑 Obteniendo access token...');
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtenido');

    const results = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      try {
        console.log(`📤 Enviando notificación ${i + 1}/${tokens.length}...`);
        
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

        const fcmUrl = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
        console.log(`🔗 URL FCM: ${fcmUrl}`);
        
        const response = await fetch(fcmUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.log(`❌ Error en token ${i + 1}: ${errorText}`);
          results.push({ token: token.substring(0, 20) + '...', success: false, error: errorText });
        } else {
          const responseData = await response.json();
          console.log(`✅ Notificación ${i + 1} enviada exitosamente`);
          results.push({ token: token.substring(0, 20) + '...', success: true, response: responseData });
        }
      } catch (error) {
        console.log(`❌ Error en token ${i + 1}: ${error.message}`);
        results.push({ token: token.substring(0, 20) + '...', success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`📊 Resultados: ${successCount}/${tokens.length} exitosos`);
    
    res.json({
      success: true,
      sent: successCount,
      total: tokens.length,
      results: results,
    });
  } catch (error) {
    console.log('❌ Error general:', error.message);
    console.error(error);
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

