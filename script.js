/* =============================================================================
 * OptiCare Pro — ระบบบริหารจัดการร้านแว่นตา (Single Page Application)
 *
 * โครงสร้างไฟล์
 *   1. Config & Constants        8. Authentication
 *   2. Utilities                 9. Navigation
 *   3. Data model & seed        10. Rendering
 *   4. State & persistence      11. CRUD (ลูกค้า / สินค้า / ออเดอร์)
 *   5. DOM references           12. Google Sheets sync
 *   6. Toast                    13. Lens advisor (Offline expert engine)
 *   7. Modal manager            14. Event wiring & bootstrap
 *
 * หมายเหตุ: ข้อมูลทั้งหมดถูกเก็บในเบราว์เซอร์ (localStorage) เหมาะสำหรับการสาธิต
 * และการใช้งานเครื่องเดียว หากใช้งานหลายสาขาควรต่อกับฐานข้อมูลฝั่งเซิร์ฟเวอร์
 * ========================================================================== */

(function () {
  'use strict';

  /* ==========================================================================
   * 1. CONFIG & CONSTANTS
   * ========================================================================== */

  const CONFIG = {
    sheetId: '1YV97JIiatp0amltwvIQUs2zPnOYhe6xWhz0fh3fNjNY',
    /**
     * Web App URL ของ Apps Script ที่ติดตั้ง Code.gs ไว้
     * ใช้เป็นค่าเริ่มต้นเมื่อยังไม่เคยตั้งค่าในเครื่องนี้ — แก้ทับได้ที่หน้าตั้งค่า
     * URL นี้ไม่ใช่ความลับ เพราะทุกคำขอยังต้องผ่านการล็อกอิน Google และตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์
     */
    defaultBackendUrl: 'https://script.google.com/macros/s/AKfycbx13bzgTATvVjoZh0inCwYfAuM4UBoYVjASi3LPel6kvwQ60l0w3LBlHCkapZK2ayD03A/exec',
    productSheetNames: ['Products', 'สินค้า', 'คลังสินค้า'],
    customerSheetNames: ['Customers', 'ลูกค้า', 'รายชื่อลูกค้า'],
    requestTimeoutMs: 15000,
    storageKey: 'opticare:data:v2',
    backendKey: 'opticare:backend:v1',
    sessionKey: 'opticare:session:v1',
    lockKey: 'opticare:locked:v1',
    toastMs: 3200
  };

  const TABS = ['dashboard', 'customers', 'inventory', 'orders', 'ai-consult'];
  const GENDERS = ['ชาย', 'หญิง', 'อื่นๆ'];
  const FACE_SHAPES = ['กลม', 'รูปไข่', 'เหลี่ยม', 'สี่เหลี่ยมผืนผ้า', 'หัวใจ', 'สามเหลี่ยม', 'เพชร'];
  const CATEGORIES = ['Frame', 'Lens', 'ContactLens', 'Accessory'];
  const EXAM_METHODS = ['Subjective refraction', 'Auto-refraction', 'Retinoscopy', 'ค่าจากแว่นเดิม (Lensometry)'];
  const FRAME_TYPES = ['เต็มกรอบ (Full rim)', 'กรอบเซาะร่อง (Semi-rimless)', 'กรอบเจาะ (Rimless)'];
  const EDGE_TREATMENTS = ['เจียร์ปกติ (Standard bevel)', 'เซาะร่อง (Groove)', 'เจาะรู (Drill mount)', 'ขัดขอบเงา (Polish)', 'ลบเหลี่ยมขอบ (Roll & polish)'];

  const CATEGORY_LABEL = {
    Frame: '🕶️ กรอบแว่น',
    Lens: '🔮 เลนส์สายตา',
    ContactLens: '👁️ คอนแทคเลนส์',
    Accessory: '🧴 อุปกรณ์/น้ำยา'
  };

  const ORDER_STATUS = {
    PENDING: 'รอใบสั่งเลนส์',
    GRINDING: 'กำลังฝนเลนส์',
    READY: 'รอรับสินค้า',
    DONE: 'สำเร็จ'
  };

  const STATUS_LIST = [
    { key: ORDER_STATUS.PENDING, label: '🕒 รอสั่งเลนส์', badge: 'bg-amber-100 text-amber-800' },
    { key: ORDER_STATUS.GRINDING, label: '⚙️ กำลังฝนเลนส์', badge: 'bg-indigo-100 text-indigo-800' },
    { key: ORDER_STATUS.READY, label: '👓 รอรับสินค้า', badge: 'bg-sky-100 text-sky-800' },
    { key: ORDER_STATUS.DONE, label: '✅ ส่งมอบแล้ว', badge: 'bg-emerald-100 text-emerald-800' }
  ];

  /** คำแนะนำทรงกรอบแว่นตามรูปหน้า ใช้โดยเอนจินออฟไลน์ */
  const FRAME_ADVICE = {
    'กลม': {
      shapes: ['ทรงเหลี่ยม (Rectangle)', 'Wayfarer', 'Browline / Clubmaster'],
      avoid: ['ทรงกลมขนาดเล็ก', 'กรอบไร้ขอบทรงมน'],
      why: 'เส้นสายเหลี่ยมช่วยเพิ่มมิติและทำให้ใบหน้าดูเรียวขึ้น'
    },
    'รูปไข่': {
      shapes: ['เกือบทุกทรง', 'Aviator', 'ทรงเหลี่ยมมนขอบโค้ง'],
      avoid: ['กรอบที่ใหญ่เกินสัดส่วนใบหน้า'],
      why: 'สัดส่วนใบหน้าสมดุลอยู่แล้ว เน้นเลือกขนาดกรอบให้พอดีกับความกว้างใบหน้า'
    },
    'เหลี่ยม': {
      shapes: ['ทรงกลม (Round)', 'Oval', 'Aviator'],
      avoid: ['กรอบเหลี่ยมคมขนาดใหญ่'],
      why: 'เส้นโค้งช่วยลดความคมของมุมกรามและขากรรไกร'
    },
    'สี่เหลี่ยมผืนผ้า': {
      shapes: ['กรอบที่มีความสูงมาก (Deep frame)', 'Oversize', 'ทรงกลมขนาดใหญ่'],
      avoid: ['กรอบแบนบางเตี้ย', 'กรอบครึ่งกรอบด้านล่าง'],
      why: 'กรอบสูงช่วยตัดความยาวของใบหน้าให้ดูได้สัดส่วน'
    },
    'หัวใจ': {
      shapes: ['กรอบที่เน้นน้ำหนักด้านล่าง (Bottom-heavy)', 'Aviator', 'Rimless / เซาะร่อง'],
      avoid: ['Cat-eye ปีกใหญ่', 'กรอบบนหนาสีเข้ม'],
      why: 'ช่วยถ่วงสมดุลระหว่างหน้าผากที่กว้างกับคางที่เรียว'
    },
    'สามเหลี่ยม': {
      shapes: ['Cat-eye', 'Browline', 'กรอบบนหนา / มีดีเทลด้านบน'],
      avoid: ['กรอบล่างหนา', 'กรอบเล็กแคบ'],
      why: 'เพิ่มน้ำหนักสายตาให้ส่วนบนของใบหน้าเพื่อสมดุลกับกรามที่กว้าง'
    },
    'เพชร': {
      shapes: ['Oval', 'Cat-eye', 'Rimless', 'Browline'],
      avoid: ['กรอบแคบกว่าโหนกแก้ม'],
      why: 'เน้นเส้นด้านบนและความกว้างช่วงคิ้วเพื่อขับโครงหน้าให้ดูนุ่มขึ้น'
    }
  };

  /* ==========================================================================
   * 2. UTILITIES
   * ========================================================================== */

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** แปลงข้อความให้ปลอดภัยก่อนนำไปต่อกับ innerHTML (ป้องกัน XSS) */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
  }

  /** ทำเครื่องหมายว่าข้อความนี้เป็น HTML ที่สร้างเองแล้ว ไม่ต้อง escape ซ้ำ */
  const raw = (value) => ({ __raw: String(value === null || value === undefined ? '' : value) });

  /**
   * Tagged template สำหรับสร้าง HTML — ค่าที่แทรกจะถูก escape อัตโนมัติ
   * ยกเว้นค่าที่ห่อด้วย raw() และ array จะถูก join ให้เอง
   */
  function html(strings, ...values) {
    let out = '';
    strings.forEach((chunk, i) => {
      out += chunk;
      if (i >= values.length) return;
      const value = values[i];
      if (value === null || value === undefined || value === false) return;
      if (Array.isArray(value)) {
        out += value.map((item) => (item && item.__raw ? item.__raw : escapeHtml(item))).join('');
      } else if (value && value.__raw) {
        out += value.__raw;
      } else {
        out += escapeHtml(value);
      }
    });
    return out;
  }

  const toNum = (value, fallback = 0) => {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : fallback;
  };

  const toInt = (value, fallback = 0) => {
    const n = parseInt(String(value ?? '').replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  /** ปัดทศนิยม 2 ตำแหน่งแบบครึ่งหนึ่งขึ้นออกจากศูนย์ ให้ตรงกับที่ Code.gs ใช้ */
  const round2 = (value) => {
    const n = toNum(value, 0);
    return Math.sign(n) * Math.round(Math.abs(n) * 100) / 100;
  };

  const bahtFormatter = new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  const numberFormatter = new Intl.NumberFormat('th-TH');

  const formatBaht = (value) => bahtFormatter.format(toNum(value, 0));
  const formatNumber = (value) => numberFormatter.format(toNum(value, 0));
  /** แสดงค่าสายตาพร้อมเครื่องหมาย เช่น -2.50 / +1.25 */
  const formatDiopter = (value) => {
    const n = toNum(value, 0);
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
  };

  /**
   * วันที่ในรูปแบบ YYYY-MM-DD ตามเขตเวลาเครื่อง
   * (ไม่ใช้ toISOString เพราะจะแปลงเป็น UTC ทำให้วันคลาดเคลื่อนในเขตเวลา +07:00)
   */
  function localISODate(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  const todayISO = () => localISODate();
  const nowTime = () => new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const thaiDate = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso || '-';
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  /** จำนวนวันระหว่างวันที่ ISO กับวันนี้ (บวก = ผ่านมาแล้ว) */
  function daysSince(iso) {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  let idCounter = 0;
  const uid = (prefix) => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;

  function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /** fetch พร้อม timeout เพื่อไม่ให้ UI ค้างเมื่อเครือข่ายมีปัญหา */
  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || CONFIG.requestTimeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /* ==========================================================================
   * 2b. CLINICAL CALCULATIONS — สูตรมาตรฐานทางทัศนมาตรศาสตร์
   *
   * ทุกฟังก์ชันในส่วนนี้เป็น pure function รับค่าตัวเลขและคืนผลลัพธ์
   * แยกออกจากการแสดงผลเพื่อให้ตรวจสอบและทดสอบได้ง่าย
   * ========================================================================== */

  /**
   * คุณสมบัติวัสดุเลนส์ตามดัชนีหักเห
   * abbe = Abbe number (ยิ่งสูง ความคลาดสีขอบเลนส์ยิ่งน้อย)
   * sg   = Specific gravity (ยิ่งต่ำ เลนส์ยิ่งเบา)
   */
  const LENS_MATERIALS = [
    { index: 1.50, label: 'CR-39 1.50', abbe: 58, sg: 1.32, uv: '380 นาโนเมตร' },
    { index: 1.56, label: 'MR-8 1.56', abbe: 37, sg: 1.28, uv: '395 นาโนเมตร' },
    { index: 1.59, label: 'Polycarbonate 1.59', abbe: 30, sg: 1.20, uv: '400 นาโนเมตร' },
    { index: 1.60, label: 'MR-8 1.60', abbe: 41, sg: 1.30, uv: '400 นาโนเมตร' },
    { index: 1.67, label: 'MR-7 1.67', abbe: 32, sg: 1.36, uv: '400 นาโนเมตร' },
    { index: 1.74, label: 'MR-174 1.74', abbe: 33, sg: 1.47, uv: '400 นาโนเมตร' }
  ];

  /** Spherical Equivalent (SE) = SPH + CYL/2 — ค่ากำลังรวมเฉลี่ยของตาข้างนั้น */
  const sphericalEquivalent = (sph, cyl) => toNum(sph, 0) + toNum(cyl, 0) / 2;

  /**
   * จำแนกชนิดสายตาเอียงจากองศา (อ้างอิงระบบ Minus Cylinder)
   * WTR (With-the-rule) แกน 0-30 หรือ 150-180 · ATR (Against-the-rule) แกน 60-120 · นอกนั้นเป็น Oblique
   */
  function astigmatismType(axis, cyl) {
    if (!toNum(cyl, 0)) return null;
    const ax = ((toInt(axis, 0) % 180) + 180) % 180;
    if (ax <= 30 || ax >= 150) return { code: 'WTR', label: 'With-the-rule (ตามกฎ)' };
    if (ax >= 60 && ax <= 120) return { code: 'ATR', label: 'Against-the-rule (ทวนกฎ)' };
    return { code: 'OBL', label: 'Oblique (แกนเฉียง)' };
  }

  /**
   * แปลงค่าสายตาระหว่างระบบ Minus Cylinder และ Plus Cylinder (Transposition)
   * SPH ใหม่ = SPH + CYL · CYL ใหม่ = −CYL · AXIS ใหม่ = AXIS ± 90
   */
  function transpose(sph, cyl, axis) {
    const s = toNum(sph, 0);
    const c = toNum(cyl, 0);
    const a = toInt(axis, 0);
    return {
      sph: s + c,
      cyl: -c,
      ax: a >= 90 ? a - 90 : a + 90
    };
  }

  /** ความต่างของกำลังสายตาสองข้าง (Anisometropia) วัดจาก Spherical Equivalent */
  const anisometropia = (odSph, odCyl, osSph, osCyl) =>
    Math.abs(sphericalEquivalent(odSph, odCyl) - sphericalEquivalent(osSph, osCyl));

  /**
   * จำแนกชนิดสายตาเอียงตามตำแหน่งของโฟกัสทั้งสองเส้นเทียบกับจอประสาทตา
   * ใช้หลักการมาตรฐาน: ดูกำลังในแกนหลัก 2 แกน คือ SPH และ SPH + CYL
   *
   *   ทั้งสองแกนติดลบ      → Compound myopic astigmatism
   *   แกนหนึ่งเป็นศูนย์     → Simple myopic / Simple hyperopic astigmatism
   *   คนละเครื่องหมาย      → Mixed astigmatism
   *   ทั้งสองแกนเป็นบวก    → Compound hyperopic astigmatism
   */
  function astigmatismClass(sph, cyl) {
    const c = toNum(cyl, 0);
    if (!c) return null;

    const m1 = toNum(sph, 0);              // กำลังในแกนที่ระบุด้วย AXIS
    const m2 = round2(m1 + c);             // กำลังในแกนตั้งฉาก
    const sign = (value) => (value > 0.001 ? 1 : value < -0.001 ? -1 : 0);
    const s1 = sign(m1);
    const s2 = sign(m2);

    if (s1 === 0 || s2 === 0) {
      const other = s1 === 0 ? s2 : s1;
      return other < 0
        ? { code: 'SMA', label: 'Simple myopic astigmatism', thai: 'สายตาเอียงชนิดสั้นอย่างเดียว' }
        : { code: 'SHA', label: 'Simple hyperopic astigmatism', thai: 'สายตาเอียงชนิดยาวอย่างเดียว' };
    }
    if (s1 < 0 && s2 < 0) {
      return { code: 'CMA', label: 'Compound myopic astigmatism', thai: 'สายตาเอียงร่วมกับสายตาสั้นทั้งสองแกน' };
    }
    if (s1 > 0 && s2 > 0) {
      return { code: 'CHA', label: 'Compound hyperopic astigmatism', thai: 'สายตาเอียงร่วมกับสายตายาวทั้งสองแกน' };
    }
    return { code: 'MA', label: 'Mixed astigmatism', thai: 'สายตาเอียงชนิดผสม (แกนหนึ่งสั้น อีกแกนยาว)' };
  }

  /**
   * กำลังเพ่งที่คาดหมายตามอายุ — สูตรของ Hofstetter (1950)
   *   ต่ำสุด (min)   = 15 − 0.25 × อายุ
   *   เฉลี่ย (avg)   = 18.5 − 0.30 × อายุ
   *   สูงสุด (max)   = 25 − 0.40 × อายุ
   * ใช้เทียบว่า ADD ที่ให้ไปสมเหตุสมผลกับอายุหรือไม่
   */
  function hofstetterAmplitude(age) {
    const a = toNum(age, 0);
    if (!a) return null;
    return {
      min: Math.max(round2(15 - 0.25 * a), 0),
      avg: Math.max(round2(18.5 - 0.30 * a), 0),
      max: Math.max(round2(25 - 0.40 * a), 0)
    };
  }

  /**
   * ADD ที่เหมาะสมตามหลัก "สงวนกำลังเพ่งไว้ครึ่งหนึ่ง" (half-amplitude reserve)
   *   ADD = ความต้องการที่ระยะทำงาน − (กำลังเพ่งที่มี ÷ 2)
   * เช่น ระยะอ่าน 40 ซม. ต้องใช้ 2.50 D ถ้ามีกำลังเพ่งเหลือ 2.00 D
   * จะสงวนไว้ใช้ 1.00 D จึงได้ ADD = 1.50 D
   *
   * @param {number} age อายุ (ปี)
   * @param {number} workingDistanceCm ระยะทำงาน (เซนติเมตร)
   */
  function tentativeAdd(age, workingDistanceCm = 40) {
    const amplitude = hofstetterAmplitude(age);
    if (!amplitude) return null;
    const distance = Math.max(toNum(workingDistanceCm, 40), 10);
    const demand = 100 / distance;
    const raw = demand - amplitude.min / 2;
    // ปัดลงเป็นขั้น 0.25 D ตามค่าที่สั่งเลนส์ได้จริง และไม่ติดลบ
    const stepped = Math.max(Math.round(raw * 4) / 4, 0);
    return {
      demand: round2(demand),
      amplitudeMin: amplitude.min,
      reserve: round2(amplitude.min / 2),
      add: stepped,
      workingDistanceCm: distance
    };
  }

  /**
   * ช่วงระยะที่มองชัดผ่านโซนใกล้ เมื่อใส่ ADD ค่าหนึ่ง
   * ขอบไกลสุด = 100/ADD · ขอบใกล้สุด = 100/(ADD + กำลังเพ่งที่ยังใช้ได้)
   */
  function nearRange(add, age) {
    const a = toNum(add, 0);
    if (a <= 0) return null;
    const amplitude = hofstetterAmplitude(age);
    const usable = amplitude ? amplitude.min / 2 : 0;
    return {
      farCm: Math.round(100 / a),
      nearCm: Math.round(100 / (a + usable)),
      usableAmplitude: round2(usable)
    };
  }

  /**
   * ปริซึมที่เกิดจากการมองผ่านเลนส์นอกจุดศูนย์กลาง — กฎของ Prentice
   *   Δ = c × F   โดย c = ระยะห่างจากจุดศูนย์กลางเลนส์ (เซนติเมตร)
   * @param {number} powerD กำลังเลนส์ (ไดออปเตอร์)
   * @param {number} offsetMm ระยะห่างจากจุดศูนย์กลาง (มิลลิเมตร)
   */
  const prenticePrism = (powerD, offsetMm) =>
    Math.abs(toNum(powerD, 0)) * (Math.abs(toNum(offsetMm, 0)) / 10);

  /**
   * ความไม่สมดุลของปริซึมแนวดิ่งขณะอ่านหนังสือ (Vertical prism imbalance)
   *
   * เวลามองลงไปอ่านหนังสือ สายตาจะผ่านเลนส์ต่ำกว่าจุดศูนย์กลางราว 8–10 มม.
   * ถ้ากำลังเลนส์สองข้างต่างกัน ปริซึมที่เกิดขึ้นจะไม่เท่ากัน ทำให้เมื่อยล้าหรือเห็นภาพซ้อน
   * เกณฑ์ที่ใช้กันทั่วไปคือเกิน 1.00Δ ถือว่ามีนัยสำคัญและควรแก้ไข
   */
  function verticalImbalance(odSph, odCyl, osSph, osCyl, dropMm = 8) {
    // ใช้กำลังในแนวดิ่ง (แกน 90) ซึ่งเท่ากับ SPH + CYL·sin²(axis) — ประมาณด้วย SE เพื่อความง่ายและปลอดภัย
    const powerOd = sphericalEquivalent(odSph, odCyl);
    const powerOs = sphericalEquivalent(osSph, osCyl);
    const delta = Math.abs(prenticePrism(powerOd, dropMm) - prenticePrism(powerOs, dropMm));
    return {
      dropMm: toNum(dropMm, 8),
      prismOd: round2(prenticePrism(powerOd, dropMm)),
      prismOs: round2(prenticePrism(powerOs, dropMm)),
      imbalance: round2(delta),
      significant: delta >= 1.0
    };
  }

  /**
   * ประมาณความต่างของขนาดภาพสองข้าง (Aniseikonia) จาก Anisometropia
   * หลักประมาณที่ใช้กันในคลินิก: ราว 1.5% ต่อความต่าง 1.00 D ของกำลังแว่น
   * เกิน 3% เริ่มมีอาการ · เกิน 5% มักทนไม่ได้และควรพิจารณาคอนแทคเลนส์แทน
   */
  function aniseikoniaEstimate(anisoD) {
    const diff = Math.abs(toNum(anisoD, 0));
    const percent = round2(diff * 1.5);
    return {
      percent,
      level: percent >= 5 ? 'high' : percent >= 3 ? 'moderate' : 'low'
    };
  }

  /**
   * ความโค้งหน้าเลนส์ที่เหมาะสม — สูตรประมาณของ Vogel
   *   กำลังบวก : BC = SE + 6.00
   *   กำลังลบ  : BC = SE/2 + 6.00
   * ใช้ตรวจว่ากรอบโค้งมาก (Wrap) เข้ากับค่าสายตาหรือไม่
   */
  function vogelBaseCurve(se) {
    const value = toNum(se, 0);
    return round2(value >= 0 ? value + 6 : value / 2 + 6);
  }

  /**
   * ความคลาดสีตามขวาง (Transverse Chromatic Aberration)
   *   TCA (Δ) = ปริซึม ณ จุดที่มอง ÷ ค่า Abbe
   * เกิน 0.10Δ เริ่มสังเกตเห็นขอบสี เกิน 0.20Δ รบกวนชัดเจน
   */
  function chromaticAberration(powerD, abbe, offsetMm = 10) {
    const v = toNum(abbe, 58);
    if (v <= 0) return 0;
    return round2(prenticePrism(powerD, offsetMm) / v);
  }

  /**
   * ชดเชยกำลังเลนส์เมื่อระยะ Vertex เปลี่ยน — F' = F / (1 − x·F)
   * @param {number} power  กำลังเลนส์เดิม (ไดออปเตอร์)
   * @param {number} shiftMm ระยะที่ขยับเลนส์ "เข้าใกล้ตา" (มิลลิเมตร)
   */
  function vertexCompensate(power, shiftMm) {
    const F = toNum(power, 0);
    const x = toNum(shiftMm, 0) / 1000;
    const denominator = 1 - x * F;
    if (!denominator) return F;
    return F / denominator;
  }

  /**
   * ประมาณความหนาขอบเลนส์เลนส์เว้า (Sagitta approximation)
   * s = y²·|F| / (2000·(n−1)) โดย y = รัศมีเลนส์ (มม.)
   * @returns {number} ความหนาขอบโดยประมาณ (มม.)
   */
  function estimateEdgeThickness(power, index, blankDiameterMm = 50, centerThicknessMm = 1.0) {
    const F = Math.abs(toNum(power, 0));
    const n = toNum(index, 1.5);
    if (!F || n <= 1) return centerThicknessMm;
    const y = toNum(blankDiameterMm, 50) / 2;
    return centerThicknessMm + (y * y * F) / (2000 * (n - 1));
  }

  /**
   * ระยะเยื้องศูนย์เลนส์ต่อข้าง (Decentration)
   * Decentration = (A + DBL)/2 − Mono PD
   * @returns {number|null} มิลลิเมตร (บวก = เยื้องเข้าด้านจมูก)
   */
  function decentration(frameA, dbl, monoPd) {
    const a = toNum(frameA, 0);
    const bridge = toNum(dbl, 0);
    const pd = toNum(monoPd, 0);
    if (!a || !bridge || !pd) return null;
    return (a + bridge) / 2 - pd;
  }

  /** ขนาดเลนส์ดิบขั้นต่ำ = ED + 2×|Decentration| + เผื่อขอบ 2 มม. */
  function minimumBlankSize(ed, decentrationMm) {
    const edValue = toNum(ed, 0);
    if (!edValue || decentrationMm === null) return null;
    return edValue + 2 * Math.abs(decentrationMm) + 2;
  }

  /**
   * แปลงค่าการมองเห็นเป็นทศนิยมและ LogMAR
   * รองรับรูปแบบ 6/6, 6/12, 20/20, 20/40 และตัวเลขทศนิยม
   */
  function parseVA(va) {
    const text = String(va || '').trim();
    if (!text) return null;
    const fraction = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    let decimal = null;
    if (fraction) {
      const numerator = parseFloat(fraction[1]);
      const denominator = parseFloat(fraction[2]);
      if (denominator > 0) decimal = numerator / denominator;
    } else if (/^\d*\.?\d+$/.test(text)) {
      decimal = parseFloat(text);
    }
    if (!decimal || decimal <= 0) return null;
    return { decimal, logMAR: -Math.log10(decimal) };
  }

  /** เกณฑ์ที่ใช้ประเมินความเสี่ยงทางคลินิก (ใช้ร่วมกันทั้งระบบ) */
  const CLINICAL_THRESHOLDS = {
    highMyopia: -6.00,
    moderateMyopia: -3.00,
    highHyperopia: 4.00,
    highAstigmatism: 2.00,
    anisometropia: 2.00,
    rapidProgression: 0.50,
    reducedVaLogMAR: 0.3,
    recallMonths: 12,
    vertexCriticalPower: 4.00
  };

  /**
   * ประเมินความเสี่ยงทางคลินิกจากค่าสายตา คืน array ของธงเตือน
   * level: 'danger' = ควรส่งต่อ/ติดตามใกล้ชิด, 'warn' = ต้องระวังตอนประกอบแว่น, 'info' = ข้อมูลประกอบ
   */
  function clinicalFlags(refraction, options = {}) {
    const flags = [];
    if (!refraction) return flags;
    const { distance, near } = refraction;
    const seOd = sphericalEquivalent(distance.od.sph, distance.od.cyl);
    const seOs = sphericalEquivalent(distance.os.sph, distance.os.cyl);
    const maxCyl = Math.max(Math.abs(distance.od.cyl), Math.abs(distance.os.cyl));
    const aniso = Math.abs(seOd - seOs);

    if (Math.min(seOd, seOs) <= CLINICAL_THRESHOLDS.highMyopia) {
      flags.push({
        level: 'danger',
        code: 'HIGH_MYOPIA',
        label: 'สายตาสั้นระดับสูง',
        detail: `SE ${formatDiopter(Math.min(seOd, seOs))} D (เกณฑ์ ≤ ${formatDiopter(CLINICAL_THRESHOLDS.highMyopia)} D)`,
        action: 'ความเสี่ยงจอประสาทตาฉีกขาดและ Myopic maculopathy สูงขึ้น แนะนำตรวจจอประสาทตาแบบขยายม่านตาปีละครั้ง'
      });
    }
    if (Math.max(seOd, seOs) >= CLINICAL_THRESHOLDS.highHyperopia) {
      flags.push({
        level: 'warn',
        code: 'HIGH_HYPEROPIA',
        label: 'สายตายาวระดับสูง',
        detail: `SE ${formatDiopter(Math.max(seOd, seOs))} D`,
        action: 'ภาระการเพ่ง (Accommodative demand) สูง ควรตรวจ Binocular vision และประเมินอาการล้าตา'
      });
    }
    if (maxCyl >= CLINICAL_THRESHOLDS.highAstigmatism) {
      flags.push({
        level: 'warn',
        code: 'HIGH_ASTIG',
        label: 'สายตาเอียงระดับสูง',
        detail: `CYL ${formatDiopter(-maxCyl)} D`,
        action: 'ต้องระบุแกนให้แม่นยำ และเตือนลูกค้าเรื่องช่วงปรับตัวกับการบิดเบือนภาพ (Distortion)'
      });
    }
    if (aniso >= CLINICAL_THRESHOLDS.anisometropia) {
      flags.push({
        level: 'danger',
        code: 'ANISO',
        label: 'ค่าสายตาสองข้างต่างกันมาก',
        detail: `ต่างกัน ${aniso.toFixed(2)} D (เกณฑ์ ≥ ${CLINICAL_THRESHOLDS.anisometropia.toFixed(2)} D)`,
        action: 'เสี่ยงภาพสองข้างขนาดไม่เท่ากัน (Aniseikonia) และ Prismatic imbalance ควรพิจารณาดัชนีหักเหต่างกันในแต่ละข้าง'
      });
    }
    if (Math.max(Math.abs(seOd), Math.abs(seOs)) >= CLINICAL_THRESHOLDS.vertexCriticalPower) {
      flags.push({
        level: 'info',
        code: 'VERTEX',
        label: 'ต้องคำนึงถึงระยะ Vertex',
        detail: `กำลังเลนส์ ≥ ${CLINICAL_THRESHOLDS.vertexCriticalPower.toFixed(2)} D`,
        action: 'บันทึกระยะ Vertex ขณะวัด และชดเชยกำลังหากระยะประกอบจริงต่างจากตอนวัดเกิน 2 มม.'
      });
    }

    [['od', 'ขวา'], ['os', 'ซ้าย']].forEach(([eye, thaiEye]) => {
      const va = parseVA(distance[eye].va);
      if (va && va.logMAR > CLINICAL_THRESHOLDS.reducedVaLogMAR) {
        flags.push({
          level: 'danger',
          code: `LOW_VA_${eye.toUpperCase()}`,
          label: `การมองเห็นตา${thaiEye}ต่ำกว่าเกณฑ์`,
          detail: `VA ${distance[eye].va} (LogMAR ${va.logMAR.toFixed(2)})`,
          action: 'แก้ไขด้วยแว่นแล้วยังไม่ถึงเกณฑ์ปกติ ควรส่งต่อจักษุแพทย์เพื่อหาสาเหตุ'
        });
      }
    });

    const maxAdd = Math.max(near.od.add, near.os.add);
    if (maxAdd > 0) {
      flags.push({
        level: 'info',
        code: 'PRESBYOPIA',
        label: 'สายตายาวตามอายุ',
        detail: `ADD ${formatDiopter(maxAdd)} D`,
        action: 'ต้องวัด Segment height ในท่านั่งปกติ และเลือกกรอบที่มีความสูงเพียงพอ'
      });
    }

    if (options.progression && Math.abs(options.progression) >= CLINICAL_THRESHOLDS.rapidProgression) {
      flags.push({
        level: options.progression < 0 ? 'danger' : 'warn',
        code: 'PROGRESSION',
        label: 'ค่าสายตาเปลี่ยนแปลงเร็ว',
        detail: `${formatDiopter(options.progression)} D ต่อปี (เกณฑ์ ≥ ${CLINICAL_THRESHOLDS.rapidProgression.toFixed(2)} D)`,
        action: 'พิจารณาแนวทางชะลอสายตาสั้น (Myopia control) และนัดติดตามทุก 6 เดือน'
      });
    }

    return flags;
  }

  /**
   * คำนวณอัตราการเปลี่ยนแปลงค่าสายตาต่อปีจากประวัติการวัด (ค่าลบ = สายตาสั้นเพิ่มขึ้น)
   * @param {Array} history รายการตรวจเรียงจากใหม่ไปเก่า
   */
  function progressionRate(history) {
    if (!Array.isArray(history) || history.length < 2) return null;
    const latest = history[0];
    const earliest = history[history.length - 1];
    const days = (new Date(`${latest.date}T00:00:00`) - new Date(`${earliest.date}T00:00:00`)) / 86400000;
    if (!Number.isFinite(days) || days < 90) return null;

    const seOf = (record) => (
      sphericalEquivalent(record.refraction.distance.od.sph, record.refraction.distance.od.cyl)
      + sphericalEquivalent(record.refraction.distance.os.sph, record.refraction.distance.os.cyl)
    ) / 2;

    return (seOf(latest) - seOf(earliest)) / (days / 365.25);
  }

  /** สรุปค่าที่คำนวณได้จากค่าสายตาหนึ่งชุด ใช้แสดงในแฟ้มลูกค้าและผู้ช่วยแนะนำเลนส์ */
  function refractionSummary(refraction) {
    const { distance, near } = refraction;
    const build = (eye) => {
      const se = sphericalEquivalent(distance[eye].sph, distance[eye].cyl);
      const astig = astigmatismType(distance[eye].ax, distance[eye].cyl);
      const plusCyl = transpose(distance[eye].sph, distance[eye].cyl, distance[eye].ax);
      const va = parseVA(distance[eye].va);
      return { se, astig, plusCyl, va, nearSph: near[eye].sph, add: near[eye].add };
    };
    return {
      od: build('od'),
      os: build('os'),
      aniso: anisometropia(distance.od.sph, distance.od.cyl, distance.os.sph, distance.os.cyl),
      maxAdd: Math.max(near.od.add, near.os.add)
    };
  }

  /* ==========================================================================
   * 3. DATA MODEL & SEED DATA
   * ========================================================================== */

  const emptyEye = () => ({ sph: 0, cyl: 0, ax: 0, va: '' });

  /**
   * ทำให้ข้อมูลค่าสายตาอยู่ในรูปแบบมาตรฐานเดียวกัน
   * รองรับทั้งรูปแบบใหม่ (distance/near) และรูปแบบเดิม ({ od, os, add, pd })
   */
  function normalizeRefraction(input) {
    const src = input && typeof input === 'object' ? input : {};
    const legacyOd = src.od && typeof src.od === 'object' ? src.od : {};
    const legacyOs = src.os && typeof src.os === 'object' ? src.os : {};
    const distSrc = src.distance && typeof src.distance === 'object' ? src.distance : { od: legacyOd, os: legacyOs };
    const nearSrc = src.near && typeof src.near === 'object' ? src.near : {};
    const legacyAdd = toNum(src.add, 0);

    const readEye = (eye) => ({
      sph: clamp(toNum(eye && eye.sph, 0), -30, 30),
      cyl: clamp(toNum(eye && eye.cyl, 0), -10, 10),
      ax: clamp(toInt(eye && eye.ax, 0), 0, 180),
      va: String((eye && eye.va) ?? '').trim()
    });

    const distance = { od: readEye(distSrc.od), os: readEye(distSrc.os) };

    const readNear = (eye, distEye) => {
      const add = clamp(toNum(eye && eye.add, legacyAdd), 0, 4);
      const hasSph = eye && eye.sph !== undefined && eye.sph !== null && eye.sph !== '';
      return {
        add,
        sph: clamp(hasSph ? toNum(eye.sph, 0) : distEye.sph + add, -30, 30),
        va: String((eye && eye.va) ?? '').trim()
      };
    };

    const pdSrc = src.pd && typeof src.pd === 'object' ? src.pd : {};
    const legacyPd = typeof src.pd === 'number' || typeof src.pd === 'string' ? toNum(src.pd, 0) : 0;
    const pdFar = toNum(pdSrc.far, legacyPd);

    return {
      distance,
      near: { od: readNear(nearSrc.od, distance.od), os: readNear(nearSrc.os, distance.os) },
      pd: { far: pdFar, near: toNum(pdSrc.near, pdFar ? Math.round((pdFar - 3) * 2) / 2 : 0) },
      segHeight: toNum(src.segHeight, 0)
    };
  }

  /** หนึ่งรายการตรวจวัดสายตา (Examination record) ในแฟ้มประวัติ */
  function normalizeExam(input, fallbackDate) {
    const src = input && typeof input === 'object' ? input : {};
    return {
      id: String(src.id || uid('ex')),
      date: String(src.date || fallbackDate || todayISO()),
      optometrist: String(src.optometrist || '').trim(),
      method: EXAM_METHODS.includes(String(src.method || '')) ? String(src.method) : 'Subjective refraction',
      refraction: normalizeRefraction(src.refraction),
      note: String(src.note || '').trim()
    };
  }

  function normalizeCustomer(input) {
    const src = input && typeof input === 'object' ? input : {};
    const gender = String(src.gender || '').trim();
    const faceShape = String(src.faceShape || '').trim();
    const createdAt = String(src.createdAt || todayISO());

    // ประวัติการตรวจเรียงจากใหม่ไปเก่า และค่า refraction ปัจจุบันคือรายการล่าสุดเสมอ
    let history = Array.isArray(src.history) && src.history.length
      ? src.history.map((exam) => normalizeExam(exam, createdAt))
      : [normalizeExam({ refraction: src.refraction, date: src.updatedAt || createdAt }, createdAt)];
    history.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return {
      id: String(src.id || uid('c')),
      name: String(src.name || '').trim(),
      phone: String(src.phone ?? '').trim(),
      email: String(src.email || '').trim(),
      gender: GENDERS.includes(gender) ? gender : 'อื่นๆ',
      age: clamp(toInt(src.age, 0), 0, 120),
      occupation: String(src.occupation || '').trim(),
      faceShape: FACE_SHAPES.includes(faceShape) ? faceShape : '',
      notes: String(src.notes || '').trim(),
      ocular: {
        conditions: String(src.ocular?.conditions || '').trim(),
        medications: String(src.ocular?.medications || '').trim(),
        familyHistory: String(src.ocular?.familyHistory || '').trim(),
        contactLens: String(src.ocular?.contactLens || '').trim(),
        chiefComplaint: String(src.ocular?.chiefComplaint || '').trim()
      },
      history,
      refraction: history[0].refraction,
      createdAt,
      updatedAt: String(src.updatedAt || history[0].date || createdAt)
    };
  }

  function normalizeProduct(input) {
    const src = input && typeof input === 'object' ? input : {};
    const category = String(src.category || '').trim();
    return {
      id: String(src.id || uid('p')),
      category: CATEGORIES.includes(category) ? category : normalizeCategory(category),
      name: String(src.name || '').trim(),
      barcode: String(src.barcode || '').trim(),
      cost: Math.max(0, toNum(src.cost, 0)),
      price: Math.max(0, toNum(src.price, 0)),
      stock: Math.max(0, toInt(src.stock, 0)),
      minAlert: Math.max(0, toInt(src.minAlert, 3))
    };
  }

  /** พารามิเตอร์ใบสั่งงานแล็บ (Lab work order) — ค่าที่ช่างฝนเลนส์ต้องใช้ */
  function normalizeLabSpec(input) {
    const src = input && typeof input === 'object' ? input : {};
    const frameType = String(src.frameType || '');
    const edgeTreatment = String(src.edgeTreatment || '');
    return {
      frameType: FRAME_TYPES.includes(frameType) ? frameType : FRAME_TYPES[0],
      a: toNum(src.a, 0),
      b: toNum(src.b, 0),
      dbl: toNum(src.dbl, 0),
      ed: toNum(src.ed, 0),
      monoPdOd: toNum(src.monoPdOd, 0),
      monoPdOs: toNum(src.monoPdOs, 0),
      fittingHeightOd: toNum(src.fittingHeightOd, 0),
      fittingHeightOs: toNum(src.fittingHeightOs, 0),
      pantoscopicTilt: toNum(src.pantoscopicTilt, 0),
      vertexDistance: toNum(src.vertexDistance, 0),
      wrapAngle: toNum(src.wrapAngle, 0),
      lensIndex: toNum(src.lensIndex, 0),
      coating: String(src.coating || '').trim(),
      tint: String(src.tint || '').trim(),
      edgeTreatment: EDGE_TREATMENTS.includes(edgeTreatment) ? edgeTreatment : EDGE_TREATMENTS[0]
    };
  }

  function normalizeOrder(input) {
    const src = input && typeof input === 'object' ? input : {};
    const status = String(src.status || '').trim();
    const total = Math.max(0, toNum(src.total, 0));
    const discount = Math.max(0, toNum(src.discount, 0));
    const finalTotal = Math.max(0, toNum(src.finalTotal, total - discount));
    const deposit = clamp(toNum(src.deposit, 0), 0, finalTotal);
    return {
      id: String(src.id || uid('ORD-')),
      customerId: String(src.customerId || ''),
      customerName: String(src.customerName || '').trim(),
      frameId: src.frameId ? String(src.frameId) : null,
      frameName: String(src.frameName || '').trim(),
      lensId: src.lensId ? String(src.lensId) : null,
      lensName: String(src.lensName || '').trim(),
      total,
      discount,
      finalTotal,
      deposit,
      balance: Math.max(0, finalTotal - deposit),
      payment: String(src.payment || 'เงินสด').trim(),
      status: Object.values(ORDER_STATUS).includes(status) ? status : ORDER_STATUS.PENDING,
      labInstruction: String(src.labInstruction || '').trim(),
      // สำเนาค่าสายตา ณ วันสั่งตัด — ล็อกไว้เพื่อไม่ให้เปลี่ยนตามการวัดครั้งใหม่ของลูกค้า
      rx: src.rx ? normalizeRefraction(src.rx) : null,
      lab: normalizeLabSpec(src.lab),
      promiseDate: String(src.promiseDate || '').trim(),
      createdAt: String(src.createdAt || todayISO())
    };
  }

  /** เดาหมวดหมู่จากข้อความไทย/อังกฤษที่มาจาก Google Sheets */
  function normalizeCategory(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return 'Frame';
    if (/contact|คอนแทค/.test(text)) return 'ContactLens';
    if (/frame|กรอบ/.test(text)) return 'Frame';
    if (/lens|เลนส์/.test(text)) return 'Lens';
    if (/access|น้ำยา|อุปกรณ์/.test(text)) return 'Accessory';
    return 'Frame';
  }

  function normalizeGender(value) {
    const text = String(value || '').trim().toLowerCase();
    if (/^(ช|ชาย|m|male)$/.test(text)) return 'ชาย';
    if (/^(ญ|หญิง|f|female)$/.test(text)) return 'หญิง';
    return 'อื่นๆ';
  }

  const SEED_CUSTOMERS = [
    {
      id: 'c1',
      name: 'สมศักดิ์ รักชาติ',
      phone: '0812345678',
      email: 'somsak@example.com',
      gender: 'ชาย',
      age: 45,
      occupation: 'โปรแกรมเมอร์',
      faceShape: 'เหลี่ยม',
      notes: 'ใช้หน้าจอมากกว่า 8-10 ชั่วโมงต่อวัน มีตาแห้งตอนเย็น เริ่มมองใกล้ไม่ชัด',
      createdAt: '2024-06-18',
      ocular: {
        chiefComplaint: 'มองใกล้ไม่ชัดเวลาอ่านเอกสาร ต้องยืดแขนออก และล้าตาช่วงบ่าย',
        conditions: 'ตาแห้งระดับเล็กน้อย (Dry eye)',
        medications: 'น้ำตาเทียม Sodium hyaluronate 0.1% วันละ 3 ครั้ง',
        familyHistory: 'บิดามีต้อหินมุมเปิด',
        contactLens: 'ไม่เคยใช้คอนแทคเลนส์'
      },
      history: [
        {
          date: '2026-06-18',
          optometrist: 'ทนพ. ธนกฤต ว.',
          method: 'Subjective refraction',
          note: 'เพิ่ม ADD ครั้งแรกตามอาการ Presbyopia',
          refraction: {
            distance: { od: { sph: -3.5, cyl: -0.75, ax: 180, va: '6/6' }, os: { sph: -3.25, cyl: -0.5, ax: 175, va: '6/6' } },
            near: { od: { add: 1.5, va: 'N5' }, os: { add: 1.5, va: 'N5' } },
            pd: { far: 64, near: 61 },
            segHeight: 22
          }
        },
        {
          date: '2024-06-18',
          optometrist: 'ทนพ. ธนกฤต ว.',
          method: 'Subjective refraction',
          note: 'ยังไม่ต้องใช้ ADD',
          refraction: {
            distance: { od: { sph: -3.25, cyl: -0.75, ax: 180, va: '6/6' }, os: { sph: -3.0, cyl: -0.5, ax: 175, va: '6/6' } },
            near: { od: { add: 0, va: '' }, os: { add: 0, va: '' } },
            pd: { far: 64, near: 61 },
            segHeight: 0
          }
        }
      ]
    },
    {
      id: 'c2',
      name: 'ศิริพร บุญช่วย',
      phone: '0898765432',
      email: 'siriporn@example.com',
      gender: 'หญิง',
      age: 28,
      occupation: 'นักออกแบบกราฟิก',
      faceShape: 'กลม',
      notes: 'มองไฟตอนกลางคืนแล้วรู้สึกฟุ้งกระจาย และแพ้แสงจ้ากลางแจ้ง',
      createdAt: '2026-02-11',
      ocular: {
        chiefComplaint: 'แสงไฟตอนกลางคืนฟุ้งกระจาย (Glare) และสู้แสงจ้ากลางแจ้งไม่ได้',
        conditions: '-',
        medications: '-',
        familyHistory: 'มารดาสายตาสั้น -5.00 D',
        contactLens: 'ใส่คอนแทคเลนส์รายวันสัปดาห์ละ 2-3 วัน'
      },
      history: [
        {
          date: '2026-02-11',
          optometrist: 'ทนพ. ธนกฤต ว.',
          method: 'Subjective refraction',
          note: 'ค่าสายตาคงที่จากการตรวจครั้งก่อน',
          refraction: {
            distance: { od: { sph: -1.25, cyl: -0.25, ax: 90, va: '6/6' }, os: { sph: -1.5, cyl: 0, ax: 0, va: '6/6' } },
            near: { od: { add: 0, va: '' }, os: { add: 0, va: '' } },
            pd: { far: 62, near: 59 },
            segHeight: 0
          }
        }
      ]
    },
    {
      id: 'c3',
      name: 'ณัฐวุฒิ พงษ์ไพบูลย์',
      phone: '0851122334',
      email: 'nattawut@example.com',
      gender: 'ชาย',
      age: 14,
      occupation: 'นักเรียนมัธยมศึกษา',
      faceShape: 'รูปไข่',
      notes: 'ใช้แท็บเล็ตเรียนออนไลน์วันละ 6 ชั่วโมง ทำกิจกรรมกลางแจ้งน้อย',
      createdAt: '2023-08-05',
      ocular: {
        chiefComplaint: 'มองกระดานไม่ชัด ต้องหรี่ตา ค่าสายตาเพิ่มขึ้นทุกปี',
        conditions: '-',
        medications: '-',
        familyHistory: 'บิดาและมารดาสายตาสั้นทั้งคู่ (-6.00 D และ -4.50 D)',
        contactLens: 'ยังไม่เคยใช้'
      },
      history: [
        {
          date: '2025-08-05',
          optometrist: 'ทนพ. ธนกฤต ว.',
          method: 'Subjective refraction',
          note: 'ค่าสายตาสั้นเพิ่มขึ้นต่อเนื่อง แนะนำแนวทางชะลอสายตาสั้นและเพิ่มกิจกรรมกลางแจ้ง',
          refraction: {
            distance: { od: { sph: -6.25, cyl: -1.0, ax: 175, va: '6/6' }, os: { sph: -5.75, cyl: -0.75, ax: 5, va: '6/9' } },
            near: { od: { add: 0, va: '' }, os: { add: 0, va: '' } },
            pd: { far: 60, near: 57 },
            segHeight: 0
          }
        },
        {
          date: '2023-08-05',
          optometrist: 'ทนพ. ธนกฤต ว.',
          method: 'Subjective refraction',
          note: 'ตรวจครั้งแรกที่ร้าน',
          refraction: {
            distance: { od: { sph: -4.5, cyl: -0.75, ax: 175, va: '6/6' }, os: { sph: -4.25, cyl: -0.75, ax: 5, va: '6/6' } },
            near: { od: { add: 0, va: '' }, os: { add: 0, va: '' } },
            pd: { far: 59, near: 56 },
            segHeight: 0
          }
        }
      ]
    }
  ];

  const SEED_PRODUCTS = [
    { id: 'p1', name: 'Ray-Ban Clubmaster Classic (Black)', category: 'Frame', barcode: '805289397858', cost: 3500, price: 5800, stock: 4, minAlert: 2 },
    { id: 'p2', name: 'Oakley Pitchman R (Satin Black)', category: 'Frame', barcode: '888392342345', cost: 4200, price: 6900, stock: 1, minAlert: 2 },
    { id: 'p3', name: 'Hoya Nulux Classic 1.60 Blue Control', category: 'Lens', barcode: 'HOYABLC16', cost: 1800, price: 3500, stock: 12, minAlert: 5 },
    { id: 'p4', name: 'Essilor Crizal Sapphire HR 1.56', category: 'Lens', barcode: 'ESSSAPH156', cost: 1200, price: 2400, stock: 8, minAlert: 5 },
    { id: 'p5', name: 'Acuvue Oasys รายวัน (30 ชิ้น)', category: 'ContactLens', barcode: 'ACUOAS30', cost: 750, price: 1290, stock: 6, minAlert: 4 },
    { id: 'p6', name: 'น้ำยาล้างคอนแทคเลนส์ Opti-Free 300 มล.', category: 'Accessory', barcode: 'OPTF300', cost: 180, price: 320, stock: 15, minAlert: 5 }
  ];

  const SEED_ORDERS = [
    {
      id: 'ORD-1001',
      customerId: 'c1',
      customerName: 'สมศักดิ์ รักชาติ',
      frameId: 'p1',
      frameName: 'Ray-Ban Clubmaster Classic (Black)',
      lensId: 'p3',
      lensName: 'Hoya Nulux Classic 1.60 Blue Control',
      total: 9300,
      discount: 500,
      finalTotal: 8800,
      payment: 'บัตรเครดิต',
      deposit: 4000,
      status: ORDER_STATUS.GRINDING,
      labInstruction: 'ตรวจสอบแกนเอียงก่อนเจียร์ และลบเหลี่ยมขอบเลนส์ด้านจมูก',
      promiseDate: '2026-06-27',
      rx: {
        distance: { od: { sph: -3.5, cyl: -0.75, ax: 180, va: '6/6' }, os: { sph: -3.25, cyl: -0.5, ax: 175, va: '6/6' } },
        near: { od: { add: 1.5, va: 'N5' }, os: { add: 1.5, va: 'N5' } },
        pd: { far: 64, near: 61 },
        segHeight: 22
      },
      lab: {
        frameType: 'เต็มกรอบ (Full rim)',
        a: 52, b: 38, dbl: 20, ed: 55,
        monoPdOd: 32, monoPdOs: 32,
        fittingHeightOd: 22, fittingHeightOs: 22,
        pantoscopicTilt: 8, vertexDistance: 12, wrapAngle: 5,
        lensIndex: 1.6,
        coating: 'Blue Control + Multicoat',
        tint: '-',
        edgeTreatment: 'เจียร์ปกติ (Standard bevel)'
      },
      createdAt: '2026-06-20'
    },
    {
      id: 'ORD-1002',
      customerId: 'c3',
      customerName: 'ณัฐวุฒิ พงษ์ไพบูลย์',
      frameId: 'p2',
      frameName: 'Oakley Pitchman R (Satin Black)',
      lensId: 'p3',
      lensName: 'Hoya Nulux Classic 1.60 Blue Control',
      total: 10400,
      discount: 900,
      finalTotal: 9500,
      deposit: 9500,
      payment: 'โอนเงินผ่านธนาคาร',
      status: ORDER_STATUS.DONE,
      labInstruction: 'ค่าสายตาสูง เลือกกรอบขนาดเล็กและลบเหลี่ยมขอบเลนส์',
      promiseDate: '2026-09-08',
      createdAt: '2026-09-03'
    },
    {
      id: 'ORD-1003',
      customerId: 'c2',
      customerName: 'ศิริพร บุญช่วย',
      frameId: 'p1',
      frameName: 'Ray-Ban Clubmaster Classic (Black)',
      lensId: 'p4',
      lensName: 'Essilor Crizal Sapphire HR 1.56',
      total: 8200,
      discount: 200,
      finalTotal: 8000,
      deposit: 8000,
      payment: 'บัตรเครดิต',
      status: ORDER_STATUS.DONE,
      labInstruction: '',
      promiseDate: '2026-08-18',
      createdAt: '2026-08-12'
    }
  ];

  /* ==========================================================================
   * 4. STATE & PERSISTENCE
   * ========================================================================== */

  const state = {
    customers: [],
    products: [],
    orders: [],
    filters: {
      customerQuery: '',
      customerGender: '',
      customerView: 'all',
      inventoryQuery: '',
      inventoryCategory: '',
      lowStockOnly: false,
      orderStatus: 'all'
    },
    storageAvailable: false,
    lastConsultation: null,
    /** mode: 'local' | 'sheet' | 'api' — ต้องตรงกับตัวเลือกในหน้าตั้งค่า */
    backend: { mode: 'local', url: '', token: '' },
    /** เซสชันที่ได้จากการล็อกอิน — token เก็บใน sessionStorage ไม่ใช่ localStorage */
    session: { token: '', user: null, permissions: [] },
    /** ความยาวรหัสผ่านขั้นต่ำที่เซิร์ฟเวอร์กำหนด (อัปเดตจาก authStatus) */
    minPasswordLength: 8,
    /** โหมดออฟไลน์ถูกล็อกหน้าจออยู่หรือไม่ (ไม่เกี่ยวกับโหมดที่มีบัญชีผู้ใช้) */
    screenLocked: false
  };

  /** ตรวจสิทธิ์ฝั่งหน้าเว็บเพื่อซ่อนปุ่มเท่านั้น — ด่านจริงอยู่ที่เซิร์ฟเวอร์ */
  const can = (action) =>
    state.backend.mode !== 'api' || state.session.permissions.includes(action);

  function detectStorage() {
    try {
      const probe = '__opticare_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (error) {
      console.warn('localStorage ไม่พร้อมใช้งาน ระบบจะทำงานแบบชั่วคราวในหน่วยความจำ', error);
      return false;
    }
  }

  function persist() {
    if (!state.storageAvailable) return;
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify({
        version: 2,
        savedAt: new Date().toISOString(),
        customers: state.customers,
        products: state.products,
        orders: state.orders
      }));
    } catch (error) {
      state.storageAvailable = false;
      console.warn('บันทึกข้อมูลลงเครื่องไม่สำเร็จ', error);
      showToast('บันทึกข้อมูลลงเบราว์เซอร์ไม่สำเร็จ (พื้นที่อาจเต็ม) ระบบจะเก็บข้อมูลไว้ชั่วคราวเท่านั้น', 'error');
    }
  }

  function restore() {
    if (!state.storageAvailable) return false;
    try {
      const rawText = localStorage.getItem(CONFIG.storageKey);
      if (!rawText) return false;
      const data = JSON.parse(rawText);
      if (!data || typeof data !== 'object') return false;
      state.customers = (Array.isArray(data.customers) ? data.customers : []).map(normalizeCustomer);
      state.products = (Array.isArray(data.products) ? data.products : []).map(normalizeProduct);
      state.orders = (Array.isArray(data.orders) ? data.orders : []).map(normalizeOrder);
      return true;
    } catch (error) {
      console.warn('อ่านข้อมูลที่บันทึกไว้ไม่สำเร็จ ระบบจะใช้ข้อมูลตั้งต้นแทน', error);
      return false;
    }
  }

  function loadSeed() {
    state.customers = SEED_CUSTOMERS.map(normalizeCustomer);
    state.products = SEED_PRODUCTS.map(normalizeProduct);
    state.orders = SEED_ORDERS.map(normalizeOrder);
  }

  /* ==========================================================================
   * 5. DOM REFERENCES
   * ========================================================================== */

  const els = {};

  function cacheElements() {
    Object.assign(els, {
      appShell: $('#app-shell'),
      loginScreen: $('#login-screen'),
      loginError: $('#login-error'),
      loginChecking: $('#login-checking'),
      loginFormPanel: $('#login-form-panel'),
      loginForm: $('#login-form'),
      loginUsername: $('#login-username'),
      loginPassword: $('#login-password'),
      loginSubmit: $('#login-submit'),
      loginChangePassword: $('#login-change-password'),
      loginOffline: $('#login-offline'),
      changePasswordForm: $('#change-password-form'),
      changePasswordHint: $('#change-password-hint'),
      changePasswordError: $('#change-password-error'),
      currentPassword: $('#current-password'),
      newPassword: $('#new-password'),
      confirmPassword: $('#confirm-password'),
      loginFootnote: $('#login-footnote'),
      loginSubtitle: $('#login-subtitle'),
      loginSetup: $('#login-setup'),
      loginSetupTitle: $('#login-setup-title'),
      loginSetupDetail: $('#login-setup-detail'),
      sessionName: $('#session-name'),
      sessionRole: $('#session-role'),
      sessionAvatar: $('#session-avatar'),
      manageUsersBtn: $('#btn-manage-users'),
      changePasswordBtn: $('#btn-change-password'),
      usersList: $('#users-list'),
      userForm: $('#user-form'),

      dbStatusText: $('#db-status-text'),
      dbStatusDot: $('#db-status-indicator'),
      kpiRevenue: $('#kpi-revenue'),
      kpiRevenueDelta: $('#kpi-revenue-delta'),
      kpiMargin: $('#kpi-margin'),
      kpiMarginRate: $('#kpi-margin-rate'),
      kpiAtv: $('#kpi-atv'),
      kpiAtvDetail: $('#kpi-atv-detail'),
      kpiLabOverdue: $('#kpi-lab-overdue'),
      kpiNewCustomers: $('#kpi-new-customers'),
      kpiRecall: $('#kpi-recall'),
      clinicalWatchList: $('#clinical-watch-list'),
      clinicalAlertCount: $('#clinical-alert-count'),
      dashCustomers: $('#dash-customers-count'),
      dashPending: $('#dash-pending-labs'),
      dashLowStock: $('#dash-low-stock'),
      dashOrdersTable: $('#dash-orders-table'),
      dashCustomersTable: $('#dash-customers-table'),

      diagBadge: $('#diagnostic-badge'),
      diagEnv: $('#diag-env-type'),
      diagProducts: $('#diag-sheet-products'),
      diagCustomers: $('#diag-sheet-customers'),
      diagStatus: $('#diag-api-status'),
      syncProductsBtn: $('#btn-sync-products'),
      syncCustomersBtn: $('#btn-sync-customers'),
      syncProductsIcon: $('#conn-test-icon'),
      syncCustomersIcon: $('#cust-sync-icon'),

      customerSearch: $('#customer-search'),
      customerGenderFilter: $('#customer-filter-gender'),
      customersGrid: $('#customers-grid'),
      customersCount: $('#customers-count'),

      inventorySearch: $('#inventory-search'),
      inventoryBody: $('#inventory-table-body'),
      countFrame: $('#frame-count'),
      countLens: $('#lens-count'),
      countContact: $('#contact-count'),
      countAccessory: $('#accessory-count'),

      ordersList: $('#orders-list'),

      customerForm: $('#customer-form'),
      productForm: $('#product-form'),
      orderForm: $('#order-form'),
      consultForm: $('#consult-form'),

      confirmModal: $('#confirm-modal'),
      confirmTitle: $('#confirm-title'),
      confirmMessage: $('#confirm-message'),
      confirmIcon: $('#confirm-icon'),
      confirmSubmit: $('#confirm-submit-btn'),

      toast: $('#custom-toast'),
      toastIcon: $('#toast-icon'),
      toastMessage: $('#toast-message'),

      aiCustomerSelect: $('#ai-customer-select'),
      aiLoading: $('#ai-loading'),
      aiPlaceholder: $('#ai-placeholder'),
      aiResult: $('#ai-result-content'),
      aiDiag: $('#ai-diag-summary'),
      aiLens: $('#ai-lens-recommendation'),
      aiFrame: $('#ai-frame-recommendation'),
      aiPitch: $('#ai-sales-pitch'),
      aiAdvice: $('#ai-extra-advice'),
      aiStockWrap: $('#ai-stock-match-wrap'),
      aiStock: $('#ai-stock-match'),
      aiSubmitBtn: $('#btn-request-ai'),
      aiClinicalBody: $('#ai-clinical-body'),
      aiClinicalNotes: $('#ai-clinical-notes'),
      aiReasoningWrap: $('#ai-reasoning-wrap'),
      aiReasoning: $('#ai-reasoning'),
      aiMaterialBody: $('#ai-material-body'),

      rxComputedBody: $('#rx-computed-body'),
      rxComputedSummary: $('#rx-computed-summary'),
      rxComputedFlags: $('#rx-computed-flags'),
      examHistoryWrap: $('#exam-history-wrap'),
      examHistory: $('#exam-history'),
      examProgression: $('#exam-progression'),
      examModeWrap: $('#exam-mode-wrap'),
      examEditWrap: $('#exam-edit-wrap'),
      examEditingId: $('#exam-editing-id'),
      examEditingDate: $('#exam-editing-date'),
      deleteCustomerBtn: $('#btn-delete-customer'),

      syncReportBody: $('#sync-report-body'),
      syncReportTitle: $('#sync-report-title-text'),
      syncReportSubtitle: $('#sync-report-subtitle'),
      backendModeText: $('#backend-mode-text'),
      backendApiActions: $('#backend-api-actions'),
      backendSheetActions: $('#backend-sheet-actions'),
      backendApiFields: $('#backend-api-fields'),
      backendForm: $('#backend-form'),
      backendPullBtn: $('#btn-backend-pull'),
      backendPullIcon: $('#backend-pull-icon'),
      backendPushBtn: $('#btn-backend-push'),
      backendPushIcon: $('#backend-push-icon'),

      ordRxPanel: $('#ord-rx-panel'),
      ordRxDate: $('#ord-rx-date'),
      labComputed: $('#lab-computed')
    });
  }

  /* ==========================================================================
   * 6. TOAST
   * ========================================================================== */

  let toastTimers = [];

  function showToast(message, type = 'success') {
    const { toast, toastIcon, toastMessage } = els;
    if (!toast || !toastIcon || !toastMessage) return;

    toastTimers.forEach(clearTimeout);
    toastTimers = [];

    toastMessage.textContent = message;
    const icons = {
      success: '<i class="fa-solid fa-circle-check text-emerald-400"></i>',
      error: '<i class="fa-solid fa-circle-exclamation text-rose-400"></i>',
      info: '<i class="fa-solid fa-circle-info text-sky-400"></i>'
    };
    toastIcon.innerHTML = icons[type] || icons.info;

    toast.classList.remove('hidden');
    toast.classList.add('toast-enter');
    requestAnimationFrame(() => {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-show');
    });

    toastTimers.push(setTimeout(() => {
      toast.classList.remove('toast-show');
      toast.classList.add('toast-enter');
      toastTimers.push(setTimeout(() => toast.classList.add('hidden'), 300));
    }, CONFIG.toastMs));
  }

  /* ==========================================================================
   * 7. MODAL MANAGER
   * ========================================================================== */

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const modalStack = [];

  const topModal = () => modalStack[modalStack.length - 1] || null;

  function focusFirst(modal) {
    const preferred = $('[data-autofocus]', modal);
    if (preferred) { preferred.focus(); return; }
    const focusable = $$(FOCUSABLE, modal).filter((el) => el.offsetParent !== null && !el.readOnly);
    const field = focusable.find((el) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
    (field || focusable[0] || modal).focus();
  }

  function openModal(modal) {
    if (!modal || modalStack.includes(modal)) return;
    modal.__restoreFocus = document.activeElement;
    modalStack.push(modal);
    modal.classList.remove('hidden');
    document.body.classList.add('is-modal-open');
    focusFirst(modal);
  }

  function closeModal(modal) {
    const index = modalStack.indexOf(modal);
    if (index === -1) return;
    modalStack.splice(index, 1);
    modal.classList.add('hidden');
    if (!modalStack.length) document.body.classList.remove('is-modal-open');

    const onClose = modal.__onClose;
    modal.__onClose = null;
    if (typeof onClose === 'function') onClose();

    const restore = modal.__restoreFocus;
    modal.__restoreFocus = null;
    if (restore && document.contains(restore) && typeof restore.focus === 'function') restore.focus();
  }

  function trapFocus(event) {
    const modal = topModal();
    if (!modal) return;
    const focusable = $$(FOCUSABLE, modal).filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** กล่องยืนยันแบบ Promise — คืน true เมื่อผู้ใช้กดยืนยัน */
  function askConfirm({ title, message, confirmLabel = 'ยืนยัน', danger = false, icon = '' }) {
    return new Promise((resolve) => {
      const modal = els.confirmModal;
      els.confirmTitle.textContent = title;
      els.confirmMessage.textContent = message;
      els.confirmSubmit.textContent = confirmLabel;
      els.confirmSubmit.className = danger
        ? 'flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-md transition'
        : 'flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md transition';
      els.confirmIcon.className = danger
        ? 'inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-100 text-rose-600 mt-2'
        : 'inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mt-2';
      const iconName = icon || (danger ? 'fa-trash-can' : 'fa-floppy-disk');
      els.confirmIcon.innerHTML = `<i class="fa-solid ${iconName} text-xl" aria-hidden="true"></i>`;

      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      modal.__onClose = () => settle(false);
      els.confirmSubmit.onclick = () => {
        settle(true);
        closeModal(modal);
      };

      openModal(modal);
    });
  }

  /* ==========================================================================
   * 8. AUTHENTICATION — ล็อกอินด้วยบัญชีผู้ใช้และรหัสผ่าน
   *
   * หน้าเว็บไม่ได้ตัดสินสิทธิ์เอง หน้าที่ของมันคือ
   *   1) ส่งชื่อผู้ใช้กับรหัสผ่านไปให้เซิร์ฟเวอร์ตรวจ (POST เท่านั้น)
   *   2) เก็บ session token ที่ได้กลับมาไว้ใน sessionStorage
   *   3) แนบ session token ไปกับทุกคำขอ
   * การตรวจสิทธิ์จริงเกิดที่ Code.gs ทุกครั้ง การซ่อนปุ่มเป็นเพียงเรื่องประสบการณ์ใช้งาน
   * ========================================================================== */

  function setLocked(locked) {
    const { loginScreen, appShell } = els;
    if (locked) {
      loginScreen.classList.remove('hidden', 'opacity-0');
      if (appShell) appShell.setAttribute('inert', '');
    } else {
      loginScreen.classList.add('opacity-0');
      if (appShell) appShell.removeAttribute('inert');
      window.setTimeout(() => loginScreen.classList.add('hidden'), 300);
    }
  }

  /** สลับแผงบนหน้าล็อกอิน: 'checking' | 'formPanel' | 'changePassword' | 'offline' | 'setup' */
  function showLoginPanel(name) {
    const panels = {
      checking: els.loginChecking,
      formPanel: els.loginFormPanel,
      changePassword: els.loginChangePassword,
      offline: els.loginOffline,
      setup: els.loginSetup
    };
    Object.keys(panels).forEach((key) => {
      panels[key].classList.toggle('hidden', key !== name);
    });
  }

  function showLoginError(message) {
    els.loginError.textContent = message;
    els.loginError.classList.toggle('hidden', !message);
  }

  function showChangePasswordError(message) {
    els.changePasswordError.textContent = message;
    els.changePasswordError.classList.toggle('hidden', !message);
  }

  function saveSession(session) {
    state.session = {
      token: session.sessionToken,
      user: session.user,
      permissions: session.permissions || []
    };
    try {
      sessionStorage.setItem(CONFIG.sessionKey, JSON.stringify(state.session));
    } catch (error) {
      /* sessionStorage อาจถูกปิด — เซสชันจะอยู่แค่ในหน่วยความจำ */
    }
  }

  function restoreSession() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(CONFIG.sessionKey) || 'null');
      if (stored && stored.token && stored.user) {
        state.session = stored;
        return true;
      }
    } catch (error) {
      /* ไม่มีเซสชันเดิม */
    }
    return false;
  }

  function clearSession() {
    state.session = { token: '', user: null, permissions: [] };
    try { sessionStorage.removeItem(CONFIG.sessionKey); } catch (error) { /* ไม่สำคัญ */ }
  }

  /** แสดงชื่อและบทบาทผู้ใช้บนแถบหัว พร้อมซ่อนปุ่มที่ไม่มีสิทธิ์ */
  function renderSession() {
    const user = state.session.user;
    const roleLabels = {
      owner: 'เจ้าของร้าน', admin: 'ผู้ดูแลระบบ', optometrist: 'ทัศนมาตร',
      staff: 'พนักงานขาย', viewer: 'ผู้ชมข้อมูล'
    };

    if (user) {
      const label = user.displayName || user.username;
      els.sessionName.textContent = label;
      els.sessionRole.textContent = `${roleLabels[user.role] || user.role} · ${user.username}`;
      els.sessionAvatar.innerHTML = html`${String(label).trim().charAt(0).toUpperCase()}`;
    } else {
      els.sessionName.textContent = state.backend.mode === 'api' ? '—' : 'โหมดออฟไลน์';
      els.sessionRole.textContent = state.backend.mode === 'api' ? 'ยังไม่ได้เข้าสู่ระบบ' : 'ข้อมูลเก็บในเครื่อง';
      els.sessionAvatar.innerHTML = html`<i class="fa-solid fa-user"></i>`;
    }

    els.manageUsersBtn.classList.toggle('hidden', !can('listUsers'));
    els.manageUsersBtn.classList.toggle('flex', can('listUsers'));

    // ปุ่มเปลี่ยนรหัสผ่านแสดงเฉพาะตอนล็อกอินกับเซิร์ฟเวอร์จริง (โหมดออฟไลน์ไม่มีบัญชี)
    const canChangePassword = Boolean(user) && state.backend.mode === 'api';
    els.changePasswordBtn.classList.toggle('hidden', !canChangePassword);
    els.changePasswordBtn.classList.toggle('flex', canChangePassword);

    // ซ่อนปุ่มที่บทบาทนี้ใช้ไม่ได้ (เซิร์ฟเวอร์ยังปฏิเสธซ้ำอีกชั้นเสมอ)
    const guarded = [
      ['new-customer', 'saveCustomer'], ['quick-new-customer', 'saveCustomer'],
      ['new-product', 'saveProduct'], ['new-order', 'createOrder'], ['quick-new-order', 'createOrder'],
      ['backend-push', 'saveCustomer'], ['backend-diagnose', 'diagnose'], ['reset-data', 'bootstrap'],
      ['backend-repair', 'repairDatabase']
    ];
    guarded.forEach(([action, permission]) => {
      $$(`[data-action="${action}"]`).forEach((button) => {
        button.classList.toggle('hidden', !can(permission));
      });
    });
  }

  /** ตรวจว่าเซิร์ฟเวอร์พร้อมให้ล็อกอินหรือยัง แล้วแสดงหน้าจอที่เหมาะสม */
  async function initAuth() {
    if (state.backend.mode !== 'api') {
      // โหมดออฟไลน์/อ่านอย่างเดียว ไม่มีบัญชีผู้ใช้ให้ตรวจ
      // "ออกจากระบบ" จึงหมายถึงล็อกหน้าจอ และต้องจำสถานะไว้ ไม่งั้นจะปลดล็อกตัวเองทันที
      if (state.screenLocked) {
        els.loginSubtitle.textContent = 'โหมดออฟไลน์ · ข้อมูลอยู่ในเครื่องนี้';
        els.loginFootnote.textContent = 'ต้องการบัญชีผู้ใช้และรหัสผ่านจริง ให้เชื่อมต่อกับเซิร์ฟเวอร์ Apps Script';
        showLoginPanel('offline');
        setLocked(true);
      } else {
        setLocked(false);
      }
      renderSession();
      return;
    }

    showLoginPanel('checking');
    setLocked(true);

    // มีเซสชันเดิมอยู่แล้ว — ตรวจกับเซิร์ฟเวอร์ว่ายังใช้ได้
    if (restoreSession()) {
      try {
        // ยิงพร้อมกัน ไม่ต้องรอ me เสร็จก่อนค่อยดึงข้อมูล — ถ้า token ใช้ไม่ได้ ทั้งคู่จะล้มเหลวเหมือนกันอยู่ดี
        const [me, data] = await Promise.all([
          apiCall('me'),
          fetchAllFromBackend()
        ]);

        state.session.user = { ...state.session.user, ...me.user };
        state.session.permissions = me.permissions;
        saveSession({ sessionToken: state.session.token, user: state.session.user, permissions: me.permissions });

        applyPulledData(data);
        markPullSucceeded();
        setLocked(false);
        renderSession();
        return;
      } catch (error) {
        clearSession();
      }
    }

    try {
      const status = await apiCall('authStatus');
      state.minPasswordLength = status.minPasswordLength || 8;

      // เซิร์ฟเวอร์พร้อม แต่ยังไม่มีบัญชีที่ตั้งรหัสผ่านไว้เลย
      if (!status.ready) {
        els.loginSubtitle.textContent = 'ยังไม่มีบัญชีผู้ใช้ในระบบ';
        els.loginSetupTitle.textContent = 'ผู้ดูแลต้องสร้างบัญชีแรกก่อน';
        els.loginSetupDetail.textContent =
          'เปิดไฟล์ Google Sheets ของร้าน แล้วใช้เมนู OptiCare › สร้างบัญชีผู้ดูแลคนแรก '
          + 'ระบบจะให้ตั้งชื่อผู้ใช้และสุ่มรหัสผ่านชั่วคราวมาให้ จากนั้นกลับมาเข้าสู่ระบบที่หน้านี้';
        showLoginPanel('setup');
        return;
      }

      els.loginSubtitle.textContent = 'เข้าสู่ระบบด้วยบัญชีที่ผู้ดูแลสร้างให้';
      els.loginFootnote.textContent =
        'ผู้ดูแลระบบเป็นผู้สร้างบัญชีและกำหนดสิทธิ์ การตรวจสอบสิทธิ์ทั้งหมดทำที่ฝั่งเซิร์ฟเวอร์เสมอ';
      showLoginError('');
      showLoginPanel('formPanel');
      els.loginPassword.value = '';
      els.loginUsername.focus();
    } catch (error) {
      els.loginSubtitle.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
      els.loginSetupTitle.textContent = 'ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์';
      els.loginSetupDetail.textContent = `เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ: ${error.message}`;
      showLoginPanel('setup');
    }
  }

  /** เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน */
  async function submitLogin(event) {
    if (event) event.preventDefault();

    const username = els.loginUsername.value.trim();
    const password = els.loginPassword.value;
    if (!username || !password) {
      showLoginError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      (username ? els.loginPassword : els.loginUsername).focus();
      return;
    }

    showLoginError('');
    els.loginSubmit.disabled = true;

    try {
      // ขอข้อมูลมาพร้อมกับการล็อกอินเลย จะได้ไม่ต้องเรียกเซิร์ฟเวอร์อีกรอบ
      const session = await apiCall('login', { username, password, withData: true }, 'POST');
      els.loginPassword.value = '';
      saveSession(session);

      // บัญชีใหม่หรือบัญชีที่ผู้ดูแลเพิ่งรีเซ็ตรหัส ต้องตั้งรหัสใหม่ก่อนใช้งาน
      if (session.mustChangePassword) {
        promptPasswordChange(password);
        return;
      }

      setLocked(false);
      renderSession();
      showToast(`ยินดีต้อนรับ ${session.user.displayName || session.user.username}`);

      if (session.data && Array.isArray(session.data.customers)) {
        applyPulledData(session.data);
        markPullSucceeded();
      } else {
        // เซิร์ฟเวอร์รุ่นเก่ายังไม่แนบข้อมูลมาให้ ต้องดึงเพิ่มอีกหนึ่งรอบ
        await backendPull({ quiet: true });
      }
    } catch (error) {
      showLoginError(error.message);
      els.loginPassword.value = '';
      els.loginPassword.focus();
    } finally {
      els.loginSubmit.disabled = false;
    }
  }

  /** เปิดแผงบังคับตั้งรหัสผ่านใหม่ (เติมรหัสเดิมให้อัตโนมัติถ้าเพิ่งกรอกมา) */
  function promptPasswordChange(currentPassword) {
    els.changePasswordHint.textContent =
      `รหัสผ่านต้องยาวอย่างน้อย ${state.minPasswordLength} ตัวอักษร และมีทั้งตัวอักษรและตัวเลข`;
    els.currentPassword.value = currentPassword || '';
    els.newPassword.value = '';
    els.confirmPassword.value = '';
    showChangePasswordError('');
    setLocked(true);
    showLoginPanel('changePassword');
    els.newPassword.focus();
  }

  async function submitPasswordChange(event) {
    event.preventDefault();

    const currentPassword = els.currentPassword.value;
    const newPassword = els.newPassword.value;
    if (newPassword !== els.confirmPassword.value) {
      showChangePasswordError('รหัสผ่านใหม่กับการยืนยันไม่ตรงกัน');
      els.confirmPassword.focus();
      return;
    }
    if (newPassword.length < state.minPasswordLength) {
      showChangePasswordError(`รหัสผ่านต้องยาวอย่างน้อย ${state.minPasswordLength} ตัวอักษร`);
      els.newPassword.focus();
      return;
    }

    showChangePasswordError('');
    try {
      await apiCall('changePassword', { currentPassword, newPassword }, 'POST');

      // เซิร์ฟเวอร์ไม่คืน token ใหม่ — token เดิมยังใช้ได้ แค่ต้องอ่านสิทธิ์ใหม่
      const me = await apiCall('me');
      state.session.user = me.user;
      state.session.permissions = me.permissions;
      saveSession({ sessionToken: state.session.token, user: me.user, permissions: me.permissions });

      els.currentPassword.value = '';
      els.newPassword.value = '';
      els.confirmPassword.value = '';

      setLocked(false);
      renderSession();
      showToast('ตั้งรหัสผ่านใหม่เรียบร้อย');
      await backendPull();
    } catch (error) {
      showChangePasswordError(error.message);
    }
  }

  /** ผู้ใช้ที่ล็อกอินอยู่กดเปลี่ยนรหัสผ่านเอง */
  function openPasswordChange() {
    if (!state.session.token) {
      showToast('ต้องเข้าสู่ระบบก่อนจึงจะเปลี่ยนรหัสผ่านได้', 'error');
      return;
    }
    promptPasswordChange('');
    els.currentPassword.focus();
  }

  async function handleLogout() {
    const ok = await askConfirm({
      title: 'ออกจากระบบ',
      message: state.backend.mode === 'api'
        ? 'ต้องการออกจากระบบใช่หรือไม่? ข้อมูลบน Google Sheets จะยังอยู่ครบ'
        : 'ต้องการล็อกหน้าจอใช่หรือไม่? ข้อมูลที่บันทึกไว้ในเครื่องจะยังคงอยู่',
      confirmLabel: 'ออกจากระบบ'
    });
    if (!ok) return;

    clearSession();
    if (state.backend.mode !== 'api') setScreenLocked(true);
    renderSession();
    showToast(state.backend.mode === 'api' ? 'ออกจากระบบเรียบร้อยแล้ว' : 'ล็อกหน้าจอแล้ว', 'info');
    await initAuth();
  }

  /** จำสถานะล็อกหน้าจอของโหมดออฟไลน์ไว้ข้ามการรีโหลดหน้า */
  function setScreenLocked(locked) {
    state.screenLocked = locked;
    if (!state.storageAvailable) return;
    try {
      if (locked) localStorage.setItem(CONFIG.lockKey, '1');
      else localStorage.removeItem(CONFIG.lockKey);
    } catch (error) {
      /* จำไม่ได้ก็ไม่เป็นไร แค่ล็อกไม่ข้ามการรีโหลด */
    }
  }

  function restoreScreenLock() {
    if (!state.storageAvailable) return;
    try {
      state.screenLocked = localStorage.getItem(CONFIG.lockKey) === '1';
    } catch (error) {
      state.screenLocked = false;
    }
  }

  /* ==========================================================================
   * 9. NAVIGATION
   * ========================================================================== */

  let activeTab = 'dashboard';

  function switchTab(tabId, options = {}) {
    if (!TABS.includes(tabId)) tabId = 'dashboard';
    activeTab = tabId;

    TABS.forEach((tab) => {
      const panel = document.getElementById(`tab-${tab}`);
      const deskBtn = document.getElementById(`btn-${tab}`);
      const mobBtn = document.getElementById(`mob-${tab}`);
      const isActive = tab === tabId;

      if (panel) panel.classList.toggle('hidden', !isActive);
      if (deskBtn) {
        deskBtn.classList.toggle('bg-blue-800', isActive);
        deskBtn.classList.toggle('text-sky-300', isActive);
        deskBtn.classList.toggle('font-semibold', isActive);
        if (isActive) deskBtn.setAttribute('aria-current', 'page');
        else deskBtn.removeAttribute('aria-current');
      }
      if (mobBtn) {
        mobBtn.classList.toggle('text-sky-300', isActive);
        mobBtn.classList.toggle('text-gray-400', !isActive);
        if (isActive) mobBtn.setAttribute('aria-current', 'page');
        else mobBtn.removeAttribute('aria-current');
      }
    });

    if (location.hash.slice(1) !== tabId) {
      history.replaceState(null, '', `#${tabId}`);
    }

    if (options.focusPanel !== false) {
      const panel = document.getElementById(`tab-${tabId}`);
      if (panel) panel.focus({ preventScroll: true });
    }
    if (!options.keepScroll) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ==========================================================================
   * 10. RENDERING
   * ========================================================================== */

  function renderAll() {
    renderDashboard();
    renderCustomers();
    renderInventory();
    renderOrders();
    populateSelects();
  }

  function statusBadge(status) {
    const meta = STATUS_LIST.find((item) => item.key === status);
    if (!meta) return html`<span class="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-700">${status}</span>`;
    return html`<span class="px-2 py-1 rounded text-xs font-semibold ${raw(meta.badge)}">${meta.label}</span>`;
  }

  const FLAG_STYLE = {
    danger: { chip: 'bg-rose-100 text-rose-800', dot: 'text-rose-500', icon: 'fa-circle-exclamation' },
    warn: { chip: 'bg-amber-100 text-amber-800', dot: 'text-amber-500', icon: 'fa-triangle-exclamation' },
    info: { chip: 'bg-sky-100 text-sky-800', dot: 'text-sky-500', icon: 'fa-circle-info' }
  };

  /** รวมข้อมูลทางคลินิกของลูกค้าหนึ่งราย (ธงเตือน + อัตราการเปลี่ยนแปลง + สถานะนัดตรวจ) */
  function customerClinicalProfile(customer) {
    const progression = progressionRate(customer.history);
    const flags = clinicalFlags(customer.refraction, { progression });
    const daysSinceExam = daysSince(customer.history[0].date);
    const recallDue = daysSinceExam !== null && daysSinceExam >= CLINICAL_THRESHOLDS.recallMonths * 30;
    return { progression, flags, daysSinceExam, recallDue, lastExam: customer.history[0].date };
  }

  function renderClinicalWatchList() {
    const rows = state.customers
      .map((customer) => ({ customer, profile: customerClinicalProfile(customer) }))
      .filter(({ profile }) => profile.flags.some((flag) => flag.level === 'danger' || flag.level === 'warn'))
      .sort((a, b) => {
        const score = ({ profile }) => profile.flags.filter((f) => f.level === 'danger').length * 10
          + profile.flags.filter((f) => f.level === 'warn').length;
        return score(b) - score(a);
      });

    els.clinicalAlertCount.textContent = `${formatNumber(rows.length)} ราย`;
    els.clinicalAlertCount.className = rows.length
      ? 'px-2 py-0.5 rounded text-2xs font-semibold bg-rose-100 text-rose-700 whitespace-nowrap'
      : 'px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-100 text-emerald-700 whitespace-nowrap';

    if (!rows.length) {
      els.clinicalWatchList.innerHTML = html`
        <p class="p-6 text-center text-sm text-gray-400">
          ไม่มีผู้รับบริการที่ค่าสายตาเข้าเกณฑ์เฝ้าระวังในขณะนี้
        </p>`;
      return;
    }

    els.clinicalWatchList.innerHTML = rows.slice(0, 6).map(({ customer, profile }) => {
      const shown = profile.flags.filter((flag) => flag.level !== 'info');
      return html`
        <div class="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-start gap-3">
          <div class="min-w-0 flex-grow space-y-1.5">
            <div class="flex items-center gap-2 flex-wrap">
              <strong class="text-sm font-bold text-gray-900">${customer.name}</strong>
              <span class="text-2xs text-gray-400">
                ตรวจล่าสุด ${thaiDate(profile.lastExam)}${profile.daysSinceExam !== null ? ` (${formatNumber(profile.daysSinceExam)} วันก่อน)` : ''}
              </span>
              ${profile.recallDue
                ? raw(html`<span class="px-1.5 py-0.5 rounded text-2xs font-semibold bg-amber-100 text-amber-800">ถึงกำหนดตรวจซ้ำ</span>`)
                : ''}
            </div>
            ${shown.map((flag) => raw(html`
              <p class="text-2xs text-gray-600 flex items-start gap-1.5">
                <i class="fa-solid ${raw(FLAG_STYLE[flag.level].icon)} ${raw(FLAG_STYLE[flag.level].dot)} mt-0.5" aria-hidden="true"></i>
                <span><strong class="text-gray-800">${flag.label}</strong> — ${flag.detail} · ${flag.action}</span>
              </p>`))}
          </div>
          <button type="button" data-action="edit-customer" data-id="${customer.id}"
                  class="shrink-0 text-xs text-blue-600 hover:text-white hover:bg-blue-600 px-3 py-1.5 rounded-lg font-medium border border-blue-200 hover:border-blue-600 transition">
            เปิดแฟ้มประวัติ
          </button>
        </div>`;
    }).join('');
  }

  /** ต้นทุนรวมของออเดอร์ ใช้คำนวณกำไรขั้นต้น */
  function orderCost(order) {
    const frame = order.frameId ? state.products.find((p) => p.id === order.frameId) : null;
    const lens = order.lensId ? state.products.find((p) => p.id === order.lensId) : null;
    return (frame ? frame.cost : 0) + (lens ? lens.cost : 0);
  }

  const monthKey = (iso) => String(iso || '').slice(0, 7);

  function renderDashboard() {
    const pending = state.orders.filter((order) => order.status !== ORDER_STATUS.DONE);
    const delivered = state.orders.filter((order) => order.status === ORDER_STATUS.DONE);
    const lowStock = state.products.filter((product) => product.stock <= product.minAlert);

    const now = new Date();
    const thisMonth = monthKey(localISODate(now));
    const lastMonth = monthKey(localISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)));

    const revenueOf = (key) => delivered
      .filter((order) => monthKey(order.createdAt) === key)
      .reduce((sum, order) => sum + toNum(order.finalTotal, 0), 0);

    const revenue = revenueOf(thisMonth);
    const revenuePrev = revenueOf(lastMonth);
    const monthOrders = delivered.filter((order) => monthKey(order.createdAt) === thisMonth);
    const grossProfit = monthOrders.reduce((sum, order) => sum + toNum(order.finalTotal, 0) - orderCost(order), 0);

    // --- KPI การเงิน ---
    els.kpiRevenue.textContent = formatBaht(revenue);
    if (revenuePrev > 0) {
      const delta = ((revenue - revenuePrev) / revenuePrev) * 100;
      els.kpiRevenueDelta.textContent = `เทียบเดือนก่อน ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}% (${formatBaht(revenuePrev)})`;
      els.kpiRevenueDelta.className = `text-2xs mt-1 ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`;
    } else {
      els.kpiRevenueDelta.textContent = 'ยังไม่มียอดขายเดือนก่อนให้เทียบ';
      els.kpiRevenueDelta.className = 'text-2xs text-gray-500 mt-1';
    }

    els.kpiMargin.textContent = formatBaht(grossProfit);
    els.kpiMarginRate.textContent = revenue > 0
      ? `อัตรากำไรขั้นต้น ${((grossProfit / revenue) * 100).toFixed(1)}%`
      : 'อัตรากำไรขั้นต้น —';

    const atv = delivered.length
      ? delivered.reduce((sum, order) => sum + toNum(order.finalTotal, 0), 0) / delivered.length
      : 0;
    els.kpiAtv.textContent = formatBaht(atv);
    els.kpiAtvDetail.textContent = `จากบิลที่ส่งมอบแล้ว ${formatNumber(delivered.length)} บิล`;

    // --- งานแล็บและอายุงาน ---
    const withAging = pending.map((order) => ({
      order,
      age: daysSince(order.createdAt) ?? 0,
      overdue: order.promiseDate ? (daysSince(order.promiseDate) ?? -1) > 0 : false
    })).sort((a, b) => b.age - a.age);

    const overdueCount = withAging.filter((row) => row.overdue).length;
    els.dashPending.textContent = `${formatNumber(pending.length)} รายการ`;
    els.kpiLabOverdue.textContent = overdueCount
      ? `เกินกำหนดนัดรับ ${formatNumber(overdueCount)} รายการ`
      : 'ไม่มีงานเกินกำหนดนัดรับ';
    els.kpiLabOverdue.className = `text-2xs mt-1 ${overdueCount ? 'text-rose-600 font-semibold' : 'text-emerald-600'}`;

    // --- ตัวชี้วัดรอง ---
    els.dashCustomers.textContent = `${formatNumber(state.customers.length)} คน`;
    els.dashLowStock.textContent = `${formatNumber(lowStock.length)} รายการ`;
    els.kpiNewCustomers.textContent = `${formatNumber(
      state.customers.filter((customer) => monthKey(customer.createdAt) === thisMonth).length
    )} คน`;

    const recallDue = state.customers.filter((customer) => {
      const days = daysSince(customer.history[0].date);
      return days !== null && days >= CLINICAL_THRESHOLDS.recallMonths * 30;
    });
    els.kpiRecall.textContent = `${formatNumber(recallDue.length)} คน`;
    state.recallDue = recallDue;

    renderClinicalWatchList();

    els.dashOrdersTable.innerHTML = withAging.length
      ? withAging.slice(0, 8).map(({ order, age, overdue }) => html`
          <tr class="${raw(overdue ? 'bg-rose-50/60' : 'hover:bg-gray-50')}">
            <td class="py-3 px-4">
              <button type="button" data-action="switch-tab" data-tab="orders"
                      class="font-semibold text-blue-900 hover:underline">${order.id}</button>
            </td>
            <td class="py-3 px-4 font-medium">${order.customerName || '-'}</td>
            <td class="py-3 px-4 text-xs text-gray-500">${order.lensName || 'ไม่ได้สั่งตัดเลนส์'}</td>
            <td class="py-3 px-4 text-center text-xs ${raw(age > 7 ? 'text-rose-600 font-semibold' : 'text-gray-600')}">
              ${formatNumber(age)} วัน
            </td>
            <td class="py-3 px-4 text-center text-xs ${raw(overdue ? 'text-rose-600 font-semibold' : 'text-gray-600')}">
              ${order.promiseDate ? thaiDate(order.promiseDate) : 'ไม่ระบุ'}
            </td>
            <td class="py-3 px-4 text-center">${raw(statusBadge(order.status))}</td>
          </tr>
        `).join('')
      : html`<tr><td colspan="6" class="py-8 text-center text-gray-400">ไม่มีงานแล็บค้างอยู่ในระบบ</td></tr>`;

    const recent = state.customers.slice(-5).reverse();
    els.dashCustomersTable.innerHTML = recent.length
      ? recent.map((customer) => html`
          <tr class="hover:bg-blue-50 transition duration-150">
            <td class="py-3 px-4 font-semibold text-blue-900">${customer.id}</td>
            <td class="py-3 px-4 font-medium text-gray-800">${customer.name}</td>
            <td class="py-3 px-4 text-gray-600">${customer.phone || '-'}</td>
            <td class="py-3 px-4 text-center">
              <button type="button" data-action="edit-customer" data-id="${customer.id}"
                      class="text-blue-600 hover:text-white hover:bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-200 hover:border-blue-600 transition shadow-sm">
                <i class="fa-solid fa-pen mr-1" aria-hidden="true"></i> แก้ไขประวัติ
              </button>
            </td>
          </tr>
        `).join('')
      : html`<tr><td colspan="4" class="py-8 text-center text-gray-400">ยังไม่มีรายชื่อลูกค้าในระบบ</td></tr>`;
  }

  function renderCustomers() {
    const query = state.filters.customerQuery.trim().toLowerCase();
    const gender = state.filters.customerGender;

    let filtered = state.customers.filter((customer) => {
      const haystack = `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesGender = !gender || customer.gender === gender;
      return matchesQuery && matchesGender;
    });

    if (state.filters.customerView === 'recall') {
      filtered = filtered.filter((customer) => customerClinicalProfile(customer).recallDue);
    }

    if (!state.customers.length) {
      els.customersCount.textContent = '';
    } else if (state.filters.customerView === 'recall') {
      els.customersCount.innerHTML = html`
        <span class="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 rounded-lg">
          <i class="fa-solid fa-bell" aria-hidden="true"></i>
          แสดงเฉพาะผู้ที่ถึงกำหนดตรวจซ้ำ (${formatNumber(filtered.length)} คน)
          <button type="button" data-action="clear-customer-view" class="underline font-semibold">แสดงทั้งหมด</button>
        </span>`;
    } else {
      els.customersCount.textContent = `แสดง ${formatNumber(filtered.length)} จากทั้งหมด ${formatNumber(state.customers.length)} รายการ`;
    }

    if (!filtered.length) {
      els.customersGrid.innerHTML = html`
        <div class="col-span-full py-12 text-center text-gray-400 font-medium">
          ${state.customers.length ? 'ไม่พบผู้รับบริการที่ตรงกับเงื่อนไข' : 'ยังไม่มีข้อมูลลูกค้า กดปุ่ม “เพิ่มลูกค้าใหม่” เพื่อเริ่มบันทึก'}
        </div>`;
      return;
    }

    els.customersGrid.innerHTML = filtered.map((customer) => {
      const { distance, near, pd } = customer.refraction;
      const maxAdd = Math.max(near.od.add, near.os.add);
      const summary = refractionSummary(customer.refraction);
      const profile = customerClinicalProfile(customer);
      const topFlags = profile.flags.filter((flag) => flag.level !== 'info').slice(0, 3);

      return html`
        <article class="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition p-5 space-y-4">
          <div class="flex justify-between items-start gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-2xs font-semibold">ID: ${customer.id}</span>
                <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-2xs font-semibold">
                  ตรวจแล้ว ${formatNumber(customer.history.length)} ครั้ง
                </span>
              </div>
              <h3 class="text-lg font-bold text-gray-900 mt-1 truncate">${customer.name}</h3>
              <p class="text-xs text-gray-500 font-medium">
                <i class="fa-solid fa-phone mr-1" aria-hidden="true"></i>${customer.phone || '-'}
                · ${customer.gender}${customer.age ? ` (${customer.age} ปี)` : ''}
              </p>
              ${customer.occupation || customer.faceShape
                ? raw(html`<p class="text-2xs text-gray-400 mt-0.5">${[customer.occupation, customer.faceShape && `รูปหน้า${customer.faceShape}`].filter(Boolean).join(' · ')}</p>`)
                : ''}
            </div>
            <div class="flex space-x-1 shrink-0">
              <button type="button" data-action="edit-customer" data-id="${customer.id}"
                      class="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition" title="เปิดแฟ้มประวัติ" aria-label="เปิดแฟ้มประวัติของ ${customer.name}">
                <i class="fa-solid fa-pen" aria-hidden="true"></i>
              </button>
              <button type="button" data-action="delete-customer" data-id="${customer.id}"
                      class="p-1.5 text-rose-600 hover:bg-rose-50 rounded transition" title="ลบลูกค้า" aria-label="ลบข้อมูลของ ${customer.name}">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>

          ${topFlags.length
            ? raw(html`<div class="flex flex-wrap gap-1.5">
                ${topFlags.map((flag) => raw(html`
                  <span class="px-2 py-0.5 rounded text-2xs font-semibold ${raw(FLAG_STYLE[flag.level].chip)}" title="${flag.action}">
                    ${flag.label}
                  </span>`))}
              </div>`)
            : ''}

          <div class="bg-gray-50 p-3 rounded-xl space-y-2 text-xs">
            <p class="font-bold text-gray-700 flex justify-between gap-2">
              <span>ค่าสายตามองไกล (Distance)</span>
              <span class="text-blue-600 font-semibold">PD ${pd.far || '-'} / ${pd.near || '-'} มม.</span>
            </p>
            <div class="grid grid-cols-2 gap-2 text-2xs">
              <div class="bg-white p-2 rounded border border-gray-100">
                <p class="font-bold text-blue-800">ตาขวา (OD)</p>
                <p>${formatDiopter(distance.od.sph)} ${formatDiopter(distance.od.cyl)} × ${distance.od.ax}°</p>
                <p class="text-gray-500">SE ${formatDiopter(summary.od.se)} D</p>
                <p class="text-gray-500">VA ${distance.od.va || '-'}</p>
              </div>
              <div class="bg-white p-2 rounded border border-gray-100">
                <p class="font-bold text-indigo-800">ตาซ้าย (OS)</p>
                <p>${formatDiopter(distance.os.sph)} ${formatDiopter(distance.os.cyl)} × ${distance.os.ax}°</p>
                <p class="text-gray-500">SE ${formatDiopter(summary.os.se)} D</p>
                <p class="text-gray-500">VA ${distance.os.va || '-'}</p>
              </div>
            </div>
            <div class="flex justify-between font-medium text-gray-500 pt-1 text-2xs">
              <span>ADD: ${maxAdd > 0 ? formatDiopter(maxAdd) : '-'}</span>
              <span>Aniso: ${summary.aniso.toFixed(2)} D</span>
            </div>
            ${maxAdd > 0
              ? raw(html`<p class="text-2xs text-gray-500 border-t border-dashed border-gray-200 pt-1">
                  มองใกล้ (Near): OD ${formatDiopter(near.od.sph)} · OS ${formatDiopter(near.os.sph)}
                </p>`)
              : ''}
          </div>

          <div class="flex items-center justify-between text-2xs border-t border-dashed border-gray-200 pt-2">
            <span class="${raw(profile.recallDue ? 'text-amber-700 font-semibold' : 'text-gray-500')}">
              <i class="fa-solid fa-calendar-check mr-1" aria-hidden="true"></i>
              ตรวจล่าสุด ${thaiDate(profile.lastExam)}
            </span>
            ${profile.progression !== null
              ? raw(html`<span class="${raw(Math.abs(profile.progression) >= CLINICAL_THRESHOLDS.rapidProgression ? 'text-rose-600 font-semibold' : 'text-gray-500')}">
                  เปลี่ยนแปลง ${formatDiopter(profile.progression)} D/ปี
                </span>`)
              : ''}
          </div>

          ${customer.ocular.chiefComplaint
            ? raw(html`<p class="text-2xs text-gray-500"><span class="font-bold text-gray-700">อาการสำคัญ:</span> ${customer.ocular.chiefComplaint}</p>`)
            : ''}
          ${customer.notes
            ? raw(html`<p class="text-2xs text-gray-500"><span class="font-bold text-gray-700">โน้ต:</span> ${customer.notes}</p>`)
            : ''}
        </article>`;
    }).join('');
  }

  function renderInventory() {
    els.countFrame.textContent = `${formatNumber(state.products.filter((p) => p.category === 'Frame').length)} รายการ`;
    els.countLens.textContent = `${formatNumber(state.products.filter((p) => p.category === 'Lens').length)} รายการ`;
    els.countContact.textContent = `${formatNumber(state.products.filter((p) => p.category === 'ContactLens').length)} รายการ`;
    els.countAccessory.textContent = `${formatNumber(state.products.filter((p) => p.category === 'Accessory').length)} รายการ`;

    $$('.cat-filter-btn').forEach((btn) => {
      const isActive = btn.dataset.category === state.filters.inventoryCategory;
      btn.classList.toggle('border-blue-500', isActive);
      btn.classList.toggle('ring-2', isActive);
      btn.classList.toggle('ring-blue-200', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    const query = state.filters.inventoryQuery.trim().toLowerCase();
    let filtered = state.products.filter((product) => {
      const haystack = `${product.name} ${product.barcode}`.toLowerCase();
      return !query || haystack.includes(query);
    });
    if (state.filters.inventoryCategory) {
      filtered = filtered.filter((product) => product.category === state.filters.inventoryCategory);
    }
    if (state.filters.lowStockOnly) {
      filtered = filtered.filter((product) => product.stock <= product.minAlert);
    }

    if (!filtered.length) {
      els.inventoryBody.innerHTML = html`
        <tr><td colspan="7" class="py-8 text-center text-gray-400">
          ${state.products.length ? 'ไม่พบสินค้าที่ตรงกับเงื่อนไข' : 'ยังไม่มีสินค้าในคลัง กดปุ่ม “เพิ่มสินค้าใหม่” เพื่อเริ่มบันทึก'}
        </td></tr>`;
      return;
    }

    els.inventoryBody.innerHTML = filtered.map((product) => {
      const isLow = product.stock <= product.minAlert;
      return html`
        <tr class="hover:bg-gray-50">
          <td class="py-4 px-6 text-xs text-gray-500 font-mono">${product.barcode || '-'}</td>
          <td class="py-4 px-6 font-semibold text-gray-900">${product.name}</td>
          <td class="py-4 px-6 text-xs">${CATEGORY_LABEL[product.category] || product.category}</td>
          <td class="py-4 px-6 text-right font-medium">${formatBaht(product.price)}</td>
          <td class="py-4 px-6 text-center">
            <span class="px-2.5 py-1 rounded-full text-xs font-bold ${raw(isLow ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800')}">
              ${formatNumber(product.stock)} ชิ้น
            </span>
          </td>
          <td class="py-4 px-6 text-center text-gray-500">${formatNumber(product.minAlert)} ชิ้น</td>
          <td class="py-4 px-6 text-center">
            <div class="flex justify-center space-x-1">
              <button type="button" data-action="edit-product" data-id="${product.id}"
                      class="p-1.5 text-blue-600 hover:bg-blue-50 rounded" aria-label="แก้ไข ${product.name}">
                <i class="fa-solid fa-pen" aria-hidden="true"></i>
              </button>
              <button type="button" data-action="delete-product" data-id="${product.id}"
                      class="p-1.5 text-rose-600 hover:bg-rose-50 rounded" aria-label="ลบ ${product.name}">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function renderOrders() {
    $$('.status-tab-btn').forEach((btn) => {
      const isActive = btn.dataset.status === state.filters.orderStatus;
      btn.classList.toggle('bg-blue-50', isActive);
      btn.classList.toggle('text-blue-700', isActive);
      btn.classList.toggle('text-gray-600', !isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    const filtered = state.filters.orderStatus === 'all'
      ? state.orders
      : state.orders.filter((order) => order.status === state.filters.orderStatus);

    if (!filtered.length) {
      els.ordersList.innerHTML = html`
        <div class="bg-white p-12 rounded-xl text-center text-gray-400 border border-gray-200">
          ${state.orders.length ? 'ไม่พบออเดอร์ในสถานะนี้' : 'ยังไม่มีออเดอร์ในระบบ กดปุ่ม “สร้างออเดอร์ / สั่งตัดแว่น” เพื่อเปิดบิลแรก'}
        </div>`;
      return;
    }

    els.ordersList.innerHTML = filtered.map((order) => {
      const options = STATUS_LIST.map((item) => html`
        <option value="${item.key}" ${raw(order.status === item.key ? 'selected' : '')}>${item.key}</option>
      `).join('');
      const overdue = order.status !== ORDER_STATUS.DONE
        && Boolean(order.promiseDate)
        && (daysSince(order.promiseDate) ?? -1) > 0;
      const age = daysSince(order.createdAt);

      return html`
        <article class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="bg-gray-50 px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div class="flex items-center space-x-2 flex-wrap gap-y-1">
              <span class="text-blue-900 font-bold">${order.id}</span>
              <span class="text-xs text-gray-400">
                เปิดบิล ${thaiDate(order.createdAt)}${age !== null && order.status !== ORDER_STATUS.DONE ? ` · อายุงาน ${formatNumber(age)} วัน` : ''}
              </span>
              ${raw(statusBadge(order.status))}
              ${overdue
                ? raw(html`<span class="px-2 py-1 rounded text-xs font-semibold bg-rose-100 text-rose-800">เกินกำหนดนัดรับ</span>`)
                : ''}
            </div>
            <div class="flex items-center space-x-2 w-full sm:w-auto">
              <label class="text-xs text-gray-500 whitespace-nowrap" for="status-${order.id}">เปลี่ยนสถานะ:</label>
              <select id="status-${order.id}" data-action="update-order-status" data-id="${order.id}"
                      class="text-xs font-bold border rounded px-2.5 py-1 bg-white focus:ring-1 focus:ring-blue-500">
                ${raw(options)}
              </select>
              <button type="button" data-action="delete-order" data-id="${order.id}"
                      class="p-1.5 text-rose-600 hover:bg-rose-50 rounded transition" aria-label="ยกเลิกออเดอร์ ${order.id}">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>

          <div class="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="space-y-2">
              <h3 class="font-bold text-gray-700 text-xs uppercase tracking-wider">ผู้รับบริการ</h3>
              <p class="font-semibold text-gray-900 text-sm">${order.customerName || '-'}</p>
              ${order.customerId
                ? raw(html`<button type="button" data-action="edit-customer" data-id="${order.customerId}"
                            class="text-xs text-blue-600 hover:underline">เปิดแฟ้มประวัติ</button>`)
                : ''}
              ${order.promiseDate
                ? raw(html`<p class="text-2xs ${raw(overdue ? 'text-rose-600 font-semibold' : 'text-gray-500')}">
                    <i class="fa-solid fa-calendar-day mr-1" aria-hidden="true"></i>
                    นัดรับ ${thaiDate(order.promiseDate)}${overdue ? ' (เกินกำหนด)' : ''}
                  </p>`)
                : ''}
            </div>

            <div class="space-y-2">
              <h3 class="font-bold text-gray-700 text-xs uppercase tracking-wider">แว่นตาที่สั่งประกอบ</h3>
              <div class="text-sm space-y-1">
                <p class="font-medium"><span class="text-gray-400">กรอบแว่น:</span> ${order.frameName || 'กรอบของลูกค้าเอง'}</p>
                <p class="font-medium"><span class="text-gray-400">เลนส์สายตา:</span> ${order.lensName || 'ไม่ได้สั่งตัดเลนส์'}</p>
              </div>
              ${order.labInstruction
                ? raw(html`<p class="text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-100 mt-2">
                    <span class="font-bold">สั่งงานแล็บ:</span> ${order.labInstruction}</p>`)
                : ''}
            </div>

            <div class="space-y-2 md:text-right flex flex-col justify-between">
              <div>
                <h3 class="font-bold text-gray-700 text-xs uppercase tracking-wider">รายละเอียดบิล</h3>
                <p class="text-xs text-gray-400 mt-1">
                  ราคารวม ${formatBaht(order.total)} (ส่วนลด ${formatBaht(order.discount)})
                </p>
                <p class="text-lg font-extrabold text-emerald-600">ยอดชำระ ${formatBaht(order.finalTotal)}</p>
                ${order.deposit > 0
                  ? raw(html`<p class="text-2xs text-gray-500">มัดจำ ${formatBaht(order.deposit)} · คงเหลือ
                      <strong class="text-amber-700">${formatBaht(order.balance)}</strong></p>`)
                  : ''}
              </div>
              <p class="text-xs text-gray-500">ชำระผ่าน: <span class="font-semibold">${order.payment}</span></p>
            </div>
          </div>

          ${order.rx ? raw(orderRxDetails(order)) : ''}
        </article>`;
    }).join('');
  }

  /** ส่วนขยายของการ์ดออเดอร์: ค่าสายตาที่ใช้สั่งตัด และพารามิเตอร์ใบสั่งงานแล็บ */
  function orderRxDetails(order) {
    const { distance, near, pd, segHeight } = order.rx;
    const lab = order.lab;
    const decOd = decentration(lab.a, lab.dbl, lab.monoPdOd);
    const decOs = decentration(lab.a, lab.dbl, lab.monoPdOs);

    const specs = [
      lab.frameType,
      lab.a ? `A ${lab.a}` : null,
      lab.b ? `B ${lab.b}` : null,
      lab.dbl ? `DBL ${lab.dbl}` : null,
      lab.ed ? `ED ${lab.ed}` : null,
      lab.monoPdOd || lab.monoPdOs ? `Mono PD ${lab.monoPdOd || '—'}/${lab.monoPdOs || '—'}` : null,
      lab.fittingHeightOd || lab.fittingHeightOs ? `FH ${lab.fittingHeightOd || '—'}/${lab.fittingHeightOs || '—'}` : null,
      lab.pantoscopicTilt ? `Panto ${lab.pantoscopicTilt}°` : null,
      lab.vertexDistance ? `Vertex ${lab.vertexDistance} มม.` : null,
      lab.wrapAngle ? `Wrap ${lab.wrapAngle}°` : null,
      lab.lensIndex ? `Index ${lab.lensIndex.toFixed(2)}` : null,
      lab.coating || null,
      lab.tint && lab.tint !== '-' ? `Tint ${lab.tint}` : null,
      lab.edgeTreatment,
      decOd !== null ? `เยื้องศูนย์ ${decOd.toFixed(1)}/${decOs !== null ? decOs.toFixed(1) : '—'} มม.` : null
    ].filter(Boolean);

    return html`
      <details class="border-t border-gray-100 bg-slate-50/60">
        <summary class="px-5 py-2.5 cursor-pointer text-2xs font-semibold text-gray-600 uppercase tracking-wider">
          <i class="fa-solid fa-file-prescription mr-1 text-blue-600" aria-hidden="true"></i>
          ค่าสายตาที่ใช้สั่งตัด &amp; ใบสั่งงานแล็บ
        </summary>
        <div class="px-5 pb-4 space-y-3">
          <div class="table-scroll">
            <table class="w-full text-center border-collapse text-2xs">
              <caption class="sr-only">ค่าสายตาที่บันทึกไว้กับออเดอร์ ${order.id}</caption>
              <thead>
                <tr class="text-gray-500 font-semibold">
                  <th scope="col" class="py-1 px-2 border bg-white">ข้างตา</th>
                  <th scope="col" class="py-1 px-2 border bg-white">SPH</th>
                  <th scope="col" class="py-1 px-2 border bg-white">CYL</th>
                  <th scope="col" class="py-1 px-2 border bg-white">AXIS</th>
                  <th scope="col" class="py-1 px-2 border bg-white">ADD</th>
                  <th scope="col" class="py-1 px-2 border bg-white">Near SPH</th>
                </tr>
              </thead>
              <tbody class="bg-white font-mono">
                ${[['od', 'OD'], ['os', 'OS']].map(([eye, label]) => raw(html`
                  <tr>
                    <th scope="row" class="py-1 px-2 border font-bold font-sans bg-gray-50">${label}</th>
                    <td class="py-1 px-2 border">${formatDiopter(distance[eye].sph)}</td>
                    <td class="py-1 px-2 border">${formatDiopter(distance[eye].cyl)}</td>
                    <td class="py-1 px-2 border">${distance[eye].ax}°</td>
                    <td class="py-1 px-2 border">${near[eye].add > 0 ? formatDiopter(near[eye].add) : '—'}</td>
                    <td class="py-1 px-2 border">${near[eye].add > 0 ? formatDiopter(near[eye].sph) : '—'}</td>
                  </tr>`))}
              </tbody>
            </table>
          </div>
          <p class="text-2xs text-gray-600">
            PD ไกล ${pd.far || '—'} มม. · PD ใกล้ ${pd.near || '—'} มม. · Segment Height ${segHeight || '—'} มม.
          </p>
          <div class="flex flex-wrap gap-1.5">
            ${specs.map((spec) => raw(html`<span class="px-2 py-0.5 rounded bg-white border border-gray-200 text-2xs text-gray-700">${spec}</span>`))}
          </div>
        </div>
      </details>`;
  }

  function populateSelects() {
    const customerOptions = state.customers
      .map((c) => html`<option value="${c.id}">${c.name}${c.phone ? ` (${c.phone})` : ''}</option>`)
      .join('');

    const orderCustomer = $('#ord-customer');
    const previousCustomer = orderCustomer.value;
    orderCustomer.innerHTML = html`<option value="">-- กรุณาเลือกลูกค้า --</option>` + customerOptions;
    if (previousCustomer) orderCustomer.value = previousCustomer;

    const aiSelect = els.aiCustomerSelect;
    const previousAi = aiSelect.value;
    aiSelect.innerHTML = html`<option value="">-- เลือกลูกค้าเพื่อดึงค่าสายตาอัตโนมัติ --</option>`
      + state.customers.map((c) => html`<option value="${c.id}">${c.name}</option>`).join('');
    if (previousAi) aiSelect.value = previousAi;

    const buildProductOptions = (category) => state.products
      .filter((p) => p.category === category && p.stock > 0)
      .map((p) => html`<option value="${p.id}">${p.name} — ${formatBaht(p.price)} (คงเหลือ ${p.stock})</option>`)
      .join('');

    const frameSelect = $('#ord-frame');
    const previousFrame = frameSelect.value;
    frameSelect.innerHTML = html`<option value="">-- ไม่ระบุ (ใช้กรอบของลูกค้าเอง) --</option>` + buildProductOptions('Frame');
    if (previousFrame) frameSelect.value = previousFrame;

    const lensSelect = $('#ord-lens');
    const previousLens = lensSelect.value;
    lensSelect.innerHTML = html`<option value="">-- ไม่ระบุ (เฉพาะกรอบแว่น) --</option>` + buildProductOptions('Lens');
    if (previousLens) lensSelect.value = previousLens;
  }

  /* ==========================================================================
   * 11. CRUD — ลูกค้า
   * ========================================================================== */

  function recalcNearSphere() {
    [['od'], ['os']].forEach(([eye]) => {
      const distInput = $(`#ref-${eye}-sph`);
      const addInput = $(`#ref-${eye}-add`);
      const nearInput = $(`#ref-${eye}-near-sph`);
      if (!distInput || !addInput || !nearInput) return;
      if (nearInput.dataset.touched === 'true') return;
      const add = toNum(addInput.value, 0);
      if (!add) {
        nearInput.value = '';
        return;
      }
      nearInput.value = (toNum(distInput.value, 0) + add).toFixed(2);
    });
  }

  function openCustomerModal(customerId) {
    const modal = $('#modal-customer');
    const form = els.customerForm;
    form.reset();
    $$('[id$="-near-sph"]', form).forEach((input) => { input.dataset.touched = 'false'; });

    const customer = customerId ? state.customers.find((c) => c.id === customerId) : null;
    $('#customer-modal-title').textContent = customer
      ? `แฟ้มประวัติ: ${customer.name}`
      : 'ลงทะเบียนผู้รับบริการใหม่ & บันทึกค่าสายตา';
    $('#cust-id').value = customer ? customer.id : '';
    $('#exam-date').value = todayISO();
    setExamEditing(null);
    els.examModeWrap.classList.toggle('hidden', !customer);
    $('#exam-as-new').checked = true;

    // ปุ่มลบแสดงเฉพาะตอนเปิดแฟ้มเดิม และเฉพาะบทบาทที่ลบได้
    const showDelete = Boolean(customer) && can('deleteCustomer');
    els.deleteCustomerBtn.classList.toggle('hidden', !showDelete);
    els.deleteCustomerBtn.classList.toggle('flex', showDelete);

    if (customer) {
      const latest = customer.history[0];
      const { distance, near, pd, segHeight } = customer.refraction;

      $('#cust-name').value = customer.name;
      $('#cust-phone').value = customer.phone;
      $('#cust-email').value = customer.email;
      $('#cust-gender').value = customer.gender;
      $('#cust-age').value = customer.age || '';
      $('#cust-occupation').value = customer.occupation;
      $('#cust-face-shape').value = customer.faceShape;
      $('#cust-notes').value = customer.notes;

      $('#oc-chief-complaint').value = customer.ocular.chiefComplaint;
      $('#oc-conditions').value = customer.ocular.conditions;
      $('#oc-medications').value = customer.ocular.medications;
      $('#oc-family').value = customer.ocular.familyHistory;
      $('#oc-contact-lens').value = customer.ocular.contactLens;

      $('#exam-optometrist').value = latest.optometrist;
      $('#exam-method').value = latest.method;
      $('#exam-note').value = '';

      ['od', 'os'].forEach((eye) => {
        $(`#ref-${eye}-sph`).value = distance[eye].sph;
        $(`#ref-${eye}-cyl`).value = distance[eye].cyl || '';
        $(`#ref-${eye}-ax`).value = distance[eye].ax || '';
        $(`#ref-${eye}-va`).value = distance[eye].va;
        $(`#ref-${eye}-add`).value = near[eye].add || '';
        $(`#ref-${eye}-near-sph`).value = near[eye].add ? near[eye].sph : '';
        $(`#ref-${eye}-near-va`).value = near[eye].va;
      });

      $('#ref-pd-far').value = pd.far || '';
      $('#ref-pd-near').value = pd.near || '';
      $('#ref-seg-height').value = segHeight || '';
    }

    renderExamHistory(customer);
    renderRxComputed();
    openModal(modal);
  }

  /**
   * สลับฟอร์มเข้า/ออกโหมด "แก้ไขผลตรวจรายการเดิม"
   * @param {Object|null} exam ผลตรวจที่กำลังแก้ไข หรือ null เพื่อกลับสู่โหมดปกติ
   */
  function setExamEditing(exam) {
    els.examEditingId.value = exam ? exam.id : '';
    els.examEditWrap.classList.toggle('hidden', !exam);

    // สองกล่องนี้ใช้พื้นที่เดียวกัน แสดงพร้อมกันไม่ได้
    const customerId = $('#cust-id').value;
    els.examModeWrap.classList.toggle('hidden', Boolean(exam) || !customerId);

    if (exam) els.examEditingDate.textContent = thaiDate(exam.date);
  }

  /** เติมค่าของผลตรวจหนึ่งรายการลงในฟอร์ม เพื่อแก้ไขย้อนหลัง */
  function editExam(examId) {
    const customer = state.customers.find((c) => c.id === $('#cust-id').value);
    const exam = customer && customer.history.find((item) => item.id === examId);
    if (!exam) {
      showToast('ไม่พบผลตรวจรายการนี้', 'error');
      return;
    }

    const { distance, near, pd, segHeight } = exam.refraction;
    $('#exam-date').value = exam.date;
    $('#exam-optometrist').value = exam.optometrist;
    $('#exam-method').value = exam.method;
    $('#exam-note').value = exam.note;

    ['od', 'os'].forEach((eye) => {
      $(`#ref-${eye}-sph`).value = distance[eye].sph;
      $(`#ref-${eye}-cyl`).value = distance[eye].cyl || '';
      $(`#ref-${eye}-ax`).value = distance[eye].ax || '';
      $(`#ref-${eye}-va`).value = distance[eye].va;
      $(`#ref-${eye}-add`).value = near[eye].add || '';
      $(`#ref-${eye}-near-sph`).value = near[eye].add ? near[eye].sph : '';
      $(`#ref-${eye}-near-va`).value = near[eye].va;
      // ค่า Near SPH ที่โหลดมาถือว่าผู้ใช้กำหนดเองแล้ว อย่าคำนวณทับ
      $(`#ref-${eye}-near-sph`).dataset.touched = 'true';
    });

    $('#ref-pd-far').value = pd.far || '';
    $('#ref-pd-near').value = pd.near || '';
    $('#ref-seg-height').value = segHeight || '';

    setExamEditing(exam);
    renderRxComputed();

    // เลื่อนขึ้นไปที่ฟอร์มผลตรวจให้เห็นว่ากำลังแก้อะไรอยู่
    els.examEditWrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
    showToast(`โหลดผลตรวจวันที่ ${thaiDate(exam.date)} มาแก้ไขแล้ว`, 'info');
  }

  async function deleteExam(examId) {
    const customerIndex = state.customers.findIndex((c) => c.id === $('#cust-id').value);
    if (customerIndex === -1) return;

    const customer = state.customers[customerIndex];
    const exam = customer.history.find((item) => item.id === examId);
    if (!exam) return;

    // ต้องเหลือผลตรวจอย่างน้อยหนึ่งรายการ ไม่งั้นแฟ้มจะไม่มีค่าสายตาอ้างอิงเลย
    if (customer.history.length <= 1) {
      showToast('ลบไม่ได้ — ต้องเหลือผลตรวจอย่างน้อยหนึ่งรายการในแฟ้ม', 'error');
      return;
    }

    const ok = await askConfirm({
      title: 'ลบผลการตรวจ',
      message: `ลบผลตรวจวันที่ ${thaiDate(exam.date)} ของ "${customer.name}" ใช่หรือไม่? `
        + 'การลบนี้ย้อนกลับไม่ได้ และค่าสายตาอ้างอิงของแฟ้มจะเปลี่ยนไปใช้ผลตรวจที่ใหม่ที่สุดที่เหลืออยู่',
      confirmLabel: 'ลบผลตรวจ',
      danger: true
    });
    if (!ok) return;

    const history = customer.history.filter((item) => item.id !== examId);
    state.customers[customerIndex] = normalizeCustomer({ ...customer, history, updatedAt: todayISO() });
    persist();

    // ถ้ากำลังแก้ไขรายการที่เพิ่งลบอยู่ ต้องออกจากโหมดแก้ไข
    if (els.examEditingId.value === examId) setExamEditing(null);

    renderExamHistory(state.customers[customerIndex]);
    renderAll();
    showToast('ลบผลการตรวจเรียบร้อยแล้ว', 'info');

    if (backendConfigured()) {
      try {
        await apiCall('saveExam', { record: examToApi(customer.id, history[0]) }, 'POST');
        showToast('อัปเดตค่าสายตาล่าสุดขึ้นเซิร์ฟเวอร์แล้ว');
      } catch (error) {
        showToast(`ลบในเครื่องแล้ว แต่อัปเดตเซิร์ฟเวอร์ไม่สำเร็จ: ${error.message}`, 'error');
      }
    }
  }

  /** ลบผู้รับบริการจากปุ่มในหน้าต่างแฟ้มประวัติ */
  async function deleteCustomerFromForm() {
    const id = $('#cust-id').value;
    if (!id) return;
    closeModal($('#modal-customer'));
    await deleteCustomer(id);
  }

  /** แสดงแฟ้มประวัติการตรวจย้อนหลังในหน้าต่างแฟ้มลูกค้า */
  function renderExamHistory(customer) {
    if (!customer || customer.history.length < 1) {
      els.examHistoryWrap.classList.add('hidden');
      return;
    }
    els.examHistoryWrap.classList.remove('hidden');

    // แก้ผลตรวจได้เฉพาะบทบาทที่บันทึกผลตรวจได้ และต้องเหลือผลตรวจไว้อย่างน้อยหนึ่งรายการเสมอ
    const canEditExams = can('saveExam');
    const onlyOne = customer.history.length <= 1;

    els.examHistory.innerHTML = customer.history.map((exam, index) => {
      const { distance, near } = exam.refraction;
      const meanSe = (
        sphericalEquivalent(distance.od.sph, distance.od.cyl)
        + sphericalEquivalent(distance.os.sph, distance.os.cyl)
      ) / 2;
      const add = Math.max(near.od.add, near.os.add);
      return html`
        <tr class="${raw(index === 0 ? 'bg-blue-50/60' : 'hover:bg-gray-50')}">
          <td class="py-2 px-2 border font-semibold text-gray-800 whitespace-nowrap">
            ${thaiDate(exam.date)}
            ${index === 0 ? raw('<span class="ml-1 text-blue-600">(ล่าสุด)</span>') : ''}
          </td>
          <td class="py-2 px-2 border font-mono whitespace-nowrap">
            ${formatDiopter(distance.od.sph)} ${formatDiopter(distance.od.cyl)} × ${distance.od.ax}°
          </td>
          <td class="py-2 px-2 border font-mono whitespace-nowrap">
            ${formatDiopter(distance.os.sph)} ${formatDiopter(distance.os.cyl)} × ${distance.os.ax}°
          </td>
          <td class="py-2 px-2 border text-center">${add > 0 ? formatDiopter(add) : '—'}</td>
          <td class="py-2 px-2 border text-center font-semibold">${formatDiopter(meanSe)}</td>
          <td class="py-2 px-2 border text-gray-500">
            ${exam.optometrist || '—'}${exam.note ? ` · ${exam.note}` : ''}
            <span class="block text-gray-400">${exam.method}</span>
          </td>
          <td class="py-2 px-2 border text-center whitespace-nowrap">
            ${canEditExams
              ? raw(html`
                  <button type="button" data-action="edit-exam" data-id="${exam.id}"
                          class="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="แก้ไขผลตรวจนี้"
                          aria-label="แก้ไขผลตรวจวันที่ ${thaiDate(exam.date)}">
                    <i class="fa-solid fa-pen" aria-hidden="true"></i>
                  </button>
                  <button type="button" data-action="delete-exam" data-id="${exam.id}"
                          class="p-1.5 text-rose-600 hover:bg-rose-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title="${onlyOne ? 'ผลตรวจรายการสุดท้ายลบไม่ได้' : 'ลบผลตรวจนี้'}"
                          aria-label="ลบผลตรวจวันที่ ${thaiDate(exam.date)}" ${raw(onlyOne ? 'disabled' : '')}>
                    <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                  </button>`)
              : raw('<span class="text-gray-300">—</span>')}
          </td>
        </tr>`;
    }).join('');

    const rate = progressionRate(customer.history);
    if (rate === null) {
      els.examProgression.textContent = customer.history.length < 2
        ? 'มีผลตรวจเพียงครั้งเดียว — ยังคำนวณอัตราการเปลี่ยนแปลงไม่ได้'
        : 'ช่วงเวลาระหว่างการตรวจสั้นเกินไปสำหรับคำนวณอัตราการเปลี่ยนแปลง (ต้องห่างกันอย่างน้อย 3 เดือน)';
      els.examProgression.className = 'text-2xs text-gray-500';
    } else {
      const rapid = Math.abs(rate) >= CLINICAL_THRESHOLDS.rapidProgression;
      els.examProgression.textContent = `อัตราการเปลี่ยนแปลงค่าสายตาเฉลี่ย ${formatDiopter(rate)} D ต่อปี`
        + (rapid ? ' — เกินเกณฑ์เฝ้าระวัง ควรพิจารณาแนวทางชะลอสายตาสั้นและนัดติดตามทุก 6 เดือน' : ' — อยู่ในเกณฑ์คงที่');
      els.examProgression.className = `text-2xs ${rapid ? 'text-rose-600 font-semibold' : 'text-emerald-700'}`;
    }
  }

  /** คำนวณและแสดงค่าทางคลินิกแบบสดขณะกรอกฟอร์ม */
  function renderRxComputed() {
    const draft = readCustomerForm();
    const refraction = normalizeRefraction(draft.refraction);
    const summary = refractionSummary(refraction);

    els.rxComputedBody.innerHTML = [['od', 'OD (ขวา)'], ['os', 'OS (ซ้าย)']].map(([eye, label]) => {
      const data = summary[eye];
      return html`
        <tr>
          <th scope="row" class="py-1.5 px-2 border border-slate-200 font-bold bg-slate-50">${label}</th>
          <td class="py-1.5 px-2 border border-slate-200 font-semibold">${formatDiopter(data.se)} D</td>
          <td class="py-1.5 px-2 border border-slate-200">${data.astig ? `${data.astig.code} · ${data.astig.label}` : '—'}</td>
          <td class="py-1.5 px-2 border border-slate-200 font-mono">
            ${data.astig || refraction.distance[eye].cyl
              ? `${formatDiopter(data.plusCyl.sph)} ${formatDiopter(data.plusCyl.cyl)} × ${data.plusCyl.ax}°`
              : '—'}
          </td>
          <td class="py-1.5 px-2 border border-slate-200">${data.add > 0 ? `${formatDiopter(data.nearSph)} D` : '—'}</td>
          <td class="py-1.5 px-2 border border-slate-200">${data.va ? `${data.va.logMAR.toFixed(2)}` : '—'}</td>
        </tr>`;
    }).join('');

    const parts = [`ความต่างของสองตา (Anisometropia) ${summary.aniso.toFixed(2)} D`];
    if (summary.maxAdd > 0) parts.push(`ADD สูงสุด ${formatDiopter(summary.maxAdd)} D`);
    const maxPower = Math.max(Math.abs(summary.od.se), Math.abs(summary.os.se));
    if (maxPower >= CLINICAL_THRESHOLDS.vertexCriticalPower) {
      const compensated = vertexCompensate(-maxPower, 12);
      parts.push(`หากเปลี่ยนไปใช้คอนแทคเลนส์ (Vertex 12 มม. → 0) กำลังจะเป็นประมาณ ${formatDiopter(compensated)} D`);
    }
    els.rxComputedSummary.textContent = parts.join(' · ');

    const flags = clinicalFlags(refraction);
    els.rxComputedFlags.innerHTML = flags.length
      ? flags.map((flag) => html`
          <p class="text-2xs flex items-start gap-1.5 px-2 py-1.5 rounded ${raw(FLAG_STYLE[flag.level].chip)}">
            <i class="fa-solid ${raw(FLAG_STYLE[flag.level].icon)} mt-0.5" aria-hidden="true"></i>
            <span><strong>${flag.label}</strong> (${flag.detail}) — ${flag.action}</span>
          </p>`).join('')
      : html`<p class="text-2xs text-emerald-700">ค่าสายตาอยู่ในเกณฑ์ปกติ ไม่พบข้อบ่งชี้ที่ต้องเฝ้าระวังเป็นพิเศษ</p>`;
  }

  function readCustomerForm() {
    const readEye = (eye) => ({
      sph: toNum($(`#ref-${eye}-sph`).value, 0),
      cyl: toNum($(`#ref-${eye}-cyl`).value, 0),
      ax: toInt($(`#ref-${eye}-ax`).value, 0),
      va: $(`#ref-${eye}-va`).value.trim()
    });
    const readNear = (eye) => {
      const nearSph = $(`#ref-${eye}-near-sph`).value;
      return {
        add: toNum($(`#ref-${eye}-add`).value, 0),
        sph: nearSph === '' ? undefined : toNum(nearSph, 0),
        va: $(`#ref-${eye}-near-va`).value.trim()
      };
    };

    return {
      id: $('#cust-id').value || undefined,
      name: $('#cust-name').value.trim(),
      phone: $('#cust-phone').value.trim(),
      email: $('#cust-email').value.trim(),
      gender: $('#cust-gender').value,
      age: toInt($('#cust-age').value, 0),
      occupation: $('#cust-occupation').value.trim(),
      faceShape: $('#cust-face-shape').value,
      notes: $('#cust-notes').value.trim(),
      ocular: {
        chiefComplaint: $('#oc-chief-complaint').value.trim(),
        conditions: $('#oc-conditions').value.trim(),
        medications: $('#oc-medications').value.trim(),
        familyHistory: $('#oc-family').value.trim(),
        contactLens: $('#oc-contact-lens').value.trim()
      },
      exam: {
        date: $('#exam-date').value || todayISO(),
        optometrist: $('#exam-optometrist').value.trim(),
        method: $('#exam-method').value,
        note: $('#exam-note').value.trim()
      },
      refraction: {
        distance: { od: readEye('od'), os: readEye('os') },
        near: { od: readNear('od'), os: readNear('os') },
        pd: { far: toNum($('#ref-pd-far').value, 0), near: toNum($('#ref-pd-near').value, 0) },
        segHeight: toNum($('#ref-seg-height').value, 0)
      }
    };
  }

  async function saveCustomer(event) {
    event.preventDefault();
    if (!els.customerForm.reportValidity()) return;

    const draft = readCustomerForm();
    const isEdit = Boolean(draft.id);
    // ถ้ากดปุ่มแก้ไขจากแฟ้มประวัติ จะเขียนทับ "รายการนั้น" ไม่ใช่รายการล่าสุด
    const editingExamId = els.examEditingId.value;
    const asNewExam = !editingExamId && $('#exam-as-new').checked;
    const newExam = normalizeExam({
      ...draft.exam,
      id: editingExamId || undefined,
      refraction: draft.refraction
    });

    const existingExam = editingExamId && isEdit
      ? (state.customers.find((c) => c.id === draft.id) || { history: [] })
          .history.find((item) => item.id === editingExamId)
      : null;

    const ok = await askConfirm({
      title: !isEdit
        ? 'ยืนยันการลงทะเบียนผู้รับบริการใหม่'
        : editingExamId
          ? 'ยืนยันการแก้ไขผลตรวจย้อนหลัง'
          : asNewExam ? 'ยืนยันการบันทึกผลตรวจครั้งใหม่' : 'ยืนยันการแก้ไขผลตรวจล่าสุด',
      message: !isEdit
        ? `บันทึกผู้รับบริการใหม่ "${draft.name}" พร้อมผลตรวจวันที่ ${thaiDate(newExam.date)} ใช่หรือไม่?`
        : editingExamId
          ? `เขียนทับผลตรวจวันที่ ${thaiDate(existingExam ? existingExam.date : newExam.date)} ของ "${draft.name}" `
            + `ด้วยค่าที่กรอกใหม่ (ลงวันที่ ${thaiDate(newExam.date)}) ใช่หรือไม่? ข้อมูลเดิมของรายการนี้จะหายไปอย่างถาวร`
          : asNewExam
            ? `เพิ่มผลการตรวจวันที่ ${thaiDate(newExam.date)} ลงในแฟ้มของ "${draft.name}" โดยเก็บผลตรวจเดิมไว้ ใช่หรือไม่?`
            : `เขียนทับผลการตรวจล่าสุดของ "${draft.name}" ใช่หรือไม่? ข้อมูลผลตรวจเดิมจะหายไปอย่างถาวร`,
      confirmLabel: 'ยืนยันการบันทึก',
      danger: isEdit && !asNewExam
    });
    if (!ok) return;

    if (isEdit) {
      const index = state.customers.findIndex((c) => c.id === draft.id);
      if (index === -1) {
        showToast('ไม่พบข้อมูลผู้รับบริการที่ต้องการแก้ไข', 'error');
        return;
      }
      const existing = state.customers[index];

      let history;
      if (editingExamId) {
        // เขียนทับเฉพาะรายการที่เลือก แล้วตัดรายการอื่นที่บังเอิญลงวันที่ชนกันออก
        history = existing.history
          .map((exam) => (exam.id === editingExamId ? newExam : exam))
          .filter((exam) => exam.id === editingExamId || exam.date !== newExam.date);
      } else if (asNewExam) {
        // แทนที่ผลตรวจของวันเดียวกันเสมอ เพื่อไม่ให้เกิดรายการซ้ำในแฟ้มประวัติ
        history = [newExam, ...existing.history.filter((exam) => exam.date !== newExam.date)];
      } else {
        history = [newExam, ...existing.history.slice(1)];
      }

      state.customers[index] = normalizeCustomer({
        ...existing,
        ...draft,
        history,
        updatedAt: todayISO()
      });
      showToast(editingExamId
        ? 'แก้ไขผลตรวจย้อนหลังเรียบร้อยแล้ว'
        : asNewExam ? 'บันทึกผลการตรวจครั้งใหม่เรียบร้อยแล้ว' : 'แก้ไขผลการตรวจล่าสุดเรียบร้อยแล้ว');
    } else {
      state.customers.push(normalizeCustomer({
        ...draft,
        id: uid('c'),
        history: [newExam],
        createdAt: todayISO()
      }));
      showToast('ลงทะเบียนผู้รับบริการและบันทึกค่าสายตาเรียบร้อย');
    }

    persist();
    closeModal($('#modal-customer'));
    renderAll();

    // เมื่อเชื่อมกับ Apps Script ให้เขียนขึ้น Google Sheets ต่อทันที
    if (backendConfigured()) {
      const saved = state.customers.find((c) => c.id === (draft.id || state.customers[state.customers.length - 1].id))
        || state.customers[state.customers.length - 1];
      try {
        await apiCall('saveCustomer', { record: customerToApi(saved) }, 'POST');
        await apiCall('saveExam', { record: examToApi(saved.id, saved.history[0]) }, 'POST');
        showToast('บันทึกขึ้น Google Sheets เรียบร้อย', 'info');
      } catch (error) {
        console.error('บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ:', error);
        showToast(`บันทึกในเครื่องแล้ว แต่ส่งขึ้นเซิร์ฟเวอร์ไม่สำเร็จ: ${error.message}`, 'error');
      }
    }
  }

  async function deleteCustomer(id) {
    const customer = state.customers.find((c) => c.id === id);
    if (!customer) return;
    const linkedOrders = state.orders.filter((order) => order.customerId === id).length;
    const onServer = backendConfigured();

    const ok = await askConfirm({
      title: 'ยืนยันการลบข้อมูลลูกค้า',
      message: `ลบ "${customer.name}" พร้อมประวัติค่าสายตาทั้งหมด ${customer.history.length} รายการ `
        + (onServer
          ? 'ออกจาก Google Sheets อย่างถาวรใช่หรือไม่? ข้อมูลจะถูกลบออกจากฐานข้อมูลจริง กู้คืนไม่ได้'
          : 'ออกจากเครื่องนี้อย่างถาวรใช่หรือไม่? กู้คืนไม่ได้')
        + (linkedOrders
          ? ` — ใบสั่ง ${linkedOrders} ใบของลูกค้ารายนี้จะยังอยู่ในระบบเป็นหลักฐานการขาย (ใบสั่งเก็บสำเนาชื่อลูกค้าไว้แล้ว)`
          : ''),
      confirmLabel: 'ลบออกจากฐานข้อมูล',
      danger: true
    });
    if (!ok) return;

    // ลบที่เซิร์ฟเวอร์ให้สำเร็จก่อนเสมอ ถ้าลบแต่ในเครื่องข้อมูลจะกลับมาตอนดึงข้อมูลครั้งถัดไป
    if (onServer) {
      try {
        const result = await apiCall('deleteCustomer', { id }, 'POST');
        showToast(`ลบออกจากฐานข้อมูลแล้ว — ${result.customerName || customer.name} `
          + `พร้อมผลตรวจ ${result.deletedExams} รายการ`
          + (result.keptOrders ? ` (คงใบสั่งไว้ ${result.keptOrders} ใบ)` : ''), 'info');
      } catch (error) {
        showToast(`ลบไม่สำเร็จ: ${error.message} — ข้อมูลยังอยู่ครบทั้งในเครื่องและบนเซิร์ฟเวอร์`, 'error');
        return;
      }
    } else {
      showToast('ลบข้อมูลลูกค้าเรียบร้อยแล้ว', 'info');
    }

    state.customers = state.customers.filter((c) => c.id !== id);
    persist();
    renderAll();
  }

  /* ==========================================================================
   * 11b. CRUD — สินค้า
   * ========================================================================== */

  function openProductModal(productId) {
    const modal = $('#modal-product');
    els.productForm.reset();

    const product = productId ? state.products.find((p) => p.id === productId) : null;
    $('#product-modal-title').textContent = product ? 'แก้ไขข้อมูลสินค้าคงคลัง' : 'เพิ่มสินค้าเข้าคลัง';
    $('#prod-id').value = product ? product.id : '';

    if (product) {
      $('#prod-category').value = product.category;
      $('#prod-name').value = product.name;
      $('#prod-barcode').value = product.barcode;
      $('#prod-cost').value = product.cost;
      $('#prod-price').value = product.price;
      $('#prod-stock').value = product.stock;
      $('#prod-min-alert').value = product.minAlert;
    } else {
      $('#prod-min-alert').value = 3;
      $('#prod-cost').value = 0;
    }

    openModal(modal);
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!els.productForm.reportValidity()) return;

    const id = $('#prod-id').value;
    const draft = {
      category: $('#prod-category').value,
      name: $('#prod-name').value.trim(),
      barcode: $('#prod-barcode').value.trim(),
      cost: toNum($('#prod-cost').value, 0),
      price: toNum($('#prod-price').value, 0),
      stock: toInt($('#prod-stock').value, 0),
      minAlert: toInt($('#prod-min-alert').value, 3)
    };

    if (draft.cost > draft.price) {
      const proceed = await askConfirm({
        title: 'ต้นทุนสูงกว่าราคาขาย',
        message: `ราคาต้นทุน ${formatBaht(draft.cost)} สูงกว่าราคาขาย ${formatBaht(draft.price)} ต้องการบันทึกต่อหรือไม่?`,
        confirmLabel: 'บันทึกต่อ'
      });
      if (!proceed) return;
    }

    const ok = await askConfirm({
      title: id ? 'ยืนยันการแก้ไขข้อมูลสินค้า' : 'ยืนยันการเพิ่มสินค้าใหม่',
      message: id
        ? `บันทึกข้อมูลใหม่ของสินค้า "${draft.name}" ใช่หรือไม่?`
        : `เพิ่มสินค้า "${draft.name}" เข้าสู่คลังใช่หรือไม่?`,
      confirmLabel: 'ยืนยันการบันทึก'
    });
    if (!ok) return;

    if (id) {
      const index = state.products.findIndex((p) => p.id === id);
      if (index === -1) {
        showToast('ไม่พบสินค้าที่ต้องการแก้ไข', 'error');
        return;
      }
      state.products[index] = normalizeProduct({ ...state.products[index], ...draft, id });
      showToast('อัปเดตข้อมูลสินค้าเรียบร้อย');
    } else {
      state.products.push(normalizeProduct({ ...draft, id: uid('p') }));
      showToast('เพิ่มสินค้าเข้าคลังเรียบร้อย');
    }

    persist();
    closeModal($('#modal-product'));
    renderAll();

    if (backendConfigured()) {
      const saved = state.products.find((p) => p.id === id) || state.products[state.products.length - 1];
      try {
        await apiCall('saveProduct', { record: productToApi(saved) }, 'POST');
        showToast('บันทึกสินค้าขึ้น Google Sheets เรียบร้อย', 'info');
      } catch (error) {
        console.error('บันทึกสินค้าขึ้นเซิร์ฟเวอร์ไม่สำเร็จ:', error);
        showToast(`บันทึกในเครื่องแล้ว แต่ส่งขึ้นเซิร์ฟเวอร์ไม่สำเร็จ: ${error.message}`, 'error');
      }
    }
  }

  async function deleteProduct(id) {
    const product = state.products.find((p) => p.id === id);
    if (!product) return;
    const linkedOrders = state.orders.filter((o) => o.frameId === id || o.lensId === id).length;
    const onServer = backendConfigured();

    const ok = await askConfirm({
      title: 'ยืนยันการลบสินค้า',
      message: `ลบ "${product.name}" ออกจาก${onServer ? 'ฐานข้อมูล' : 'คลังในเครื่องนี้'}อย่างถาวรใช่หรือไม่?`
        + (linkedOrders
          ? ` — สินค้านี้ถูกอ้างถึงในใบสั่ง ${linkedOrders} ใบ ระบบจะปิดการใช้งานแทนการลบ เพื่อไม่ให้ใบสั่งเดิมเสียข้อมูล`
          : ' ความเคลื่อนไหวสต็อกของสินค้านี้จะถูกลบไปด้วย'),
      confirmLabel: linkedOrders ? 'ปิดการใช้งาน' : 'ลบออกจากฐานข้อมูล',
      danger: true
    });
    if (!ok) return;

    if (onServer) {
      try {
        const result = await apiCall('deleteProduct', { id }, 'POST');
        showToast(`ลบออกจากฐานข้อมูลแล้ว — ${product.name}`
          + (result.deletedStockMoves ? ` (ลบประวัติสต็อก ${result.deletedStockMoves} รายการ)` : ''), 'info');
      } catch (error) {
        // เซิร์ฟเวอร์ปิดการใช้งานให้แทนเพราะมีใบสั่งอ้างอยู่ — ถือว่าเป็นผลลัพธ์ที่ยอมรับได้
        if (/ถูกอ้างถึงในใบสั่ง/.test(error.message)) {
          showToast(error.message, 'info');
        } else {
          showToast(`ลบไม่สำเร็จ: ${error.message} — ข้อมูลยังอยู่ครบ`, 'error');
          return;
        }
      }
    } else {
      showToast('ลบสินค้าเรียบร้อยแล้ว', 'info');
    }

    state.products = state.products.filter((p) => p.id !== id);
    persist();
    renderAll();
  }

  /* ==========================================================================
   * 11c. CRUD — ออเดอร์ & งานแล็บ
   * ========================================================================== */

  function openOrderModal() {
    if (!state.customers.length) {
      showToast('ยังไม่มีข้อมูลลูกค้า กรุณาลงทะเบียนลูกค้าก่อนเปิดบิล', 'error');
      switchTab('customers');
      openCustomerModal();
      return;
    }
    els.orderForm.reset();
    populateSelects();

    // ตั้งวันนัดรับเริ่มต้น 7 วันนับจากวันนี้ตามรอบงานแล็บทั่วไป
    const promise = new Date();
    promise.setDate(promise.getDate() + 7);
    $('#ord-promise-date').value = localISODate(promise);

    calculateOrderTotal();
    renderOrderRx();
    renderLabComputed();
    openModal($('#modal-order'));
  }

  /** แสดงสำเนาค่าสายตาของผู้รับบริการที่เลือก และเติมค่า PD/Segment height ให้ใบสั่งงานแล็บ */
  function renderOrderRx() {
    const customer = state.customers.find((c) => c.id === $('#ord-customer').value);
    if (!customer) {
      els.ordRxPanel.innerHTML = html`<span class="text-blue-700">เลือกผู้รับบริการเพื่อดึงค่าสายตาล่าสุด</span>`;
      els.ordRxDate.textContent = '—';
      return;
    }

    const exam = customer.history[0];
    const { distance, near, pd, segHeight } = customer.refraction;
    const summary = refractionSummary(customer.refraction);
    const flags = clinicalFlags(customer.refraction, { progression: progressionRate(customer.history) })
      .filter((flag) => flag.level !== 'info');

    els.ordRxDate.textContent = `ตรวจเมื่อ ${thaiDate(exam.date)}${exam.optometrist ? ` · ${exam.optometrist}` : ''}`;
    els.ordRxPanel.innerHTML = html`
      <div class="table-scroll">
        <table class="w-full text-center border-collapse">
          <caption class="sr-only">ค่าสายตาที่ใช้สั่งตัดเลนส์</caption>
          <thead>
            <tr class="text-blue-700">
              <th scope="col" class="py-1 px-2 border border-blue-200">ข้างตา</th>
              <th scope="col" class="py-1 px-2 border border-blue-200">SPH</th>
              <th scope="col" class="py-1 px-2 border border-blue-200">CYL</th>
              <th scope="col" class="py-1 px-2 border border-blue-200">AXIS</th>
              <th scope="col" class="py-1 px-2 border border-blue-200">ADD</th>
              <th scope="col" class="py-1 px-2 border border-blue-200">SE</th>
            </tr>
          </thead>
          <tbody class="bg-white/70 font-mono">
            ${[['od', 'OD'], ['os', 'OS']].map(([eye, label]) => raw(html`
              <tr>
                <th scope="row" class="py-1 px-2 border border-blue-200 font-bold font-sans">${label}</th>
                <td class="py-1 px-2 border border-blue-200">${formatDiopter(distance[eye].sph)}</td>
                <td class="py-1 px-2 border border-blue-200">${formatDiopter(distance[eye].cyl)}</td>
                <td class="py-1 px-2 border border-blue-200">${distance[eye].ax}°</td>
                <td class="py-1 px-2 border border-blue-200">${near[eye].add > 0 ? formatDiopter(near[eye].add) : '—'}</td>
                <td class="py-1 px-2 border border-blue-200">${formatDiopter(summary[eye].se)}</td>
              </tr>`))}
          </tbody>
        </table>
      </div>
      <p class="mt-1.5">
        PD ไกล ${pd.far || '—'} มม. · PD ใกล้ ${pd.near || '—'} มม. · Segment Height ${segHeight || '—'} มม.
      </p>
      ${flags.length
        ? raw(html`<p class="mt-1 text-rose-700 font-semibold">
            <i class="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true"></i>
            ข้อควรระวัง: ${flags.map((flag) => flag.label).join(' · ')}
          </p>`)
        : ''}`;

    // เติมค่าเริ่มต้นให้ใบสั่งงานแล็บจากค่าที่วัดไว้ (ผู้ใช้แก้ทับได้)
    if (pd.far && !toNum($('#lab-mono-pd-od').value, 0)) {
      $('#lab-mono-pd-od').value = (pd.far / 2).toFixed(1);
      $('#lab-mono-pd-os').value = (pd.far / 2).toFixed(1);
    }
    if (segHeight && !toNum($('#lab-fh-od').value, 0)) {
      $('#lab-fh-od').value = segHeight;
      $('#lab-fh-os').value = segHeight;
    }
    renderLabComputed();
  }

  function readLabSpec() {
    return {
      frameType: $('#lab-frame-type').value,
      a: toNum($('#lab-a').value, 0),
      b: toNum($('#lab-b').value, 0),
      dbl: toNum($('#lab-dbl').value, 0),
      ed: toNum($('#lab-ed').value, 0),
      monoPdOd: toNum($('#lab-mono-pd-od').value, 0),
      monoPdOs: toNum($('#lab-mono-pd-os').value, 0),
      fittingHeightOd: toNum($('#lab-fh-od').value, 0),
      fittingHeightOs: toNum($('#lab-fh-os').value, 0),
      pantoscopicTilt: toNum($('#lab-panto').value, 0),
      vertexDistance: toNum($('#lab-vertex').value, 0),
      wrapAngle: toNum($('#lab-wrap').value, 0),
      lensIndex: toNum($('#lab-index').value, 0),
      coating: $('#lab-coating').value.trim(),
      tint: $('#lab-tint').value.trim(),
      edgeTreatment: $('#lab-edge').value
    };
  }

  /** คำนวณระยะเยื้องศูนย์ ขนาดเลนส์ดิบขั้นต่ำ และความหนาขอบโดยประมาณ */
  function renderLabComputed() {
    const lab = readLabSpec();
    const customer = state.customers.find((c) => c.id === $('#ord-customer').value);
    const rows = [];

    [['od', 'OD (ขวา)', lab.monoPdOd], ['os', 'OS (ซ้าย)', lab.monoPdOs]].forEach(([eye, label, monoPd]) => {
      const dec = decentration(lab.a, lab.dbl, monoPd);
      const blank = minimumBlankSize(lab.ed, dec);
      const power = customer
        ? sphericalEquivalent(customer.refraction.distance[eye].sph, customer.refraction.distance[eye].cyl)
        : null;
      const edge = power && lab.lensIndex
        ? estimateEdgeThickness(power, lab.lensIndex, blank || 50)
        : null;

      rows.push(html`
        <tr>
          <th scope="row" class="py-1 px-2 border border-slate-200 font-bold bg-white">${label}</th>
          <td class="py-1 px-2 border border-slate-200">${dec === null ? '—' : `${dec.toFixed(1)} มม.`}</td>
          <td class="py-1 px-2 border border-slate-200">${blank === null ? '—' : `${blank.toFixed(1)} มม.`}</td>
          <td class="py-1 px-2 border border-slate-200">${edge === null ? '—' : `${edge.toFixed(1)} มม.`}</td>
        </tr>`);
    });

    const hints = [];
    if (!lab.a || !lab.dbl) hints.push('กรอก A และ DBL เพื่อคำนวณระยะเยื้องศูนย์');
    if (!lab.ed) hints.push('กรอก ED เพื่อคำนวณขนาดเลนส์ดิบขั้นต่ำ');
    if (!lab.lensIndex) hints.push('เลือกดัชนีหักเหเพื่อประมาณความหนาขอบ');
    if (lab.vertexDistance && Math.abs(lab.vertexDistance - 12) >= 2 && customer) {
      const maxSe = Math.max(
        Math.abs(sphericalEquivalent(customer.refraction.distance.od.sph, customer.refraction.distance.od.cyl)),
        Math.abs(sphericalEquivalent(customer.refraction.distance.os.sph, customer.refraction.distance.os.cyl))
      );
      if (maxSe >= CLINICAL_THRESHOLDS.vertexCriticalPower) {
        const shift = 12 - lab.vertexDistance;
        hints.push(`ระยะ Vertex ต่างจากมาตรฐาน 12 มม. และกำลังเลนส์สูง — กำลังที่ระยะ ${lab.vertexDistance} มม. จะเป็นประมาณ ${formatDiopter(vertexCompensate(-maxSe, shift))} D`);
      }
    }

    els.labComputed.innerHTML = html`
      <div class="table-scroll">
        <table class="w-full text-center border-collapse">
          <caption class="sr-only">ค่าที่คำนวณสำหรับสั่งเลนส์ดิบ</caption>
          <thead>
            <tr class="text-slate-500 font-semibold">
              <th scope="col" class="py-1 px-2 border border-slate-200 bg-white">ข้างตา</th>
              <th scope="col" class="py-1 px-2 border border-slate-200 bg-white">ระยะเยื้องศูนย์</th>
              <th scope="col" class="py-1 px-2 border border-slate-200 bg-white">เลนส์ดิบขั้นต่ำ</th>
              <th scope="col" class="py-1 px-2 border border-slate-200 bg-white">ความหนาขอบโดยประมาณ</th>
            </tr>
          </thead>
          <tbody>${rows.map(raw)}</tbody>
        </table>
      </div>
      ${hints.length
        ? raw(html`<ul class="list-disc pl-4 mt-2 space-y-0.5 text-slate-500">
            ${hints.map((hint) => raw(html`<li>${hint}</li>`))}
          </ul>`)
        : ''}`;
  }

  function calculateOrderTotal() {
    const frame = state.products.find((p) => p.id === $('#ord-frame').value);
    const lens = state.products.find((p) => p.id === $('#ord-lens').value);
    const total = (frame ? frame.price : 0) + (lens ? lens.price : 0);
    const discount = clamp(toNum($('#ord-discount').value, 0), 0, total);
    const final = Math.max(0, total - discount);
    const deposit = clamp(toNum($('#ord-deposit').value, 0), 0, final);

    $('#ord-total-raw').value = total;
    $('#ord-total-final').value = final;
    $('#ord-balance').value = final - deposit;
  }

  async function saveOrder(event) {
    event.preventDefault();
    if (!els.orderForm.reportValidity()) return;

    const customer = state.customers.find((c) => c.id === $('#ord-customer').value);
    if (!customer) {
      showToast('กรุณาเลือกลูกค้าผู้รับบริการ', 'error');
      return;
    }

    calculateOrderTotal();
    const frame = state.products.find((p) => p.id === $('#ord-frame').value) || null;
    const lens = state.products.find((p) => p.id === $('#ord-lens').value) || null;
    const total = toNum($('#ord-total-raw').value, 0);
    const discount = toNum($('#ord-discount').value, 0);
    const finalTotal = toNum($('#ord-total-final').value, 0);
    const lab = readLabSpec();

    if (!frame && !lens) {
      showToast('กรุณาเลือกกรอบแว่นหรือเลนส์อย่างน้อยหนึ่งรายการ', 'error');
      return;
    }

    // เตือนเมื่อสั่งตัดเลนส์แต่ยังไม่ได้ระบุค่าฟิตติ้งที่ช่างแล็บต้องใช้
    if (lens && (!lab.monoPdOd || !lab.monoPdOs)) {
      const proceed = await askConfirm({
        title: 'ยังไม่ได้ระบุค่า Mono PD',
        message: 'ใบสั่งงานแล็บยังไม่มีค่า Mono PD ของทั้งสองข้าง ซึ่งจำเป็นต่อการกำหนดจุดศูนย์กลางเลนส์ ต้องการเปิดบิลต่อหรือไม่?',
        confirmLabel: 'เปิดบิลต่อ'
      });
      if (!proceed) {
        $('#lab-details').open = true;
        $('#lab-mono-pd-od').focus();
        return;
      }
    }

    const ok = await askConfirm({
      title: 'ยืนยันการเปิดบิล & สั่งตัดแว่น',
      message: `สร้างใบสั่งขายให้ "${customer.name}" ยอดชำระสุทธิ ${formatBaht(finalTotal)} ใช่หรือไม่? `
        + 'ระบบจะบันทึกสำเนาค่าสายตา ตัดสต็อกสินค้า และส่งงานเข้าคิวห้องแล็บทันที',
      confirmLabel: 'ยืนยันเปิดบิล'
    });
    if (!ok) return;

    if (frame) frame.stock = Math.max(0, frame.stock - 1);
    if (lens) lens.stock = Math.max(0, lens.stock - 1);

    state.orders.unshift(normalizeOrder({
      id: `ORD-${Date.now().toString().slice(-6)}`,
      customerId: customer.id,
      customerName: customer.name,
      frameId: frame ? frame.id : null,
      frameName: frame ? frame.name : '',
      lensId: lens ? lens.id : null,
      lensName: lens ? lens.name : '',
      total,
      discount,
      finalTotal,
      deposit: toNum($('#ord-deposit').value, 0),
      payment: $('#ord-payment').value,
      status: lens ? ORDER_STATUS.PENDING : ORDER_STATUS.READY,
      labInstruction: $('#ord-lab-instruction').value.trim(),
      promiseDate: $('#ord-promise-date').value,
      rx: customer.refraction,
      lab,
      createdAt: todayISO()
    }));

    persist();
    closeModal($('#modal-order'));
    renderAll();
    showToast('เปิดบิลขายและส่งงานเข้าคิวห้องแล็บเรียบร้อย');

    if (backendConfigured()) {
      try {
        await apiCall('createOrder', { record: orderToApi(state.orders[0]) }, 'POST');
        showToast('บันทึกใบสั่งขึ้น Google Sheets และตัดสต็อกฝั่งเซิร์ฟเวอร์แล้ว', 'info');
      } catch (error) {
        console.error('บันทึกใบสั่งขึ้นเซิร์ฟเวอร์ไม่สำเร็จ:', error);
        showToast(`เปิดบิลในเครื่องแล้ว แต่ส่งขึ้นเซิร์ฟเวอร์ไม่สำเร็จ: ${error.message}`, 'error');
      }
    }
  }

  async function updateOrderStatus(orderId, newStatus) {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order || !Object.values(ORDER_STATUS).includes(newStatus)) return;

    order.status = newStatus;
    persist();
    renderAll();
    showToast(`อัปเดตสถานะออเดอร์ ${orderId} เป็น “${newStatus}” แล้ว`);

    const select = document.getElementById(`status-${orderId}`);
    if (select) select.focus();

    if (backendConfigured()) {
      try {
        await apiCall('updateOrderStatus', { id: orderId, status: newStatus }, 'POST');
      } catch (error) {
        console.error('อัปเดตสถานะบนเซิร์ฟเวอร์ไม่สำเร็จ:', error);
        showToast(`อัปเดตในเครื่องแล้ว แต่ยังไม่ได้อัปเดตบนเซิร์ฟเวอร์: ${error.message}`, 'error');
      }
    }
  }

  async function deleteOrder(orderId) {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return;

    const onServer = backendConfigured();
    const ok = await askConfirm({
      title: 'ยืนยันการยกเลิกออเดอร์',
      message: `ยกเลิกบิลขายหมายเลข ${orderId} ใช่หรือไม่? ระบบจะคืนสต็อกสินค้าที่ตัดไปแล้ว`
        + (onServer ? ' และลบใบสั่งออกจากฐานข้อมูลอย่างถาวร' : ''),
      confirmLabel: 'ยืนยันการยกเลิก',
      danger: true
    });
    if (!ok) return;

    // ลบบนเซิร์ฟเวอร์ก่อน (เซิร์ฟเวอร์คืนสต็อกและบันทึก StockMoves ให้เอง)
    if (onServer) {
      try {
        await apiCall('deleteOrder', { id: orderId }, 'POST');
      } catch (error) {
        showToast(`ยกเลิกไม่สำเร็จ: ${error.message} — ใบสั่งยังอยู่ในระบบ`, 'error');
        return;
      }
    }

    // คืนสต็อกที่ถูกตัดตอนเปิดบิล (ฝั่งเครื่องให้ตรงกับที่เซิร์ฟเวอร์ทำ)
    const frame = order.frameId ? state.products.find((p) => p.id === order.frameId) : null;
    const lens = order.lensId ? state.products.find((p) => p.id === order.lensId) : null;
    if (frame) frame.stock += 1;
    if (lens) lens.stock += 1;

    state.orders = state.orders.filter((o) => o.id !== orderId);
    persist();
    renderAll();
    showToast(onServer
      ? 'ยกเลิกออเดอร์ ลบออกจากฐานข้อมูล และคืนสต็อกเรียบร้อยแล้ว'
      : 'ยกเลิกออเดอร์และคืนสต็อกเรียบร้อยแล้ว', 'info');
  }

  /* ==========================================================================
   * 12. GOOGLE SHEETS SYNC
   * ========================================================================== */

  function setDiagnostic({ badge, badgeClass, env, products, productsClass, customers, customersClass, status }) {
    if (badge && els.diagBadge) {
      els.diagBadge.textContent = badge;
      els.diagBadge.className = `px-2 py-0.5 rounded text-2xs font-semibold whitespace-nowrap ${badgeClass || 'bg-amber-100 text-amber-700'}`;
    }
    if (env && els.diagEnv) els.diagEnv.textContent = env;
    if (products && els.diagProducts) {
      els.diagProducts.textContent = products;
      els.diagProducts.className = `text-right ${productsClass || 'text-gray-500'}`;
    }
    if (customers && els.diagCustomers) {
      els.diagCustomers.textContent = customers;
      els.diagCustomers.className = `text-right ${customersClass || 'text-gray-500'}`;
    }
    if (status && els.diagStatus) els.diagStatus.textContent = status;
  }

  /** ดึงตารางจาก Google Sheets ผ่าน gviz endpoint (ต้องแชร์แบบ "ผู้ที่มีลิงก์ดูได้") */
  async function fetchSheetTable(sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
    const response = await fetchWithTimeout(url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('รูปแบบข้อมูลจาก Google Sheets ไม่ถูกต้อง');

    const payload = JSON.parse(text.slice(start, end + 1));
    if (payload.status === 'error') {
      const detail = (payload.errors && payload.errors[0] && payload.errors[0].detailed_message) || 'ไม่พบแผ่นงาน';
      throw new Error(String(detail).replace(/<[^>]*>/g, '').trim());
    }
    if (!payload.table || !Array.isArray(payload.table.rows)) throw new Error('ไม่พบโครงสร้างตารางในแผ่นงาน');
    return payload.table;
  }

  /**
   * นิยามการจับคู่คอลัมน์ของแต่ละแผ่นงาน — แหล่งอ้างอิงเดียวที่ใช้ทั้งตอนซิงค์และตอนทำรายงาน
   * แต่ละรายการ: [ชื่อฟิลด์ในระบบ, คำอธิบาย, รายการชื่อหัวตารางที่ยอมรับ, ตำแหน่งคอลัมน์สำรอง]
   * ควรตั้งชื่อหัวตารางในชีตให้ตรงกับ alias เสมอ การพึ่งตำแหน่งคอลัมน์จะพังทันทีที่มีการแทรกคอลัมน์
   */
  const SHEET_FIELD_MAP = {
    products: [
      ['id', 'รหัสสินค้า', ['id', 'รหัส', 'รหัสสินค้า', 'sku'], 0],
      ['category', 'หมวดหมู่', ['category', 'หมวดหมู่', 'ประเภท'], 1],
      ['name', 'ชื่อสินค้า', ['name', 'ชื่อสินค้า', 'สินค้า', 'product'], 2],
      ['barcode', 'บาร์โค้ด', ['barcode', 'บาร์โค้ด'], 3],
      ['cost', 'ราคาต้นทุน', ['cost', 'ต้นทุน', 'ราคาต้นทุน'], 4],
      ['price', 'ราคาขาย', ['price', 'ราคา', 'ราคาขาย'], 5],
      ['stock', 'คงเหลือ', ['stock', 'คงเหลือ', 'จำนวน', 'จำนวนคงเหลือ'], 6],
      ['minAlert', 'แจ้งเตือนขั้นต่ำ', ['minalert', 'min alert', 'min_alert', 'ขั้นต่ำ', 'แจ้งเตือน', 'จุดสั่งซื้อ'], 7]
    ],
    customers: [
      ['id', 'รหัสผู้รับบริการ', ['id', 'รหัส', 'รหัสลูกค้า'], 0],
      ['name', 'ชื่อ-นามสกุล', ['name', 'ชื่อ-นามสกุล', 'ชื่อลูกค้า', 'ชื่อ'], 1],
      ['phone', 'เบอร์โทรศัพท์', ['phone', 'เบอร์โทร', 'เบอร์โทรศัพท์', 'โทรศัพท์', 'tel'], 2],
      ['email', 'อีเมล', ['email', 'อีเมล', 'e-mail'], 3],
      ['gender', 'เพศ', ['gender', 'เพศ', 'sex'], 4],
      ['age', 'อายุ', ['age', 'อายุ'], 5],
      ['occupation', 'อาชีพ', ['occupation', 'อาชีพ', 'job'], 6],
      ['notes', 'หมายเหตุ', ['notes', 'note', 'หมายเหตุ', 'โน้ต'], 7],
      ['odSph', 'OD Sphere', ['od_sph', 'od sph', 'odsph', 'sph ขวา', 'r sph'], 8],
      ['odCyl', 'OD Cylinder', ['od_cyl', 'od cyl', 'odcyl', 'cyl ขวา', 'r cyl'], 9],
      ['odAx', 'OD Axis', ['od_ax', 'od ax', 'odax', 'od_axis', 'axis ขวา', 'r axis'], 10],
      ['odVa', 'OD VA', ['od_va', 'od va', 'odva', 'va ขวา', 'r va'], 11],
      ['osSph', 'OS Sphere', ['os_sph', 'os sph', 'ossph', 'sph ซ้าย', 'l sph'], 12],
      ['osCyl', 'OS Cylinder', ['os_cyl', 'os cyl', 'oscyl', 'cyl ซ้าย', 'l cyl'], 13],
      ['osAx', 'OS Axis', ['os_ax', 'os ax', 'osax', 'os_axis', 'axis ซ้าย', 'l axis'], 14],
      ['osVa', 'OS VA', ['os_va', 'os va', 'osva', 'va ซ้าย', 'l va'], 15],
      ['add', 'ค่า Addition', ['add', 'addition', 'ค่าadd'], 16],
      ['pdFar', 'PD มองไกล', ['pd', 'pd ไกล', 'pd_far', 'pdfar'], 17],
      ['pdNear', 'PD มองใกล้', ['pd near', 'pd_near', 'pdnear', 'pd ใกล้'], 18],
      ['faceShape', 'รูปหน้า', ['face shape', 'face_shape', 'faceshape', 'รูปหน้า'], 19]
    ]
  };

  /**
   * สร้างตัวช่วยหาคอลัมน์จากชื่อหัวตาราง โดยมีตำแหน่งสำรองหากไม่พบชื่อ
   * คืน { index, matchedBy, label } เพื่อให้รายงานบอกได้ว่าจับคู่ด้วยชื่อหรือด้วยตำแหน่ง
   */
  function createColumnResolver(table) {
    const byLabel = new Map();
    (table.cols || []).forEach((col, index) => {
      const label = String(col.label || '').trim().toLowerCase();
      if (label && !byLabel.has(label)) byLabel.set(label, index);
    });

    return (aliases, fallbackIndex) => {
      for (const alias of aliases) {
        const key = alias.toLowerCase();
        if (byLabel.has(key)) {
          const index = byLabel.get(key);
          return { index, matchedBy: 'name', sheetLabel: String(table.cols[index].label || '') };
        }
      }
      const exists = fallbackIndex >= 0 && fallbackIndex < (table.cols || []).length;
      return {
        index: exists ? fallbackIndex : -1,
        matchedBy: exists ? 'position' : 'missing',
        sheetLabel: exists ? String(table.cols[fallbackIndex].label || '') : ''
      };
    };
  }

  /**
   * จับคู่ทุกฟิลด์ของแผ่นงานหนึ่ง คืนทั้งดัชนีสำหรับอ่านค่าและข้อมูลสำหรับรายงาน
   * label = คำอธิบายภาษาไทยของฟิลด์ · sheetLabel = ชื่อหัวตารางจริงที่พบในชีต
   */
  function mapSheetColumns(table, entity) {
    const resolve = createColumnResolver(table);
    const columns = {};
    const report = [];
    SHEET_FIELD_MAP[entity].forEach(([key, label, aliases, fallback]) => {
      const match = resolve(aliases, fallback);
      columns[key] = match.index;
      report.push({ key, label, aliases, index: match.index, matchedBy: match.matchedBy, sheetLabel: match.sheetLabel });
    });
    return { columns, report };
  }

  function cellValue(row, index, fallback = null) {
    if (index < 0 || !row.c || !row.c[index] || row.c[index].v === null || row.c[index].v === undefined) return fallback;
    return row.c[index].v;
  }

  const isHeaderish = (value) => ['name', 'ชื่อสินค้า', 'ชื่อ-นามสกุล', 'ชื่อลูกค้า', 'สินค้า'].includes(String(value).trim().toLowerCase());

  function setSyncBusy(button, icon, busy) {
    if (button) button.disabled = busy;
    if (icon) icon.classList.toggle('animate-spin', busy);
  }

  async function syncProducts({ silent = false } = {}) {
    setSyncBusy(els.syncProductsBtn, els.syncProductsIcon, true);
    setDiagnostic({ badge: 'กำลังดาวน์โหลดคลังสินค้า…', badgeClass: 'bg-amber-100 text-amber-700' });

    try {
      let table = null;
      let lastError = null;
      for (const sheetName of CONFIG.productSheetNames) {
        try {
          table = await fetchSheetTable(sheetName);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!table) throw lastError || new Error('ไม่พบแผ่นงานสินค้า');

      const { columns } = mapSheetColumns(table, 'products');

      const products = table.rows
        .map((row, index) => normalizeProduct({
          id: cellValue(row, columns.id, `P-GS-${index + 1}`),
          category: cellValue(row, columns.category, 'Frame'),
          name: cellValue(row, columns.name, ''),
          barcode: cellValue(row, columns.barcode, ''),
          cost: cellValue(row, columns.cost, 0),
          price: cellValue(row, columns.price, 0),
          stock: cellValue(row, columns.stock, 0),
          minAlert: cellValue(row, columns.minAlert, 3)
        }))
        .filter((product) => product.name && !isHeaderish(product.name));

      if (!products.length) throw new Error('แผ่นงานคลังสินค้าว่างเปล่า');

      state.products = products;
      persist();
      renderAll();

      setDiagnostic({
        badge: 'ซิงค์คลังสินค้าสำเร็จ 🟢',
        badgeClass: 'bg-emerald-100 text-emerald-800',
        env: 'Google Sheets (gviz)',
        products: `เชื่อมต่อแล้ว (${products.length} รายการ)`,
        productsClass: 'text-emerald-600',
        status: `ดึงคลังสินค้าสำเร็จเมื่อ ${nowTime()}`
      });
      showToast(`ซิงค์คลังสินค้าสำเร็จ ${products.length} รายการ`);
    } catch (error) {
      console.error('ซิงค์คลังสินค้าไม่สำเร็จ:', error);
      setDiagnostic({
        badge: 'ซิงค์คลังไม่สำเร็จ 🔴',
        badgeClass: 'bg-rose-100 text-rose-800',
        env: state.storageAvailable ? 'ข้อมูลในเครื่อง (localStorage)' : 'ข้อมูลชั่วคราวในหน่วยความจำ',
        products: 'ไม่สำเร็จ — ใช้ข้อมูลเดิม',
        productsClass: 'text-rose-500',
        status: `ตรวจสอบสิทธิ์การแชร์ชีทหรือชื่อแท็บ "Products" (${error.message})`
      });
      if (!silent) showToast('เชื่อมต่อคลังสินค้าไม่สำเร็จ ระบบยังใช้ข้อมูลเดิมต่อไป', 'error');
    } finally {
      setSyncBusy(els.syncProductsBtn, els.syncProductsIcon, false);
    }
  }

  async function syncCustomers() {
    setSyncBusy(els.syncCustomersBtn, els.syncCustomersIcon, true);
    setDiagnostic({ badge: 'กำลังดาวน์โหลดรายชื่อลูกค้า…', badgeClass: 'bg-amber-100 text-amber-700' });

    try {
      let table = null;
      let lastError = null;
      for (const sheetName of CONFIG.customerSheetNames) {
        try {
          table = await fetchSheetTable(sheetName);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!table) throw lastError || new Error('ไม่พบแผ่นงานลูกค้า');

      const { columns } = mapSheetColumns(table, 'customers');

      const customers = table.rows
        .map((row, index) => normalizeCustomer({
          id: cellValue(row, columns.id, `C-GS-${index + 1}`),
          name: cellValue(row, columns.name, ''),
          phone: cellValue(row, columns.phone, ''),
          email: cellValue(row, columns.email, ''),
          gender: normalizeGender(cellValue(row, columns.gender, '')),
          age: cellValue(row, columns.age, 0),
          occupation: cellValue(row, columns.occupation, ''),
          faceShape: cellValue(row, columns.faceShape, ''),
          notes: cellValue(row, columns.notes, ''),
          refraction: {
            distance: {
              od: {
                sph: cellValue(row, columns.odSph, 0),
                cyl: cellValue(row, columns.odCyl, 0),
                ax: cellValue(row, columns.odAx, 0),
                va: cellValue(row, columns.odVa, '')
              },
              os: {
                sph: cellValue(row, columns.osSph, 0),
                cyl: cellValue(row, columns.osCyl, 0),
                ax: cellValue(row, columns.osAx, 0),
                va: cellValue(row, columns.osVa, '')
              }
            },
            near: {
              od: { add: cellValue(row, columns.add, 0) },
              os: { add: cellValue(row, columns.add, 0) }
            },
            pd: { far: cellValue(row, columns.pdFar, 0), near: cellValue(row, columns.pdNear, 0) }
          }
        }))
        .filter((customer) => customer.name && !isHeaderish(customer.name));

      if (!customers.length) throw new Error('แผ่นงานลูกค้าว่างเปล่า');

      state.customers = customers;
      persist();
      renderAll();

      setDiagnostic({
        badge: 'ซิงค์ลูกค้าสำเร็จ 🟢',
        badgeClass: 'bg-emerald-100 text-emerald-800',
        env: 'Google Sheets (gviz)',
        customers: `เชื่อมต่อแล้ว (${customers.length} คน)`,
        customersClass: 'text-emerald-600',
        status: `ดึงรายชื่อลูกค้าสำเร็จเมื่อ ${nowTime()}`
      });
      showToast(`ซิงค์ข้อมูลลูกค้าสำเร็จ ${customers.length} รายการ`);
    } catch (error) {
      console.error('ซิงค์ข้อมูลลูกค้าไม่สำเร็จ:', error);
      setDiagnostic({
        badge: 'ซิงค์ลูกค้าไม่สำเร็จ 🔴',
        badgeClass: 'bg-rose-100 text-rose-800',
        customers: 'ไม่พบแผ่นงานลูกค้า',
        customersClass: 'text-rose-500',
        status: `สร้างแผ่นงานชื่อ "Customers" หรือ "ลูกค้า" ในไฟล์ชีทเดียวกัน (${error.message})`
      });
      showToast('ไม่พบแผ่นงานลูกค้าในชีท ระบบยังใช้ข้อมูลเดิมต่อไป', 'error');
    } finally {
      setSyncBusy(els.syncCustomersBtn, els.syncCustomersIcon, false);
    }
  }

  /* --------------------------------------------------------------------------
   * รายงานการเชื่อมต่อ Google Sheets — ตรวจว่าดึงข้อมูลได้จริง แมปคอลัมน์ถูกไหม
   * และข้อมูลในชีตมีปัญหาคุณภาพอะไรบ้าง ก่อนตัดสินใจนำเข้าจริง
   * ------------------------------------------------------------------------ */

  /** ตรวจคุณภาพข้อมูลดิบที่ดึงมา ตามเกณฑ์ที่ระบบใช้จริง */
  function auditSheetRows(entity, table, columns) {
    const issues = [];
    const add = (level, rowNumber, message) => issues.push({ level, rowNumber, message });

    table.rows.forEach((row, index) => {
      const rowNumber = index + 2; // แถว 1 คือหัวตาราง
      const get = (key, fallback = '') => cellValue(row, columns[key], fallback);

      if (entity === 'customers') {
        const name = String(get('name') || '').trim();
        if (!name) { add('error', rowNumber, 'ไม่มีชื่อผู้รับบริการ — แถวนี้จะถูกข้าม'); return; }
        if (!String(get('phone') || '').trim()) {
          add('warn', rowNumber, `"${name}" ไม่มีเบอร์โทรศัพท์ (ระบบกำหนดให้เป็นข้อมูลจำเป็น)`);
        }
        [['odSph', 'OD SPH'], ['osSph', 'OS SPH']].forEach(([key, label]) => {
          const value = toNum(get(key, 0), 0);
          if (Math.abs(value) > 30) {
            add('error', rowNumber, `"${name}" ${label} = ${value} อยู่นอกช่วง ±30.00 D — น่าจะกรอกผิดหน่วย`);
          }
        });
        [['odCyl', 'OD CYL'], ['osCyl', 'OS CYL']].forEach(([key, label]) => {
          const value = toNum(get(key, 0), 0);
          if (Math.abs(value) > 10) add('error', rowNumber, `"${name}" ${label} = ${value} อยู่นอกช่วง ±10.00 D`);
        });
        [['odAx', 'OD AXIS'], ['osAx', 'OS AXIS']].forEach(([key, label]) => {
          const value = toNum(get(key, 0), 0);
          if (value < 0 || value > 180) add('error', rowNumber, `"${name}" ${label} = ${value} ต้องอยู่ระหว่าง 0–180 องศา`);
        });
        const pd = toNum(get('pdFar', 0), 0);
        if (pd && (pd < 40 || pd > 85)) add('warn', rowNumber, `"${name}" PD = ${pd} มม. อยู่นอกช่วงปกติ 40–85 มม.`);
      }

      if (entity === 'products') {
        const name = String(get('name') || '').trim();
        if (!name) { add('error', rowNumber, 'ไม่มีชื่อสินค้า — แถวนี้จะถูกข้าม'); return; }
        const price = toNum(get('price', 0), 0);
        const cost = toNum(get('cost', 0), 0);
        if (!price) add('warn', rowNumber, `"${name}" ไม่มีราคาขาย`);
        if (cost > price && price > 0) add('warn', rowNumber, `"${name}" ต้นทุน ${formatBaht(cost)} สูงกว่าราคาขาย ${formatBaht(price)}`);
        const category = String(get('category') || '').trim();
        if (category && normalizeCategory(category) === 'Frame' && !/frame|กรอบ/i.test(category)) {
          add('warn', rowNumber, `"${name}" หมวดหมู่ "${category}" ไม่ตรงกับที่ระบบรู้จัก จะถูกจัดเป็น Frame`);
        }
      }
    });

    return issues;
  }

  /** ดึงข้อมูลจากทุกแผ่นงานที่ระบบใช้ แล้วสรุปเป็นรายงานเดียว */
  async function buildSyncReport() {
    const targets = [
      { entity: 'products', title: 'คลังสินค้า (Products)', sheetNames: CONFIG.productSheetNames },
      { entity: 'customers', title: 'ผู้รับบริการ (Customers)', sheetNames: CONFIG.customerSheetNames }
    ];

    const report = {
      startedAt: new Date(),
      sheetId: CONFIG.sheetId,
      origin: location.origin === 'null' || !location.origin ? 'file:// (origin null)' : location.origin,
      isFileOrigin: location.protocol === 'file:' || location.origin === 'null',
      sheets: []
    };

    for (const target of targets) {
      const entry = {
        entity: target.entity,
        title: target.title,
        tried: [],
        ok: false,
        sheetName: null,
        error: null,
        rowCount: 0,
        header: [],
        mapping: [],
        preview: [],
        issues: []
      };

      let table = null;
      for (const sheetName of target.sheetNames) {
        const started = performance.now();
        try {
          table = await fetchSheetTable(sheetName);
          entry.tried.push({ sheetName, ok: true, ms: Math.round(performance.now() - started) });
          entry.sheetName = sheetName;
          break;
        } catch (error) {
          entry.tried.push({ sheetName, ok: false, ms: Math.round(performance.now() - started), error: error.message });
        }
      }

      if (!table) {
        entry.error = entry.tried.length
          ? entry.tried[entry.tried.length - 1].error
          : 'ไม่ได้ระบุชื่อแผ่นงาน';
        report.sheets.push(entry);
        continue;
      }

      const { columns, report: mapping } = mapSheetColumns(table, target.entity);
      entry.ok = true;
      entry.rowCount = table.rows.length;
      entry.header = (table.cols || []).map((col) => String(col.label || ''));
      entry.mapping = mapping;
      entry.issues = auditSheetRows(target.entity, table, columns);
      entry.preview = table.rows.slice(0, 5).map((row, index) => ({
        rowNumber: index + 2,
        cells: mapping.map((field) => cellValue(row, field.index, ''))
      }));

      report.sheets.push(entry);
    }

    report.finishedAt = new Date();
    report.durationMs = report.finishedAt - report.startedAt;
    return report;
  }

  const MATCH_STYLE = {
    name: { chip: 'bg-emerald-100 text-emerald-800', text: 'จับคู่ด้วยชื่อคอลัมน์' },
    position: { chip: 'bg-amber-100 text-amber-800', text: 'ใช้ตำแหน่งคอลัมน์สำรอง' },
    missing: { chip: 'bg-rose-100 text-rose-800', text: 'ไม่พบคอลัมน์นี้' }
  };

  function renderSyncReport(report) {
    const summary = report.sheets.map((sheet) => {
      if (!sheet.ok) return { level: 'error', sheet };
      const errors = sheet.issues.filter((issue) => issue.level === 'error').length;
      const positional = sheet.mapping.filter((field) => field.matchedBy !== 'name').length;
      return { level: errors ? 'error' : (positional ? 'warn' : 'ok'), sheet };
    });

    const overall = summary.some((item) => item.level === 'error') ? 'error'
      : summary.some((item) => item.level === 'warn') ? 'warn' : 'ok';

    const banner = {
      ok: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: 'fa-circle-check', text: 'เชื่อมต่อ Google Sheets ได้ และแมปคอลัมน์ครบทุกฟิลด์ด้วยชื่อหัวตาราง' },
      warn: { cls: 'bg-amber-50 border-amber-200 text-amber-800', icon: 'fa-triangle-exclamation', text: 'เชื่อมต่อได้ แต่มีบางฟิลด์ที่ต้องพึ่งตำแหน่งคอลัมน์ หรือพบข้อมูลที่ควรตรวจสอบ' },
      error: { cls: 'bg-rose-50 border-rose-200 text-rose-800', icon: 'fa-circle-exclamation', text: 'พบปัญหาที่ทำให้นำเข้าข้อมูลไม่ครบหรือไม่ถูกต้อง' }
    }[overall];

    els.syncReportBody.innerHTML = html`
      <div class="border rounded-xl p-4 flex items-start gap-3 ${raw(banner.cls)}">
        <i class="fa-solid ${raw(banner.icon)} text-lg mt-0.5" aria-hidden="true"></i>
        <div class="text-sm">
          <p class="font-bold">${banner.text}</p>
          <p class="text-2xs mt-1 opacity-80">
            ตรวจเมื่อ ${report.startedAt.toLocaleString('th-TH')} · ใช้เวลา ${formatNumber(report.durationMs)} มิลลิวินาที ·
            เรียกจาก origin <span class="font-mono">${report.origin}</span>
          </p>
        </div>
      </div>

      ${report.isFileOrigin
        ? raw(html`<div class="border border-rose-200 bg-rose-50 rounded-xl p-3 text-2xs text-rose-800 leading-relaxed">
            <strong>หน้านี้เปิดจากไฟล์โดยตรง (file://)</strong> — เบราว์เซอร์ถือว่าเป็น origin “null”
            ซึ่ง Google ปฏิเสธด้วยนโยบาย CORS การซิงค์จะล้มเหลวเสมอไม่ว่าชีตจะตั้งค่าถูกหรือไม่
            ให้เปิดผ่านเว็บเซิร์ฟเวอร์ เช่น <span class="font-mono">npx serve .</span> แล้วเข้าทาง http://localhost
          </div>`)
        : ''}

      ${report.sheets.map((sheet) => raw(renderSheetReport(sheet)))}

      <p class="text-2xs text-gray-400 leading-relaxed border-t border-gray-100 pt-3">
        รายงานนี้อ่านข้อมูลจากชีตอย่างเดียว ไม่มีการเขียนทับข้อมูลในระบบ
        กดปุ่มซิงค์บนแผงควบคุมเมื่อตรวจสอบแล้วว่าถูกต้อง · Sheet ID
        <span class="font-mono">${report.sheetId}</span>
      </p>`;
  }

  function renderSheetReport(sheet) {
    if (!sheet.ok) {
      return html`
        <section class="border border-rose-200 rounded-xl overflow-hidden">
          <header class="bg-rose-50 px-4 py-2.5 flex items-center justify-between gap-2">
            <h3 class="text-sm font-bold text-rose-900">${sheet.title}</h3>
            <span class="px-2 py-0.5 rounded text-2xs font-semibold bg-rose-100 text-rose-800">เชื่อมต่อไม่สำเร็จ</span>
          </header>
          <div class="p-4 space-y-2 text-2xs text-gray-600">
            <p class="text-rose-700 font-medium">${sheet.error}</p>
            <p>ลองชื่อแผ่นงานตามลำดับ:</p>
            <ul class="list-disc pl-5 space-y-0.5">
              ${sheet.tried.map((attempt) => raw(html`<li><span class="font-mono">${attempt.sheetName}</span> — ${attempt.error} (${attempt.ms} มิลลิวินาที)</li>`))}
            </ul>
          </div>
        </section>`;
    }

    const errors = sheet.issues.filter((issue) => issue.level === 'error');
    const warnings = sheet.issues.filter((issue) => issue.level === 'warn');
    const positional = sheet.mapping.filter((field) => field.matchedBy !== 'name');

    return html`
      <section class="border border-gray-200 rounded-xl overflow-hidden">
        <header class="bg-gray-50 px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
          <h3 class="text-sm font-bold text-gray-900">
            ${sheet.title}
            <span class="font-normal text-gray-500">· แผ่นงาน "${sheet.sheetName}"</span>
          </h3>
          <div class="flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-100 text-emerald-800">
              ดึงได้ ${formatNumber(sheet.rowCount)} แถว
            </span>
            ${errors.length
              ? raw(html`<span class="px-2 py-0.5 rounded text-2xs font-semibold bg-rose-100 text-rose-800">${errors.length} ข้อผิดพลาด</span>`)
              : ''}
            ${warnings.length
              ? raw(html`<span class="px-2 py-0.5 rounded text-2xs font-semibold bg-amber-100 text-amber-800">${warnings.length} คำเตือน</span>`)
              : ''}
          </div>
        </header>

        <div class="p-4 space-y-4">
          <div>
            <h4 class="text-2xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">หัวตารางที่พบในชีต</h4>
            <p class="text-2xs font-mono text-gray-500 break-words">${sheet.header.join(' · ')}</p>
          </div>

          <div>
            <h4 class="text-2xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">การจับคู่คอลัมน์</h4>
            <div class="table-scroll">
              <table class="w-full text-left border-collapse text-2xs">
                <caption class="sr-only">ผลการจับคู่ฟิลด์ในระบบกับคอลัมน์ในชีต</caption>
                <thead>
                  <tr class="bg-gray-50 text-gray-500 font-semibold">
                    <th scope="col" class="py-1.5 px-2 border">ฟิลด์ในระบบ</th>
                    <th scope="col" class="py-1.5 px-2 border">คอลัมน์ในชีต</th>
                    <th scope="col" class="py-1.5 px-2 border">วิธีจับคู่</th>
                  </tr>
                </thead>
                <tbody>
                  ${sheet.mapping.map((field) => raw(html`
                    <tr>
                      <th scope="row" class="py-1.5 px-2 border font-medium text-gray-700">
                        ${field.label} <span class="font-mono text-gray-400">(${field.key})</span>
                      </th>
                      <td class="py-1.5 px-2 border font-mono">
                        ${field.index >= 0 ? `${columnLetterOf(field.index)} — ${field.sheetLabel || '(ไม่มีชื่อหัวตาราง)'}` : '—'}
                      </td>
                      <td class="py-1.5 px-2 border">
                        <span class="px-1.5 py-0.5 rounded font-semibold ${raw(MATCH_STYLE[field.matchedBy].chip)}">
                          ${MATCH_STYLE[field.matchedBy].text}
                        </span>
                      </td>
                    </tr>`))}
                </tbody>
              </table>
            </div>
            ${positional.length
              ? raw(html`<p class="text-2xs text-amber-700 mt-1.5 leading-relaxed">
                  <i class="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true"></i>
                  มี ${positional.length} ฟิลด์ที่หาชื่อหัวตารางไม่เจอ จึงใช้ตำแหน่งคอลัมน์แทน
                  (${positional.map((field) => field.key).join(', ')}) —
                  ถ้ามีการแทรกหรือสลับคอลัมน์ในชีต ข้อมูลจะเข้าผิดช่องทันที
                  แนะนำให้แก้ชื่อหัวตารางในชีตให้ตรงกับชื่อที่ระบบรู้จัก
                </p>`)
              : ''}
          </div>

          <div>
            <h4 class="text-2xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              ตัวอย่างข้อมูล ${formatNumber(Math.min(5, sheet.rowCount))} แถวแรก (หลังแมปคอลัมน์แล้ว)
            </h4>
            <div class="table-scroll">
              <table class="w-full text-left border-collapse text-2xs">
                <caption class="sr-only">ตัวอย่างข้อมูลที่ระบบอ่านได้จากชีต</caption>
                <thead>
                  <tr class="bg-gray-50 text-gray-500 font-semibold">
                    <th scope="col" class="py-1.5 px-2 border">แถว</th>
                    ${sheet.mapping.map((field) => raw(html`<th scope="col" class="py-1.5 px-2 border whitespace-nowrap">${field.key}</th>`))}
                  </tr>
                </thead>
                <tbody>
                  ${sheet.preview.map((row) => raw(html`
                    <tr class="hover:bg-gray-50">
                      <th scope="row" class="py-1.5 px-2 border text-gray-400 font-mono">${row.rowNumber}</th>
                      ${row.cells.map((cell) => raw(html`<td class="py-1.5 px-2 border whitespace-nowrap">${cell === '' || cell === null ? raw('<span class="text-gray-300">—</span>') : cell}</td>`))}
                    </tr>`))}
                </tbody>
              </table>
            </div>
          </div>

          ${sheet.issues.length
            ? raw(html`
              <div>
                <h4 class="text-2xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">ข้อมูลที่ควรตรวจสอบ</h4>
                <ul class="space-y-1">
                  ${sheet.issues.slice(0, 20).map((issue) => raw(html`
                    <li class="text-2xs flex items-start gap-1.5 px-2 py-1.5 rounded ${raw(issue.level === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800')}">
                      <span class="font-mono font-bold shrink-0">แถว ${issue.rowNumber}</span>
                      <span>${issue.message}</span>
                    </li>`))}
                </ul>
                ${sheet.issues.length > 20
                  ? raw(html`<p class="text-2xs text-gray-400 mt-1">และอีก ${sheet.issues.length - 20} รายการ</p>`)
                  : ''}
              </div>`)
            : raw(html`<p class="text-2xs text-emerald-700"><i class="fa-solid fa-circle-check mr-1" aria-hidden="true"></i>ไม่พบปัญหาคุณภาพข้อมูลในแผ่นงานนี้</p>`)}
        </div>
      </section>`;
  }

  /** แปลงดัชนีคอลัมน์ (เริ่มที่ 0) เป็นตัวอักษรแบบ Google Sheets */
  function columnLetterOf(index) {
    let letter = '';
    let n = index + 1;
    while (n > 0) {
      const remainder = (n - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      n = Math.floor((n - remainder) / 26);
    }
    return letter;
  }

  /** หน้าต่างรายงานนี้ใช้ร่วมกันหลายงาน จึงต้องเปลี่ยนหัวเรื่องให้ตรงกับงานที่กำลังแสดง */
  function setSyncReportHeading(title, subtitle) {
    els.syncReportTitle.textContent = title;
    els.syncReportSubtitle.textContent = subtitle;
  }

  async function openSyncReport() {
    const modal = $('#modal-sync-report');
    setSyncReportHeading(
      'รายงานการเชื่อมต่อ Google Sheets',
      'ตรวจว่าดึงข้อมูลได้จริง คอลัมน์จับคู่ถูกต้องหรือไม่ และข้อมูลในชีตมีจุดใดต้องแก้ก่อนนำเข้า'
    );
    els.syncReportBody.innerHTML = html`
      <div class="py-12 text-center text-gray-500">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" aria-hidden="true"></div>
        <p class="text-sm font-medium">กำลังดึงข้อมูลจาก Google Sheets เพื่อตรวจสอบ…</p>
      </div>`;
    openModal(modal);

    try {
      renderSyncReport(await buildSyncReport());
    } catch (error) {
      console.error('สร้างรายงานการซิงค์ไม่สำเร็จ:', error);
      els.syncReportBody.innerHTML = html`
        <div class="border border-rose-200 bg-rose-50 rounded-xl p-4 text-sm text-rose-800">
          <p class="font-bold">สร้างรายงานไม่สำเร็จ</p>
          <p class="text-2xs mt-1">${error.message}</p>
        </div>`;
    }
  }

  /* --------------------------------------------------------------------------
   * 12b. APPS SCRIPT BACKEND — เชื่อมกับ Code.gs เพื่ออ่าน-เขียน Google Sheets
   *
   * โครงสร้างข้อมูลฝั่งเซิร์ฟเวอร์เป็นตารางแบน (คอลัมน์เดียวต่อค่า) ส่วนฝั่งหน้าเว็บ
   * เป็นออบเจกต์ซ้อนกัน จึงต้องมีตัวแปลงสองทางในส่วนนี้ที่เดียว
   * ------------------------------------------------------------------------ */

  /** พร้อมเขียนขึ้นเซิร์ฟเวอร์เมื่ออยู่โหมด API ตั้ง URL แล้ว และล็อกอินผ่านแล้วเท่านั้น */
  const backendConfigured = () =>
    state.backend.mode === 'api' && Boolean(state.backend.url) && Boolean(state.session.token);

  function loadBackendSettings() {
    // ยังไม่เคยตั้งค่าในเครื่องนี้ → ใช้ Web App ที่กำหนดไว้ใน CONFIG เป็นค่าเริ่มต้น
    state.backend.url = CONFIG.defaultBackendUrl || '';
    state.backend.mode = state.backend.url ? 'api' : 'local';

    if (!state.storageAvailable) return;
    try {
      const stored = JSON.parse(localStorage.getItem(CONFIG.backendKey) || 'null');
      if (stored && typeof stored === 'object') {
        const mode = String(stored.mode || '');
        if (['local', 'sheet', 'api'].includes(mode)) state.backend.mode = mode;
        if (stored.url !== undefined) state.backend.url = String(stored.url || '').trim();
      }
      if (state.backend.mode === 'api' && !state.backend.url) state.backend.mode = 'local';
    } catch (error) {
      console.warn('อ่านการตั้งค่าการเชื่อมต่อไม่สำเร็จ', error);
    }
  }

  function persistBackendSettings() {
    if (!state.storageAvailable) return;
    try {
      localStorage.setItem(CONFIG.backendKey, JSON.stringify(state.backend));
    } catch (error) {
      console.warn('บันทึกการตั้งค่าการเชื่อมต่อไม่สำเร็จ', error);
    }
  }

  /**
   * เรียก API ของ Apps Script
   * อ่านใช้ GET · เขียนใช้ POST ด้วย Content-Type: text/plain
   * (Apps Script ไม่ตอบ preflight ถ้าใช้ application/json เบราว์เซอร์จะบล็อกทันที)
   */
  async function apiCall(action, params = {}, method = 'GET') {
    const url = state.backend.url;
    if (!url) throw new Error('ยังไม่ได้ตั้งค่า Web App URL');

    // action สาธารณะไม่ต้องมี session token · นอกนั้นต้องล็อกอินก่อน
    const token = state.session.token || '';
    if (!token && !['authStatus', 'login'].includes(action)) {
      throw new Error('ยังไม่ได้เข้าสู่ระบบ');
    }

    let response;
    if (method === 'GET') {
      const query = new URLSearchParams({ action, token });
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) query.set(key, String(value));
      });
      response = await fetchWithTimeout(`${url}?${query.toString()}`, { timeoutMs: 30000 });
    } else {
      response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token, ...params }),
        timeoutMs: 30000
      });
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      // ปกติเกิดเมื่อ Apps Script ส่งหน้า HTML แจ้งให้ล็อกอินหรือรายงาน error กลับมา
      throw new Error('เซิร์ฟเวอร์ไม่ได้ตอบเป็น JSON — ตรวจว่า Deploy เป็น Web app และตั้ง Who has access ถูกต้อง');
    }
    if (!payload.ok) {
      // เซสชันหมดอายุหรือถูกเพิกถอน — บังคับล็อกอินใหม่ทันที
      if (payload.needsLogin && state.session.token) {
        clearSession();
        renderSession();
        setLocked(true);
        showLoginPanel('checking');
        initAuth();
      }
      // บัญชีที่ยังไม่ได้ตั้งรหัสผ่านของตัวเอง — บังคับให้ตั้งก่อนจึงใช้งานต่อได้
      if (payload.mustChangePassword && state.session.token) {
        promptPasswordChange('');
      }
      throw new Error(payload.error || 'เซิร์ฟเวอร์ปฏิเสธคำขอ');
    }
    return payload.data;
  }

  /* ---------- ตัวแปลงข้อมูล: เซิร์ฟเวอร์ (ตารางแบน) ⇄ หน้าเว็บ (ออบเจกต์ซ้อน) ---------- */

  const examFromApi = (row) => normalizeExam({
    id: row.id,
    date: String(row.examDate || '').slice(0, 10),
    optometrist: row.optometrist,
    method: row.method,
    note: row.note,
    refraction: {
      distance: {
        od: { sph: row.odSph, cyl: row.odCyl, ax: row.odAx, va: row.odVa },
        os: { sph: row.osSph, cyl: row.osCyl, ax: row.osAx, va: row.osVa }
      },
      near: {
        od: { add: row.odAdd, sph: row.odNearSph, va: row.odNearVa },
        os: { add: row.osAdd, sph: row.osNearSph, va: row.osNearVa }
      },
      pd: { far: row.pdFar, near: row.pdNear },
      segHeight: row.segHeight
    }
  });

  const examToApi = (customerId, exam) => {
    const { distance, near, pd, segHeight } = exam.refraction;
    return {
      id: exam.id, customerId, examDate: exam.date,
      optometrist: exam.optometrist, method: exam.method, note: exam.note,
      odSph: distance.od.sph, odCyl: distance.od.cyl, odAx: distance.od.ax, odVa: distance.od.va,
      osSph: distance.os.sph, osCyl: distance.os.cyl, osAx: distance.os.ax, osVa: distance.os.va,
      odAdd: near.od.add, odNearSph: near.od.sph, odNearVa: near.od.va,
      osAdd: near.os.add, osNearSph: near.os.sph, osNearVa: near.os.va,
      pdFar: pd.far, pdNear: pd.near, segHeight
    };
  };

  const customerToApi = (customer) => ({
    id: customer.id, name: customer.name, phone: customer.phone, email: customer.email,
    gender: customer.gender, age: customer.age, occupation: customer.occupation,
    faceShape: customer.faceShape, notes: customer.notes, active: true,
    chiefComplaint: customer.ocular.chiefComplaint,
    ocularConditions: customer.ocular.conditions,
    medications: customer.ocular.medications,
    familyHistory: customer.ocular.familyHistory,
    contactLensUse: customer.ocular.contactLens,
    createdAt: customer.createdAt
  });

  const customerFromApi = (row, exams) => normalizeCustomer({
    id: row.id, name: row.name, phone: row.phone, email: row.email,
    gender: row.gender, age: row.age, occupation: row.occupation,
    faceShape: row.faceShape, notes: row.notes, createdAt: String(row.createdAt || '').slice(0, 10),
    ocular: {
      chiefComplaint: row.chiefComplaint,
      conditions: row.ocularConditions,
      medications: row.medications,
      familyHistory: row.familyHistory,
      contactLens: row.contactLensUse
    },
    history: exams.length ? exams : undefined
  });

  const productToApi = (product) => ({
    id: product.id, category: product.category, name: product.name, barcode: product.barcode,
    cost: product.cost, price: product.price, stock: product.stock, minAlert: product.minAlert, active: true
  });

  const productFromApi = (row) => normalizeProduct({
    id: row.id, category: row.category, name: row.name, barcode: row.barcode,
    cost: row.cost, price: row.price, stock: row.stock, minAlert: row.minAlert
  });

  const orderToApi = (order) => {
    const rx = order.rx;
    const lab = order.lab;
    return {
      id: order.id, customerId: order.customerId, customerName: order.customerName,
      frameId: order.frameId || '', lensId: order.lensId || '',
      total: order.total, discount: order.discount, deposit: order.deposit,
      payment: order.payment, status: order.status,
      labInstruction: order.labInstruction, promiseDate: order.promiseDate,
      createdAt: order.createdAt,
      rxDate: order.createdAt,
      rxOdSph: rx ? rx.distance.od.sph : 0, rxOdCyl: rx ? rx.distance.od.cyl : 0,
      rxOdAx: rx ? rx.distance.od.ax : 0, rxOdAdd: rx ? rx.near.od.add : 0,
      rxOsSph: rx ? rx.distance.os.sph : 0, rxOsCyl: rx ? rx.distance.os.cyl : 0,
      rxOsAx: rx ? rx.distance.os.ax : 0, rxOsAdd: rx ? rx.near.os.add : 0,
      rxPdFar: rx ? rx.pd.far : 0, rxPdNear: rx ? rx.pd.near : 0, rxSegHeight: rx ? rx.segHeight : 0,
      labFrameType: lab.frameType, labA: lab.a, labB: lab.b, labDbl: lab.dbl, labEd: lab.ed,
      labMonoPdOd: lab.monoPdOd, labMonoPdOs: lab.monoPdOs,
      labFittingHeightOd: lab.fittingHeightOd, labFittingHeightOs: lab.fittingHeightOs,
      labPantoscopicTilt: lab.pantoscopicTilt, labVertexDistance: lab.vertexDistance,
      labWrapAngle: lab.wrapAngle, labLensIndex: lab.lensIndex,
      labCoating: lab.coating, labTint: lab.tint, labEdgeTreatment: lab.edgeTreatment
    };
  };

  const orderFromApi = (row) => normalizeOrder({
    id: row.id, customerId: row.customerId, customerName: row.customerName,
    frameId: row.frameId, frameName: row.frameName, lensId: row.lensId, lensName: row.lensName,
    total: row.total, discount: row.discount, finalTotal: row.finalTotal, deposit: row.deposit,
    payment: row.payment, status: row.status, labInstruction: row.labInstruction,
    promiseDate: String(row.promiseDate || '').slice(0, 10),
    createdAt: String(row.createdAt || '').slice(0, 10),
    rx: row.rxDate ? {
      distance: {
        od: { sph: row.rxOdSph, cyl: row.rxOdCyl, ax: row.rxOdAx, va: '' },
        os: { sph: row.rxOsSph, cyl: row.rxOsCyl, ax: row.rxOsAx, va: '' }
      },
      near: { od: { add: row.rxOdAdd }, os: { add: row.rxOsAdd } },
      pd: { far: row.rxPdFar, near: row.rxPdNear },
      segHeight: row.rxSegHeight
    } : null,
    lab: {
      frameType: row.labFrameType, a: row.labA, b: row.labB, dbl: row.labDbl, ed: row.labEd,
      monoPdOd: row.labMonoPdOd, monoPdOs: row.labMonoPdOs,
      fittingHeightOd: row.labFittingHeightOd, fittingHeightOs: row.labFittingHeightOs,
      pantoscopicTilt: row.labPantoscopicTilt, vertexDistance: row.labVertexDistance,
      wrapAngle: row.labWrapAngle, lensIndex: row.labLensIndex,
      coating: row.labCoating, tint: row.labTint, edgeTreatment: row.labEdgeTreatment
    }
  });

  /* ---------- ดึง / ส่งข้อมูล ---------- */

  /**
   * ดึงข้อมูลทุกตารางจากเซิร์ฟเวอร์
   *
   * ใช้ action เดียว (pullAll) แทนการยิง 4 คำขอ เพราะการเรียก Apps Script แต่ละครั้ง
   * มีค่าใช้จ่ายคงที่สูงและถูกจับคิวรันทีละอันต่อผู้ใช้หนึ่งคน
   * ถ้าเซิร์ฟเวอร์ยังเป็นรุ่นเก่าที่ไม่มี pullAll จะถอยไปเรียกทีละตารางให้อัตโนมัติ
   */
  async function fetchAllFromBackend() {
    try {
      const data = await apiCall('pullAll');
      if (data && Array.isArray(data.customers)) return data;
    } catch (error) {
      if (!/ไม่รู้จัก action/.test(error.message)) throw error;
      console.info('เซิร์ฟเวอร์ยังไม่มี pullAll — ถอยไปเรียกทีละตาราง (แนะนำให้ Deploy Code.gs ใหม่เพื่อความเร็ว)');
    }

    const [customers, exams, products, orders] = await Promise.all([
      apiCall('listCustomers'),
      apiCall('listExams'),
      apiCall('listProducts'),
      apiCall('listOrders')
    ]);
    return { customers, exams, products, orders };
  }

  /** แปลงข้อมูลดิบจากเซิร์ฟเวอร์เข้าสู่ state แล้ววาดหน้าจอใหม่ */
  function applyPulledData(data) {
    const examsByCustomer = new Map();
    (data.exams || []).forEach((row) => {
      const list = examsByCustomer.get(row.customerId) || [];
      list.push(examFromApi(row));
      examsByCustomer.set(row.customerId, list);
    });

    state.customers = (data.customers || []).map((row) =>
      customerFromApi(row, examsByCustomer.get(row.id) || []));
    state.products = (data.products || []).map(productFromApi);
    state.orders = (data.orders || []).map(orderFromApi);

    persist();
    renderAll();
  }

  async function backendPull(options = {}) {
    const quiet = options.quiet === true;
    if (!quiet) setSyncBusy(els.backendPullBtn, els.backendPullIcon, true);
    setDiagnostic({ badge: 'กำลังดึงข้อมูล…', badgeClass: 'bg-amber-100 text-amber-700' });

    try {
      applyPulledData(await fetchAllFromBackend());

      setDiagnostic({
        badge: 'เชื่อมต่อแล้ว',
        badgeClass: 'bg-emerald-100 text-emerald-800',
        env: 'Apps Script API (อ่าน-เขียน)',
        products: `${state.products.length} รายการ`,
        productsClass: 'text-emerald-600',
        customers: `${state.customers.length} คน`,
        customersClass: 'text-emerald-600',
        status: `ดึงข้อมูลสำเร็จเมื่อ ${nowTime()}`
      });
      if (!quiet) {
        showToast(`ดึงข้อมูลสำเร็จ — ลูกค้า ${state.customers.length} · สินค้า ${state.products.length} · ใบสั่ง ${state.orders.length}`);
      }
    } catch (error) {
      console.error('ดึงข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ:', error);
      setDiagnostic({
        badge: 'เชื่อมต่อไม่สำเร็จ',
        badgeClass: 'bg-rose-100 text-rose-800',
        status: error.message
      });
      showToast(`ดึงข้อมูลไม่สำเร็จ: ${error.message}`, 'error');
    } finally {
      if (!quiet) setSyncBusy(els.backendPullBtn, els.backendPullIcon, false);
    }
  }

  /** ตั้งตัวบ่งชี้สถานะหลังได้ข้อมูลมาพร้อมกับการล็อกอินในคำขอเดียว */
  function markPullSucceeded() {
    setDiagnostic({
      badge: 'เชื่อมต่อแล้ว',
      badgeClass: 'bg-emerald-100 text-emerald-800',
      env: 'Apps Script API (อ่าน-เขียน)',
      products: `${state.products.length} รายการ`,
      productsClass: 'text-emerald-600',
      customers: `${state.customers.length} คน`,
      customersClass: 'text-emerald-600',
      status: `ดึงข้อมูลสำเร็จเมื่อ ${nowTime()}`
    });
  }

  /** ส่งข้อมูลในเครื่องขึ้นเซิร์ฟเวอร์ทีละรายการ (upsert ตาม id) */
  async function backendPush() {
    const total = state.customers.length + state.products.length
      + state.customers.reduce((sum, customer) => sum + customer.history.length, 0);

    const ok = await askConfirm({
      title: 'ส่งข้อมูลขึ้นเซิร์ฟเวอร์',
      message: `ส่งข้อมูลในเครื่องทั้งหมด ${formatNumber(total)} รายการขึ้น Google Sheets ใช่หรือไม่? `
        + 'รายการที่มีรหัสซ้ำกับบนเซิร์ฟเวอร์จะถูกเขียนทับด้วยข้อมูลในเครื่อง',
      confirmLabel: 'ส่งข้อมูล'
    });
    if (!ok) return;

    setSyncBusy(els.backendPushBtn, els.backendPushIcon, true);
    const result = { customers: 0, exams: 0, products: 0, failed: [] };

    try {
      for (const product of state.products) {
        try {
          await apiCall('saveProduct', { record: productToApi(product) }, 'POST');
          result.products += 1;
        } catch (error) {
          result.failed.push(`สินค้า "${product.name}": ${error.message}`);
        }
      }

      for (const customer of state.customers) {
        try {
          await apiCall('saveCustomer', { record: customerToApi(customer) }, 'POST');
          result.customers += 1;
        } catch (error) {
          result.failed.push(`ลูกค้า "${customer.name}": ${error.message}`);
          continue;
        }
        for (const exam of customer.history) {
          try {
            await apiCall('saveExam', { record: examToApi(customer.id, exam) }, 'POST');
            result.exams += 1;
          } catch (error) {
            result.failed.push(`ผลตรวจ ${customer.name} (${exam.date}): ${error.message}`);
          }
        }
      }

      setDiagnostic({ status: `ส่งข้อมูลขึ้นเซิร์ฟเวอร์เมื่อ ${nowTime()}` });

      if (result.failed.length) {
        console.warn('รายการที่ส่งไม่สำเร็จ:', result.failed);
        showToast(`ส่งสำเร็จ ${result.customers + result.products + result.exams} รายการ · ล้มเหลว ${result.failed.length} รายการ (ดูรายละเอียดใน Console)`, 'error');
      } else {
        showToast(`ส่งข้อมูลสำเร็จ — ลูกค้า ${result.customers} · ผลตรวจ ${result.exams} · สินค้า ${result.products}`);
      }
    } catch (error) {
      console.error('ส่งข้อมูลไม่สำเร็จ:', error);
      showToast(`ส่งข้อมูลไม่สำเร็จ: ${error.message}`, 'error');
    } finally {
      setSyncBusy(els.backendPushBtn, els.backendPushIcon, false);
    }
  }

  /** เรียก diagnose ของฝั่งเซิร์ฟเวอร์แล้วแสดงผลในหน้าต่างรายงาน */
  async function backendDiagnose() {
    const modal = $('#modal-sync-report');
    setSyncReportHeading(
      'ตรวจสุขภาพฐานข้อมูล',
      'ตรวจการเชื่อมต่อ สิทธิ์เข้าถึงไฟล์ โครงสร้างตาราง และการตั้งค่าระบบเข้าสู่ระบบ'
    );
    els.syncReportBody.innerHTML = html`
      <div class="py-12 text-center text-gray-500">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" aria-hidden="true"></div>
        <p class="text-sm font-medium">กำลังตรวจสุขภาพฐานข้อมูลบนเซิร์ฟเวอร์…</p>
      </div>`;
    openModal(modal);

    try {
      const report = await apiCall('diagnose');
      const icons = {
        pass: { icon: 'fa-circle-check', cls: 'text-emerald-600', row: 'bg-emerald-50 border-emerald-200' },
        warn: { icon: 'fa-triangle-exclamation', cls: 'text-amber-600', row: 'bg-amber-50 border-amber-200' },
        fail: { icon: 'fa-circle-exclamation', cls: 'text-rose-600', row: 'bg-rose-50 border-rose-200' }
      };

      els.syncReportBody.innerHTML = html`
        <div class="border rounded-xl p-4 ${raw(report.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800')}">
          <p class="font-bold text-sm">
            ${report.ok ? 'เชื่อมต่อฐานข้อมูลได้ครบทุกจุด' : `พบ ${report.failedCount} จุดที่ต้องแก้`}
          </p>
          <p class="text-2xs mt-1 opacity-80">ตรวจเมื่อ ${report.checkedAt} · Sheet ID <span class="font-mono">${report.sheetId}</span></p>
        </div>
        ${report.checks.map((check) => raw(html`
          <div class="border rounded-lg p-3 ${raw(icons[check.status].row)}">
            <p class="text-xs font-semibold text-gray-800 flex items-start gap-2">
              <i class="fa-solid ${raw(icons[check.status].icon)} ${raw(icons[check.status].cls)} mt-0.5" aria-hidden="true"></i>
              <span>${check.name}</span>
            </p>
            ${check.detail ? raw(html`<p class="text-2xs text-gray-600 mt-1 pl-5">${check.detail}</p>`) : ''}
            ${check.fix ? raw(html`<p class="text-2xs text-gray-700 mt-1 pl-5"><strong>แก้:</strong> ${check.fix}</p>`) : ''}
          </div>`))}`;
    } catch (error) {
      els.syncReportBody.innerHTML = html`
        <div class="border border-rose-200 bg-rose-50 rounded-xl p-4 text-sm text-rose-800">
          <p class="font-bold">เรียกเซิร์ฟเวอร์ไม่สำเร็จ</p>
          <p class="text-2xs mt-1">${error.message}</p>
          <p class="text-2xs mt-2">ตรวจว่า Web App URL ลงท้ายด้วย <span class="font-mono">/exec</span> · token ถูกต้อง · และ Deploy ไว้แล้ว</p>
        </div>`;
    }
  }

  /* ---------- ซ่อมบำรุงฐานข้อมูล ---------- */

  const SHEET_STATE = {
    ok: { label: 'ถูกต้อง', icon: 'fa-circle-check', cls: 'text-emerald-600', row: 'bg-emerald-50 border-emerald-200' },
    missing: { label: 'ไม่พบชีตนี้', icon: 'fa-circle-xmark', cls: 'text-rose-600', row: 'bg-rose-50 border-rose-200' },
    noHeader: { label: 'ไม่มีหัวตาราง', icon: 'fa-circle-exclamation', cls: 'text-rose-600', row: 'bg-rose-50 border-rose-200' },
    legacy: { label: 'โครงสร้างเดิม ต้องย้ายข้อมูล', icon: 'fa-triangle-exclamation', cls: 'text-amber-600', row: 'bg-amber-50 border-amber-200' },
    mismatch: { label: 'ลำดับคอลัมน์ไม่ตรง', icon: 'fa-triangle-exclamation', cls: 'text-amber-600', row: 'bg-amber-50 border-amber-200' }
  };

  /** แถวสรุปสภาพของชีตหนึ่งในรายงานซ่อมบำรุง */
  function repairSheetRow(sheet) {
    const style = SHEET_STATE[sheet.state] || SHEET_STATE.mismatch;
    return html`
      <div class="border rounded-lg px-3 py-2 ${raw(style.row)}">
        <div class="flex items-start justify-between gap-2">
          <p class="text-xs font-semibold text-gray-800 flex items-start gap-2 min-w-0">
            <i class="fa-solid ${raw(style.icon)} ${raw(style.cls)} mt-0.5" aria-hidden="true"></i>
            <span class="font-mono">${sheet.sheet}</span>
            <span class="font-normal text-gray-600 truncate">${style.label}</span>
          </p>
          <p class="text-2xs text-gray-500 whitespace-nowrap">
            ${sheet.columns}/${sheet.expectedColumns} คอลัมน์ · ${sheet.dataRows} แถว
          </p>
        </div>
        ${sheet.droppedColumns && sheet.droppedColumns.length
          ? raw(html`<p class="text-2xs text-rose-700 mt-1 pl-5">คอลัมน์ที่จะถูกทิ้ง: ${sheet.droppedColumns.join(', ')}</p>`)
          : ''}
      </div>`;
  }

  /** รายงานซ่อมบำรุง ใช้ได้ทั้งตอนดูแผน (dryRun) และตอนซ่อมเสร็จ */
  function renderRepairReport(report, { heading, tone }) {
    const toneClass = {
      ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      warn: 'bg-amber-50 border-amber-200 text-amber-900',
      fail: 'bg-rose-50 border-rose-200 text-rose-800'
    }[tone];

    const todo = (report.actions || []).filter((action) => !action.done);
    const done = (report.actions || []).filter((action) => action.done);
    // ซ่อมเสร็จแล้วต้องแสดงสภาพ "หลังซ่อม" ไม่ใช่สภาพก่อนซ่อมที่ใช้วางแผน
    const sheets = report.sheetsAfter || report.sheets || [];

    setSyncReportHeading(
      report.dryRun ? 'ตรวจสภาพฐานข้อมูล' : 'ผลการซ่อมบำรุงฐานข้อมูล',
      report.dryRun
        ? 'เทียบโครงสร้างจริงในชีตกับมาตรฐานของระบบ แล้วบอกว่าจะซ่อมอะไรบ้างก่อนลงมือ'
        : 'สภาพของทุกชีตหลังซ่อม พร้อมรายการสิ่งที่ระบบทำไปและชีตสำรองที่เก็บไว้'
    );

    els.syncReportBody.innerHTML = html`
      <div class="border rounded-xl p-4 ${raw(toneClass)}">
        <p class="font-bold text-sm">${heading}</p>
        <p class="text-2xs mt-1 opacity-80">
          ${report.summary || ''} · ตรวจเมื่อ ${String(report.checkedAt || '').replace('T', ' ')}
        </p>
      </div>

      <div class="space-y-1.5">
        <p class="text-2xs font-semibold text-gray-500 uppercase tracking-wide">
          ${report.dryRun ? 'สภาพปัจจุบัน' : 'สภาพหลังซ่อม'}
        </p>
        ${sheets.map((sheet) => raw(repairSheetRow(sheet)))}
      </div>

      ${todo.length ? raw(html`
        <div class="border border-blue-200 bg-blue-50 rounded-xl p-3">
          <p class="text-xs font-bold text-blue-900 mb-1.5">สิ่งที่ระบบจะทำเมื่อกดซ่อม</p>
          <ul class="space-y-1">
            ${todo.map((action) => raw(html`
              <li class="text-2xs text-blue-900 leading-relaxed">
                <span class="font-mono font-semibold">${action.sheet}</span> — ${action.action}
              </li>`))}
          </ul>
        </div>`) : ''}

      ${done.length ? raw(html`
        <div class="border border-emerald-200 bg-emerald-50 rounded-xl p-3">
          <p class="text-xs font-bold text-emerald-900 mb-1.5">สิ่งที่ทำไปแล้ว</p>
          <ul class="space-y-1">
            ${done.map((action) => raw(html`
              <li class="text-2xs text-emerald-900 leading-relaxed">
                <span class="font-mono font-semibold">${action.sheet}</span> — ${action.action}
              </li>`))}
          </ul>
        </div>`) : ''}

      ${(report.backups || []).length ? raw(html`
        <div class="border border-gray-200 bg-gray-50 rounded-xl p-3">
          <p class="text-xs font-bold text-gray-800 mb-1">ชีตสำรองที่สร้างไว้ (ข้อมูลเดิมไม่ถูกลบ)</p>
          <ul class="space-y-0.5">
            ${report.backups.map((name) => raw(html`<li class="text-2xs font-mono text-gray-600">${name}</li>`))}
          </ul>
        </div>`) : ''}

      ${(report.warnings || []).length ? raw(html`
        <div class="border border-amber-200 bg-amber-50 rounded-xl p-3">
          <p class="text-xs font-bold text-amber-900 mb-1">ข้อควรทราบ</p>
          <ul class="space-y-1 list-disc list-inside">
            ${report.warnings.map((warning) => raw(html`<li class="text-2xs text-amber-900 leading-relaxed">${warning}</li>`))}
          </ul>
        </div>`) : ''}`;
  }

  /**
   * ปุ่มซ่อมบำรุงฐานข้อมูล
   * ขั้นที่ 1 ตรวจสภาพและแสดงแผน (ไม่แตะไฟล์) → ขั้นที่ 2 ถามยืนยัน → ขั้นที่ 3 ซ่อมจริง
   */
  async function backendRepair() {
    if (!backendConfigured()) {
      showToast('ต้องเชื่อมต่อโหมด Apps Script API และเข้าสู่ระบบก่อนจึงจะซ่อมฐานข้อมูลได้', 'error');
      return;
    }

    const modal = $('#modal-sync-report');
    setSyncReportHeading(
      'ตรวจสภาพฐานข้อมูล',
      'เทียบโครงสร้างจริงในชีตกับมาตรฐานของระบบ แล้วบอกว่าจะซ่อมอะไรบ้างก่อนลงมือ'
    );
    els.syncReportBody.innerHTML = html`
      <div class="py-12 text-center text-gray-500">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto mb-3" aria-hidden="true"></div>
        <p class="text-sm font-medium">กำลังตรวจสภาพโครงสร้างฐานข้อมูล…</p>
      </div>`;
    openModal(modal);

    let preview;
    try {
      preview = await apiCall('repairPreview');
    } catch (error) {
      els.syncReportBody.innerHTML = html`
        <div class="border border-rose-200 bg-rose-50 rounded-xl p-4 text-sm text-rose-800">
          <p class="font-bold">ตรวจสภาพฐานข้อมูลไม่สำเร็จ</p>
          <p class="text-2xs mt-1">${error.message}</p>
        </div>`;
      return;
    }

    if (!preview.needsRepair) {
      renderRepairReport(preview, { heading: 'โครงสร้างทุกชีตตรงกับมาตรฐานอยู่แล้ว ไม่ต้องซ่อม', tone: 'ok' });
      return;
    }

    renderRepairReport(preview, {
      heading: `พบ ${preview.actions.length} ชีตที่ต้องซ่อม (ยังไม่ได้แก้ไขอะไร)`,
      tone: 'warn'
    });

    const dropped = (preview.sheets || []).some((sheet) => (sheet.droppedColumns || []).length);
    const ok = await askConfirm({
      title: 'ซ่อมบำรุงฐานข้อมูล',
      message: `จะจัดเรียงคอลัมน์ของ ${preview.actions.length} ชีตให้ตรงกับมาตรฐาน `
        + 'โดยย้ายข้อมูลตามชื่อคอลัมน์ ชีตที่ต้องเปลี่ยนโครงสร้างจะถูกสำรองไว้ก่อนเสมอ'
        + (dropped ? ' — มีคอลัมน์ที่ไม่อยู่ในมาตรฐานและจะหายไป ดูรายละเอียดในรายงานด้านหลัง' : '')
        + ' แนะนำให้สำรองไฟล์ Google Sheets ก่อนดำเนินการ',
      confirmLabel: 'ซ่อมเลย',
      danger: true,
      icon: 'fa-screwdriver-wrench'
    });
    if (!ok) return;

    els.syncReportBody.innerHTML = html`
      <div class="py-12 text-center text-gray-500">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto mb-3" aria-hidden="true"></div>
        <p class="text-sm font-medium">กำลังซ่อมบำรุงฐานข้อมูล…</p>
        <p class="text-2xs mt-1">ขั้นตอนนี้อาจใช้เวลาสักครู่ อย่าปิดหน้าต่าง</p>
      </div>`;

    try {
      const result = await apiCall('repairDatabase', {}, 'POST');
      renderRepairReport(result, {
        heading: result.verified ? 'ซ่อมเสร็จแล้ว โครงสร้างทุกชีตตรงกับมาตรฐาน' : 'ซ่อมแล้วแต่ยังมีชีตที่ไม่ผ่านการตรวจซ้ำ',
        tone: result.verified ? 'ok' : 'fail'
      });
      showToast(result.verified ? 'ซ่อมบำรุงฐานข้อมูลเรียบร้อย' : 'ซ่อมแล้วแต่ยังมีบางชีตไม่ผ่าน',
        result.verified ? 'success' : 'error');
      if (result.verified) await backendPull();
    } catch (error) {
      els.syncReportBody.innerHTML = html`
        <div class="border border-rose-200 bg-rose-50 rounded-xl p-4 text-sm text-rose-800">
          <p class="font-bold">ซ่อมไม่สำเร็จ</p>
          <p class="text-2xs mt-1">${error.message}</p>
          <p class="text-2xs mt-2">ข้อมูลเดิมยังอยู่ครบ ลองใหม่อีกครั้ง หรือใช้เมนู OptiCare › ซ่อมบำรุงฐานข้อมูล ในสเปรดชีตแทน</p>
        </div>`;
      showToast(`ซ่อมไม่สำเร็จ: ${error.message}`, 'error');
    }
  }

  /* ---------- จัดการผู้ใช้ระบบ ---------- */

  const ROLE_LABEL = {
    owner: 'เจ้าของร้าน', admin: 'ผู้ดูแลระบบ', optometrist: 'ทัศนมาตร',
    staff: 'พนักงานขาย', viewer: 'ผู้ชมข้อมูล'
  };
  const ROLE_STYLE = {
    owner: 'bg-purple-100 text-purple-800', admin: 'bg-blue-100 text-blue-800',
    optometrist: 'bg-emerald-100 text-emerald-800', staff: 'bg-amber-100 text-amber-800',
    viewer: 'bg-gray-100 text-gray-600'
  };

  /** รหัสผ่านสุ่มที่อ่านออกง่าย — ไม่มี 0/O/1/l/I ที่มักอ่านผิดตอนจดใส่กระดาษ */
  function suggestPassword() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const pick = (pool, count) => Array.from(
      { length: count },
      () => pool.charAt(Math.floor(Math.random() * pool.length))
    ).join('');
    return pick(letters, 8) + pick(digits, 3);
  }

  function resetUserForm() {
    els.userForm.reset();
    $('#user-id').value = '';
    $('#user-password').type = 'password';
    $('#user-password-label').textContent = '(บัญชีใหม่ต้องตั้ง)';
    const toggle = $('[data-action="toggle-password"][data-target="user-password"]');
    if (toggle) {
      toggle.setAttribute('aria-pressed', 'false');
      toggle.querySelector('i').className = 'fa-solid fa-eye text-xs';
    }
  }

  async function openUsersModal() {
    resetUserForm();
    els.usersList.innerHTML = html`<p class="text-xs text-gray-400 py-4 text-center">กำลังโหลดรายชื่อผู้ใช้…</p>`;
    openModal($('#modal-users'));

    try {
      const users = await apiCall('listUsers');
      renderUsersList(users);
    } catch (error) {
      els.usersList.innerHTML = html`
        <p class="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">${error.message}</p>`;
    }
  }

  function renderUsersList(users) {
    const me = state.session.user ? state.session.user.username : '';
    if (!users.length) {
      els.usersList.innerHTML = html`<p class="text-xs text-gray-400 py-4 text-center">ยังไม่มีผู้ใช้ในระบบ</p>`;
      return;
    }

    els.usersList.innerHTML = users.map((user) => html`
      <div class="flex items-center justify-between gap-2 border rounded-lg px-3 py-2 ${raw(user.active === false ? 'opacity-60 bg-gray-50' : '')}">
        <div class="min-w-0">
          <p class="text-xs font-semibold text-gray-800 truncate">
            ${user.displayName || user.username}
            ${user.username === me ? raw('<span class="text-2xs text-blue-600 font-normal">(คุณ)</span>') : ''}
          </p>
          <p class="text-2xs text-gray-500 truncate font-mono">${user.username}</p>
          ${user.mustChangePassword
            ? raw(html`<p class="text-2xs text-amber-700">ยังไม่ได้ตั้งรหัสผ่านของตัวเอง</p>`)
            : user.lastLoginAt
              ? raw(html`<p class="text-2xs text-gray-400">เข้าใช้ล่าสุด ${String(user.lastLoginAt).replace('T', ' ').slice(0, 16)}</p>`)
              : raw('<p class="text-2xs text-gray-400">ยังไม่เคยเข้าใช้งาน</p>')}
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="px-2 py-0.5 rounded text-2xs font-semibold ${raw(ROLE_STYLE[user.role] || 'bg-gray-100 text-gray-600')}">
            ${ROLE_LABEL[user.role] || user.role}
          </span>
          ${user.active === false
            ? raw(html`<span class="px-2 py-0.5 rounded text-2xs font-semibold bg-rose-100 text-rose-700">ปิดใช้งาน</span>`)
            : ''}
          ${can('saveUser') && user.username !== me
            ? raw(html`
                <button type="button" data-action="edit-user" data-id="${user.id}" data-username="${user.username}"
                        data-display="${user.displayName || ''}" data-role="${user.role}"
                        data-email="${user.email || ''}" data-note="${user.note || ''}"
                        class="p-1.5 text-blue-600 hover:bg-blue-50 rounded" aria-label="แก้ไข ${user.username}">
                  <i class="fa-solid fa-pen text-2xs" aria-hidden="true"></i>
                </button>
                <button type="button" data-action="disable-user" data-id="${user.id}" data-username="${user.username}"
                        class="p-1.5 text-rose-600 hover:bg-rose-50 rounded" aria-label="ปิดใช้งาน ${user.username}">
                  <i class="fa-solid fa-ban text-2xs" aria-hidden="true"></i>
                </button>`)
            : ''}
        </div>
      </div>`).join('');
  }

  async function saveUser(event) {
    event.preventDefault();
    if (!els.userForm.reportValidity()) return;

    const isNew = !$('#user-id').value;
    const password = $('#user-password').value;
    if (isNew && !password) {
      showToast('บัญชีใหม่ต้องตั้งรหัสผ่านเริ่มต้น — กดปุ่มสุ่มรหัสผ่านได้', 'error');
      $('#user-password').focus();
      return;
    }

    const record = {
      id: $('#user-id').value || undefined,
      username: $('#user-username').value.trim().toLowerCase(),
      displayName: $('#user-display').value.trim(),
      role: $('#user-role').value,
      email: $('#user-email').value.trim().toLowerCase(),
      note: $('#user-note').value.trim(),
      active: true
    };

    try {
      await apiCall('saveUser', { record, password }, 'POST');
      showToast(password
        ? `บันทึก ${record.username} แล้ว — แจ้งรหัสผ่านให้เจ้าตัว ระบบจะบังคับให้ตั้งรหัสใหม่ตอนเข้าครั้งแรก`
        : `บันทึกสิทธิ์ของ ${record.username} เรียบร้อย`);
      resetUserForm();
      renderUsersList(await apiCall('listUsers'));
    } catch (error) {
      showToast(`บันทึกไม่สำเร็จ: ${error.message}`, 'error');
    }
  }

  async function disableUser(id, username) {
    const ok = await askConfirm({
      title: 'ปิดใช้งานบัญชี',
      message: `ปิดใช้งาน ${username} ใช่หรือไม่? ผู้ใช้จะเข้าระบบไม่ได้ทันที แต่ประวัติการทำงานยังอยู่ครบ`,
      confirmLabel: 'ปิดใช้งาน',
      danger: true
    });
    if (!ok) return;

    try {
      await apiCall('deleteUser', { id }, 'POST');
      showToast(`ปิดใช้งาน ${username} แล้ว`, 'info');
      renderUsersList(await apiCall('listUsers'));
    } catch (error) {
      showToast(`ทำรายการไม่สำเร็จ: ${error.message}`, 'error');
    }
  }

  /* ---------- หน้าตั้งค่าการเชื่อมต่อ ---------- */

  function updateBackendUi() {
    const mode = state.backend.mode;
    const labels = {
      local: 'ข้อมูลในเครื่อง (Local)',
      sheet: 'Google Sheets — อ่านอย่างเดียว',
      api: `Apps Script API — อ่าน-เขียน`
    };
    const badges = {
      local: { text: 'ออฟไลน์', cls: 'bg-gray-100 text-gray-600' },
      sheet: { text: 'อ่านอย่างเดียว', cls: 'bg-amber-100 text-amber-700' },
      api: { text: 'อ่าน-เขียน', cls: 'bg-emerald-100 text-emerald-800' }
    };

    els.backendModeText.textContent = labels[mode];
    els.diagBadge.textContent = badges[mode].text;
    els.diagBadge.className = `px-2 py-0.5 rounded text-2xs font-semibold whitespace-nowrap ${badges[mode].cls}`;
    els.diagEnv.textContent = labels[mode];

    els.backendApiActions.classList.toggle('hidden', mode !== 'api');
    els.backendSheetActions.classList.toggle('hidden', mode !== 'sheet');
    ['sheet', 'api', 'local'].forEach((key) => {
      $(`#backend-hint-${key}`).classList.toggle('hidden', key !== mode);
    });
  }

  function openBackendSettings() {
    $$('input[name="backend-mode"]').forEach((input) => {
      input.checked = input.value === state.backend.mode;
    });
    $('#backend-url').value = state.backend.url || CONFIG.defaultBackendUrl || '';
    toggleBackendFields();
    openModal($('#modal-backend'));
  }

  function toggleBackendFields() {
    const selected = $('input[name="backend-mode"]:checked');
    els.backendApiFields.classList.toggle('hidden', !selected || selected.value !== 'api');
  }

  async function saveBackendSettings(event) {
    event.preventDefault();
    const selected = $('input[name="backend-mode"]:checked');
    const mode = selected ? selected.value : 'local';
    const url = $('#backend-url').value.trim();

    if (mode === 'api') {
      if (!url) {
        showToast('โหมด Apps Script API ต้องระบุ Web App URL', 'error');
        return;
      }
      if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
        showToast('Web App URL ต้องเป็นลิงก์ของ Apps Script ที่ลงท้ายด้วย /exec', 'error');
        return;
      }
    }

    const changed = mode !== state.backend.mode || url !== state.backend.url;
    state.backend = { mode, url, token: '' };
    persistBackendSettings();
    updateBackendUi();
    closeModal($('#modal-backend'));
    showToast(`เปลี่ยนโหมดเป็น "${{ local: 'ข้อมูลในเครื่อง', sheet: 'Google Sheets (อ่านอย่างเดียว)', api: 'Apps Script API' }[mode]}" แล้ว`);

    // เปลี่ยนปลายทางแล้วต้องยืนยันตัวตนใหม่กับเซิร์ฟเวอร์นั้น
    // และต้องทำด้วยเมื่อหน้าจอถูกล็อกอยู่หรือยังไม่มีเซสชัน ไม่งั้นผู้ใช้จะค้างที่หน้าล็อก
    // ทั้งที่เพิ่งตั้งค่าเสร็จ (เช่นกดบันทึกซ้ำโดยที่ค่าไม่เปลี่ยน)
    if (changed || state.screenLocked || (mode === 'api' && !state.session.token)) {
      clearSession();
      // ผู้ใช้เพิ่งตั้งค่าเองอยู่หน้าจอ จึงไม่ควรเจอหน้าล็อกทันทีหลังกดบันทึก
      setScreenLocked(false);
      renderSession();
      await initAuth();
    }
  }

  /** ทดสอบว่า Web App ตอบสนองและตั้งค่าระบบล็อกอินไว้แล้วหรือยัง (ยังไม่ต้องล็อกอิน) */
  async function testBackendConnection() {
    const url = $('#backend-url').value.trim();
    if (!url) {
      showToast('กรุณากรอก Web App URL ก่อนทดสอบ', 'error');
      return;
    }

    // ทดสอบเป็นการลองชั่วคราวเท่านั้น ต้องคืนค่าเดิมเสมอไม่ว่าจะสำเร็จหรือไม่
    // ถ้าปล่อยให้ค่าที่ลองไว้ค้างอยู่ ตอนกดบันทึกระบบจะเห็นว่า "ไม่มีอะไรเปลี่ยน"
    // แล้วข้ามขั้นตอนเข้าสู่ระบบใหม่ ทำให้ผู้ใช้ค้างอยู่ที่หน้าล็อกทั้งที่ตั้งค่าถูกแล้ว
    const previous = { ...state.backend };
    state.backend = { ...state.backend, mode: 'api', url };
    showToast('กำลังทดสอบการเชื่อมต่อ…', 'info');

    try {
      const status = await apiCall('authStatus');
      if (!status.ready) {
        showToast('เชื่อมต่อเซิร์ฟเวอร์ได้ แต่ยังไม่มีบัญชีผู้ใช้ — เปิดสเปรดชีตแล้วใช้เมนู OptiCare › สร้างบัญชีผู้ดูแลคนแรก', 'error');
        return;
      }
      showToast(`เชื่อมต่อสำเร็จ — มีบัญชีที่ใช้งานได้ ${status.accountCount} บัญชี · กดบันทึกเพื่อใช้งาน`);
    } catch (error) {
      showToast(`เชื่อมต่อไม่สำเร็จ: ${error.message}`, 'error');
    } finally {
      state.backend = previous;
    }
  }

  async function resetData() {
    const ok = await askConfirm({
      title: 'ล้างข้อมูลในเครื่อง',
      message: 'ลบข้อมูลลูกค้า สินค้า และออเดอร์ทั้งหมดที่บันทึกไว้ในเบราว์เซอร์นี้ แล้วเริ่มต้นด้วยข้อมูลตัวอย่างใช่หรือไม่?',
      confirmLabel: 'ล้างข้อมูล',
      danger: true
    });
    if (!ok) return;

    try {
      if (state.storageAvailable) localStorage.removeItem(CONFIG.storageKey);
    } catch (error) {
      console.warn('ลบข้อมูลไม่สำเร็จ', error);
    }
    loadSeed();
    persist();
    renderAll();
    showToast('ล้างข้อมูลและกลับสู่ข้อมูลตัวอย่างเรียบร้อยแล้ว', 'info');
  }

  /* ==========================================================================
   * 13. LENS ADVISOR — เอนจินวิเคราะห์ค่าสายตาแบบออฟไลน์
   * ========================================================================== */

  /** อ่านข้อมูลจากฟอร์มผู้ช่วยแนะนำเลนส์ */
  function readConsultInput() {
    return {
      odSph: toNum($('#ai-od-sph').value, NaN),
      osSph: toNum($('#ai-os-sph').value, NaN),
      odCyl: toNum($('#ai-od-cyl').value, 0),
      osCyl: toNum($('#ai-os-cyl').value, 0),
      odAx: clamp(toInt($('#ai-od-ax').value, 0), 0, 180),
      osAx: clamp(toInt($('#ai-os-ax').value, 0), 0, 180),
      add: toNum($('#ai-add').value, 0),
      age: toInt($('#ai-age').value, 0),
      faceShape: $('#ai-face-shape').value,
      budget: toNum($('#ai-budget').value, 0),
      lifestyle: {
        computer: $('#ls-computer').checked,
        outdoor: $('#ls-outdoor').checked,
        drive: $('#ls-drive').checked,
        sport: $('#ls-sport').checked
      }
    };
  }

  /**
   * เอนจินวิเคราะห์ค่าสายตา — ใช้ชุดกฎทัศนมาตรศาสตร์ ประมวลผลในเบราว์เซอร์ทั้งหมด
   * ทำงานได้เสมอแม้ไม่มีอินเทอร์เน็ต
   * @returns {object} รายงานคำแนะนำสำหรับนำไปแสดงผล
   */
  function analyzeConsultation(input) {
    const { odSph, osSph, odCyl, osCyl, odAx, osAx, add, age, faceShape, lifestyle } = input;
    const maxAbsSph = Math.max(Math.abs(odSph), Math.abs(osSph));
    const maxAbsCyl = Math.max(Math.abs(odCyl), Math.abs(osCyl));
    // วัดความต่างของสองตาจาก Spherical Equivalent ตามหลักปฏิบัติทางคลินิก
    const anisoValue = anisometropia(odSph, odCyl, osSph, osCyl);
    const seOd = sphericalEquivalent(odSph, odCyl);
    const seOs = sphericalEquivalent(osSph, osCyl);
    const diagnosis = [];

    /* --- จำแนกภาวะสายตาจาก Spherical Equivalent ทีละข้าง ---
       ใช้ SE แทน SPH ดิบ เพราะ SE คือตำแหน่งวงกลมความสับสนน้อยที่สุด (circle of least confusion)
       จึงสะท้อนภาวะสายตาโดยรวมของตาข้างนั้นได้ตรงกว่าเมื่อมีสายตาเอียงร่วมด้วย */
    const gradeSphere = (se) => {
      if (se <= CLINICAL_THRESHOLDS.highMyopia) return { code: 'HM', thai: 'สายตาสั้นระดับสูง', eng: 'High myopia' };
      if (se <= CLINICAL_THRESHOLDS.moderateMyopia) return { code: 'MM', thai: 'สายตาสั้นระดับปานกลาง', eng: 'Moderate myopia' };
      if (se <= -0.50) return { code: 'LM', thai: 'สายตาสั้นระดับเล็กน้อย', eng: 'Low myopia' };
      if (se >= CLINICAL_THRESHOLDS.highHyperopia) return { code: 'HH', thai: 'สายตายาวระดับสูง', eng: 'High hyperopia' };
      if (se >= 2.00) return { code: 'MH', thai: 'สายตายาวระดับปานกลาง', eng: 'Moderate hyperopia' };
      if (se >= 0.50) return { code: 'LH', thai: 'สายตายาวระดับเล็กน้อย', eng: 'Low hyperopia' };
      return { code: 'EM', thai: 'สายตาปกติ', eng: 'Emmetropia' };
    };

    const gradeOd = gradeSphere(seOd);
    const gradeOs = gradeSphere(seOs);
    const astigClassOd = astigmatismClass(odSph, odCyl);
    const astigClassOs = astigmatismClass(osSph, osCyl);

    /* SE ที่ใกล้ศูนย์ไม่ได้แปลว่าสายตาปกติเสมอไป — สายตาเอียงชนิดผสมทำให้แกนหนึ่งสั้น
       อีกแกนยาว ค่าเฉลี่ยจึงหักล้างกันจนเหลือเกือบศูนย์ ทั้งที่ตายังมองไม่ชัด
       กรณีนี้ต้องรายงานว่า "ค่าเฉลี่ยทรงกลมใกล้ศูนย์" ไม่ใช่ "สายตาปกติ" */
    const bothEmmetropic = gradeOd.code === 'EM' && gradeOs.code === 'EM';
    const maskedByCylinder = bothEmmetropic && maxAbsCyl >= 0.50;

    if (maskedByCylinder) {
      diagnosis.push(`ค่าเฉลี่ยทรงกลมใกล้ศูนย์ (SE ${formatDiopter(seOd)} / ${formatDiopter(seOs)} D) `
        + 'แต่ความผิดปกติอยู่ที่สายตาเอียงเป็นหลัก');
    } else if (gradeOd.code === gradeOs.code) {
      diagnosis.push(`${gradeOd.thai}ทั้งสองข้าง (${gradeOd.eng}, SE ${formatDiopter(seOd)} / ${formatDiopter(seOs)} D)`);
    } else {
      diagnosis.push(`OD ${gradeOd.thai} (SE ${formatDiopter(seOd)} D) · OS ${gradeOs.thai} (SE ${formatDiopter(seOs)} D)`);
    }

    // ตาข้างหนึ่งสั้น อีกข้างยาว — ต่างกันคนละชนิด ไม่ใช่แค่ต่างกำลัง
    if ((seOd < -0.50 && seOs > 0.50) || (seOd > 0.50 && seOs < -0.50)) {
      diagnosis.push('ตาสองข้างเป็นคนละชนิด (Antimetropia) — การปรับตัวยากกว่าสายตาสั้น/ยาวทั้งสองข้าง');
    }

    // --- สายตาเอียง: ระบุทั้งระดับ ชนิดตามโฟกัส และทิศทางแกน ---
    if (maxAbsCyl > 0) {
      const level = maxAbsCyl >= CLINICAL_THRESHOLDS.highAstigmatism ? 'ระดับสูง' : maxAbsCyl >= 1.00 ? 'ระดับปานกลาง' : 'ระดับเล็กน้อย';
      const classes = [astigClassOd, astigClassOs].filter(Boolean);
      const sameClass = classes.length === 2 && classes[0].code === classes[1].code;
      diagnosis.push(`สายตาเอียง${level} ${formatDiopter(-maxAbsCyl)} D`
        + (classes.length ? ` — ${sameClass ? classes[0].thai : classes.map((c) => c.thai).join(' / ')}` : ''));

      const axisTypes = [astigmatismType(odAx, odCyl), astigmatismType(osAx, osCyl)].filter(Boolean);
      if (axisTypes.some((t) => t.code === 'OBL')) {
        diagnosis.push('มีแกนเฉียง (Oblique) — ปรับตัวยากกว่าแกนตรง ควรอธิบายลูกค้าล่วงหน้า');
      }
    }

    // --- สายตายาวตามอายุ ---
    const amplitude = hofstetterAmplitude(age);
    const addReference = tentativeAdd(age, 40);
    if (add > 0) {
      diagnosis.push(`สายตายาวตามอายุ (Presbyopia) ADD ${formatDiopter(add)} D`);
    }

    // --- ความต่างของสองตาและผลที่ตามมา ---
    const imbalance = verticalImbalance(odSph, odCyl, osSph, osCyl, 8);
    const aniseikonia = aniseikoniaEstimate(anisoValue);
    if (anisoValue >= CLINICAL_THRESHOLDS.anisometropia) {
      diagnosis.push(`ค่าสายตาสองข้างต่างกัน ${anisoValue.toFixed(2)} D (Anisometropia) `
        + `— ประเมินภาพสองข้างต่างขนาดราว ${aniseikonia.percent}%`);
    }

    // --- ดัชนีหักเหและโครงสร้างเลนส์ ---
    const seForIndex = maxAbsSph + maxAbsCyl / 2;
    let index = '1.56 (Standard Index)';
    let design = 'Spherical / Aspheric (โครงสร้างมาตรฐาน)';

    if (seForIndex >= 6) {
      index = '1.74 (Ultra High Index — ย่อบางสูงสุด)';
      design = 'Double Aspheric (ลดความโค้งสองด้าน ลดภาพบิดเบือนขอบเลนส์)';
    } else if (seForIndex >= 4) {
      index = '1.67 (Extra High Index — ย่อบางพิเศษ)';
      design = 'Aspheric (ภาพสมจริงและเลนส์บางลง)';
    } else if (seForIndex >= 2 || maxAbsCyl >= 1.5) {
      index = '1.60 (High Index — ย่อบาง เนื้อเหนียว)';
      design = 'Aspheric (เนื้อเลนส์เหนียว เหมาะกับกรอบเซาะร่อง/กรอบเจาะ)';
    }

    const type = add > 0
      ? 'เลนส์โปรเกรสซีฟ (Progressive / Freeform)'
      : 'เลนส์ชั้นเดียว (Single Vision)';

    const coatings = [];
    if (lifestyle.computer) coatings.push('เลนส์กรองแสงสีฟ้า (Blue Control) ลดความล้าตาจากหน้าจอ');
    if (lifestyle.outdoor) coatings.push('เลนส์เปลี่ยนสีอัตโนมัติ (Photochromic) ป้องกัน UV 100%');
    if (lifestyle.drive) coatings.push('โค้ทติ้งขับรถกลางคืน (DriveSafe) ลดแสงฟุ้งจากไฟหน้ารถ');
    if (lifestyle.sport) coatings.push('วัสดุกันกระแทก Polycarbonate/Trivex แตกยาก ปลอดภัยสูง');
    if (!coatings.length) coatings.push('มัลติโค้ตมาตรฐาน (Multicoat) ลดแสงสะท้อนและกันรอยขีดข่วน');

    // --- คำแนะนำทรงกรอบตามรูปหน้า ---
    const frameInfo = FRAME_ADVICE[faceShape] || null;
    const sizeTips = maxAbsSph >= 5
      ? 'เลือกกรอบขนาดกะทัดรัด หลีกเลี่ยง Oversize เพื่อลดความหนาขอบเลนส์และ Prismatic Effect'
      : add > 0
        ? 'เลือกกรอบที่มีความสูง (B-size) ไม่ต่ำกว่า 30 มม. และมีแป้นจมูกปรับได้ เพื่อรองรับเลนส์โปรเกรสซีฟ'
        : 'เลือกขนาดกรอบให้พอดีความกว้างใบหน้า ขาแว่นไม่บีบขมับ';

    const frame = {
      shapes: frameInfo ? frameInfo.shapes : ['ยังไม่ได้ระบุรูปหน้า — แนะนำให้บันทึกรูปหน้าลูกค้าเพื่อคำแนะนำที่แม่นยำขึ้น'],
      avoid: frameInfo ? frameInfo.avoid : [],
      material: maxAbsSph >= 5 ? 'อะซิเตทขอบหนา หรือ TR-90 เต็มกรอบ เพื่อพรางความหนาของเลนส์' : 'ไทเทเนียมหรือ TR-90 น้ำหนักเบา ใส่สบายตลอดวัน',
      sizeTips,
      why: frameInfo ? frameInfo.why : ''
    };

    // --- บทพูดแนะนำการขาย ---
    const hook = lifestyle.computer ? 'ช่วยถนอมสายตาตอนทำงานหน้าคอมพิวเตอร์'
      : lifestyle.outdoor ? 'ช่วยให้สบายตาเวลาออกแดดด้วยเลนส์เปลี่ยนสี'
        : lifestyle.drive ? 'ช่วยให้ขับรถกลางคืนได้อย่างมั่นใจขึ้น'
          : 'ให้ภาพคมชัดเป็นธรรมชาติที่สุด';
    const indexShort = index.split(' ')[0];

    const salesScript = add > 0
      ? `คุณลูกค้าครับ จากค่าสายตาที่เปลี่ยนไปทั้งระยะไกลและระยะอ่านหนังสือ ผมแนะนำเป็น${type} `
        + `จะช่วยให้ไม่ต้องถอดแว่นเข้าออกหรือพกแว่นสองอัน มองชัดต่อเนื่องตั้งแต่ขับรถจนถึงดูมือถือ `
        + `โดยเลือกเนื้อเลนส์ย่อบางระดับ ${indexShort} เพื่อให้น้ำหนักเบา ใส่สบายตลอดวัน และยัง${hook}ด้วยครับ`
      : `จากค่าสายตาของคุณลูกค้า${maxAbsCyl > 0 ? 'ที่มีสายตาเอียงร่วมด้วย ' : ' '}`
        + `ผมแนะนำโครงสร้างเลนส์แบบ ${design.split(' ')[0]} ร่วมกับเนื้อเลนส์ย่อบาง ${indexShort} ครับ `
        + `จะช่วยลดภาพบิดเบี้ยวบริเวณขอบเลนส์ ทำให้แว่นดูบางเรียบร้อย ไม่ล้นกรอบ ปรับตัวง่าย และยัง${hook}ครับ`;

    // --- ข้อควรระวังในการประกอบแว่น ---
    let dispensingAdvice;
    if (maxAbsSph >= 5) {
      dispensingAdvice = 'ค่าสายตาสูง ควรวัด PD และ Fitting Height อย่างแม่นยำเป็นพิเศษเพื่อลด Prismatic Effect '
        + 'และเลือกกรอบขนาดเล็กเพื่อลดความหนาขอบเลนส์';
    } else if (add > 0) {
      dispensingAdvice = 'สำหรับเลนส์โปรเกรสซีฟ ต้องวัด Segment Height ขณะลูกค้านั่งในท่าปกติ '
        + 'และเลือกกรอบที่มีแป้นจมูกปรับได้ พร้อมอธิบายช่วงปรับตัว 1-2 สัปดาห์ให้ลูกค้าทราบ';
    } else if (lifestyle.sport) {
      dispensingAdvice = 'กรอบทรงโค้งรับใบหน้า (Wrap-around) ต้องชดเชยค่า Base Curve และมุมกรอบ '
        + 'เพื่อป้องกันอาการภาพว่ายน้ำ (Swim Effect)';
    } else {
      dispensingAdvice = 'ดัดกรอบให้เข้ากับโครงหน้าก่อนจุดศูนย์กลางรูม่านตาเสมอ '
        + 'โดยคำนึงถึงมุมเท (Pantoscopic Tilt) และความโค้งหน้าแว่น (Face Form Angle)';
    }
    if (anisoValue >= CLINICAL_THRESHOLDS.anisometropia) {
      dispensingAdvice += ' และเนื่องจากค่าสายตาสองข้างต่างกันมาก ควรพิจารณาใช้ดัชนีหักเหต่างกันในแต่ละข้างเพื่อให้ความหนาเลนส์ใกล้เคียงกัน';
    }

    return {
      input,
      metrics: {
        seOd,
        seOs,
        maxAbsSph,
        maxAbsCyl,
        sphericalEquivalent: seForIndex,
        anisometropia: anisoValue,
        gradeOd,
        gradeOs,
        astigOd: astigmatismType(input.odAx ?? 0, odCyl),
        astigOs: astigmatismType(input.osAx ?? 0, osCyl),
        astigClassOd,
        astigClassOs,
        plusCylOd: transpose(odSph, odCyl, input.odAx ?? 0),
        plusCylOs: transpose(osSph, osCyl, input.osAx ?? 0),
        amplitude,
        addReference,
        nearRange: nearRange(add, age),
        imbalance,
        aniseikonia,
        baseCurveOd: vogelBaseCurve(seOd),
        baseCurveOs: vogelBaseCurve(seOs)
      },
      reasoning: buildClinicalReasoning({
        input, seOd, seOs, maxAbsSph, maxAbsCyl, anisoValue,
        amplitude, addReference, imbalance, aniseikonia, index
      }),
      diagnosis: diagnosis.join(' · '),
      lens: { type, design, index, coatings },
      frame,
      salesScript,
      dispensingAdvice,
      followUp: 'แนะนำให้ลูกค้าตรวจวัดสายตาซ้ำทุก 12 เดือน หรือเร็วกว่านั้นหากมีอาการตาล้า ปวดศีรษะ หรือมองเห็นไม่ชัด'
    };
  }

  /**
   * สร้างเหตุผลเชิงวิชาการประกอบคำแนะนำ — แต่ละข้ออ้างอิงสูตรหรือเกณฑ์ที่ตรวจสอบได้
   * แยกเป็นฟังก์ชันต่างหากเพื่อให้แก้เกณฑ์ทางคลินิกได้ที่เดียวโดยไม่ต้องแตะตรรกะการเลือกเลนส์
   * @returns {Array<{topic, finding, basis, action}>}
   */
  function buildClinicalReasoning(ctx) {
    const { input, seOd, seOs, maxAbsSph, maxAbsCyl, anisoValue,
      amplitude, addReference, imbalance, aniseikonia, index } = ctx;
    const { add, age, odSph, odCyl, osSph, osCyl, lifestyle } = input;
    const notes = [];

    /* ---------- กำลังเพ่งและ ADD ---------- */
    if (amplitude) {
      const expected = addReference;
      const withinRange = add > 0 && expected
        && Math.abs(add - expected.add) <= 0.75;

      notes.push({
        topic: 'กำลังเพ่งตามอายุ (Accommodative amplitude)',
        finding: `อายุ ${age} ปี คาดหมายกำลังเพ่งราว ${amplitude.min.toFixed(2)}–${amplitude.max.toFixed(2)} D `
          + `(ค่าเฉลี่ย ${amplitude.avg.toFixed(2)} D)`,
        basis: 'สูตร Hofstetter: ต่ำสุด = 15 − 0.25×อายุ · เฉลี่ย = 18.5 − 0.30×อายุ · สูงสุด = 25 − 0.40×อายุ',
        action: amplitude.min < 3 && add === 0 && age >= 40
          ? 'กำลังเพ่งเหลือน้อยแล้วแต่ยังไม่ได้ให้ ADD — ควรตรวจการมองใกล้เพิ่มเติม'
          : ''
      });

      if (expected) {
        notes.push({
          topic: 'ความเหมาะสมของค่า ADD',
          finding: add > 0
            ? `ADD ที่ให้ ${formatDiopter(add)} D · ค่าอ้างอิงตามอายุที่ระยะ ${expected.workingDistanceCm} ซม. ≈ ${formatDiopter(expected.add)} D`
            : `ยังไม่ได้ให้ ADD · ค่าอ้างอิงตามอายุที่ระยะ ${expected.workingDistanceCm} ซม. ≈ ${formatDiopter(expected.add)} D`,
          basis: `หลักสงวนกำลังเพ่งครึ่งหนึ่ง: ADD = ความต้องการที่ระยะทำงาน (${expected.demand.toFixed(2)} D) `
            + `− กำลังเพ่งที่มี ÷ 2 (${expected.reserve.toFixed(2)} D)`,
          action: add > 0 && !withinRange
            ? (add > expected.add
              ? 'ADD สูงกว่าค่าอ้างอิง — ระยะมองใกล้จะสั้นลง ตรวจสอบว่าลูกค้าทำงานระยะใกล้กว่า 40 ซม. จริงหรือไม่'
              : 'ADD ต่ำกว่าค่าอ้างอิง — อาจไม่พอสำหรับงานระยะใกล้ ควรทดสอบการอ่านจริงก่อนสั่งตัด')
            : ''
        });
      }
    }

    /* ---------- ปริซึมและความสมดุลสองตา ---------- */
    if (anisoValue >= 1.0) {
      notes.push({
        topic: 'ปริซึมแนวดิ่งขณะอ่านหนังสือ (Vertical imbalance)',
        finding: `มองต่ำกว่าจุดศูนย์กลางเลนส์ ${imbalance.dropMm} มม. เกิดปริซึม OD ${imbalance.prismOd.toFixed(2)}Δ · `
          + `OS ${imbalance.prismOs.toFixed(2)}Δ · ต่างกัน ${imbalance.imbalance.toFixed(2)}Δ`,
        basis: 'กฎของ Prentice: Δ = c × F เมื่อ c คือระยะจากจุดศูนย์กลางเลนส์ (ซม.)',
        action: imbalance.significant
          ? 'เกินเกณฑ์ 1.00Δ ที่มักทำให้เมื่อยล้าหรือเห็นภาพซ้อน — พิจารณา Slab-off, จุดศูนย์กลางแยกสำหรับอ่าน '
            + 'หรือแยกแว่นอ่านหนังสือต่างหาก'
          : 'ยังอยู่ในเกณฑ์ที่ผู้ใช้ส่วนใหญ่ปรับตัวได้'
      });

      notes.push({
        topic: 'ภาพสองข้างต่างขนาด (Aniseikonia)',
        finding: `ความต่างของกำลัง ${anisoValue.toFixed(2)} D ประเมินขนาดภาพต่างกันราว ${aniseikonia.percent}%`,
        basis: 'ค่าประมาณทางคลินิก ~1.5% ต่อความต่าง 1.00 D ของกำลังแว่น',
        action: aniseikonia.level === 'high'
          ? 'เกิน 5% มักรวมภาพสองตาไม่ได้ — คอนแทคเลนส์ลดปัญหานี้ได้มากเพราะอยู่ชิดกระจกตา'
          : aniseikonia.level === 'moderate'
            ? 'อยู่ช่วง 3–5% ที่เริ่มมีอาการ — ควรนัดติดตามหลังใส่ 1–2 สัปดาห์'
            : 'ต่ำกว่า 3% โดยทั่วไปปรับตัวได้'
      });
    }

    /* ---------- ระยะ Vertex ---------- */
    if (maxAbsSph >= CLINICAL_THRESHOLDS.vertexCriticalPower) {
      const powerOd = seOd;
      const powerOs = seOs;
      notes.push({
        topic: 'การชดเชยระยะ Vertex',
        finding: `ที่ระยะแว่น 12 มม. กำลัง OD ${formatDiopter(powerOd)} D เทียบเท่า `
          + `${formatDiopter(vertexCompensate(powerOd, 12))} D ที่ผิวกระจกตา · `
          + `OS ${formatDiopter(powerOs)} → ${formatDiopter(vertexCompensate(powerOs, 12))} D`,
        basis: "F′ = F / (1 − x·F) เมื่อ x คือระยะที่เลนส์ขยับเข้าหาตา (เมตร)",
        action: 'ใช้ตัวเลขชุดหลังเมื่อแปลงไปสั่งคอนแทคเลนส์ และวัดระยะ Vertex จริงถ้ากรอบชิด/ห่างกว่าปกติ'
      });
    }

    /* ---------- ความคลาดสีจากค่า Abbe ---------- */
    const material = LENS_MATERIALS.find((m) => String(index).indexOf(String(m.index)) !== -1);
    if (material && maxAbsSph >= 3) {
      const tca = chromaticAberration(maxAbsSph, material.abbe, 10);
      notes.push({
        topic: 'ความคลาดสีตามขวาง (Transverse chromatic aberration)',
        finding: `วัสดุที่แนะนำมีค่า Abbe ${material.abbe} · มองห่างจากศูนย์กลาง 10 มม. เกิดขอบสีราว ${tca.toFixed(2)}Δ`,
        basis: 'TCA = ปริซึม ณ จุดที่มอง ÷ ค่า Abbe · เกิน 0.10Δ เริ่มสังเกตเห็น',
        action: tca > 0.10
          ? 'ลูกค้าอาจเห็นขอบสีเวลามองเฉียง — ถ้าไวต่ออาการนี้ให้ลดดัชนีหักเหลงหนึ่งขั้นแลกกับเลนส์หนาขึ้นเล็กน้อย'
          : 'อยู่ในระดับที่แทบไม่สังเกตเห็น'
      });
    }

    /* ---------- ความโค้งหน้าเลนส์กับกรอบ ---------- */
    if (lifestyle.sport || maxAbsSph >= 4) {
      notes.push({
        topic: 'ความโค้งหน้าเลนส์ (Base curve)',
        finding: `ค่าที่เหมาะสมโดยประมาณ OD ${vogelBaseCurve(seOd).toFixed(2)} D · OS ${vogelBaseCurve(seOs).toFixed(2)} D`,
        basis: 'สูตรประมาณของ Vogel: กำลังบวก BC = SE + 6.00 · กำลังลบ BC = SE/2 + 6.00',
        action: lifestyle.sport
          ? 'กรอบทรงโค้งรับหน้า (Wrap) มีความโค้งสูงกว่าค่านี้มาก ต้องสั่งเลนส์แบบชดเชยมุมกรอบ '
            + 'ไม่งั้นจะเกิดกำลังคลาดเคลื่อนและอาการภาพว่ายน้ำ'
          : 'เลือกกรอบที่ความโค้งใกล้เคียงค่านี้ จะได้ภาพคมชัดถึงขอบเลนส์'
      });
    }

    /* ---------- แสงสีฟ้า: ระบุระดับหลักฐานตามความเป็นจริง ---------- */
    if (lifestyle.computer) {
      notes.push({
        topic: 'อาการล้าตาจากจอ (Digital eye strain)',
        finding: 'ลูกค้าทำงานหน้าจอเป็นหลัก',
        basis: 'งานทบทวนวรรณกรรมเชิงระบบหลายฉบับสรุปตรงกันว่า หลักฐานปัจจุบัน'
          + 'ยังไม่เพียงพอที่จะบอกว่าเลนส์กรองแสงสีฟ้าช่วยลดอาการล้าตาได้ '
          + 'สาเหตุหลักที่มีหลักฐานรองรับคืออัตราการกะพริบตาที่ลดลงและภาระการเพ่งค้างนาน',
        action: 'แนะนำกฎ 20-20-20 (ทุก 20 นาที มองไกล 20 ฟุต นาน 20 วินาที) และตรวจว่าค่าสายตาระยะกลางเหมาะสม '
          + 'ส่วนเลนส์กรองแสงสีฟ้าเสนอเป็นทางเลือกเพื่อความสบายตา ไม่ควรขายในฐานะการรักษา'
      });
    }

    /* ---------- ความก้าวหน้าของสายตาสั้นในเด็ก ---------- */
    if (age > 0 && age <= 18 && Math.min(seOd, seOs) <= -0.75) {
      notes.push({
        topic: 'การชะลอสายตาสั้นในเด็ก (Myopia control)',
        finding: `อายุ ${age} ปี · SE ต่ำสุด ${formatDiopter(Math.min(seOd, seOs))} D`,
        basis: 'สายตาสั้นที่เริ่มตั้งแต่อายุน้อยมีแนวโน้มเพิ่มขึ้นต่อเนื่องจนโครงสร้างตาคงที่ '
          + 'และสายตาสั้นระดับสูงสัมพันธ์กับความเสี่ยงโรคจอประสาทตาในระยะยาว',
        action: 'ควรวัดสายตาซ้ำทุก 6 เดือนเพื่อดูอัตราการเปลี่ยนแปลง และส่งปรึกษาจักษุแพทย์/ทัศนมาตรเรื่องแนวทางชะลอสายตาสั้น '
          + 'แนะนำกิจกรรมกลางแจ้งอย่างน้อยวันละ 2 ชั่วโมง'
      });
    }

    /* ---------- สายตาเอียงที่ยังไม่ได้แก้ ---------- */
    if (maxAbsCyl >= 0.75) {
      const blur = round2(maxAbsCyl / 2);
      notes.push({
        topic: 'ผลของสายตาเอียงต่อความคมชัด',
        finding: `CYL สูงสุด ${formatDiopter(-maxAbsCyl)} D — ถ้าไม่แก้ จะเหลือความพร่ามัวเทียบเท่า ${formatDiopter(-blur)} D`,
        basis: 'เมื่อไม่แก้สายตาเอียง จุดโฟกัสที่ดีที่สุดคือวงกลมความสับสนน้อยที่สุด ซึ่งห่างจากแต่ละแกนครึ่งหนึ่งของ CYL',
        action: maxAbsCyl >= CLINICAL_THRESHOLDS.highAstigmatism
          ? 'ค่าเอียงสูง ต้องกำหนดแกนให้แม่นยำ ความคลาดแกนเพียง 5° ทำให้ประสิทธิภาพการแก้ลดลงอย่างสังเกตได้'
          : 'ควรแก้สายตาเอียงให้ครบเพื่อความคมชัดสูงสุด'
      });
    }

    return notes;
  }

  /** ค้นหาสินค้าในคลังที่สอดคล้องกับดัชนีหักเห/โค้ทติ้งที่แนะนำ */
  function matchStock(report) {
    const keywords = [];
    const indexMatch = String(report.lens.index).match(/1\.\d{2}/);
    if (indexMatch) keywords.push(indexMatch[0]);
    if (/progressive|โปรเกรสซีฟ/i.test(report.lens.type)) keywords.push('progressive', 'โปรเกรสซีฟ');
    report.lens.coatings.forEach((coating) => {
      if (/blue/i.test(coating) || /แสงสีฟ้า/.test(coating)) keywords.push('blue');
      if (/photochromic|เปลี่ยนสี/i.test(coating)) keywords.push('photo', 'transition');
    });

    if (!keywords.length) return [];
    return state.products
      .filter((product) => product.stock > 0 && (product.category === 'Lens' || product.category === 'Frame'))
      .filter((product) => keywords.some((keyword) => product.name.toLowerCase().includes(keyword.toLowerCase())))
      .slice(0, 5);
  }

  /** ตารางค่าที่คำนวณได้ทางคลินิกในหน้าผู้ช่วยแนะนำเลนส์ */
  function renderConsultClinical(report) {
    const { input, metrics } = report;

    els.aiClinicalBody.innerHTML = [
      ['OD (ขวา)', input.odSph, input.odCyl, input.odAx, metrics.seOd, metrics.astigOd, metrics.astigClassOd, metrics.plusCylOd, metrics.gradeOd],
      ['OS (ซ้าย)', input.osSph, input.osCyl, input.osAx, metrics.seOs, metrics.astigOs, metrics.astigClassOs, metrics.plusCylOs, metrics.gradeOs]
    ].map(([label, sph, cyl, ax, se, astig, astigClass, plusCyl, grade]) => html`
      <tr>
        <th scope="row" class="py-1.5 px-2 border font-bold bg-gray-50">${label}</th>
        <td class="py-1.5 px-2 border font-mono">${formatDiopter(sph)} ${formatDiopter(cyl)} × ${ax}°</td>
        <td class="py-1.5 px-2 border font-semibold">
          ${formatDiopter(se)} D
          ${grade ? raw(html`<span class="block font-normal text-gray-500">${grade.thai}</span>`) : ''}
        </td>
        <td class="py-1.5 px-2 border">
          ${astig ? `${astig.code} · ${astig.label}` : '—'}
          ${astigClass ? raw(html`<span class="block text-gray-500">${astigClass.code} · ${astigClass.label}</span>`) : ''}
        </td>
        <td class="py-1.5 px-2 border font-mono">
          ${cyl ? `${formatDiopter(plusCyl.sph)} ${formatDiopter(plusCyl.cyl)} × ${plusCyl.ax}°` : '—'}
        </td>
      </tr>`).join('');

    const notes = [
      `<strong>Anisometropia:</strong> ${metrics.anisometropia.toFixed(2)} D `
        + (metrics.anisometropia >= CLINICAL_THRESHOLDS.anisometropia
          ? '(เกินเกณฑ์ 2.00 D — ต้องระวัง Prismatic imbalance)'
          : '(อยู่ในเกณฑ์ปกติ)'),
      `<strong>Spherical Equivalent ที่ใช้เลือกดัชนีหักเห:</strong> ${metrics.sphericalEquivalent.toFixed(2)} D `
        + `(คำนวณจาก |SPH| สูงสุด ${metrics.maxAbsSph.toFixed(2)} + |CYL| สูงสุด ${metrics.maxAbsCyl.toFixed(2)} ÷ 2)`
    ];

    if (metrics.maxAbsSph >= CLINICAL_THRESHOLDS.vertexCriticalPower) {
      const asContactLens = vertexCompensate(-metrics.maxAbsSph, 12);
      notes.push(`<strong>การชดเชยระยะ Vertex:</strong> กำลังเลนส์ ${formatDiopter(-metrics.maxAbsSph)} D ที่ระยะ 12 มม. `
        + `เทียบเท่าประมาณ ${formatDiopter(asContactLens)} D ที่ผิวกระจกตา (สำหรับเทียบกับคอนแทคเลนส์)`);
    }
    if (metrics.nearRange) {
      notes.push(`<strong>ช่วงระยะที่มองชัดผ่านโซนใกล้:</strong> ประมาณ `
        + `${metrics.nearRange.nearCm}–${metrics.nearRange.farCm} ซม. `
        + `(ขอบไกล = 100 ÷ ADD · ขอบใกล้ = 100 ÷ (ADD + กำลังเพ่งที่ยังใช้ได้ ${metrics.nearRange.usableAmplitude.toFixed(2)} D))`);
    }
    if (metrics.baseCurveOd || metrics.baseCurveOs) {
      notes.push(`<strong>ความโค้งหน้าเลนส์ที่เหมาะสม (Vogel):</strong> `
        + `OD ${metrics.baseCurveOd.toFixed(2)} D · OS ${metrics.baseCurveOs.toFixed(2)} D`);
    }

    els.aiClinicalNotes.innerHTML = notes
      .map((note) => `<p class="text-gray-600 leading-relaxed">${note}</p>`)
      .join('');
  }

  /** ตารางเปรียบเทียบวัสดุเลนส์ตามค่าสายตาที่วิเคราะห์ */
  function renderMaterialComparison(report) {
    const power = -Math.abs(report.metrics.maxAbsSph);
    if (!power) {
      els.aiMaterialBody.innerHTML = html`
        <tr><td colspan="5" class="py-3 px-2 border text-gray-400">ค่าสายตาเป็น 0 จึงไม่มีความแตกต่างด้านความหนา</td></tr>`;
      return;
    }

    const baseline = estimateEdgeThickness(power, 1.56);
    const recommendedIndex = parseFloat((String(report.lens.index).match(/1\.\d{2}/) || [])[0]) || null;

    els.aiMaterialBody.innerHTML = LENS_MATERIALS.map((material) => {
      const edge = estimateEdgeThickness(power, material.index);
      const reduction = ((baseline - edge) / baseline) * 100;
      const isRecommended = recommendedIndex === material.index;
      const weight = (material.sg / 1.28).toFixed(2);
      return html`
        <tr class="${raw(isRecommended ? 'bg-emerald-50 font-semibold' : '')}">
          <th scope="row" class="py-1.5 px-2 border text-left">
            ${material.label}
            ${isRecommended ? raw('<span class="ml-1 text-emerald-700">← แนะนำ</span>') : ''}
          </th>
          <td class="py-1.5 px-2 border">${edge.toFixed(1)} มม.</td>
          <td class="py-1.5 px-2 border ${raw(reduction > 0 ? 'text-emerald-700' : 'text-gray-400')}">
            ${reduction > 0.5 ? `บางลง ${reduction.toFixed(0)}%` : reduction < -0.5 ? `หนาขึ้น ${Math.abs(reduction).toFixed(0)}%` : 'เท่ากัน'}
          </td>
          <td class="py-1.5 px-2 border ${raw(material.abbe < 35 ? 'text-amber-700' : 'text-gray-600')}">
            ${material.abbe}${material.abbe < 35 ? ' (อาจเห็นขอบสี)' : ''}
          </td>
          <td class="py-1.5 px-2 border text-gray-600">${weight}×</td>
        </tr>`;
    }).join('');
  }

  /** แสดงเหตุผลเชิงวิชาการทีละหัวข้อ: ตรวจพบอะไร · ใช้เกณฑ์ไหน · ควรทำอะไรต่อ */
  function renderClinicalReasoning(report) {
    const notes = report.reasoning || [];
    els.aiReasoningWrap.classList.toggle('hidden', !notes.length);
    if (!notes.length) return;

    els.aiReasoning.innerHTML = notes.map((note) => html`
      <div class="border border-gray-200 rounded-lg overflow-hidden">
        <p class="bg-gray-50 px-3 py-1.5 text-2xs font-bold text-gray-800 border-b border-gray-200">
          ${note.topic}
        </p>
        <div class="px-3 py-2 space-y-1 text-2xs leading-relaxed">
          <p class="text-gray-800"><span class="font-semibold text-gray-500">ตรวจพบ:</span> ${note.finding}</p>
          <p class="text-gray-600"><span class="font-semibold text-gray-500">อ้างอิง:</span> ${note.basis}</p>
          ${note.action
            ? raw(html`<p class="text-blue-800 bg-blue-50 border border-blue-100 rounded px-2 py-1 mt-1.5">
                <span class="font-semibold">แนวทาง:</span> ${note.action}
              </p>`)
            : ''}
        </div>
      </div>`).join('');
  }

  function renderConsultation(report) {
    state.lastConsultation = report;

    els.aiDiag.textContent = report.diagnosis || 'ไม่พบความผิดปกติที่ต้องระบุเพิ่มเติม';

    renderConsultClinical(report);
    renderClinicalReasoning(report);
    renderMaterialComparison(report);

    els.aiLens.innerHTML = html`
      <ul class="space-y-1.5">
        <li><strong class="text-blue-900">ประเภทเลนส์:</strong> ${report.lens.type}</li>
        <li><strong class="text-blue-900">โครงสร้าง:</strong> ${report.lens.design}</li>
        <li><strong class="text-blue-900">ดัชนีหักเห:</strong> ${report.lens.index}</li>
        <li>
          <strong class="text-blue-900">โค้ทติ้ง / ออปชันเสริม:</strong>
          <ul class="list-disc pl-5 mt-1 text-slate-600 space-y-0.5">
            ${report.lens.coatings.map((coating) => raw(html`<li>${coating}</li>`))}
          </ul>
        </li>
      </ul>`;

    els.aiFrame.innerHTML = html`
      <ul class="space-y-1.5">
        <li>
          <strong class="text-violet-900">ทรงที่แนะนำ:</strong>
          <ul class="list-disc pl-5 mt-1 text-slate-600 space-y-0.5">
            ${report.frame.shapes.map((shape) => raw(html`<li>${shape}</li>`))}
          </ul>
        </li>
        ${report.frame.avoid && report.frame.avoid.length
          ? raw(html`<li><strong class="text-violet-900">ควรเลี่ยง:</strong> ${report.frame.avoid.join(' · ')}</li>`)
          : ''}
        <li><strong class="text-violet-900">วัสดุกรอบ:</strong> ${report.frame.material}</li>
        <li><strong class="text-violet-900">ขนาดและการฟิต:</strong> ${report.frame.sizeTips}</li>
        ${report.frame.why ? raw(html`<li class="text-slate-500">${report.frame.why}</li>`) : ''}
      </ul>`;

    els.aiPitch.innerHTML = html`<p class="italic">“${report.salesScript}”</p>`;

    els.aiAdvice.textContent = report.followUp
      ? `${report.dispensingAdvice} — ${report.followUp}`
      : report.dispensingAdvice;

    const matches = matchStock(report);
    if (matches.length) {
      els.aiStockWrap.classList.remove('hidden');
      els.aiStock.innerHTML = matches.map((product) => html`
        <div class="flex justify-between items-center gap-2 border-b border-dashed border-gray-100 pb-1 last:border-0">
          <span class="truncate">${product.name}</span>
          <span class="whitespace-nowrap font-semibold text-emerald-700">${formatBaht(product.price)} · คงเหลือ ${product.stock}</span>
        </div>`).join('');
    } else {
      els.aiStockWrap.classList.add('hidden');
      els.aiStock.innerHTML = '';
    }

    els.aiLoading.classList.add('hidden');
    els.aiPlaceholder.classList.add('hidden');
    els.aiResult.classList.remove('hidden');
  }

  async function runConsultation(event) {
    event.preventDefault();
    const input = readConsultInput();

    if (Number.isNaN(input.odSph) || Number.isNaN(input.osSph)) {
      showToast('กรุณาระบุค่าสายตา (SPH) ของตาขวาและตาซ้าย', 'error');
      $('#ai-od-sph').focus();
      return;
    }
    if (Math.abs(input.odSph) > 30 || Math.abs(input.osSph) > 30) {
      showToast('ค่า SPH ต้องอยู่ระหว่าง -30.00 ถึง +30.00', 'error');
      return;
    }

    els.aiPlaceholder.classList.add('hidden');
    els.aiResult.classList.add('hidden');
    els.aiLoading.classList.remove('hidden');
    els.aiSubmitBtn.disabled = true;

    try {
      // หน่วงเล็กน้อยเพื่อให้ผู้ใช้เห็นสถานะกำลังประมวลผล
      await new Promise((resolve) => setTimeout(resolve, 350));
      renderConsultation(analyzeConsultation(input));
      showToast('วิเคราะห์ค่าสายตาเสร็จสิ้น');
    } catch (error) {
      console.error('ประมวลผลคำแนะนำไม่สำเร็จ:', error);
      els.aiLoading.classList.add('hidden');
      els.aiPlaceholder.classList.remove('hidden');
      showToast('เกิดข้อผิดพลาดในการประมวลผลค่าสายตา', 'error');
    } finally {
      els.aiSubmitBtn.disabled = false;
    }
  }

  function autoFillFromCustomer() {
    const customer = state.customers.find((c) => c.id === els.aiCustomerSelect.value);
    if (!customer) return;

    const { distance, near } = customer.refraction;
    $('#ai-od-sph').value = distance.od.sph;
    $('#ai-os-sph').value = distance.os.sph;
    $('#ai-od-cyl').value = distance.od.cyl;
    $('#ai-os-cyl').value = distance.os.cyl;
    $('#ai-od-ax').value = distance.od.ax;
    $('#ai-os-ax').value = distance.os.ax;
    $('#ai-add').value = Math.max(near.od.add, near.os.add) || '';
    $('#ai-age').value = customer.age || '';
    $('#ai-face-shape').value = customer.faceShape || '';

    const occupation = customer.occupation.toLowerCase();
    $('#ls-computer').checked = /คอม|office|โปรแกรม|กราฟิก|บัญชี|it/.test(occupation);
    $('#ls-drive').checked = /ขับรถ|driver|ขนส่ง/.test(occupation);

    showToast(`ดึงค่าสายตาของ ${customer.name} เรียบร้อยแล้ว`, 'info');
  }

  /* ==========================================================================
   * 14. EVENT WIRING & BOOTSTRAP
   * ========================================================================== */

  const ACTIONS = {
    'switch-tab': (el) => switchTab(el.dataset.tab),
    'logout': () => handleLogout(),

    'sync-products': () => syncProducts(),
    'sync-customers': () => syncCustomers(),
    'sync-report': () => openSyncReport(),
    'reset-data': () => resetData(),

    'open-backend-settings': () => openBackendSettings(),
    // หน้าต่างตั้งค่าอยู่นอก #app-shell และ z สูงกว่าหน้าจอล็อก จึงเปิดทับได้เลย
    // ไม่ต้องปลด inert ของ app-shell (ถ้าปลดจะเท่ากับเปิดข้อมูลลูกค้าที่อยู่ข้างหลังให้เข้าถึงได้)
    'open-backend-settings-from-login': () => openBackendSettings(),
    'use-offline-mode': () => {
      state.backend.mode = 'local';
      persistBackendSettings();
      updateBackendUi();
      clearSession();
      setScreenLocked(false);
      renderSession();
      setLocked(false);
      showToast('เข้าสู่โหมดออฟไลน์ — ข้อมูลเก็บในเครื่องนี้เท่านั้น', 'info');
    },
    'open-users': () => openUsersModal(),
    'change-password': () => openPasswordChange(),
    'retry-auth': () => initAuth(),
    'unlock-offline': () => {
      setScreenLocked(false);
      setLocked(false);
      renderSession();
    },
    'toggle-password': (el) => {
      const input = document.getElementById(el.dataset.target);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      el.setAttribute('aria-pressed', String(show));
      el.querySelector('i').className = `fa-solid ${show ? 'fa-eye-slash' : 'fa-eye'}`;
    },
    'suggest-password': () => {
      const field = $('#user-password');
      field.value = suggestPassword();
      field.type = 'text';
      const toggle = $('[data-action="toggle-password"][data-target="user-password"]');
      if (toggle) {
        toggle.setAttribute('aria-pressed', 'true');
        toggle.querySelector('i').className = 'fa-solid fa-eye-slash text-xs';
      }
      showToast('สุ่มรหัสผ่านแล้ว — คัดลอกไปให้เจ้าตัวก่อนกดบันทึก', 'info');
    },
    'edit-user': (el) => {
      $('#user-id').value = el.dataset.id;
      $('#user-username').value = el.dataset.username;
      $('#user-display').value = el.dataset.display || '';
      $('#user-role').value = el.dataset.role;
      $('#user-email').value = el.dataset.email || '';
      $('#user-note').value = el.dataset.note || '';
      $('#user-password').value = '';
      $('#user-password-label').textContent = '(เว้นว่าง = ไม่เปลี่ยน)';
      $('#user-username').focus();
    },
    'disable-user': (el) => disableUser(el.dataset.id, el.dataset.username),
    'backend-test': () => testBackendConnection(),
    'backend-pull': () => backendPull(),
    'backend-push': () => backendPush(),
    'backend-diagnose': () => backendDiagnose(),
    'backend-repair': () => backendRepair(),

    'new-customer': () => openCustomerModal(),
    'edit-customer': (el) => { switchTab('customers', { keepScroll: true, focusPanel: false }); openCustomerModal(el.dataset.id); },
    'delete-customer': (el) => deleteCustomer(el.dataset.id),
    'delete-customer-from-form': () => deleteCustomerFromForm(),
    'edit-exam': (el) => editExam(el.dataset.id),
    'delete-exam': (el) => deleteExam(el.dataset.id),
    'cancel-exam-edit': () => {
      setExamEditing(null);
      $('#exam-date').value = todayISO();
      showToast('ออกจากโหมดแก้ไขแล้ว — การบันทึกครั้งถัดไปจะเป็นผลตรวจครั้งใหม่', 'info');
    },
    'quick-new-customer': () => { switchTab('customers'); openCustomerModal(); },

    'new-product': () => openProductModal(),
    'edit-product': (el) => openProductModal(el.dataset.id),
    'delete-product': (el) => deleteProduct(el.dataset.id),

    'new-order': () => openOrderModal(),
    'quick-new-order': () => { switchTab('orders'); openOrderModal(); },
    'delete-order': (el) => deleteOrder(el.dataset.id),

    'filter-category': (el) => {
      state.filters.inventoryCategory = state.filters.inventoryCategory === el.dataset.category ? '' : el.dataset.category;
      state.filters.lowStockOnly = false;
      renderInventory();
    },
    'clear-inventory-filter': () => {
      state.filters.inventoryCategory = '';
      state.filters.lowStockOnly = false;
      state.filters.inventoryQuery = '';
      els.inventorySearch.value = '';
      renderInventory();
    },
    'filter-low-stock': () => {
      state.filters.lowStockOnly = true;
      state.filters.inventoryCategory = '';
      renderInventory();
    },
    'filter-order-status': (el) => {
      state.filters.orderStatus = el.dataset.status;
      renderOrders();
    },

    'show-recall': () => {
      if (!(state.recallDue || []).length) {
        showToast('ยังไม่มีผู้รับบริการที่ถึงกำหนดตรวจซ้ำ', 'info');
        return;
      }
      state.filters.customerView = 'recall';
      switchTab('customers');
      renderCustomers();
    },
    'clear-customer-view': () => {
      state.filters.customerView = 'all';
      renderCustomers();
    },

    'close-modal': (el) => {
      const modal = el.closest('[data-modal]');
      if (modal) closeModal(modal);
    }
  };

  function bindEvents() {
    // การคลิกทั้งหมดใช้ event delegation จุดเดียว
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-action]');
      if (!trigger || trigger.tagName === 'SELECT') return;
      const handler = ACTIONS[trigger.dataset.action];
      if (!handler) return;
      event.preventDefault();
      handler(trigger, event);
    });

    // คลิกพื้นหลัง modal เพื่อปิด
    $$('[data-modal]').forEach((modal) => {
      modal.addEventListener('mousedown', (event) => {
        if (event.target === modal) closeModal(modal);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (!modalStack.length) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal(topModal());
      } else if (event.key === 'Tab') {
        trapFocus(event);
      }
    });

    // ฟอร์มต่าง ๆ
    els.loginForm.addEventListener('submit', submitLogin);
    els.changePasswordForm.addEventListener('submit', submitPasswordChange);
    els.userForm.addEventListener('submit', saveUser);
    els.customerForm.addEventListener('submit', saveCustomer);
    els.productForm.addEventListener('submit', saveProduct);
    els.orderForm.addEventListener('submit', saveOrder);
    els.consultForm.addEventListener('submit', runConsultation);
    els.backendForm.addEventListener('submit', saveBackendSettings);
    els.backendForm.addEventListener('change', (event) => {
      if (event.target.name === 'backend-mode') toggleBackendFields();
    });

    // คำนวณ Near SPH และค่าทางคลินิกอัตโนมัติขณะกรอกฟอร์ม
    const refreshRxComputed = debounce(renderRxComputed, 200);
    els.customerForm.addEventListener('input', (event) => {
      if (event.target.matches('[data-recalc-near]')) recalcNearSphere();
      if (event.target.id && event.target.id.endsWith('-near-sph')) event.target.dataset.touched = 'true';
      if (event.target.matches('input[type="number"], input[type="text"]')) refreshRxComputed();
    });
    els.customerForm.addEventListener('change', (event) => {
      if (event.target.matches('select')) refreshRxComputed();
    });

    // ตัวกรองลูกค้า
    const onCustomerSearch = debounce(() => {
      state.filters.customerQuery = els.customerSearch.value;
      renderCustomers();
    }, 150);
    els.customerSearch.addEventListener('input', onCustomerSearch);
    els.customerGenderFilter.addEventListener('change', () => {
      state.filters.customerGender = els.customerGenderFilter.value;
      renderCustomers();
    });

    // ตัวกรองคลังสินค้า
    const onInventorySearch = debounce(() => {
      state.filters.inventoryQuery = els.inventorySearch.value;
      renderInventory();
    }, 150);
    els.inventorySearch.addEventListener('input', onInventorySearch);

    // คำนวณยอดบิลอัตโนมัติ
    ['#ord-frame', '#ord-lens', '#ord-discount', '#ord-deposit'].forEach((selector) => {
      $(selector).addEventListener('input', calculateOrderTotal);
      $(selector).addEventListener('change', calculateOrderTotal);
    });

    // ดึงค่าสายตาของผู้รับบริการที่เลือก และคำนวณค่าใบสั่งงานแล็บสด ๆ
    $('#ord-customer').addEventListener('change', renderOrderRx);
    const refreshLabComputed = debounce(renderLabComputed, 200);
    $('#lab-details').addEventListener('input', refreshLabComputed);
    $('#lab-details').addEventListener('change', refreshLabComputed);

    // เปลี่ยนสถานะออเดอร์ (element ถูกสร้างใหม่ตลอด จึงใช้ delegation)
    els.ordersList.addEventListener('change', (event) => {
      const select = event.target.closest('select[data-action="update-order-status"]');
      if (!select) return;
      updateOrderStatus(select.dataset.id, select.value);
    });

    // ผู้ช่วยแนะนำเลนส์
    els.aiCustomerSelect.addEventListener('change', autoFillFromCustomer);

    // รองรับการกดปุ่มย้อนกลับ/เดินหน้าของเบราว์เซอร์
    window.addEventListener('hashchange', () => {
      switchTab(location.hash.slice(1) || 'dashboard', { focusPanel: false });
    });
  }

  function init() {
    cacheElements();
    state.storageAvailable = detectStorage();
    loadBackendSettings();
    restoreScreenLock();

    if (!restore()) loadSeed();

    bindEvents();

    els.dbStatusText.textContent = state.storageAvailable
      ? 'ระบบพร้อมใช้งาน · บันทึกอัตโนมัติในเครื่อง'
      : 'โหมดชั่วคราว · เบราว์เซอร์ไม่อนุญาตให้บันทึกข้อมูล';
    els.dbStatusDot.className = state.storageAvailable
      ? 'w-2.5 h-2.5 rounded-full bg-emerald-500'
      : 'w-2.5 h-2.5 rounded-full bg-amber-500';

    setDiagnostic({ status: 'ยังไม่มีการซิงค์ในเซสชันนี้' });
    updateBackendUi();

    switchTab(location.hash.slice(1) || 'dashboard', { focusPanel: false });
    renderAll();
    renderSession();

    initAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
