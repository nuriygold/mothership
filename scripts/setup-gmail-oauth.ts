import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import open from 'open';

const CLIENT_ID = process.argv[2] || process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.argv[3] || process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URL = 'http://localhost:3001/oauth/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing Google OAuth credentials.\n');
  console.error('Provide them as arguments:');
  console.error('  npx ts-node scripts/setup-gmail-oauth.ts <CLIENT_ID> <CLIENT_SECRET>\n');
  console.error('Or set environment variables:');
  console.error('  export GOOGLE_CLIENT_ID="your_client_id"');
  console.error('  export GOOGLE_CLIENT_SECRET="your_client_secret"');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

let server: http.Server;

function startServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = url.parse(req.url || '', true);
        const code = parsedUrl.query.code as string;

        if (code) {
          const { credentials } = await oauth2Client.getToken(code);
          const refreshToken = credentials.refresh_token;

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <head><title>OAuth Success</title></head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem; text-align: center;">
                <h1>✅ Success!</h1>
                <p>Your refresh token has been generated. Copy it below:</p>
                <code style="display: block; background: #f5f5f5; padding: 1rem; margin: 1rem 0; word-break: break-all; border-radius: 4px;">
                  ${refreshToken}
                </code>
                <p>Add this to your .env as: <code>GOOGLE_REFRESH_TOKEN="${refreshToken}"</code></p>
              </body>
            </html>
          `);
          server.close();
          resolve(refreshToken || '');
        } else {
          res.writeHead(400);
          res.end('No authorization code received');
          reject(new Error('No authorization code'));
        }
      } catch (err) {
        res.writeHead(500);
        res.end(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        reject(err);
      }
    });

    server.listen(3001, () => {
      console.log('🔐 Opening Google OAuth consent screen...\n');
      open(authUrl);
    });
  });
}

startServer()
  .then((refreshToken) => {
    console.log('\n✅ OAuth flow complete!\n');
    console.log('Your GOOGLE_REFRESH_TOKEN:');
    console.log(refreshToken);
    console.log('\nAdd to your .env file:');
    console.log(`GOOGLE_REFRESH_TOKEN="${refreshToken}"`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ OAuth setup failed:', err);
    process.exit(1);
  });
