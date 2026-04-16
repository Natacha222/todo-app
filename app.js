const { createClient } = supabase;

const sb = createClient(
  'https://kfolabapgitwgdfeaytx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmb2xhYmFwZ2l0d2dkZmVheXR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMjA0NDYsImV4cCI6MjA5MTg5NjQ0Nn0.A36EAWn0sVZSwSBz81GrCHAA8NT3iIhUd-OnLpyqV2U'
);

let currentMode = 'login';
let currentUser = null;
let selectedPriority = 'moyenne';
let currentFilter = 'toutes';
let currentPriorityFilter = 'toutes';

// --- Auth ---

function switchTab(mode) {
  currentMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-btn').textContent = mode === 'login' ? 'Se connecter' : "S'inscrire";
  clearError();
}

async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('auth-btn');

  btn.disabled = true;
  btn.textContent = '...';
  clearError();

  // Validation mot de passe fort à l'inscription uniquement
  if (currentMode === 'signup') {
    const pwdError = validatePassword(password);
    if (pwdError) {
      btn.disabled = false;
      btn.textContent = "S'inscrire";
      showError(pwdError);
      return;
    }
  }

  let result;
  if (currentMode === 'login') {
    result = await sb.auth.signInWithPassword({ email, password });
  } else {
    result = await sb.auth.signUp({ email, password });
  }

  btn.disabled = false;
  btn.textContent = currentMode === 'login' ? 'Se connecter' : "S'inscrire";

  if (result.error) {
    showError(translateError(result.error.message));
    return;
  }

  if (currentMode === 'signup' && !result.data.session) {
    showError('Vérifie ton email pour confirmer ton inscription.');
    return;
  }

  showTodoScreen(result.data.user);
}

async function logout() {
  await sb.auth.signOut();
  document.getElementById('todo-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('email').value = '';
  document.getElementById('password').value = '';
}

function showError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError() {
  document.getElementById('auth-error').classList.add('hidden');
}

function translateError(msg) {
  if (msg.includes('Invalid login')) return 'Email ou mot de passe incorrect.';
  // Message générique pour éviter l'énumération d'emails
  if (msg.includes('already registered')) return 'Email ou mot de passe incorrect.';
  if (msg.includes('Password should')) return 'Le mot de passe doit faire au moins 8 caractères et contenir un chiffre.';
  return msg;
}

function validatePassword(password) {
  if (password.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (!/\d/.test(password))  return 'Le mot de passe doit contenir au moins un chiffre.';
  return null;
}

// --- Todos ---

async function showTodoScreen(user) {
  currentUser = user;
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('todo-screen').classList.remove('hidden');
  document.getElementById('user-email').textContent = user.email;
  await loadTodos();
}

const PRIORITY_ORDER = { haute: 0, moyenne: 1, basse: 2 };
const PRIORITY_LABEL = { haute: 'Haute', moyenne: 'Moyenne', basse: 'Basse' };

let allTodos = [];
let expandedNotes = new Set();

async function loadTodos() {
  const { data, error } = await sb
    .from('todos')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    document.getElementById('todo-list').innerHTML = '<p class="empty-state">Erreur de chargement.</p>';
    return;
  }

  allTodos = data || [];
  renderTodos();
}

function renderTodos() {
  const list = document.getElementById('todo-list');

  const filtered = allTodos.filter(t => {
    const statusOk   = currentFilter === 'toutes' || (currentFilter === 'en_cours' ? !t.completed : t.completed);
    const priorityOk = currentPriorityFilter === 'toutes' || t.priority === currentPriorityFilter;
    return statusOk && priorityOk;
  });

  const total = allTodos.length;
  const done  = allTodos.filter(t => t.completed).length;
  document.getElementById('filter-count').textContent =
    total > 0 ? `${done}/${total} terminée${done > 1 ? 's' : ''}` : '';

  if (filtered.length === 0) {
    const msgs = { toutes: "Aucune tâche pour l'instant. Ajoutez-en une !", en_cours: 'Aucune tâche en cours.', terminees: 'Aucune tâche terminée.' };
    list.innerHTML = `<p class="empty-state">${msgs[currentFilter]}</p>`;
    return;
  }

  list.innerHTML = ''; // reset avant SortableJS
  list.innerHTML = filtered.map(todo => {
    const overdue = !todo.completed && todo.due_date && todo.due_date < today();
    const dueSoon = !todo.completed && !overdue && todo.due_date && todo.due_date === today();
    const p = todo.priority || 'moyenne';
    return `
    <div class="todo-item ${todo.completed ? 'completed' : ''} ${overdue ? 'overdue' : ''}"
         id="todo-${todo.id}">
      <span class="drag-handle" title="${currentFilter === 'toutes' ? 'Glisser pour réorganiser' : 'Disponible en vue Toutes'}">⠿</span>
      <div class="priority-dot dot-${p}" title="${PRIORITY_LABEL[p]}"></div>
      <input
        type="checkbox"
        ${todo.completed ? 'checked' : ''}
        onchange="toggleTodo('${todo.id}', this.checked)"
      />
      <div class="todo-body">
        <span>${escapeHtml(todo.task)}</span>
        <div class="todo-meta">
          <span class="priority-badge badge-${p}">${PRIORITY_LABEL[p]}</span>
          ${todo.due_date ? `<span class="due-badge ${overdue ? 'due-overdue' : dueSoon ? 'due-today' : 'due-normal'}">
            ${overdue ? '⚠ ' : ''}${formatDate(todo.due_date)}
          </span>` : ''}
        </div>
        <div class="notes-section ${expandedNotes.has(todo.id) ? '' : 'hidden'}" id="notes-${todo.id}">
          <textarea
            class="notes-textarea"
            placeholder="Ajouter une note..."
            onblur="saveNote('${todo.id}', this.value)"
            ondragstart="event.stopPropagation()"
          >${escapeHtml(todo.notes || '')}</textarea>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-note ${todo.notes ? 'has-note' : ''}" onclick="toggleNotes('${todo.id}')" title="Notes">📝</button>
        <button class="btn-delete" onclick="deleteTodo('${todo.id}')">×</button>
      </div>
    </div>
  `}).join('');

  initSortable();
}

// --- Notes ---

function toggleNotes(id) {
  if (expandedNotes.has(id)) {
    expandedNotes.delete(id);
  } else {
    expandedNotes.add(id);
  }
  const section = document.getElementById(`notes-${id}`);
  if (section) {
    section.classList.toggle('hidden', !expandedNotes.has(id));
    if (expandedNotes.has(id)) section.querySelector('textarea').focus();
  }
}

async function saveNote(id, value) {
  const notes = value.trim() || null;
  const todo = allTodos.find(t => t.id === id);
  if (!todo || todo.notes === notes) return;
  todo.notes = notes;

  // Met à jour l'icône sans re-rendre toute la liste
  const btn = document.querySelector(`#todo-${id} .btn-note`);
  if (btn) btn.classList.toggle('has-note', !!notes);

  await sb.from('todos').update({ notes }).eq('id', id);
}

// --- Drag & Drop (SortableJS) ---

let sortable = null;

function initSortable() {
  if (sortable) { sortable.destroy(); sortable = null; }

  const list    = document.getElementById('todo-list');
  const canSort = currentFilter === 'toutes';

  // Apparence du handle selon l'état
  list.querySelectorAll('.drag-handle').forEach(h => {
    h.style.cursor  = canSort ? 'grab' : 'not-allowed';
    h.style.opacity = canSort ? '1'    : '0.25';
  });

  if (!canSort) return;

  sortable = new Sortable(list, {
    handle:      '.drag-handle',
    animation:   150,
    ghostClass:  'sortable-ghost',
    dragClass:   'sortable-drag',
    onEnd({ oldIndex, newIndex }) {
      if (oldIndex === newIndex) return;
      const [moved] = allTodos.splice(oldIndex, 1);
      allTodos.splice(newIndex, 0, moved);
      savePositions();
    }
  });
}

async function savePositions() {
  await Promise.all(
    allTodos.map((t, i) =>
      sb.from('todos').update({ position: i }).eq('id', t.id)
    )
  );
}

async function addTodo(e) {
  e.preventDefault();
  const input = document.getElementById('new-task');
  const dueDateInput = document.getElementById('new-due-date');
  const task = input.value.trim();
  if (!task) return;

  const due_date = dueDateInput.value || null;
  input.value = '';
  dueDateInput.value = '';

  const position = allTodos.length;
  const { error } = await sb.from('todos').insert({ task, due_date, priority: selectedPriority, user_id: currentUser.id, position });
  if (error) {
    console.error('Erreur ajout tâche :', error.message);
  } else {
    await loadTodos();
  }
}

async function toggleTodo(id, completed) {
  const todo = allTodos.find(t => t.id === id);
  if (todo) todo.completed = completed;
  renderTodos();
  await sb.from('todos').update({ completed }).eq('id', id);
}

async function deleteTodo(id) {
  const item = document.getElementById(`todo-${id}`);
  if (item) { item.style.opacity = '0'; item.style.transition = 'opacity 0.2s'; }
  setTimeout(async () => {
    allTodos = allTodos.filter(t => t.id !== id);
    renderTodos();
    await sb.from('todos').delete().eq('id', id);
  }, 200);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-group:first-child .filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderTodos();
}

function setPriorityFilter(f) {
  currentPriorityFilter = f;
  document.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderTodos();
}

function selectPriority(p) {
  selectedPriority = p;
  document.querySelectorAll('.priority-btn').forEach(btn => btn.classList.remove('selected'));
  document.querySelector(`.p-${p}`).classList.add('selected');
}

// --- Mot de passe oublié ---

function showForgotView() {
  document.getElementById('auth-form').classList.add('hidden');
  document.getElementById('tabs-row').classList.add('hidden');
  document.getElementById('forgot-view').classList.remove('hidden');
  document.getElementById('reset-email').value = '';
  document.getElementById('forgot-error').classList.add('hidden');
  document.getElementById('forgot-success').classList.add('hidden');
}

function showAuthView() {
  document.getElementById('forgot-view').classList.add('hidden');
  document.getElementById('reset-view').classList.add('hidden');
  document.getElementById('auth-form').classList.remove('hidden');
  document.getElementById('tabs-row').classList.remove('hidden');
}

async function sendResetEmail(e) {
  e.preventDefault();
  const email = document.getElementById('reset-email').value.trim();
  const btn = document.getElementById('forgot-btn');
  btn.disabled = true;
  btn.textContent = '...';

  // URL fixe pour éviter les open redirects
  const safeRedirect = window.location.origin + window.location.pathname;
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: safeRedirect,
  });

  btn.disabled = false;
  btn.textContent = 'Envoyer le lien';

  if (error) {
    const el = document.getElementById('forgot-error');
    el.textContent = error.message.includes('rate limit')
      ? 'Trop de tentatives. Attends quelques minutes avant de réessayer.'
      : error.message;
    el.classList.remove('hidden');
  } else {
    document.getElementById('forgot-success').classList.remove('hidden');
    document.getElementById('forgot-success').textContent = 'Email envoyé ! Vérifie ta boîte mail.';
  }
}

async function updatePassword(e) {
  e.preventDefault();
  const password = document.getElementById('new-password').value;
  const btn = document.getElementById('reset-btn');

  const pwdError = validatePassword(password);
  if (pwdError) { showResetError(pwdError); return; }

  btn.disabled = true;
  btn.textContent = '...';

  const { data, error } = await sb.auth.updateUser({ password });

  btn.disabled = false;
  btn.textContent = 'Enregistrer';

  if (error) {
    showResetError(error.message);
  } else {
    showTodoScreen(data.user);
  }
}

function showResetError(msg) {
  const el = document.getElementById('reset-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// --- Init ---

let recoveryMode = false;

sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryMode = true;
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('todo-screen').classList.add('hidden');
    document.getElementById('auth-form').classList.add('hidden');
    document.getElementById('forgot-view').classList.add('hidden');
    document.getElementById('tabs-row').classList.add('hidden');
    document.getElementById('reset-view').classList.remove('hidden');
    return;
  }

  if (recoveryMode) return;

  if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
    showTodoScreen(session.user);
  }
});
