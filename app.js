import { 
  auth, db, storage,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updateProfile, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, query, where, orderBy, limit, serverTimestamp,
  ref, uploadBytes, getDownloadURL
} from './firebase.js';

// ===== Helpers =====
function showToast(message, type = 'success') {
  const container = document.querySelector('.toast-container');
  if (!container) return;
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
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.toggle('d-none', !show);
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
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
      <a href="support.html" class="btn btn-outline-secondary btn-sm position-relative" title="الدعم">
        <i class="fas fa-headset"></i>
      </a>
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
  } else {
    currentUserData = null;
    authArea.innerHTML = `
      <button class="btn btn-outline-primary btn-sm" data-bs-toggle="modal" data-bs-target="#loginModal">تسجيل الدخول</button>
      <button class="btn btn-primary-custom btn-sm text-white" data-bs-toggle="modal" data-bs-target="#registerModal">إنشاء حساب</button>
    `;
  }
});

// ===== Register =====
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone')?.value.trim() || '';
  const pass = document.getElementById('regPassword').value;
  const pass2 = document.getElementById('regPassword2').value;

  if (!phone) {
    showToast('يجب إدخال رقم الهاتف', 'error');
    return;
  }
  if (pass !== pass2) {
    showToast('كلمتا المرور غير متطابقتين', 'error');
    return;
  }
  if (!document.getElementById('agreePrivacy').checked || !document.getElementById('agreeTerms').checked) {
    showToast('يجب الموافقة على سياسة الخصوصية والشروط والأحكام', 'error');
    return;
  }

  showLoading(true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), {
      name,
      email,
      phone,
      createdAt: serverTimestamp(),
      banned: false,
      deleted: false,
      role: 'user',
      bio: ''
    });
    showToast('تم إنشاء الحساب بنجاح! مرحباً بك');
    bootstrap.Modal.getInstance(document.getElementById('registerModal')).hide();
  } catch (err) {
    console.error(err);
    showToast(err.message.includes('email-already-in-use') ? 'البريد مستخدم مسبقاً' : 'حدث خطأ أثناء التسجيل', 'error');
  } finally {
    showLoading(false);
  }
});

// ===== Login =====
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  showLoading(true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    showToast('تم تسجيل الدخول بنجاح');
    bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
  } catch (err) {
    showToast('بيانات الدخول غير صحيحة', 'error');
  } finally {
    showLoading(false);
  }
});

// ===== Commission terms toggle =====
document.getElementById('commissionTermsLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('commissionTermsText').classList.toggle('d-none');
});

// ===== Upload Project =====
// تحويل رابط جوجل درايف إلى رابط صورة مباشر
function getDriveImageUrl(link) {
  if (!link) return '';
  // استخراج الـ ID من الرابط
  let id = '';
  const match1 = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const match2 = link.match(/id=([a-zA-Z0-9_-]+)/);
  if (match1) id = match1[1];
  else if (match2) id = match2[1];
  if (id) return `https://drive.google.com/uc?export=view&id=${id}`;
  return link; // لو مش قدر يستخرج، يرجع الرابط الأصلي
}

document.getElementById('uploadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) {
    showToast('يجب تسجيل الدخول أولاً', 'error');
    return;
  }

  const title = document.getElementById('projTitle').value.trim();
  const desc = document.getElementById('projDesc').value.trim();
  const price = parseFloat(document.getElementById('projPrice').value) || 0;
  const payMethod = document.getElementById('projPayMethod').value;
  const payNumber = document.getElementById('projPayNumber').value.trim();
  const payName = document.getElementById('projPayName').value.trim();
  const thumbLink = document.getElementById('projThumbLink').value.trim();
  const filesLink = document.getElementById('projFilesLink').value.trim();

  if (!thumbLink || !filesLink) {
    showToast('يجب إدخال رابط الصورة ورابط الملفات من جوجل درايف', 'error');
    return;
  }

  showLoading(true);
  try {
    // حفظ المشروع بروابط الدرايف فقط (من غير Storage)
    await addDoc(collection(db, 'projects'), {
      title,
      description: desc,
      price,
      isFree: price === 0,
      thumbnail: thumbLink,                 // الرابط الأصلي
      thumbnailDirect: getDriveImageUrl(thumbLink), // رابط مباشر للعرض
      filesLink: filesLink,                 // رابط المجلد أو الملف
      files: [],                            // فاضي عشان التوافق
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
    showLoading(false);
  }
});

// Export for other pages
window.appHelpers = { showToast, showLoading, getInitials, currentUser, currentUserData };
export { showToast, showLoading, getInitials };

// إخفاء حقول الدفع لو السعر = 0
function togglePaymentFields() {
  const price = parseFloat(document.getElementById('projPrice')?.value) || 0;
  const fields = document.getElementById('paymentFields');
  if (!fields) return;
  if (price <= 0) {
    fields.style.display = 'none';
    document.getElementById('projPayMethod')?.removeAttribute('required');
    document.getElementById('projPayNumber')?.removeAttribute('required');
    document.getElementById('projPayName')?.removeAttribute('required');
  } else {
    fields.style.display = 'block';
    document.getElementById('projPayMethod')?.setAttribute('required', 'required');
    document.getElementById('projPayNumber')?.setAttribute('required', 'required');
    document.getElementById('projPayName')?.setAttribute('required', 'required');
  }
}
document.getElementById('projPrice')?.addEventListener('input', togglePaymentFields);
document.addEventListener('DOMContentLoaded', togglePaymentFields);
// لو المودال اتفتح
document.getElementById('uploadModal')?.addEventListener('shown.bs.modal', togglePaymentFields);
