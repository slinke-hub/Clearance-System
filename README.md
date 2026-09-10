# 🇸🇦 ClearanceIQ — KSA Customs & ZATCA Clearance Compliance System

A production-ready web application designed specifically for **Saudi Arabia (KSA) Import/Export Customs Compliance**. The application parses commercial invoices in Excel format and enriches itemized line items with live, accurate **ZATCA (Zakat, Tax and Customs Authority)** & KSA Customs HS-Code classifications.

---

## ✨ Features

- **📊 Excel Invoice Ingestion:** Fast, schema-flexible parsing supporting standard commercial invoices, packing lists, and custom formats.
- **🔄 Intelligent Column Mapping:** Auto-detects invoice columns (`item_name`, `description`, `quantity`, `unit_price`, `currency`, etc.) with customizable user mappings.
- **🤖 AI Classification Engine:** Automated classification against the official KSA Integrated Customs Tariff with 12-digit HS Codes, Customs Duty (CDF) rates, and regulatory compliance flags (CITES, SFDA, SASO Saber, Energy Efficiency).
- **🌐 Bilingual Arabic & English UI:** Full RTL (Right-to-Left) and LTR layout support with instant language switching.
- **📋 Interactive Verification Grid:** Real-time editable classification table with confidence score indicators, manual HS Code overrides, and validation.
- **📥 One-Click Enriched Export:** Re-exports the original invoice with structured ZATCA compliance columns, custom duty breakdowns, and declaration metadata.
- **🔐 Secure Authentication & Storage:** Integrated with Supabase Auth, PostgreSQL schema with Row-Level Security (RLS), and audit logging.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router, React 19, TypeScript)
- **Styling:** Tailwind CSS v4, Lucide Icons, Glassmorphism UI
- **Database & Auth:** Supabase (PostgreSQL, SSR Auth, RLS)
- **Spreadsheet Processing:** SheetJS (`xlsx`)
- **AI Classification:** OpenAI API / NVIDIA NIM API (`llama-3.1-nemotron-70b-instruct`)
- **State & Form Handling:** Zustand, React Dropzone, Sonner Notifications

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/slinke-hub/Clearance-System.git
cd Clearance-System
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your configuration:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

NVIDIA_NIM_API_KEY=your-api-key
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_NIM_MODEL=moonshotai/kimi-k3
```

### 4. Database Setup

Apply the SQL files in `supabase/migrations` in order. Existing installations must apply `004_formatted_invoices.sql` before using formatted invoice imports. This adds invoice metadata, source rows, item codes, units, review timestamps, an atomic review-save function, and owner-scoped classification write policies.

The upload workflow supports ordinary header-first tables and the commercial invoice layout with `Seq.`, `Cust_Item_No.`, `Description`, `Quantity`, `Unit Price`, and `Amount` headings. It preserves continuation descriptions, skips repeated page headings, and separates charges from products. Review every item, resolve reconciliation errors, then save/export or classify in batches of five. AI classification requires the configured NVIDIA endpoint; importing and exporting reviewed items does not.

`npm test` runs parser and API workflow tests with a mocked classifier. To include a private invoice without copying it into the repository, set `INVOICE_SAMPLE` to its path before running the tests. The sample regression expects CN07-210: 89 lines, 4,865 PCS, 30 SETS, USD 32,113.40 goods and USD 42,136.40 total. Tests do not send the invoice to AI or the live database.

Without a configured Supabase connection, invoice data is temporary and is lost when the server restarts. With Supabase configured, storage failures are reported instead of silently falling back to temporary storage. The live database migration and real AI responses need separate deployment verification.

### Official tariff lookup

Classification now searches the live ZATCA tariff service behind the supplied Integrated Customs Tariff Inquiry page. AI proposes an HS search prefix and matches the product to the returned official candidates; it does not supply duty rates or regulatory flags. Final codes must be 12 digits, matching ZATCA's integrated tariff guidance effective January 1, 2025. Source guidance: https://www.zatca.gov.sa/en/RulesRegulations/Taxes/Pages/Integrated-Tarrifs.aspx (checked September 9, 2026).

The results and Excel export include `HS CODES`, `CUSTOMS DUTY FEES`, and `REGULATED / NON-REGULATED`. Duty is the published percentage, not a payable amount. Specific/minimum duties, ambiguous effective records, missing specifications, unavailable lookups, and uncertain matches require review. For this output, REGULATED means ZATCA reports a restriction, import prohibition, or required procedure; NON-REGULATED requires an allowed import status, an explicit zero restriction status, and an empty procedures list. Original import status and procedure text are retained, so a prohibition is not treated as an ordinary permit requirement.

Each result saves the official record, source URL, retrieval time and effective date in the existing `raw_ai_response` field. Export includes a `Tariff Sources` worksheet. Historical AI-only results without official evidence show `REVIEW REQUIRED` in the three tariff columns and should be reclassified. No additional schema migration is needed beyond migration 004.

The public portal's endpoint is not a versioned integration contract. Its public request header is read from the portal's published script and cached for one hour; tariff responses are fetched fresh. If the interface changes, the system reports review required rather than substituting estimated rates. Set `LIVE_ZATCA_TEST=1` to run the optional official HS-prefix lookup test. Fixtures and ordinary tests use public sample records or synthetic data, not live invoice submissions.

### 5. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

```
├── app/
│   ├── (dashboard)/        # Protected dashboard & upload pages
│   ├── api/
│   │   ├── classify/       # AI HS-Code classification endpoint
│   │   ├── export/         # Excel enrichment & download endpoint
│   │   └── invoices/upload # File upload and parsing endpoint
│   ├── auth/               # Supabase auth callback
│   ├── login/              # Sign in page
│   ├── register/           # Registration page
│   ├── globals.css         # Design system & glassmorphic tokens
│   └── page.tsx            # Landing page
├── components/             # Reusable UI components
├── lib/
│   ├── excel/              # Excel parser and exporter
│   ├── i18n/               # English & Arabic translations
│   ├── supabase/           # Client, Server, and Admin Supabase clients
│   └── zatca/              # ZATCA taxonomy and AI client
├── supabase/
│   └── migrations/         # PostgreSQL schema & RLS policies
└── types/                  # TypeScript interface definitions
```

---

## 📄 License

MIT License. Designed for KSA Customs compliance and ZATCA integration.
