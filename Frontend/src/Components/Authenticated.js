import { apiRequest } from '../utils/api';

// Get expenses
const fetchExpenses = async () => {
  try {
    const data = await apiRequest('/api/expenses/history');
    console.log(data.expenses);
  } catch (error) {
    console.error('Failed to fetch expenses:', error);
  }
};

// Add expense
const addExpense = async (expense) => {
  try {
    const data = await apiRequest('/api/expenses/confirm', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
    console.log('Expense added:', data);
  } catch (error) {
    console.error('Failed to add expense:', error);
  }
};