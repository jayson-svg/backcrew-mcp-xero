# BackCrew Xero MCP Server

Think of this like a brand-new employee on their first day, not a business partner. A new hire only does the exact tasks you've shown them, nothing more, until you decide they're ready for more responsibility.

It lets you connect an AI assistant like Claude or ChatGPT to your [Xero](https://www.xero.com/) account, so you can ask for things in plain English, like "show me unpaid invoices," "look up this customer's payment history," or "what bills do we owe," instead of clicking through Xero yourself. On day one, it only knows how to look things up. You decide if and when to train it up to doing more.

This is a different kind of platform than the rest of the BackCrew MCP series: Xero is accounting software, not a CRM/FSM. It's built to run **alongside** one of our CRM/FSM servers (like [ServiceM8](https://github.com/jayson-svg/backcrew-mcp-servicem8)) in the same AI assistant, so you can ask questions that span both, like "did we invoice this job yet?", in one conversation. It's the same role [QuickBooks](https://github.com/jayson-svg/backcrew-mcp-quickbooks) plays elsewhere in this series — Xero for businesses in the UK, Australia, and NZ; QuickBooks for the US.

Built by **[BackCrew](#built-by-backcrew)**, part of a series of free tools like this for pest control businesses.

> Not a developer? That's fine. Everything up through "Testing it safely" is written for you, no coding background needed.

---

## Contents

- [What this actually does](#what-this-actually-does)
- [Why use an independent MCP server instead of Xero's own official one?](#why-use-an-independent-mcp-server-instead-of-xeros-own-official-one)
- [Scope: this is intentionally narrow](#scope-this-is-intentionally-narrow)
- [Also from BackCrew](#also-from-backcrew)
- [Some words you'll see, explained](#some-words-youll-see-explained)
- [How this keeps you safe by default](#how-this-keeps-you-safe-by-default)
- [What it can look up (always safe)](#what-it-can-look-up-always-safe)
- [⚠️ What it can change (off by default)](#what-it-can-change-off-by-default)
- [How to set it up](#how-to-set-it-up)
- [Connecting it to Claude](#connecting-it-to-claude)
- [Testing it safely](#testing-it-safely)
- [For developers](#for-developers)
- [What's next](#whats-next)
- [Built by BackCrew](#built-by-backcrew)
- [License](#license)

## What this actually does

Let's be upfront about what this is, because it's easy to oversell: this is **not** an all-knowing bookkeeper that understands your business and handles things for you. It's a specific, listed set of actions that an AI assistant is allowed to trigger when you ask for them in plain English. The AI doesn't have judgment about your books; it matches what you ask for to the closest action on its list and does exactly that, nothing more.

## Why use an independent MCP server instead of Xero's own official one?

Fair question, and we checked before building. Xero does publish an official, open-source MCP server ([`XeroAPI/xero-mcp-server`](https://github.com/XeroAPI/xero-mcp-server)) that's genuinely broad: 50+ commands across invoices, credit notes, bank transactions, manual journals, quotes, contacts, items, accounts, tax rates, tracking categories, P&L/trial balance/balance sheet/aged receivables reports, and (in NZ/UK) payroll.

Where this project differs:

- **No paid add-on required.** Xero's official server is set up to run via a **Custom Connection** — Xero's premium, paid app type that skips the browser consent screen. This repo defaults to Xero's free, standard OAuth flow instead (the same one any Xero developer app gets on any plan); Custom Connections are supported too if you already have one, but they're optional, not the assumed path.
- **Narrower, more reviewable.** This repo covers six areas deliberately (see [Scope](#scope-this-is-intentionally-narrow) below) instead of the full accounting surface. You can read every tool in [`src/tools/`](src/tools) in a sitting.
- **The same tiered-safety model as the rest of this series.** Read-only by default, with an explicit `readonly-owner` / `office-ops` / `admin` profile system you control — see [How this keeps you safe by default](#how-this-keeps-you-safe-by-default). Xero's official server exposes create/update tools as soon as it's connected, gated only by whatever OAuth scopes you granted the app.
- **Cross-platform, not walled off.** This project can run alongside one of BackCrew's CRM/FSM servers, attached to the same AI assistant, so it can work across your whole stack, job data and your books, in one conversation.
- **Consistent with our other builds.** If you're also using other BackCrew servers, this one follows the identical pattern: same mental model, same setup steps, same safety controls.

In short: use Xero's official server if you want the broadest coverage (reports, payroll, quotes) and don't mind a Custom Connection or running your own OAuth flow for a bearer token. Use this one if you want the narrower, tier-gated, free-plan-friendly option that matches the rest of your BackCrew stack.

## Scope: this is intentionally narrow

Xero's Accounting API covers dozens of objects (manual journals, budgets, tracking categories, purchase orders, quotes, employee/payroll data where applicable, and more). This repo deliberately covers only the six most relevant to a pest control/home-service business, so it stays accurate and reviewable rather than becoming a huge, harder-to-trust accounting system clone:

- **Contacts**: customers and suppliers — Xero doesn't split these into separate objects the way QuickBooks does; one Contact can be either, both, or neither, flagged `IsCustomer`/`IsSupplier`
- **Invoices**: sales invoices you've billed to customers (Xero's `Type=ACCREC`)
- **Bills**: money you owe suppliers, not yet paid (Xero's `Type=ACCPAY` — same underlying object as Invoices, split into its own tool file here because it sits on a different safety tier; see [For developers](#for-developers))
- **Payments**: money applied to invoices and bills, in either direction
- **Bank Transactions**: money spent or received directly through a bank account, with no separate invoice or bill (Xero's closest match to QuickBooks' "Purchase" entity)
- **Accounts**: read-only chart-of-accounts lookup, needed to reference on line items, bills, and bank transactions

Not covered: credit notes, manual journals, quotes, purchase orders, budgets, tracking categories, payroll, assets, and Xero's reporting endpoints. If your pilot needs one of those, treat it as a scoped addition, not evidence this repo is incomplete by accident; the narrowness here is deliberate. See [ROADMAP.md](ROADMAP.md).

## Also from BackCrew

This is one of several MCP connectors BackCrew builds, same idea, different software. We've also got QuickBooks for the US side of the accounting equation, plus FSM connectors like ServiceM8 and Housecall Pro. Full list and what's live right now: see [ROADMAP.md](ROADMAP.md).

**Beyond this repo:** once a business gets comfortable with an AI assistant reading its data, there's often more it wants to do with it, like catching missed calls faster, processing invoices and paperwork automatically, following up on quotes without someone having to remember, reactivating customers who've gone quiet, or pulling reports without digging through the software. That's a separate, scoped conversation, not part of this free, open-source repo. Same contact as in [Built by BackCrew](#built-by-backcrew) below if it's something you want to explore.

## Some words you'll see, explained

- **API**: a locked door into Xero's data that only software can open. This project is a key that opens that door.
- **MCP**: the standard way an AI assistant like Claude or ChatGPT is told what it's allowed to do.
- **Server**: a small program that sits between Claude (or ChatGPT) and Xero, translating requests back and forth.
- **Tenant / Organisation**: Xero's term for one company file. Every request is scoped to one Tenant ID (Xero's own docs use "tenant" and "organisation" interchangeably).
- **OAuth (Authorization Code)**: the login flow Xero uses by default. Someone has to complete a one-time consent flow to connect this to a specific Xero organisation. See [setup](#how-to-set-it-up).
- **Custom Connection**: a paid, optional Xero add-on that swaps the one-time consent flow for a simpler client-ID/secret pair, locked to one organisation. Not required — see `.env.example` if you already have one.
- **Terminal**: a plain-text window where you type commands.
- **Tool**: one specific, individually named action the AI is allowed to take.

## How this keeps you safe by default

- **Out of the box, this server can only look things up.** It ships in **read-only mode**.
- **When you're ready for more, you choose a responsibility level:**
  - `readonly-owner`: same as the default. Look-ups only.
  - `office-ops`: create/update contacts and sales invoices, email an invoice, record a customer payment, record money received directly into a bank account. **No deletes, no voids, no bills, nothing that represents money leaving the business.**
  - `admin`: everything, including deletes/voids, bills, paying a bill, and recording a direct bank spend.
- **Why bills and outgoing payments are admin-tier, not office-ops**: unlike invoicing a customer (routine front-desk work), a bill or an outgoing payment represents money leaving the business — closer in spirit to the "financially consequential" writes that are admin-tier throughout this whole series (e.g. QuickBooks' expense/vendor-bill writes elsewhere in this series). Bookkeeping writes that move money out get the stricter tier here.
- **A typo can't accidentally hand out more trust than you intended.** An invalid profile falls back to the safest option.

## What it can look up (always safe)

| What it covers | Examples |
| --- | --- |
| Contacts | Search and view customer/supplier records |
| Invoices | View sales invoices, filter to unpaid ones |
| Bills | View money owed to suppliers |
| Payments | View payment history |
| Bank Transactions | View direct spend/receive transactions |
| Accounts | View the chart of accounts |
| Organisations | List which Xero organisations your credentials can reach, to find your Tenant ID |

14 look-up actions in total.

## ⚠️ What it can change (off by default)

**`office-ops` level:**

| What it covers | Examples |
| --- | --- |
| Contacts | Add or update a customer/supplier |
| Invoices | Create/update a sales invoice, email it to the customer |
| Payments | Record a customer payment against an invoice |
| Bank Transactions | Record money received directly into a bank account |

**`admin` level only:**

- Voiding or deleting an invoice, bill, or payment
- Creating or updating a bill
- Recording a payment made against a bill
- Recording money spent directly from a bank account
- Deleting a bank transaction

## How to set it up

Like QuickBooks elsewhere in this series, Xero needs a one-time OAuth setup instead of a simple "generate a key" button, so Step 2 below takes longer than in our CRM/FSM repos; budget about 15 minutes for it.

You'll need a computer with [Node.js](https://nodejs.org) installed before you start.

### Step 1: Make a folder for this on your computer

Open Finder (Mac) or File Explorer (Windows), go to your Desktop or Documents, and create a new folder. Give it a name you'll recognize later, like `backcrew-mcp-xero`.

That's it for now, just know where this folder is. Everything else gets put inside it.

### Step 2: Get Xero OAuth credentials

1. Go to [developer.xero.com/myapps](https://developer.xero.com/myapps) and sign in with your normal Xero login (no separate developer account needed).
2. Create a new app. Choose the "Web app" type — this gives you a **Client ID** and lets you generate a **Client Secret**.
3. Xero requires a redirect URI even if you don't have a website. Set it to `https://login.xero.com/identity/connect/authorize` or any `https://` URL you control — you'll paste the code out of the browser's address bar manually, so where it "lands" doesn't matter for this setup.
4. In a browser, visit an authorize URL built from your Client ID (replace the placeholders):
   ```
   https://login.xero.com/identity/connect/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&scope=accounting.contacts%20accounting.transactions%20accounting.settings.read%20offline_access&state=setup
   ```
5. Log in, pick the Xero organisation to connect (your real company, or the free **Demo Company** Xero gives every account for testing), and approve. You'll land on your redirect URI with `?code=...` in the address bar — copy that code.
6. Exchange the code for tokens (run this in a terminal, replacing the placeholders):
   ```bash
   curl https://identity.xero.com/connect/token \
     -H "Authorization: Basic $(echo -n 'YOUR_CLIENT_ID:YOUR_CLIENT_SECRET' | base64)" \
     -d grant_type=authorization_code -d code=YOUR_CODE -d redirect_uri=YOUR_REDIRECT_URI
   ```
   This returns an **Access Token** and a **Refresh Token**.
7. Find your **Tenant ID**:
   ```bash
   curl https://api.xero.com/connections -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```
   Copy the `tenantId` for the organisation you connected. (Once this server is running, `list_organisations` does the same lookup for you.)
8. Copy all five values (Client ID, Client Secret, Tenant ID, Access Token, Refresh Token) into a temporary note; you'll paste them in during Step 3.

**Keep your Client ID/Secret handy even after setup.** Xero refresh tokens rotate every time they're used (more on this in Step 3), so you may need to redo steps 6–7 later if a refresh token expires from disuse.

### Step 3: Install it

With your folder made and your credentials in hand, this is one continuous run; don't skip ahead or double back.

1. Open a terminal. On a Mac, press Cmd+Space, type "Terminal," and hit enter. On Windows, click the Start menu, type "PowerShell," and hit enter. Use PowerShell rather than Command Prompt: a couple of the commands below, like `pwd`, only work in PowerShell.
2. Type `cd ` (with a space after it), then drag your Step 1 folder from Finder/File Explorer straight into the terminal window; it'll paste the folder's path in automatically. Press enter.
3. Paste this exact command and press enter; it downloads the project directly into the folder you made (the trailing `.` matters, it means "put it here, not in a new folder"):
   ```bash
   git clone https://github.com/jayson-svg/backcrew-mcp-xero.git .
   ```
4. Paste this and press enter; it installs the project's dependencies:
   ```bash
   npm install
   ```
5. Paste this and press enter; it builds the project:
   ```bash
   npm run build
   ```
6. Paste this and press enter; it prints the full folder path. **Don't close this terminal window yet; you'll need this exact text in the next section.**
   ```bash
   pwd
   ```
7. Paste this and press enter; it creates your settings file from a template:
   ```bash
   cp .env.example .env
   ```
8. Open that new `.env` file in a text editor. On a Mac, paste `open -e .env` into the terminal and press enter. On Windows, paste `notepad .env` and press enter.
9. Find the lines for `XERO_CLIENT_ID=`, `XERO_CLIENT_SECRET=`, `XERO_TENANT_ID=`, `XERO_ACCESS_TOKEN=`, and `XERO_REFRESH_TOKEN=`. Paste in the matching values you collected in Step 2, right after each `=`, with no extra spaces or quotes.
10. Leave `XERO_MCP_MODE=read_only` and `XERO_MCP_PROFILE=readonly-owner` exactly as they are for now; that's the safe default. Save the file and close the editor.

**Keep this in mind going forward: Xero refresh tokens rotate.** Every time this server refreshes your access token, Xero issues a brand-new refresh token and invalidates the old one. This server handles that automatically while it's running, and logs the new refresh token to its stderr output, but it does **not** write the new value back into your `.env` file for you. If you restart the server after it's been running long enough to refresh, copy the newly-logged refresh token into `XERO_REFRESH_TOKEN` first, or the old one will no longer work. Unused refresh tokens also expire after 60 days — if that happens, redo Step 2.

## Connecting it to Claude

This step comes last on purpose; it needs the exact folder location from Step 3, and now you have it.

Open Claude's settings file (for Claude Desktop, `claude_desktop_config.json`) and add:

```json
{
  "mcpServers": {
    "xero": {
      "command": "node",
      "args": ["PASTE_YOUR_PWD_OUTPUT_HERE/dist/index.js"],
      "env": {
        "XERO_CLIENT_ID": "your_client_id",
        "XERO_CLIENT_SECRET": "your_client_secret",
        "XERO_TENANT_ID": "your_tenant_id",
        "XERO_ACCESS_TOKEN": "your_access_token",
        "XERO_REFRESH_TOKEN": "your_refresh_token",
        "XERO_MCP_MODE": "read_only",
        "XERO_MCP_PROFILE": "readonly-owner"
      }
    }
  }
}
```

Replace `PASTE_YOUR_PWD_OUTPUT_HERE` with the exact text the `pwd` command printed back in Step 3 (keep the `/dist/index.js` part after it). If you're on Windows, swap any backslashes in that path for forward slashes (for example `C:/Users/yourname/Desktop/...` instead of `C:\Users\yourname\Desktop\...`), since the config file needs regular slashes.

Restart Claude. This also works with ChatGPT and other MCP-compatible AI tools. If you're also running one of BackCrew's CRM/FSM servers, add both to the same config so Claude can use them together in one conversation.

## Testing it safely

1. **Use Xero's free Demo Company first**, not your real books; every Xero account gets one, pre-loaded with realistic sample data, specifically for this kind of testing.
2. **Start in read-only mode and stay there for a while.**
3. **When you turn on `office-ops`, test on a clearly fake contact first.**
4. **Never go straight to `admin` mode.** Voids, deletes, bills, and outgoing payments touch real financial records.
5. **Never share your Client Secret, access token, or refresh token**; treat them like a password.
6. **If something looks wrong, switch back to `XERO_MCP_MODE=read_only` immediately.**

## For developers

Everything below this point assumes a coding background.

### Tool reference

Run the server and call `tools/list` to see exact schemas; every tool's description includes the Xero API operation it maps to and its access tier.

### Project layout

```
src/
  index.ts              Server entrypoint
  client.ts              OAuth token refresh (with rotation handling, both auth modes) + API client
  toolkit.ts              Tier/profile-aware helper that wires a Zod input schema + handler into an MCP tool
  tools/
    contacts.ts
    invoices.ts             (Type=ACCREC)
    bills.ts                  (Type=ACCPAY — same endpoint as Invoices, different safety tier)
    payments.ts
    bankTransactions.ts
    accounts.ts                (read-only)
    organisations.ts             (setup helper — GET /connections)
```

### The tier/profile system

Same pattern as the rest of this series: `XERO_MCP_MODE`/`XERO_MCP_PROFILE` gate what's registered at startup; `read_only` always wins; invalid profile falls back to the safest tier.

### Notes on the Xero Accounting API

- Base URL: `https://api.xero.com/api.xro/2.0/{resource}`. Unlike QuickBooks, Xero has **no separate sandbox host** — every request goes to the same production API. "Testing" means using a real Xero organisation, typically the free Demo Company every account gets.
- Auth: OAuth 2.0. Access tokens last **30 minutes**. In the default `authorization_code` mode, refresh tokens last 60 days *unused* but **rotate on every use** (see the setup warning above) — the same operational quirk this series' QuickBooks repo has with Intuit. This repo also supports Xero's `client_credentials` mode (a paid "Custom Connection" add-on) as an alternative that skips refresh-token management entirely — see `.env.example`.
- Every request in `authorization_code` mode needs an `Xero-tenant-id` header identifying which organisation you mean; `client_credentials` connections are locked to one organisation and omit it. `src/client.ts` handles this automatically based on which mode you've configured.
- There's no separate "list" vs "query" split like QuickBooks' SQL-like language: Xero's `GET` endpoints take a `where` query parameter with its own small filter-expression syntax (e.g. `Type=="ACCREC"`, `Contact.ContactID==Guid("...")`). `src/client.ts` and each tool build these directly.
- **Bills are not a separate object.** A bill is an `Invoice` with `Type=ACCPAY`, served through the same `/Invoices` endpoint as sales invoices. This repo still splits them into `bills.ts` because this series ties safety tier to what an action *means* (money in vs. money out), not to how the vendor's schema happens to be shaped.
- Rate limits (per Xero's published limits): 60 calls/minute and 5,000 calls/day per organisation, 5 concurrent calls, 10,000 calls/minute app-wide across all organisations. Responses include `X-MinLimit-Remaining` / `X-DayLimit-Remaining` headers; a `429` response includes a `Retry-After` header. This repo surfaces `429` responses as structured errors but does not auto-retry — see `formatError` in `src/toolkit.ts`.
- Full reference: this repo was built directly from Xero's own [OpenAPI 3.0 specification](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml) (published by Xero itself), field by field, cross-checked against [developer.xero.com](https://developer.xero.com/documentation/api/accounting/overview) — not guessed or inferred from general REST conventions, and not copied from any third-party SDK.

This repo intentionally stops at honest API access. It does not include business-logic features; those live in BackCrew's managed offering, not in this public repo. See [ROADMAP.md](ROADMAP.md).

## What's next

See [ROADMAP.md](ROADMAP.md) for the rest of the planned series and the pattern this repo follows.

## Built by BackCrew

This project is free and open for anyone to use, copy, or build on.

It's also a sample of the kind of work **BackCrew** does. If you want this expanded (credit notes, manual journals, reports, payroll) or connected alongside a specific CRM/FSM server for your business, that's exactly the kind of project we take on.

**Want this done for you?** Reach out: **[jayson@backcrew.co](mailto:jayson@backcrew.co)**

No pressure either way, everything above works on its own, for free.

## License

[MIT](LICENSE)
