import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  TrashIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  AcademicCapIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { getBackendUrl } from '../../utils/apiConfig';

const ManageCompetition = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const backendUrl = getBackendUrl();

  const [activeTab, setActiveTab] = useState(id ? 'questions' : 'setup');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [events, setEvents] = useState([]);
  const [geminiStatus, setGeminiStatus] = useState(null);

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

  const [questionPool, setQuestionPool] = useState([]);
  const [competitionId, setCompetitionId] = useState(id || null);
  const [competitionStatus, setCompetitionStatus] = useState('draft');

  const [aiCount, setAiCount] = useState(5);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [useCache, setUseCache] = useState(true);
  const [quotaCooldown, setQuotaCooldown] = useState(0);

  const [analytics, setAnalytics] = useState(null);

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
      setEvents(res.data || []);
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
      const updated = exists ? prev.permittedLanguages.filter(l => l !== lang) : [...prev.permittedLanguages, lang];
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
        topics: formData.topics
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        startTime: new Date(formData.startTime).toISOString(),
        endTime: new Date(formData.endTime).toISOString()
      };

      let res;
      if (competitionId) {
        res = await axios.put(`${backendUrl}/api/competitions/${competitionId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSuccess('Competition settings updated.');
      } else {
        res = await axios.post(`${backendUrl}/api/competitions`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCompetitionId(res.data._id);
        setSuccess('Competition created. Now generate or add questions.');
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
      alert('Competition and participant records deleted.');
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

    if (aiGenerating) return;

    if (quotaCooldown > 0 && forceFresh) {
      setError(
        `Free-tier request quota limit active. Wait ${quotaCooldown}s, reuse the saved problem bank, or add questions manually.`
      );
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
          topics: formData.topics
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
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
      const sourceNote = res.data.fromCache
        ? 'loaded from MongoDB problem bank'
        : `generated with ${res.data.modelUsed}`;
      setSuccess(`Added ${generated.length} questions (${sourceNote}). Review and edit them below.`);
      setActiveTab('questions');
    } catch (err) {
      console.error('AI generation error:', err);
      if (err.response?.status === 429) {
        const delay = Number(err.response?.data?.retryAfterSeconds) || 60;
        setQuotaCooldown(delay);
        setError(
          `Free-tier request quota limit reached. Cooldown active for ${delay}s. Wait for reset, load cached problems from MongoDB, or add questions manually.`
        );
      } else {
        setError(
          err.response?.data?.message || 'Failed to generate questions. Verify GEMINI_API_KEY or create questions manually.'
        );
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
      setSuccess('Question pool saved.');
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
      setSuccess('Competition published and open for eligible students.');
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
        title: 'New coding problem',
        description: 'Problem statement description...',
        inputFormat: 'Read from standard input',
        outputFormat: 'Print to standard output',
        constraints: '1 <= N <= 10^5',
        difficulty: formData.difficulty,
        marks: 20,
        starterCode: {
          python: '# Python 3\nimport sys\n\ndef solve():\n    pass\n\nif __name__ == "__main__":\n    solve()',
          javascript:
            '// JavaScript\nconst fs = require("fs");\nconst input = fs.readFileSync(0, "utf-8").trim();\nconsole.log(input);',
          cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}',
          java: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n    }\n}'
        },
        sampleTestCases: [{ input: '1 2', output: '3', explanation: '1 + 2 = 3' }],
        hiddenTestCases: [
          { input: '5 5', output: '10' },
          { input: '0 0', output: '0' }
        ]
      }
    ]);
    setActiveTab('questions');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-mono text-[#ebb05d]">Organizer studio</span>
            <span className="text-[#8a847a]">·</span>
            <span
              className={`px-2 py-0.5 rounded-[6px] text-[12px] font-mono capitalize ${
                competitionStatus === 'published'
                  ? 'bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25'
                  : 'bg-[#262421] text-[#aaa398] border border-[#efe9de]/[0.08]'
              }`}
            >
              {competitionStatus}
            </span>
          </div>
          <h1 className="text-[24px] sm:text-[26px] font-medium tracking-[-0.015em] text-[#efe9de] mt-1">
            {competitionId ? `Manage: ${formData.title || 'Untitled'}` : 'Create competition'}
          </h1>
          <p className="text-[14px] text-[#aaa398] mt-1">
            Configure schedule and rules, synthesize or author questions, and publish for student entry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {competitionId && (
            <>
              <button
                type="button"
                onClick={handleDeleteCompetition}
                disabled={loading || deleting}
                className="h-9 px-3.5 rounded-[8px] text-[13px] font-medium text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20 transition-colors duration-150 inline-flex items-center gap-1.5 disabled:opacity-50"
                title="Delete competition and remove from database"
              >
                <TrashIcon className="h-4 w-4" strokeWidth={1.5} />
                <span>{deleting ? 'Deleting...' : 'Delete'}</span>
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={loading || questionPool.length === 0}
                className="btn-primary h-9 px-4 text-[13px]"
              >
                {competitionStatus === 'published' ? 'Update published' : 'Publish competition'}
              </button>
            </>
          )}
          <button type="button" onClick={() => navigate('/competitions')} className="btn-secondary h-9 px-3.5 text-[13px]">
            Back to arenas
          </button>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px] flex items-center gap-2">
          <ExclamationCircleIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="px-4 py-3 rounded-[8px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 text-[#4cc38a] text-[13px] flex items-center gap-2">
          <CheckCircleIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>{success}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto p-1 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] gap-1">
        {[
          { id: 'setup', label: '1. Setup' },
          { id: 'generator', label: '2. Problem generator' },
          { id: 'questions', label: `3. Question pool (${questionPool.length})` },
          { id: 'analytics', label: '4. Submissions' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[140px] py-2 px-4 text-center font-medium text-[13px] rounded-[6px] transition-colors duration-150 whitespace-nowrap tabular-nums ${
              activeTab === tab.id
                ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: SETUP */}
      {activeTab === 'setup' && (
        <form onSubmit={handleSaveSetup} className="p-6 sm:p-8 rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Competition title *</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
                placeholder="e.g. Annual Campus Algorithmic Championship"
                className="input-field"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Description *</label>
              <textarea
                name="description"
                rows={3}
                value={formData.description}
                onChange={handleInputChange}
                required
                placeholder="Outline competition goals, rules, and eligibility"
                className="input-field resize-y"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Competition type *</label>
              <select name="type" value={formData.type} onChange={handleInputChange} className="input-field">
                <option value="quiz">Online quiz (MCQs)</option>
                <option value="coding">Coding competition (Judge0 isolated)</option>
                <option value="hybrid">Hybrid (Quiz and coding)</option>
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Linked campus event (optional)</label>
              <select name="event" value={formData.event} onChange={handleInputChange} className="input-field">
                <option value="">Standalone competition</option>
                {events.map(ev => (
                  <option key={ev._id} value={ev._id}>
                    {ev.title} ({ev.department})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Duration (minutes) *</label>
              <input
                type="number"
                name="durationMinutes"
                min="1"
                value={formData.durationMinutes}
                onChange={handleInputChange}
                required
                className="input-field tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Negative marking (per wrong MCQ)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                name="negativeMarking"
                value={formData.negativeMarking}
                onChange={handleInputChange}
                placeholder="0.25 (0 for none)"
                className="input-field tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Start date and time *</label>
              <input
                type="datetime-local"
                name="startTime"
                value={formData.startTime}
                onChange={handleInputChange}
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">End date and time *</label>
              <input
                type="datetime-local"
                name="endTime"
                value={formData.endTime}
                onChange={handleInputChange}
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Participant limit (0 = unlimited)</label>
              <input
                type="number"
                min="0"
                name="participantLimit"
                value={formData.participantLimit}
                onChange={handleInputChange}
                className="input-field tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Questions per participant</label>
              <input
                type="number"
                min="1"
                name="questionsPerParticipant"
                value={formData.questionsPerParticipant}
                onChange={handleInputChange}
                className="input-field tabular-nums"
              />
              <span className="block mt-1.5 text-[12px] text-[#8a847a]">
                Drawn as randomized subsets from the larger question pool.
              </span>
            </div>

            {(formData.type === 'coding' || formData.type === 'hybrid') && (
              <div className="md:col-span-2 pt-2">
                <label className="block text-[13px] font-medium text-[#aaa398] mb-2.5">
                  Permitted programming languages
                </label>
                <div className="flex flex-wrap gap-5">
                  {[
                    { key: 'python', label: 'Python 3' },
                    { key: 'javascript', label: 'JavaScript (Node.js)' },
                    { key: 'cpp', label: 'C++ (GCC)' },
                    { key: 'java', label: 'Java (OpenJDK)' }
                  ].map(lang => (
                    <label key={lang.key} className="inline-flex items-center gap-2 cursor-pointer text-[14px] text-[#efe9de]">
                      <input
                        type="checkbox"
                        checked={formData.permittedLanguages.includes(lang.key)}
                        onChange={() => handleLanguageToggle(lang.key)}
                        className="rounded border-[#efe9de]/20 bg-[#262421] text-[#e09132] focus:ring-[#e09132] h-4 w-4"
                      />
                      <span>{lang.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-5 border-t border-[#efe9de]/[0.08]">
            <button type="submit" disabled={loading} className="btn-primary h-10 px-5 text-[14px]">
              {competitionId ? 'Save changes' : 'Create and continue'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: GENERATOR */}
      {activeTab === 'generator' && (
        <div className="p-6 sm:p-8 rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.08]">
            <div>
              <h2 className="text-[14px] font-medium text-[#efe9de]">Gemini question synthesis engine</h2>
              <p className="text-[12px] text-[#8a847a] mt-0.5 font-mono">
                Model: <span className="text-[#ebb05d]">{geminiStatus?.verifiedModel || 'gemini-3.8-flash'}</span>
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25">
              Verified
            </span>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Prompt instructions
              </label>
              <textarea
                name="prompt"
                rows={3}
                value={formData.prompt}
                onChange={handleInputChange}
                placeholder="e.g. Generate university-level questions covering asymptotic analysis, binary search trees, and dynamic programming."
                className="input-field resize-y"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Topics (comma-separated)</label>
                <input
                  type="text"
                  name="topics"
                  value={formData.topics}
                  onChange={handleInputChange}
                  placeholder="Arrays, Strings, Sorting"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Difficulty</label>
                <select name="difficulty" value={formData.difficulty} onChange={handleInputChange} className="input-field">
                  <option value="easy">Easy (Fundamentals)</option>
                  <option value="medium">Medium (Standard)</option>
                  <option value="hard">Hard (Competitive)</option>
                  <option value="mixed">Mixed (Balanced)</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5">Question count</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={aiCount}
                  onChange={(e) => setAiCount(Number(e.target.value) || 5)}
                  className="input-field tabular-nums"
                />
              </div>
            </div>

            <div className="p-4 rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.08] space-y-1.5">
              <label className="inline-flex items-center gap-2.5 cursor-pointer text-[14px] font-medium text-[#efe9de]">
                <input
                  type="checkbox"
                  checked={useCache}
                  onChange={(e) => setUseCache(e.target.checked)}
                  className="rounded bg-[#262421] border-[#efe9de]/20 text-[#e09132] focus:ring-[#e09132] h-4 w-4"
                />
                <span>Reuse problems from MongoDB bank before calling API</span>
              </label>
              <p className="text-[12px] text-[#8a847a] pl-6">
                Pulls cached problems and MCQs from your database first to avoid rate limits.
              </p>
            </div>

            {quotaCooldown > 0 && (
              <div className="p-4 rounded-[12px] bg-[#e09132]/10 border border-[#e09132]/30 text-[#ebb05d] text-[13px] space-y-2.5">
                <div className="flex items-center gap-2 font-medium">
                  <ClockIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span className="tabular-nums">Rate limit reached — cooldown active ({quotaCooldown}s)</span>
                </div>
                <p className="text-[12px] text-[#aaa398]">
                  Provider requests are paused until the cooldown expires. Load cached problems or author questions manually.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setUseCache(true);
                      handleGenerateAI(false);
                    }}
                    className="btn-primary h-8 px-3 text-[12px]"
                  >
                    Load from DB bank
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('questions')}
                    className="btn-secondary h-8 px-3 text-[12px]"
                  >
                    Author manually
                  </button>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-[#efe9de]/[0.08] flex flex-wrap items-center justify-between gap-4">
              <span className="text-[12px] text-[#8a847a] max-w-md">
                Generated items append to your question pool for manual editing before publishing.
              </span>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('questions')}
                  className="btn-secondary h-10 px-4 text-[13px]"
                >
                  Skip to manual entry
                </button>

                <button
                  type="button"
                  onClick={() => handleGenerateAI(false)}
                  disabled={aiGenerating || (quotaCooldown > 0 && !useCache)}
                  className="btn-primary h-10 px-5 text-[14px]"
                >
                  {aiGenerating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-[#12110f] border-t-transparent rounded-full animate-spin" />
                      <span>Synthesizing...</span>
                    </>
                  ) : quotaCooldown > 0 && !useCache ? (
                    <>
                      <ClockIcon className="h-4 w-4" strokeWidth={1.5} />
                      <span className="tabular-nums">Cooldown ({quotaCooldown}s)</span>
                    </>
                  ) : (
                    <span>Generate questions</span>
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
          <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08]">
            <div>
              <h2 className="text-[16px] font-medium text-[#efe9de] tabular-nums">
                Question pool ({questionPool.length} items)
              </h2>
              <p className="text-[12px] text-[#8a847a] mt-0.5">
                Edit prompts, options, and marks, then save changes before publishing.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={addManualMCQ} className="btn-secondary h-8 px-3 text-[12px]">
                + Add MCQ
              </button>
              {(formData.type === 'coding' || formData.type === 'hybrid') && (
                <button type="button" onClick={addManualCodingProblem} className="btn-secondary h-8 px-3 text-[12px]">
                  + Add coding problem
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveQuestions}
                disabled={loading}
                className="btn-primary h-8 px-3.5 text-[12px]"
              >
                Save question pool
              </button>
            </div>
          </div>

          {questionPool.length === 0 ? (
            <div className="text-center py-16 bg-[#1c1a18] rounded-[14px] border border-[#efe9de]/[0.08] px-6">
              <AcademicCapIcon className="mx-auto h-8 w-8 text-[#8a847a] mb-3" strokeWidth={1.5} />
              <p className="text-[15px] font-medium text-[#efe9de]">Question pool is empty</p>
              <p className="text-[13px] text-[#8a847a] mt-1">
                Use the generator tab or add questions manually above.
              </p>
              <button onClick={() => setActiveTab('generator')} className="btn-primary mt-5 h-9 px-4 text-[13px]">
                Open generator
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {questionPool.map((q, qIdx) => {
                const isCoding = q.type === 'coding';

                return (
                  <div
                    key={q.questionId || q.problemId || qIdx}
                    className="p-6 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] space-y-4"
                  >
                    <div className="flex items-center justify-between gap-4 pb-3 border-b border-[#efe9de]/[0.06]">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08] tabular-nums">
                          #{qIdx + 1} · {isCoding ? 'Coding' : 'MCQ'}
                        </span>
                        <span className="text-[12px] font-mono text-[#8a847a] capitalize tabular-nums">
                          {q.difficulty} · {q.marks || 1} mark{q.marks !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeQuestion(qIdx)}
                        className="p-1.5 rounded-[6px] text-[#8a847a] hover:text-[#e5484d] hover:bg-[#e5484d]/10 transition-colors duration-150"
                        title="Remove question"
                      >
                        <TrashIcon className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </div>

                    {isCoding ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[12px] text-[#8a847a] mb-1">Problem title</label>
                          <input
                            type="text"
                            value={q.title || ''}
                            onChange={(e) => updateQuestionField(qIdx, 'title', e.target.value)}
                            className="input-field"
                          />
                        </div>

                        <div>
                          <label className="block text-[12px] text-[#8a847a] mb-1">Problem description</label>
                          <textarea
                            rows={3}
                            value={q.description || ''}
                            onChange={(e) => updateQuestionField(qIdx, 'description', e.target.value)}
                            className="input-field resize-y"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[12px] text-[#8a847a] mb-1">Constraints</label>
                            <input
                              type="text"
                              value={q.constraints || ''}
                              onChange={(e) => updateQuestionField(qIdx, 'constraints', e.target.value)}
                              className="input-field font-mono text-[13px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] text-[#8a847a] mb-1">Marks</label>
                            <input
                              type="number"
                              value={q.marks || 20}
                              onChange={(e) => updateQuestionField(qIdx, 'marks', Number(e.target.value))}
                              className="input-field font-mono tabular-nums"
                            />
                          </div>
                        </div>

                        <div className="p-3.5 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.06]">
                          <p className="text-[12px] font-mono text-[#aaa398] tabular-nums">
                            Sample cases: {q.sampleTestCases?.length || 0} · Hidden cases: {q.hiddenTestCases?.length || 0}
                          </p>
                          <p className="text-[12px] text-[#8a847a] mt-0.5">
                            Hidden test cases run in isolation on the backend via Judge0.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[12px] text-[#8a847a] mb-1">Question prompt</label>
                          <textarea
                            rows={2}
                            value={q.question || ''}
                            onChange={(e) => updateQuestionField(qIdx, 'question', e.target.value)}
                            className="input-field resize-y"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-[12px] text-[#8a847a]">
                            Options (select the correct choice)
                          </label>
                          {(q.options || []).map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-3">
                              <input
                                type="radio"
                                name={`correct_${qIdx}`}
                                checked={Number(q.correctOption) === optIdx}
                                onChange={() => updateQuestionField(qIdx, 'correctOption', optIdx)}
                                className="h-4 w-4 text-[#e09132] focus:ring-[#e09132] bg-[#262421] border-[#efe9de]/20"
                              />
                              <span className="text-[12px] font-mono text-[#8a847a] w-5 shrink-0">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => updateOptionText(qIdx, optIdx, e.target.value)}
                                className="input-field h-9 py-1.5"
                              />
                            </div>
                          ))}
                        </div>

                        <div>
                          <label className="block text-[12px] text-[#8a847a] mb-1">Solution explanation</label>
                          <input
                            type="text"
                            value={q.explanation || ''}
                            onChange={(e) => updateQuestionField(qIdx, 'explanation', e.target.value)}
                            placeholder="Revealed to participants after submission"
                            className="input-field h-9 py-1.5 text-[13px]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveQuestions}
                  disabled={loading}
                  className="btn-primary h-10 px-5 text-[14px]"
                >
                  Save question pool
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="p-6 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08]">
            <span className="text-[13px] text-[#8a847a]">Total participants</span>
            <p className="text-[28px] font-medium text-[#efe9de] font-mono tabular-nums mt-2 leading-none">
              {analytics?.participantCount || 0}
            </p>
          </div>

          <div className="p-6 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08]">
            <span className="text-[13px] text-[#8a847a]">Completed submissions</span>
            <p className="text-[28px] font-medium text-[#4cc38a] font-mono tabular-nums mt-2 leading-none">
              {analytics?.submittedCount || 0}
            </p>
          </div>

          <div className="p-6 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] flex flex-col justify-between gap-4">
            <div>
              <span className="text-[13px] text-[#8a847a]">Export results</span>
              <p className="text-[13px] text-[#aaa398] mt-1">
                Download participant scores and rankings in Excel format.
              </p>
            </div>
            <button type="button" onClick={handleDownloadExcel} className="btn-primary h-9 px-4 text-[13px] self-start">
              <ArrowDownTrayIcon className="h-4 w-4" strokeWidth={1.5} />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageCompetition;
