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

// Format date for datetime-local input (YYYY-MM-DDTHH:MM)
function formatDateForInput(dateString) {
  if (!dateString) return '';

  // If it's already in YYYY-MM-DDTHH:MM format, return as-is
  if (dateString.includes('T')) return dateString;

  // If it's just YYYY-MM-DD, append default time 09:00
  return `${dateString}T09:00`;
}

// Parse datetime-local value to date string (YYYY-MM-DD)
function parseDateFromInput(datetimeString) {
  if (!datetimeString) return undefined;

  // Extract just the date part (before 'T') since backend expects YYYY-MM-DD format
  if (datetimeString.includes('T')) {
    return datetimeString.split('T')[0];
  }
  return datetimeString; // Fallback, though datetime-local should always have 'T'
}

// Get next N incomplete todos in list order (matches drag order in storage), with formatted dates from backend
async function getNextTodos(count = 5) {
  if (todos.length === 0) return [];

  try {
    const res = await fetch(`/api/todos/process?count=${count}&includeCompleted=false&preserveOrder=true`, {
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

// Date formatting is now handled by backend - todos include formattedDueDate field

// Get priority color class
function getPriorityClass(priority) {
  if (!priority) return '';
  return 'priority-' + priority;
}

// Render next todos module - uses backend processing (same row layout as Preferences → Todos)
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
    const index = todos.findIndex(t => t.id === todo.id);
    const canMoveUp = index > 0;
    const canMoveDown = index >= 0 && index < todos.length - 1;
    const priorityClass = getPriorityClass(todo.priority);
    const priorityBadge = todo.priority
      ? `<span class="todo-priority ${priorityClass}">${window.escapeHtml(todo.priority)}</span>`
      : '';
    const formattedDate = todo.formattedDueDate || '';
    const dueDateText = formattedDate ? ` - ${formattedDate}` : '';

    html += `
      <div class="module-item todo-next-card-item${todo.completed ? ' completed' : ''}" data-todo-id="${todo.id}" draggable="false">
        <div class="module-icon todo-reorder-handle" style="color: var(--muted);" title="Drag to reorder todos" aria-label="Reorder todo">
          <i class="fas fa-grip-vertical"></i>
        </div>
        <div class="module-info">
          <div class="module-name" style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" class="todo-list-checkbox todo-checkbox" data-todo-id="${todo.id}" ${todo.completed ? 'checked' : ''} style="cursor:pointer;">
            <span>${window.escapeHtml(todo.title)}</span>
            ${priorityBadge}
          </div>
          <div class="module-desc">${todo.completed ? 'Completed' : 'Active'}${dueDateText}</div>
        </div>
        <div class="module-controls">
          <button type="button" class="btn-small move-todo-up-btn" data-todo-id="${todo.id}" ${!canMoveUp ? 'disabled' : ''} title="Move up">
            <i class="fas fa-arrow-up"></i>
          </button>
          <button type="button" class="btn-small move-todo-down-btn" data-todo-id="${todo.id}" ${!canMoveDown ? 'disabled' : ''} title="Move down">
            <i class="fas fa-arrow-down"></i>
          </button>
          <button type="button" class="btn-small edit-todo-btn" data-todo-id="${todo.id}" title="Edit"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn-small delete-todo-btn" data-todo-id="${todo.id}" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;

  container.querySelectorAll('.todo-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const id = checkbox.getAttribute('data-todo-id');
      toggleTodo(id);
    });
  });

  container.querySelectorAll('.edit-todo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editTodo(btn.getAttribute('data-todo-id'));
    });
  });

  container.querySelectorAll('.delete-todo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteTodo(btn.getAttribute('data-todo-id'));
    });
  });

  container.querySelectorAll('.move-todo-up-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-todo-id');
      const idx = todos.findIndex(t => t.id === id);
      if (idx >= 0) moveTodoUp(idx);
    });
  });

  container.querySelectorAll('.move-todo-down-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-todo-id');
      const idx = todos.findIndex(t => t.id === id);
      if (idx >= 0) moveTodoDown(idx);
    });
  });

  container.querySelectorAll('.todo-next-card-item').forEach(el => {
    const id = el.getAttribute('data-todo-id');
    const idx = todos.findIndex(t => t.id === id);
    const handle = el.querySelector('.todo-reorder-handle');
    if (idx < 0 || !handle || !window.setupDragAndDrop) return;
    window.setupDragAndDrop(
      el,
      idx,
      todos,
      (fromIndex, toIndex) => moveTodo(fromIndex, toIndex),
      () => {
        saveTodos();
        renderTodosPreferenceList();
        renderNextTodos();
      },
      handle
    );
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
async function renderTodosPreferenceList() {
  const list = document.getElementById('todosList');
  if (!list) return;

  list.innerHTML = '';

  if (todos.length === 0) {
    list.innerHTML = '<div class="small" style="color:var(--muted);padding:10px;">No todos yet. Click "Add" to create one.</div>';
    return;
  }

  // Get formatted dates from backend for all todos
  let formattedTodos = [];
  try {
    const res = await fetch(`/api/todos/process?count=${todos.length}&includeCompleted=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(todos),
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      if (data.todos && Array.isArray(data.todos)) {
        formattedTodos = data.todos;
      }
    }
  } catch (e) {
    if (window.debugError) window.debugError('todo', 'Error getting formatted todos:', e);
  }

  // Create a map of formatted todos by ID for quick lookup
  const formattedMap = new Map();
  formattedTodos.forEach(t => formattedMap.set(t.id, t));

  todos.forEach((todo, index) => {
    const item = document.createElement('div');
    item.className = 'module-item' + (todo.completed ? ' completed' : '');
    item.draggable = false;
    item.dataset.index = index;
    item.dataset.todoId = todo.id;
    const canMoveUp = index > 0;
    const canMoveDown = index < todos.length - 1;
    const priorityClass = getPriorityClass(todo.priority);
    const priorityBadge = todo.priority ? `<span class="todo-priority ${priorityClass}">${todo.priority}</span>` : '';
    // Use formatted date from backend if available
    const formattedTodo = formattedMap.get(todo.id);
    const dueDateText = formattedTodo && formattedTodo.formattedDueDate ? ` - ${formattedTodo.formattedDueDate}` : (todo.dueDate ? ` - ${todo.dueDate}` : '');

    item.innerHTML = `
      <div class="module-icon todo-reorder-handle" style="cursor: grab; color: var(--muted);" title="Drag to reorder todos">
        <i class="fas fa-grip-vertical"></i>
      </div>
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
      const reorderHandle = item.querySelector('.todo-reorder-handle');
      window.setupDragAndDrop(
        item,
        index,
        todos,
        (fromIndex, toIndex) => moveTodo(fromIndex, toIndex),
        () => {
          saveTodos();
          renderTodosPreferenceList();
          renderNextTodos(); // renderNextTodos is now async but we don't await it (fire and forget)
        },
        reorderHandle
      );
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

function editTodo(id) {
  const index = todos.findIndex(t => t.id === id);
  if (index >= 0) {
    showTodoEditDialog(index);
  }
}

async function deleteTodo(id) {
  const confirmed = await window.popup.confirm('Delete this todo?', 'Confirm Delete');
  if (!confirmed) return;

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
        await window.popup.alert(data.error || 'Validation failed', 'Validation Error');
        return;
      }
    } else {
      await window.popup.alert('Validation error: Unable to validate input', 'Error');
      return;
    }
  } catch (e) {
    if (window.debugError) window.debugError('todo', 'Error validating todo:', e);
    await window.popup.alert('Validation error: Unable to connect to server', 'Error');
    return;
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

function showTodoEditDialog(index) {
  const todo = index >= 0 ? todos[index] : { title: '', priority: '', dueDate: '' };
  const isNew = index < 0;

  // Convert dueDate to datetime-local format (YYYY-MM-DDTHH:MM)
  const dueDateValue = todo.dueDate ? formatDateForInput(todo.dueDate) : '';

  const fields = [
    {
      id: 'title',
      label: 'Title',
      type: 'text',
      placeholder: 'Todo title',
      required: true
    },
    {
      id: 'priority',
      label: 'Priority',
      type: 'select',
      options: [
        { value: '', label: 'None' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' }
      ],
      required: false
    },
    {
      id: 'dueDate',
      label: 'Due Date & Time',
      type: 'datetime-local',
      required: false
    }
  ];

  const values = {
    ...todo,
    dueDate: dueDateValue
  };

  showModuleEditDialog({
    title: `${isNew ? 'Add' : 'Edit'} Todo`,
    icon: 'fas fa-tasks',
    fields: fields,
    values: values,
    onSave: async (formData) => {
      const title = formData.title.trim();
      const priority = formData.priority;
      const dueDate = parseDateFromInput(formData.dueDate);

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
            await window.popup.alert(data.error || 'Validation failed', 'Validation Error');
            return;
          }
        } else {
          await window.popup.alert('Validation error: Unable to validate input', 'Error');
          return;
        }
      } catch (e) {
        if (window.debugError) window.debugError('todo', 'Error validating todo:', e);
        await window.popup.alert('Validation error: Unable to connect to server', 'Error');
        return;
      }

      if (isNew) {
        const newTodo = {
          id: generateTodoId(),
          title,
          priority: priority || undefined,
          dueDate: dueDate || undefined,
          completed: false
        };
        todos.push(newTodo);
      } else {
        todos[index].title = title;
        todos[index].priority = priority || undefined;
        todos[index].dueDate = dueDate || undefined;
      }

      saveTodos();
      renderTodosPreferenceList();
      renderNextTodos();
    }
  });
}

// Initialize todo module
async function initTodo() {
  loadTodos();
  await renderNextTodos();

  // Add todo button in preferences
  const addBtn = document.getElementById('addTodoBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => showTodoEditDialog(-1));
  }

  const todoCardAdd = document.getElementById('todoCardAddBtn');
  if (todoCardAdd) {
    todoCardAdd.addEventListener('click', () => showTodoEditDialog(-1));
  }
}

// Expose functions globally
window.initTodo = initTodo;
window.renderNextTodos = renderNextTodos;
window.renderTodosPreferenceList = renderTodosPreferenceList;
window.showTodoEditDialog = showTodoEditDialog;
