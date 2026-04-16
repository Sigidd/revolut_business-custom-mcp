/**
 * Revolut Business MCP — Setup Page
 * GET  /api/oauth/setup?session=<sessionId>  → HTML form
 * POST /api/oauth/setup                       → save credentials → redirect to Revolut consent
 */
import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl, generateRevolutJWT } from "@/lib/auth";
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
      padding: 24px 16px 64px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 28px;
      padding-top: 16px;
    }
    .header img { width: 40px; height: 40px; border-radius: 8px; }
    .header h1 { font-size: 22px; font-weight: 700; margin: 0; color: #fff; }

    /* ── prerequisite banner ── */
    .prereq {
      width: 100%;
      max-width: 640px;
      background: #0f1f3d;
      border: 1px solid #1e40af;
      border-radius: 14px;
      padding: 20px 24px;
      margin-bottom: 20px;
    }
    .prereq-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 15px;
      font-weight: 700;
      color: #93c5fd;
      margin-bottom: 10px;
    }
    .prereq-title svg { flex-shrink: 0; }
    .prereq p {
      font-size: 13px;
      color: #93c5fd;
      margin: 0 0 14px;
      line-height: 1.6;
      opacity: 0.85;
    }

    /* OS tabs */
    .tabs { display: flex; gap: 6px; margin-bottom: 10px; }
    .tab {
      background: #1e3a6e;
      border: 1px solid #2563eb44;
      color: #93c5fd;
      border-radius: 6px;
      padding: 4px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .tab.active { background: #2563eb; color: #fff; border-color: #2563eb; }
    .tab:hover:not(.active) { background: #1e40af; }

    .cmd-block {
      background: #060d1a;
      border: 1px solid #1e3a6e;
      border-radius: 8px;
      padding: 14px 16px;
      font-family: 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      color: #86efac;
      white-space: pre;
      overflow-x: auto;
      line-height: 1.7;
      position: relative;
    }
    .cmd-panel { display: none; }
    .cmd-panel.active { display: block; }

    .prereq-note {
      margin-top: 12px;
      font-size: 12px;
      color: #60a5fa;
      opacity: 0.8;
      line-height: 1.5;
    }
    .prereq-note code {
      background: #1e3a6e;
      border-radius: 4px;
      padding: 1px 6px;
      font-family: monospace;
    }

    /* ── main card ── */
    .card {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 640px;
    }
    .card-title {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      margin: 0 0 4px;
    }
    .card-sub {
      font-size: 13px;
      color: #666;
      margin: 0 0 28px;
      line-height: 1.5;
    }

    /* ── steps ── */
    .steps { list-style: none; padding: 0; margin: 0 0 28px; counter-reset: step; }
    .steps li {
      counter-increment: step;
      display: flex;
      gap: 14px;
      margin-bottom: 22px;
      font-size: 14px;
      color: #ccc;
      line-height: 1.6;
    }
    .step-num {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
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
    .steps li strong { color: #fff; }
    .steps li a { color: #60a5fa; text-decoration: none; }
    .steps li a:hover { text-decoration: underline; }
    .steps li code {
      background: #252525;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 1px 6px;
      font-family: monospace;
      font-size: 12px;
      color: #7dd3fc;
    }

    /* redirect URI box */
    .uri-box {
      margin-top: 10px;
      background: #111;
      border: 1px solid #2563eb55;
      border-radius: 10px;
      padding: 11px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .uri-box span {
      font-family: monospace;
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
      padding: 5px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .copy-btn:hover { background: #2563eb; }
    .copy-btn.copied { background: #16a34a; }

    /* step inline note */
    .step-note {
      margin-top: 8px;
      font-size: 12px;
      color: #666;
      line-height: 1.5;
    }

    .divider { border: none; border-top: 1px solid #252525; margin: 28px 0; }

    /* ── form ── */
    .form-title { font-size: 15px; font-weight: 700; color: #fff; margin: 0 0 18px; }
    .form-group { margin-bottom: 18px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #bbb; margin-bottom: 6px; }
    label span { color: #555; font-weight: 400; font-size: 12px; margin-left: 6px; }

    input[type="text"], textarea {
      width: 100%;
      background: #111;
      border: 1px solid #2e2e2e;
      border-radius: 8px;
      padding: 11px 14px;
      color: #f0f0f0;
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      resize: vertical;
    }
    input[type="text"]:focus, textarea:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px #2563eb22;
    }
    input.valid { border-color: #16a34a; }
    input.invalid { border-color: #dc2626; }
    input[type="text"]::placeholder, textarea::placeholder { color: #444; }
    textarea {
      font-family: 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      min-height: 130px;
    }

    .field-hint { font-size: 11px; color: #555; margin-top: 5px; }
    .field-hint.error { color: #f87171; }
    .field-hint.ok { color: #4ade80; }

    .submit-btn {
      width: 100%;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 14px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 8px;
      transition: opacity 0.15s, transform 0.1s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .submit-btn:hover:not(:disabled) { opacity: 0.9; }
    .submit-btn:active:not(:disabled) { transform: scale(0.99); }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .security-note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 18px;
      font-size: 12px;
      color: #555;
      line-height: 1.5;
    }
    .security-note svg { flex-shrink: 0; margin-top: 1px; }

    .doc-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      color: #60a5fa;
      text-decoration: none;
      margin-top: 2px;
    }
    .doc-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <img src="/icon.png" alt="Revolut Business MCP" onerror="this.style.display='none'"/>
    <h1>Revolut Business MCP</h1>
  </div>

  <!-- ── PREREQUISITE: generate keys FIRST ── -->
  <div class="prereq">
    <div class="prereq-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      Prima di tutto: genera la tua coppia di chiavi RSA
    </div>
    <p>Per creare il certificato su Revolut hai bisogno di una <strong style="color:#bfdbfe">chiave pubblica</strong> (da caricare su Revolut) e una <strong style="color:#bfdbfe">chiave privata</strong> (da tenere segreta e incollare qui sotto).<br/>Esegui questi comandi nel terminale del tuo computer:</p>

    <div class="tabs">
      <button class="tab active" onclick="switchTab('mac')">Mac / Linux</button>
      <button class="tab" onclick="switchTab('win')">Windows (PowerShell)</button>
    </div>

    <div id="cmd-mac" class="cmd-panel active">
      <div class="cmd-block"># 1. Genera la chiave privata RSA 2048-bit
openssl genrsa -out private.pem 2048

# 2. Genera il certificato pubblico X509 (da caricare su Revolut)
openssl req -new -x509 -key private.pem -out public.pem -days 1825 -subj "/CN=Revolut MCP"</div>
    </div>
    <div id="cmd-win" class="cmd-panel">
      <div class="cmd-block"># Apri PowerShell (richiede OpenSSL — incluso con Git for Windows)
# 1. Genera la chiave privata RSA 2048-bit
openssl genrsa -out private.pem 2048

# 2. Genera il certificato pubblico X509 (da caricare su Revolut)
openssl req -new -x509 -key private.pem -out public.pem -days 1825 -subj "/CN=Revolut MCP"</div>
    </div>

    <p class="prereq-note">
      Otterrai 2 file: <code>public.pem</code> (carica su Revolut) e <code>private.pem</code> (incolla nel form qui sotto).<br/>
      Non hai OpenSSL su Windows? <a href="https://slproweb.com/products/Win32OpenSSL.html" target="_blank" style="color:#60a5fa">Scaricalo qui</a> oppure usa Git Bash.
    </p>
  </div>

  <!-- ── MAIN CARD ── -->
  <div class="card">
    <p class="card-title">Collega il tuo account Revolut Business</p>
    <p class="card-sub">Segui i 4 passaggi per creare il certificato su Revolut e completare la connessione.</p>

    <ol class="steps">
      <li>
        <div class="step-num">1</div>
        <div>
          Vai su <a href="https://business.revolut.com/settings/apis?tab=business-api" target="_blank"><strong>Revolut Business → Impostazioni → API → API aziendale</strong> ↗</a>
          <div class="step-note">In alto a destra trovi l'icona ⚙️ Impostazioni. Poi clicca <strong>API</strong> nella barra laterale sinistra e seleziona il tab <strong>API aziendale</strong>.</div>
          <div class="step-note"><a href="https://developer.revolut.com/docs/guides/manage-accounts/get-started/make-your-first-api-call" target="_blank" class="doc-link">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Documentazione ufficiale Revolut Business API
          </a></div>
        </div>
      </li>
      <li>
        <div class="step-num">2</div>
        <div>
          Clicca <strong>"Aggiungi"</strong> in alto a destra nella sezione <strong>Certificati API</strong>.
          <div class="step-note">Si apre il modale "Aggiungi certificato". Dai un titolo al certificato (es. <em>Claude MCP</em>).</div>
        </div>
      </li>
      <li>
        <div class="step-num">3</div>
        <div>
          Nel campo <strong>URI di reindirizzamento OAuth</strong>, incolla esattamente questo URL:
          <div class="uri-box">
            <span id="redirect-uri">${CALLBACK_URL}</span>
            <button class="copy-btn" id="copy-uri-btn" onclick="copyUri()">Copia</button>
          </div>
          Nel campo <strong>Chiave pubblica X509</strong> incolla il contenuto del file <code>public.pem</code> generato sopra.<br/>
          <div class="step-note">⚠️ L'URI deve corrispondere <em>esattamente</em> — nessuno spazio, nessuna barra finale.</div>
        </div>
      </li>
      <li>
        <div class="step-num">4</div>
        <div>
          Clicca <strong>"Continua"</strong>. Revolut ti mostrerà il <strong>Client ID</strong> del certificato appena creato (inizia con <code>po_live_</code> o <code>po_test_</code>).
          <div class="step-note">Copia il Client ID e tienilo pronto — ti servirà nel form qui sotto insieme al file <code>private.pem</code>.</div>
        </div>
      </li>
    </ol>

    <hr class="divider"/>

    <p class="form-title">Inserisci le tue credenziali</p>

    <form method="POST" action="/api/oauth/setup" onsubmit="handleSubmit(event)">
      <input type="hidden" name="session" value="${sessionId}"/>

      <div class="form-group">
        <label for="client_id">Client ID <span>fornito da Revolut dopo la creazione del certificato</span></label>
        <input
          type="text"
          id="client_id"
          name="client_id"
          placeholder="po_live_xxxxxxxxxxxxxxxxxxxxxxxx"
          required
          autocomplete="off"
          spellcheck="false"
          oninput="validateClientId(this)"
        />
        <div class="field-hint" id="client-id-hint">Inizia con <code style="background:#1a1a1a;padding:1px 5px;border-radius:3px;font-size:11px">po_live_</code> o <code style="background:#1a1a1a;padding:1px 5px;border-radius:3px;font-size:11px">po_test_</code></div>
      </div>

      <div class="form-group">
        <label for="private_key">Chiave Privata RSA <span>contenuto del file private.pem</span></label>
        <textarea
          id="private_key"
          name="private_key"
          placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;MIIEowIBAAKCAQEA...&#10;-----END RSA PRIVATE KEY-----"
          required
          spellcheck="false"
          autocomplete="off"
          oninput="validatePrivateKey(this)"
        ></textarea>
        <div class="field-hint" id="key-hint">Incolla l'intero contenuto del file <code style="background:#1a1a1a;padding:1px 5px;border-radius:3px;font-size:11px">private.pem</code>, incluse le righe BEGIN e END</div>
      </div>

      <button type="submit" class="submit-btn" id="submit-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/></svg>
        Connetti a Revolut
      </button>
    </form>

    <div class="security-note">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      Le tue credenziali vengono cifrate e salvate in modo sicuro. Non sono mai condivise con terze parti. Solo tu puoi accedere al tuo account Revolut Business.
    </div>
  </div>

  <script>
    // OS tab switcher
    function switchTab(os) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.cmd-panel').forEach(p => p.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('cmd-' + os).classList.add('active');
    }

    // Copy redirect URI
    function copyUri() {
      const uri = document.getElementById('redirect-uri').textContent.trim();
      const btn = document.getElementById('copy-uri-btn');
      navigator.clipboard.writeText(uri).then(function() {
        btn.textContent = '✓ Copiato!';
        btn.classList.add('copied');
        setTimeout(function() {
          btn.textContent = 'Copia';
          btn.classList.remove('copied');
        }, 2500);
      });
    }

    // Live validation - Client ID
    function validateClientId(input) {
      const val = input.value.trim();
      const hint = document.getElementById('client-id-hint');
      if (!val) {
        input.className = '';
        hint.className = 'field-hint';
        hint.innerHTML = 'Inizia con <code style="background:#1a1a1a;padding:1px 5px;border-radius:3px;font-size:11px">po_live_</code> o <code style="background:#1a1a1a;padding:1px 5px;border-radius:3px;font-size:11px">po_test_</code>';
        return;
      }
      if (val.startsWith('po_live_') || val.startsWith('po_test_')) {
        input.className = 'valid';
        hint.className = 'field-hint ok';
        hint.textContent = '✓ Formato corretto';
      } else {
        input.className = 'invalid';
        hint.className = 'field-hint error';
        hint.textContent = '✗ Il Client ID deve iniziare con po_live_ o po_test_';
      }
    }

    // Live validation - Private Key
    function validatePrivateKey(textarea) {
      const val = textarea.value.trim();
      const hint = document.getElementById('key-hint');
      if (!val) {
        hint.className = 'field-hint';
        hint.innerHTML = 'Incolla l\'intero contenuto del file <code style="background:#1a1a1a;padding:1px 5px;border-radius:3px;font-size:11px">private.pem</code>, incluse le righe BEGIN e END';
        return;
      }
      if (val.includes('-----BEGIN') && val.includes('-----END')) {
        hint.className = 'field-hint ok';
        hint.textContent = '✓ Chiave privata rilevata';
      } else {
        hint.className = 'field-hint error';
        hint.textContent = '✗ La chiave deve iniziare con -----BEGIN RSA PRIVATE KEY----- e terminare con -----END RSA PRIVATE KEY-----';
      }
    }

    // Submit with loading state
    function handleSubmit(e) {
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Connessione in corso...';
    }
  </script>
  <style>
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  </style>
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

  // Server-side validation: normalise key and check it's actually a private key
  const normalisedKey = privateKey
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  if (
    !normalisedKey.includes("-----BEGIN RSA PRIVATE KEY-----") &&
    !normalisedKey.includes("-----BEGIN PRIVATE KEY-----")
  ) {
    return errorHtml(
      "La chiave incollata non sembra una chiave privata RSA valida. " +
      "Assicurati di incollare il contenuto di <code>private.pem</code> (non il certificato pubblico). " +
      "Deve iniziare con <code>-----BEGIN RSA PRIVATE KEY-----</code>."
    );
  }

  // ── TEST the key immediately — fail fast before sending user to Revolut ──
  // This catches formatting issues, wrong key type, truncated content, etc.
  const baseUrlForTest = getBaseUrl();
  try {
    generateRevolutJWT(clientId, normalisedKey, baseUrlForTest);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("Key validation failed at setup:", errMsg);
    // Show human-readable error + technical detail
    return errorHtml(
      "La chiave privata non è valida o è corrotta.<br/><br/>" +
      "Assicurati di aver incollato l'intero contenuto di <code>private.pem</code>, " +
      "incluse le righe <code>-----BEGIN RSA PRIVATE KEY-----</code> e <code>-----END RSA PRIVATE KEY-----</code>.<br/><br/>" +
      "Dettaglio tecnico: <code>" + errMsg.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</code>"
    );
  }

  // Load and validate session
  const session = await store.getSession(sessionId);
  if (!session) {
    return errorHtml("Sessione OAuth scaduta. Chiudi questa finestra e riprova la connessione da Claude.");
  }

  // Persist user credentials into the session so callback can use them
  // Store the normalised key (CRLF → LF, literal \n → real newline)
  await store.setSession(sessionId, {
    ...session,
    revolutClientId: clientId,
    revolutPrivateKey: normalisedKey,
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

  // 303 See Other — tells the browser to follow the redirect with GET
  // (not 307 which would re-POST to Revolut's consent page → 405 Method Not Allowed)
  return NextResponse.redirect(consentUrl.toString(), 303);
}
