// Todo module

// Todo structure: { id, title, completed, priority, dueDate }
// priority: 'low', 'medium', 'high' (optional)
// dueDate: YYYY-MM-DD (optional)

let todos = [];

// Load todos from localStorage
function loadTodos() {
  try {
    const saved = window.loadFromStorage('todos');
    if (saved) {
      todos = saved;
    }
  } catch (e) {
    if (window.debugError) window.debugError('todo', 'Failed to load todos:', e);
    todos = [];
  }
}

function saveTodos() {
  window.saveToStorage('todos', todos);
}

// Generate unique ID
function generateTodoId() {
  return 'todo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Get next N incomplete todos, sorted by priority and due date - uses backend processing
async function getNextTodos(count = 5) {
  if (todos.length === 0) return [];

  try {
    const res = await fetch(`/api/todos/process?count=${count}&includeCompleted=false`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(todos),
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      if (data.todos) {
        return data.todos;
      }
    }
  } catch (e) {
    if (window.debugError) window.debugError('todo', 'Error processing todos:', e);
  }

  // Backend processing failed - return empty array
  return [];
}

// Format date for display
function formatTodoDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = date - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
  if (diffDays <= 7) return `In ${diffDays} days`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get priority color class
function getPriorityClass(priority) {
  if (!priority) return '';
  return 'priority-' + priority;
}

// Get priority icon
function getPriorityIcon(priority) {
  if (!priority) return '';
  const icons = {
    low: 'fa-circle',
    medium: 'fa-circle',
    high: 'fa-circle'
  };
  return icons[priority] || '';
}

// Render next todos module - uses backend processing
async function renderNextTodos() {
  const container = document.getElementById('nextTodosList');
  if (!container) return;

  const nextTodos = await getNextTodos(5);

  if (nextTodos.length === 0) {
    container.innerHTML = '<div class="muted" style="padding:8px 0;">No todos</div>';
    return;
  }

  let html = '';
  for (const todo of nextTodos) {
    const priorityClass = getPriorityClass(todo.priority);
    const priorityIcon = getPriorityIcon(todo.priority);
    // Use formatted date from backend
    const formattedDate = todo.formattedDueDate || '';
    const dueDateHtml = formattedDate ? `<div class="muted" style="font-size:0.85em; margin-top:4px;">${formattedDate}</div>` : '';
    const priorityIconHtml = todo.priority ? `<i class="fas ${priorityIcon} todo-priority-icon ${priorityClass}" title="${todo.priority} priority"></i>` : '';

    html += `
      <div class="kv" style="flex-direction:column; align-items:flex-start; gap:4px; padding:8px 0; border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:8px; width:100%;">
          <input type="checkbox" class="todo-checkbox" data-todo-id="${todo.id}" ${todo.completed ? 'checked' : ''} style="cursor:pointer;">
          <div class="v" style="flex:1; font-weight:500;">${escapeHtml(todo.title)}</div>
          ${priorityIconHtml}
        </div>
        ${dueDateHtml}
      </div>
    `;
  }
  container.innerHTML = html;

  // Attach checkbox handlers
  container.querySelectorAll('.todo-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-todo-id');
      toggleTodo(id);
    });
  });
}

// Toggle todo completion
function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    saveTodos();
    renderNextTodos(); // renderNextTodos is now async but we don't await it (fire and forget)
    renderTodosPreferenceList();
  }
}

function moveTodoUp(index) {
  if (window.moveArrayItemUp && window.moveArrayItemUp(todos, index)) {
    saveTodos();
    renderTodosPreferenceList();
    renderNextTodos(); // renderNextTodos is now async but we don't await it (fire and forget)
  }
}

function moveTodoDown(index) {
  if (window.moveArrayItemDown && window.moveArrayItemDown(todos, index)) {
    saveTodos();
    renderTodosPreferenceList();
    renderNextTodos(); // renderNextTodos is now async but we don't await it (fire and forget)
  }
}

function moveTodo(fromIndex, toIndex) {
  if (window.moveArrayItem && window.moveArrayItem(todos, fromIndex, toIndex)) {
    saveTodos();
    renderTodosPreferenceList();
    renderNextTodos(); // renderNextTodos is now async but we don't await it (fire and forget)
  }
}

// Render todos list in preferences
function renderTodosPreferenceList() {
  const list = document.getElementById('todosList');
  if (!list) return;

  list.innerHTML = '';

  if (todos.length === 0) {
    list.innerHTML = '<div class="small" style="color:var(--muted);padding:10px;">No todos yet. Click "Add" to create one.</div>';
    return;
  }

  todos.forEach((todo, index) => {
    const item = document.createElement('div');
    item.className = 'module-item' + (todo.completed ? ' completed' : '');
    item.draggable = true;
    item.dataset.index = index;
    item.dataset.todoId = todo.id;
    const canMoveUp = index > 0;
    const canMoveDown = index < todos.length - 1;
    const priorityClass = getPriorityClass(todo.priority);
    const priorityBadge = todo.priority ? `<span class="todo-priority ${priorityClass}">${todo.priority}</span>` : '';
    const dueDateText = todo.dueDate ? ` - ${formatTodoDate(todo.dueDate)}` : '';

    item.innerHTML = `
      <div class="module-icon drag-handle" style="cursor: grab; color: var(--muted);" title="Drag to reorder">
        <i class="fas fa-grip-vertical"></i>
      </div>
      <div class="module-icon"><i class="fas fa-tasks"></i></div>
      <div class="module-info">
        <div class="module-name" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" class="todo-list-checkbox" data-todo-id="${todo.id}" ${todo.completed ? 'checked' : ''} style="cursor:pointer;">
          <span>${window.escapeHtml(todo.title)}</span>
          ${priorityBadge}
        </div>
        <div class="module-desc">${todo.completed ? 'Completed' : 'Active'}${dueDateText}</div>
      </div>
      <div class="module-controls">
        <button class="btn-small move-todo-up-btn" data-index="${index}" ${!canMoveUp ? 'disabled' : ''} title="Move up">
          <i class="fas fa-arrow-up"></i>
        </button>
        <button class="btn-small move-todo-down-btn" data-index="${index}" ${!canMoveDown ? 'disabled' : ''} title="Move down">
          <i class="fas fa-arrow-down"></i>
        </button>
        <button class="btn-small edit-todo-btn" data-index="${index}"><i class="fas fa-edit"></i></button>
        <button class="btn-small delete-todo-btn" data-index="${index}"><i class="fas fa-trash"></i></button>
      </div>
    `;
    list.appendChild(item);

    // Setup drag and drop using common function
    if (window.setupDragAndDrop) {
      window.setupDragAndDrop(item, index, todos, (fromIndex, toIndex) => {
        moveTodo(fromIndex, toIndex);
      }, () => {
        saveTodos();
        renderTodosPreferenceList();
        renderNextTodos(); // renderNextTodos is now async but we don't await it (fire and forget)
      });
    }

    // Setup move buttons using common function
    if (window.setupMoveButtons) {
      window.setupMoveButtons(item, index, todos.length,
        'move-todo-up-btn', 'move-todo-down-btn',
        () => moveTodoUp(index),
        () => moveTodoDown(index)
      );
    }

    item.querySelector('.edit-todo-btn').addEventListener('click', () => {
      editTodo(todo.id);
    });

    item.querySelector('.delete-todo-btn').addEventListener('click', () => {
      deleteTodo(todo.id);
    });

    item.querySelector('.todo-list-checkbox').addEventListener('change', (e) => {
      toggleTodo(todo.id);
    });
  });
}

// Show todo form for add/edit
function showTodoForm(todo = null) {
  const form = document.getElementById('todoForm');
  if (!form) return;

  form.style.display = 'block';

  document.getElementById('todo-id').value = todo ? todo.id : '';
  document.getElementById('todo-title').value = todo ? todo.title : '';
  document.getElementById('todo-priority').value = todo ? (todo.priority || '') : '';
  document.getElementById('todo-due-date').value = todo ? (todo.dueDate || '') : '';

  document.getElementById('todo-title').focus();
}

function hideTodoForm() {
  const form = document.getElementById('todoForm');
  if (form) form.style.display = 'none';
}

function editTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    showTodoForm(todo);
  }
}

function deleteTodo(id) {
  if (!confirm('Delete this todo?')) return;

  todos = todos.filter(t => t.id !== id);
  saveTodos();
  renderTodosPreferenceList();
  renderNextTodos(); // renderNextTodos is now async but we don't await it (fire and forget)
}

async function saveTodoFromForm() {
  const id = document.getElementById('todo-id').value;
  const title = document.getElementById('todo-title').value.trim();
  const priority = document.getElementById('todo-priority').value;
  const dueDate = document.getElementById('todo-due-date').value;

  // Validate using backend
  try {
    const res = await fetch('/api/utils/validate-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'todo',
        data: { title, priority, dueDate }
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.valid) {
        alert(data.error || 'Validation failed');
        return;
      }
    }
  } catch (e) {
    // Fallback to client-side validation if backend fails
    if (!title) {
      alert('Title is required');
      return;
    }
  }

  if (id) {
    // Edit existing
    const idx = todos.findIndex(t => t.id === id);
    if (idx !== -1) {
      todos[idx] = {
        ...todos[idx],
        title,
        priority: priority || undefined,
        dueDate: dueDate || undefined
      };
    }
  } else {
    // Add new
    todos.push({
      id: generateTodoId(),
      title,
      completed: false,
      priority: priority || undefined,
      dueDate: dueDate || undefined
    });
  }

  saveTodos();
  hideTodoForm();
  renderTodosPreferenceList();
  renderNextTodos(); // renderNextTodos is now async but we don't await it (fire and forget)
}

// Using escapeHtml from core.js

// Initialize todo module
async function initTodo() {
  loadTodos();
  await renderNextTodos();

  // Add todo button in preferences
  const addBtn = document.getElementById('addTodoBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => showTodoForm());
  }

  // Save button in form
  const saveBtn = document.getElementById('saveTodoBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveTodoFromForm);
  }

  // Cancel button in form
  const cancelBtn = document.getElementById('cancelTodoBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', hideTodoForm);
  }
}

// Expose functions globally
window.initTodo = initTodo;
window.renderNextTodos = renderNextTodos;
window.renderTodosPreferenceList = renderTodosPreferenceList;
