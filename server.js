const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Configure multer for memory storage file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Helper function to query OpenRouter API with fallbacks
async function queryOpenRouter(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured in .env file.');
  }

  const primaryModel = process.env.OPENROUTER_MODEL || 'liquid/lfm-2.5-2.6b:free';
  const fallbackModels = [
    'google/gemma-4-31b-it:free',
    'liquid/lfm-2.5-2.6b:free',
    'nvidia/nemotron-3.5-lightning:free',
    'openai/gpt-oss-20b:free'
  ];

  const modelsToTry = [primaryModel, ...fallbackModels.filter(m => m !== primaryModel)];

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      console.log(`[OpenRouter] Sending request using model: ${model}`);
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://student-career-agent.vercel.app',
            'X-Title': 'Student Career & Resume Agent',
            'Content-Type': 'application/json'
          },
          timeout: 45000
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (content) {
        return parseJsonResponse(content);
      }
    } catch (err) {
      console.warn(`[OpenRouter Warning] Model ${model} failed:`, err.response?.data || err.message);
      lastError = err;
      // If unauthorized (invalid key), do not attempt fallbacks
      if (err.response?.status === 401) {
        throw new Error('Invalid OpenRouter API key. Please check your OPENROUTER_API_KEY in .env');
      }
    }
  }

  throw new Error(`OpenRouter API request failed: ${lastError?.response?.data?.error?.message || lastError?.message || 'Unknown error'}`);
}

// Robust JSON extraction helper
function parseJsonResponse(rawText) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
  }
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse AI response as valid JSON.');
  }
}

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

// 1. Profile Upload & AI Extract Endpoint
app.post('/api/parse-profile', upload.single('resumeFile'), async (req, res) => {
  try {
    let extractedText = '';

    if (req.file) {
      const mimeType = req.file.mimetype;
      const fileName = req.file.originalname.toLowerCase();

      if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
        const pdfData = await pdfParse(req.file.buffer);
        extractedText = pdfData.text;
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileName.endsWith('.docx')
      ) {
        const docxResult = await mammoth.extractRawText({ buffer: req.file.buffer });
        extractedText = docxResult.value;
      } else if (mimeType === 'text/plain' || fileName.endsWith('.txt')) {
        extractedText = req.file.buffer.toString('utf-8');
      } else {
        return res.status(400).json({ error: 'Unsupported file format. Please upload PDF, DOCX, or TXT.' });
      }
    } else if (req.body.profileText && req.body.profileText.trim().length > 0) {
      extractedText = req.body.profileText.trim();
    } else {
      return res.status(400).json({ error: 'Please provide either a resume file or paste profile text.' });
    }

    if (!extractedText || extractedText.trim().length < 20) {
      return res.status(400).json({ error: 'Extracted text is empty or too short to analyze.' });
    }

    const systemPrompt = `You are an expert AI Resume & Career Profile Parser. Parse the provided resume text into a clean JSON structure.
Format strictly as JSON with this schema:
{
  "name": "Candidate Name or Student Profile",
  "summary": "Professional summary statement",
  "skills": {
    "technical": ["Skill1", "Skill2"],
    "soft": ["Skill1", "Skill2"]
  },
  "education": [
    { "degree": "Degree Name", "institution": "School/University", "year": "Graduation Year/Status", "details": "GPA, Coursework" }
  ],
  "projects": [
    { "title": "Project Name", "description": "Brief description", "techStack": ["Tech1", "Tech2"], "highlights": ["Key result or achievement"] }
  ],
  "certifications": ["Cert 1", "Cert 2"],
  "experience": [
    { "role": "Job Title", "company": "Company Name", "duration": "Dates", "description": "Brief description", "highlights": ["Highlight 1"] }
  ],
  "strengths": ["Strength 1", "Strength 2"],
  "weaknesses": ["Area for growth 1", "Area for growth 2"]
}`;

    const userPrompt = `Here is the student's resume/profile text:\n\n${extractedText}`;

    const parsedData = await queryOpenRouter(systemPrompt, userPrompt);
    res.json({ success: true, rawText: extractedText, data: parsedData });
  } catch (error) {
    console.error('Error in /api/parse-profile:', error);
    res.status(500).json({ error: error.message || 'Failed to process resume profile.' });
  }
});

// 2. Career Fit Endpoint (Top 5 Best-Fit Roles)
app.post('/api/career-fit', async (req, res) => {
  try {
    const { profile } = req.body;
    if (!profile) {
      return res.status(400).json({ error: 'Profile data is required.' });
    }

    const systemPrompt = `You are an elite Student Career Counselor & Tech Industry Recruiter.
Analyze the student's profile and recommend their TOP 5 BEST-FIT job roles.
Return strictly JSON with this schema:
{
  "topRoles": [
    {
      "rank": 1,
      "roleTitle": "Exact Job Title",
      "matchPercentage": 85,
      "reasoning": "Why this role aligns with their skills and background",
      "matchingSkills": ["Skill1", "Skill2"],
      "missingSkills": ["Skill3", "Skill4"],
      "whatToLearn": ["Course or topic to learn 1", "Actionable step 2"]
    }
  ]
}`;

    const userPrompt = `Student Profile JSON:\n${JSON.stringify(profile, null, 2)}`;

    const result = await queryOpenRouter(systemPrompt, userPrompt);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error in /api/career-fit:', error);
    res.status(500).json({ error: error.message || 'Failed to evaluate career fit.' });
  }
});

// 3. Job Role Checker Endpoint
app.post('/api/check-role', async (req, res) => {
  try {
    const { profile, targetRole } = req.body;
    if (!profile || !targetRole) {
      return res.status(400).json({ error: 'Both profile data and targetRole are required.' });
    }

    const systemPrompt = `You are a Technical Hiring Manager evaluating candidate fit for a specific target role.
Assess whether the student is a Strong Fit, Moderate Fit, Needs Improvement, or Poor Fit.
Return strictly JSON with this schema:
{
  "targetRole": "${targetRole}",
  "fitCategory": "Strong Fit" | "Moderate Fit" | "Needs Improvement" | "Poor Fit",
  "matchPercentage": 75,
  "explanation": "Detailed explanation of why they fell into this fit category",
  "matchingSkills": ["Skill1", "Skill2"],
  "missingSkills": ["Skill3", "Skill4"],
  "actionableRoadmap": [
    "Step 1: Focus on ...",
    "Step 2: Build project using ...",
    "Step 3: Gain certification in ..."
  ]
}`;

    const userPrompt = `Target Role: ${targetRole}\n\nStudent Profile JSON:\n${JSON.stringify(profile, null, 2)}`;

    const result = await queryOpenRouter(systemPrompt, userPrompt);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error in /api/check-role:', error);
    res.status(500).json({ error: error.message || 'Failed to check job role fit.' });
  }
});

// 4. Job Description (JD) Analyzer Endpoint
app.post('/api/analyze-jd', async (req, res) => {
  try {
    const { profile, jobDescription } = req.body;
    if (!profile || !jobDescription) {
      return res.status(400).json({ error: 'Both profile data and jobDescription are required.' });
    }

    const systemPrompt = `You are an ATS (Applicant Tracking System) & Resume Optimization Expert.
Compare the student's profile against the target Job Description (JD).
Return strictly JSON with this schema:
{
  "matchPercentage": 80,
  "atsCompatibilityIndex": 85,
  "matchingSkills": ["Skill1", "Skill2"],
  "missingSkills": ["Skill3", "Skill4"],
  "missingKeywords": ["Keyword1", "Keyword2"],
  "experienceGaps": ["Gap description 1", "Gap description 2"],
  "resumeUpdateSuggestions": [
    "Add keyword X to summary",
    "Highlight experience with Y in project Z"
  ]
}`;

    const userPrompt = `Job Description:\n${jobDescription}\n\nStudent Profile JSON:\n${JSON.stringify(profile, null, 2)}`;

    const result = await queryOpenRouter(systemPrompt, userPrompt);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error in /api/analyze-jd:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze Job Description.' });
  }
});

// 5. Resume Improvement Endpoint
app.post('/api/improve-resume', async (req, res) => {
  try {
    const { profile } = req.body;
    if (!profile) {
      return res.status(400).json({ error: 'Profile data is required.' });
    }

    const systemPrompt = `You are a professional Executive Resume Writer.
Suggest actionable improvements for headline, summary, skills formatting, projects, and experience.
CRITICAL RULE: NEVER invent fake skills, experience, certifications, or achievements. Suggest rewrites based ONLY on existing facts provided in the student's profile.

Return strictly JSON with this schema:
{
  "headline": {
    "current": "Current headline or extracted title",
    "suggested": "Compelling, impact-driven headline"
  },
  "summary": {
    "current": "Current summary",
    "suggested": "Elevated summary featuring core competencies and metrics"
  },
  "skillsOptimization": [
    "Group technical skills into Frontend, Backend, Databases",
    "Move soft skills to a dedicated Highlights bullet"
  ],
  "projectsImprovement": [
    {
      "projectTitle": "Title",
      "originalDescription": "Original text",
      "improvedBullets": [
        "Architected X using Y, achieving Z metric",
        "Implemented A to optimize B"
      ]
    }
  ],
  "experienceImprovement": [
    {
      "role": "Role Title",
      "company": "Company Name",
      "improvedBullets": [
        "Spearheaded X project...",
        "Streamlined workflow by Y%..."
      ]
    }
  ],
  "generalTips": [
    "Quantify results wherever possible",
    "Use strong active verbs at the beginning of each bullet point"
  ]
}`;

    const userPrompt = `Student Profile JSON:\n${JSON.stringify(profile, null, 2)}`;

    const result = await queryOpenRouter(systemPrompt, userPrompt);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error in /api/improve-resume:', error);
    res.status(500).json({ error: error.message || 'Failed to generate resume improvements.' });
  }
});

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// For Vercel deployment: export express app
module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Student Career & Resume Agent backend running!`);
    console.log(`🌐 Server available at: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}
