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
NVIDIA_NIM_MODEL=nvidia/llama-3.1-nemotron-70b-instruct
```

### 4. Database Setup

Execute the SQL migration located in `supabase/migrations/001_initial_schema.sql` in your Supabase SQL editor.

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
