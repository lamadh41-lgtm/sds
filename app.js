import { 
  auth, db, storage,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updateProfile, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, query, where, orderBy, limit, serverTimestamp, onSnapshot,
  ref, uploadBytes, getDownloadURL
} from './firebase.js';

// ===== Helpers =====
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
  }
  const id = 'toast-' + Date.now();
  const bg = type === 'success' ? 'bg-success' : type === 'error' ? 'bg-danger' : 'bg-primary';
  container.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast align-items-center text-white ${bg} border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `);
  const toastEl = document.getElementById(id);
  const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

function showLoading(show = true) {
  let el = document.getElementById('loadingOverlay');
  if (!el && show) {
    el = document.createElement('div');
    el.id = 'loadingOverlay';
    el.className = 'spinner-overlay';
    el.innerHTML = '<div class="spinner-border text-primary" style="width:3rem;height:3rem;"></div>';
    document.body.appendChild(el);
  }
  if (el) el.classList.toggle('d-none', !show);
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

// ===== Ensure Login/Register Modals exist on every page =====
function ensureAuthModals() {
  if (!document.getElementById('loginModal')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="loginModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="fas fa-sign-in-alt me-2"></i>تسجيل الدخول</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="loginForm">
                <div class="mb-3">
                  <label class="form-label">البريد الإلكتروني</label>
                  <input type="email" class="form-control" id="loginEmail" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">كلمة المرور</label>
                  <input type="password" class="form-control" id="loginPassword" required>
                </div>
                <button type="submit" class="btn btn-primary-custom text-white w-100">دخول</button>
              </form>
              <p class="text-center mt-3 mb-0">ليس لديك حساب؟ <a href="#" id="switchToRegister">إنشاء حساب</a></p>
            </div>
          </div>
        </div>
      </div>`);
  }
  if (!document.getElementById('registerModal')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="registerModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="fas fa-user-plus me-2"></i>إنشاء حساب جديد</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="registerForm">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">الاسم الكامل *</label>
                    <input type="text" class="form-control" id="regName" required>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">البريد الإلكتروني *</label>
                    <input type="email" class="form-control" id="regEmail" required>
                  </div>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">رقم الهاتف *</label>
                    <input type="tel" class="form-control" id="regPhone" placeholder="01xxxxxxxxx" required>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">كلمة المرور *</label>
                    <input type="password" class="form-control" id="regPassword" required minlength="6">
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">تأكيد كلمة المرور *</label>
                  <input type="password" class="form-control" id="regPassword2" required>
                </div>
                <div class="form-check mb-2">
                  <input class="form-check-input" type="checkbox" id="agreePrivacy" required>
                  <label class="form-check-label" for="agreePrivacy">أوافق على <a href="privacy.html" target="_blank">سياسة الخصوصية</a></label>
                </div>
                <div class="form-check mb-3">
                  <input class="form-check-input" type="checkbox" id="agreeTerms" required>
                  <label class="form-check-label" for="agreeTerms">أوافق على <a href="terms.html" target="_blank">الشروط والأحكام</a></label>
                </div>
                <button type="submit" class="btn btn-primary-custom text-white w-100">إنشاء الحساب</button>
              </form>
            </div>
          </div>
        </div>
      </div>`);
  }
  // Re-bind forms if newly injected
  bindAuthForms();
  document.getElementById('switchToRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    bootstrap.Modal.getInstance(document.getElementById('loginModal'))?.hide();
    new bootstrap.Modal(document.getElementById('registerModal')).show();
  });
}

let authFormsBound = false;
function bindAuthForms() {
  if (authFormsBound) return;
  const loginForm = document.getElementById('loginForm');
  const regForm = document.getElementById('registerForm');
  if (!loginForm || !regForm) return;
  authFormsBound = true;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value;
    showLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      showToast('تم تسجيل الدخول بنجاح');
      bootstrap.Modal.getInstance(document.getElementById('loginModal'))?.hide();
    } catch (err) {
      showToast(err.message.includes('wrong-password') || err.message.includes('user-not-found') || err.message.includes('invalid-credential')
        ? 'بيانات الدخول غير صحيحة' : 'حدث خطأ', 'error');
    } finally {
      showLoading(false);
    }
  });

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone')?.value.trim() || '';
    const pass = document.getElementById('regPassword').value;
    const pass2 = document.getElementById('regPassword2').value;
    if (!phone) { showToast('يجب إدخال رقم الهاتف', 'error'); return; }
    if (pass !== pass2) { showToast('كلمتا المرور غير متطابقتين', 'error'); return; }
    if (!document.getElementById('agreePrivacy')?.checked || !document.getElementById('agreeTerms')?.checked) {
      showToast('يجب الموافقة على سياسة الخصوصية والشروط', 'error'); return;
    }
    showLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, 'users', cred.user.uid), {
        name, email, phone, createdAt: serverTimestamp(),
        banned: false, deleted: false, role: 'user', bio: ''
      });
      showToast('تم إنشاء الحساب بنجاح! مرحباً بك');
      bootstrap.Modal.getInstance(document.getElementById('registerModal'))?.hide();
    } catch (err) {
      showToast(err.message.includes('email-already-in-use') ? 'البريد مستخدم مسبقاً' : 'حدث خطأ أثناء التسجيل', 'error');
    } finally {
      showLoading(false);
    }
  });
}

// Call early
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureAuthModals);
} else {
  ensureAuthModals();
}

// ===== Auth State =====
let currentUser = null;
let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  const authArea = document.getElementById('authArea');
  if (!authArea) return;

  if (user) {
    // Load user data from Firestore
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    currentUserData = snap.exists() ? snap.data() : { name: user.displayName || 'مستخدم', email: user.email };

    // Check if banned
    if (currentUserData.banned) {
      await signOut(auth);
      showToast('تم حظر حسابك من المتجر. تواصل مع الدعم.', 'error');
      return;
    }

    const initials = getInitials(currentUserData.name || user.displayName);
    authArea.innerHTML = `
      <div class="dropdown" id="notifDropdown">
        <button class="btn btn-outline-secondary btn-sm position-relative" data-bs-toggle="dropdown" data-bs-auto-close="outside" id="notifBtn" title="الإشعارات">
          <i class="fas fa-bell"></i>
          <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger d-none" id="notifBadge">0</span>
        </button>
        <div class="dropdown-menu dropdown-menu-end notif-menu p-0" style="min-width:320px;max-height:400px;overflow-y:auto;">
          <div class="p-2 border-bottom d-flex justify-content-between align-items-center bg-light">
            <strong><i class="fas fa-bell me-1"></i> الإشعارات</strong>
            <button class="btn btn-sm btn-link text-decoration-none p-0" id="markAllRead">تعليم الكل كمقروء</button>
          </div>
          <div id="notifList" class="p-2"><div class="text-center text-muted small py-3">جاري التحميل...</div></div>
        </div>
      </div>
      <div class="dropdown">
        <div class="d-flex align-items-center gap-2" data-bs-toggle="dropdown" style="cursor:pointer;">
          <div class="user-avatar">${initials}</div>
          <span class="d-none d-md-inline fw-semibold">${currentUserData.name || 'حسابي'}</span>
        </div>
        <ul class="dropdown-menu dropdown-menu-end">
          <li><a class="dropdown-item" href="account.html"><i class="fas fa-user me-2"></i>حسابي</a></li>
          <li><a class="dropdown-item" href="purchases.html"><i class="fas fa-shopping-bag me-2"></i>مشترياتي</a></li>
          <li><a class="dropdown-item" href="#" id="openUploadBtn"><i class="fas fa-cloud-upload-alt me-2"></i>شارك إبداعاتك</a></li>
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item text-danger" href="#" id="logoutBtn"><i class="fas fa-sign-out-alt me-2"></i>تسجيل الخروج</a></li>
        </ul>
      </div>
    `;

    document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await signOut(auth);
      showToast('تم تسجيل الخروج بنجاح');
      setTimeout(() => location.href = 'index.html', 800);
    });

    document.getElementById('openUploadBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = new bootstrap.Modal(document.getElementById('uploadModal'));
      modal.show();
    });

    loadUserNotifications(user.uid);
    document.getElementById('notifBtn')?.addEventListener('show.bs.dropdown', () => markNotificationsRead(user.uid));
    initSupportWidget(user);
  } else {
    currentUserData = null;
    ensureAuthModals();
    authArea.innerHTML = `
      <button class="btn btn-outline-primary btn-sm" id="openLoginBtn">تسجيل الدخول</button>
      <button class="btn btn-primary-custom btn-sm text-white" id="openRegisterBtn">إنشاء حساب</button>
    `;
    document.getElementById('openLoginBtn')?.addEventListener('click', () => {
      ensureAuthModals();
      new bootstrap.Modal(document.getElementById('loginModal')).show();
    });
    document.getElementById('openRegisterBtn')?.addEventListener('click', () => {
      ensureAuthModals();
      new bootstrap.Modal(document.getElementById('registerModal')).show();
    });
    initSupportWidget(null);
  }
});

// Auth forms handled by bindAuthForms()

function getDriveImageUrl(link) {
  if (!link) return '';
  let id = '';
  const match1 = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const match2 = link.match(/id=([a-zA-Z0-9_-]+)/);
  if (match1) id = match1[1];
  else if (match2) id = match2[1];
  if (id) return `https://drive.google.com/uc?export=view&id=${id}`;
  return link;
}

let isPublishing = false;
document.getElementById('uploadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isPublishing) return;
  if (!currentUser) {
    showToast('يجب تسجيل الدخول أولاً', 'error');
    return;
  }

  const title = document.getElementById('projTitle').value.trim();
  const desc = document.getElementById('projDesc').value.trim();
  const price = parseFloat(document.getElementById('projPrice').value) || 0;
  let payMethod = document.getElementById('projPayMethod')?.value || '';
  let payNumber = document.getElementById('projPayNumber')?.value.trim() || '';
  let payName = document.getElementById('projPayName')?.value.trim() || '';
  const thumbLink = document.getElementById('projThumbLink').value.trim();
  const filesLink = document.getElementById('projFilesLink').value.trim();

  if (!thumbLink || !filesLink) {
    showToast('يجب إدخال رابط الصورة ورابط الملفات من جوجل درايف', 'error');
    return;
  }
  if (price > 0 && (!payMethod || !payNumber || !payName)) {
    showToast('أدخل بيانات المحفظة لأن السعر أكبر من صفر', 'error');
    return;
  }
  if (price <= 0) {
    payMethod = '';
    payNumber = '';
    payName = '';
  }

  isPublishing = true;
  showLoading(true);
  try {
    // حفظ المشروع بروابط الدرايف فقط (من غير Storage)
    await addDoc(collection(db, 'projects'), {
      title,
      description: desc,
      price,
      isFree: price === 0,
      thumbnail: thumbLink,
      thumbnailDirect: getDriveImageUrl(thumbLink),
      filesLink: filesLink,
      files: [],
      sellerId: currentUser.uid,
      sellerName: currentUserData?.name || currentUser.displayName,
      paymentMethod: payMethod,
      paymentNumber: payNumber,
      paymentName: payName,
      commission: 5,
      status: 'active',
      isOfficial: false,
      createdAt: serverTimestamp(),
      downloads: 0,
      sales: 0
    });

    showToast('تم نشر المشروع بنجاح!');
    bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
    document.getElementById('uploadForm').reset();
  } catch (err) {
    console.error(err);
    showToast('حدث خطأ أثناء نشر المشروع: ' + err.message, 'error');
  } finally {
    isPublishing = false;
    showLoading(false);
  }
});

// ===== Notifications =====
async function loadUserNotifications(uid) {
  const listEl = document.getElementById('notifList');
  const badge = document.getElementById('notifBadge');
  if (!listEl) return;
  try {
    const snap = await getDocs(collection(db, 'notifications'));
    const notifs = snap.docs
      .filter(d => d.data().userId === uid)
      .sort((a, b) => (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0))
      .slice(0, 30);

    const unread = notifs.filter(d => !d.data().read).length;
    if (badge) {
      if (unread > 0) {
        badge.textContent = unread > 9 ? '9+' : unread;
        badge.classList.remove('d-none');
      } else {
        badge.classList.add('d-none');
      }
    }

    if (notifs.length === 0) {
      listEl.innerHTML = '<div class="text-center text-muted small py-3">لا توجد إشعارات</div>';
      return;
    }

    listEl.innerHTML = notifs.map(d => {
      const n = d.data();
      const time = n.createdAt?.toDate?.().toLocaleString('ar-EG') || '';
      return `<div class="notif-item border-bottom py-2 px-1 ${n.read ? '' : 'bg-warning bg-opacity-10'}" data-id="${d.id}">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <strong class="small">${n.title || 'إشعار'}</strong>
          <span class="text-muted text-nowrap" style="font-size:0.7rem;">${time}</span>
        </div>
        <div class="small text-muted">${n.body || ''}</div>
        <div class="d-flex align-items-center gap-1 mt-1" style="font-size:0.65rem;">
          <span class="text-muted">ID: ${d.id}</span>
          <button type="button" class="btn btn-link btn-sm p-0 copy-id-btn" data-id="${d.id}" title="نسخ ID" style="font-size:0.7rem;line-height:1;">
            <i class="fas fa-copy"></i>
          </button>
        </div>
      </div>`;
    }).join('');

    // منع إغلاق القائمة عند النقر داخل الإشعارات
    listEl.querySelectorAll('.notif-item, .copy-id-btn').forEach(el => {
      el.addEventListener('click', (e) => e.stopPropagation());
    });
    listEl.querySelectorAll('.copy-id-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(btn.dataset.id);
          showToast('تم نسخ الـ ID');
        } catch {
          showToast('تعذر النسخ', 'error');
        }
      });
    });
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<div class="text-danger small p-2">تعذر تحميل الإشعارات</div>';
  }
}

async function markNotificationsRead(uid) {
  try {
    const snap = await getDocs(collection(db, 'notifications'));
    const unread = snap.docs.filter(d => d.data().userId === uid && !d.data().read);
    await Promise.all(unread.map(d => updateDoc(doc(db, 'notifications', d.id), { read: true })));
    const badge = document.getElementById('notifBadge');
    if (badge) badge.classList.add('d-none');
    // refresh list styles
    setTimeout(() => loadUserNotifications(uid), 400);
  } catch (e) { console.error(e); }
}

// ===== Floating Support Widget =====
let supportOpen = false;
let supportUnsub = null;

function initSupportWidget(user) {
  if (document.getElementById('supportFab')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="supportFab" class="support-fab">
      <div id="supportPanel" class="support-panel">
        <div class="support-panel-header">
          <span><i class="fas fa-headset me-1"></i> الدعم</span>
          <button type="button" id="supportCloseBtn" class="btn btn-sm btn-light py-0 px-2">&times;</button>
        </div>
        <div id="supportChatBox" class="support-chat-box">
          <div class="text-center text-muted small py-3">${user ? 'جاري التحميل...' : 'سجّل دخول للتواصل مع الدعم'}</div>
        </div>
        <div class="support-input-row" id="supportInputRow" style="${user ? '' : 'display:none'}">
          <input type="text" id="supportInput" class="form-control form-control-sm" placeholder="اكتب رسالتك...">
          <button class="btn btn-sm btn-primary" id="supportSendBtn"><i class="fas fa-paper-plane"></i></button>
        </div>
      </div>
      <button type="button" id="supportToggleBtn" class="support-toggle-btn">
        <i class="fas fa-headset me-1"></i> الدعم
        <span id="supportBadge" class="support-badge d-none">0</span>
      </button>
    </div>
  `);

  const panel = document.getElementById('supportPanel');
  const toggleBtn = document.getElementById('supportToggleBtn');
  const closeBtn = document.getElementById('supportCloseBtn');

  toggleBtn.addEventListener('click', () => {
    supportOpen = !supportOpen;
    panel.classList.toggle('open', supportOpen);
    if (supportOpen && user) {
      markSupportRead(user.uid);
      loadSupportMessages(user);
    }
  });
  closeBtn.addEventListener('click', () => {
    supportOpen = false;
    panel.classList.remove('open');
  });

  if (user) {
    // Live badge for unread admin messages
    const q = query(collection(db, 'supportChats'), where('userId', '==', user.uid));
    supportUnsub = onSnapshot(q, (snap) => {
      const unread = snap.docs.filter(d => d.data().sender === 'admin' && !d.data().read).length;
      const badge = document.getElementById('supportBadge');
      if (!badge) return;
      if (unread > 0 && !supportOpen) {
        badge.textContent = unread > 9 ? '9+' : unread;
        badge.classList.remove('d-none');
      } else {
        badge.classList.add('d-none');
      }
      if (supportOpen) loadSupportMessages(user);
    });

    document.getElementById('supportSendBtn')?.addEventListener('click', () => sendSupportMsg(user));
    document.getElementById('supportInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendSupportMsg(user);
    });
  }
}

function loadSupportMessages(user) {
  const box = document.getElementById('supportChatBox');
  if (!box || !user) return;
  getDocs(query(collection(db, 'supportChats'), where('userId', '==', user.uid))).then(snap => {
    const docs = snap.docs.slice().sort((a, b) => {
      return (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0);
    });
    if (docs.length === 0) {
      box.innerHTML = '<div class="text-center text-muted small py-3">ابدأ المحادثة بإرسال رسالة</div>';
      return;
    }
    box.innerHTML = docs.map(d => {
      const m = d.data();
      const isMe = m.sender === 'user';
      const time = m.createdAt?.toDate?.().toLocaleString('ar-EG') || '';
      return `<div class="chat-message ${isMe ? 'me' : ''}">
        <div class="chat-bubble">${m.text || ''}</div>
        <small class="text-muted chat-time">${time}</small>
      </div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }).catch(e => { box.innerHTML = `<div class="text-danger small">${e.message}</div>`; });
}

async function sendSupportMsg(user) {
  const input = document.getElementById('supportInput');
  const text = input?.value.trim();
  if (!text || !user) return;
  input.value = '';
  try {
    await addDoc(collection(db, 'supportChats'), {
      userId: user.uid,
      userEmail: user.email,
      sender: 'user',
      text,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (e) { showToast(e.message, 'error'); }
}

async function markSupportRead(uid) {
  try {
    const snap = await getDocs(query(collection(db, 'supportChats'), where('userId', '==', uid)));
    const unread = snap.docs.filter(d => d.data().sender === 'admin' && !d.data().read);
    await Promise.all(unread.map(d => updateDoc(doc(db, 'supportChats', d.id), { read: true })));
    document.getElementById('supportBadge')?.classList.add('d-none');
  } catch (e) {}
}

// ===== News Bar =====
async function loadNewsBar() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'news'));
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data.active || !data.text) {
      document.getElementById('newsBar')?.remove();
      return;
    }
    let bar = document.getElementById('newsBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'newsBar';
      bar.className = 'news-bar';
      document.body.prepend(bar);
    }
    bar.innerHTML = `<div class="news-bar-inner"><i class="fas fa-bullhorn me-2"></i>${data.text}</div>`;
  } catch (e) { console.error(e); }
}
loadNewsBar();

// Export for other pages
window.appHelpers = { showToast, showLoading, getInitials, currentUser, currentUserData, loadUserNotifications };
export { showToast, showLoading, getInitials };

// إخفاء حقول الدفع لو السعر = 0
function togglePaymentFields() {
  const price = parseFloat(document.getElementById('projPrice')?.value) || 0;
  const fields = document.getElementById('paymentFields');
  const method = document.getElementById('projPayMethod');
  const number = document.getElementById('projPayNumber');
  const name = document.getElementById('projPayName');
  const hide = price <= 0;

  if (fields) fields.style.display = hide ? 'none' : 'block';

  // لو مفيش wrapper (صفحة المشاريع) نخفي العناصر نفسها وآباءها
  [method, number, name].forEach(el => {
    if (!el) return;
    if (hide) {
      el.removeAttribute('required');
      el.value = el.tagName === 'SELECT' ? (el.options[0]?.value || '') : '';
    } else {
      el.setAttribute('required', 'required');
    }
    // إخفاء الصف/المجموعة الأب إن وجدت
    const row = el.closest('.mb-3, .col-md-6, .row');
    if (row && !fields) row.style.display = hide ? 'none' : '';
  });

  // labels/groups around payment in projects.html
  if (!fields) {
    document.querySelectorAll('[data-pay-field]').forEach(el => {
      el.style.display = hide ? 'none' : '';
    });
  }
}
document.getElementById('projPrice')?.addEventListener('input', togglePaymentFields);
document.addEventListener('DOMContentLoaded', togglePaymentFields);
// لو المودال اتفتح
document.getElementById('uploadModal')?.addEventListener('shown.bs.modal', togglePaymentFields);
