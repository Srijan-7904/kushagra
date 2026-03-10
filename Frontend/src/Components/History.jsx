// // History Component (FIXED)
// export default function History({ history, expenses }) {
//   const [analysisType, setAnalysisType] = useState("daily"); // daily | weekly | monthly | yearly
//   const [viewType, setViewType] = useState("category"); // category | combined

//   const filterHistoryByType = () => {
//     const now = new Date();

//     return history.filter(item => {
//       const itemDate = new Date(item.timestamp);

//       if (analysisType === "daily") {
//         return itemDate.toDateString() === now.toDateString();
//       }

//       if (analysisType === "weekly") {
//         const diff = (now - itemDate) / (1000 * 60 * 60 * 24);
//         return diff <= 7;
//       }

//       if (analysisType === "monthly") {
//         return (
//           itemDate.getMonth() === now.getMonth() &&
//           itemDate.getFullYear() === now.getFullYear()
//         );
//       }

//       if (analysisType === "yearly") {
//         return itemDate.getFullYear() === now.getFullYear();
//       }

//       return true;
//     });
//   };

//   const filteredHistory = filterHistoryByType();

//   const categoryTotals = filteredHistory.reduce((acc, item) => {
//     acc[item.category] = (acc[item.category] || 0) + item.amount;
//     return acc;
//   }, {});

//   const combinedTotal = filteredHistory.reduce((sum, i) => sum + i.amount, 0);

//   return (
//     <div className="min-h-screen bg-black text-white p-6">
//       <div className="max-w-6xl mx-auto">

//         <h1 className="text-3xl font-bold mb-6">Expense History</h1>

//         {/* Filters */}
//         <div className="flex gap-3 mb-6 flex-wrap">
//           {["daily", "weekly", "monthly", "yearly"].map(type => (
//             <button
//               key={type}
//               onClick={() => setAnalysisType(type)}
//               className={`px-4 py-2 rounded ${
//                 analysisType === type ? "bg-blue-600" : "bg-gray-800"
//               }`}
//             >
//               {type.toUpperCase()}
//             </button>
//           ))}

//           <button
//             onClick={() => setViewType("category")}
//             className={`px-4 py-2 rounded ${viewType === "category" ? "bg-green-600" : "bg-gray-800"}`}
//           >
//             Category-wise
//           </button>

//           <button
//             onClick={() => setViewType("combined")}
//             className={`px-4 py-2 rounded ${viewType === "combined" ? "bg-green-600" : "bg-gray-800"}`}
//           >
//             Combined
//           </button>
//         </div>

//         {/* Analysis */}
//         {viewType === "combined" ? (
//           <div className="bg-[#1a1a1a] p-6 rounded border border-gray-800">
//             <p className="text-gray-400 text-sm">Total Spent</p>
//             <p className="text-3xl font-bold">₹{combinedTotal.toLocaleString()}</p>
//           </div>
//         ) : (
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//             {Object.keys(categoryTotals).length === 0 && (
//               <p className="text-gray-500">No data available</p>
//             )}

//             {Object.entries(categoryTotals).map(([cat, amt]) => (
//               <div
//                 key={cat}
//                 className="bg-[#1a1a1a] p-4 rounded border border-gray-800"
//               >
//                 <p className="text-sm text-gray-400">{cat}</p>
//                 <p className="text-xl font-bold">₹{amt.toLocaleString()}</p>
//               </div>
//             ))}
//           </div>
//         )}

//         {/* Raw history list */}
//         <div className="mt-8">
//           <h2 className="text-xl font-semibold mb-4">Transactions</h2>

//           {filteredHistory.length === 0 && (
//             <p className="text-gray-500">No transactions found</p>
//           )}

//           <div className="space-y-2">
//             {filteredHistory.map(item => (
//               <div
//                 key={item.id}
//                 className="flex justify-between bg-[#1a1a1a] p-3 rounded border border-gray-800"
//               >
//                 <div>
//                   <p className="font-medium">{item.category}</p>
//                   <p className="text-xs text-gray-500">
//                     {new Date(item.timestamp).toLocaleString()}
//                   </p>
//                 </div>
//                 <p className="font-bold">₹{item.amount}</p>
//               </div>
//             ))}
//           </div>
//         </div>

//       </div>
//     </div>
//   );
// }





import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Calendar, Download, TrendingUp, TrendingDown,
  Filter, Search, Trash2, ChevronDown, BarChart3, PieChart as PieChartIcon
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// ============================================
// CONFIGURATION
// ============================================

const BACKEND_URL = window.location.port === '5173' ? "http://localhost:3000" : window.location.origin;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

const formatCurrency = (amount) => {
  return `₹${amount.toLocaleString('en-IN')}`;
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const COLORS = {
  'Utility Bills': '#FF6B6B',
  'Shopping': '#4ECDC4',
  'Food': '#45B7D1',
  'Transport': '#FFA07A',
  'Entertainment': '#98D8C4',
  'Others': '#F7DC6F'
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function History() {
  const navigate = useNavigate();
  
  // State
  const [expenses, setExpenses] = useState([]);
  const [filteredExpenses, setFilteredExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [timeFilter, setTimeFilter] = useState('all'); // all, today, week, month, quarter, year, custom
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  
  // View States
  const [chartType, setChartType] = useState('line'); // line, bar, pie, area, composed
  const [viewMode, setViewMode] = useState('list'); // list, chart, compare
  const [groupBy, setGroupBy] = useState('day'); // day, week, month, quarter, year
  
  // Comparison States
  const [compareMode, setCompareMode] = useState(false);
  const [comparePeriod1, setComparePeriod1] = useState('this_month');
  const [comparePeriod2, setComparePeriod2] = useState('last_month');

  const categories = ['All', 'Utility Bills', 'Shopping', 'Food', 'Transport', 'Entertainment', 'Others'];

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    loadExpenses();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [expenses, searchTerm, selectedCategory, timeFilter, dateRange]);

  // ============================================
  // DATA LOADING
  // ============================================

  const loadExpenses = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/expenses/history`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch expenses');
      }

      const data = await response.json();
      
      if (data.success) {
        setExpenses(data.expenses || []);
      }
    } catch (error) {
      console.error('Failed to load expenses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // FILTERING LOGIC
  // ============================================

  const applyFilters = () => {
    let filtered = [...expenses];

    // Category filter
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(exp => exp.category === selectedCategory);
    }

    // Search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(exp => 
        exp.title?.toLowerCase().includes(search) ||
        exp.description?.toLowerCase().includes(search) ||
        exp.category?.toLowerCase().includes(search)
      );
    }

    // Time filter
    filtered = applyTimeFilter(filtered);

    setFilteredExpenses(filtered);
  };

  const applyTimeFilter = (data) => {
    const now = new Date();
    
    switch(timeFilter) {
      case 'today':
        return data.filter(exp => {
          const expDate = new Date(exp.date);
          return expDate.toDateString() === now.toDateString();
        });
      
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return data.filter(exp => new Date(exp.date) >= weekAgo);
      
      case 'month':
        return data.filter(exp => {
          const expDate = new Date(exp.date);
          return expDate.getMonth() === now.getMonth() && 
                 expDate.getFullYear() === now.getFullYear();
        });
      
      case 'quarter':
        const currentQuarter = Math.floor(now.getMonth() / 3);
        return data.filter(exp => {
          const expDate = new Date(exp.date);
          const expQuarter = Math.floor(expDate.getMonth() / 3);
          return expQuarter === currentQuarter && 
                 expDate.getFullYear() === now.getFullYear();
        });
      
      case 'year':
        return data.filter(exp => 
          new Date(exp.date).getFullYear() === now.getFullYear()
        );
      
      case 'custom':
        if (dateRange.start && dateRange.end) {
          const start = new Date(dateRange.start);
          const end = new Date(dateRange.end);
          return data.filter(exp => {
            const expDate = new Date(exp.date);
            return expDate >= start && expDate <= end;
          });
        }
        return data;
      
      default:
        return data;
    }
  };

  // ============================================
  // DATA PROCESSING FOR CHARTS
  // ============================================

  const getChartData = () => {
    const grouped = {};

    filteredExpenses.forEach(exp => {
      const date = new Date(exp.date);
      let key;

      switch(groupBy) {
        case 'day':
          key = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
          break;
        case 'week':
          const weekNum = Math.ceil(date.getDate() / 7);
          key = `Week ${weekNum}, ${date.toLocaleDateString('en-IN', { month: 'short' })}`;
          break;
        case 'month':
          key = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
          break;
        case 'quarter':
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          key = `Q${quarter} ${date.getFullYear()}`;
          break;
        case 'year':
          key = date.getFullYear().toString();
          break;
        default:
          key = date.toLocaleDateString();
      }

      if (!grouped[key]) {
        grouped[key] = { name: key, total: 0 };
        categories.forEach(cat => {
          if (cat !== 'All') grouped[key][cat] = 0;
        });
      }

      grouped[key].total += exp.amount;
      grouped[key][exp.category] = (grouped[key][exp.category] || 0) + exp.amount;
    });

    return Object.values(grouped).sort((a, b) => {
      // Sort by date
      return new Date(a.name) - new Date(b.name);
    });
  };

  const getPieChartData = () => {
    const categoryTotals = {};

    filteredExpenses.forEach(exp => {
      categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
    });

    return Object.entries(categoryTotals).map(([category, amount]) => ({
      name: category,
      value: amount,
      color: COLORS[category]
    }));
  };

  // ============================================
  // COMPARISON DATA
  // ============================================

  const getComparisonData = () => {
    const period1Data = getPeriodData(comparePeriod1);
    const period2Data = getPeriodData(comparePeriod2);

    return {
      period1: {
        name: getPeriodName(comparePeriod1),
        total: period1Data.reduce((sum, exp) => sum + exp.amount, 0),
        expenses: period1Data,
        byCategory: getCategoryTotals(period1Data)
      },
      period2: {
        name: getPeriodName(comparePeriod2),
        total: period2Data.reduce((sum, exp) => sum + exp.amount, 0),
        expenses: period2Data,
        byCategory: getCategoryTotals(period2Data)
      }
    };
  };

  const getPeriodData = (period) => {
    const now = new Date();
    let start, end;

    switch(period) {
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'this_quarter':
        const currentQuarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), currentQuarter * 3, 1);
        end = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
        break;
      case 'last_quarter':
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        start = new Date(now.getFullYear(), lastQuarter * 3, 1);
        end = new Date(now.getFullYear(), (lastQuarter + 1) * 3, 0);
        break;
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      case 'last_year':
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31);
        break;
      default:
        return [];
    }

    return expenses.filter(exp => {
      const expDate = new Date(exp.date);
      return expDate >= start && expDate <= end;
    });
  };

  const getPeriodName = (period) => {
    const names = {
      'this_month': 'This Month',
      'last_month': 'Last Month',
      'this_quarter': 'This Quarter',
      'last_quarter': 'Last Quarter',
      'this_year': 'This Year',
      'last_year': 'Last Year'
    };
    return names[period] || period;
  };

  const getCategoryTotals = (data) => {
    const totals = {};
    data.forEach(exp => {
      totals[exp.category] = (totals[exp.category] || 0) + exp.amount;
    });
    return totals;
  };

  // ============================================
  // ACTIONS
  // ============================================

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/expenses/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        setExpenses(prev => prev.filter(exp => exp._id !== id));
      }
    } catch (error) {
      console.error('Failed to delete expense:', error);
      alert('Failed to delete expense');
    }
  };

  const exportToCSV = () => {
    if (filteredExpenses.length === 0) {
      alert('No expenses to export');
      return;
    }

    const headers = ['Date', 'Category', 'Description', 'Amount', 'Payment Method'];
    const rows = filteredExpenses.map(exp => [
      formatDate(exp.date),
      exp.category,
      exp.description || exp.title,
      exp.amount,
      exp.paymentMethod || 'N/A'
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const totalAmount = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const avgAmount = filteredExpenses.length > 0 ? totalAmount / filteredExpenses.length : 0;
  const highestExpense = filteredExpenses.reduce((max, exp) => exp.amount > max.amount ? exp : max, { amount: 0 });
  const comparisonData = compareMode ? getComparisonData() : null;

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading expenses...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/home')}
              className="p-2 hover:bg-gray-800 rounded-lg transition"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-3xl font-bold">Expense History & Analytics</h1>
              <p className="text-gray-400">Comprehensive view of your spending patterns</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 bg-green-600 px-4 py-2 rounded-lg hover:bg-green-700 transition"
            >
              <Download size={20} />
              Export CSV
            </button>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[
            { id: 'list', label: 'List View', icon: Filter },
            { id: 'chart', label: 'Charts', icon: BarChart3 },
            { id: 'compare', label: 'Compare', icon: TrendingUp }
          ].map(mode => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                onClick={() => setViewMode(mode.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                  viewMode === mode.id ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <Icon size={18} />
                {mode.label}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="bg-[#1a1a1a] rounded-xl p-6 mb-6 border border-gray-800">
          <h3 className="text-lg font-semibold mb-4">Filters</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search expenses..."
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Time Filter */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Time Period</label>
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* Group By (for charts) */}
            {viewMode === 'chart' && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">Group By</label>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="quarter">Quarterly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
            )}
          </div>

          {/* Custom Date Range */}
          {timeFilter === 'custom' && (
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Start Date</label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">End Date</label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-gray-800">
            <p className="text-gray-400 text-sm mb-1">Total Expenses</p>
            <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
          </div>

          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-gray-800">
            <p className="text-gray-400 text-sm mb-1">Count</p>
            <p className="text-2xl font-bold">{filteredExpenses.length}</p>
          </div>

          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-gray-800">
            <p className="text-gray-400 text-sm mb-1">Average</p>
            <p className="text-2xl font-bold">{formatCurrency(avgAmount)}</p>
          </div>

          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-gray-800">
            <p className="text-gray-400 text-sm mb-1">Highest</p>
            <p className="text-2xl font-bold">{formatCurrency(highestExpense.amount)}</p>
            <p className="text-xs text-gray-500">{highestExpense.category}</p>
          </div>
        </div>

        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="bg-[#1a1a1a] rounded-xl p-6 border border-gray-800">
            <h3 className="text-xl font-semibold mb-4">All Expenses ({filteredExpenses.length})</h3>
            
            {filteredExpenses.length === 0 ? (
              <div className="text-center py-12">
                <Calendar size={48} className="text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No expenses found</h3>
                <p className="text-gray-400">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredExpenses.map((expense, i) => (
                  <div
                    key={expense._id || i}
                    className="bg-black p-4 rounded-lg border border-gray-700 hover:border-gray-600 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span 
                            className="px-3 py-1 rounded-full text-xs font-semibold"
                            style={{ 
                              backgroundColor: `${COLORS[expense.category]}20`,
                              color: COLORS[expense.category]
                            }}
                          >
                            {expense.category}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDate(expense.date)}
                          </span>
                        </div>
                        
                        <h3 className="text-lg font-semibold mb-1">
                          {expense.description || expense.title || 'Expense'}
                        </h3>
                        
                        {expense.paymentMethod && (
                          <p className="text-sm text-gray-400">
                            Payment: {expense.paymentMethod}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-2xl font-bold">{formatCurrency(expense.amount)}</p>
                        </div>
                        
                        <button
                          onClick={() => handleDelete(expense._id)}
                          className="p-2 hover:bg-red-500 hover:bg-opacity-20 rounded-lg transition text-red-500"
                          title="Delete expense"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CHART VIEW */}
        {viewMode === 'chart' && (
          <div className="space-y-6">
            {/* Chart Type Selector */}
            <div className="flex gap-2 overflow-x-auto">
              {[
                { id: 'line', label: 'Line Chart' },
                { id: 'bar', label: 'Bar Chart' },
                { id: 'area', label: 'Area Chart' },
                { id: 'pie', label: 'Pie Chart' },
                { id: 'composed', label: 'Combined' }
              ].map(type => (
                <button
                  key={type.id}
                  onClick={() => setChartType(type.id)}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap transition ${
                    chartType === type.id ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>

            {/* Charts */}
            <div className="bg-[#1a1a1a] rounded-xl p-6 border border-gray-800">
              <h3 className="text-xl font-semibold mb-4">
                Spending Trends ({getPeriodName(groupBy)})
              </h3>
              
              <div className="bg-[#0a0a0a] p-6 rounded-xl border border-gray-800">
                {chartType === 'line' && (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={getChartData()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" stroke="#888" />
                      <YAxis stroke="#888" />
                      <Tooltip 
                        formatter={(value) => formatCurrency(value)}
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="total" stroke="#4ECDC4" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {chartType === 'bar' && (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={getChartData()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" stroke="#888" />
                      <YAxis stroke="#888" />
                      <Tooltip 
                        formatter={(value) => formatCurrency(value)}
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                      />
                      <Legend />
                      {categories.filter(c => c !== 'All').map((category, i) => (
                        <Bar key={category} dataKey={category} fill={COLORS[category]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {chartType === 'area' && (
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={getChartData()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" stroke="#888" />
                      <YAxis stroke="#888" />
                      <Tooltip 
                        formatter={(value) => formatCurrency(value)}
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                      />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="total" 
                        fill="#4ECDC4" 
                        stroke="#4ECDC4"
                        fillOpacity={0.6}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}

                {chartType === 'pie' && (
                  <ResponsiveContainer width="100%" height={400}>
                    <PieChart>
                      <Pie
                        data={getPieChartData()}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={140}
                        label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}
                      >
                        {getPieChartData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}

                {chartType === 'composed' && (
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={getChartData()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" stroke="#888" />
                      <YAxis stroke="#888" />
                      <Tooltip 
                        formatter={(value) => formatCurrency(value)}
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                      />
                      <Legend />
                      <Bar dataKey="total" fill="#4ECDC4" />
                      <Line type="monotone" dataKey="total" stroke="#FF6B6B" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}

        {/* COMPARE VIEW */}
        {viewMode === 'compare' && (
          <div className="space-y-6">
            {/* Comparison Selectors */}
            <div className="bg-[#1a1a1a] rounded-xl p-6 border border-gray-800">
              <h3 className="text-lg font-semibold mb-4">Select Periods to Compare</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Period 1</label>
                  <select
                    value={comparePeriod1}
                    onChange={(e) => setComparePeriod1(e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="this_month">This Month</option>
                    <option value="last_month">Last Month</option>
                    <option value="this_quarter">This Quarter</option>
                    <option value="last_quarter">Last Quarter</option>
                    <option value="this_year">This Year</option>
                    <option value="last_year">Last Year</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Period 2</label>
                  <select
                    value={comparePeriod2}
                    onChange={(e) => setComparePeriod2(e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="this_month">This Month</option>
                    <option value="last_month">Last Month</option>
                    <option value="this_quarter">This Quarter</option>
                    <option value="last_quarter">Last Quarter</option>
                    <option value="this_year">This Year</option>
                    <option value="last_year">Last Year</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Comparison Results */}
            {comparisonData && (
              <>
                {/* Total Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[#1a1a1a] rounded-xl p-6 border border-gray-800">
                    <h3 className="text-lg font-semibold mb-4">{comparisonData.period1.name}</h3>
                    <p className="text-4xl font-bold mb-2">{formatCurrency(comparisonData.period1.total)}</p>
                    <p className="text-gray-400">{comparisonData.period1.expenses.length} expenses</p>
                  </div>

                  <div className="bg-[#1a1a1a] rounded-xl p-6 border border-gray-800">
                    <h3 className="text-lg font-semibold mb-4">{comparisonData.period2.name}</h3>
                    <p className="text-4xl font-bold mb-2">{formatCurrency(comparisonData.period2.total)}</p>
                    <p className="text-gray-400">{comparisonData.period2.expenses.length} expenses</p>
                  </div>
                </div>

                {/* Difference */}
                <div className="bg-[#1a1a1a] rounded-xl p-6 border border-gray-800">
                  <h3 className="text-lg font-semibold mb-4">Difference</h3>
                  {(() => {
                    const diff = comparisonData.period1.total - comparisonData.period2.total;
                    const percentChange = comparisonData.period2.total > 0 
                      ? ((diff / comparisonData.period2.total) * 100).toFixed(1)
                      : 0;
                    const isIncrease = diff > 0;

                    return (
                      <div className="flex items-center gap-4">
                        {isIncrease ? (
                          <TrendingUp size={48} className="text-red-500" />
                        ) : (
                          <TrendingDown size={48} className="text-green-500" />
                        )}
                        <div>
                          <p className={`text-3xl font-bold ${isIncrease ? 'text-red-500' : 'text-green-500'}`}>
                            {isIncrease ? '+' : ''}{formatCurrency(Math.abs(diff))}
                          </p>
                          <p className="text-gray-400">
                            {isIncrease ? 'More' : 'Less'} spending ({Math.abs(percentChange)}%)
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Category-wise Comparison */}
                <div className="bg-[#1a1a1a] rounded-xl p-6 border border-gray-800">
                  <h3 className="text-lg font-semibold mb-4">Category-wise Comparison</h3>
                  
                  <div className="space-y-4">
                    {categories.filter(c => c !== 'All').map(category => {
                      const amount1 = comparisonData.period1.byCategory[category] || 0;
                      const amount2 = comparisonData.period2.byCategory[category] || 0;
                      const diff = amount1 - amount2;

                      return (
                        <div key={category} className="bg-black p-4 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold">{category}</span>
                            <span className={diff > 0 ? 'text-red-500' : 'text-green-500'}>
                              {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-400">{comparisonData.period1.name}</p>
                              <p className="font-bold">{formatCurrency(amount1)}</p>
                            </div>
                            <div>
                              <p className="text-gray-400">{comparisonData.period2.name}</p>
                              <p className="font-bold">{formatCurrency(amount2)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}













