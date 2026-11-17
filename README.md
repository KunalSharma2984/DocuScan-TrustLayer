# DocuScan TrustLayer

DocuScan TrustLayer is a web application for processing Aadhaar and Indian
passport documents. Most document processing happens locally in the browser:
OCR, image preparation, and PDF page rendering do not require a separate
backend service. Users can review and correct extracted fields, validate
document-specific identifiers, and export results as JSON or CSV.

> **Important:** Checksum validation and OCR confidence are signals for review,
> not proof that a document is authentic.

## Features

- Local browser OCR powered by Tesseract.js and WebAssembly
- Aadhaar scanning with Verhoeff checksum validation and limited digit repair
- Indian passport scanning with ICAO MRZ parsing and check-digit validation
- PDF and image upload support
- Multi-page PDF rendering and batch processing
- Blur and OCR-confidence warnings
- Editable field review before saving or exporting
- JSON export per document and CSV export for a batch
- Supabase email authentication, database persistence, and non-public storage
- Row-level security policies for user-owned saved documents

## Supported documents

### Aadhaar

- DigiLocker PDF or screenshot
- Full printed Aadhaar letter or e-Aadhaar
- Small PVC card

### Passport

- Front page with personal details and machine-readable zone (MRZ)
- Back page with address and family details

Accepted uploads are images and PDF files up to **25 MB per file**. OCR is
currently configured for English (`eng`).

## Tech stack

- React 19 and TypeScript
- Vite with Tailwind CSS
- Tesseract.js for client-side OCR
- PDF.js for rendering PDF pages
- Supabase Auth, Postgres, Storage, and row-level security
- Lucide React for icons

## Requirements

- Node.js 18 or newer
- npm
- A Supabase project

## Getting started

### 1. Install dependencies

```powershell
npm install
```

### 2. Configure Supabase

Create a Supabase project and enable email/password authentication. Then open
the Supabase SQL Editor and run [`schema.sql`](./schema.sql). The schema:

- Creates the `public.documents` table
- Enables row-level security and user-isolation policies
- Creates the non-public `documents` Storage bucket
- Adds policies for user-owned document images

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Set the values in `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Use the Supabase project's **public anon key** in the browser. Never expose a
service-role key or other secret in `.env` or client-side code.

### 3. Start the development server

```powershell
npm run dev
```

Open the local URL printed by Vite, create an account, and sign in. The first
OCR run may download the Tesseract language data before processing begins.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Preview the production build locally |

Build the application before deployment:

```powershell
npm run build
npm run preview
```

The Vite configuration includes `vite-plugin-singlefile`, so the production
build is suitable for static hosting. Deploy the generated `dist/` directory
to a static host such as GitHub Pages, Netlify, Vercel, or Cloudflare Pages.
Configure the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values in
the host's build environment.

## How processing works

1. Select Aadhaar or Passport and choose the relevant page/card subtype.
2. Upload one or more images or PDFs.
3. Images are preprocessed locally; PDF pages are rendered locally with PDF.js.
4. Tesseract.js extracts text in the browser.
5. Document-specific extractors and validators identify fields and warnings.
6. Review and edit the results, then save them to Supabase or export JSON/CSV.

OCR processing does not require sending files to an external OCR service. When
a document is saved, the processed preview image and extracted metadata are
stored in the configured Supabase project.

## Project structure

```text
.
├── schema.sql                 # Supabase tables, storage, and RLS policies
├── src/
│   ├── components/            # Auth, dashboard, upload, and review UI
│   ├── hooks/                 # Scanner queue and processing state
│   ├── lib/                   # OCR, PDF, extraction, validation, and API code
│   ├── App.tsx                # Application workflow and navigation
│   └── main.tsx               # React entry point
├── .env.example               # Required environment variable names
├── package.json               # Scripts and dependencies
└── vite.config.ts             # Vite, Tailwind, and single-file build setup
```

## Local processing and access controls

- OCR, image preprocessing, and PDF rendering run locally in the browser. The
  app does not need an external OCR API for these steps.
- Saved document images are stored in a non-public Supabase Storage bucket and
  previews use short-lived signed URLs.
- The database and Storage policies in [`schema.sql`](./schema.sql) scope
  access to the authenticated user's ID.
- The browser should use only the public Supabase anon key; do not put a
  service-role key in client-side environment variables.
- These controls are configuration-dependent: apply the schema correctly,
  review the Supabase project settings, and secure the deployment environment.
- Configure a scheduled Supabase Edge Function or equivalent job to remove
  expired rows and files when retention requirements require it.

## Limitations

- OCR quality depends on image sharpness, lighting, orientation, and document
  layout.
- The application is an assistive review tool, not an identity-verification
  or document-authenticity service.
- Only English OCR data is loaded by default.
- There is no automated test suite configured yet; use `npm run build` as the
  baseline validation command.

## License

No license has been specified yet. Add a license before publishing this
project for reuse.
