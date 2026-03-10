import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Send, Loader2, TrendingUp, TrendingDown, Upload, RefreshCw, Edit2, Check, Brain, X, User, History, LogOut } from "lucide-react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis,
  LineChart, Line,
  AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart,
  ResponsiveContainer, Legend, Tooltip, CartesianGrid
} from "recharts";

const NODE_BACKEND_URL = import.meta.env.VITE_API_URL || (window.location.port === '5173' ? "http://localhost:3000" : window.location.origin);
const PYTHON_BACKEND_URL = window.location.port === '5173' ? "http://localhost:5000" : (window.location.origin.replace(':3000', ':5000'));

// Initial expense categories
const INITIAL_EXPENSES = [
  { category: "Utility Bills", amount: 0, color: "#FF6B6B", budget: 0 },
  { category: "Shopping", amount: 0, color: "#4ECDC4", budget: 0 },
  { category: "Food", amount: 0, color: "#45B7D1", budget: 0 },
  { category: "Transport", amount: 0, color: "#FFA07A", budget: 0 },
  { category: "Entertainment", amount: 0, color: "#98D8C8", budget: 0 },
  { category: "Others", amount: 0, color: "#F7DC6F", budget: 0 }
];

const CATEGORIES = ["Utility Bills", "Shopping", "Food", "Transport", "Entertainment", "Others"];

// ============================================
// AUDIO RECORDER (Uploads to Python)
// ============================================

class SimpleAudioRecorder {
  constructor(onTranscript, onError) {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.onTranscript = onTranscript;
    this.onError = onError;
    this.isRecording = false;
  }

  async start() {
    try {
      console.log('🎙️ Starting audio recorder...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        console.log('🛑 Recording stopped, uploading to Python...');
        await this.uploadAudio();
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start(100);
      this.isRecording = true;
      
      return true;
    } catch (err) {
      console.error('❌ Failed to start recording:', err);
      this.onError(err.message || 'Failed to access microphone');
      return false;
    }
  }

  stop() {
    if (this.mediaRecorder && this.isRecording) {
      this.isRecording = false;
      this.mediaRecorder.stop();
    }
  }

  async uploadAudio() {
    try {
      if (this.audioChunks.length === 0) {
        throw new Error('No audio data recorded');
      }

      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      console.log('📦 Audio blob created:', audioBlob.size, 'bytes');

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const token = localStorage.getItem('token');

      console.log('📤 Uploading audio to Python backend...');

      // ✅ Node.js handles Whisper + Groq logic
      const response = await fetch(`${NODE_BACKEND_URL}/api/analyze-audio`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });


      if (!response.ok) {
        throw new Error(`Python backend error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Python response:', data);

      if (data.success && data.expense) {
        this.onTranscript(data.transcription, data.expense, data.metadata);
      } else {
        throw new Error(data.message || 'Failed to process audio');
      }

    } catch (error) {
      console.error('❌ Upload error:', error);
      this.onError(error.message || 'Failed to upload audio');
    }
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function Home() {
  const navigate = useNavigate();
  
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeChart, setActiveChart] = useState("bar");
  const [totalBudgetInput, setTotalBudgetInput] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pythonStatus, setPythonStatus] = useState("disconnected");
  const [nodeStatus, setNodeStatus] = useState("disconnected");
  const [recentExpense, setRecentExpense] = useState(null);
  const [notification, setNotification] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // Confirmation modal state
  const [showCorrection, setShowCorrection] = useState(false);
  const [pendingExpense, setPendingExpense] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [transcription, setTranscription] = useState("");
  const [llmSuggestion, setLlmSuggestion] = useState(null);
  const [inputSource, setInputSource] = useState(null); // 'text' or 'audio'

  const [expenses, setExpenses] = useState(INITIAL_EXPENSES);

  const audioRecorderRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load user info on mount
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUser(user);
      } catch (e) {
        console.error('Failed to parse user:', e);
      }
    }
  }, []);

  // Check backend status
  useEffect(() => {
    checkBackendStatus();
    const interval = setInterval(checkBackendStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const checkBackendStatus = async () => {
    // Check Python
    try {
      const pythonRes = await fetch(`${PYTHON_BACKEND_URL}/health`);
      setPythonStatus(pythonRes.ok ? "connected" : "disconnected");
    } catch {
      setPythonStatus("disconnected");
    }

    // Check Node.js
    try {
      const nodeRes = await fetch(`${NODE_BACKEND_URL}/api/health`);
      setNodeStatus(nodeRes.ok ? "connected" : "disconnected");
    } catch {
      setNodeStatus("disconnected");
    }
  };

  useEffect(() => {
    const perCategory = Math.floor(totalBudgetInput / expenses.length);
    setExpenses(prev => prev.map(e => ({ ...e, budget: perCategory })));
  }, [totalBudgetInput]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const addExpense = (result) => {
    if (!result.amount || result.amount <= 0) return;

    setExpenses(prev =>
      prev.map(e =>
        e.category === result.category
          ? { ...e, amount: e.amount + result.amount }
          : e
      )
    );

    setRecentExpense(result);
    setTimeout(() => setRecentExpense(null), 5000);
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  // Load history handler
  const loadHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${NODE_BACKEND_URL}/api/expenses/history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        showNotification(`Loaded ${data.expenses?.length || 0} expenses`, 'success');
        // You can process the history data here
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      showNotification('Failed to load history', 'error');
    }
  };

  // ============================================
  // TEXT INPUT HANDLING (Calls Node.js directly)
  // ============================================

  const handleSubmit = async () => {
    if (!inputValue.trim()) {
      showNotification('Please enter an expense', 'error');
      return;
    }

    setIsProcessing(true);
    
    try {
      console.log(`📝 Text input: "${inputValue}"`);
      
      const token = localStorage.getItem('token');
      
      // ✅ Call Node.js backend directly for text categorization
      const response = await fetch(`${NODE_BACKEND_URL}/api/categorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text: inputValue })
      });

      if (!response.ok) {
        throw new Error(`Node.js error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Node.js categorization result:', result);
      
      if (result.success && result.expense) {
        // Show confirmation modal
        setPendingExpense({
          ...result.expense,
          source: 'text',
          originalCategory: result.expense.category,
          manualOverride: false
        });
        setTranscription(inputValue);
        setSelectedCategory(result.expense.category);
        setLlmSuggestion(result.expense.category);
        setInputSource('text');
        setShowCorrection(true);
        
        // Show notification about source
        if (result.metadata.source === 'global_learning') {
          showNotification('✨ Auto-categorized from learned patterns!', 'info');
        } else if (result.metadata.source === 'groq') {
          showNotification('🤖 Categorized using AI', 'info');
        }
      } else {
        showNotification('Failed to categorize', 'error');
      }
      
    } catch (error) {
      console.error('Categorization error:', error);
      showNotification('Failed to categorize. Please try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ============================================
  // AUDIO INPUT HANDLING (Uploads to Python)
  // ============================================

  const startRecording = async () => {
    try {
      audioRecorderRef.current = new SimpleAudioRecorder(
        (transcript, expense, metadata) => {
          // Success callback
          console.log('✅ Audio transcribed:', transcript);
          setTranscription(transcript);
          setInputValue(transcript); // Also show in text input
          
          if (expense && expense.amount) {
            setPendingExpense({
              ...expense,
              source: 'audio',
              originalCategory: expense.category,
              manualOverride: false
            });
            setSelectedCategory(expense.category);
            setLlmSuggestion(expense.category);
            setInputSource('audio');
            setShowCorrection(true);
            
            // Show notification based on source
            if (metadata && metadata.source === 'global_learning') {
              showNotification('✨ Auto-categorized from learned patterns!', 'info');
            } else if (metadata && metadata.source === 'groq') {
              showNotification('🤖 AI categorized your audio!', 'info');
            }
          }
          
          setIsRecording(false);
          setIsProcessing(false);
          showNotification('✅ Audio processed successfully!', 'success');
        },
        (error) => {
          // Error callback
          console.error('❌ Recording error:', error);
          showNotification(`Recording error: ${error}`, 'error');
          setIsRecording(false);
          setIsProcessing(false);
        }
      );

      const started = await audioRecorderRef.current.start();
      
      if (started) {
        setIsRecording(true);
        showNotification('🎤 Recording... Speak naturally', 'info');
      }
    } catch (error) {
      console.error('Microphone error:', error);
      showNotification('Microphone access denied', 'error');
    }
  };

  const stopRecording = () => {
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
      showNotification('⏳ Processing audio...', 'info');
    }
  };

  // ============================================
  // CONFIRM EXPENSE (with learning)
  // ============================================

  const confirmExpense = async () => {
    if (!pendingExpense) return;
    
    const finalExpense = {
      ...pendingExpense,
      category: selectedCategory,
      amount: Number(pendingExpense.amount)
    };
    
    // Check if user changed category (manual override for learning)
    const wasOverridden = llmSuggestion && llmSuggestion !== selectedCategory;
    
    try {
      const token = localStorage.getItem('token');
      
      // ✅ Call Node.js to save expense
      const response = await fetch(`${NODE_BACKEND_URL}/api/expenses/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: transcription,
          amount: finalExpense.amount,
          category: selectedCategory,
          description: transcription,
          originalCategory: llmSuggestion,
          manualOverride: wasOverridden
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save expense: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // Add to local state
        addExpense(finalExpense);
        
        // Show appropriate notification
        if (wasOverridden) {
          showNotification(
            `✅ Saved! 🎓 AI learned your correction. Next time "${transcription.substring(0, 30)}..." will auto-categorize to ${selectedCategory}!`,
            'success'
          );
        } else {
          showNotification(`✅ Saved ₹${finalExpense.amount} to ${selectedCategory}!`, 'success');
        }
      }
    } catch (e) {
      console.error('Failed to save expense:', e);
      showNotification('Failed to save expense', 'error');
    }
    
    // Reset state
    setShowCorrection(false);
    setPendingExpense(null);
    setTranscription("");
    setInputValue("");
    setLlmSuggestion(null);
    setInputSource(null);
  };

  const skipExpense = () => {
    setShowCorrection(false);
    setPendingExpense(null);
    setTranscription("");
    setInputValue("");
    setLlmSuggestion(null);
    setInputSource(null);
    showNotification('Expense cancelled', 'info');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      showNotification('Unsupported file type. Please upload an image or PDF.', 'error');
      return;
    }

    setIsProcessing(true);
    setInputSource('ocr');
    showNotification(`Uploading ${file.name} for AI analysis...`, 'info');

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('receipt', file);

      const response = await fetch(`${NODE_BACKEND_URL}/api/upload/receipt`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.expense) {
        console.log('✅ OCR Data:', data);
        
        setTranscription(data.expense.description || data.expense.title);
        setPendingExpense({
          ...data.expense,
          source: 'ocr',
          originalCategory: data.expense.category,
          manualOverride: false
        });
        setSelectedCategory(data.expense.category);
        setLlmSuggestion(data.expense.category);
        setShowCorrection(true);
        
        showNotification('✅ Receipt scanned successfully!', 'success');
      } else {
        throw new Error(data.message || 'Failed to scan receipt');
      }

    } catch (error) {
      console.error('Upload error:', error);
      showNotification(`Scan failed: ${error.message}`, 'error');
    } finally {
      setIsProcessing(false);
      if (e.target) e.target.value = '';
    }
  };

  const refreshData = () => {
    checkBackendStatus();
    showNotification('Status refreshed!', 'success');
  };

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = expenses.reduce((s, e) => s + e.budget, 0);
  const budgetUsed = totalBudget > 0 ? ((totalExpenses / totalBudget) * 100).toFixed(1) : 0;

  const highestExpense = expenses.reduce((a, b) => a.amount > b.amount ? a : b, { category: "None", amount: 0 });
  const lowestExpense = expenses.reduce((a, b) => a.amount < b.amount ? a : b, { category: "None", amount: 0 });

  const tabs = [
    { id: "pie", label: "Pie" },
    { id: "bar", label: "Bar" },
    { id: "line", label: "Line" },
    { id: "area", label: "Area" },
    { id: "radar", label: "Radar" },
    { id: "budget", label: "Budget vs Actual" }
  ];

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold">AI Expense Tracker</h1>
            <p className="text-gray-400 text-sm">
              {inputSource === 'audio' ? '🎙️ Voice' : '⌨️ Text'} + Smart Learning 🧠
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {currentUser && (
              <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg">
                <User size={20} className="text-gray-400" />
                <span className="text-sm">{currentUser.name || currentUser.email}</span>
              </div>
            )}
            
            <button
              onClick={() => navigate("/history")}
              className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg hover:bg-gray-700 transition"
            >
              <History size={20} />
              <span className="hidden sm:inline">History</span>
            </button>
            
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 px-4 py-2 rounded-lg hover:bg-red-700 transition"
            >
              <LogOut size={20} />
              <span className="hidden sm:inline">Logout</span>
            </button>

            {/* Status Indicators */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
              pythonStatus === 'connected' 
                ? 'bg-green-900/30 text-green-400 border border-green-800' 
                : 'bg-red-900/30 text-red-400 border border-red-800'
            }`}>
              <div className={`w-2 h-2 rounded-full ${pythonStatus === 'connected' ? 'bg-green-400' : 'bg-red-400'}`}></div>
              Python
            </div>
            
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
              nodeStatus === 'connected' 
                ? 'bg-green-900/30 text-green-400 border border-green-800' 
                : 'bg-red-900/30 text-red-400 border border-red-800'
            }`}>
              <div className={`w-2 h-2 rounded-full ${nodeStatus === 'connected' ? 'bg-green-400' : 'bg-red-400'}`}></div>
              Node.js
            </div>
            
            <button 
              onClick={refreshData}
              className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
              title="Refresh status"
            >
              <RefreshCw size={18} className="text-gray-300" />
            </button>
          </div>
        </div>

        {/* Notifications */}
        {notification && (
          <div className={`mb-4 p-4 rounded-xl border flex items-center gap-4 ${
            notification.type === 'success' ? 'bg-green-900/30 border-green-800' : 
            notification.type === 'info' ? 'bg-blue-900/30 border-blue-800' : 
            'bg-red-900/30 border-red-800'
          }`}>
            <div className="text-xl">
              {notification.type === 'success' && '✅'}
              {notification.type === 'info' && 'ℹ️'}
              {notification.type === 'error' && '❌'}
            </div>
            <p className={`font-semibold text-sm ${
              notification.type === 'success' ? 'text-green-400' : 
              notification.type === 'info' ? 'text-blue-400' : 
              'text-red-400'
            }`}>{notification.message}</p>
          </div>
        )}

        {recentExpense && (
          <div className="mb-4 p-3 md:p-4 bg-green-900/30 border border-green-800 rounded-xl flex items-center gap-4">
            <div className="text-xl">✅</div>
            <div>
              <p className="font-semibold text-green-400 text-sm">Expense Added!</p>
              <p className="text-gray-300 text-sm">₹{recentExpense.amount} - {recentExpense.category}</p>
            </div>
          </div>
        )}

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
          {/* Input Column */}
          <div className="bg-[#1a1a1a] rounded-xl p-4 md:p-6 border border-gray-800">
            <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">
              Add Expense
              <span className="text-xs ml-2 text-gray-500">
                (Text, Voice, or OCR)
              </span>
            </h2>

            <textarea
              className="w-full p-3 md:p-4 bg-black border border-gray-700 rounded-lg text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 text-sm md:text-base"
              rows={5}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type or speak expense:
• swiggy 300
• uber 180  
• electricity bill 850"
              disabled={isProcessing || isRecording}
            />

            <div className="flex gap-2 md:gap-3 mt-3 md:mt-4">
              {/* Microphone Button */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`p-3 md:p-4 rounded-lg ${
                  isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-gray-800 hover:bg-gray-700'
                } disabled:opacity-50 transition-all`}
                disabled={isProcessing}
                title={isRecording ? "Stop recording" : "Start recording"}
              >
                <Mic size={20} className={isRecording ? "text-white" : "text-gray-300"} />
              </button>

              {/* Upload Button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".csv,.jpg,.jpeg,.png,.pdf"
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-gray-800 p-3 md:p-4 rounded-lg hover:bg-gray-700 disabled:opacity-50"
                disabled={isProcessing}
                title="Upload file"
              >
                <Upload size={20} className="text-gray-300" />
              </button>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={!inputValue.trim() || isProcessing || isRecording}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 py-3 md:py-4 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:from-blue-700 hover:to-purple-700 text-sm md:text-base transition-all"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Add
                  </>
                )}
              </button>
            </div>

            {isRecording && (
              <div className="mt-3 p-2 md:p-3 bg-red-500 bg-opacity-20 border border-red-500 rounded-lg text-center">
                <p className="text-red-300 text-xs md:text-sm font-semibold animate-pulse">
                  🎙️ Recording... Click mic to stop
                </p>
              </div>
            )}

            {isProcessing && (
              <div className="mt-3 p-2 md:p-3 bg-blue-500 bg-opacity-20 border border-blue-500 rounded-lg text-center">
                <p className="text-blue-300 text-xs md:text-sm font-semibold">
                  ⏳ {inputSource === 'audio' ? 'Transcribing & Categorizing' : 'Categorizing'}...
                </p>
              </div>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <div className="bg-[#1a1a1a] p-3 md:p-4 rounded-xl border border-gray-800">
              <p className="text-gray-400 text-xs">Total Expenses</p>
              <p className="text-lg md:text-xl font-bold">₹{totalExpenses.toLocaleString()}</p>
            </div>

            <div className="bg-[#1a1a1a] p-3 md:p-4 rounded-xl border border-gray-800">
              <p className="text-gray-400 text-xs">Budget Used</p>
              <p className="text-lg md:text-xl font-bold">{budgetUsed}%</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3 md:p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-red-400" />
                <p className="text-gray-400 text-xs">Highest</p>
              </div>
              <p className="text-sm font-semibold truncate">{highestExpense.category}</p>
              <p className="text-base md:text-lg font-bold">₹{highestExpense.amount.toLocaleString()}</p>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl p-3 md:p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={14} className="text-green-400" />
                <p className="text-gray-400 text-xs">Lowest</p>
              </div>
              <p className="text-sm font-semibold truncate">{lowestExpense.category}</p>
              <p className="text-base md:text-lg font-bold">₹{lowestExpense.amount.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Budget Input */}
        <div className="bg-[#1a1a1a] p-3 md:p-4 rounded-xl border border-gray-800 mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <label className="text-gray-400 text-sm">Monthly Budget</label>
            <input
              type="number"
              value={totalBudgetInput}
              onChange={(e) => setTotalBudgetInput(Number(e.target.value))}
              className="bg-black border border-gray-700 p-2 md:p-3 rounded-lg text-white w-full sm:w-48 text-sm"
              placeholder="Enter budget"
            />
          </div>
        </div>

        {/* Confirmation Modal */}
        {showCorrection && pendingExpense && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a1a1a] rounded-xl p-4 md:p-6 border border-gray-800 max-w-md w-full">
              <h3 className="text-lg md:text-xl font-bold mb-3 md:mb-4 flex items-center gap-2">
                <Edit2 size={18} className="text-blue-400" />
                Confirm Expense
                <span className="text-xs text-gray-500">
                  ({inputSource === 'audio' ? '🎙️ Voice' : '⌨️ Text'})
                </span>
              </h3>
              
              {/* Transcription Display */}
              {transcription && (
                <div className="mb-3 md:mb-4 p-3 bg-[#0a0a0a] rounded-lg border border-gray-700">
                  <p className="text-xs text-gray-500 mb-1">
                    {inputSource === 'audio' ? 'What you said:' : 'What you typed:'}
                  </p>
                  <p className="text-white italic text-sm">"{transcription}"</p>
                </div>
              )}
              
              {/* Amount Input */}
              <div className="mb-3 md:mb-4">
                <label className="text-sm text-gray-400">Amount (₹)</label>
                <input
                  type="number"
                  value={pendingExpense.amount}
                  onChange={(e) => setPendingExpense({...pendingExpense, amount: Number(e.target.value)})}
                  className="w-full mt-1 bg-black border border-gray-700 p-2 md:p-3 rounded-lg text-white text-sm"
                />
              </div>
              
              {/* Category Selection */}
              <div className="mb-4 md:mb-6">
                <label className="text-sm text-gray-400 mb-2 block">
                  Category 
                  {llmSuggestion && (
                    <span className="ml-2 text-xs text-yellow-400">
                      (AI suggested: {llmSuggestion})
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`p-2 md:p-3 rounded-lg border transition-all text-sm ${
                        selectedCategory === cat
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-black border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Learning Info */}
              {llmSuggestion && llmSuggestion !== selectedCategory && (
                <div className="mb-3 md:mb-4 p-3 bg-yellow-900/20 border border-yellow-600 rounded-lg">
                  <p className="text-xs text-yellow-400 flex items-center gap-2">
                    <Brain size={14} />
                    You changed the category! AI will learn from this correction. 🎓
                  </p>
                </div>
              )}
              
              <p className="text-xs text-gray-500 mb-3 md:mb-4">
                💡 Your corrections help the AI learn and improve over time
              </p>
              
              {/* Action Buttons */}
              <div className="flex gap-2 md:gap-3">
                <button
                  onClick={skipExpense}
                  className="flex-1 py-2 md:py-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-sm"
                >
                  Skip
                </button>
                <button
                  onClick={confirmExpense}
                  className="flex-1 py-2 md:py-3 bg-green-600 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  <Check size={16} />
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Charts Section */}
        <div className="bg-[#1a1a1a] rounded-xl p-4 md:p-6 border border-gray-800">
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveChart(t.id)}
                className={`px-3 md:px-4 py-2 rounded whitespace-nowrap text-sm ${
                  activeChart === t.id ? "bg-blue-600" : "bg-gray-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="bg-[#0a0a0a] p-4 md:p-6 rounded-xl border border-gray-800">
            {activeChart === "pie" && (
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie data={expenses} dataKey="amount" nameKey="category" outerRadius={120}>
                    {expenses.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}

            {activeChart === 'bar' && (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={expenses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="category" stroke="#999" angle={-20} textAnchor="end" height={80} />
                  <YAxis stroke="#999" />
                  <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="amount" fill="#4ECDC4" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}

            {activeChart === 'line' && (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={expenses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="category" stroke="#999" />
                  <YAxis stroke="#999" />
                  <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                  <Line type="monotone" dataKey="amount" stroke="#45B7D1" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            )}

            {activeChart === 'area' && (
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={expenses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="category" stroke="#999" />
                  <YAxis stroke="#999" />
                  <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                  <Area type="monotone" dataKey="amount" fill="#98D8C8" stroke="#45B7D1" />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {activeChart === 'radar' && (
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={expenses}>
                  <PolarGrid stroke="#333" />
                  <PolarAngleAxis dataKey="category" stroke="#999" />
                  <PolarRadiusAxis stroke="#999" />
                  <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                  <Radar dataKey="amount" stroke="#FF6B6B" fill="#FF6B6B" fillOpacity={0.6} />
                </RadarChart>
              </ResponsiveContainer>
            )}

            {activeChart === 'budget' && (
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={expenses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="category" stroke="#999" />
                  <YAxis stroke="#999" />
                  <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="budget" fill="#4CAF50" name="Budget" />
                  <Bar dataKey="amount" fill="#FF6B6B" name="Actual" />
                  <Line type="monotone" dataKey="amount" stroke="#FFA726" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}