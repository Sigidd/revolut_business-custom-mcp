/**
 * Revolut Business MCP — Setup Page
 * GET  /api/oauth/setup?session=<sessionId>  → HTML form
 * POST /api/oauth/setup                       → save credentials → redirect to Revolut consent
 */
import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/auth";
import { store } from "@/lib/store";

const CALLBACK_URL = "https://revolutbusiness-custom-mcp.vercel.app/api/oauth/callback";

function getConsentBaseUrl(): string {
  const env = (process.env.REVOLUT_ENVIRONMENT ?? "production").trim().toLowerCase();
  return env === "sandbox"
    ? "https://sandbox-business.revolut.com/app-confirm"
    : "https://business.revolut.com/app-confirm";
}

function errorHtml(message: string): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Errore — Revolut Business MCP</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 40px; max-width: 480px; text-align: center; }
    h1 { color: #ff4444; margin-bottom: 12px; }
    p { color: #aaa; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Errore</h1>
    <p>${message}</p>
    <p>Chiudi questa finestra e riprova.</p>
  </div>
</body>
</html>`,
    { status: 400, headers: { "Content-Type": "text/html" } }
  );
}

// ── GET — show the setup form ─────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const sessionId = req.nextUrl.searchParams.get("session");
  if (!sessionId) {
    return errorHtml("Parametro session mancante.");
  }

  const session = await store.getSession(sessionId);
  if (!session) {
    return errorHtml("Sessione OAuth scaduta o non trovata. Riprova la connessione.");
  }

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Connetti Revolut Business</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d0d0d;
      color: #f0f0f0;
      min-height: 100vh;
      margin: 0;
      padding: 24px 16px 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 32px;
      padding-top: 16px;
    }

    .header img {
      width: 40px;
      height: 40px;
      border-radius: 8px;
    }

    .header h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0;
      color: #fff;
    }

    .card {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 600px;
    }

    .card h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 0 0 8px;
      color: #fff;
    }

    .subtitle {
      color: #888;
      font-size: 14px;
      margin: 0 0 28px;
      line-height: 1.5;
    }

    .steps {
      list-style: none;
      padding: 0;
      margin: 0 0 32px;
      counter-reset: step;
    }

    .steps li {
      counter-increment: step;
      display: flex;
      gap: 14px;
      margin-bottom: 18px;
      line-height: 1.55;
      font-size: 14px;
      color: #ccc;
    }

    .steps li::before {
      content: counter(step);
      flex-shrink: 0;
      width: 26px;
      height: 26px;
      background: #2563eb;
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      margin-top: 1px;
    }

    .steps li strong {
      color: #fff;
    }

    .steps li code {
      background: #252525;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 1px 6px;
      font-family: 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      color: #7dd3fc;
    }

    .steps li .cmd-block {
      margin-top: 8px;
      background: #111;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      padding: 12px 14px;
      font-family: 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      color: #86efac;
      white-space: pre;
      overflow-x: auto;
      line-height: 1.6;
    }

    .redirect-uri-box {
      background: #111;
      border: 1px solid #2563eb44;
      border-radius: 10px;
      padding: 12px 14px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .redirect-uri-box span {
      font-family: 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      color: #7dd3fc;
      flex: 1;
      word-break: break-all;
    }

    .copy-btn {
      background: #1d4ed8;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }

    .copy-btn:hover { background: #2563eb; }
    .copy-btn:active { background: #1e40af; }

    .divider {
      border: none;
      border-top: 1px solid #2a2a2a;
      margin: 28px 0;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #ccc;
      margin-bottom: 6px;
    }

    input[type="text"],
    textarea {
      width: 100%;
      background: #111;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 11px 14px;
      color: #f0f0f0;
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s;
      resize: vertical;
    }

    input[type="text"]:focus,
    textarea:focus {
      border-color: #2563eb;
    }

    input[type="text"]::placeholder,
    textarea::placeholder {
      color: #555;
    }

    textarea {
      font-family: 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      min-height: 120px;
    }

    .submit-btn {
      width: 100%;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 14px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 8px;
      transition: opacity 0.15s, transform 0.1s;
      letter-spacing: 0.01em;
    }

    .submit-btn:hover { opacity: 0.92; }
    .submit-btn:active { transform: scale(0.99); }

    .note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background: #151515;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      padding: 12px 14px;
      margin-top: 20px;
      font-size: 12px;
      color: #888;
      line-height: 1.5;
    }

    .note svg {
      flex-shrink: 0;
      margin-top: 1px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="/icon.png" alt="Revolut Business MCP" onerror="this.style.display='none'"/>
    <h1>Revolut Business MCP</h1>
  </div>

  <div class="card">
    <h2>Connetti il tuo Revolut Business</h2>
    <p class="subtitle">Segui i passaggi qui sotto per collegare il tuo account Revolut Business a Claude.</p>

    <ol class="steps">
      <li>
        <div>
          Vai su <strong>Revolut Business</strong> → <strong>Impostazioni</strong> → <strong>API</strong> → <strong>API aziendale</strong>
        </div>
      </li>
      <li>
        <div>
          Clicca <strong>"Aggiungi"</strong> per creare un nuovo certificato. Prima, genera la coppia di chiavi RSA sul tuo computer:
          <div class="cmd-block">openssl genrsa -out private.pem 2048
openssl req -new -x509 -key private.pem -out public.pem -days 1825</div>
          Poi carica il file <code>public.pem</code> su Revolut.
        </div>
      </li>
      <li>
        <div>
          Nella sezione <strong>URI di reindirizzamento</strong>, inserisci esattamente questo URL:
          <div class="redirect-uri-box">
            <span id="redirect-uri">${CALLBACK_URL}</span>
            <button class="copy-btn" onclick="copyUri()">Copia</button>
          </div>
        </div>
      </li>
      <li>
        <div>
          Copia il <strong>Client ID</strong> che Revolut mostra dopo la creazione del certificato (inizia con <code>po_live_</code> o <code>po_test_</code>).
        </div>
      </li>
      <li>
        <div>
          Incolla il <strong>Client ID</strong> e la tua <strong>chiave privata</strong> (contenuto del file <code>private.pem</code>) nel modulo qui sotto.
        </div>
      </li>
    </ol>

    <hr class="divider"/>

    <form method="POST" action="/api/oauth/setup">
      <input type="hidden" name="session" value="${sessionId}"/>

      <div class="form-group">
        <label for="client_id">Client ID</label>
        <input
          type="text"
          id="client_id"
          name="client_id"
          placeholder="po_live_..."
          required
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div class="form-group">
        <label for="private_key">Chiave Privata RSA</label>
        <textarea
          id="private_key"
          name="private_key"
          placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;MIIEowIBAAKCAQEA...&#10;-----END RSA PRIVATE KEY-----"
          required
          spellcheck="false"
          autocomplete="off"
        ></textarea>
      </div>

      <button type="submit" class="submit-btn">Connetti a Revolut →</button>
    </form>

    <div class="note">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      Le tue credenziali vengono salvate in modo sicuro e non sono mai condivise con terze parti.
    </div>
  </div>

  <script>
    function copyUri() {
      const uri = document.getElementById('redirect-uri').textContent;
      navigator.clipboard.writeText(uri).then(function() {
        const btn = document.querySelector('.copy-btn');
        btn.textContent = 'Copiato!';
        setTimeout(function() { btn.textContent = 'Copia'; }, 2000);
      });
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ── POST — save credentials and redirect to Revolut consent ──────────────────

export async function POST(req: NextRequest): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorHtml("Impossibile leggere i dati del modulo.");
  }

  const sessionId = formData.get("session")?.toString().trim() ?? "";
  const clientId = formData.get("client_id")?.toString().trim() ?? "";
  const privateKey = formData.get("private_key")?.toString().trim() ?? "";

  if (!sessionId || !clientId || !privateKey) {
    return errorHtml("Tutti i campi sono obbligatori (session, client_id, private_key).");
  }

  // Load and validate session
  const session = await store.getSession(sessionId);
  if (!session) {
    return errorHtml("Sessione OAuth scaduta. Chiudi questa finestra e riprova la connessione da Claude.");
  }

  // Persist user credentials into the session so callback can use them
  await store.setSession(sessionId, {
    ...session,
    revolutClientId: clientId,
    revolutPrivateKey: privateKey,
  });

  // Build Revolut consent URL using the user's client_id
  const baseUrl = getBaseUrl();
  const callbackUrl = `${baseUrl}/api/oauth/callback`;
  const consentBase = getConsentBaseUrl();

  const consentUrl = new URL(consentBase);
  consentUrl.searchParams.set("client_id", clientId);
  consentUrl.searchParams.set("redirect_uri", callbackUrl);
  consentUrl.searchParams.set("response_type", "code");
  consentUrl.searchParams.set("scope", "READ,WRITE");
  consentUrl.searchParams.set("state", sessionId);

  return NextResponse.redirect(consentUrl.toString());
}
