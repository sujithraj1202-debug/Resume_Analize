# 🎓 Student Career & Resume AI Agent

An AI-powered web application built with **HTML5, Modern CSS (Glassmorphism), Vanilla JavaScript, Node.js (Express), and OpenRouter API**. 

The agent processes student profiles and resumes (PDF, DOCX, TXT, or pasted text) to extract key information, recommend top 5 career role fits, perform custom job fit checks, conduct side-by-side Job Description (JD) gap analysis, and generate ethical resume improvements without inventing false credentials.

---

## 🌟 Key Features

1. **Profile Upload & AI Parser**
   - Upload PDF, DOCX, or TXT resume files, or paste direct text.
   - Includes a **1-Click Demo Profile** featuring a realistic Computer Science student profile for rapid testing.
   - Extracts technical skills, soft skills, education, projects, work experience, certifications, strengths, and areas for growth.

2. **Top 5 Career Fit Engine**
   - Analyzes student profile against technical job markets.
   - Recommends the student's top 5 best-fit job roles with match percentages (0-100%).
   - Displays possessed matching skills, missing skills, and actionable learning steps.

3. **Job Role Checker**
   - Allows students to test any target role (e.g., `Data Analyst`, `Full Stack Developer`, `Cloud Engineer`, `AI/ML Engineer`).
   - Categorizes fit into **Strong Fit**, **Moderate Fit**, **Needs Improvement**, or **Poor Fit**.
   - Provides detailed rationale, missing skills, and a step-by-step preparation roadmap.

4. **Job Description (JD) Analyzer**
   - Paste any target Job Description (or insert the built-in sample Data Analyst JD).
   - Side-by-side gap comparison showing overall match %, ATS compatibility index, matching skills, missing skills, missing keywords, experience gaps, and exact resume updates required.

5. **Resume Improvement Engine**
   - Generates tailored suggestions for professional headlines, summary statements, project bullet points (using Action Verb + Impact format), and experience bullets.
   - **Ethical AI Guarantee**: Uses strictly the candidate's verified data — never invents fake experience, skills, or certifications.

---

## 🏗️ AI Workflow Flowchart

```
Upload Profile/Resume ➔ AI Extraction ➔ Find Top 5 Roles ➔ Check Job Fit ➔ Compare JD ➔ Improve Resume
```

---

## 📁 Project Structure

```
AGENT/
├── index.html          # Responsive Single-Page Application (HTML + CSS + Vanilla JS)
├── server.js           # Express backend server & OpenRouter API gateway
├── package.json        # Node.js dependencies & scripts
├── vercel.json         # Vercel deployment configuration
├── .env                # Local environment secrets (OPENROUTER_API_KEY)
├── .env.example        # Environment variable template
├── .gitignore          # Ignores node_modules, secrets, log files
└── README.md           # Documentation & deployment guide
```

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
- Node.js (v18 or higher recommended)
- npm

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory (or use `.env.example` as reference):
```env
PORT=3000
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

### 4. Start the Application
```bash
npm start
```
Open your browser and navigate to: `http://localhost:3000`

---

## ☁️ Deploying to Vercel

1. Push your repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Student Career & Resume Agent"
   git remote add origin https://github.com/your-username/student-career-agent.git
   git push -u origin main
   ```
2. Log in to [Vercel](https://vercel.com) and click **Add New Project**.
3. Import your GitHub repository.
4. Add the Environment Variable in Vercel project settings:
   - Key: `OPENROUTER_API_KEY`
   - Value: `your_openrouter_api_key`
5. Click **Deploy**. Vercel will automatically detect `vercel.json` and deploy your app.

---

## 🛡️ Security & Privacy
- Your `OPENROUTER_API_KEY` is securely stored in `.env` on the backend (`server.js`).
- Frontend code calls local API endpoints (`/api/*`) and NEVER exposes the API key to the client browser.

---

## 📄 License
MIT License
