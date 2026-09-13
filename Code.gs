/* =============================================================================
 * OptiCare Pro — Backend บน Google Apps Script
 * ฐานข้อมูล: Google Sheets · ที่เก็บไฟล์แนบ: Google Drive
 *
 * โครงสร้างไฟล์
 *   1. CONFIG                    6. Repository (CRUD ต่อ entity)
 *   2. HEADERS (แหล่งอ้างอิงเดียว) 7. Business logic
 *   3. Schema utilities          8. Drive (ไฟล์แนบ)
 *   4. Type coercion             9. Web API (doGet / doPost)
 *   5. Sheet I/O                10. เมนูในสเปรดชีต & ฟังก์ชันติดตั้ง
 *
 * หลักการสำคัญ
 *   HEADERS คือแหล่งอ้างอิงเดียวของโครงสร้างตาราง ทุกการทำงาน — สร้างชีต อ่าน เขียน
 *   และตรวจความถูกต้อง — อ่านลำดับคอลัมน์จาก HEADERS เท่านั้น ห้ามฮาร์ดโค้ดชื่อ
 *   หรือดัชนีคอลัมน์ที่อื่นเด็ดขาด ลำดับคอลัมน์จริงในชีตต้องตรงกับที่ระบุใน HEADERS
 *
 * การติดตั้งครั้งแรก
 *   1) เปิดสเปรดชีต → เมนู "OptiCare" → "ติดตั้งฐานข้อมูลครั้งแรก"
 *   2) เมนู "OptiCare" → "สร้าง API Token" แล้วเก็บ token ที่ได้ไว้
 *   3) Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone
 * ========================================================================== */

'use strict';

/* ==========================================================================
 * 1. CONFIG
 * ========================================================================== */

/** ไฟล์ Google Sheets ที่ใช้เป็นฐานข้อมูล */
const SHEET_ID = '1YV97JIiatp0amltwvIQUs2zPnOYhe6xWhz0fh3fNjNY';

/** โฟลเดอร์ Google Drive สำหรับเก็บไฟล์แนบ (รูปสินค้า / สแกนใบสั่งแว่น) */
const FOLDER_ID = '10b5Pn_7d-CuiPAwPIf1TYQm53_C9DHol';

const CONFIG = Object.freeze({
  timezone: 'Asia/Bangkok',
  locale: 'th-TH',
  /** กุญแจลับสำหรับเซ็น session token (สร้างอัตโนมัติ ไม่เก็บในซอร์สโค้ด) */
  sessionSecretProperty: 'SESSION_SECRET',
  /**
   * กุญแจลับสำหรับแฮชรหัสผ่าน (pepper) สร้างอัตโนมัติครั้งแรกที่ใช้
   * เก็บใน Script Properties ไม่ได้อยู่ในชีต คนที่เห็นชีตอย่างเดียวจึงถอดรหัสผ่านไม่ได้
   */
  passwordPepperProperty: 'PASSWORD_PEPPER',
  /** ความยาวขั้นต่ำของรหัสผ่าน */
  minPasswordLength: 8,
  /** จำนวนครั้งที่กรอกรหัสผิดติดกันก่อนถูกล็อกชั่วคราว */
  maxLoginAttempts: 8,
  /** ระยะเวลาล็อกบัญชีหลังกรอกผิดเกินกำหนด (นาที) */
  lockoutMinutes: 15,
  /** อายุ session token (นาที) — หมดอายุแล้วต้องล็อกอินใหม่ */
  sessionTtlMinutes: 480,
  /** ชีตเอกสารโครงสร้างที่ระบบสร้างให้อัตโนมัติ (อ่านอย่างเดียว) */
  schemaSheetName: '_Schema',
  /** เวลารอสูงสุดเมื่อมีการเขียนพร้อมกัน (มิลลิวินาที) */
  lockTimeoutMs: 20000,
  /** จำนวนแถวสูงสุดต่อการอ่านหนึ่งครั้ง ป้องกัน payload ใหญ่เกินไป */
  maxRows: 5000,
  /** ขนาดไฟล์แนบสูงสุด (ไบต์) */
  maxUploadBytes: 10 * 1024 * 1024
});

/* ==========================================================================
 * 2. HEADERS — แหล่งอ้างอิงเดียวของโครงสร้างทุกชีต
 *
 * แต่ละคอลัมน์ประกอบด้วย
 *   key      ชื่อคอลัมน์ที่เขียนลงแถวหัวตารางจริง (ใช้ในโค้ดและ API)
 *   label    คำอธิบายภาษาไทย ใช้สร้างชีต _Schema ให้คนอ่าน
 *   type     ชนิดข้อมูลสำหรับแปลงค่าเข้า/ออก: string | number | int | bool | date | datetime | json
 *   options  { required, primary, default, enum }
 *
 * ลำดับใน array คือลำดับคอลัมน์จริงในชีต — การสลับตำแหน่งถือเป็นการเปลี่ยนสคีมา
 * ========================================================================== */

/** ตัวช่วยประกาศคอลัมน์ให้สั้นและอ่านง่าย */
function field(key, label, type, options) {
  const opts = options || {};
  return Object.freeze({
    key: key,
    label: label,
    type: type || 'string',
    required: opts.required === true,
    primary: opts.primary === true,
    defaultValue: Object.prototype.hasOwnProperty.call(opts, 'default') ? opts.default : null,
    enumValues: opts.enum || null
  });
}

const ORDER_STATUSES = Object.freeze(['รอใบสั่งเลนส์', 'กำลังฝนเลนส์', 'รอรับสินค้า', 'สำเร็จ', 'ยกเลิก']);
const PRODUCT_CATEGORIES = Object.freeze(['Frame', 'Lens', 'ContactLens', 'Accessory']);
const GENDERS = Object.freeze(['ชาย', 'หญิง', 'อื่นๆ']);
const STOCK_MOVE_TYPES = Object.freeze(['RECEIVE', 'SALE', 'RETURN', 'ADJUST', 'DAMAGE']);

/**
 * บทบาทผู้ใช้ เรียงจากสิทธิ์สูงไปต่ำ
 *   owner        เจ้าของร้าน — จัดการผู้ใช้และโครงสร้างฐานข้อมูลได้
 *   admin        ผู้ดูแล — จัดการข้อมูลทั้งหมด แต่เพิ่ม/ลบผู้ใช้ไม่ได้
 *   optometrist  ทัศนมาตร — บันทึกผลตรวจและเปิดบิลได้
 *   staff        พนักงานขาย — เปิดบิลและจัดการสต็อก แต่บันทึกผลตรวจไม่ได้
 *   viewer       ดูอย่างเดียว
 */
const ROLES = Object.freeze(['owner', 'admin', 'optometrist', 'staff', 'viewer']);
const ALL_ROLES = ROLES.slice();

/**
 * ค่าตั้งต้นของใบสั่งงานแล็บ — ต้องตรงกับตัวเลือกใน script.js ฝั่งหน้าเว็บ
 * ไม่บังคับเป็น enum เพื่อให้ร้านเพิ่มวิธีเจียร์ขอบหรือชนิดกรอบของตัวเองได้
 */
const FRAME_TYPES = Object.freeze([
  'เต็มกรอบ (Full rim)',
  'กรอบเซาะร่อง (Semi-rimless)',
  'กรอบเจาะ (Rimless)'
]);
const EDGE_TREATMENTS = Object.freeze([
  'เจียร์ปกติ (Standard bevel)',
  'เซาะร่อง (Groove)',
  'เจาะรู (Drill mount)',
  'ขัดขอบเงา (Polish)',
  'ลบเหลี่ยมขอบ (Roll & polish)'
]);

const HEADERS = Object.freeze({

  /* ---------- ทะเบียนผู้รับบริการ ---------- */
  Customers: Object.freeze([
    field('id', 'รหัสผู้รับบริการ', 'string', { required: true, primary: true }),
    field('name', 'ชื่อ-นามสกุล', 'string', { required: true }),
    field('phone', 'เบอร์โทรศัพท์', 'string', { required: true }),
    field('email', 'อีเมล', 'string'),
    field('gender', 'เพศ', 'string', { enum: GENDERS, default: 'อื่นๆ' }),
    field('age', 'อายุ (ปี)', 'int', { default: 0 }),
    field('occupation', 'อาชีพ', 'string'),
    field('faceShape', 'รูปหน้า', 'string'),
    field('chiefComplaint', 'อาการสำคัญที่มาพบ', 'string'),
    field('ocularConditions', 'โรคตา / โรคประจำตัว', 'string'),
    field('medications', 'ยาที่ใช้ประจำ', 'string'),
    field('familyHistory', 'ประวัติครอบครัว', 'string'),
    field('contactLensUse', 'การใช้คอนแทคเลนส์', 'string'),
    field('notes', 'บันทึกเพิ่มเติม', 'string'),
    field('active', 'สถานะใช้งาน', 'bool', { default: true }),
    field('createdAt', 'วันที่ลงทะเบียน', 'date'),
    field('updatedAt', 'แก้ไขล่าสุด', 'datetime')
  ]),

  /* ---------- ผลการตรวจวัดสายตา (1 ผู้รับบริการ : หลายรายการ) ---------- */
  Exams: Object.freeze([
    field('id', 'รหัสการตรวจ', 'string', { required: true, primary: true }),
    field('customerId', 'รหัสผู้รับบริการ', 'string', { required: true }),
    field('examDate', 'วันที่ตรวจ', 'date', { required: true }),
    field('optometrist', 'ผู้ตรวจ (ทัศนมาตร)', 'string'),
    field('method', 'วิธีการตรวจ', 'string', { default: 'Subjective refraction' }),
    // มองไกล — ตาขวา
    field('odSph', 'OD Sphere (มองไกล)', 'number', { default: 0 }),
    field('odCyl', 'OD Cylinder', 'number', { default: 0 }),
    field('odAx', 'OD Axis (องศา)', 'int', { default: 0 }),
    field('odVa', 'OD VA มองไกล', 'string'),
    // มองไกล — ตาซ้าย
    field('osSph', 'OS Sphere (มองไกล)', 'number', { default: 0 }),
    field('osCyl', 'OS Cylinder', 'number', { default: 0 }),
    field('osAx', 'OS Axis (องศา)', 'int', { default: 0 }),
    field('osVa', 'OS VA มองไกล', 'string'),
    // มองใกล้
    field('odAdd', 'OD Addition', 'number', { default: 0 }),
    field('odNearSph', 'OD Sphere (มองใกล้)', 'number', { default: 0 }),
    field('odNearVa', 'OD VA มองใกล้', 'string'),
    field('osAdd', 'OS Addition', 'number', { default: 0 }),
    field('osNearSph', 'OS Sphere (มองใกล้)', 'number', { default: 0 }),
    field('osNearVa', 'OS VA มองใกล้', 'string'),
    // ระยะและความสูง
    field('pdFar', 'PD มองไกล (มม.)', 'number', { default: 0 }),
    field('pdNear', 'PD มองใกล้ (มม.)', 'number', { default: 0 }),
    field('segHeight', 'Segment Height (มม.)', 'number', { default: 0 }),
    // ค่าที่ระบบคำนวณให้ เก็บไว้เพื่อให้เปิดดูในชีตได้โดยไม่ต้องคำนวณเอง
    field('seOd', 'Spherical Equivalent ขวา', 'number', { default: 0 }),
    field('seOs', 'Spherical Equivalent ซ้าย', 'number', { default: 0 }),
    field('anisometropia', 'ความต่างสองตา (D)', 'number', { default: 0 }),
    field('note', 'บันทึกผลการตรวจ', 'string'),
    field('attachmentUrl', 'ไฟล์แนบ', 'string'),
    field('createdAt', 'บันทึกเมื่อ', 'datetime')
  ]),

  /* ---------- คลังสินค้า ---------- */
  Products: Object.freeze([
    field('id', 'รหัสสินค้า', 'string', { required: true, primary: true }),
    field('category', 'หมวดหมู่', 'string', { required: true, enum: PRODUCT_CATEGORIES, default: 'Frame' }),
    field('name', 'ชื่อสินค้า', 'string', { required: true }),
    field('brand', 'แบรนด์', 'string'),
    field('barcode', 'บาร์โค้ด', 'string'),
    field('cost', 'ราคาต้นทุน', 'number', { default: 0 }),
    field('price', 'ราคาขาย', 'number', { required: true, default: 0 }),
    field('stock', 'จำนวนคงเหลือ', 'int', { default: 0 }),
    field('minAlert', 'จุดแจ้งเตือนขั้นต่ำ', 'int', { default: 3 }),
    field('lensIndex', 'ดัชนีหักเห (เฉพาะเลนส์)', 'number', { default: 0 }),
    field('supplier', 'ผู้จำหน่าย', 'string'),
    field('imageUrl', 'รูปสินค้า', 'string'),
    field('active', 'สถานะใช้งาน', 'bool', { default: true }),
    field('createdAt', 'วันที่เพิ่ม', 'date'),
    field('updatedAt', 'แก้ไขล่าสุด', 'datetime')
  ]),

  /* ---------- ใบสั่งขาย & ใบสั่งงานแล็บ (หนึ่งแถว = หนึ่งใบสั่งงานสมบูรณ์) ---------- */
  Orders: Object.freeze([
    field('id', 'เลขที่ใบสั่ง', 'string', { required: true, primary: true }),
    field('customerId', 'รหัสผู้รับบริการ', 'string', { required: true }),
    field('customerName', 'ชื่อผู้รับบริการ', 'string'),
    field('examId', 'อ้างอิงผลตรวจ', 'string'),
    field('frameId', 'รหัสกรอบแว่น', 'string'),
    field('frameName', 'กรอบแว่น', 'string'),
    field('lensId', 'รหัสเลนส์', 'string'),
    field('lensName', 'เลนส์สายตา', 'string'),
    field('total', 'ราคารวม', 'number', { default: 0 }),
    field('discount', 'ส่วนลด', 'number', { default: 0 }),
    field('finalTotal', 'ยอดสุทธิ', 'number', { default: 0 }),
    field('deposit', 'เงินมัดจำ', 'number', { default: 0 }),
    field('balance', 'คงเหลือชำระ', 'number', { default: 0 }),
    field('payment', 'ช่องทางชำระเงิน', 'string', { default: 'เงินสด' }),
    field('status', 'สถานะงาน', 'string', { required: true, enum: ORDER_STATUSES, default: 'รอใบสั่งเลนส์' }),
    field('labInstruction', 'คำสั่งถึงห้องแล็บ', 'string'),
    field('promiseDate', 'วันนัดรับ', 'date'),
    field('deliveredAt', 'วันที่ส่งมอบ', 'date'),
    // สำเนาค่าสายตา ณ วันสั่งตัด — ล็อกไว้ ไม่เปลี่ยนตามการตรวจครั้งใหม่ของผู้รับบริการ
    field('rxDate', 'วันที่ของค่าสายตาที่ใช้', 'date'),
    field('rxOdSph', 'Rx OD Sphere', 'number', { default: 0 }),
    field('rxOdCyl', 'Rx OD Cylinder', 'number', { default: 0 }),
    field('rxOdAx', 'Rx OD Axis', 'int', { default: 0 }),
    field('rxOdAdd', 'Rx OD Addition', 'number', { default: 0 }),
    field('rxOsSph', 'Rx OS Sphere', 'number', { default: 0 }),
    field('rxOsCyl', 'Rx OS Cylinder', 'number', { default: 0 }),
    field('rxOsAx', 'Rx OS Axis', 'int', { default: 0 }),
    field('rxOsAdd', 'Rx OS Addition', 'number', { default: 0 }),
    field('rxPdFar', 'Rx PD มองไกล', 'number', { default: 0 }),
    field('rxPdNear', 'Rx PD มองใกล้', 'number', { default: 0 }),
    field('rxSegHeight', 'Rx Segment Height', 'number', { default: 0 }),
    // พารามิเตอร์ใบสั่งงานแล็บ
    field('labFrameType', 'ชนิดกรอบ', 'string'),
    field('labA', 'A — ความกว้างเลนส์ (มม.)', 'number', { default: 0 }),
    field('labB', 'B — ความสูงเลนส์ (มม.)', 'number', { default: 0 }),
    field('labDbl', 'DBL — สะพานจมูก (มม.)', 'number', { default: 0 }),
    field('labEd', 'ED — เส้นทแยงยาวสุด (มม.)', 'number', { default: 0 }),
    field('labMonoPdOd', 'Mono PD ขวา (มม.)', 'number', { default: 0 }),
    field('labMonoPdOs', 'Mono PD ซ้าย (มม.)', 'number', { default: 0 }),
    field('labFittingHeightOd', 'Fitting Height ขวา (มม.)', 'number', { default: 0 }),
    field('labFittingHeightOs', 'Fitting Height ซ้าย (มม.)', 'number', { default: 0 }),
    field('labPantoscopicTilt', 'Pantoscopic Tilt (องศา)', 'number', { default: 0 }),
    field('labVertexDistance', 'Vertex Distance (มม.)', 'number', { default: 0 }),
    field('labWrapAngle', 'Face Form / Wrap (องศา)', 'number', { default: 0 }),
    field('labLensIndex', 'ดัชนีหักเหที่สั่ง', 'number', { default: 0 }),
    field('labCoating', 'โค้ทติ้ง', 'string'),
    field('labTint', 'สี / Tint', 'string'),
    field('labEdgeTreatment', 'วิธีเจียร์ขอบ', 'string'),
    // ค่าที่ระบบคำนวณให้ช่างแล็บ
    field('labDecentrationOd', 'ระยะเยื้องศูนย์ขวา (มม.)', 'number', { default: 0 }),
    field('labDecentrationOs', 'ระยะเยื้องศูนย์ซ้าย (มม.)', 'number', { default: 0 }),
    field('labMinBlankOd', 'เลนส์ดิบขั้นต่ำขวา (มม.)', 'number', { default: 0 }),
    field('labMinBlankOs', 'เลนส์ดิบขั้นต่ำซ้าย (มม.)', 'number', { default: 0 }),
    field('attachmentUrl', 'ไฟล์แนบ', 'string'),
    field('createdBy', 'ผู้เปิดบิล', 'string'),
    field('createdAt', 'วันที่เปิดบิล', 'date'),
    field('updatedAt', 'แก้ไขล่าสุด', 'datetime')
  ]),

  /* ---------- บันทึกความเคลื่อนไหวสต็อก ---------- */
  StockMoves: Object.freeze([
    field('id', 'รหัสรายการ', 'string', { required: true, primary: true }),
    field('movedAt', 'วันเวลา', 'datetime', { required: true }),
    field('productId', 'รหัสสินค้า', 'string', { required: true }),
    field('productName', 'ชื่อสินค้า', 'string'),
    field('type', 'ประเภทรายการ', 'string', { required: true, enum: STOCK_MOVE_TYPES }),
    field('quantity', 'จำนวน (+/-)', 'int', { required: true, default: 0 }),
    field('balanceAfter', 'คงเหลือหลังรายการ', 'int', { default: 0 }),
    field('refType', 'อ้างอิงจาก', 'string'),
    field('refId', 'เลขที่อ้างอิง', 'string'),
    field('note', 'หมายเหตุ', 'string'),
    field('user', 'ผู้ทำรายการ', 'string')
  ]),

  /* ---------- ผู้ใช้ระบบและสิทธิ์ ---------- */
  Users: Object.freeze([
    field('id', 'รหัสผู้ใช้', 'string', { required: true, primary: true }),
    field('username', 'ชื่อผู้ใช้ (ใช้เข้าสู่ระบบ)', 'string', { required: true }),
    field('displayName', 'ชื่อที่แสดง', 'string'),
    field('role', 'บทบาท', 'string', { required: true, enum: ROLES, default: 'viewer' }),
    // เก็บเฉพาะค่าที่ผ่านการแฮชแล้ว ห้ามเขียนรหัสผ่านจริงลงชีตเด็ดขาด
    field('passwordSalt', 'ค่าสุ่มประจำบัญชี (ห้ามแก้)', 'string'),
    field('passwordHash', 'รหัสผ่านที่เข้ารหัสแล้ว (ห้ามแก้)', 'string'),
    field('mustChangePassword', 'ต้องเปลี่ยนรหัสผ่านครั้งถัดไป', 'bool', { default: false }),
    field('active', 'เปิดใช้งาน', 'bool', { default: true }),
    field('email', 'อีเมล (ไม่บังคับ)', 'string'),
    field('note', 'หมายเหตุ', 'string'),
    field('lastLoginAt', 'เข้าใช้งานล่าสุด', 'datetime'),
    field('createdAt', 'วันที่เพิ่ม', 'date'),
    field('updatedAt', 'แก้ไขล่าสุด', 'datetime')
  ]),

  /* ---------- บันทึกการใช้งานระบบ ---------- */
  ActivityLog: Object.freeze([
    field('id', 'รหัสบันทึก', 'string', { required: true, primary: true }),
    field('timestamp', 'วันเวลา', 'datetime', { required: true }),
    field('action', 'การกระทำ', 'string', { required: true }),
    field('entity', 'ตาราง', 'string'),
    field('entityId', 'รหัสข้อมูล', 'string'),
    field('user', 'ผู้ใช้', 'string'),
    field('status', 'ผลลัพธ์', 'string'),
    field('detail', 'รายละเอียด', 'string')
  ])
});

/** ลำดับการสร้างชีต (ชีตอ้างอิงต้องมาก่อนชีตที่อ้างถึง) */
const SHEET_ORDER = Object.freeze(['Customers', 'Exams', 'Products', 'Orders', 'StockMoves', 'Users', 'ActivityLog']);

/** ชื่อชีตทั้งหมดที่ระบบรู้จัก */
function sheetNames() {
  return SHEET_ORDER.slice();
}

/** คืนนิยามคอลัมน์ของชีต พร้อมตรวจว่าชื่อชีตถูกต้อง */
function schemaOf(sheetName) {
  const schema = HEADERS[sheetName];
  if (!schema) {
    throw new Error('ไม่รู้จักชีตชื่อ "' + sheetName + '" — ชีตที่รองรับ: ' + sheetNames().join(', '));
  }
  return schema;
}

/** แถวหัวตารางของชีต (array ของ key) — ใช้ทั้งตอนสร้าง อ่าน เขียน และตรวจสอบ */
function headerRow(sheetName) {
  return schemaOf(sheetName).map(function (column) { return column.key; });
}

/* ==========================================================================
 * 3. SCHEMA UTILITIES — สร้าง / ตรวจสอบ / ซ่อมโครงสร้าง
 * ========================================================================== */

function spreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

/**
 * สร้างชีตให้ครบตาม HEADERS พร้อมเขียนแถวหัวตารางและจัดรูปแบบ
 * เรียกซ้ำได้อย่างปลอดภัย — ชีตที่มีอยู่แล้วจะไม่ถูกลบข้อมูล
 */
function ensureAllSheets() {
  const ss = spreadsheet();
  const created = [];
  const updated = [];
  const skipped = [];

  sheetNames().forEach(function (name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      applyHeaderRow_(sheet, name);
      created.push(name);
      return;
    }

    // ชีตที่มีข้อมูลอยู่แล้วและหัวตารางไม่ตรง ห้ามเขียนทับหัวตารางเฉย ๆ
    // เพราะข้อมูลเดิมจะยังอยู่ตำแหน่งคอลัมน์เดิมแล้วไปอยู่ใต้หัวตารางผิดคอลัมน์
    const conflict = headerConflict_(sheet, name);
    if (conflict) {
      skipped.push({ sheet: name, reason: conflict });
      return;
    }

    applyHeaderRow_(sheet, name);
    updated.push(name);
  });

  buildSchemaSheet_(ss);

  return {
    created: created,
    updated: updated,
    skipped: skipped,
    schemaSheet: CONFIG.schemaSheetName,
    needsMigration: skipped.length > 0
  };
}

/**
 * ตรวจว่าการเขียนหัวตารางทับจะทำให้ข้อมูลเดิมไปอยู่ผิดคอลัมน์หรือไม่
 * @returns {string|null} เหตุผลที่ห้ามเขียนทับ หรือ null ถ้าปลอดภัย
 */
function headerConflict_(sheet, sheetName) {
  const dataRows = sheet.getLastRow() - 1;
  if (dataRows <= 0) return null;

  const expected = headerRow(sheetName);
  const lastColumn = sheet.getLastColumn();
  const actual = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function (value) { return String(value).trim(); });

  const sameOrder = expected.every(function (key, index) { return actual[index] === key; });
  if (sameOrder) return null;

  const misplaced = [];
  expected.forEach(function (key, index) {
    if (actual[index] !== key) {
      misplaced.push(columnLetter_(index + 1) + ': มี "' + (actual[index] || '(ว่าง)') + '" ควรเป็น "' + key + '"');
    }
  });

  return 'มีข้อมูลอยู่ ' + dataRows + ' แถว และลำดับคอลัมน์ไม่ตรง ('
    + misplaced.slice(0, 3).join(' · ')
    + (misplaced.length > 3 ? ' · และอีก ' + (misplaced.length - 3) + ' คอลัมน์' : '')
    + ') — ใช้ migrateLegacySheets() หรือ repairSheetHeaders() เพื่อย้ายข้อมูลให้ถูกตำแหน่งก่อน';
}

/**
 * ขยายกริดของชีตให้พอกับจำนวนแถว/คอลัมน์ที่ต้องใช้
 *
 * สำคัญ: ชีตที่สร้างใหม่ด้วย insertSheet() มีขนาดเริ่มต้นเพียง 1000 แถว × 26 คอลัมน์
 * การเรียก getRange() เกินขอบเขตนี้จะโยน "The coordinates or dimensions of the range are invalid"
 * ซึ่งทำให้การติดตั้งล้มเหลวทั้งหมดตั้งแต่ชีต Exams (28 คอลัมน์) และ Orders (54 คอลัมน์)
 */
function ensureGridSize_(sheet, neededColumns, neededRows) {
  const maxColumns = sheet.getMaxColumns();
  if (neededColumns && maxColumns < neededColumns) {
    sheet.insertColumnsAfter(maxColumns, neededColumns - maxColumns);
  }
  const maxRows = sheet.getMaxRows();
  if (neededRows && maxRows < neededRows) {
    sheet.insertRowsAfter(maxRows, neededRows - maxRows);
  }
}

/** เขียนแถวหัวตารางและจัดรูปแบบชีตตาม HEADERS */
function applyHeaderRow_(sheet, sheetName) {
  const schema = schemaOf(sheetName);
  const keys = headerRow(sheetName);

  ensureGridSize_(sheet, keys.length, 2);

  sheet.getRange(1, 1, 1, keys.length)
    .setValues([keys])
    .setFontWeight('bold')
    .setBackground('#1e3a8a')
    .setFontColor('#ffffff')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);

  // ใส่คำอธิบายภาษาไทยเป็น note บนหัวคอลัมน์ เพื่อให้คนเปิดชีตเข้าใจโดยไม่ต้องดูโค้ด
  const notes = schema.map(function (column) {
    return column.label + '\n(' + column.type + (column.required ? ', จำเป็น' : '') + ')';
  });
  sheet.getRange(1, 1, 1, keys.length).setNotes([notes]);

  // คอลัมน์วันที่เก็บเป็นข้อความ เพื่อไม่ให้ Sheets แปลงรูปแบบตาม locale
  schema.forEach(function (column, index) {
    if (column.type === 'date' || column.type === 'datetime') {
      sheet.getRange(2, index + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    }
  });

  // ตัดคอลัมน์ส่วนเกินที่ว่างเปล่าออก เพื่อให้ชีตตรงกับสคีมาพอดี
  const extraColumns = sheet.getMaxColumns() - keys.length;
  if (extraColumns > 0 && sheet.getLastColumn() <= keys.length) {
    sheet.deleteColumns(keys.length + 1, extraColumns);
  }
}

/**
 * ตรวจว่าโครงสร้างจริงในชีตตรงกับ HEADERS หรือไม่
 * ตรวจทั้งชื่อคอลัมน์ คอลัมน์ที่ขาด คอลัมน์เกิน และลำดับที่สลับกัน
 * @returns {Object} รายงานผลแยกตามชีต
 */
function validateSchema() {
  const ss = spreadsheet();
  const report = { ok: true, checkedAt: nowISO_(), sheets: {} };

  sheetNames().forEach(function (name) {
    const expected = headerRow(name);
    const sheet = ss.getSheetByName(name);

    if (!sheet) {
      report.ok = false;
      report.sheets[name] = { ok: false, problems: ['ไม่พบชีตนี้ในไฟล์'], expected: expected, actual: [] };
      return;
    }

    const lastColumn = sheet.getLastColumn();
    const actual = lastColumn > 0
      ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) { return String(value).trim(); })
      : [];

    const problems = [];

    expected.forEach(function (key) {
      if (actual.indexOf(key) === -1) problems.push('ขาดคอลัมน์ "' + key + '"');
    });

    actual.forEach(function (key, index) {
      if (key && expected.indexOf(key) === -1) {
        problems.push('มีคอลัมน์เกินมา "' + key + '" ที่ตำแหน่ง ' + columnLetter_(index + 1));
      }
    });

    expected.forEach(function (key, index) {
      if (actual[index] !== key && actual.indexOf(key) !== -1) {
        problems.push('ลำดับไม่ตรง: คอลัมน์ ' + columnLetter_(index + 1)
          + ' ควรเป็น "' + key + '" แต่พบ "' + (actual[index] || '(ว่าง)') + '"');
      }
    });

    const ok = problems.length === 0;
    if (!ok) report.ok = false;
    report.sheets[name] = {
      ok: ok,
      rows: Math.max(sheet.getLastRow() - 1, 0),
      expected: expected,
      actual: actual,
      problems: problems
    };
  });

  return report;
}

/**
 * ซ่อมลำดับคอลัมน์ให้ตรงกับ HEADERS โดยรักษาข้อมูลเดิมไว้
 * จับคู่ข้อมูลจากชื่อคอลัมน์เดิม คอลัมน์ที่ไม่มีใน HEADERS จะถูกทิ้ง
 * ควรสำรองไฟล์ก่อนเรียกใช้เสมอ
 */
function repairSheetHeaders(sheetName) {
  const schema = schemaOf(sheetName);
  const expected = headerRow(sheetName);
  const ss = spreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('ไม่พบชีต "' + sheetName + '"');

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    applyHeaderRow_(sheet, sheetName);
    return { sheet: sheetName, movedRows: 0, note: 'ชีตว่าง เขียนหัวตารางใหม่' };
  }

  const values = sheet.getRange(1, 1, Math.max(lastRow, 1), lastColumn).getValues();
  const oldHeader = values[0].map(function (value) { return String(value).trim(); });
  const dataRows = values.slice(1);

  const rebuilt = dataRows.map(function (row) {
    return expected.map(function (key, targetIndex) {
      const sourceIndex = oldHeader.indexOf(key);
      if (sourceIndex === -1) return schema[targetIndex].defaultValue === null ? '' : schema[targetIndex].defaultValue;
      return row[sourceIndex];
    });
  });

  sheet.clear();
  applyHeaderRow_(sheet, sheetName);
  if (rebuilt.length) {
    ensureGridSize_(sheet, expected.length, rebuilt.length + 1);
    sheet.getRange(2, 1, rebuilt.length, expected.length).setValues(rebuilt);
  }

  const dropped = oldHeader.filter(function (key) { return key && expected.indexOf(key) === -1; });
  return { sheet: sheetName, movedRows: rebuilt.length, droppedColumns: dropped };
}

/**
 * ย้ายข้อมูลจากโครงสร้างเดิม (ก่อนใช้ HEADERS ชุดนี้) มาสู่โครงสร้างใหม่
 *
 * โครงสร้างเดิมที่รองรับ
 *   ชีตลูกค้า  : id, name, phone, email, gender, age, occupation, notes,
 *                od_sph, od_cyl, od_ax, od_va, os_sph, os_cyl, os_ax, os_va, add, pd
 *                → แยกเป็น Customers (ข้อมูลบุคคล) + Exams (ค่าสายตา 1 รายการต่อคน)
 *   Products   : id, category, name, barcode, cost, price, stock, minAlert
 *   Orders     : id, customerId, customerName, frameId, frameName, lensId, lensName,
 *                total, discount, finalTotal, payment, status, labInstruction, createdAt
 *
 * ทำงานโดยอ่านข้อมูลเดิมด้วยชื่อคอลัมน์ (ไม่ใช่ตำแหน่ง) แล้วเขียนใหม่ตาม HEADERS
 * ชีตเดิมจะถูกเปลี่ยนชื่อเป็น <ชื่อเดิม>_backup_<วันที่> ไม่มีการลบข้อมูลทิ้ง
 *
 * @param {Object} options
 *   dryRun              true เพื่อดูผลก่อนโดยไม่แก้ไขอะไร
 *   legacyCustomerSheet ชื่อชีตลูกค้าเดิม (ถ้าไม่ระบุจะค้นหาจากหัวตารางที่มี od_sph)
 *   only                อาร์เรย์ชื่อชีตที่ต้องการย้ายเท่านั้น เช่น ['Customers']
 *                       ใช้เมื่อชีตอื่นอยู่บนโครงสร้างใหม่แล้วและซ่อมด้วยการจับคู่ชื่อคอลัมน์ได้
 */
function migrateLegacySheets(options) {
  const opts = options || {};
  const dryRun = opts.dryRun === true;
  const only = Array.isArray(opts.only) && opts.only.length ? opts.only : null;
  const include = function (name) { return !only || only.indexOf(name) !== -1; };
  const ss = spreadsheet();
  const stamp = Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyyMMdd_HHmm');
  const plan = { dryRun: dryRun, customers: 0, exams: 0, products: 0, orders: 0, backups: [], warnings: [] };

  const readLegacy = function (sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return null;
    const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    const header = values[0].map(function (value) { return String(value).trim(); });
    const rows = values.slice(1).filter(function (row) { return String(row[0]).trim() !== ''; });
    return {
      sheet: sheet,
      rows: rows.map(function (row) {
        const record = {};
        header.forEach(function (key, index) { if (key) record[key] = row[index]; });
        return record;
      })
    };
  };

  /* ---------- ลูกค้า + ค่าสายตา ---------- */
  const legacyCustomerName = !include('Customers') ? null : (opts.legacyCustomerSheet
    || ['Customers', 'ลูกค้า', 'รายชื่อลูกค้า'].filter(function (name) {
      const sheet = ss.getSheetByName(name);
      return sheet && String(sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), 30)).getValues()[0])
        .indexOf('od_sph') !== -1;
    })[0]);

  const legacyCustomers = legacyCustomerName ? readLegacy(legacyCustomerName) : null;
  const newCustomers = [];
  const newExams = [];

  if (legacyCustomers) {
    legacyCustomers.rows.forEach(function (row) {
      const customerId = String(row.id || generateId_('Customers'));
      newCustomers.push({
        id: customerId,
        name: String(row.name || '').trim(),
        phone: String(row.phone || '').trim(),
        email: String(row.email || '').trim(),
        gender: normalizeLegacyGender_(row.gender),
        age: parseInt(row.age, 10) || 0,
        occupation: String(row.occupation || '').trim(),
        faceShape: '', chiefComplaint: '', ocularConditions: '',
        medications: '', familyHistory: '', contactLensUse: '',
        notes: String(row.notes || '').trim(),
        active: true,
        createdAt: todayISO_(),
        updatedAt: nowISO_()
      });

      // ค่าสายตาที่เคยอยู่ในแถวเดียวกับลูกค้า ย้ายมาเป็นผลตรวจ 1 รายการ
      const hasRefraction = ['od_sph', 'od_cyl', 'os_sph', 'os_cyl', 'add', 'pd'].some(function (key) {
        return row[key] !== '' && row[key] !== null && row[key] !== undefined;
      });
      if (!hasRefraction) return;

      const odSph = toNumber_(row.od_sph);
      const odCyl = toNumber_(row.od_cyl);
      const osSph = toNumber_(row.os_sph);
      const osCyl = toNumber_(row.os_cyl);
      const add = toNumber_(row.add);
      const pdFar = toNumber_(row.pd);

      newExams.push({
        id: generateId_('Exams'),
        customerId: customerId,
        examDate: todayISO_(),
        optometrist: '',
        method: 'ค่าจากแว่นเดิม (Lensometry)',
        odSph: odSph, odCyl: odCyl, odAx: parseInt(row.od_ax, 10) || 0, odVa: String(row.od_va || ''),
        osSph: osSph, osCyl: osCyl, osAx: parseInt(row.os_ax, 10) || 0, osVa: String(row.os_va || ''),
        odAdd: add, odNearSph: add ? round2_(odSph + add) : 0, odNearVa: '',
        osAdd: add, osNearSph: add ? round2_(osSph + add) : 0, osNearVa: '',
        pdFar: pdFar, pdNear: pdFar ? round2_(pdFar - 3) : 0, segHeight: 0,
        seOd: round2_(odSph + odCyl / 2),
        seOs: round2_(osSph + osCyl / 2),
        anisometropia: round2_(Math.abs((odSph + odCyl / 2) - (osSph + osCyl / 2))),
        note: 'ย้ายจากโครงสร้างเดิมเมื่อ ' + todayISO_() + ' — วันที่ตรวจจริงไม่ทราบ',
        attachmentUrl: '',
        createdAt: nowISO_()
      });
    });

    plan.customers = newCustomers.length;
    plan.exams = newExams.length;
    plan.warnings.push('ผลตรวจที่ย้ายมาใช้วันที่วันนี้เป็น examDate เพราะโครงสร้างเดิมไม่ได้เก็บวันที่ตรวจ '
      + '— ควรแก้วันที่ให้ตรงความจริงในชีต Exams ภายหลัง');
  }

  /* ---------- สินค้า ---------- */
  const legacyProducts = include('Products') ? readLegacy('Products') : null;
  const newProducts = [];
  if (legacyProducts) {
    legacyProducts.rows.forEach(function (row) {
      newProducts.push({
        id: String(row.id || generateId_('Products')),
        category: normalizeLegacyCategory_(row.category),
        name: String(row.name || '').trim(),
        brand: '',
        barcode: String(row.barcode || '').trim(),
        cost: toNumber_(row.cost),
        price: toNumber_(row.price),
        stock: parseInt(row.stock, 10) || 0,
        minAlert: parseInt(row.minAlert, 10) || 3,
        lensIndex: 0, supplier: '', imageUrl: '',
        active: true, createdAt: todayISO_(), updatedAt: nowISO_()
      });
    });
    plan.products = newProducts.length;
  }

  /* ---------- ใบสั่ง ---------- */
  const legacyOrders = include('Orders') ? readLegacy('Orders') : null;
  const newOrders = [];
  if (legacyOrders) {
    legacyOrders.rows.forEach(function (row) {
      const order = {
        id: String(row.id || generateId_('Orders')),
        customerId: String(row.customerId || ''),
        customerName: String(row.customerName || ''),
        examId: '',
        frameId: String(row.frameId || ''),
        frameName: String(row.frameName || ''),
        lensId: String(row.lensId || ''),
        lensName: String(row.lensName || ''),
        total: toNumber_(row.total),
        discount: toNumber_(row.discount),
        deposit: 0,
        payment: String(row.payment || 'เงินสด'),
        status: ORDER_STATUSES.indexOf(String(row.status)) !== -1 ? String(row.status) : 'รอใบสั่งเลนส์',
        labInstruction: String(row.labInstruction || ''),
        promiseDate: '', deliveredAt: '',
        labFrameType: FRAME_TYPES[0],
        labEdgeTreatment: EDGE_TREATMENTS[0],
        attachmentUrl: '', createdBy: currentUser_(),
        createdAt: String(row.createdAt || todayISO_()).slice(0, 10),
        updatedAt: nowISO_()
      };
      computeOrderTotals_(order);
      computeLabValues_(order);
      newOrders.push(order);
    });
    plan.orders = newOrders.length;
    plan.warnings.push('ใบสั่งเดิมไม่มีสำเนาค่าสายตาและพารามิเตอร์แล็บ คอลัมน์ rx*/lab* จึงเป็นค่าว่าง');
  }

  if (dryRun) return plan;

  /* ---------- เขียนจริง: สำรองชีตเดิม แล้วสร้างใหม่ตาม HEADERS ---------- */
  [legacyCustomerName, include('Products') ? 'Products' : null, include('Orders') ? 'Orders' : null].forEach(function (name) {
    if (!name) return;
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const backupName = name + '_backup_' + stamp;
    sheet.setName(backupName);
    plan.backups.push(backupName);
  });

  const result = ensureAllSheets();
  plan.sheetsCreated = result.created;

  if (newCustomers.length) appendRecords('Customers', newCustomers);
  if (newExams.length) appendRecords('Exams', newExams);
  if (newProducts.length) appendRecords('Products', newProducts);
  if (newOrders.length) appendRecords('Orders', newOrders);

  writeLog_('MIGRATE', '', '', 'OK',
    'customers=' + plan.customers + ' exams=' + plan.exams + ' products=' + plan.products + ' orders=' + plan.orders);

  return plan;
}

/* ==========================================================================
 * 4b. ซ่อมบำรุงฐานข้อมูล
 *
 * ตรวจทุกชีตแล้วเลือกวิธีซ่อมที่เหมาะกับสภาพของชีตนั้น โดยยึด HEADERS เป็นตัวตั้ง
 *
 *   ไม่มีชีต            → สร้างใหม่พร้อมหัวตาราง
 *   หัวตารางว่าง         → เขียนหัวตารางทับได้เลย (ไม่มีข้อมูลให้เสียหาย)
 *   หัวตารางตรงอยู่แล้ว   → ไม่แตะต้อง
 *   Customers โครงเก่า   → ต้องแยกค่าสายตาออกเป็นชีต Exams จึงใช้ migrateLegacySheets()
 *   หัวตารางไม่ตรงอื่น ๆ  → repairSheetHeaders() จับคู่ข้อมูลด้วย "ชื่อคอลัมน์" ไม่ใช่ตำแหน่ง
 *
 * เรียกแบบ dryRun ก่อนได้เสมอ เพื่อดูว่าจะเกิดอะไรขึ้นโดยยังไม่แก้ไขไฟล์
 * ========================================================================== */

/** ตรวจว่าคอลัมน์ของชีตหนึ่งตรงกับ HEADERS หรือไม่ และควรซ่อมด้วยวิธีใด */
function inspectSheet_(ss, name) {
  const expected = headerRow(name);
  const sheet = ss.getSheetByName(name);

  if (!sheet) {
    return { sheet: name, state: 'missing', dataRows: 0, expected: expected, actual: [], plan: 'create' };
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const actual = lastColumn
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) { return String(value).trim(); })
    : [];
  const dataRows = Math.max(lastRow - 1, 0);

  if (!actual.some(function (value) { return value !== ''; })) {
    return { sheet: name, state: 'noHeader', dataRows: dataRows, expected: expected, actual: [], plan: 'writeHeader' };
  }

  const sameLength = actual.length === expected.length;
  const sameOrder = expected.every(function (key, index) { return actual[index] === key; });
  if (sameLength && sameOrder) {
    return { sheet: name, state: 'ok', dataRows: dataRows, expected: expected, actual: actual, plan: 'none' };
  }

  const isLegacyCustomer = name === 'Customers' && actual.indexOf('od_sph') !== -1;
  const keepable = actual.filter(function (key) { return key && expected.indexOf(key) !== -1; });
  const dropped = actual.filter(function (key) { return key && expected.indexOf(key) === -1; });
  const added = expected.filter(function (key) { return actual.indexOf(key) === -1; });

  return {
    sheet: name,
    state: isLegacyCustomer ? 'legacy' : 'mismatch',
    dataRows: dataRows,
    expected: expected,
    actual: actual,
    keptColumns: keepable,
    droppedColumns: dropped,
    addedColumns: added,
    plan: isLegacyCustomer ? 'migrate' : 'repairHeaders'
  };
}

/**
 * ตรวจและซ่อมโครงสร้างฐานข้อมูลทั้งไฟล์
 * @param {Object} options { dryRun: true เพื่อดูแผนก่อนโดยไม่แก้ไขอะไร }
 */
function repairDatabase(options) {
  const opts = options || {};
  const dryRun = opts.dryRun === true;
  const ss = spreadsheet();

  const report = {
    dryRun: dryRun,
    checkedAt: nowISO_(),
    spreadsheetName: ss.getName(),
    sheets: [],
    actions: [],
    warnings: [],
    backups: [],
    needsRepair: false,
    ok: true
  };

  const findings = sheetNames().map(function (name) { return inspectSheet_(ss, name); });
  report.sheets = findings.map(function (item) {
    return {
      sheet: item.sheet,
      state: item.state,
      dataRows: item.dataRows,
      columns: item.actual.length,
      expectedColumns: item.expected.length,
      plan: item.plan,
      droppedColumns: item.droppedColumns || [],
      addedColumns: item.addedColumns || []
    };
  });
  report.needsRepair = findings.some(function (item) { return item.plan !== 'none'; });

  findings.forEach(function (item) {
    if (item.plan === 'none') return;
    if (item.plan === 'create') {
      report.actions.push({ sheet: item.sheet, action: 'สร้างชีตใหม่พร้อมหัวตารางมาตรฐาน' });
    } else if (item.plan === 'writeHeader') {
      report.actions.push({ sheet: item.sheet, action: 'เขียนหัวตารางตาม HEADERS (' + item.expected.length + ' คอลัมน์)' });
    } else if (item.plan === 'migrate') {
      report.actions.push({
        sheet: item.sheet,
        action: 'ย้ายโครงสร้างเดิม — แยกค่าสายตาในแถวลูกค้าออกเป็นผลตรวจในชีต Exams '
          + 'และสำรองชีตเดิมไว้ก่อน (' + item.dataRows + ' แถว)'
      });
    } else {
      report.actions.push({
        sheet: item.sheet,
        action: 'เรียงคอลัมน์ใหม่ตาม HEADERS โดยจับคู่จากชื่อคอลัมน์ (' + item.dataRows + ' แถว)'
          + (item.droppedColumns.length ? ' — คอลัมน์ที่ไม่มีใน HEADERS จะถูกทิ้ง: ' + item.droppedColumns.join(', ') : '')
      });
      if (item.droppedColumns.length) {
        report.warnings.push('ชีต ' + item.sheet + ': คอลัมน์ ' + item.droppedColumns.join(', ')
          + ' ไม่มีอยู่ใน HEADERS จึงจะหายไปหลังซ่อม');
      }
    }
  });

  if (!report.needsRepair) {
    report.summary = 'โครงสร้างทุกชีตตรงกับ HEADERS อยู่แล้ว ไม่ต้องซ่อม';
    return report;
  }

  if (dryRun) {
    report.summary = 'ตรวจพบ ' + report.actions.length + ' ชีตที่ต้องซ่อม (ยังไม่ได้แก้ไขไฟล์)';
    return report;
  }

  /* ---------- ลงมือซ่อมจริง ---------- */
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.lockTimeoutMs)) {
    throw new Error('มีการเขียนข้อมูลอยู่ กรุณาลองใหม่อีกครั้ง');
  }

  try {
    // 1) ชีตที่ต้องย้ายโครงสร้างเดิม ทำก่อนเสมอ เพราะมีการสำรองและสร้างชีตใหม่
    const legacy = findings.filter(function (item) { return item.plan === 'migrate'; });
    if (legacy.length) {
      const migration = migrateLegacySheets({ only: legacy.map(function (item) { return item.sheet; }) });
      report.migration = migration;
      report.backups = report.backups.concat(migration.backups || []);
      report.warnings = report.warnings.concat(migration.warnings || []);
    }

    // 2) ชีตที่ขาด หรือหัวตารางว่าง — สร้าง/เขียนหัวตารางได้โดยไม่กระทบข้อมูล
    findings.filter(function (item) { return item.plan === 'create' || item.plan === 'writeHeader'; })
      .forEach(function (item) {
        let sheet = ss.getSheetByName(item.sheet);
        if (!sheet) sheet = ss.insertSheet(item.sheet);
        applyHeaderRow_(sheet, item.sheet);
        report.actions.push({ sheet: item.sheet, action: 'เสร็จแล้ว', done: true });
      });

    // 3) ชีตที่คอลัมน์ไม่ตรง — เรียงใหม่โดยจับคู่จากชื่อคอลัมน์
    findings.filter(function (item) { return item.plan === 'repairHeaders'; })
      .forEach(function (item) {
        const result = repairSheetHeaders(item.sheet);
        report.actions.push({
          sheet: item.sheet,
          action: 'เรียงคอลัมน์ใหม่แล้ว ย้ายข้อมูล ' + result.movedRows + ' แถว',
          done: true,
          droppedColumns: result.droppedColumns || []
        });
      });

    // 4) ตั้ง username ให้บัญชีเก่าที่ยังมีแต่อีเมล
    //    ถ้าปล่อยไว้จะกลายเป็นแถวที่ล็อกอินไม่ได้และเมนูตั้งรหัสผ่านก็ค้นไม่เจอ
    const renamed = backfillUsernames_();
    if (renamed.length) {
      report.actions.push({
        sheet: 'Users',
        action: 'ตั้งชื่อผู้ใช้จากอีเมลเดิมให้ ' + renamed.length + ' บัญชี: '
          + renamed.map(function (item) { return item.email + ' → ' + item.username; }).join(', '),
        done: true
      });
      report.warnings.push('บัญชีที่ย้ายมาจากระบบเดิมยังไม่มีรหัสผ่าน — '
        + 'ใช้เมนู OptiCare › ตั้งรหัสผ่านใหม่ให้ผู้ใช้ เพื่อให้เข้าระบบได้');
    }

    // 5) สร้างเอกสารโครงสร้างใหม่ให้ตรงกับ HEADERS ล่าสุด
    buildSchemaSheet_(ss);

    // 6) ตรวจซ้ำว่าซ่อมสำเร็จจริง
    const after = sheetNames().map(function (name) { return inspectSheet_(ss, name); });
    const stillBroken = after.filter(function (item) { return item.plan !== 'none'; });
    report.verified = stillBroken.length === 0;
    report.ok = report.verified;
    if (!report.verified) {
      report.remaining = stillBroken.map(function (item) { return item.sheet + ' (' + item.state + ')'; });
      report.warnings.push('ยังมีชีตที่ซ่อมไม่สำเร็จ: ' + report.remaining.join(', '));
    }
    report.sheetsAfter = after.map(function (item) {
      return { sheet: item.sheet, state: item.state, dataRows: item.dataRows, columns: item.expected.length };
    });

    writeLog_('REPAIR', '', '', report.verified ? 'OK' : 'FAIL',
      report.actions.filter(function (a) { return a.done; }).length + ' ชีต');

    report.summary = report.verified
      ? 'ซ่อมเสร็จแล้ว โครงสร้างทุกชีตตรงกับ HEADERS'
      : 'ซ่อมแล้วแต่ยังมีชีตที่ไม่ผ่านการตรวจซ้ำ';
    return report;
  } finally {
    lock.releaseLock();
  }
}

/**
 * ตั้ง username ให้บัญชีที่ย้ายมาจากระบบเดิมซึ่งใช้อีเมลเป็นตัวระบุตัวตน
 * เช่น somchai.p@example.com → somchai.p และเติมเลขต่อท้ายถ้าชื่อชนกัน
 * บัญชีเหล่านี้ยังไม่มีรหัสผ่าน จึงเข้าระบบไม่ได้จนกว่าผู้ดูแลจะตั้งรหัสให้
 * @returns {Array} รายการบัญชีที่ถูกตั้งชื่อใหม่
 */
function backfillUsernames_() {
  const users = readAll('Users');
  const taken = {};
  users.forEach(function (user) {
    const name = String(user.username || '').trim().toLowerCase();
    if (name) taken[name] = true;
  });

  const renamed = [];
  users.forEach(function (user) {
    if (String(user.username || '').trim()) return;

    const email = String(user.email || '').trim().toLowerCase();
    let base = email.split('@')[0].replace(/[^a-z0-9._-]/g, '');
    if (base.length < 3) base = 'user' + String(user.id || '').replace(/[^a-z0-9]/gi, '').slice(-4).toLowerCase();
    if (base.length < 3) base = 'user';
    base = base.slice(0, 28);

    let candidate = base;
    let suffix = 2;
    while (taken[candidate]) candidate = base + suffix++;
    taken[candidate] = true;

    upsertRecord('Users', {
      id: user.id,
      username: candidate,
      note: (user.note ? user.note + ' · ' : '') + 'ย้ายจากระบบเดิม ยังไม่ได้ตั้งรหัสผ่าน'
    }, { skipLog: true });
    renamed.push({ email: email || '(ไม่มีอีเมล)', username: candidate });
  });

  if (renamed.length) {
    writeLog_('BACKFILL_USERNAME', 'Users', '', 'OK', renamed.length + ' บัญชี');
  }
  return renamed;
}

function normalizeLegacyGender_(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'ชาย' || text === 'ช' || text === 'm' || text === 'male') return 'ชาย';
  if (text === 'หญิง' || text === 'ญ' || text === 'f' || text === 'female') return 'หญิง';
  return 'อื่นๆ';
}

function normalizeLegacyCategory_(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text.indexOf('contact') !== -1 || text.indexOf('คอนแทค') !== -1) return 'ContactLens';
  if (text.indexOf('frame') !== -1 || text.indexOf('กรอบ') !== -1) return 'Frame';
  if (text.indexOf('lens') !== -1 || text.indexOf('เลนส์') !== -1) return 'Lens';
  if (text.indexOf('access') !== -1 || text.indexOf('น้ำยา') !== -1 || text.indexOf('อุปกรณ์') !== -1) return 'Accessory';
  return 'Frame';
}

/** สร้างชีตเอกสารโครงสร้างจาก HEADERS ให้คนอ่านโดยไม่ต้องเปิดโค้ด */
function buildSchemaSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.schemaSheetName);
  if (!sheet) sheet = ss.insertSheet(CONFIG.schemaSheetName);
  sheet.clear();

  const rows = [['ชีต', 'ลำดับ', 'คอลัมน์ (key)', 'คำอธิบาย', 'ชนิดข้อมูล', 'จำเป็น', 'ค่าเริ่มต้น', 'ค่าที่ยอมรับ']];
  sheetNames().forEach(function (name) {
    schemaOf(name).forEach(function (column, index) {
      rows.push([
        name,
        index + 1,
        column.key,
        column.label,
        column.type,
        column.required ? 'ใช่' : '',
        column.defaultValue === null ? '' : String(column.defaultValue),
        column.enumValues ? column.enumValues.join(' | ') : ''
      ]);
    });
  });

  ensureGridSize_(sheet, rows[0].length, rows.length);
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(1, 1, 1, rows[0].length)
    .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, rows[0].length);
  sheet.protect().setDescription('สร้างอัตโนมัติจาก HEADERS — แก้ไขที่ Code.gs เท่านั้น')
    .setWarningOnly(true);
}

/** แปลงเลขคอลัมน์เป็นตัวอักษร เช่น 1 → A, 28 → AB */
function columnLetter_(index) {
  let letter = '';
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - remainder) / 26);
  }
  return letter;
}

/* ==========================================================================
 * 4. TYPE COERCION — แปลงค่าระหว่างเซลล์ในชีตกับ JavaScript
 * ========================================================================== */

function nowISO_() {
  return Utilities.formatDate(new Date(), CONFIG.timezone, "yyyy-MM-dd'T'HH:mm:ss");
}

function todayISO_() {
  return Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM-dd');
}

/** แปลงค่าจากเซลล์ในชีต → ค่า JavaScript ตามชนิดที่ประกาศไว้ */
function coerceFromCell_(value, column) {
  const isEmpty = value === '' || value === null || value === undefined;

  switch (column.type) {
    case 'number': {
      if (isEmpty) return column.defaultValue === null ? 0 : column.defaultValue;
      const n = Number(String(value).replace(/,/g, ''));
      return isNaN(n) ? 0 : n;
    }
    case 'int': {
      if (isEmpty) return column.defaultValue === null ? 0 : column.defaultValue;
      const i = parseInt(String(value).replace(/,/g, ''), 10);
      return isNaN(i) ? 0 : i;
    }
    case 'bool': {
      if (isEmpty) return column.defaultValue === null ? false : column.defaultValue;
      if (typeof value === 'boolean') return value;
      return ['true', 'yes', '1', 'ใช่', 'y'].indexOf(String(value).trim().toLowerCase()) !== -1;
    }
    case 'date':
      if (isEmpty) return '';
      if (value instanceof Date) return Utilities.formatDate(value, CONFIG.timezone, 'yyyy-MM-dd');
      return String(value).trim().slice(0, 10);
    case 'datetime':
      if (isEmpty) return '';
      if (value instanceof Date) return Utilities.formatDate(value, CONFIG.timezone, "yyyy-MM-dd'T'HH:mm:ss");
      return String(value).trim();
    case 'json': {
      if (isEmpty) return null;
      try { return JSON.parse(String(value)); } catch (error) { return null; }
    }
    default:
      return isEmpty ? (column.defaultValue === null ? '' : column.defaultValue) : String(value);
  }
}

/** แปลงค่า JavaScript → ค่าที่เขียนลงเซลล์ */
function coerceToCell_(value, column) {
  const isEmpty = value === null || value === undefined || value === '';
  if (isEmpty) {
    if (column.defaultValue !== null) return column.defaultValue;
    return column.type === 'number' || column.type === 'int' ? 0 : '';
  }

  switch (column.type) {
    case 'number': {
      const n = Number(value);
      return isNaN(n) ? 0 : n;
    }
    case 'int': {
      const i = parseInt(value, 10);
      return isNaN(i) ? 0 : i;
    }
    case 'bool':
      return value === true || String(value).toLowerCase() === 'true';
    case 'date':
      return value instanceof Date
        ? Utilities.formatDate(value, CONFIG.timezone, 'yyyy-MM-dd')
        : String(value).slice(0, 10);
    case 'datetime':
      return value instanceof Date
        ? Utilities.formatDate(value, CONFIG.timezone, "yyyy-MM-dd'T'HH:mm:ss")
        : String(value);
    case 'json':
      return typeof value === 'string' ? value : JSON.stringify(value);
    default:
      return String(value);
  }
}

/**
 * ตรวจความถูกต้องของข้อมูลหนึ่งรายการตามสคีมา
 * @returns {Array<string>} รายการข้อผิดพลาด (ว่าง = ผ่าน)
 */
function validateRecord(sheetName, record) {
  const errors = [];
  schemaOf(sheetName).forEach(function (column) {
    const value = record[column.key];
    const isEmpty = value === null || value === undefined || String(value).trim() === '';

    if (column.required && isEmpty && column.defaultValue === null) {
      errors.push('ต้องระบุ "' + column.label + '" (' + column.key + ')');
      return;
    }
    if (!isEmpty && column.enumValues && column.enumValues.indexOf(String(value)) === -1) {
      errors.push('"' + column.label + '" ต้องเป็นค่าใดค่าหนึ่งใน: ' + column.enumValues.join(', '));
    }
    if (!isEmpty && (column.type === 'number' || column.type === 'int') && isNaN(Number(value))) {
      errors.push('"' + column.label + '" ต้องเป็นตัวเลข');
    }
    if (!isEmpty && column.type === 'date' && !/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
      errors.push('"' + column.label + '" ต้องอยู่ในรูปแบบ YYYY-MM-DD');
    }
  });
  return errors;
}

/* ==========================================================================
 * 5. SHEET I/O — อ่าน/เขียนผ่าน HEADERS เท่านั้น
 * ========================================================================== */

function sheetOf_(sheetName) {
  schemaOf(sheetName);
  const sheet = spreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('ยังไม่มีชีต "' + sheetName + '" — เรียก ensureAllSheets() หรือใช้เมนู OptiCare ก่อน');
  }
  return sheet;
}

/**
 * อ่านทุกแถวของชีตเป็น array ของ object โดยใช้ลำดับคอลัมน์จาก HEADERS
 * แถวที่ไม่มีค่าในคอลัมน์แรก (primary key) จะถูกข้าม
 */
function readAll(sheetName) {
  const schema = schemaOf(sheetName);
  const sheet = sheetOf_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rowCount = Math.min(lastRow - 1, CONFIG.maxRows);
  const values = sheet.getRange(2, 1, rowCount, schema.length).getValues();

  const records = [];
  values.forEach(function (row, offset) {
    if (String(row[0]).trim() === '') return;
    const record = {};
    schema.forEach(function (column, index) {
      record[column.key] = coerceFromCell_(row[index], column);
    });
    record._row = offset + 2;
    records.push(record);
  });
  return records;
}

/** อ่านหนึ่งรายการตาม id */
function readOne(sheetName, id) {
  const matches = readAll(sheetName).filter(function (record) {
    return String(record.id) === String(id);
  });
  return matches.length ? matches[0] : null;
}

/** แปลง object → array ตามลำดับคอลัมน์ใน HEADERS */
function toRow_(sheetName, record) {
  return schemaOf(sheetName).map(function (column) {
    return coerceToCell_(record[column.key], column);
  });
}

/** เพิ่มหนึ่งแถวต่อท้ายชีต */
function appendRecord(sheetName, record) {
  const sheet = sheetOf_(sheetName);
  const row = toRow_(sheetName, record);
  sheet.appendRow(row);
  return record;
}

/** เพิ่มหลายแถวพร้อมกัน (เร็วกว่าเรียก appendRecord ทีละครั้งมาก) */
function appendRecords(sheetName, records) {
  if (!records || !records.length) return 0;
  const sheet = sheetOf_(sheetName);
  const rows = records.map(function (record) { return toRow_(sheetName, record); });
  const startRow = sheet.getLastRow() + 1;
  ensureGridSize_(sheet, rows[0].length, startRow + rows.length);
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length;
}

/** เขียนทับแถวเดิมทั้งแถวตามหมายเลขแถวจริงในชีต */
function updateRow_(sheetName, rowNumber, record) {
  const sheet = sheetOf_(sheetName);
  const row = toRow_(sheetName, record);
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  return record;
}

/** ลบหนึ่งรายการตาม id */
function deleteRecord(sheetName, id) {
  const existing = readOne(sheetName, id);
  if (!existing) return false;
  sheetOf_(sheetName).deleteRow(existing._row);
  return true;
}

/**
 * ลบหลายรายการพร้อมกันตามรายการ id
 *
 * สำคัญ: ต้องลบจากแถวล่างขึ้นบนเสมอ เพราะ deleteRow() ทำให้แถวที่อยู่ถัดลงไป
 * เลื่อนเลขขึ้นหนึ่งตำแหน่ง ถ้าลบจากบนลงล่างโดยใช้เลขแถวที่อ่านมาครั้งเดียว
 * จะลบผิดแถวและทำข้อมูลของคนอื่นหายไปด้วย
 *
 * @returns {number} จำนวนแถวที่ลบจริง
 */
function deleteRows_(sheetName, ids) {
  const wanted = {};
  (ids || []).forEach(function (id) { wanted[String(id)] = true; });
  if (!Object.keys(wanted).length) return 0;

  const rowNumbers = readAll(sheetName)
    .filter(function (record) { return wanted[String(record.id)]; })
    .map(function (record) { return record._row; })
    .sort(function (a, b) { return b - a; });

  const sheet = sheetOf_(sheetName);
  rowNumbers.forEach(function (rowNumber) { sheet.deleteRow(rowNumber); });
  return rowNumbers.length;
}

/**
 * บันทึกข้อมูล — มี id เดิมอยู่แล้วจะอัปเดต ไม่มีจะสร้างใหม่
 * ตรวจความถูกต้องตามสคีมาก่อนเขียนเสมอ
 */
function upsertRecord(sheetName, input, options) {
  const opts = options || {};
  const schema = schemaOf(sheetName);
  const existing = input.id ? readOne(sheetName, input.id) : null;

  const record = {};
  schema.forEach(function (column) {
    if (Object.prototype.hasOwnProperty.call(input, column.key)) {
      record[column.key] = input[column.key];
    } else if (existing) {
      record[column.key] = existing[column.key];
    } else {
      record[column.key] = column.defaultValue;
    }
  });

  if (!record.id) record.id = generateId_(sheetName);
  if (!existing && hasColumn_(sheetName, 'createdAt') && !record.createdAt) {
    record.createdAt = schemaColumn_(sheetName, 'createdAt').type === 'date' ? todayISO_() : nowISO_();
  }
  if (hasColumn_(sheetName, 'updatedAt')) record.updatedAt = nowISO_();

  const errors = validateRecord(sheetName, record);
  if (errors.length) {
    throw new Error('ข้อมูลไม่ถูกต้อง: ' + errors.join(' · '));
  }

  if (existing) {
    updateRow_(sheetName, existing._row, record);
  } else {
    appendRecord(sheetName, record);
  }

  if (opts.skipLog !== true) {
    writeLog_(existing ? 'UPDATE' : 'CREATE', sheetName, record.id, 'OK', '');
  }
  return record;
}

function hasColumn_(sheetName, key) {
  return headerRow(sheetName).indexOf(key) !== -1;
}

function schemaColumn_(sheetName, key) {
  const matches = schemaOf(sheetName).filter(function (column) { return column.key === key; });
  return matches.length ? matches[0] : null;
}

/** สร้างรหัสใหม่ตามชนิดข้อมูล เช่น C-260910-4821 หรือ ORD-260910-4821 */
function generateId_(sheetName) {
  const prefixes = {
    Customers: 'C', Exams: 'EX', Products: 'P',
    Orders: 'ORD', StockMoves: 'SM', ActivityLog: 'LOG'
  };
  const prefix = prefixes[sheetName] || 'ID';
  const stamp = Utilities.formatDate(new Date(), CONFIG.timezone, 'yyMMdd');
  const random = Math.floor(1000 + Math.random() * 9000);
  return prefix + '-' + stamp + '-' + random;
}

/** เขียนบันทึกการใช้งาน — ห้ามให้ล้มเหลวจนกระทบงานหลัก */
function writeLog_(action, entity, entityId, status, detail) {
  try {
    appendRecord('ActivityLog', {
      id: generateId_('ActivityLog'),
      timestamp: nowISO_(),
      action: action,
      entity: entity || '',
      entityId: entityId || '',
      user: currentUser_(),
      status: status || 'OK',
      detail: detail ? String(detail).slice(0, 500) : ''
    });
  } catch (error) {
    console.warn('เขียน ActivityLog ไม่สำเร็จ: ' + error.message);
  }
}

function currentUser_() {
  try {
    return Session.getActiveUser().getEmail() || 'api';
  } catch (error) {
    return 'api';
  }
}

/* ==========================================================================
 * 6. REPOSITORY — การทำงานเฉพาะของแต่ละ entity
 * ========================================================================== */

/** ผู้รับบริการพร้อมประวัติการตรวจทั้งหมด (เรียงใหม่ → เก่า) */
function getCustomerWithExams(customerId) {
  const customer = readOne('Customers', customerId);
  if (!customer) return null;
  customer.exams = readAll('Exams')
    .filter(function (exam) { return String(exam.customerId) === String(customerId); })
    .sort(function (a, b) { return a.examDate < b.examDate ? 1 : a.examDate > b.examDate ? -1 : 0; });
  return customer;
}

/** รายชื่อผู้รับบริการพร้อมผลตรวจล่าสุดของแต่ละคน */
function listCustomers(options) {
  const opts = options || {};
  const exams = readAll('Exams');
  const latestByCustomer = {};

  exams.forEach(function (exam) {
    const current = latestByCustomer[exam.customerId];
    if (!current || exam.examDate > current.examDate) latestByCustomer[exam.customerId] = exam;
  });

  return readAll('Customers')
    .filter(function (customer) { return opts.includeInactive === true || customer.active !== false; })
    .map(function (customer) {
      customer.latestExam = latestByCustomer[customer.id] || null;
      customer.examCount = exams.filter(function (exam) {
        return String(exam.customerId) === String(customer.id);
      }).length;
      return customer;
    });
}

/**
 * บันทึกผลการตรวจครั้งใหม่ พร้อมคำนวณค่าทางคลินิกเก็บลงชีต
 * ผลตรวจของผู้รับบริการคนเดิมในวันเดียวกันจะถูกเขียนทับ ไม่สร้างรายการซ้ำ
 */
function saveExam(input) {
  if (!input || !input.customerId) throw new Error('ต้องระบุ customerId');
  if (!readOne('Customers', input.customerId)) {
    throw new Error('ไม่พบผู้รับบริการรหัส ' + input.customerId);
  }

  const record = Object.assign({}, input);
  record.examDate = record.examDate || todayISO_();

  // คำนวณค่าทางคลินิกที่ระบบใช้อ้างอิงบ่อย เก็บไว้ในชีตเพื่อให้เปิดดูได้ทันที
  record.seOd = round2_(toNumber_(record.odSph) + toNumber_(record.odCyl) / 2);
  record.seOs = round2_(toNumber_(record.osSph) + toNumber_(record.osCyl) / 2);
  record.anisometropia = round2_(Math.abs(record.seOd - record.seOs));

  // Near SPH คำนวณจาก Distance SPH + ADD หากยังไม่ได้ระบุมา
  if (!record.odNearSph && toNumber_(record.odAdd)) {
    record.odNearSph = round2_(toNumber_(record.odSph) + toNumber_(record.odAdd));
  }
  if (!record.osNearSph && toNumber_(record.osAdd)) {
    record.osNearSph = round2_(toNumber_(record.osSph) + toNumber_(record.osAdd));
  }

  const sameDay = readAll('Exams').filter(function (exam) {
    return String(exam.customerId) === String(record.customerId) && exam.examDate === record.examDate;
  });
  if (sameDay.length && !record.id) record.id = sameDay[0].id;

  const saved = upsertRecord('Exams', record);

  // อัปเดตวันแก้ไขล่าสุดของผู้รับบริการให้สอดคล้องกัน
  const customer = readOne('Customers', record.customerId);
  if (customer) upsertRecord('Customers', { id: customer.id }, { skipLog: true });

  return saved;
}

function toNumber_(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

/**
 * ปัดทศนิยม 2 ตำแหน่งแบบ "ครึ่งหนึ่งปัดออกจากศูนย์"
 * Math.round() ปัด -6.125 เป็น -6.12 (ปัดขึ้นเสมอ) ซึ่งไม่ตรงกับ toFixed(2) ที่ฝั่งหน้าเว็บใช้
 * ค่าสายตาเป็นข้อมูลทางคลินิก จึงต้องให้ทั้งสองฝั่งได้ตัวเลขเดียวกันเสมอ
 */
function round2_(value) {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100) / 100;
}

/* ==========================================================================
 * 7. BUSINESS LOGIC — งานที่ต้องแตะหลายตารางพร้อมกัน
 * ========================================================================== */

/**
 * เปิดบิลขาย: บันทึกใบสั่ง ตัดสต็อก และบันทึกความเคลื่อนไหวสต็อกในครั้งเดียว
 * ใช้ LockService ป้องกันการตัดสต็อกซ้ำเมื่อมีการเปิดบิลพร้อมกันหลายเครื่อง
 */
function createOrder(input) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.lockTimeoutMs)) {
    throw new Error('ระบบกำลังมีการบันทึกรายการอื่นอยู่ กรุณาลองใหม่อีกครั้ง');
  }

  try {
    if (!input || !input.customerId) throw new Error('ต้องระบุ customerId');
    const customer = readOne('Customers', input.customerId);
    if (!customer) throw new Error('ไม่พบผู้รับบริการรหัส ' + input.customerId);

    const order = Object.assign({}, input);
    order.customerName = order.customerName || customer.name;
    order.createdAt = order.createdAt || todayISO_();
    order.createdBy = currentUser_();

    // ตรวจสต็อกก่อนตัด และเก็บชื่อสินค้าไว้ในใบสั่ง
    const toDeduct = [];
    [['frameId', 'frameName'], ['lensId', 'lensName']].forEach(function (pair) {
      const productId = order[pair[0]];
      if (!productId) return;
      const product = readOne('Products', productId);
      if (!product) throw new Error('ไม่พบสินค้ารหัส ' + productId);
      if (product.stock <= 0) throw new Error('สินค้า "' + product.name + '" หมดสต็อก');
      order[pair[1]] = product.name;
      toDeduct.push(product);
    });

    if (!toDeduct.length) throw new Error('ต้องเลือกกรอบแว่นหรือเลนส์อย่างน้อยหนึ่งรายการ');

    // ถ้าไม่ได้ส่งค่าสายตามา ให้ดึงผลตรวจล่าสุดของผู้รับบริการมาเป็นสำเนา
    if (!order.rxDate) applyLatestRx_(order, input.customerId);

    // คำนวณยอดเงินและค่าสำหรับห้องแล็บ
    computeOrderTotals_(order);
    computeLabValues_(order);

    if (!order.status) order.status = order.lensId ? 'รอใบสั่งเลนส์' : 'รอรับสินค้า';

    const saved = upsertRecord('Orders', order, { skipLog: true });

    toDeduct.forEach(function (product) {
      adjustStock({
        productId: product.id,
        quantity: -1,
        type: 'SALE',
        refType: 'Order',
        refId: saved.id,
        note: 'ตัดสต็อกจากการเปิดบิล'
      }, { skipLock: true });
    });

    writeLog_('CREATE_ORDER', 'Orders', saved.id, 'OK', 'ยอดสุทธิ ' + saved.finalTotal);
    return saved;
  } finally {
    lock.releaseLock();
  }
}

/** คัดลอกผลตรวจล่าสุดของผู้รับบริการมาเป็นสำเนาค่าสายตาในใบสั่ง */
function applyLatestRx_(order, customerId) {
  const exams = readAll('Exams')
    .filter(function (exam) { return String(exam.customerId) === String(customerId); })
    .sort(function (a, b) { return a.examDate < b.examDate ? 1 : -1; });
  if (!exams.length) return;

  const latest = exams[0];
  order.examId = latest.id;
  order.rxDate = latest.examDate;
  order.rxOdSph = latest.odSph;
  order.rxOdCyl = latest.odCyl;
  order.rxOdAx = latest.odAx;
  order.rxOdAdd = latest.odAdd;
  order.rxOsSph = latest.osSph;
  order.rxOsCyl = latest.osCyl;
  order.rxOsAx = latest.osAx;
  order.rxOsAdd = latest.osAdd;
  order.rxPdFar = latest.pdFar;
  order.rxPdNear = latest.pdNear;
  order.rxSegHeight = latest.segHeight;
}

function computeOrderTotals_(order) {
  const total = toNumber_(order.total);
  const discount = Math.min(Math.max(toNumber_(order.discount), 0), total);
  const finalTotal = Math.max(0, total - discount);
  const deposit = Math.min(Math.max(toNumber_(order.deposit), 0), finalTotal);

  order.discount = discount;
  order.finalTotal = finalTotal;
  order.deposit = deposit;
  order.balance = finalTotal - deposit;
}

/**
 * คำนวณค่าที่ห้องแล็บต้องใช้
 *   ระยะเยื้องศูนย์ = (A + DBL)/2 − Mono PD
 *   เลนส์ดิบขั้นต่ำ = ED + 2×|ระยะเยื้องศูนย์| + 2 มม.
 */
function computeLabValues_(order) {
  const a = toNumber_(order.labA);
  const dbl = toNumber_(order.labDbl);
  const ed = toNumber_(order.labEd);

  [['labMonoPdOd', 'labDecentrationOd', 'labMinBlankOd'],
   ['labMonoPdOs', 'labDecentrationOs', 'labMinBlankOs']].forEach(function (keys) {
    const monoPd = toNumber_(order[keys[0]]);
    if (!a || !dbl || !monoPd) {
      order[keys[1]] = 0;
      order[keys[2]] = 0;
      return;
    }
    const decentration = (a + dbl) / 2 - monoPd;
    order[keys[1]] = round2_(decentration);
    order[keys[2]] = ed ? round2_(ed + 2 * Math.abs(decentration) + 2) : 0;
  });
}

/** เปลี่ยนสถานะใบสั่ง และคืนสต็อกอัตโนมัติเมื่อยกเลิก */
function updateOrderStatus(orderId, newStatus) {
  if (ORDER_STATUSES.indexOf(newStatus) === -1) {
    throw new Error('สถานะไม่ถูกต้อง — ต้องเป็น: ' + ORDER_STATUSES.join(', '));
  }
  const order = readOne('Orders', orderId);
  if (!order) throw new Error('ไม่พบใบสั่งเลขที่ ' + orderId);
  if (order.status === newStatus) return order;

  const wasCancelled = order.status === 'ยกเลิก';
  order.status = newStatus;
  if (newStatus === 'สำเร็จ' && !order.deliveredAt) order.deliveredAt = todayISO_();

  const saved = upsertRecord('Orders', order, { skipLog: true });

  // คืนสต็อกเมื่อเปลี่ยนเป็นยกเลิก และตัดกลับเมื่อยกเลิกการยกเลิก
  if (newStatus === 'ยกเลิก' && !wasCancelled) {
    returnOrderStock_(saved, 1, 'คืนสต็อกจากการยกเลิกใบสั่ง');
  } else if (wasCancelled && newStatus !== 'ยกเลิก') {
    returnOrderStock_(saved, -1, 'ตัดสต็อกอีกครั้งจากการเปิดใบสั่งกลับ');
  }

  writeLog_('UPDATE_STATUS', 'Orders', orderId, 'OK', newStatus);
  return saved;
}

function returnOrderStock_(order, direction, note) {
  [order.frameId, order.lensId].forEach(function (productId) {
    if (!productId) return;
    adjustStock({
      productId: productId,
      quantity: direction,
      type: direction > 0 ? 'RETURN' : 'SALE',
      refType: 'Order',
      refId: order.id,
      note: note
    });
  });
}

/**
 * ลบผู้รับบริการออกจากฐานข้อมูลจริง พร้อมผลตรวจทั้งหมดของคนนั้น
 *
 * ผลตรวจไม่มีความหมายถ้าไม่มีเจ้าของ จึงลบตามไปด้วยเสมอ
 * ส่วนใบสั่งเป็นหลักฐานการขายและเก็บสำเนาชื่อลูกค้าไว้ในตัวเองแล้ว จึงเก็บไว้เป็นค่าเริ่มต้น
 * เว้นแต่ผู้เรียกยืนยันมาว่าให้ลบด้วย (purgeOrders)
 *
 * @param {string} customerId
 * @param {Object} options { purgeOrders: true เพื่อลบใบสั่งของลูกค้ารายนี้ด้วย }
 * @returns {Object} สรุปว่าลบอะไรไปบ้าง
 */
function deleteCustomerCascade(customerId, options) {
  const opts = options || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.lockTimeoutMs)) {
    throw new Error('มีการเขียนข้อมูลอยู่ กรุณาลองใหม่อีกครั้ง');
  }

  try {
    const customer = readOne('Customers', customerId);
    if (!customer) throw new Error('ไม่พบผู้รับบริการรหัส ' + customerId);

    const examIds = readAll('Exams')
      .filter(function (exam) { return String(exam.customerId) === String(customerId); })
      .map(function (exam) { return exam.id; });

    const orders = readAll('Orders')
      .filter(function (order) { return String(order.customerId) === String(customerId); });

    const deletedExams = deleteRows_('Exams', examIds);
    const deletedOrders = opts.purgeOrders
      ? deleteRows_('Orders', orders.map(function (order) { return order.id; }))
      : 0;

    // ลบแถวลูกค้าเป็นลำดับสุดท้าย เพื่อให้ถ้าขั้นก่อนหน้าพังจะยังหาเจ้าของข้อมูลเจอ
    deleteRecord('Customers', customerId);

    writeLog_('DELETE', 'Customers', customerId, 'OK',
      (customer.name || '') + ' · ผลตรวจ ' + deletedExams + ' รายการ'
      + (opts.purgeOrders ? ' · ใบสั่ง ' + deletedOrders + ' ใบ' : ' · เก็บใบสั่งไว้ ' + orders.length + ' ใบ'));

    return {
      deleted: true,
      customerId: customerId,
      customerName: customer.name || '',
      deletedExams: deletedExams,
      deletedOrders: deletedOrders,
      keptOrders: opts.purgeOrders ? 0 : orders.length
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ลบใบสั่งออกจากฐานข้อมูลจริง พร้อมคืนสต็อกกรอบและเลนส์ให้อัตโนมัติ
 * @param {Object} options { restoreStock: false เพื่อไม่คืนสต็อก (เช่นของถูกใช้ไปแล้ว) }
 */
function deleteOrderRecord(orderId, options) {
  const opts = options || {};
  const order = readOne('Orders', orderId);
  if (!order) throw new Error('ไม่พบใบสั่งรหัส ' + orderId);

  const restore = opts.restoreStock !== false;
  if (restore) {
    returnOrderStock_(order, 1, 'ยกเลิกใบสั่ง ' + orderId + ' — คืนสต็อก');
  }
  deleteRecord('Orders', orderId);

  writeLog_('DELETE', 'Orders', orderId, 'OK',
    (order.customerName || '') + (restore ? ' · คืนสต็อกแล้ว' : ' · ไม่คืนสต็อก'));

  return { deleted: true, orderId: orderId, stockRestored: restore };
}

/**
 * ลบสินค้าออกจากฐานข้อมูลจริง
 *
 * ถ้ามีใบสั่งอ้างถึงอยู่จะลบไม่ได้ เพราะจะทำให้ใบสั่งเดิมชี้ไปยังสินค้าที่ไม่มีอยู่
 * กรณีนั้นให้ปิดการใช้งาน (active = FALSE) แทน สินค้าจะหายจากรายการขายแต่ใบสั่งเดิมยังอ่านได้
 */
function deleteProductRecord(productId) {
  const product = readOne('Products', productId);
  if (!product) throw new Error('ไม่พบสินค้ารหัส ' + productId);

  const linkedOrders = readAll('Orders').filter(function (order) {
    return String(order.frameId) === String(productId) || String(order.lensId) === String(productId);
  });

  if (linkedOrders.length) {
    const error = new Error('สินค้านี้ถูกอ้างถึงในใบสั่ง ' + linkedOrders.length
      + ' ใบ จึงลบออกจากฐานข้อมูลไม่ได้ — ระบบปิดการใช้งานให้แทน สินค้าจะไม่ปรากฏในรายการขายอีก');
    upsertRecord('Products', { id: productId, active: false });
    error.deactivated = true;
    throw error;
  }

  // ประวัติการเคลื่อนไหวสต็อกของสินค้าที่ถูกลบไม่มีประโยชน์อีก ลบตามไปด้วย
  const moveIds = readAll('StockMoves')
    .filter(function (move) { return String(move.productId) === String(productId); })
    .map(function (move) { return move.id; });
  const deletedMoves = deleteRows_('StockMoves', moveIds);

  deleteRecord('Products', productId);
  writeLog_('DELETE', 'Products', productId, 'OK',
    (product.name || '') + ' · ความเคลื่อนไหวสต็อก ' + deletedMoves + ' รายการ');

  return { deleted: true, productId: productId, deletedStockMoves: deletedMoves };
}

/**
 * ปรับสต็อกสินค้าพร้อมบันทึกความเคลื่อนไหว
 * @param {Object} input { productId, quantity (+/-), type, refType, refId, note }
 */
function adjustStock(input, options) {
  const opts = options || {};
  const lock = opts.skipLock === true ? null : LockService.getScriptLock();
  if (lock && !lock.tryLock(CONFIG.lockTimeoutMs)) {
    throw new Error('ระบบกำลังปรับสต็อกรายการอื่นอยู่ กรุณาลองใหม่');
  }

  try {
    const product = readOne('Products', input.productId);
    if (!product) throw new Error('ไม่พบสินค้ารหัส ' + input.productId);

    const quantity = parseInt(input.quantity, 10);
    if (!quantity) throw new Error('จำนวนที่ปรับต้องไม่เป็นศูนย์');

    const balanceAfter = Math.max(0, product.stock + quantity);
    upsertRecord('Products', { id: product.id, stock: balanceAfter }, { skipLog: true });

    appendRecord('StockMoves', {
      id: generateId_('StockMoves'),
      movedAt: nowISO_(),
      productId: product.id,
      productName: product.name,
      type: input.type || (quantity > 0 ? 'RECEIVE' : 'SALE'),
      quantity: quantity,
      balanceAfter: balanceAfter,
      refType: input.refType || '',
      refId: input.refId || '',
      note: input.note || '',
      user: currentUser_()
    });

    return { productId: product.id, stock: balanceAfter };
  } finally {
    if (lock) lock.releaseLock();
  }
}

/** สรุปตัวเลขสำหรับแผงควบคุม */
function getDashboard() {
  const orders = readAll('Orders');
  const products = readAll('Products');
  const customers = readAll('Customers');
  const exams = readAll('Exams');

  const thisMonth = Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM');
  const previous = new Date();
  previous.setMonth(previous.getMonth() - 1);
  const lastMonth = Utilities.formatDate(previous, CONFIG.timezone, 'yyyy-MM');

  const delivered = orders.filter(function (order) { return order.status === 'สำเร็จ'; });
  const productById = {};
  products.forEach(function (product) { productById[product.id] = product; });

  const revenueOf = function (month) {
    return delivered
      .filter(function (order) { return String(order.createdAt).slice(0, 7) === month; })
      .reduce(function (sum, order) { return sum + toNumber_(order.finalTotal); }, 0);
  };

  const monthOrders = delivered.filter(function (order) {
    return String(order.createdAt).slice(0, 7) === thisMonth;
  });
  const grossProfit = monthOrders.reduce(function (sum, order) {
    const frame = productById[order.frameId];
    const lens = productById[order.lensId];
    const cost = (frame ? toNumber_(frame.cost) : 0) + (lens ? toNumber_(lens.cost) : 0);
    return sum + toNumber_(order.finalTotal) - cost;
  }, 0);

  const pending = orders.filter(function (order) {
    return order.status !== 'สำเร็จ' && order.status !== 'ยกเลิก';
  });
  const today = todayISO_();
  const overdue = pending.filter(function (order) {
    return order.promiseDate && order.promiseDate < today;
  });

  const latestExamByCustomer = {};
  exams.forEach(function (exam) {
    const current = latestExamByCustomer[exam.customerId];
    if (!current || exam.examDate > current) latestExamByCustomer[exam.customerId] = exam.examDate;
  });
  const recallCutoff = Utilities.formatDate(
    new Date(new Date().getTime() - 365 * 86400000), CONFIG.timezone, 'yyyy-MM-dd'
  );
  const recallDue = customers.filter(function (customer) {
    const last = latestExamByCustomer[customer.id];
    return last && last < recallCutoff;
  });

  const revenue = revenueOf(thisMonth);
  return {
    month: thisMonth,
    revenue: revenue,
    revenueLastMonth: revenueOf(lastMonth),
    grossProfit: round2_(grossProfit),
    grossMarginPercent: revenue ? round2_((grossProfit / revenue) * 100) : 0,
    averageTicket: delivered.length
      ? round2_(delivered.reduce(function (sum, order) { return sum + toNumber_(order.finalTotal); }, 0) / delivered.length)
      : 0,
    deliveredCount: delivered.length,
    pendingLabCount: pending.length,
    overdueLabCount: overdue.length,
    customerCount: customers.length,
    newCustomersThisMonth: customers.filter(function (customer) {
      return String(customer.createdAt).slice(0, 7) === thisMonth;
    }).length,
    lowStockCount: products.filter(function (product) {
      return product.stock <= product.minAlert;
    }).length,
    recallDueCount: recallDue.length,
    recallDue: recallDue.map(function (customer) {
      return { id: customer.id, name: customer.name, phone: customer.phone, lastExam: latestExamByCustomer[customer.id] };
    })
  };
}

/* ==========================================================================
 * 8. DRIVE — ไฟล์แนบ
 * ========================================================================== */

function attachmentFolder_() {
  try {
    return DriveApp.getFolderById(FOLDER_ID);
  } catch (error) {
    throw new Error('เข้าถึงโฟลเดอร์ Drive ไม่ได้ (FOLDER_ID: ' + FOLDER_ID + ') — ' + error.message);
  }
}

/**
 * อัปโหลดไฟล์แนบเข้าโฟลเดอร์ Drive แล้วคืน URL
 * @param {Object} input { fileName, mimeType, base64, entity, entityId }
 */
function uploadAttachment(input) {
  if (!input || !input.base64) throw new Error('ต้องส่งข้อมูลไฟล์แบบ base64');

  const bytes = Utilities.base64Decode(input.base64);
  if (bytes.length > CONFIG.maxUploadBytes) {
    throw new Error('ไฟล์ใหญ่เกิน ' + Math.round(CONFIG.maxUploadBytes / 1024 / 1024) + ' MB');
  }

  const safeName = String(input.fileName || 'attachment')
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 120);
  const prefix = input.entityId ? input.entityId + '_' : '';
  const blob = Utilities.newBlob(bytes, input.mimeType || 'application/octet-stream', prefix + safeName);

  const file = attachmentFolder_().createFile(blob);
  file.setDescription('OptiCare · ' + (input.entity || '-') + ' · ' + (input.entityId || '-') + ' · ' + nowISO_());

  const url = file.getUrl();

  // ผูก URL กลับเข้ากับข้อมูลต้นทาง ถ้าตารางนั้นมีคอลัมน์ attachmentUrl
  if (input.entity && input.entityId && hasColumn_(input.entity, 'attachmentUrl')) {
    upsertRecord(input.entity, { id: input.entityId, attachmentUrl: url }, { skipLog: true });
  } else if (input.entity === 'Products' && input.entityId) {
    upsertRecord('Products', { id: input.entityId, imageUrl: url }, { skipLog: true });
  }

  writeLog_('UPLOAD', input.entity || '', input.entityId || '', 'OK', file.getName());
  return { fileId: file.getId(), name: file.getName(), url: url, size: bytes.length };
}

/* ==========================================================================
 * 8b. AUTHENTICATION & AUTHORIZATION
 *
 * แนวทาง: บัญชีผู้ใช้ + รหัสผ่าน ที่ผู้ดูแลระบบสร้างให้ ไม่พึ่งบริการล็อกอินภายนอก
 *   1) ผู้ดูแลสร้างบัญชีจากเมนูในสเปรดชีต ระบบสุ่มรหัสผ่านชั่วคราวให้
 *   2) หน้าเว็บส่ง { username, password } มาที่ action "login"
 *   3) เซิร์ฟเวอร์แฮชรหัสผ่านด้วย salt ประจำบัญชี + pepper ลับ แล้วเทียบกับค่าในตาราง Users
 *   4) ถ้าผ่าน ออก session token อายุสั้นที่เซ็นด้วยกุญแจลับฝั่งเซิร์ฟเวอร์
 *   5) ทุกคำขอถัดไปต้องแนบ session token และผ่านการตรวจบทบาทเสมอ
 *
 * สิ่งที่ระบบไม่เก็บ: รหัสผ่านจริง — ชีตเก็บเฉพาะ salt กับค่าแฮช
 * สิ่งที่ไม่อยู่ในชีต: pepper ซึ่งอยู่ใน Script Properties คนที่เห็นชีตอย่างเดียวจึงเดารหัสผ่านไม่ได้
 * เบราว์เซอร์ปลอม session token ไม่ได้เพราะไม่รู้กุญแจลับ การตรวจสิทธิ์เกิดฝั่งเซิร์ฟเวอร์เท่านั้น
 * ========================================================================== */

/** สิทธิ์ของแต่ละ action — '*' คือผู้ใช้ที่ล็อกอินแล้วทุกบทบาท */
const ACTION_PERMISSIONS = Object.freeze({
  ping: ['*'],
  changePassword: ['*'],
  me: ['*'],
  dashboard: ALL_ROLES,

  schema: ['owner', 'admin'],
  validate: ['owner', 'admin'],
  diagnose: ['owner', 'admin'],
  bootstrap: ['owner'],
  repair: ['owner'],
  repairPreview: ['owner', 'admin'],
  repairDatabase: ['owner'],
  migrate: ['owner'],

  pullAll: ALL_ROLES,
  listCustomers: ALL_ROLES,
  getCustomer: ALL_ROLES,
  saveCustomer: ['owner', 'admin', 'optometrist', 'staff'],
  deleteCustomer: ['owner', 'admin'],
  deactivateCustomer: ['owner', 'admin'],

  listExams: ALL_ROLES,
  saveExam: ['owner', 'admin', 'optometrist'],

  listProducts: ALL_ROLES,
  saveProduct: ['owner', 'admin', 'staff'],
  deleteProduct: ['owner', 'admin'],
  deactivateProduct: ['owner', 'admin'],
  adjustStock: ['owner', 'admin', 'staff'],
  listStockMoves: ['owner', 'admin', 'staff'],

  listOrders: ALL_ROLES,
  getOrder: ALL_ROLES,
  createOrder: ['owner', 'admin', 'optometrist', 'staff'],
  updateOrder: ['owner', 'admin', 'staff'],
  updateOrderStatus: ['owner', 'admin', 'optometrist', 'staff'],
  deleteOrder: ['owner', 'admin'],

  upload: ['owner', 'admin', 'optometrist', 'staff'],

  listUsers: ['owner', 'admin'],
  saveUser: ['owner', 'admin'],
  deleteUser: ['owner', 'admin']
});

/** action ที่เรียกได้โดยยังไม่ล็อกอิน */
const PUBLIC_ACTIONS = Object.freeze(['login', 'authStatus']);

function scriptProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/** สร้างค่าลับใน Script Properties ครั้งแรกที่เรียก แล้วใช้ค่าเดิมตลอด */
function ensureSecret_(key) {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty(key);
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty(key, secret);
  }
  return secret;
}

/* ---------- รหัสผ่าน ---------- */

/**
 * แฮชรหัสผ่านด้วย HMAC-SHA256 โดยใช้ salt ประจำบัญชี + pepper ลับของเซิร์ฟเวอร์
 *
 * salt   อยู่ในชีต ต่างกันทุกบัญชี ทำให้รหัสผ่านซ้ำกันได้ค่าแฮชคนละค่า
 * pepper อยู่ใน Script Properties ไม่ได้อยู่ในชีต คนที่เห็นเฉพาะชีต (เช่นคนที่ถูกแชร์ไฟล์)
 *        จึงเดารหัสผ่านแบบออฟไลน์ไม่ได้เลยแม้จะได้ค่าแฮชไป
 */
function hashPassword_(password, salt) {
  const pepper = ensureSecret_(CONFIG.passwordPepperProperty);
  const signature = Utilities.computeHmacSha256Signature(String(salt) + ':' + String(password), pepper);
  return Utilities.base64Encode(signature);
}

function newSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

/** ตรวจว่ารหัสผ่านแข็งแรงพอตามเกณฑ์ขั้นต่ำ */
function assertPasswordStrength_(password) {
  const value = String(password || '');
  if (value.length < CONFIG.minPasswordLength) {
    throw new Error('รหัสผ่านต้องยาวอย่างน้อย ' + CONFIG.minPasswordLength + ' ตัวอักษร');
  }
  if (!/[A-Za-z฀-๿]/.test(value) || !/[0-9]/.test(value)) {
    throw new Error('รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข');
  }
}

/** สร้างรหัสผ่านสุ่มที่อ่านออกง่าย ไม่มีตัวอักษรที่สับสน (0/O, 1/l/I) */
function generatePassword_() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += letters.charAt(Math.floor(Math.random() * letters.length));
  for (let i = 0; i < 3; i++) out += digits.charAt(Math.floor(Math.random() * digits.length));
  return out;
}

/** ชื่อผู้ใช้: ตัวอักษรอังกฤษ ตัวเลข จุด ขีดล่าง ขีดกลาง 3–32 ตัว ไม่สนตัวพิมพ์ */
function normalizeUsername_(username) {
  const value = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(value)) {
    throw new Error('ชื่อผู้ใช้ต้องเป็นตัวอักษรอังกฤษ ตัวเลข . _ - ยาว 3–32 ตัว');
  }
  return value;
}

/* ---------- การล็อกบัญชีเมื่อกรอกรหัสผิดซ้ำ ---------- */

function attemptKey_(username) {
  return 'LOGIN_FAIL_' + username;
}

/** @returns {number} นาทีที่ยังต้องรอ หรือ 0 ถ้าไม่ถูกล็อก */
function lockoutRemaining_(username) {
  const raw = scriptProperty_(attemptKey_(username));
  if (!raw) return 0;
  let record;
  try { record = JSON.parse(raw); } catch (error) { return 0; }
  if (!record.lockedUntil || record.lockedUntil < Date.now()) return 0;
  return Math.ceil((record.lockedUntil - Date.now()) / 60000);
}

function recordLoginFailure_(username) {
  const properties = PropertiesService.getScriptProperties();
  const key = attemptKey_(username);
  let record = { count: 0, lockedUntil: 0 };
  try { record = JSON.parse(properties.getProperty(key) || '') || record; } catch (error) { /* เริ่มนับใหม่ */ }

  record.count = (record.count || 0) + 1;
  if (record.count >= CONFIG.maxLoginAttempts) {
    record.lockedUntil = Date.now() + CONFIG.lockoutMinutes * 60000;
    record.count = 0;
  }
  properties.setProperty(key, JSON.stringify(record));
}

function clearLoginFailures_(username) {
  PropertiesService.getScriptProperties().deleteProperty(attemptKey_(username));
}

/** กุญแจลับสำหรับเซ็น session token — สร้างอัตโนมัติครั้งแรกที่ใช้ */
function sessionSecret_() {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty(CONFIG.sessionSecretProperty);
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty(CONFIG.sessionSecretProperty, secret);
  }
  return secret;
}

function base64UrlEncode_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function signPayload_(payload) {
  return base64UrlEncode_(Utilities.computeHmacSha256Signature(payload, sessionSecret_()));
}

/** เปรียบเทียบสตริงแบบใช้เวลาคงที่ ลดโอกาสเดาลายเซ็นจากเวลาตอบสนอง */
function safeEquals_(a, b) {
  const left = String(a);
  const right = String(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * ออก session token อายุสั้นที่เซ็นด้วยกุญแจลับฝั่งเซิร์ฟเวอร์
 * เก็บเฉพาะอีเมลกับเวลาหมดอายุ — บทบาทและชื่อถูกอ่านใหม่จากตาราง Users ทุกคำขอ
 * ทำให้การเปลี่ยนสิทธิ์มีผลทันที และ token ไม่มีข้อมูลส่วนบุคคลติดไปด้วย
 */
function issueSessionToken_(user) {
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    username: user.username,
    exp: Date.now() + CONFIG.sessionTtlMinutes * 60000
  })).replace(/=+$/, '');
  return payload + '.' + signPayload_(payload);
}

/** ตรวจ session token แล้วคืนข้อมูลผู้ใช้ — โยน error ถ้าปลอมหรือหมดอายุ */
function verifySessionToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('รูปแบบ session token ไม่ถูกต้อง');
  if (!safeEquals_(parts[1], signPayload_(parts[0]))) throw new Error('session token ถูกแก้ไขหรือไม่ถูกต้อง');

  let claims;
  try {
    claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (error) {
    throw new Error('อ่าน session token ไม่ได้');
  }
  if (!claims.exp || claims.exp < Date.now()) throw new Error('เซสชันหมดอายุ กรุณาล็อกอินใหม่');
  return claims;
}

/** ค้นหาผู้ใช้จากชื่อผู้ใช้ (ไม่สนตัวพิมพ์เล็กใหญ่) */
function findUserByUsername_(username) {
  const target = String(username || '').trim().toLowerCase();
  if (!target) return null;
  const matches = readAll('Users').filter(function (user) {
    return String(user.username).trim().toLowerCase() === target;
  });
  return matches.length ? matches[0] : null;
}

/**
 * ล็อกอินด้วยชื่อผู้ใช้และรหัสผ่านที่ผู้ดูแลสร้างไว้ในตาราง Users
 *
 * ระบบไม่เก็บรหัสผ่านจริง เก็บเฉพาะค่าแฮชที่ผูกกับ salt ประจำบัญชีและ pepper ลับของเซิร์ฟเวอร์
 * ข้อความแจ้งเตือนตอนล็อกอินไม่ผ่านจะเหมือนกันทุกกรณี เพื่อไม่ให้เดาได้ว่าชื่อผู้ใช้นี้มีอยู่จริงหรือไม่
 *
 * @param {Object} params { username, password }
 */
function login(params) {
  const input = params || {};
  const username = String(input.username || '').trim().toLowerCase();
  const password = String(input.password || '');
  const generic = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';

  if (!username || !password) throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');

  const waitMinutes = lockoutRemaining_(username);
  if (waitMinutes > 0) {
    throw new Error('กรอกรหัสผ่านผิดหลายครั้งเกินไป กรุณารออีก ' + waitMinutes + ' นาทีแล้วลองใหม่');
  }

  const user = findUserByUsername_(username);
  if (!user || !user.passwordHash) {
    recordLoginFailure_(username);
    writeLog_('LOGIN_DENIED', 'Users', username, 'DENIED', 'ไม่พบบัญชีหรือยังไม่ได้ตั้งรหัสผ่าน');
    throw new Error(generic);
  }

  if (!safeEquals_(hashPassword_(password, user.passwordSalt), String(user.passwordHash))) {
    recordLoginFailure_(username);
    writeLog_('LOGIN_DENIED', 'Users', user.id, 'DENIED', 'รหัสผ่านไม่ถูกต้อง (' + username + ')');
    throw new Error(generic);
  }

  if (user.active === false) {
    writeLog_('LOGIN_DENIED', 'Users', user.id, 'DENIED', 'บัญชีถูกปิดใช้งาน');
    throw new Error('บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  }

  clearLoginFailures_(username);
  upsertRecord('Users', { id: user.id, lastLoginAt: nowISO_() }, { skipLog: true });
  writeLog_('LOGIN', 'Users', user.id, 'OK', user.username + ' (' + user.role + ')');

  return {
    sessionToken: issueSessionToken_(user),
    expiresInMinutes: CONFIG.sessionTtlMinutes,
    mustChangePassword: user.mustChangePassword === true,
    user: publicUser_(user),
    permissions: permissionsFor_(user.role)
  };
}

/** ข้อมูลผู้ใช้ที่ส่งออกไปหน้าเว็บได้ — ไม่มี salt/hash ติดไปด้วยเด็ดขาด */
function publicUser_(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
    active: user.active !== false,
    email: user.email || '',
    note: user.note || '',
    lastLoginAt: user.lastLoginAt || '',
    mustChangePassword: user.mustChangePassword === true
  };
}

/**
 * ตั้งรหัสผ่านให้บัญชีหนึ่ง — ใช้ทั้งตอนสร้างบัญชีใหม่ รีเซ็ตโดยผู้ดูแล และผู้ใช้เปลี่ยนเอง
 * @param {Object} options { mustChange: บังคับให้เปลี่ยนรหัสในการเข้าใช้ครั้งถัดไป }
 */
function setUserPassword_(userId, password, options) {
  const opts = options || {};
  assertPasswordStrength_(password);
  const salt = newSalt_();
  return upsertRecord('Users', {
    id: userId,
    passwordSalt: salt,
    passwordHash: hashPassword_(password, salt),
    mustChangePassword: opts.mustChange === true
  }, { skipLog: true });
}

/** ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง — ต้องยืนยันรหัสเดิมก่อนเสมอ */
function changeOwnPassword(actor, currentPassword, newPassword) {
  if (!safeEquals_(hashPassword_(String(currentPassword || ''), actor.passwordSalt), String(actor.passwordHash))) {
    writeLog_('PASSWORD_DENIED', 'Users', actor.id, 'DENIED', 'รหัสผ่านเดิมไม่ถูกต้อง');
    throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  }
  if (String(currentPassword) === String(newPassword)) {
    throw new Error('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
  }

  setUserPassword_(actor.id, newPassword, { mustChange: false });
  writeLog_('PASSWORD_CHANGED', 'Users', actor.id, 'OK', actor.username);
  return { changed: true, username: actor.username };
}

/** ต้องมี owner ที่เปิดใช้งานอยู่เสมออย่างน้อยหนึ่งคน ไม่งั้นจะไม่มีใครแก้ระบบได้อีก */
function assertOtherOwnerExists_(excludeId) {
  const owners = readAll('Users').filter(function (user) {
    return user.role === 'owner' && user.active !== false && user.id !== excludeId;
  });
  if (!owners.length) throw new Error('ต้องมีผู้ใช้บทบาท owner ที่เปิดใช้งานอย่างน้อยหนึ่งคนเสมอ');
}

/** รายการ action ที่บทบาทนี้เรียกได้ ใช้ให้หน้าเว็บซ่อนปุ่มที่ไม่มีสิทธิ์ */
function permissionsFor_(role) {
  return Object.keys(ACTION_PERMISSIONS).filter(function (action) {
    const allowed = ACTION_PERMISSIONS[action];
    return allowed.indexOf('*') !== -1 || allowed.indexOf(role) !== -1;
  });
}

/**
 * ตรวจสิทธิ์ของคำขอหนึ่ง ๆ — เป็นด่านเดียวที่ตัดสินว่าเรียก action นี้ได้หรือไม่
 * @returns {Object} ข้อมูลผู้ใช้ที่ผ่านการตรวจแล้ว
 */
function authorize_(action, params) {
  const claims = verifySessionToken_(params.token);

  // ตรวจซ้ำกับตาราง Users ทุกครั้ง เพื่อให้การปิดสิทธิ์มีผลทันทีไม่ต้องรอ token หมดอายุ
  const user = findUserByUsername_(claims.username);
  if (!user) throw new Error('ไม่พบบัญชีผู้ใช้นี้ในระบบแล้ว');
  if (user.active === false) throw new Error('บัญชีนี้ถูกปิดใช้งาน');

  const allowed = ACTION_PERMISSIONS[action];
  if (!allowed) throw new Error('ไม่รู้จัก action "' + action + '"');
  if (allowed.indexOf('*') === -1 && allowed.indexOf(user.role) === -1) {
    writeLog_('FORBIDDEN', '', '', 'DENIED', user.username + ' (' + user.role + ') → ' + action);
    throw new Error('บทบาท "' + user.role + '" ไม่มีสิทธิ์ใช้คำสั่ง "' + action + '"');
  }

  // บัญชีที่ถูกบังคับเปลี่ยนรหัสผ่าน ทำได้เฉพาะคำสั่งพื้นฐานจนกว่าจะเปลี่ยนเสร็จ
  if (user.mustChangePassword === true && ['me', 'ping', 'changePassword'].indexOf(action) === -1) {
    const error = new Error('ต้องตั้งรหัสผ่านใหม่ก่อนจึงจะใช้งานระบบได้');
    error.mustChangePassword = true;
    throw error;
  }

  return user;
}

/* ==========================================================================
 * 9. WEB API
 *
 * GET   ?action=<ชื่อ>&token=<token>&...
 * POST  body เป็น JSON: { action, token, ... }
 *
 * หมายเหตุ CORS: Apps Script ไม่ตอบ preflight (OPTIONS) ฝั่งเบราว์เซอร์จึงต้องส่ง
 * POST ด้วย Content-Type: text/plain;charset=utf-8 เพื่อให้เป็น simple request
 * หรือใช้ GET แบบ JSONP (?callback=fn) สำหรับหน้าเว็บที่เปิดจากไฟล์ file://
 * ========================================================================== */

/** action ที่อนุญาตให้เรียกผ่าน GET (อ่านอย่างเดียว) */
const READ_ACTIONS = Object.freeze([
  'ping', 'authStatus', 'me', 'schema', 'validate', 'diagnose', 'repairPreview', 'dashboard',
  'pullAll', 'listCustomers', 'getCustomer', 'listProducts', 'listOrders', 'getOrder', 'listExams',
  'listStockMoves', 'listUsers'
]);

function doGet(e) {
  const params = (e && e.parameter) || {};
  const result = handleRequest_(params, 'GET');
  if (params.callback) {
    return ContentService
      .createTextOutput(params.callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonOutput_(result);
}

function doPost(e) {
  let payload = {};
  try {
    if (e && e.postData && e.postData.contents) payload = JSON.parse(e.postData.contents);
  } catch (error) {
    return jsonOutput_({ ok: false, error: 'รูปแบบ JSON ไม่ถูกต้อง: ' + error.message });
  }
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function (key) {
      if (!(key in payload)) payload[key] = e.parameter[key];
    });
  }
  return jsonOutput_(handleRequest_(payload, 'POST'));
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/** ตัวจัดการคำขอกลาง — ตรวจสิทธิ์ แล้วส่งต่อไปยัง action ที่ร้องขอ */
function handleRequest_(params, method) {
  const action = String(params.action || 'ping');

  try {
    const handler = API_ACTIONS[action];
    if (!handler) {
      return { ok: false, error: 'ไม่รู้จัก action "' + action + '" — ที่รองรับ: ' + Object.keys(API_ACTIONS).join(', ') };
    }
    if (method === 'GET' && READ_ACTIONS.indexOf(action) === -1) {
      return { ok: false, error: 'action "' + action + '" ต้องเรียกผ่าน POST เท่านั้น' };
    }

    // action สาธารณะเรียกได้โดยไม่ต้องล็อกอิน นอกนั้นต้องผ่านการตรวจสิทธิ์ทุกครั้ง
    let user = null;
    if (PUBLIC_ACTIONS.indexOf(action) === -1) {
      user = authorize_(action, params);
    }

    return {
      ok: true,
      action: action,
      data: handler(params, user),
      user: user ? { username: user.username, role: user.role } : null,
      at: nowISO_()
    };
  } catch (error) {
    const needsLogin = /session token|เซสชันหมดอายุ|ไม่พบบัญชี|ปิดใช้งาน/.test(error.message);
    if (!needsLogin) writeLog_('ERROR', '', '', 'FAIL', action + ': ' + error.message);
    return {
      ok: false,
      action: action,
      error: error.message,
      needsLogin: needsLogin,
      mustChangePassword: error.mustChangePassword === true
    };
  }
}

/** แปลง params.record ที่อาจส่งมาเป็น JSON string ให้เป็น object */
function recordOf_(params) {
  if (params.record && typeof params.record === 'string') return JSON.parse(params.record);
  return params.record || params.data || params;
}

const API_ACTIONS = {
  /* ---------- การยืนยันตัวตน ---------- */

  /** สถานะระบบล็อกอิน — เรียกได้โดยไม่ต้องล็อกอิน เพื่อให้หน้าเว็บรู้ว่าพร้อมหรือยัง */
  authStatus: function () {
    let accounts = -1;
    try {
      accounts = readAll('Users').filter(function (user) {
        return user.active !== false && user.passwordHash;
      }).length;
    } catch (error) {
      accounts = -1;
    }
    return {
      // ยังไม่มีบัญชีที่ตั้งรหัสผ่านไว้เลย = ผู้ดูแลต้องไปสร้างบัญชีแรกในสเปรดชีตก่อน
      ready: accounts > 0,
      accountCount: accounts < 0 ? 0 : accounts,
      firstRun: accounts === 0,
      minPasswordLength: CONFIG.minPasswordLength,
      sessionTtlMinutes: CONFIG.sessionTtlMinutes
    };
  },

  /**
   * ล็อกอิน และถ้าส่ง withData มาด้วย จะแนบข้อมูลทั้งหมดกลับไปในคำตอบเดียวกัน
   * ทำให้หน้าเว็บพร้อมใช้งานด้วยการเรียกเซิร์ฟเวอร์แค่ครั้งเดียว แทนที่จะต้องล็อกอินแล้วดึงข้อมูลอีกรอบ
   */
  login: function (params) {
    const session = login(params);
    const wantsData = params.withData === true || params.withData === 'true';
    if (wantsData && !session.mustChangePassword) {
      try {
        session.data = API_ACTIONS.pullAll();
      } catch (error) {
        // ดึงข้อมูลพลาดไม่ควรทำให้ล็อกอินล้มเหลว — ปล่อยให้หน้าเว็บดึงเองทีหลัง
        session.dataError = error.message;
      }
    }
    return session;
  },

  me: function (params, user) {
    return { user: publicUser_(user), permissions: permissionsFor_(user.role) };
  },

  /** ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง */
  changePassword: function (params, actor) {
    return changeOwnPassword(actor, params.currentPassword, params.newPassword);
  },

  /* ---------- จัดการผู้ใช้ ---------- */

  listUsers: function () {
    return readAll('Users').map(publicUser_);
  },

  /**
   * สร้างหรือแก้ไขบัญชีผู้ใช้
   * รหัสผ่านส่งมาใน params.password เท่านั้น จะถูกแฮชทันทีและไม่ถูกเขียนลงชีตในรูปแบบเดิม
   */
  saveUser: function (params, actor) {
    const record = recordOf_(params);
    const password = String(record.password || params.password || '');

    // กันไม่ให้ค่าที่ผู้เรียกส่งมาเองไปทับ salt/hash ที่ระบบคำนวณ
    delete record.password;
    delete record.passwordHash;
    delete record.passwordSalt;

    record.username = normalizeUsername_(record.username);
    if (ROLES.indexOf(record.role) === -1) throw new Error('บทบาทต้องเป็น: ' + ROLES.join(', '));

    const existing = findUserByUsername_(record.username);
    if (existing && record.id && existing.id !== record.id) {
      throw new Error('ชื่อผู้ใช้ "' + record.username + '" ถูกใช้ไปแล้ว');
    }
    if (existing && !record.id) record.id = existing.id;

    if (!record.id && !password) throw new Error('บัญชีใหม่ต้องตั้งรหัสผ่านเริ่มต้นด้วย');

    // admin จัดการพนักงานได้ แต่แตะบัญชี owner หรือแต่งตั้ง owner ใหม่ไม่ได้
    if (actor.role !== 'owner') {
      if (record.role === 'owner') throw new Error('เฉพาะ owner เท่านั้นที่แต่งตั้งบทบาท owner ได้');
      if (existing && existing.role === 'owner') throw new Error('เฉพาะ owner เท่านั้นที่แก้ไขบัญชี owner ได้');
    }

    // กันลดสิทธิ์จนไม่เหลือ owner ที่เปิดใช้งานอยู่ในระบบ
    if (existing && existing.role === 'owner' && record.role !== 'owner') {
      assertOtherOwnerExists_(existing.id);
    }
    if (existing && existing.id === actor.id && record.active === false) {
      throw new Error('ปิดใช้งานบัญชีของตัวเองไม่ได้');
    }

    const saved = upsertRecord('Users', record);
    if (password) {
      // ผู้ดูแลตั้งรหัสให้คนอื่น = บังคับให้เจ้าของบัญชีเปลี่ยนเองในการเข้าใช้ครั้งแรก
      setUserPassword_(saved.id, password, { mustChange: saved.id !== actor.id });
      writeLog_('PASSWORD_SET', 'Users', saved.id, 'OK', actor.username + ' → ' + record.username);
    }
    return publicUser_(readOne('Users', saved.id));
  },

  deleteUser: function (params, actor) {
    if (!params.id) throw new Error('ต้องระบุ id');
    const target = readOne('Users', params.id);
    if (!target) throw new Error('ไม่พบผู้ใช้');
    if (target.id === actor.id) throw new Error('ปิดใช้งานบัญชีของตัวเองไม่ได้');
    if (target.role === 'owner') {
      if (actor.role !== 'owner') throw new Error('เฉพาะ owner เท่านั้นที่ปิดใช้งานบัญชี owner ได้');
      assertOtherOwnerExists_(target.id);
    }
    return publicUser_(upsertRecord('Users', { id: params.id, active: false }));
  },

  /* ---------- ระบบ ---------- */

  ping: function () {
    return { service: 'OptiCare Backend', sheetId: SHEET_ID, folderId: FOLDER_ID, timezone: CONFIG.timezone };
  },

  schema: function (params) {
    if (params.sheet) return { sheet: params.sheet, columns: schemaOf(params.sheet) };
    const all = {};
    sheetNames().forEach(function (name) { all[name] = HEADERS[name]; });
    return { sheets: sheetNames(), headers: all };
  },

  validate: function () { return validateSchema(); },
  diagnose: function () { return diagnoseConnection(); },
  bootstrap: function () { return ensureAllSheets(); },
  repair: function (params) {
    if (!params.sheet) throw new Error('ต้องระบุ sheet ที่ต้องการซ่อม');
    return repairSheetHeaders(params.sheet);
  },
  /** ตรวจสภาพโครงสร้างและบอกว่าจะซ่อมอะไรบ้าง โดยยังไม่แก้ไขไฟล์ */
  repairPreview: function () { return repairDatabase({ dryRun: true }); },
  /** ซ่อมโครงสร้างทุกชีตให้ตรงกับ HEADERS (แก้ไขไฟล์จริง) */
  repairDatabase: function () { return repairDatabase({}); },
  migrate: function (params) {
    return migrateLegacySheets({ dryRun: params.dryRun === true || params.dryRun === 'true' });
  },

  dashboard: function () { return getDashboard(); },

  /**
   * ดึงข้อมูลทุกตารางที่หน้าเว็บต้องใช้ในการเรียก "ครั้งเดียว"
   *
   * เหตุผลด้านความเร็ว: การเรียก Web App แต่ละครั้งมีค่าใช้จ่ายคงที่สูง
   * (เปิดสคริปต์ · ตรวจสิทธิ์ · เปิดสเปรดชีต) และ Apps Script จำกัดจำนวน
   * การรันพร้อมกันต่อผู้ใช้หนึ่งคน การยิง 4 คำขอพร้อมกันจึงมักถูกจับคิวรันทีละอัน
   * รวมเป็น 4 เท่าของค่าใช้จ่ายคงที่ — รวมมาเป็นคำขอเดียวจึงเร็วกว่าอย่างเห็นได้ชัด
   */
  pullAll: function () {
    return {
      customers: listCustomers({ includeInactive: false }),
      exams: readAll('Exams'),
      products: readAll('Products'),
      orders: readAll('Orders'),
      at: nowISO_()
    };
  },

  listCustomers: function (params) {
    return listCustomers({ includeInactive: params.includeInactive === 'true' || params.includeInactive === true });
  },
  getCustomer: function (params) {
    if (!params.id) throw new Error('ต้องระบุ id');
    return getCustomerWithExams(params.id);
  },
  saveCustomer: function (params) { return upsertRecord('Customers', recordOf_(params)); },
  /** ลบผู้รับบริการออกจากฐานข้อมูลจริง พร้อมผลตรวจทั้งหมดของคนนั้น */
  deleteCustomer: function (params) {
    if (!params.id) throw new Error('ต้องระบุ id');
    return deleteCustomerCascade(params.id, {
      purgeOrders: params.purgeOrders === true || params.purgeOrders === 'true'
    });
  },
  /** ซ่อนจากรายการโดยไม่ลบข้อมูล — ใช้เมื่ออยากเก็บประวัติไว้อ้างอิง */
  deactivateCustomer: function (params) {
    if (!params.id) throw new Error('ต้องระบุ id');
    return upsertRecord('Customers', { id: params.id, active: false });
  },

  listExams: function (params) {
    const exams = readAll('Exams');
    if (!params.customerId) return exams;
    return exams.filter(function (exam) { return String(exam.customerId) === String(params.customerId); });
  },
  saveExam: function (params) { return saveExam(recordOf_(params)); },

  listProducts: function (params) {
    const products = readAll('Products');
    if (params.category) {
      return products.filter(function (product) { return product.category === params.category; });
    }
    if (params.lowStock === 'true' || params.lowStock === true) {
      return products.filter(function (product) { return product.stock <= product.minAlert; });
    }
    return products;
  },
  saveProduct: function (params) { return upsertRecord('Products', recordOf_(params)); },
  /** ลบสินค้าออกจากฐานข้อมูลจริง (ถ้ามีใบสั่งอ้างอยู่จะปิดการใช้งานแทนแล้วแจ้งกลับ) */
  deleteProduct: function (params) {
    if (!params.id) throw new Error('ต้องระบุ id');
    return deleteProductRecord(params.id);
  },
  deactivateProduct: function (params) {
    if (!params.id) throw new Error('ต้องระบุ id');
    return upsertRecord('Products', { id: params.id, active: false });
  },
  adjustStock: function (params) { return adjustStock(recordOf_(params)); },
  listStockMoves: function (params) {
    const moves = readAll('StockMoves');
    if (!params.productId) return moves;
    return moves.filter(function (move) { return String(move.productId) === String(params.productId); });
  },

  listOrders: function (params) {
    const orders = readAll('Orders');
    if (params.status) return orders.filter(function (order) { return order.status === params.status; });
    if (params.customerId) {
      return orders.filter(function (order) { return String(order.customerId) === String(params.customerId); });
    }
    return orders;
  },
  getOrder: function (params) {
    if (!params.id) throw new Error('ต้องระบุ id');
    return readOne('Orders', params.id);
  },
  createOrder: function (params) { return createOrder(recordOf_(params)); },
  updateOrder: function (params) {
    const record = recordOf_(params);
    computeOrderTotals_(record);
    computeLabValues_(record);
    return upsertRecord('Orders', record);
  },
  updateOrderStatus: function (params) {
    if (!params.id || !params.status) throw new Error('ต้องระบุ id และ status');
    return updateOrderStatus(params.id, params.status);
  },
  /** ยกเลิกใบสั่ง — ลบออกจากฐานข้อมูลจริงและคืนสต็อกให้อัตโนมัติ */
  deleteOrder: function (params) {
    if (!params.id) throw new Error('ต้องระบุ id');
    return deleteOrderRecord(params.id, { restoreStock: params.restoreStock !== false && params.restoreStock !== 'false' });
  },

  upload: function (params) { return uploadAttachment(recordOf_(params)); }
};

/* ==========================================================================
 * 10. เมนูในสเปรดชีต & ฟังก์ชันติดตั้ง
 * ========================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('OptiCare')
    .addItem('ตรวจสอบการเชื่อมต่อ', 'menuDiagnose')
    .addItem('ติดตั้งฐานข้อมูลครั้งแรก', 'menuBootstrap')
    .addItem('ตรวจโครงสร้างตาราง', 'menuValidate')
    .addSeparator()
    .addItem('🛠 ซ่อมบำรุงฐานข้อมูล — ดูแผนก่อน', 'menuRepairPreview')
    .addItem('🛠 ซ่อมบำรุงฐานข้อมูล — ลงมือซ่อม', 'menuRepairDatabase')
    .addSeparator()
    .addItem('ดูผลการย้ายข้อมูลเดิม (ยังไม่แก้ไข)', 'menuMigrateDryRun')
    .addItem('ย้ายข้อมูลเดิมมาโครงสร้างใหม่', 'menuMigrate')
    .addSeparator()
    .addItem('👤 สร้างบัญชีผู้ดูแลคนแรก', 'menuCreateFirstAdmin')
    .addItem('👤 เพิ่มบัญชีผู้ใช้', 'menuAddUser')
    .addItem('🔑 ตั้งรหัสผ่านใหม่ให้ผู้ใช้', 'menuResetPassword')
    .addItem('ดูรายชื่อผู้ใช้', 'menuListUsers')
    .addItem('ปลดล็อกบัญชีที่กรอกรหัสผิดหลายครั้ง', 'menuUnlockUser')
    .addItem('ยกเลิกทุกเซสชัน (บังคับล็อกอินใหม่)', 'menuRevokeSessions')
    .addSeparator()
    .addItem('ใส่ข้อมูลตัวอย่าง', 'menuSeedSampleData')
    .addToUi();
}

function menuBootstrap() {
  const result = ensureAllSheets();
  let message = 'ติดตั้งฐานข้อมูลเรียบร้อย\n\n'
    + 'สร้างใหม่: ' + (result.created.length ? result.created.join(', ') : '— ไม่มี —') + '\n'
    + 'อัปเดตหัวตาราง: ' + (result.updated.length ? result.updated.join(', ') : '— ไม่มี —');

  if (result.skipped.length) {
    message += '\n\n⚠️ ข้ามไป ' + result.skipped.length + ' ชีต เพราะมีข้อมูลเดิมอยู่และลำดับคอลัมน์ไม่ตรง\n'
      + 'ถ้าเขียนหัวตารางทับ ข้อมูลเดิมจะไปอยู่ใต้คอลัมน์ผิด\n\n'
      + result.skipped.map(function (item) { return '• ' + item.sheet + '\n   ' + item.reason; }).join('\n')
      + '\n\nใช้เมนู "ดูผลการย้ายข้อมูลเดิม" เพื่อตรวจก่อน แล้วค่อย "ย้ายข้อมูลเดิมมาโครงสร้างใหม่"';
  }

  message += '\n\nดูคำอธิบายคอลัมน์ทั้งหมดได้ที่ชีต ' + CONFIG.schemaSheetName;
  SpreadsheetApp.getUi().alert(message);
}

/** สรุปรายงานซ่อมบำรุงให้อ่านง่ายในกล่องข้อความ */
function formatRepairReport_(report) {
  const stateText = {
    ok: 'ถูกต้อง',
    missing: 'ไม่พบชีต',
    noHeader: 'ไม่มีหัวตาราง',
    legacy: 'โครงสร้างเดิม',
    mismatch: 'คอลัมน์ไม่ตรง'
  };

  const lines = report.sheets.map(function (item) {
    const mark = item.plan === 'none' ? '✅' : '⚠️';
    return mark + ' ' + item.sheet + ' — ' + (stateText[item.state] || item.state)
      + ' (' + item.columns + '/' + item.expectedColumns + ' คอลัมน์ · ' + item.dataRows + ' แถว)';
  });

  let text = (report.summary || '') + '\n\n' + lines.join('\n');

  const todo = report.actions.filter(function (a) { return !a.done; });
  if (todo.length) {
    text += '\n\nสิ่งที่จะทำ:\n' + todo.map(function (a) { return '• ' + a.sheet + ': ' + a.action; }).join('\n');
  }
  if (report.backups && report.backups.length) {
    text += '\n\nชีตสำรองที่สร้างไว้:\n' + report.backups.map(function (b) { return '• ' + b; }).join('\n');
  }
  if (report.warnings && report.warnings.length) {
    text += '\n\n⚠️ ข้อควรทราบ:\n' + report.warnings.map(function (w) { return '• ' + w; }).join('\n');
  }
  return text;
}

function menuRepairPreview() {
  SpreadsheetApp.getUi().alert('ซ่อมบำรุงฐานข้อมูล — ผลการตรวจ', formatRepairReport_(repairDatabase({ dryRun: true })),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function menuRepairDatabase() {
  const ui = SpreadsheetApp.getUi();
  const preview = repairDatabase({ dryRun: true });

  if (!preview.needsRepair) {
    ui.alert('ไม่ต้องซ่อม', formatRepairReport_(preview), ui.ButtonSet.OK);
    return;
  }

  const confirmed = ui.alert(
    'ยืนยันการซ่อมบำรุงฐานข้อมูล',
    formatRepairReport_(preview)
    + '\n\nชีตที่ต้องย้ายโครงสร้างจะถูกสำรองเป็น _backup_ ก่อนเสมอ ไม่มีการลบข้อมูลทิ้ง'
    + '\nแนะนำให้สำรองไฟล์ (ไฟล์ › สร้างสำเนา) ก่อนดำเนินการ'
    + '\n\nต้องการซ่อมตอนนี้หรือไม่?',
    ui.ButtonSet.YES_NO
  );
  if (confirmed !== ui.Button.YES) return;

  ui.alert('ผลการซ่อมบำรุง', formatRepairReport_(repairDatabase({})), ui.ButtonSet.OK);
}

function menuMigrateDryRun() {
  const plan = migrateLegacySheets({ dryRun: true });
  SpreadsheetApp.getUi().alert(
    'ผลการตรวจสอบ (ยังไม่มีการแก้ไขใด ๆ)\n\n'
    + 'ผู้รับบริการที่จะย้าย: ' + plan.customers + ' ราย\n'
    + 'ผลตรวจที่จะสร้างจากค่าสายตาเดิม: ' + plan.exams + ' รายการ\n'
    + 'สินค้า: ' + plan.products + ' รายการ\n'
    + 'ใบสั่ง: ' + plan.orders + ' รายการ\n\n'
    + (plan.warnings.length ? 'ข้อควรทราบ:\n' + plan.warnings.map(function (w) { return '• ' + w; }).join('\n') : '')
  );
}

function menuMigrate() {
  const ui = SpreadsheetApp.getUi();
  const plan = migrateLegacySheets({ dryRun: true });
  const confirmed = ui.alert(
    'ยืนยันการย้ายข้อมูล',
    'จะย้ายผู้รับบริการ ' + plan.customers + ' ราย · ผลตรวจ ' + plan.exams + ' รายการ · '
    + 'สินค้า ' + plan.products + ' รายการ · ใบสั่ง ' + plan.orders + ' รายการ\n\n'
    + 'ชีตเดิมจะถูกเปลี่ยนชื่อเป็น _backup_ ไม่มีการลบข้อมูลทิ้ง\n'
    + 'แนะนำให้สำรองไฟล์ (ไฟล์ › สร้างสำเนา) ก่อนดำเนินการ\n\nต้องการดำเนินการต่อหรือไม่?',
    ui.ButtonSet.YES_NO
  );
  if (confirmed !== ui.Button.YES) return;

  const result = migrateLegacySheets();
  ui.alert(
    'ย้ายข้อมูลเรียบร้อย\n\n'
    + 'ผู้รับบริการ: ' + result.customers + ' · ผลตรวจ: ' + result.exams
    + ' · สินค้า: ' + result.products + ' · ใบสั่ง: ' + result.orders + '\n\n'
    + 'ชีตสำรอง: ' + (result.backups.length ? result.backups.join(', ') : '— ไม่มี —')
    + '\n\nตรวจผลได้ที่เมนู "ตรวจโครงสร้างตาราง"'
  );
}

function menuValidate() {
  const report = validateSchema();
  const lines = [];
  sheetNames().forEach(function (name) {
    const entry = report.sheets[name];
    lines.push((entry.ok ? '✅ ' : '❌ ') + name + ' (' + (entry.rows || 0) + ' แถว)');
    (entry.problems || []).forEach(function (problem) { lines.push('     • ' + problem); });
  });
  SpreadsheetApp.getUi().alert(
    (report.ok ? 'โครงสร้างตารางถูกต้องครบทุกชีต' : 'พบความไม่ตรงกันของโครงสร้าง')
    + '\n\n' + lines.join('\n')
    + (report.ok ? '' : '\n\nแก้ไขได้โดยเรียก repairSheetHeaders("ชื่อชีต") — ควรสำรองไฟล์ก่อน')
  );
}

/**
 * สร้างบัญชีผู้ดูแลคนแรก — ใช้ครั้งเดียวตอนติดตั้ง
 * คนที่เปิดสเปรดชีตนี้ได้คือเจ้าของไฟล์อยู่แล้ว จึงถือว่ามีสิทธิ์สร้างบัญชีแรกได้
 */
function menuCreateFirstAdmin() {
  const ui = SpreadsheetApp.getUi();
  ensureAllSheets();

  const owners = readAll('Users').filter(function (user) {
    return user.role === 'owner' && user.active !== false && user.passwordHash;
  });
  if (owners.length) {
    ui.alert('มีบัญชีผู้ดูแลอยู่แล้ว',
      'ระบบมีบัญชี owner ที่ใช้งานได้อยู่ ' + owners.length + ' บัญชี: '
      + owners.map(function (u) { return u.username; }).join(', ')
      + '\n\nถ้าลืมรหัสผ่าน ใช้เมนู "ตั้งรหัสผ่านใหม่ให้ผู้ใช้" แทน',
      ui.ButtonSet.OK);
    return;
  }

  const answer = ui.prompt('สร้างบัญชีผู้ดูแลคนแรก',
    'ตั้งชื่อผู้ใช้สำหรับเข้าสู่ระบบ (ตัวอักษรอังกฤษ ตัวเลข . _ - ยาว 3–32 ตัว)\n\nเช่น admin',
    ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;

  let username;
  try {
    username = normalizeUsername_(answer.getResponseText());
  } catch (error) {
    ui.alert(error.message);
    return;
  }
  if (findUserByUsername_(username)) {
    ui.alert('ชื่อผู้ใช้ "' + username + '" ถูกใช้ไปแล้ว');
    return;
  }

  const password = generatePassword_();
  const saved = upsertRecord('Users', {
    id: generateId_('Users'),
    username: username,
    displayName: 'ผู้ดูแลระบบ',
    role: 'owner',
    active: true,
    note: 'บัญชีผู้ดูแลคนแรกของระบบ',
    createdAt: todayISO_()
  }, { skipLog: true });
  setUserPassword_(saved.id, password, { mustChange: true });
  writeLog_('BOOTSTRAP_OWNER', 'Users', saved.id, 'OK', username);

  ui.alert('สร้างบัญชีผู้ดูแลเรียบร้อย',
    'ชื่อผู้ใช้: ' + username + '\n'
    + 'รหัสผ่านชั่วคราว: ' + password + '\n\n'
    + '⚠️ จดรหัสนี้ไว้ตอนนี้ — ระบบเก็บเฉพาะค่าที่เข้ารหัสแล้ว จึงเปิดดูรหัสเดิมไม่ได้อีก\n'
    + 'เมื่อเข้าสู่ระบบครั้งแรก ระบบจะให้ตั้งรหัสผ่านใหม่ทันที',
    ui.ButtonSet.OK);
}

function menuAddUser() {
  const ui = SpreadsheetApp.getUi();
  ensureAllSheets();

  const nameAnswer = ui.prompt('เพิ่มบัญชีผู้ใช้',
    'ชื่อผู้ใช้สำหรับเข้าสู่ระบบ (ตัวอักษรอังกฤษ ตัวเลข . _ - ยาว 3–32 ตัว)',
    ui.ButtonSet.OK_CANCEL);
  if (nameAnswer.getSelectedButton() !== ui.Button.OK) return;

  let username;
  try {
    username = normalizeUsername_(nameAnswer.getResponseText());
  } catch (error) {
    ui.alert(error.message);
    return;
  }
  if (findUserByUsername_(username)) {
    ui.alert('ชื่อผู้ใช้ "' + username + '" ถูกใช้ไปแล้ว — ถ้าต้องการตั้งรหัสใหม่ให้ใช้เมนู "ตั้งรหัสผ่านใหม่ให้ผู้ใช้"');
    return;
  }

  const displayAnswer = ui.prompt('ชื่อที่แสดง', 'ชื่อ-นามสกุลที่จะแสดงในระบบ:', ui.ButtonSet.OK_CANCEL);
  if (displayAnswer.getSelectedButton() !== ui.Button.OK) return;

  const roleAnswer = ui.prompt('บทบาท',
    'พิมพ์บทบาทหนึ่งอย่าง:\n' + ROLES.join(' / ')
    + '\n\nowner ทำได้ทุกอย่าง · admin จัดการผู้ใช้และสินค้า · optometrist บันทึกผลตรวจ'
    + '\nstaff ขายและสต็อก · viewer ดูอย่างเดียว',
    ui.ButtonSet.OK_CANCEL);
  if (roleAnswer.getSelectedButton() !== ui.Button.OK) return;
  const role = roleAnswer.getResponseText().trim().toLowerCase();
  if (ROLES.indexOf(role) === -1) {
    ui.alert('บทบาทต้องเป็นหนึ่งใน: ' + ROLES.join(', '));
    return;
  }

  const password = generatePassword_();
  const saved = upsertRecord('Users', {
    id: generateId_('Users'),
    username: username,
    displayName: displayAnswer.getResponseText().trim() || username,
    role: role,
    active: true,
    createdAt: todayISO_()
  }, { skipLog: true });
  setUserPassword_(saved.id, password, { mustChange: true });
  writeLog_('USER_CREATED', 'Users', saved.id, 'OK', username + ' (' + role + ')');

  ui.alert('เพิ่มผู้ใช้เรียบร้อย',
    'ชื่อผู้ใช้: ' + username + '\n'
    + 'บทบาท: ' + role + '\n'
    + 'รหัสผ่านชั่วคราว: ' + password + '\n\n'
    + '⚠️ จดรหัสนี้ไว้แล้วส่งให้เจ้าตัว — เปิดดูย้อนหลังไม่ได้\n'
    + 'ระบบจะบังคับให้เจ้าตัวตั้งรหัสผ่านใหม่ตอนเข้าสู่ระบบครั้งแรก',
    ui.ButtonSet.OK);
}

function menuResetPassword() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.prompt('ตั้งรหัสผ่านใหม่',
    'พิมพ์ชื่อผู้ใช้ที่ต้องการตั้งรหัสผ่านใหม่:\n\n'
    + readAll('Users').filter(function (u) { return u.active !== false; })
        .map(function (u) { return '• ' + u.username + ' (' + u.role + ')'; }).join('\n'),
    ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;

  const user = findUserByUsername_(answer.getResponseText());
  if (!user) {
    ui.alert('ไม่พบผู้ใช้นี้');
    return;
  }

  const password = generatePassword_();
  setUserPassword_(user.id, password, { mustChange: true });
  clearLoginFailures_(String(user.username).toLowerCase());
  writeLog_('PASSWORD_RESET', 'Users', user.id, 'OK', user.username);

  ui.alert('ตั้งรหัสผ่านใหม่แล้ว',
    'ชื่อผู้ใช้: ' + user.username + '\n'
    + 'รหัสผ่านชั่วคราว: ' + password + '\n\n'
    + 'เจ้าตัวต้องตั้งรหัสผ่านใหม่ทันทีที่เข้าสู่ระบบ',
    ui.ButtonSet.OK);
}

function menuUnlockUser() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.prompt('ปลดล็อกบัญชี',
    'พิมพ์ชื่อผู้ใช้ที่ถูกล็อกเพราะกรอกรหัสผิดหลายครั้ง:', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;

  const username = String(answer.getResponseText() || '').trim().toLowerCase();
  if (!username) return;
  clearLoginFailures_(username);
  ui.alert('ปลดล็อก "' + username + '" แล้ว เข้าสู่ระบบได้ทันที');
}

function menuListUsers() {
  const users = readAll('Users');
  if (!users.length) {
    SpreadsheetApp.getUi().alert('ยังไม่มีผู้ใช้ในระบบ\n\nใช้เมนู "สร้างบัญชีผู้ดูแลคนแรก" เพื่อเริ่มต้น');
    return;
  }
  const lines = users.map(function (user) {
    const locked = lockoutRemaining_(String(user.username).toLowerCase());
    return (user.active === false ? '⛔ ' : '✅ ') + user.username + ' — ' + user.role
      + (user.displayName ? ' (' + user.displayName + ')' : '')
      + (user.passwordHash ? '' : '\n     ⚠️ ยังไม่ได้ตั้งรหัสผ่าน')
      + (user.mustChangePassword === true ? '\n     ⚠️ ต้องตั้งรหัสผ่านใหม่ตอนเข้าใช้ครั้งถัดไป' : '')
      + (locked ? '\n     🔒 ถูกล็อกอีก ' + locked + ' นาที' : '')
      + (user.lastLoginAt ? '\n     เข้าใช้ล่าสุด ' + user.lastLoginAt : '\n     ยังไม่เคยเข้าใช้');
  });
  SpreadsheetApp.getUi().alert('ผู้ใช้ในระบบ ' + users.length + ' คน\n\n' + lines.join('\n\n'));
}

/** เปลี่ยนกุญแจลับ ทำให้ session token ที่ออกไปแล้วทั้งหมดใช้ไม่ได้ทันที */
function menuRevokeSessions() {
  const ui = SpreadsheetApp.getUi();
  const confirmed = ui.alert(
    'ยกเลิกทุกเซสชัน',
    'ผู้ใช้ทุกคนที่กำลังใช้งานอยู่จะถูกบังคับให้ล็อกอินใหม่ทันที\n\nดำเนินการต่อหรือไม่?',
    ui.ButtonSet.YES_NO
  );
  if (confirmed !== ui.Button.YES) return;

  PropertiesService.getScriptProperties().deleteProperty(CONFIG.sessionSecretProperty);
  sessionSecret_();
  writeLog_('REVOKE_SESSIONS', '', '', 'OK', 'เปลี่ยนกุญแจลับเซสชัน');
  ui.alert('ยกเลิกทุกเซสชันแล้ว — ผู้ใช้ต้องล็อกอินใหม่');
}

/** ใส่ข้อมูลตัวอย่างเพื่อทดสอบระบบ (ข้ามรายการที่มีรหัสซ้ำแล้ว) */
function menuSeedSampleData() {
  ensureAllSheets();

  const customers = [
    {
      id: 'C-DEMO-001', name: 'สมศักดิ์ รักชาติ', phone: '0812345678', email: 'somsak@example.com',
      gender: 'ชาย', age: 45, occupation: 'โปรแกรมเมอร์', faceShape: 'เหลี่ยม',
      chiefComplaint: 'มองใกล้ไม่ชัด ต้องยืดแขนออก', ocularConditions: 'ตาแห้งเล็กน้อย',
      medications: 'น้ำตาเทียม', familyHistory: 'บิดามีต้อหิน', contactLensUse: 'ไม่เคยใช้',
      notes: 'ใช้หน้าจอ 8-10 ชั่วโมงต่อวัน', active: true, createdAt: '2024-06-18'
    },
    {
      id: 'C-DEMO-002', name: 'ณัฐวุฒิ พงษ์ไพบูลย์', phone: '0851122334', email: 'nattawut@example.com',
      gender: 'ชาย', age: 14, occupation: 'นักเรียน', faceShape: 'รูปไข่',
      chiefComplaint: 'มองกระดานไม่ชัด ค่าสายตาเพิ่มทุกปี', ocularConditions: '-',
      medications: '-', familyHistory: 'บิดามารดาสายตาสั้นทั้งคู่', contactLensUse: 'ยังไม่เคยใช้',
      notes: 'กิจกรรมกลางแจ้งน้อย', active: true, createdAt: '2023-08-05'
    }
  ];

  const exams = [
    {
      customerId: 'C-DEMO-001', examDate: '2026-06-18', optometrist: 'ทนพ. ธนกฤต ว.',
      method: 'Subjective refraction', odSph: -3.5, odCyl: -0.75, odAx: 180, odVa: '6/6',
      osSph: -3.25, osCyl: -0.5, osAx: 175, osVa: '6/6',
      odAdd: 1.5, odNearVa: 'N5', osAdd: 1.5, osNearVa: 'N5',
      pdFar: 64, pdNear: 61, segHeight: 22, note: 'เพิ่ม ADD ครั้งแรก'
    },
    {
      customerId: 'C-DEMO-002', examDate: '2025-08-05', optometrist: 'ทนพ. ธนกฤต ว.',
      method: 'Subjective refraction', odSph: -6.25, odCyl: -1, odAx: 175, odVa: '6/6',
      osSph: -5.75, osCyl: -0.75, osAx: 5, osVa: '6/9',
      pdFar: 60, pdNear: 57, note: 'ค่าสายตาสั้นเพิ่มต่อเนื่อง แนะนำแนวทางชะลอสายตาสั้น'
    }
  ];

  const products = [
    {
      id: 'P-DEMO-001', category: 'Frame', name: 'Ray-Ban Clubmaster Classic', brand: 'Ray-Ban',
      barcode: '805289397858', cost: 3500, price: 5800, stock: 4, minAlert: 2, active: true, createdAt: '2026-01-15'
    },
    {
      id: 'P-DEMO-002', category: 'Lens', name: 'Hoya Nulux Classic 1.60 Blue Control', brand: 'Hoya',
      barcode: 'HOYABLC16', cost: 1800, price: 3500, stock: 12, minAlert: 5, lensIndex: 1.6,
      active: true, createdAt: '2026-01-15'
    }
  ];

  let added = 0;
  customers.forEach(function (customer) {
    if (!readOne('Customers', customer.id)) { upsertRecord('Customers', customer, { skipLog: true }); added++; }
  });
  products.forEach(function (product) {
    if (!readOne('Products', product.id)) { upsertRecord('Products', product, { skipLog: true }); added++; }
  });
  exams.forEach(function (exam) { saveExam(exam); added++; });

  SpreadsheetApp.getUi().alert('ใส่ข้อมูลตัวอย่างแล้ว ' + added + ' รายการ');
}

/* ==========================================================================
 * ฟังก์ชันทดสอบ — รันจาก Apps Script Editor แล้วดูผลใน Execution log
 * ========================================================================== */

/**
 * ตรวจสอบการเชื่อมต่อทีละจุด แล้วบอกว่าติดตรงไหนและต้องแก้อย่างไร
 * เรียกจาก Apps Script Editor หรือเมนู OptiCare › ตรวจสอบการเชื่อมต่อ
 */
function diagnoseConnection() {
  const checks = [];
  const add = function (name, status, detail, fix) {
    checks.push({ name: name, status: status, detail: detail || '', fix: fix || '' });
  };

  // 1) สคริปต์ผูกกับสเปรดชีตหรือเป็นโปรเจกต์เดี่ยว
  try {
    const bound = SpreadsheetApp.getActiveSpreadsheet();
    if (bound) add('สคริปต์ผูกกับสเปรดชีต', 'pass', bound.getName());
    else add('สคริปต์ผูกกับสเปรดชีต', 'warn', 'เป็นโปรเจกต์เดี่ยว (standalone)',
      'เมนู OptiCare จะไม่ขึ้นในสเปรดชีต ให้เปิดชีต › ส่วนขยาย › Apps Script แล้ววางโค้ดที่นั่นแทน');
  } catch (error) {
    add('สคริปต์ผูกกับสเปรดชีต', 'warn', 'เป็นโปรเจกต์เดี่ยว (standalone)',
      'ให้สร้างสคริปต์จากในสเปรดชีตโดยตรง เมนูและ onOpen จึงจะทำงาน');
  }

  // 2) เปิดไฟล์สเปรดชีตตาม SHEET_ID ได้หรือไม่
  let ss = null;
  try {
    ss = spreadsheet();
    add('เปิดสเปรดชีตตาม SHEET_ID', 'pass', ss.getName());
  } catch (error) {
    add('เปิดสเปรดชีตตาม SHEET_ID', 'fail', error.message,
      'ตรวจว่า SHEET_ID ถูกต้อง และบัญชีที่รันสคริปต์มีสิทธิ์แก้ไขไฟล์นี้');
    return finishDiagnosis_(checks);
  }

  // 3) สิทธิ์เขียน
  try {
    const probe = ss.getSheetByName('_probe') || ss.insertSheet('_probe');
    probe.getRange(1, 1).setValue('ok');
    ss.deleteSheet(probe);
    add('สิทธิ์เขียนสเปรดชีต', 'pass', 'สร้างและลบชีตทดสอบได้');
  } catch (error) {
    add('สิทธิ์เขียนสเปรดชีต', 'fail', error.message,
      'กด Run ใน Apps Script Editor หนึ่งครั้งเพื่ออนุญาตสิทธิ์ (Authorize) ให้ครบก่อน');
  }

  // 4) เข้าถึงโฟลเดอร์ Drive
  try {
    add('เข้าถึงโฟลเดอร์ Drive', 'pass', attachmentFolder_().getName());
  } catch (error) {
    add('เข้าถึงโฟลเดอร์ Drive', 'fail', error.message,
      'ตรวจว่า FOLDER_ID ถูกต้องและบัญชีที่รันสคริปต์เข้าถึงโฟลเดอร์นี้ได้ (ใช้เฉพาะตอนอัปโหลดไฟล์แนบ)');
  }

  // 5) ชีตครบตาม HEADERS หรือไม่
  const missing = sheetNames().filter(function (name) { return !ss.getSheetByName(name); });
  if (missing.length) {
    add('ชีตครบตาม HEADERS', 'fail', 'ยังไม่มีชีต: ' + missing.join(', '),
      'ใช้เมนู OptiCare › ติดตั้งฐานข้อมูลครั้งแรก');
  } else {
    add('ชีตครบตาม HEADERS', 'pass', sheetNames().length + ' ชีต');
  }

  // 6) ขนาดกริดพอกับจำนวนคอลัมน์
  const tooNarrow = [];
  sheetNames().forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const needed = headerRow(name).length;
    if (sheet.getMaxColumns() < needed) {
      tooNarrow.push(name + ' (มี ' + sheet.getMaxColumns() + ' ต้องการ ' + needed + ')');
    }
  });
  if (tooNarrow.length) {
    add('ขนาดกริดพอกับคอลัมน์', 'fail', tooNarrow.join(', '),
      'ชีตใหม่มีเพียง 26 คอลัมน์ — รันเมนู ติดตั้งฐานข้อมูลครั้งแรก อีกครั้งเพื่อขยายกริด');
  } else if (!missing.length) {
    add('ขนาดกริดพอกับคอลัมน์', 'pass', 'ทุกชีตกว้างพอ');
  }

  // 7) โครงสร้างคอลัมน์ตรงกับ HEADERS
  if (!missing.length) {
    const report = validateSchema();
    if (report.ok) {
      add('โครงสร้างตรงกับ HEADERS', 'pass', 'ตรงทุกชีต');
    } else {
      const problems = [];
      sheetNames().forEach(function (name) {
        (report.sheets[name].problems || []).slice(0, 2).forEach(function (p) { problems.push(name + ': ' + p); });
      });
      add('โครงสร้างตรงกับ HEADERS', 'fail', problems.slice(0, 4).join(' | '),
        'ถ้ามีข้อมูลเดิมอยู่ ใช้เมนู ย้ายข้อมูลเดิมมาโครงสร้างใหม่ · ถ้าไม่มีข้อมูล ใช้ repairSheetHeaders("ชื่อชีต")');
    }
  }

  // 8) บัญชีผู้ใช้และรหัสผ่าน
  try {
    const users = readAll('Users');
    const owners = users.filter(function (u) {
      return u.role === 'owner' && u.active !== false && u.passwordHash;
    });
    const noPassword = users.filter(function (u) { return u.active !== false && !u.passwordHash; });

    if (!users.length) {
      add('บัญชีผู้ใช้', 'fail', 'ยังไม่มีบัญชีในระบบ',
        'ใช้เมนู OptiCare › สร้างบัญชีผู้ดูแลคนแรก เพื่อสร้างบัญชี owner พร้อมรหัสผ่าน');
    } else if (!owners.length) {
      add('บัญชีผู้ใช้', 'fail', users.length + ' บัญชี แต่ไม่มี owner ที่ใช้งานได้',
        'ต้องมี owner ที่เปิดใช้งานและตั้งรหัสผ่านแล้วอย่างน้อยหนึ่งคน — '
        + 'ใช้เมนู สร้างบัญชีผู้ดูแลคนแรก หรือ ตั้งรหัสผ่านใหม่ให้ผู้ใช้');
    } else if (noPassword.length) {
      add('บัญชีผู้ใช้', 'warn', users.length + ' บัญชี (owner ' + owners.length + ' คน) แต่ '
        + noPassword.length + ' บัญชียังไม่ได้ตั้งรหัสผ่าน',
        'บัญชีที่ยังไม่มีรหัสผ่านเข้าสู่ระบบไม่ได้: '
        + noPassword.map(function (u) { return u.username; }).join(', ')
        + ' — ใช้เมนู ตั้งรหัสผ่านใหม่ให้ผู้ใช้');
    } else {
      add('บัญชีผู้ใช้', 'pass', users.length + ' บัญชี (owner ' + owners.length + ' คน) ตั้งรหัสผ่านครบแล้ว');
    }
  } catch (error) {
    add('บัญชีผู้ใช้', 'fail', error.message);
  }

  // 9) กุญแจลับของระบบ
  try {
    const properties = PropertiesService.getScriptProperties();
    const hasPepper = Boolean(properties.getProperty(CONFIG.passwordPepperProperty));
    const hasSession = Boolean(properties.getProperty(CONFIG.sessionSecretProperty));
    if (hasPepper && hasSession) {
      add('กุญแจลับของระบบ', 'pass', 'สร้างครบแล้ว (เก็บใน Script Properties ไม่ได้อยู่ในชีต)');
    } else {
      add('กุญแจลับของระบบ', 'warn',
        'ยังไม่ได้สร้าง' + (hasPepper ? '' : ' กุญแจแฮชรหัสผ่าน') + (hasSession ? '' : ' กุญแจเซสชัน'),
        'ระบบจะสร้างให้อัตโนมัติตอนสร้างบัญชีแรกหรือมีคนล็อกอินครั้งแรก');
    }
  } catch (error) {
    add('กุญแจลับของระบบ', 'fail', error.message);
  }

  return finishDiagnosis_(checks);
}

function finishDiagnosis_(checks) {
  const failed = checks.filter(function (c) { return c.status === 'fail'; });
  const result = {
    ok: failed.length === 0,
    checkedAt: nowISO_(),
    sheetId: SHEET_ID,
    folderId: FOLDER_ID,
    checks: checks,
    failedCount: failed.length
  };
  console.log(checks.map(function (c) {
    const icon = c.status === 'pass' ? '✅' : (c.status === 'warn' ? '⚠️' : '❌');
    return icon + ' ' + c.name + (c.detail ? ' — ' + c.detail : '') + (c.fix ? '\n      แก้: ' + c.fix : '');
  }).join('\n'));
  return result;
}

function menuDiagnose() {
  const report = diagnoseConnection();
  const lines = report.checks.map(function (c) {
    const icon = c.status === 'pass' ? '✅' : (c.status === 'warn' ? '⚠️' : '❌');
    return icon + ' ' + c.name + (c.detail ? '\n     ' + c.detail : '')
      + (c.fix ? '\n     ➜ ' + c.fix : '');
  });
  SpreadsheetApp.getUi().alert(
    (report.ok ? 'เชื่อมต่อได้ครบทุกจุด' : 'พบ ' + report.failedCount + ' จุดที่ต้องแก้')
    + '\n\n' + lines.join('\n\n')
  );
}

function runSelfTest() {
  const results = [];
  const check = function (name, fn) {
    try {
      const value = fn();
      results.push('✅ ' + name + (value === undefined ? '' : ' → ' + JSON.stringify(value).slice(0, 160)));
    } catch (error) {
      results.push('❌ ' + name + ' → ' + error.message);
    }
  };

  check('เข้าถึงสเปรดชีตได้', function () { return spreadsheet().getName(); });
  check('เข้าถึงโฟลเดอร์ Drive ได้', function () { return attachmentFolder_().getName(); });
  check('HEADERS ครบทุกชีต', function () {
    return sheetNames().map(function (name) { return name + ':' + headerRow(name).length + ' คอลัมน์'; });
  });
  check('ไม่มี key ซ้ำในชีตเดียวกัน', function () {
    sheetNames().forEach(function (name) {
      const keys = headerRow(name);
      const unique = keys.filter(function (key, index) { return keys.indexOf(key) === index; });
      if (keys.length !== unique.length) throw new Error('พบ key ซ้ำในชีต ' + name);
    });
    return 'ผ่าน';
  });
  check('โครงสร้างชีตตรงกับ HEADERS', function () {
    const report = validateSchema();
    if (!report.ok) {
      const problems = [];
      sheetNames().forEach(function (name) {
        (report.sheets[name].problems || []).forEach(function (problem) { problems.push(name + ': ' + problem); });
      });
      throw new Error(problems.join(' | '));
    }
    return 'ผ่านทุกชีต';
  });
  check('คำนวณระยะเยื้องศูนย์ถูกต้อง', function () {
    const order = { labA: 50, labDbl: 18, labEd: 53, labMonoPdOd: 30, labMonoPdOs: 30 };
    computeLabValues_(order);
    // (50+18)/2 − 30 = 4.0 · 53 + 2(4) + 2 = 63.0
    if (order.labDecentrationOd !== 4 || order.labMinBlankOd !== 63) {
      throw new Error('คำนวณผิด: ' + JSON.stringify(order));
    }
    return 'decentration 4.0 มม. · blank 63.0 มม.';
  });
  check('คำนวณยอดเงินถูกต้อง', function () {
    const order = { total: 9300, discount: 800, deposit: 3000 };
    computeOrderTotals_(order);
    if (order.finalTotal !== 8500 || order.balance !== 5500) throw new Error(JSON.stringify(order));
    return 'สุทธิ 8500 · คงเหลือ 5500';
  });
  check('มีบัญชี owner ที่ตั้งรหัสผ่านแล้ว', function () {
    const owners = readAll('Users').filter(function (u) {
      return u.role === 'owner' && u.active !== false && u.passwordHash;
    });
    if (!owners.length) throw new Error('ยังไม่มี — ใช้เมนู OptiCare › สร้างบัญชีผู้ดูแลคนแรก');
    return owners.map(function (u) { return u.username; }).join(', ');
  });
  check('แฮชรหัสผ่านทำงานถูกต้อง', function () {
    const salt = newSalt_();
    const hash = hashPassword_('ทดสอบ1234', salt);
    if (hash === hashPassword_('ทดสอบ1234', newSalt_())) throw new Error('salt ต่างกันต้องได้แฮชต่างกัน');
    if (hash !== hashPassword_('ทดสอบ1234', salt)) throw new Error('รหัสผ่านเดิมต้องได้แฮชเดิม');
    if (hash === hashPassword_('ทดสอบ1235', salt)) throw new Error('รหัสผ่านต่างกันต้องได้แฮชต่างกัน');
    if (/ทดสอบ1234/.test(hash)) throw new Error('ค่าแฮชต้องไม่มีรหัสผ่านจริงปนอยู่');
    return 'salt+pepper ทำงานถูกต้อง';
  });
  check('เกณฑ์ความแข็งแรงของรหัสผ่าน', function () {
    const weak = ['sh0rt', 'ไม่มีตัวเลขเลยนะ', '12345678'];
    weak.forEach(function (password) {
      try {
        assertPasswordStrength_(password);
        throw new Error('ควรปฏิเสธ "' + password + '"');
      } catch (error) {
        if (/ควรปฏิเสธ/.test(error.message)) throw error;
      }
    });
    assertPasswordStrength_('opticare2569');
    return 'ปฏิเสธรหัสอ่อน ' + weak.length + ' แบบ · ผ่านรหัสที่แข็งแรง';
  });
  check('session token เซ็นและตรวจกลับได้', function () {
    const token = issueSessionToken_({ username: 'tester', role: 'admin' });
    const claims = verifySessionToken_(token);
    if (claims.username !== 'tester') throw new Error('ข้อมูลใน token ไม่ตรง');
    const tampered = token.split('.')[0] + '.' + 'x'.repeat(token.split('.')[1].length);
    try {
      verifySessionToken_(tampered);
      throw new Error('token ที่ถูกแก้ไขควรถูกปฏิเสธ');
    } catch (error) {
      if (!/ถูกแก้ไข|ไม่ถูกต้อง/.test(error.message)) throw error;
    }
    return 'เซ็น/ตรวจ/ปฏิเสธของปลอม ผ่าน';
  });

  console.log(results.join('\n'));
  return results;
}
