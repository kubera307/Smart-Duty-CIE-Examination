# Smart Duty CIE Examination System

> **Intelligent Examination Duty Allocation & Workload Equity Management Platform**  
> *Developed for Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)*  
> *Malnad College of Engineering, Hassan (Autonomous Institution affiliated to VTU, Belagavi)*

---

## 📌 Overview

The **Smart Duty CIE Examination System** is a full-stack, enterprise-grade academic platform designed to automate and optimize examination duty scheduling for Continuous Internal Evaluation (CIE) cycles. 

Scheduling examination invigilation across multiple semesters and exam cycles is traditionally prone to timetable clashes, unfair workload distribution, buffer-time violations around teaching hours, and tedious manual paperwork. This system replaces manual scheduling with a **rule-based, conflict-aware allocation engine** and an **automated institutional reporting pipeline**.

---

## ✨ Key Features

### 🧠 1. Intelligent Automated Allocation Engine
* **Timetable Conflict Avoidance**: Prevents scheduling faculty during their scheduled teaching lectures (e.g., protected 3rd semester class timetables).
* **Pre/Post Class Buffer Rules**: Enforces configurable buffer windows (default: 60 minutes) before and after lectures to prevent rushing between classes and exam halls.
* **Workload Equity & Quotas**: Dynamically allocates duties based on faculty designation, experience, and custom quota limits (e.g., natural quota syntax: `swathi-1, ankitha-3, sushma-4`).
* **Role Specialization (Invigilation vs. Squad Duty)**: Dedicated allocation of senior faculty / HOD to roving squad duties while distributing room invigilations among teaching staff.
* **Leave & Unavailability Checks**: Automatically blocks dates and time windows marked as official leave or institutional absence.

### 👥 2. Faculty Directory & Profile Management
* **Comprehensive Faculty Profiles**: Tracks Employee ID, designation, department, contact details, experience, teaching semesters, and max duty capacities.
* **Duty History & Upcoming Duties**: Explicit display of **CIE cycle** (e.g., `CIE-I`, `CIE-II`, `CIE-III`) and **Semester** (e.g., `III Semester`, `V Semester`) badges on every duty card with exact room and time metadata.
* **Duty Eligibility & Active Toggles**: Exclude or include staff from automated cycles with a single switch.

### 📅 3. Multi-Cycle CIE & Timetable Management
* **Flexible CIE Cycles**: Configured for Odd & Even semesters across multiple academic years (`2026-2027`, `2027-2028`).
* **Multi-Semester Exam Scheduling**: Support for concurrent examination tracks (III, V, and VII semesters) with room allocations, time windows, and student count ranges.
* **Regular Class Timetable Integration**: Weekly schedule mapping (Monday through Saturday) to validate availability.

### 📄 4. Institutional Circulars & Report Generation
* **Official 3-Page Circular Generation (PDF)**:
  * **Page 1**: Official institutional exam notification with Malnad College of Engineering crest, AI & ML department insignia, dates, sessions, general instructions, and signatories (HOD & Principal).
  * **Page 2**: Squad Duty Schedule featuring designated squad faculty, room coverage grids, and timing bands.
  * **Page 3**: Full Invigilation Duty Chart with active faculty directory filtering, date-wise assignments, room numbers, and signature columns.
* **Dynamic Table Layouts & Page Budgeting**: Automatic vertical scaling, cell padding adjustment, and footer placement.
* **Excel & CSV Exporting**: Export schedules and duty records for administrative archiving.

### 🔐 5. Role-Based Portals
* **Admin Portal**: Full control over allocation algorithms, manual overrides with real-time conflict checking, faculty quotas, timetable modifications, and audit logs.
* **Faculty Self-Service Portal**: Individual staff login to view scheduled upcoming duties, archived completed duties, mark duties as done (`✓ Done`), and register planned leaves.

### 📊 6. Analytics & Conflict Diagnostic Center
* **Equity & Workload Analytics**: Visual workload distribution charts (powered by Recharts), duty type ratios, and CIE completion progress.
* **Conflict Diagnostic Center**: Real-time identification of potential double-bookings, buffer violations, or capacity overflow.
* **Full Audit Trail**: Complete logging of all system events, manual overrides, quota updates, and duty completions.

---

## 🛠️ Tech Stack

### Frontend
| Technology | Description |
|---|---|
| **React 18** | Modern component-based user interface |
| **Vite 6** | Ultra-fast frontend build tool and dev server |
| **Tailwind CSS** | Clean, responsive institutional design system |
| **Lucide React** | Clean, accessible iconography |
| **Recharts** | Interactive charts for workload equity analytics |
| **React Router v6** | Client-side routing for admin and faculty portals |
| **Axios** | HTTP client for backend REST API interaction |

### Backend
| Technology | Description |
|---|---|
| **Python 3.10+** | Core backend language |
| **Flask 3.0+** | Lightweight, robust RESTful API framework |
| **SQLAlchemy / SQLite** | Relational database ORM with SQLite backend |
| **ReportLab** | High-precision PDF rendering engine for official circulars |
| **openpyxl** | Excel file generation and timetable parsing |
| **Pillow (PIL)** | High-resolution image processing for institutional crests |
| **Werkzeug** | Cryptographic password hashing and security utilities |

---

## 📁 Project Structure

```text
Smart Duty CIE Examination/
├── run.bat                          # 1-Click launcher for Windows (Backend + Frontend)
├── backend/
│   ├── app.py                       # Flask application entry point & route registration
│   ├── config.py                    # Environment & application configuration
│   ├── requirements.txt             # Python dependencies
│   ├── cie_exam_system.db           # SQLite database
│   ├── mce_crest.png                # Official Malnad College of Engineering Crest
│   ├── aiml_logo.png                # Department of CSE (AI & ML) Insignia
│   ├── models/                      # SQLAlchemy Database Models
│   │   ├── __init__.py
│   │   ├── academic.py              # AcademicYear, Semester, Subject, TimetableEntry
│   │   ├── exam.py                  # CIE, ExamSession, ExamRoom, Duty, DutySwapRequest
│   │   ├── faculty.py               # Faculty, FacultyAvailability
│   │   ├── allocation_log.py        # AllocationRun, AllocationExplanation
│   │   └── system.py                # AuditLog, SystemSettings
│   ├── allocation/                  # Intelligent Allocation Engine
│   │   ├── buffer_rules.py          # Class & exam buffer evaluation (60-min window)
│   │   ├── timetable_conflicts.py   # Lecture clash detection
│   │   ├── eligibility.py           # Faculty availability & eligibility filter
│   │   ├── candidate_evaluator.py   # Equity & quota scoring heuristics
│   │   ├── engine.py                # Core allocation pipeline
│   │   └── validator.py             # Integrity and constraint validator
│   ├── services/                    # Business Logic & Document Services
│   │   ├── report_service.py        # 3-Page official PDF circular generator
│   │   ├── seed_service.py          # Database seeding service
│   │   └── timetable_ocr_service.py # OCR parsing utilities
│   └── routes/                      # Flask REST API Blueprints
│       ├── auth_routes.py           # Authentication & role tokens
│       ├── faculty_routes.py        # Faculty CRUD, quotas & profile details
│       ├── academic_routes.py       # Semesters, subjects & timetables
│       ├── cie_routes.py            # CIE cycles, exam sessions & rooms
│       ├── allocation_routes.py     # Allocation triggers, overrides & swaps
│       ├── report_routes.py         # PDF and Excel downloads
│       ├── analytics_routes.py      # Workload metrics & completion rates
│       ├── conflict_routes.py       # Conflict detection
│       └── audit_routes.py          # Audit trail logs
├── frontend/
│   ├── package.json                 # Node dependencies and scripts
│   ├── vite.config.js               # Vite build configuration
│   ├── tailwind.config.js           # Tailwind CSS theme & layout tokens
│   ├── src/
│   │   ├── main.jsx                 # React root mount
│   │   ├── App.jsx                  # Application routing & layout guards
│   │   ├── pages/                   # Application Views
│   │   │   ├── Dashboard.jsx        # Admin command center & live metrics
│   │   │   ├── FacultyDirectory.jsx # Staff directory & quota management
│   │   │   ├── StaffProfile.jsx     # Individual faculty profile with CIE/Sem badges
│   │   │   ├── CIEManagement.jsx    # Exam cycle & session configuration
│   │   │   ├── ExamSchedule.jsx     # Master exam schedule & room viewer
│   │   │   ├── GenerateAllocation.jsx # Allocation execution dashboard
│   │   │   ├── AllocationResults.jsx# Duty assignment table & manual overrides
│   │   │   ├── Timetables.jsx       # Departmental class timetables
│   │   │   ├── Reports.jsx          # Official Circulars & Report Download Hub
│   │   │   ├── Analytics.jsx        # Workload equity & statistics
│   │   │   ├── ConflictCenter.jsx   # Real-time conflict diagnostics
│   │   │   ├── Settings.jsx         # Academic year & system parameters
│   │   │   ├── Login.jsx            # Admin login
│   │   │   ├── StaffLogin.jsx       # Faculty login
│   │   │   └── StaffPortal.jsx      # Dedicated Faculty Self-Service Portal
│   │   ├── components/              # Shared UI components (Modals, Badges, Tables)
│   │   └── services/                # Axios API communication services
└── tests/                           # System & integration verification suites
    ├── sample_outputs/              # Generated test circulars & verification PDFs
    ├── test_allocation_scenarios.py
    └── verify_cie_system.py
```

---

## 🚀 Getting Started

### Prerequisites
* **Python**: `3.10` or higher (`3.12` recommended)
* **Node.js**: `18.x` or higher
* **npm**: `9.x` or higher

---

### Option A: One-Click Startup (Windows)

A unified batch script is provided in the root directory:

```cmd
run.bat
```

This will automatically:
1. Launch the **Flask Backend** on `http://127.0.0.1:5000` (or configured port).
2. Launch the **Vite Frontend** on `http://localhost:5175` or `http://localhost:5176`.
3. Auto-seed the database on initial startup if not already initialized.

---

### Option B: Manual Setup

#### 1. Backend Setup

```bash
# Navigate to the project root
cd "Smart Duty CIE Examination"

# (Optional) Create and activate a Python virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install required dependencies
pip install -r backend/requirements.txt

# Start the Flask API server
python backend/app.py
```
> The API server will start on `http://127.0.0.1:5000` with the SQLite database auto-initialized.

#### 2. Frontend Setup

```bash
# Open a new terminal and navigate to the frontend directory
cd "Smart Duty CIE Examination/frontend"

# Install frontend dependencies
npm install

# Start the Vite development server
npm run dev
```
> Open your browser and navigate to the printed URL (typically `http://localhost:5175` or `http://localhost:5176`).

---

## 🔑 Default Credentials

For local development and testing, default roles are pre-configured:

| Role | Username / Identifier | Password | Access Portal |
|---|---|---|---|
| **Administrator** | `admin` | *(Default dev hash)* | `/login` |
| **Faculty Member** | Faculty Name or Login ID *(e.g., `Dr. Swathi H Y`)* | `staff123` | `/staff-login` |

---

## 📡 Core API Endpoints

### 🔐 Authentication (`/api/auth`)
* `POST /api/auth/login` — Administrator authentication
* `POST /api/auth/staff-login` — Faculty portal authentication
* `GET /api/auth/me` — Verify active session

### 👥 Faculty & Quotas (`/api/faculty`)
* `GET /api/faculty` — List all faculty members with current workload
* `POST /api/faculty` — Add a new faculty member
* `GET /api/faculty/<id>/profile` — Detailed profile with upcoming & historical duties
* `PUT /api/faculty/<id>` — Update faculty details or duty eligibility
* `GET /api/faculty/duty-quotas` — View current configured duty quotas
* `POST /api/faculty/duty-quotas/save` — Save quota rules (e.g., `swathi-1, sushma-4`)
* `POST /api/faculty/<id>/unavailability` — Record leave or unavailable time window

### 📅 CIE Cycles & Sessions (`/api/cie`)
* `GET /api/cie` — List all CIE examination cycles (CIE-I, CIE-II, CIE-III)
* `POST /api/cie` — Create or update a CIE cycle
* `GET /api/cie/<id>/sessions` — Fetch sessions, courses, rooms, and assigned staff

### ⚙️ Duty Allocation (`/api/allocation`)
* `POST /api/allocation/generate` — Execute the automated allocation engine
* `POST /api/allocation/override` — Manually override a duty assignment with conflict check
* `PUT /api/allocation/duties/<id>/status` — Update duty status (`ASSIGNED`, `COMPLETED`, `CANCELLED`)

### 📑 Reports & Circulars (`/api/reports`)
* `GET /api/reports/cie/<cie_id>/circular` — Download official 3-page Institutional PDF Circular
* `GET /api/reports/cie/<cie_id>/invigilation-chart` — Download Invigilation Chart (PDF)
* `GET /api/reports/cie/<cie_id>/squad-roster` — Download Squad Duty Roster (PDF)
* `GET /api/reports/cie/<cie_id>/export/excel` — Export complete schedule as Excel (`.xlsx`)

### 📈 Analytics & Conflicts (`/api/analytics`, `/api/conflicts`)
* `GET /api/analytics/summary` — High-level KPI metrics and workload distributions
* `GET /api/conflicts/check` — Execute diagnostic checks for timetable and buffer collisions

---

## ⚙️ Configuration & Environment

Configuration settings can be adjusted in [backend/config.py](file:///backend/config.py) or via environment variables:

| Variable | Default Value | Description |
|---|---|---|
| `PORT` | `5000` | Port for the Flask backend service |
| `DATABASE_URL` | `sqlite:///cie_exam_system.db` | Database connection string |
| `BUFFER_MINUTES` | `60` | Minimum gap required between lectures and exam duties |
| `MAX_DUTY_CAPACITY` | `15` | Default maximum duties assigned per faculty |
| `DEFAULT_ACADEMIC_YEAR` | `2026-2027` | Active default academic cycle |
| `DEFAULT_DEPARTMENT` | `Computer Science & Engineering (AI & ML)` | Institutional department name |

---

## 🏛️ Institutional Accreditation & Notice

This project was built to adhere strictly to the examination regulatory requirements of:
* **Malnad College of Engineering, Hassan** (Autonomous Institution)
* Affiliated to **Visvesvaraya Technological University (VTU), Belagavi**
* Accredited by **National Board of Accreditation (NBA)** & **NAAC**

---

## 📄 License

This software is developed for internal academic administration at Malnad College of Engineering. All rights reserved.
