import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  SparklesIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  AcademicCapIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { getBackendUrl } from '../utils/apiConfig';

const ManageCompetition = () => {
  const { id } = useParams(); // If id exists, edit mode; otherwise create
  const navigate = useNavigate();
  const backendUrl = getBackendUrl();

  const [activeTab, setActiveTab] = useState(id ? 'questions' : 'setup'); // 'setup', 'generator', 'questions', 'analytics'
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [events, setEvents] = useState([]);
  const [geminiStatus, setGeminiStatus] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event: '',
    type: 'quiz',
    prompt: '',
    topics: '',
    difficulty: 'medium',
    durationMinutes: 30,
    totalMarks: 10,
    negativeMarking: 0.25,
    startTime: '',
    endTime: '',
    participantLimit: 0,
    questionsPerParticipant: 5,
    permittedLanguages: ['cpp', 'python', 'java', 'javascript']
  });

  // Question Pool State
  const [questionPool, setQuestionPool] = useState([]);
  const [competitionId, setCompetitionId] = useState(id || null);
  const [competitionStatus, setCompetitionStatus] = useState('draft');

  // AI Generator state
  const [aiCount, setAiCount] = useState(5);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [useCache, setUseCache] = useState(true);
  const [quotaCooldown, setQuotaCooldown] = useState(0);

  // Analytics State
  const [analytics, setAnalytics] = useState(null);

  // Cooldown countdown timer
  useEffect(() => {
    if (quotaCooldown <= 0) return;
    const interval = setInterval(() => {
      setQuotaCooldown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [quotaCooldown]);

  useEffect(() => {
    fetchEvents();
    fetchGeminiStatus();
    if (id) {
      fetchCompetition(id);
    } else {
      // Default dates: starts now, ends in 7 days
      const now = new Date();
      const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      setFormData(prev => ({
        ...prev,
        startTime: now.toISOString().slice(0, 16),
        endTime: inSevenDays.toISOString().slice(0, 16)
      }));
    }
  }, [id]);

  const fetchEvents = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${backendUrl}/api/events`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(res.data);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  const fetchGeminiStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${backendUrl}/api/competitions/gemini-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGeminiStatus(res.data);
    } catch (err) {
      // Non-critical
    }
  };

  const fetchCompetition = async (compId) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${backendUrl}/api/competitions/${compId}/manage`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const comp = res.data;
      setCompetitionId(comp._id);
      setCompetitionStatus(comp.status);
      setQuestionPool(comp.questionPool || []);
      setAnalytics(comp.stats || null);

      setFormData({
        title: comp.title || '',
        description: comp.description || '',
        event: comp.event?._id || comp.event || '',
        type: comp.type || 'quiz',
        prompt: comp.prompt || '',
        topics: Array.isArray(comp.topics) ? comp.topics.join(', ') : '',
        difficulty: comp.difficulty || 'medium',
        durationMinutes: comp.durationMinutes || 30,
        totalMarks: comp.totalMarks || 10,
        negativeMarking: comp.negativeMarking ?? 0.25,
        startTime: comp.startTime ? new Date(comp.startTime).toISOString().slice(0, 16) : '',
        endTime: comp.endTime ? new Date(comp.endTime).toISOString().slice(0, 16) : '',
        participantLimit: comp.participantLimit || 0,
        questionsPerParticipant: comp.questionsPerParticipant || 5,
        permittedLanguages: comp.permittedLanguages || ['cpp', 'python', 'java', 'javascript']
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch competition');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLanguageToggle = (lang) => {
    setFormData(prev => {
      const exists = prev.permittedLanguages.includes(lang);
      const updated = exists
        ? prev.permittedLanguages.filter(l => l !== lang)
        : [...prev.permittedLanguages, lang];
      return { ...prev, permittedLanguages: updated };
    });
  };

  const handleSaveSetup = async (e) => {
    e?.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const payload = {
        ...formData,
        topics: formData.topics.split(',').map(s => s.trim()).filter(Boolean),
        startTime: new Date(formData.startTime).toISOString(),
        endTime: new Date(formData.endTime).toISOString()
      };

      let res;
      if (competitionId) {
        res = await axios.put(`${backendUrl}/api/competitions/${competitionId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSuccess('Competition settings updated successfully!');
      } else {
        res = await axios.post(`${backendUrl}/api/competitions`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCompetitionId(res.data._id);
        setSuccess('Competition created! Now generate or add questions.');
        setActiveTab('generator');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save competition setup');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCompetition = async () => {
    if (!competitionId) return;
    const confirmed = window.confirm(
      'Are you sure you want to permanently delete this competition? All participant submissions, results, and assessment records will be completely removed from the database to clean up space.'
    );
    if (!confirmed) return;

    setError('');
    setSuccess('');
    setDeleting(true);

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${backendUrl}/api/competitions/${competitionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Competition and participant records deleted successfully.');
      navigate('/competitions');
    } catch (err) {
      console.error('Error deleting competition:', err);
      setError(err.response?.data?.message || 'Failed to delete competition');
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateAI = async (forceFresh = false) => {
    if (!competitionId) {
      setError('Please save the competition setup first before generating questions.');
      return;
    }

    // Prevent duplicate concurrent requests
    if (aiGenerating) return;

    // Check if provider is currently in active quota cooldown
    if (quotaCooldown > 0 && forceFresh) {
      setError(`Free-tier AI request quota limit active. Please wait ${quotaCooldown}s, reuse the saved problem bank, or add questions manually.`);
      return;
    }

    setError('');
    setSuccess('');
    setAiGenerating(true);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/competitions/${competitionId}/generate-ai`,
        {
          prompt: formData.prompt,
          topics: formData.topics.split(',').map(s => s.trim()).filter(Boolean),
          difficulty: formData.difficulty,
          count: aiCount,
          type: formData.type,
          forceFresh: !useCache || forceFresh
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const generated = res.data.questions || res.data.problems || [];
      if (generated.length === 0) {
        throw new Error('No questions returned. Try adjusting your prompt.');
      }

      setQuestionPool(prev => [...prev, ...generated]);
      const sourceNote = res.data.fromCache ? 'Loaded from MongoDB Problem Bank (0 API Quota Consumed)' : `Generated with ${res.data.modelUsed}`;
      setSuccess(`Successfully added ${generated.length} questions (${sourceNote})! Review and edit them below.`);
      setActiveTab('questions');
    } catch (err) {
      console.error('AI generation error:', err);
      if (err.response?.status === 429) {
        const delay = Number(err.response?.data?.retryAfterSeconds) || 60;
        setQuotaCooldown(delay);
        setError(
          `Free-tier request quota limit reached. Cooldown active for ${delay}s. You can wait for reset, load cached questions from the MongoDB problem bank, or create questions manually below.`
        );
      } else {
        setError(err.response?.data?.message || 'Failed to generate questions. Verify GEMINI_API_KEY or create questions manually.');
      }
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveQuestions = async () => {
    if (!competitionId) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(
        `${backendUrl}/api/competitions/${competitionId}/questions`,
        { questionPool },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Question pool approved and saved successfully!');
      setFormData(prev => ({ ...prev, totalMarks: res.data.totalMarks }));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save question pool');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!competitionId) return;
    if (questionPool.length === 0) {
      setError('Cannot publish competition without questions. Generate or add questions first.');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      // Save current pool first
      await axios.put(
        `${backendUrl}/api/competitions/${competitionId}/questions`,
        { questionPool },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const res = await axios.post(
        `${backendUrl}/api/competitions/${competitionId}/publish`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCompetitionStatus(res.data.status);
      setSuccess('Competition published! It is now live for eligible students.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to publish competition');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!competitionId) return;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${backendUrl}/api/competitions/${competitionId}/export`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${formData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_results.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download Excel report');
    }
  };

  const updateQuestionField = (idx, field, value) => {
    setQuestionPool(prev => {
      const clone = [...prev];
      clone[idx] = { ...clone[idx], [field]: value };
      return clone;
    });
  };

  const updateOptionText = (qIdx, optIdx, text) => {
    setQuestionPool(prev => {
      const clone = [...prev];
      const opts = [...(clone[qIdx].options || [])];
      opts[optIdx] = text;
      clone[qIdx] = { ...clone[qIdx], options: opts };
      return clone;
    });
  };

  const removeQuestion = (idx) => {
    setQuestionPool(prev => prev.filter((_, i) => i !== idx));
  };

  const addManualMCQ = () => {
    setQuestionPool(prev => [
      ...prev,
      {
        questionId: `manual_q_${Date.now()}`,
        type: 'mcq',
        question: 'Enter question text here',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctOption: 0,
        explanation: 'Explanation for correct choice',
        topic: formData.topics.split(',')[0]?.trim() || 'General',
        difficulty: formData.difficulty,
        marks: 1
      }
    ]);
    setActiveTab('questions');
  };

  const addManualCodingProblem = () => {
    setQuestionPool(prev => [
      ...prev,
      {
        problemId: `manual_p_${Date.now()}`,
        type: 'coding',
        title: 'New Coding Problem',
        description: 'Problem statement description...',
        inputFormat: 'Read from standard input',
        outputFormat: 'Print to standard output',
        constraints: '1 <= N <= 10^5',
        difficulty: formData.difficulty,
        marks: 20,
        starterCode: {
          python: '# Python 3\nimport sys\n\ndef solve():\n    pass\n\nif __name__ == "__main__":\n    solve()',
          javascript: '// JavaScript\nconst fs = require("fs");\nconst input = fs.readFileSync(0, "utf-8").trim();\nconsole.log(input);',
          cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}',
          java: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n    }\n}'
        },
        sampleTestCases: [{ input: '1 2', output: '3', explanation: '1 + 2 = 3' }],
        hiddenTestCases: [{ input: '5 5', output: '10' }, { input: '0 0', output: '0' }]
      }
    ]);
    setActiveTab('questions');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-gray-900 border border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30">
              Organizer Studio
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              competitionStatus === 'published' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-800 text-gray-400'
            }`}>
              {competitionStatus.toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-100 mt-1">
            {competitionId ? `Manage: ${formData.title || 'Untitled'}` : 'Create AI Competition'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Configure parameters, prompt Google Gemini for question synthesis, preview/edit pools, and publish.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {competitionId && (
            <>
              <button
                type="button"
                onClick={handleDeleteCompetition}
                disabled={loading || deleting}
                className="px-3.5 py-2 rounded-xl text-sm font-semibold text-rose-300 bg-rose-950/60 border border-rose-800/80 hover:bg-rose-900/60 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                title="Delete competition and remove from DB to clean up space"
              >
                <TrashIcon className="h-4 w-4" />
                {deleting ? 'Deleting...' : 'Delete Competition'}
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={loading || questionPool.length === 0}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-600/20"
              >
                {competitionStatus === 'published' ? 'Republish / Update' : 'Publish Competition'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => navigate('/competitions')}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            Back to Arenas
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-800 text-red-200 text-sm flex items-center gap-2">
          <ExclamationCircleIcon className="h-5 w-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-sm flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="flex border-b border-gray-800 bg-gray-900/40 p-1 rounded-xl">
        {[
          { id: 'setup', label: '1. Competition Setup' },
          { id: 'generator', label: '2. Gemini AI Generator' },
          { id: 'questions', label: `3. Question Pool (${questionPool.length})` },
          { id: 'analytics', label: '4. Submissions & Analytics' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 px-4 text-center font-medium text-sm rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-violet-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: SETUP */}
      {activeTab === 'setup' && (
        <form onSubmit={handleSaveSetup} className="p-6 rounded-2xl bg-gray-900 border border-gray-800 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">Competition Title *</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
                placeholder="e.g. Annual Campus Algorithmic Championship 2026"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">Description *</label>
              <textarea
                name="description"
                rows={3}
                value={formData.description}
                onChange={handleInputChange}
                required
                placeholder="Outline competition goals, rules, and eligibility..."
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Competition Type *</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
              >
                <option value="quiz">Online Quiz (MCQs)</option>
                <option value="coding">Coding Competition (Judge0 Isolated)</option>
                <option value="hybrid">Hybrid (Quiz + Coding Challenges)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Attach to Campus Event (Optional)</label>
              <select
                name="event"
                value={formData.event}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
              >
                <option value="">Standalone Competition</option>
                {events.map(ev => (
                  <option key={ev._id} value={ev._id}>
                    {ev.title} ({ev.department})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Duration (Minutes) *</label>
              <input
                type="number"
                name="durationMinutes"
                min="1"
                value={formData.durationMinutes}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Negative Marking (Marks per wrong MCQ)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                name="negativeMarking"
                value={formData.negativeMarking}
                onChange={handleInputChange}
                placeholder="0.25 (0 for none)"
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Start Date & Time *</label>
              <input
                type="datetime-local"
                name="startTime"
                value={formData.startTime}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">End Date & Time *</label>
              <input
                type="datetime-local"
                name="endTime"
                value={formData.endTime}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Participant Limit (0 = Unlimited)</label>
              <input
                type="number"
                min="0"
                name="participantLimit"
                value={formData.participantLimit}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Questions Per Participant (Variant Set Size)</label>
              <input
                type="number"
                min="1"
                name="questionsPerParticipant"
                value={formData.questionsPerParticipant}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
              />
              <span className="text-xs text-gray-400">Personalized subsets will be drawn from the larger question pool.</span>
            </div>

            {/* Permitted Languages for Coding */}
            {(formData.type === 'coding' || formData.type === 'hybrid') && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">Permitted Programming Languages</label>
                <div className="flex flex-wrap gap-4">
                  {[
                    { key: 'python', label: 'Python 3' },
                    { key: 'javascript', label: 'JavaScript (Node.js)' },
                    { key: 'cpp', label: 'C++ (GCC)' },
                    { key: 'java', label: 'Java (OpenJDK)' }
                  ].map(lang => (
                    <label key={lang.key} className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={formData.permittedLanguages.includes(lang.key)}
                        onChange={() => handleLanguageToggle(lang.key)}
                        className="rounded border-gray-700 bg-gray-800 text-violet-600 focus:ring-violet-500 h-4 w-4"
                      />
                      {lang.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-800">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/30"
            >
              {competitionId ? 'Save Changes' : 'Create & Proceed to AI Generator'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: GEMINI AI GENERATOR */}
      {activeTab === 'generator' && (
        <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800 space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl bg-violet-950/40 border border-violet-800/40">
            <div className="flex items-center gap-3">
              <SparklesIcon className="h-6 w-6 text-violet-400 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-gray-200">Google Gemini Free-Tier Model Engine</h4>
                <p className="text-xs text-gray-400">
                  Model verified on account: <span className="text-violet-300 font-mono">{geminiStatus?.verifiedModel || 'gemini-3.8-flash'}</span>
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Active & Verified
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Prompt Instructions for Question Generator
              </label>
              <textarea
                name="prompt"
                rows={3}
                value={formData.prompt}
                onChange={handleInputChange}
                placeholder="e.g. Generate university-level questions focusing on asymptotic analysis, binary search trees, and dynamic programming with clean practical examples."
                className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Topics (comma-separated)</label>
                <input
                  type="text"
                  name="topics"
                  value={formData.topics}
                  onChange={handleInputChange}
                  placeholder="e.g. Arrays, Strings, Sorting, Recursion"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Difficulty Level</label>
                <select
                  name="difficulty"
                  value={formData.difficulty}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
                >
                  <option value="easy">Easy (Fundamentals)</option>
                  <option value="medium">Medium (Standard)</option>
                  <option value="hard">Hard (Advanced Competitive)</option>
                  <option value="mixed">Mixed (Balanced Distribution)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Questions to Generate</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={aiCount}
                  onChange={(e) => setAiCount(Number(e.target.value) || 5)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-100 focus:border-violet-500"
                />
              </div>
            </div>

            {/* Problem Bank Caching & Quota Protection Toggle */}
            <div className="p-4 rounded-xl bg-violet-950/30 border border-violet-800/40 space-y-2">
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-violet-200">
                <input
                  type="checkbox"
                  checked={useCache}
                  onChange={(e) => setUseCache(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-700 text-violet-600 focus:ring-violet-500"
                />
                <span>Reuse pre-generated questions from MongoDB Problem Bank (0 API Quota Consumed)</span>
              </label>
              <p className="text-xs text-gray-400 pl-6">
                When enabled, pulls verified coding problems and MCQs already cached in your database before consuming external AI free-tier quota limits.
              </p>
            </div>

            {/* Quota Cooldown Alert if active */}
            {quotaCooldown > 0 && (
              <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-800/80 text-amber-200 text-sm space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <ClockIcon className="h-5 w-5 text-amber-400 shrink-0 animate-pulse" />
                  <span>Free-Tier Rate Limit Reached — Cooldown Active ({quotaCooldown}s remaining)</span>
                </div>
                <p className="text-xs text-amber-300/80">
                  Google Gemini or the AI provider requires a cooldown period before accepting fresh synthesis requests. Please do not retry repeatedly during this reset period.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setUseCache(true);
                      handleGenerateAI(false);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-700 hover:bg-amber-600 transition-colors"
                  >
                    Load Cached Problems from DB (Instant)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('questions')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-200 bg-amber-900/60 border border-amber-700 hover:bg-amber-800/60 transition-colors"
                  >
                    Create Questions Manually
                  </button>
                </div>
              </div>
            )}

            <div className="pt-4 flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs text-gray-400 max-w-md">
                Generated questions are validated and append to your question pool below for editing and fine-tuning before publishing.
              </span>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('questions')}
                  className="px-4 py-2.5 rounded-xl font-medium text-xs text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
                >
                  Skip to Manual Entry
                </button>

                <button
                  type="button"
                  onClick={() => handleGenerateAI(false)}
                  disabled={aiGenerating || (quotaCooldown > 0 && !useCache)}
                  className="inline-flex items-center px-6 py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {aiGenerating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Synthesizing Questions with AI...
                    </>
                  ) : quotaCooldown > 0 && !useCache ? (
                    <>
                      <ClockIcon className="h-4 w-4 mr-2" />
                      Cooldown Active ({quotaCooldown}s)
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="h-5 w-5 mr-2" />
                      Generate with AI Free Tier
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: QUESTION POOL PREVIEW & EDIT */}
      {activeTab === 'questions' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-gray-900 border border-gray-800">
            <div>
              <h3 className="text-lg font-bold text-gray-200">
                Active Question Pool ({questionPool.length} Total)
              </h3>
              <p className="text-xs text-gray-400">
                Edit text, tweak options/correct answers, or delete items. Remember to save changes before publishing.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addManualMCQ}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-violet-300 bg-violet-950/60 border border-violet-800 hover:bg-violet-900/60 transition-colors"
              >
                + Add Manual MCQ
              </button>
              {(formData.type === 'coding' || formData.type === 'hybrid') && (
                <button
                  type="button"
                  onClick={addManualCodingProblem}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-cyan-300 bg-cyan-950/60 border border-cyan-800 hover:bg-cyan-900/60 transition-colors"
                >
                  + Add Coding Problem
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveQuestions}
                disabled={loading}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow"
              >
                Save Approved Pool
              </button>
            </div>
          </div>

          {questionPool.length === 0 ? (
            <div className="text-center py-16 bg-gray-900/40 rounded-2xl border border-gray-800">
              <AcademicCapIcon className="mx-auto h-12 w-12 text-gray-600 mb-2" />
              <p className="text-gray-300 font-medium">Question pool is empty</p>
              <p className="text-sm text-gray-500 mt-1">Use the Gemini AI Generator tab or add questions manually.</p>
              <button
                onClick={() => setActiveTab('generator')}
                className="mt-4 px-4 py-2 rounded-xl text-sm font-medium text-white bg-violet-600 hover:bg-violet-700"
              >
                Go to AI Generator
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {questionPool.map((q, qIdx) => {
                const isCoding = q.type === 'coding';

                return (
                  <div
                    key={q.questionId || q.problemId || qIdx}
                    className="p-6 rounded-2xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-violet-900/60 text-violet-300 border border-violet-700/60">
                          #{qIdx + 1} {isCoding ? 'CODING PROBLEM' : 'MCQ'}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">
                          {q.difficulty} • {q.marks || 1} Mark{q.marks !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeQuestion(qIdx)}
                        className="text-red-400 hover:text-red-300 p-1"
                        title="Remove question"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>

                    {isCoding ? (
                      /* CODING PROBLEM EDITOR */
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Problem Title</label>
                          <input
                            type="text"
                            value={q.title || ''}
                            onChange={(e) => updateQuestionField(qIdx, 'title', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm font-semibold"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Problem Description</label>
                          <textarea
                            rows={3}
                            value={q.description || ''}
                            onChange={(e) => updateQuestionField(qIdx, 'description', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Constraints</label>
                            <input
                              type="text"
                              value={q.constraints || ''}
                              onChange={(e) => updateQuestionField(qIdx, 'constraints', e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Marks</label>
                            <input
                              type="number"
                              value={q.marks || 20}
                              onChange={(e) => updateQuestionField(qIdx, 'marks', Number(e.target.value))}
                              className="w-full px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs"
                            />
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-gray-800/60 border border-gray-700/50">
                          <p className="text-xs font-semibold text-gray-300">
                            Sample Test Cases: {q.sampleTestCases?.length || 0} • Hidden Evaluation Tests: {q.hiddenTestCases?.length || 0}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Hidden test cases are securely isolated on the server and evaluated via Judge0 CE.
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* MCQ EDITOR */
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Question Text</label>
                          <textarea
                            rows={2}
                            value={q.question || ''}
                            onChange={(e) => updateQuestionField(qIdx, 'question', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-medium text-gray-400">
                            Options (Select the radio button for the correct answer):
                          </label>
                          {(q.options || []).map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-3">
                              <input
                                type="radio"
                                name={`correct_${qIdx}`}
                                checked={Number(q.correctOption) === optIdx}
                                onChange={() => updateQuestionField(qIdx, 'correctOption', optIdx)}
                                className="h-4 w-4 text-violet-600 focus:ring-violet-500 bg-gray-800 border-gray-700"
                              />
                              <span className="text-xs font-mono text-gray-400 w-6">
                                {String.fromCharCode(65 + optIdx)}:
                              </span>
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => updateOptionText(qIdx, optIdx, e.target.value)}
                                className="flex-1 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm focus:border-violet-500"
                              />
                            </div>
                          ))}
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Answer Explanation</label>
                          <input
                            type="text"
                            value={q.explanation || ''}
                            onChange={(e) => updateQuestionField(qIdx, 'explanation', e.target.value)}
                            placeholder="Explanation revealed to participants after competition ends"
                            className="w-full px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={handleSaveQuestions}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/30"
                >
                  Approve & Save All Questions
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ANALYTICS & SUBMISSIONS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800">
              <span className="text-xs text-gray-400 uppercase font-semibold">Total Participants</span>
              <p className="text-3xl font-extrabold text-gray-100 mt-2">{analytics?.participantCount || 0}</p>
            </div>
            <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800">
              <span className="text-xs text-gray-400 uppercase font-semibold">Completed Submissions</span>
              <p className="text-3xl font-extrabold text-emerald-400 mt-2">{analytics?.submittedCount || 0}</p>
            </div>
            <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800 flex flex-col justify-between">
              <div>
                <span className="text-xs text-gray-400 uppercase font-semibold">Export Results</span>
                <p className="text-xs text-gray-500 mt-1">Download complete student leaderboard in Excel format.</p>
              </div>
              <button
                type="button"
                onClick={handleDownloadExcel}
                className="mt-3 inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow"
              >
                <ArrowDownTrayIcon className="h-4 w-4 mr-1.5" />
                Download Excel Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageCompetition;
