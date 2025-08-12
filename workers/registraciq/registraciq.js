document.addEventListener('DOMContentLoaded', () => {
  console.log('registraciq.js loaded');
  const API_BASE = 'http://localhost:4100';

  const $ = id => document.getElementById(id);

  // Elements
  const fullname = $('fullname');
  const password = $('password');
  const blockSMS = $('blockSMS');
  const blockGMAIL = $('blockGMAIL');
  const dynamicField = $('dynamicField');
  const dynLabel = $('dynLabel');
  const dynInput = $('dynInput');

  const errFullname = $('err-fullname');
  const errPassword = $('err-password');
  const errDyn = $('err-dyn');

  const registerBtn = $('registerBtn');

  const codeSection = $('codeSection');
  const codeLabel = $('codeLabel');
  const codeInput = $('codeInput');
  const errCode = $('err-code');
  const confirmCodeBtn = $('confirmCodeBtn');
  const codeHint = $('codeHint');

  let method = null;   // 'SMS' | 'GMAIL'
  let stage = 'FORM';  // 'FORM' | 'CODE'

  // ---------- helpers ----------
  const setError = (input, errEl, msg) => {
    if (msg) {
      input.classList.add('is-invalid');
      errEl.textContent = msg;
      return false;
    } else {
      input.classList.remove('is-invalid');
      errEl.textContent = '';
      return true;
    }
  };

  // FULLNAME: червено само ако има цифри или е 1 дума
  const validateFullname = () => {
    const raw = fullname.value.replace(/\s+/g,' ').trim();
    const hasValue = raw.length > 0;

    if (!hasValue) {
      fullname.classList.remove('is-invalid');
      errFullname.textContent = '';
      return false;
    }
    if (/\d/.test(raw)) {
      return setError(fullname, errFullname, 'Името не може да съдържа цифри.');
    }
    const words = raw.split(' ').filter(Boolean);
    if (words.length < 2) {
      return setError(fullname, errFullname, 'Въведи поне две имена (име и фамилия).');
    }
    const lettersOnly = /^[\p{L}\s.\-']+$/u.test(raw);
    if (!lettersOnly) {
      return setError(fullname, errFullname, 'Използвай само букви (и интервал/тире/.)');
    }
    return setError(fullname, errFullname, '');
  };

  const validatePassword = () => {
    const val = password.value.trim();
    const ok = val.length >= 6;
    return setError(password, errPassword, ok ? '' : 'Паролата трябва да е поне 6 символа.');
  };

  const sanitizePhone = v => v.replace(/[^+\d]/g, '');
  const isValidPhone = v => {
    const x = v.replace(/\s+/g,'');
    if (x.startsWith('+')) return /^\+\d{11}$/.test(x); // + и още 11 цифри = 12 общо
    return /^\d{10}$/.test(x);                           // точно 10 цифри
  };

  const validateDynamic = () => {
    if (!method) return false;
    const v = dynInput.value.trim();

    if (method === 'SMS') {
      const sanitized = sanitizePhone(v);
      if (sanitized !== v) dynInput.value = sanitized;

      const ok = isValidPhone(dynInput.value);
      return setError(
        dynInput, errDyn,
        ok ? '' :
        (dynInput.value.startsWith('+')
          ? 'Международен формат: общо 12 символа (пример: +359881234567).'
          : 'Национален формат: точно 10 цифри (пример: 0881234567).')
      );
    } else {
      const ok = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(v);
      return setError(dynInput, errDyn, ok ? '' : 'Въведи валиден адрес @gmail.com');
    }
  };

  const updateRegisterState = () => {
    const ok = stage === 'FORM'
      && validateFullname()
      && validatePassword()
      && method
      && validateDynamic();
    registerBtn.disabled = !ok;
  };

  // ---------- select method ----------
  function choose(m){
    method = m;
    blockSMS.classList.toggle('active', m === 'SMS');
    blockGMAIL.classList.toggle('active', m === 'GMAIL');
    blockSMS.setAttribute('aria-pressed', m === 'SMS');
    blockGMAIL.setAttribute('aria-pressed', m === 'GMAIL');

    dynamicField.classList.remove('hidden');
    dynInput.value = '';
    errDyn.textContent = '';

    if(m === 'SMS'){
      dynLabel.textContent = 'Въведете своя номер';
      dynInput.placeholder = '+359... или 0XXXXXXXXX';
      dynInput.type = 'tel';
    } else {
      dynLabel.textContent = 'Въведете своя Gmail';
      dynInput.placeholder = 'example@gmail.com';
      dynInput.type = 'email';
    }
    updateRegisterState();
    dynInput.focus();
  }
  blockSMS.addEventListener('click', () => choose('SMS'));
  blockGMAIL.addEventListener('click', () => choose('GMAIL'));

  // ---------- live validation ----------
  fullname.addEventListener('input', updateRegisterState);
  password.addEventListener('input', updateRegisterState);
  dynInput.addEventListener('input', updateRegisterState);

  // ---------- Gmail helpers ----------
  async function izpratiKod() {
    const email = dynInput.value.trim();
    const resp = await fetch(`${API_BASE}/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || 'Неуспешно изпращане на код към Gmail.');
    return data; // { message }
  }

  async function resendKod() {
    const email = dynInput.value.trim();
    const resp = await fetch(`${API_BASE}/resend-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || 'Неуспешно изпращане на нов код.');
    return data;
  }

  async function proveriKod() {
    const email = dynInput.value.trim();
    const code = codeInput.value.trim();
    const resp = await fetch(`${API_BASE}/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const data = await resp.json();
    if (!resp.ok || data?.success === false) {
      throw new Error(data?.error || 'Невалиден код.');
    }
    return data; // { success:true, message }
  }

  // ---------- submit: send code + open CODE stage ----------
  $('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (stage !== 'FORM') return;

    const ok =
      validateFullname() &
      validatePassword() &
      (!!method) &
      validateDynamic();

    if (!ok) { updateRegisterState(); return; }

    if (method === 'GMAIL') {
      try {
        const out = await izpratiKod();
        codeHint.textContent = out?.message || 'Кодът е изпратен. Провери Gmail пощата и въведи 6-цифрения код.';
      } catch (err) {
        errDyn.textContent = err.message || 'Сървърът за имейл кодове не е достъпен.';
        dynInput.classList.add('is-invalid');
        return;
      }
    } else if (method === 'SMS') {
      // Тук ще е SMS бекенд ако решиш да го ползваш
    }

    stage = 'CODE';
    registerBtn.disabled = true;

    codeSection.classList.remove('hidden');
    codeInput.value = '';
    errCode.textContent = '';
    codeLabel.textContent = method === 'SMS' ? 'Код от SMS' : 'Код от Gmail';
    codeInput.placeholder = method === 'SMS'
      ? 'Въведете кода от SMS от SF – ParkEyeRay'
      : 'Въведете кода от Gmail от SF – ParkEyeRay';
    if (!codeHint.textContent) {
      codeHint.textContent = 'Кодът е изпратен. Провери Gmail пощата и въведи 6-цифрения код.';
    }
    codeInput.focus();
  });

  // ---------- confirm code ----------
  confirmCodeBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    const ok = /^\d{6}$/.test(code);
    if (!ok) { setError(codeInput, errCode, 'Кодът трябва да е 6 цифри.'); return; }
    setError(codeInput, errCode, '');

    if (method === 'GMAIL') {
      try {
        await proveriKod();
      } catch (err) {
        errCode.textContent = err.message || 'Невалиден код.';
        codeInput.classList.add('is-invalid');
        return;
      }
    } else if (method === 'SMS') {
      // verify за SMS
    }

    alert('Регистрацията е потвърдена! Добре дошъл в ParkEyeRay 🚀');
    // window.location.href = '/workers/dashboard.html';
  });

  // по желание: бутон “Изпрати отново” (ако добавиш такъв в HTML)
  // document.getElementById('resendBtn')?.addEventListener('click', async () => {
  //   try {
  //     const out = await resendKod();
  //     codeHint.textContent = out?.message || 'Нов код е изпратен.';
  //   } catch (err) {
  //     errCode.textContent = err.message || 'Неуспешно изпращане на нов код.';
  //   }
  // });

  // init
  updateRegisterState();
});
