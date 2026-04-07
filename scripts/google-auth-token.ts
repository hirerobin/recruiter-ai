/**
 * One-time script to generate a Google OAuth2 refresh token for Drive uploads.
 *
 * Usage:
 *   1. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env
 *   2. Run: bun run scripts/google-auth-token.ts
 *   3. Open the printed URL in your browser, authorize
 *   4. Copy the refresh_token into .env as GOOGLE_DRIVE_REFRESH_TOKEN
 */
import { google } from 'googleapis'
import { createServer } from 'http'

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env first')
  process.exit(1)
}

const REDIRECT_URI = 'http://localhost:3333'
const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

const url = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/drive.file'],
  prompt: 'consent',
})

console.log('\n🔗 Open this URL in your browser:\n')
console.log(url)
console.log('\nWaiting for callback on http://localhost:3333 ...\n')

const server = createServer(async (req, res) => {
  const reqUrl = new URL(req.url!, `http://localhost:3333`)
  const code = reqUrl.searchParams.get('code')

  if (!code) {
    res.writeHead(400)
    res.end('Missing code parameter')
    return
  }

  try {
    const { tokens } = await oauth2.getToken(code)
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<h1>✅ Success!</h1><p>You can close this tab and go back to the terminal.</p>')

    console.log('\n✅ Success! Add this to your .env:\n')
    console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`)
    console.log('')

    server.close()
    process.exit(0)
  } catch (err: any) {
    res.writeHead(500)
    res.end(`Error: ${err.message}`)
    console.error('Error:', err.message)
    server.close()
    process.exit(1)
  }
})

server.listen(3333)
