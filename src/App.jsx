import React, { useState, useMemo } from 'react';
import {
  Lock, User, ArrowRight, AlertCircle, LogOut, Loader2, RefreshCw,
  CheckCircle, Search, Briefcase, ChevronRight, Heart, Gift,
  ChevronLeft, Car, Shield, Banknote, ArrowLeft, Users,
  Phone, MapPin, Edit3, X, Check, AlertTriangle,
  Calendar, TrendingUp, Droplets, Shirt, Zap
} from 'lucide-react';

import { initializeApp }                                from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, query,
         where, doc, updateDoc, addDoc }                from 'firebase/firestore';
// ─── Firebase ────────────────────────────────────────────────────────────────
const FB = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};
let auth, db;
try { const a=initializeApp(FB); auth=getAuth(a); db=getFirestore(a); } catch(e){}

const GAS = import.meta.env.VITE_GAS_URL;
// ─── Analytics (เปิด ปิดการเก็บข้อมูล) ───────────────────────────────────────────────────────────────
// ต้องการเปิด  → true
// ต้องการปิด   → false  (แก้ค่านี้อย่างเดียว แล้ว deploy ใหม่)
const ANALYTICS_ENABLED    = true;
const ANALYTICS_COLLECTION = 'usage_logs';
// ─── Login Lockout Helper ────────────────────────────────────────────────────
// ⚠️ NOTE: Lockout นี้เก็บใน localStorage = ผู้ใช้ clear ได้ → เป็นแค่ UX guard
// ไม่ใช่ security จริง — ต้องเปิด Firebase App Check + Email Enumeration Protection
// ที่ Firebase Console: Authentication → Settings
const LOCKOUT_PREFIX = 'welfare_lockout_';

const getLockoutData = (username) => {
  try {
    const raw = localStorage.getItem(LOCKOUT_PREFIX + username);
    if (!raw) return { count: 0, lockedUntil: null };
    return JSON.parse(raw);
  } catch { return { count: 0, lockedUntil: null }; }
};

const setLockoutData = (username, data) => {
  try {
    localStorage.setItem(LOCKOUT_PREFIX + username, JSON.stringify(data));
  } catch {}
};

const isLockedOut = (username) => {
  const data = getLockoutData(username);
  if (!data.lockedUntil) return false;
  return Date.now() < data.lockedUntil;
};

const getNextMidnight = () => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime();
};

const recordFailedAttempt = (username) => {
  const data = getLockoutData(username);
  const newCount = data.count + 1;
  if (newCount >= 5) {
    setLockoutData(username, { count: newCount, lockedUntil: getNextMidnight() });
  } else {
    setLockoutData(username, { count: newCount, lockedUntil: null });
  }
  return newCount;
};

const clearLockout = (username) => {
  try { localStorage.removeItem(LOCKOUT_PREFIX + username); } catch {}
};

// ─── Helper: ดึงเดือนย้อนหลัง 1 เดือน ──────────────────────────────────────
const getPreviousMonthLabel = (lang, refDate) => {
  // refDate อาจเป็น uploaded_at ของ record สรุป ถ้าไม่มีก็ใช้วันปัจจุบัน
  const d = refDate ? new Date(refDate) : new Date();
  // ย้อนไป 1 เดือน
  d.setMonth(d.getMonth() - 1);

  const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                      'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const enMonths = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
  const jaMonths = ['1月','2月','3月','4月','5月','6月',
                    '7月','8月','9月','10月','11月','12月'];

  const month = d.getMonth();
  const year = d.getFullYear();

  if (lang === 'th') return `${thaiMonths[month]} ${year + 543}`;
  if (lang === 'ja') return `${year}年${jaMonths[month]}`;
  return `${enMonths[month]} ${year}`;
};

// ─── i18n Dictionary ─────────────────────────────────────────────────────────
const I18N = {
  th: {
    appTitle:        'ตรวจสอบสวัสดิการ',
    appSubtitle:     'ระบบจัดการสวัสดิการพนักงาน',
    loginBtn:        'เข้าสู่ระบบ',
    empId:           'รหัสพนักงาน 4 หลัก',
    idCard6:         'รหัสบัตรประชาชน 6 ตัวท้าย',
    errWrongCred:    'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง',
    errNoDb:         'ไม่สามารถเชื่อมต่อฐานข้อมูลได้',
    errPrefix:       'ข้อผิดพลาด: ',
    errLocked:       'บัญชีของคุณถูกระงับชั่วคราวเนื่องจากใส่รหัสผ่านผิดเกินกำหนด กรุณาติดต่อแผนกทรัพยากรบุคคล โทร 128',
    errWarn3:        (remaining) => `คำเตือน: คุณใส่รหัสผ่านผิดแล้ว หากใส่ผิดอีก ${remaining} ครั้ง บัญชีจะถูกระงับ`,
    headerTitle:     'สวัสดิการพนักงาน',
    greeting:        (name) => `สวัสดีครับ คุณ${name} `,
    greetingSub:     'ยินดีต้อนรับสู่ระบบตรวจสอบสวัสดิการ',
    empCodeLabel:    (code) => `รหัสพนักงาน: ${code}`,
    contactInfo:     'ติดต่อสอบถามข้อมูลสวัดิการได้ที่แผนกทรัพยากรบุคคล หรือ โทร 262, 128, 541',
    searchPlaceholder:'ค้นหาสวัสดิการ...',
    yourWelfare:     'สวัสดิการของคุณ',
    tapToView:       'กดเพื่อดูรายละเอียด',
    registeredBadge: 'ลงทะเบียนแล้ว',
    notRegistered:   'ยังไม่ลงทะเบียน',
    itemCount:       (n) => `${n} รายการ`,
    welfareNames: {
      'ของขวัญบุคคลในครอบครัว': 'ของขวัญบุคคลในครอบครัว',
      'ของขวัญวันเกิด':          'ของขวัญวันเกิด',
      'เงินตอบแทนบุพการี':      'เงินตอบแทนบุพการี',
      'ค่าน้ำมัน':              'ค่าน้ำมัน',
      'ประกันกลุ่มภาคสมัครใจ':  'ประกันกลุ่มภาคสมัครใจ',
    },
    noWelfare:       'ยังไม่มีข้อมูลสวัสดิการ',
    noWelfareSub:    'กรุณาติดต่อฝ่าย HR เพื่อเพิ่มข้อมูล',
    searchNotFound:  'ค้นหาไม่พบ',
    searchNotFoundSub:'ลองพิมพ์คำค้นหาอื่นครับ',
    loading:         'กำลังดึงข้อมูล...',
    welfare:         'สวัสดิการ',
    registered:      'ลงทะเบียนแล้ว',
    notReg:          'ยังไม่ลงทะเบียน',
    swipeHint:       '← ปัดซ้าย/ขวา หรือกดลูกศรเพื่อเปลี่ยนสวัสดิการ →',
    editAddress:     'แก้ไขที่อยู่',
    save:            'บันทึก',
    cancel:          'ยกเลิก',
    edit:            'แก้ไข',
    saveOkAddr:      'บันทึกที่อยู่เรียบร้อยแล้ว ✅',
    saveOkPhone:     'บันทึกเบอร์โทรศัพท์เรียบร้อยแล้ว ✅',
    saveErr:         'เกิดข้อผิดพลาดในการบันทึก',
    noFamilyData:    'ไม่มีข้อมูลบุคคลในครอบครัว',
    noPlateData:     'ไม่มีข้อมูลทะเบียนรถ',
    noDetailData:    'ยังไม่มีข้อมูลรายละเอียด',
    noDetailSub:     'กรุณาติดต่อฝ่าย HR เพื่อเพิ่มข้อมูล',
    noApplicantData: 'ไม่มีข้อมูลผู้สมัคร',
    loadingAddr:     'กำลังโหลดข้อมูลที่อยู่...',
    selectProvince:  '-- เลือกจังหวัด --',
    selectOption:    '-- เลือก --',
    phonePlaceholder:'กรอกเบอร์โทรศัพท์',
    detailHeader:    (cur, total) => `${cur} / ${total} รายการ`,
    employee:        'พนักงาน',
    secInsuranceMembers: 'บุคคลที่สมัครประกันสุขภาพกลุ่ม',
    totalPeople:     (n) => `ทั้งหมด ${n} คน`,
    totalCars:       (n) => `ทั้งหมด ${n} คัน`,
    personNo:        (n) => `คนที่ ${n}`,
    carNo:           (n) => `คันที่ ${n}`,
    secInsured:      'ผู้เอาประกัน',
    secFamily:       'บุคคลในครอบครัวที่ขึ้นทะเบียน',
    secEmployee:     'ข้อมูลพนักงาน',
    secPlates:       'ทะเบียนรถที่ขึ้นทะเบียน',
    secBeneficiary:  'ข้อมูลผู้รับสิทธิ์',
    secAddress:      'ที่อยู่จัดส่ง',
    secAddressEdit:  'ที่อยู่จัดส่ง (แก้ไขได้)',
    secInfo:         'ข้อมูลสวัสดิการ',
    fullname:        'ชื่อ-นามสกุล',
    fullnameBene:    'ชื่อ-นามสกุล (ผู้รับสิทธิ์)',
    relation:        'ความเกี่ยวข้อง',
    phone:           'เบอร์โทรศัพท์',
    bank:            'ธนาคาร',
    accountNo:       'เลขที่บัญชี',
    houseNo:         'บ้านเลขที่',
    moo:             'หมู่',
    village:         'หมู่บ้าน',
    soi:             'ซอย / ถนน',
    subdistrict:     'ตำบล / แขวง',
    district:        'อำเภอ / เขต',
    province:        'จังหวัด',
    zipcode:         'รหัสไปรษณีย์',
    addrHouseNo:     'บ้านเลขที่',
    addrMoo:         'หมู่',
    addrVillage:     'หมู่บ้าน',
    addrSoi:         'ซอย',
    addrRoad:        'ถนน',
    addrSubdistrict: 'ตำบล/แขวง',
    addrDistrict:    'อำเภอ/เขต',
    addrProvince:    'จังหวัด',
    addrZipcode:     'รหัสไปรษณีย์',
    mooPrefix:       (m) => `ม.${m}`,
    soiPrefix:       (s) => `ซ.${s}`,
    langLabel:       'ภาษา',
    // ── เพิ่ม i18n สำหรับวงเงินค่ารักษา ──
    medBalanceTitle:    'วงเงินค่ารักษาพยาบาลคงเหลือ',
    medBalanceAsOf:     (d) => `ณ วันที่ ${d}`,
    medBalanceDisclaimer:'(ยังไม่รวมยอดวางบิลของโรงพยาบาล)',
    medBalanceLowAlert: 'วงเงินคงเหลือต่ำกว่า 3,000 บาท',
    medBalanceUnit:     'บาท',
    // ── เพิ่ม i18n สำหรับสรุปค่าน้ำมัน ──
    fuelSummaryTitle:      'สรุปข้อมูลค่าน้ำมันรถส่วนตัว',
    fuelSummaryMonth:      (m) => `ประจำเดือน ${m}`,
    fuelWorkDays:          'วันทำงาน',
    fuelCarDays:           'วันที่นำรถมา',
    fuelDaysUnit:          'วัน',
    fuelDaysCompare:       'เปรียบเทียบวันทำงาน',
    fuelPriceTitle:        'ราคาน้ำมันเฉลี่ยรายเดือน',
    fuelBlueDiesel:        'Blue Diesel / ดีเซล',
    fuelBlueGasohol91:     'Blue Gasohol 91 / แก๊สโซฮอลล์ 91',
    fuelPeak:              'PEAK',
    fuelPriceUnit:         'บาท/ลิตร',
    fuelNoSummary:         'ยังไม่มีข้อมูลสรุปค่าน้ำมัน',
    fuelRemark:            'หมายเหตุ',   // ← เพิ่มบรรทัดนี้
    // ── เครื่องแบบพนักงาน ──
    uniformType:       'ประเภทชุด',
    uniformTypeCount:  'จำนวนประเภทชุด',
    uniformTotal:      'จำนวนชุด',
    uniformShirtSize:  'ขนาดเสื้อ',
    uniformShirtCount: 'จำนวนเสื้อ',
    uniformPantsSize:  'ขนาดกางเกง',
    uniformPantsCount: 'จำนวนกางเกง',
    uniformNote:       'หากต้องการเปลี่ยนแปลงข้อมูล กรุณาติดต่อแผนกทรัพยากรบุคคล โทร 541',
    uniformTotalLabel:  'จำนวนชุดรวม',
    uniformTotalUnit:   'ชุด',
    uniformTotalSame:   (n) => `ชุดละ ${n} ชุด`,
  },

  en: {
    appTitle:        'Welfare Check',
    appSubtitle:     'Employee Welfare Management System',
    loginBtn:        'Sign In',
    empId:           'Employee ID',
    idCard6:         'Last 6 digits of ID card',
    errWrongCred:    'Incorrect employee ID or password',
    errNoDb:         'Cannot connect to database',
    errPrefix:       'Error: ',
    errLocked:       'Your account has been temporarily suspended due to too many incorrect password attempts. Please contact HR Department, call 128',
    errWarn3:        (remaining) => `Warning: You entered the wrong password. ${remaining} more attempt(s) and your account will be locked until midnight`,
    headerTitle:     'Employee Welfare',
    greeting:        (name) => `Hello, ${name} `,
    greetingSub:     'Welcome to the Welfare Check System',
    empCodeLabel:    (code) => `Employee ID: ${code}`,
    contactInfo:     'For welfare inquiries, please contact HR Department or call 262, 128, 541',
    searchPlaceholder:'Search welfare...',
    yourWelfare:     'Your Welfare',
    tapToView:       'Tap to view details',
    registeredBadge: 'Registered',
    notRegistered:   'Not Registered',
    itemCount:       (n) => `${n} items`,
    welfareNames: {
      'ของขวัญบุคคลในครอบครัว': 'Family Gift',
      'ของขวัญวันเกิด':          'Birthday Gift',
      'เงินตอบแทนบุพการี':      'Parental Allowance',
      'ค่าน้ำมัน':              'Fuel Allowance',
      'ประกันกลุ่มภาคสมัครใจ':  'Voluntary Group Insurance',
    },
    noWelfare:       'No welfare data yet',
    noWelfareSub:    'Please contact HR to add your data',
    searchNotFound:  'Not found',
    searchNotFoundSub:'Try a different keyword',
    loading:         'Loading...',
    welfare:         'Welfare',
    registered:      'Registered',
    notReg:          'Not Registered',
    swipeHint:       '← Swipe left/right or use arrows to switch →',
    editAddress:     'Edit Address',
    save:            'Save',
    cancel:          'Cancel',
    edit:            'Edit',
    saveOkAddr:      'Address saved successfully ✅',
    saveOkPhone:     'Phone number saved successfully ✅',
    saveErr:         'An error occurred while saving',
    noFamilyData:    'No family member data',
    noPlateData:     'No vehicle registration data',
    noDetailData:    'No detail data yet',
    noDetailSub:     'Please contact HR to add your data',
    noApplicantData: 'No applicant data',
    loadingAddr:     'Loading address data...',
    selectProvince:  '-- Select Province --',
    selectOption:    '-- Select --',
    phonePlaceholder:'Enter phone number',
    detailHeader:    (cur, total) => `${cur} / ${total} items`,
    employee:        'Employee',
    secInsuranceMembers: 'Group Health Insurance Members',
    totalPeople:     (n) => `Total ${n} persons`,
    totalCars:       (n) => `Total ${n} vehicles`,
    personNo:        (n) => `Member ${n}`,
    carNo:           (n) => `Vehicle ${n}`,
    secInsured:      'Policyholder',
    secFamily:       'Registered Family Members',
    secEmployee:     'Employee Information',
    secPlates:       'Registered Vehicles',
    secBeneficiary:  'Beneficiary Information',
    secAddress:      'Delivery Address',
    secAddressEdit:  'Delivery Address (Editable)',
    secInfo:         'Welfare Information',
    fullname:        'Full Name',
    fullnameBene:    'Full Name (Beneficiary)',
    relation:        'Relationship',
    phone:           'Phone Number',
    bank:            'Bank',
    accountNo:       'Account Number',
    houseNo:         'House No.',
    moo:             'Moo',
    village:         'Village',
    soi:             'Soi / Road',
    subdistrict:     'Sub-district',
    district:        'District',
    province:        'Province',
    zipcode:         'Postal Code',
    addrHouseNo:     'House No.',
    addrMoo:         'Moo',
    addrVillage:     'Village',
    addrSoi:         'Soi',
    addrRoad:        'Road',
    addrSubdistrict: 'Sub-district',
    addrDistrict:    'District',
    addrProvince:    'Province',
    addrZipcode:     'Postal Code',
    mooPrefix:       (m) => `Moo ${m}`,
    soiPrefix:       (s) => `Soi ${s}`,
    langLabel:       'Language',
    // ── Medical balance i18n ──
    medBalanceTitle:    'Remaining Medical Credit',
    medBalanceAsOf:     (d) => `As of ${d}`,
    medBalanceDisclaimer:'(Excluding pending hospital invoices)',
    medBalanceLowAlert: 'Remaining credit is below 3,000 THB',
    medBalanceUnit:     'THB',
    // ── Fuel summary i18n ──
    fuelSummaryTitle:      'Fuel Allowance Summary',
    fuelSummaryMonth:      (m) => `For ${m}`,
    fuelWorkDays:          'Work Days',
    fuelCarDays:           'Days Drove to Work',
    fuelDaysUnit:          'days',
    fuelDaysCompare:       'Work Days Comparison',
    fuelPriceTitle:        'Monthly Average Fuel Prices',
    fuelBlueDiesel:        'Blue Diesel',
    fuelBlueGasohol91:     'Blue Gasohol 91',
    fuelPeak:              'PEAK Diesel',
    fuelPriceUnit:         'THB/litre',
    fuelNoSummary:         'No fuel summary data yet',
    fuelRemark:            'Remarks',   // ← เพิ่มบรรทัดนี้
    uniformType:       'Uniform Type',
    uniformTypeCount:  'No. of Types',
    uniformTotal:      'Total Pieces',
    uniformShirtSize:  'Shirt Size',
    uniformShirtCount: 'No. of Shirts',
    uniformPantsSize:  'Pants Size',
    uniformPantsCount: 'No. of Pants',
    uniformNote:       'To change your uniform information, please contact HR Department, call 541',
    uniformTotalLabel:  'Total Uniforms',
    uniformTotalUnit:   'sets',
    uniformTotalSame:   (n) => `${n} sets each`,
  },

  ja: {
    appTitle:        '福利厚生確認',
    appSubtitle:     '従業員福利厚生管理システム',
    loginBtn:        'ログイン',
    empId:           '従業員番号',
    idCard6:         'IDカード下6桁',
    errWrongCred:    '従業員番号またはパスワードが正しくありません',
    errNoDb:         'データベースに接続できません',
    errPrefix:       'エラー: ',
    errLocked:       'パスワードの入力ミスが多いため、アカウントが一時停止されました。人事部（内線128）にお問い合わせください',
    errWarn3:        (remaining) => `警告: あと${remaining}回間違えるとアカウントが深夜までロックされます`,
    headerTitle:     '従業員福利厚生',
    greeting:        (name) => `こんにちは、${name} さん `,
    greetingSub:     '福利厚生確認システムへようこそ',
    empCodeLabel:    (code) => `従業員番号: ${code}`,
    contactInfo:     '福利厚生に関するお問い合わせは、人事部または内線 262、128、541 まで',
    searchPlaceholder:'福利厚生を検索...',
    yourWelfare:     'あなたの福利厚生',
    tapToView:       'タップして詳細を表示',
    registeredBadge: '登録済み',
    notRegistered:   '未登録',
    itemCount:       (n) => `${n} 件`,
    welfareNames: {
      'ของขวัญบุคคลในครอบครัว': '家族へのギフト',
      'ของขวัญวันเกิด':          '誕生日プレゼント',
      'เงินตอบแทนบุพการี':      '親族手当',
      'ค่าน้ำมัน':              '燃料手当',
      'ประกันกลุ่มภาคสมัครใจ':  '任意団体保険',
    },
    noWelfare:       '福利厚生データがありません',
    noWelfareSub:    'HRに連絡してデータを追加してください',
    searchNotFound:  '見つかりません',
    searchNotFoundSub:'別のキーワードでお試しください',
    loading:         '読み込み中...',
    welfare:         '福利厚生',
    registered:      '登録済み',
    notReg:          '未登録',
    swipeHint:       '← 左右にスワイプまたは矢印で切り替え →',
    editAddress:     '住所を編集',
    save:            '保存',
    cancel:          'キャンセル',
    edit:            '編集',
    saveOkAddr:      '住所を保存しました ✅',
    saveOkPhone:     '電話番号を保存しました ✅',
    saveErr:         '保存中にエラーが発生しました',
    noFamilyData:    '家族情報がありません',
    noPlateData:     '車両登録情報がありません',
    noDetailData:    '詳細情報がありません',
    noDetailSub:     'HRに連絡してデータを追加してください',
    noApplicantData: '申込者情報がありません',
    loadingAddr:     '住所データを読み込み中...',
    selectProvince:  '-- 県を選択 --',
    selectOption:    '-- 選択 --',
    phonePlaceholder:'電話番号を入力',
    detailHeader:    (cur, total) => `${cur} / ${total} 件`,
    employee:        '従業員',
    secInsuranceMembers: '団体健康保険加入者',
    totalPeople:     (n) => `合計 ${n} 名`,
    totalCars:       (n) => `合計 ${n} 台`,
    personNo:        (n) => `第 ${n} 名`,
    carNo:           (n) => `車両 ${n}`,
    secInsured:      '保険契約者',
    secFamily:       '登録済み家族',
    secEmployee:     '従業員情報',
    secPlates:       '登録車両',
    secBeneficiary:  '受益者情報',
    secAddress:      '配送先住所',
    secAddressEdit:  '配送先住所（編集可）',
    secInfo:         '福利厚生情報',
    fullname:        '氏名',
    fullnameBene:    '氏名（受益者）',
    relation:        '続柄',
    phone:           '電話番号',
    bank:            '銀行名',
    accountNo:       '口座番号',
    houseNo:         '番地',
    moo:             '村番号',
    village:         '村名',
    soi:             '路地 / 道路',
    subdistrict:     '区・郡',
    district:        '市・郡',
    province:        '県・府',
    zipcode:         '郵便番号',
    addrHouseNo:     '番地',
    addrMoo:         '村番号',
    addrVillage:     '村名',
    addrSoi:         '路地',
    addrRoad:        '道路',
    addrSubdistrict: '区・郡',
    addrDistrict:    '市・郡',
    addrProvince:    '県・府',
    addrZipcode:     '郵便番号',
    mooPrefix:       (m) => `村 ${m}`,
    soiPrefix:       (s) => `路地 ${s}`,
    langLabel:       '言語',
    // ── Medical balance i18n ──
    medBalanceTitle:    '医療費残高',
    medBalanceAsOf:     (d) => `${d} 時点`,
    medBalanceDisclaimer:'（病院からの未請求分は含まれていません）',
    medBalanceLowAlert: '残高が3,000バーツ未満です',
    medBalanceUnit:     'バーツ',
    // ── Fuel summary i18n ──
    fuelSummaryTitle:      '燃料手当まとめ',
    fuelSummaryMonth:      (m) => `${m}分`,
    fuelWorkDays:          '勤務日数',
    fuelCarDays:           '車通勤日数',
    fuelDaysUnit:          '日',
    fuelDaysCompare:       '勤務日数の比較',
    fuelPriceTitle:        '月間平均燃料価格',
    fuelBlueDiesel:        'ブルーディーゼル',
    fuelBlueGasohol91:     'ブルーガソホール91',
    fuelPeak:              'ピークディーゼル',
    fuelPriceUnit:         'バーツ/リットル',
    fuelNoSummary:         '燃料まとめデータがありません',
    fuelRemark:            '備考',   // ← เพิ่มบรรทัดนี้
    uniformType:       '制服の種類',
    uniformTypeCount:  '種類数',
    uniformTotal:      '総枚数',
    uniformShirtSize:  'シャツサイズ',
    uniformShirtCount: 'シャツ枚数',
    uniformPantsSize:  'パンツサイズ',
    uniformPantsCount: 'パンツ枚数',
    uniformNote:       '情報の変更は人事部（内線541）にお問い合わせください',
    uniformTotalLabel:  '制服合計',
    uniformTotalUnit:   '着',
    uniformTotalSame:   (n) => `各${n}着`,
  },
};

const LANGS = [
  { code:'th', flag:'', name:'ไทย' },
  { code:'en', flag:'', name:'EN' },
  { code:'ja', flag:'', name:'日本語' },
];

const translateWelfareName = (key, t) => {
  if (!t.welfareNames) return key;
  for (const [thName, translated] of Object.entries(t.welfareNames)) {
    if (key.includes(thName)) return translated;
  }
  return key;
};

// ─── Helper: ตัดคำนำหน้าออกจากชื่อ (เพิ่ม "สาว") ──────────────────────────────
const stripTitle = (name) => {
  if (!name) return '';
  const titlePattern = /^\s*(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|คุณ|ว่าที่\s?ร\.ต\.|ดร\.|ผศ\.|รศ\.|ศ\.|สาว)\s*/i;
  return String(name).replace(titlePattern, '').trim();
};

// ─── Helper: ดึงค่าจาก record โดยลองหลาย field name ─────────────────────────
// ✅ ย้ายออกมาข้างนอก pick เพื่อให้ทุกที่เรียกใช้ได้
const isEmpty = (v) =>
  v === null || v === undefined ||
  (typeof v === 'string' && (v.trim() === '' || v.trim() === '-'));

const pick = (record, ...keys) => {
  if (!record) return null;
  for (const k of keys) {
    const v = record[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
};

// ─── Helper: ดึงชื่อจาก record (รองรับหลายชื่อ field) ───────────────────────
const extractName = (record) =>
  pick(record, 'fullname', 'ชื่อ-นามสกุล', 'ชื่อ-สกุล', 'ชื่อ - สกุล',
    'ชื่อ-สกุล (ผู้รับสิทธิ์)', 'ชื่อ-นามสกุล (ผู้รับสิทธิ์)',
    'ชื่อพนักงาน', 'ชื่อ', 'name', 'full_name');

const extractRelation = (record) => {
  // ลองหาจาก field ไทยก่อน (ไม่ค่อยชนกับเบอร์โทร)
  const thaiRel = pick(record, 'ความเกี่ยวข้อง', 'relation', 'ความสัมพันธ์');
  if (thaiRel) return thaiRel;
  // fallback: ดูใน 'relationship' — เฉพาะถ้าค่าไม่ใช่ตัวเลขล้วน (เพราะถ้าเป็นตัวเลข = เบอร์โทร)
  const rel = pick(record, 'relationship');
  if (rel && !/^[\d\s\-+()]+$/.test(String(rel).trim())) return rel;
  return null;
};

const extractBank = (record) =>
  pick(record, 'Bank', 'bank', 'BANK', 'ธนาคาร', 'ชื่อธนาคาร', 'bank_name',
    'bankName', 'Bank Name', 'ธนาคารที่รับเงิน', 'ธนาคาร ', ' ธนาคาร',
    'ชื่อธนาคารที่รับเงิน', 'สถาบันการเงิน', 'สถาบัน', 'เบอร์บัญชีธนาคาร');

const extractAccount = (record) =>
  pick(record, 'Account number', 'account_number', 'accountNumber',
    'เลขที่บัญชี', 'เลขบัญชี', 'บัญชี');

const extractPhone = (record) => {
  // ลองหาจาก field มาตรฐานก่อน
  const standard = pick(record, 'phone', 'Phone', 'เบอร์โทรศัพท์', 'เบอร์โทร', 'tel', 'mobile');
  if (standard) return standard;
  // fallback: ดูใน 'relationship' (ข้อมูลเก่า) — เฉพาะถ้าค่าดูเหมือนเบอร์โทร
  const rel = pick(record, 'relationship');
  if (rel && /^[\d\s\-+()]+$/.test(String(rel).trim())) return rel;
  return null;
}

const extractAddr = (record) => {
  if (!record) return {};
  return {
    house_no:    pick(record, 'house_no',   'บ้านเลขที่', 'houseNo'),
    moo:         pick(record, 'moo',        'หมู่',       'Moo'),
    village:     pick(record, 'village',    'หมู่บ้าน',   'Village'),
    Soi:         pick(record, 'Soi',        'soi',        'ซอย'),
    road:        pick(record, 'road',       'Road',       'ถนน'),
    subdistrict: pick(record, 'subdistrict','ตำบล',       'แขวง',     'ตำบล/แขวง'),
    district:    pick(record, 'district',   'อำเภอ',      'เขต',      'อำเภอ/เขต'),
    province:    pick(record, 'province',   'จังหวัด'),
    zipcode:     pick(record, 'zipcode',    'รหัสไปรษณีย์', 'zip', 'postcode'),
  };
};

// ─── Helper: ดึงวงเงินค่ารักษาพยาบาลคงเหลือ ──────────────────────────────
const extractMedicalBalance = (record) => {
  if (!record) return null;
  const val = pick(record,
    'วงเงินค่ารักษาพยาบาลคงเหลือ',
    'วงเงินคงเหลือ',
    'medical_balance',
    'balance',
    'remaining_balance',
    'วงเงินค่ารักษา',
    'ยอมคงเหลือ',
    'ยอดคงเหลือ'
  );
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  return isNaN(num) ? null : num;
};

// ─── Helper: ดึง timestamp ของวงเงินค่ารักษาจาก Firebase ──────────────────
const extractMedicalBalanceDate = (record) => {
  if (!record) return null;
  const dateVal = pick(record,
    'วันที่อัปเดตวงเงิน',
    'balance_updated_at',
    'medical_balance_date',
    'วันที่อัปเดต',
    'last_edited_at',
    'uploaded_at'
  );
  if (!dateVal) return null;
  if (typeof dateVal === 'object' && dateVal.seconds) {
    return new Date(dateVal.seconds * 1000);
  }
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? null : d;
};

// ─── Helper: ดึงข้อมูลสรุปค่าน้ำมัน ──────────────────────────────────────
// ─── Helper: ดึงข้อมูลสรุปค่าน้ำมัน ──────────────────────────────────────
const extractFuelSummary = (record) => {
  if (!record) return null;
  return {
    workDays: pick(record, 'วันทำงาน', 'work_days', 'workDays', 'วันทํางาน') || null,
    carDays:  pick(record, 'วันที่นำรถมา', 'car_days', 'carDays', 'วันที่นํารถมา', 'จำนวนวันที่นำรถมา', 'จํานวนวันที่นํารถมา') || null,
    alcPoint:    pick(record, 'จุดคำนวน', 'จุดสำหรับคำนวนค่าน้ำมัน',
                              'จุดคํานวน', 'calc_point', 'จุดคำนวณ'),
    distance:     pick(record, 'ระยะทาง', 'distance', 'km',
                               'ระยะทาง (กม.)', 'distance_km'),
    blueDiesel:    pick(record,
      'Blue Diesel/ดีเซล',         // ← เพิ่ม (ตรงกับ Firebase)
      'Blue Diesel /ดีเซล',
      'Blue Diesel / ดีเซล',
      'Blue Diesel', 'blue_diesel', 'blueDiesel', 'ดีเซล',
      'Blue diesel', 'BLUE DIESEL', 'blue diesel',
      'ราคาน้ำมันดีเซล', 'Blue Diesel B7'
    ) || null,
    blueGasohol91: pick(record,
      'Blue Gasohol 91/แก๊สโซฮอลล์ 91',   // ← เพิ่ม (ตรงกับ Firebase)
      'Blue Gasohol 91 /แก๊สโซฮอลล์ 91',
      'Blue Gasohol 91 / แก๊สโซฮอลล์ 91',
      'Blue Gasohol 91/แก๊สโซฮอล์ 91',
      'Blue Gasohol 91', 'blue_gasohol_91', 'blueGasohol91',
      'แก๊สโซฮอลล์ 91', 'Gasohol 91', 'gasohol91',
      'ราคาแก๊สโซฮอลล์ 91', 'Blue Gasohol91', 'แก๊สโซฮอล์ 91'
    ) || null,
    peak: pick(record,
      'PEAK', 'peak', 'Peak',
      'PEAK Diesel', 'PEAK/ดีเซล',
      'peak_diesel', 'peakDiesel', 'ราคา PEAK', 'Peak Diesel'
    ) || null,
    remark: pick(record,
      'หมายเหตุ', 'remark', 'remarks', 'note', 'notes',
      'Remark', 'Note', 'Notes', 'REMARK'
    ) || null,
  };
};

// ─── Helper: ดึง reference date จาก record สรุปค่าน้ำมัน ──────────────────
const extractFuelCalcInfo = (record) => {
  if (!record) return null;
  return {
    calcPoint: pick(record,
      'จุดสำหรับคำนวนค่าน้ำมันรถส่วนตัว',   // ← ชื่อเต็ม
      'จุดสำหรับคํานวนค่าน้ำมันรถส่วนตัว',   // ← ตัวสะกดต่างกัน
      'จุดสำหรับคำนวนค่าน้ํามันรถส่วนตัว',   // ← น้ํามัน แบบอื่น
      'จุดคำนวนค่าน้ำมันรถส่วนตัว',
      'จุดคำนวน',
      'จุดคํานวน',
      'จุดคำนวณ',
      'จุดสำหรับคำนวนค่าน้ำมัน',
      'calc_point',
    ),
    shuttleRoute: pick(record,
      'สายรถรับ-ส่ง', 'สายรถ', 'shuttle_route',
      'route', 'สายรถรับส่ง',
    ),
    distance: pick(record,
      'ระยะทาง', 'distance', 'km',
      'ระยะทาง (กม.)', 'distance_km',
    ),
  };
};const extractFuelSummaryDate = (record) => {
  if (!record) return null;
  const dateVal = pick(record,
    'uploaded_at',
    'last_edited_at',
    'วันที่อัปเดต',
    'created_at'
  );
  if (!dateVal) return null;
  if (typeof dateVal === 'object' && dateVal.seconds) {
    return new Date(dateVal.seconds * 1000);
  }
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? null : d;
};

// ─── Helper: format วันที่เป็นภาษาไทย (พ.ศ.) ─────────────────────────────
const formatThaiDate = (date, lang) => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';

  if (lang === 'th') {
    const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                        'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const day = d.getDate();
    const month = thaiMonths[d.getMonth()];
    const year = d.getFullYear() + 543;
    return `${day} ${month} ${year}`;
  } else if (lang === 'ja') {
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
  } else {
    const enMonths = ['Jan','Feb','Mar','Apr','May','Jun',
                      'Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${enMonths[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }
};

// ─── Helper: format ตัวเลขเงิน ─────────────────────────────────────────────
const formatMoney = (num) => {
  if (num === null || num === undefined) return '—';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getTimestamp = (v) => {
  if (!v) return 0;
  if (typeof v === 'object' && v.seconds) return v.seconds * 1000;
  return new Date(v).getTime() || 0;
};

const T = {
  xs:11, sm:12, base:13, md:14, lg:15, xl:16, '2xl':18, '3xl':22,
  medium:500, semibold:600, bold:700, extrabold:800, black:900,
  md_r:12, lg_r:16, xl_r:20, '2xl_r':24,
  slate50:'#f8fafc', slate100:'#f1f5f9', slate200:'#e2e8f0',
  slate400:'#94a3b8', slate500:'#64748b', slate600:'#475569',
  slate700:'#334155', slate800:'#1e293b', slate900:'#0f172a',
  indigo50:'#eef2ff', indigo100:'#e0e7ff', indigo500:'#6366f1', indigo600:'#4f46e5',
  emerald500:'#10b981', red400:'#f87171', red50:'#fff1f2',
};

const PALETTE = {
  'สวัสดิการของขวัญบุคคลในครอบครัว':                      { Icon:Gift,     g1:'#f43f5e', g2:'#fb7185', bg:'#fff1f2' },
  'สวัสดิการของขวัญวันเกิด':                               { Icon:Gift,     g1:'#f59e0b', g2:'#fb923c', bg:'#fffbeb' },
  'สวัสดิการเงินตอบแทนบุพการี':                           { Icon:Banknote, g1:'#10b981', g2:'#34d399', bg:'#f0fdf4' },
  'สวัสดิการค่าน้ำมันรถ':                                 { Icon:Car,      g1:'#0ea5e9', g2:'#818cf8', bg:'#f0f9ff' },
  'ประกันกลุ่มภาคสมัครใจ':                               { Icon:Shield,   g1:'#8b5cf6', g2:'#6366f1', bg:'#faf5ff' },
  'สวัสดิการค่ารักษาพยาบาล':                             { Icon:Heart,    g1:'#ec4899', g2:'#f472b6', bg:'#fdf2f8' },
  'สวัสดิการค่ารักษาพยาบาลบุคคลในครอบครัว':                { Icon:Heart,    g1:'#ec4899', g2:'#f472b6', bg:'#fdf2f8' },
  'ของขวัญบุคคลในครอบครัว':                               { Icon:Gift,     g1:'#f43f5e', g2:'#fb7185', bg:'#fff1f2' },
  'ของขวัญวันเกิด':                                       { Icon:Gift,     g1:'#f59e0b', g2:'#fb923c', bg:'#fffbeb' },
  'เงินตอบแทนบุพการี':                                   { Icon:Banknote, g1:'#10b981', g2:'#34d399', bg:'#f0fdf4' },
  'สวัสดิการเครื่องแบบพนักงาน':                            { Icon: Shirt, g1: '#4f46e5', g2: '#818cf8', bg: '#eef2ff' },
'เครื่องแบบพนักงาน':                                     { Icon: Shirt, g1: '#4f46e5', g2: '#818cf8', bg: '#eef2ff' },
  'ค่าน้ำมัน':                                           { Icon:Car,      g1:'#0ea5e9', g2:'#818cf8', bg:'#f0f9ff' },
};
// ── Toggle ราคาน้ำมัน: true = แสดง, false = ซ่อน ──
const SHOW_FUEL_PRICES_CARD = false;

// ─── Toggle สวัสดิการแต่ละประเภท ────────────────────────────────────────────
// true  = แสดงให้พนักงานเห็น
// false = ซ่อน (พนักงานไม่เห็นเลย)
const WELFARE_ENABLED = {
  'ของขวัญบุคคลในครอบครัว':  true,
  'ของขวัญวันเกิด':           true,
  'เงินตอบแทนบุพการี':        true,
  'ค่าน้ำมัน':                true,
  'ประกันกลุ่มภาคสมัครใจ':   true,
  'ค่ารักษาพยาบาล':           true,
  'เครื่องแบบพนักงาน':       true,
};

// Helper: เช็คว่า key นี้ถูกปิดอยู่ไหม
const isWelfareEnabled = (key = '') => {
  for (const [name, enabled] of Object.entries(WELFARE_ENABLED)) {
    if (key.includes(name)) return enabled;
  }
  return true; // ถ้าไม่เจอใน list → แสดงตามปกติ
};
// เรียง key จาก "ยาวที่สุด" ก่อน เพื่อให้ specific match ก่อน generic
// เช่น 'สวัสดิการของขวัญวันเกิด' ต้อง match ก่อน 'ของขวัญ' เปล่าๆ
const PALETTE_KEYS_SORTED = Object.keys(PALETTE).sort((a, b) => b.length - a.length);

const pal = (n='') => {
  for (const k of PALETTE_KEYS_SORTED) if (n.includes(k)) return PALETTE[k];
  return { Icon:Briefcase, g1:'#6366f1', g2:'#3b82f6', bg:'#eef2ff' };
};

const normalizeWelfareName = (name) => {
  const map = {
    'ของขวัญบุคคลในครอบครัว':  'สวัสดิการของขวัญบุคคลในครอบครัว',
    'ของขวัญวันเกิด':          'สวัสดิการของขวัญวันเกิด',
    'เงินตอบแทนบุพการี':       'สวัสดิการเงินตอบแทนบุพการี',
    'ค่าน้ำมัน':               'สวัสดิการค่าน้ำมันรถ',
    'เครื่องแบบพนักงาน':       'สวัสดิการเครื่องแบบพนักงาน',
  };
  for (const [oldName, newName] of Object.entries(map)) {
    if (name.includes(oldName)) return newName;
  }
  return name;
};

const ADDR_FIELD_KEYS = [
  { tKey:'addrHouseNo', key:'house_no',     half:false },
  { tKey:'addrMoo',     key:'moo',          half:false },
  { tKey:'addrVillage', key:'village',      half:false },
  { tKey:'addrSoi',     key:'Soi',          half:true  },
  { tKey:'addrRoad',    key:'road',         half:true  },
];

const THAI_ADDR_URL = 'https://raw.githubusercontent.com/earthchie/jquery.Thailand.js/master/jquery.Thailand.js/database/raw_database/raw_database.json';

let _thaiAddrCache = null;
const loadThaiAddr = async () => {
  if (_thaiAddrCache) return _thaiAddrCache;
  try {
    const res = await fetch(THAI_ADDR_URL);
    _thaiAddrCache = await res.json();
    return _thaiAddrCache;
  } catch(e) {
    console.error('Failed to load Thai address DB:', e);
    return [];
  }
};

const getProvinces = (db) => {
  const set = new Set();
  db.forEach(r => set.add(r.province));
  return [...set].sort();
};
const getDistricts = (db, province) => {
  const set = new Set();
  db.forEach(r => { if (r.province === province) set.add(r.amphoe); });
  return [...set].sort();
};
const getSubdistricts = (db, province, district) => {
  const set = new Set();
  db.forEach(r => { if (r.province === province && r.amphoe === district) set.add(r.district); });
  return [...set].sort();
};
const getZipcode = (db, province, district, subdistrict) => {
  const found = db.find(r => r.province === province && r.amphoe === district && r.district === subdistrict);
  return found ? String(found.zipcode) : '';
};

// ─── AddressEditor Component ──────────────────────────────────────────────
function AddressEditor({editBuf, setEditBuf, g1, g2, onSave, onCancel, saveLoad, t}) {
  const [addrDB, setAddrDB] = React.useState([]);
  const [addrLoading, setAddrLoading] = React.useState(true);

  React.useEffect(() => {
    loadThaiAddr().then(db => { setAddrDB(db); setAddrLoading(false); });
  }, []);

  const provinces    = React.useMemo(() => getProvinces(addrDB), [addrDB]);
  const districts    = React.useMemo(() => editBuf.province ? getDistricts(addrDB, editBuf.province) : [], [addrDB, editBuf.province]);
  const subdistricts = React.useMemo(() => (editBuf.province && editBuf.district) ? getSubdistricts(addrDB, editBuf.province, editBuf.district) : [], [addrDB, editBuf.province, editBuf.district]);

  const onProvChange = (v) => {
    setEditBuf({...editBuf, province:v, district:'', subdistrict:'', zipcode:''});
  };
  const onDistChange = (v) => {
    setEditBuf({...editBuf, district:v, subdistrict:'', zipcode:''});
  };
  const onSubdistChange = (v) => {
    const zip = getZipcode(addrDB, editBuf.province, editBuf.district, v);
    setEditBuf({...editBuf, subdistrict:v, zipcode:zip});
  };

  const selectStyle = {
    width:'100%',padding:'10px 12px',background:T.slate50,
    border:'1.5px solid #e8edf5',borderRadius:T.md_r,
    fontSize:T.base,fontWeight:T.semibold,color:T.slate800,
    appearance:'none',WebkitAppearance:'none',
    backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat:'no-repeat',backgroundPosition:'right 12px center',
    cursor:'pointer',
  };

  const inputStyle = {
    width:'100%',padding:'10px 12px',background:T.slate50,
    border:'1.5px solid #e8edf5',borderRadius:T.md_r,
    fontSize:T.base,fontWeight:T.semibold,color:T.slate800,
  };

  const labelStyle = {
    display:'block',fontSize:T.xs,fontWeight:T.bold,
    color:T.slate400,marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em',
  };

  if (addrLoading) {
    return (
      <div style={{padding:24,textAlign:'center',color:T.slate400}}>
        <Loader2 size={20} className="spin" style={{display:'block',margin:'0 auto 8px'}}/>
        <span style={{fontSize:T.sm}}>{t.loadingAddr}</span>
      </div>
    );
  }

  return (
    <div style={{padding:16}}>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
        <SaveCancelBtns onSave={onSave} onCancel={onCancel} loading={saveLoad} g1={g1} g2={g2} t={t}/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {ADDR_FIELD_KEYS.map(({tKey,key,half})=>(
          <div key={key} style={{gridColumn:half?'span 1':'span 2'}}>
            <label style={labelStyle}>{t[tKey]}</label>
            <input value={editBuf[key]||''} onChange={e=>setEditBuf({...editBuf,[key]:e.target.value})}
              style={inputStyle}/>
          </div>
        ))}

        <div style={{gridColumn:'span 2'}}>
          <label style={labelStyle}>{t.addrProvince}</label>
          <select value={editBuf.province||''} onChange={e=>onProvChange(e.target.value)}
            style={selectStyle}>
            <option value="">{t.selectProvince}</option>
            {provinces.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div style={{gridColumn:'span 1'}}>
          <label style={labelStyle}>{t.addrDistrict}</label>
          <select value={editBuf.district||''} onChange={e=>onDistChange(e.target.value)}
            disabled={!editBuf.province}
            style={{...selectStyle, opacity:editBuf.province?1:.5}}>
            <option value="">{t.selectOption}</option>
            {districts.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div style={{gridColumn:'span 1'}}>
          <label style={labelStyle}>{t.addrSubdistrict}</label>
          <select value={editBuf.subdistrict||''} onChange={e=>onSubdistChange(e.target.value)}
            disabled={!editBuf.district}
            style={{...selectStyle, opacity:editBuf.district?1:.5}}>
            <option value="">{t.selectOption}</option>
            {subdistricts.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{gridColumn:'span 1'}}>
          <label style={labelStyle}>{t.addrZipcode}</label>
          <input value={editBuf.zipcode||''} readOnly
            style={{...inputStyle, background:'#f0fdf4', color:'#10b981', fontWeight:700}}/>
        </div>
      </div>
    </div>
  );
}

// ─── MedicalBalanceCard Component ─────────────────────────────────────────
function MedicalBalanceCard({ balance, balanceDate, g1, g2, t, lang }) {
  const isLow = balance !== null && balance < 3000;
  const formattedBalance = formatMoney(balance);
  const formattedDate = formatThaiDate(balanceDate, lang);

  return (
    <div className="aFU" style={{
      background: '#fff',
      borderRadius: T['2xl_r'],
      border: isLow ? '1.5px solid #fca5a5' : '1px solid #eef2ff',
      boxShadow: isLow
        ? '0 4px 20px rgba(239,68,68,.12)'
        : '0 2px 16px rgba(99,102,241,.07)',
      marginBottom: 12,
      overflow: 'hidden',
      animationDelay: '40ms',
    }}>
      <div style={{
        padding: '14px 18px 12px',
        borderBottom: '1px solid #f8fafc',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 4, height: 22, borderRadius: 2,
          background: isLow
            ? 'linear-gradient(180deg,#ef4444,#f87171)'
            : `linear-gradient(180deg,${g1},${g2})`,
          flexShrink: 0,
        }}/>
        <p style={{
          fontWeight: T.bold, fontSize: T.md, margin: 0, lineHeight: 1.3,
          color: isLow ? '#dc2626' : T.slate800,
        }}>
          {t.medBalanceTitle}
        </p>
      </div>

      <div style={{ padding: '18px 18px 16px', textAlign: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: 8,
        }}>
          {isLow && (
            <span className="alertBlink" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <AlertTriangle size={22} color="#ef4444" />
            </span>
          )}
          <span style={{
            fontSize: 32,
            fontWeight: T.black,
            color: isLow ? '#dc2626' : T.slate800,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}>
            {formattedBalance}
          </span>
          <span style={{
            fontSize: T.md,
            fontWeight: T.bold,
            color: isLow ? '#ef4444' : T.slate400,
            marginLeft: 2,
          }}>
            {t.medBalanceUnit}
          </span>
          {isLow && (
            <span className="alertBlink" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <AlertTriangle size={22} color="#ef4444" />
            </span>
          )}
        </div>

        {isLow && (
          <div className="aBI" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 100,
            padding: '5px 14px',
            marginBottom: 10,
          }}>
            <span className="alertBlink" style={{ display: 'inline-flex', lineHeight: 0 }}>
              <AlertCircle size={13} color="#dc2626" />
            </span>
            <span style={{
              fontSize: T.xs,
              fontWeight: T.bold,
              color: '#dc2626',
            }}>
              {t.medBalanceLowAlert}
            </span>
          </div>
        )}

        <p style={{
          fontSize: T.sm,
          fontWeight: T.normal,
          color: "#dc2626",
          margin: '4px 0 2px',
          lineHeight: 1.5,
        }}>
          {t.medBalanceAsOf(formattedDate)}
        </p>

        <p style={{
          fontSize: T.xs,
          fontWeight: T.normal,
          color: "#dc2626",
          margin: 0,
          lineHeight: 1.5,
        }}>
          {t.medBalanceDisclaimer}
        </p>
      </div>
    </div>
  );
}

// ─── FuelSummaryCard Component ────────────────────────────────────────────
// แสดงสรุปข้อมูลค่าน้ำมัน: วันทำงาน vs วันที่นำรถมา, ราคาน้ำมันเฉลี่ย
function FuelSummaryCard({ fuelData, fuelDate, g1, g2, t, lang }) {
  if (!fuelData) return null;

  const { workDays, carDays, remark } = fuelData;
  const monthLabel = getPreviousMonthLabel(lang, fuelDate);

  const parseNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  };

  const workDaysNum = parseNum(workDays);
  const carDaysNum  = parseNum(carDays);
  const carDaysPct  = (workDaysNum && carDaysNum)
    ? Math.min((carDaysNum / workDaysNum) * 100, 100)
    : 0;

  const hasDaysData = workDaysNum !== null || carDaysNum !== null;
  const hasRemark   = remark !== null && String(remark).trim() !== '';

  if (!hasDaysData && !hasRemark) return null;

  return (
    <div className="aFU" style={{
      background: '#fff',
      borderRadius: T['2xl_r'],
      border: '1px solid #eef2ff',
      boxShadow: '0 2px 16px rgba(99,102,241,.07)',
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px 12px',
        borderBottom: '1px solid #f8fafc',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 4, height: 22, borderRadius: 2,
          background: `linear-gradient(180deg,${g1},${g2})`,
          flexShrink: 0,
        }}/>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: T.bold, fontSize: T.md, margin: 0, lineHeight: 1.3, color: T.slate800 }}>
            {t.fuelSummaryTitle}
          </p>
          <p style={{ fontWeight: T.medium, fontSize: T.sm, margin: '2px 0 0', lineHeight: 1.3, color: T.slate400 }}>
            {t.fuelSummaryMonth(monthLabel)}
          </p>
        </div>
      </div>

      {/* Days comparison */}
      {hasDaysData && (
        <div style={{ padding: '16px 18px' }}>
          <p style={{
            fontSize: T.xs, fontWeight: T.bold, color: T.slate400,
            textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14,
          }}>
            {t.fuelDaysCompare}
          </p>

          {/* วันทำงาน */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: `${g1}15`, border: `1.5px solid ${g1}28`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Calendar size={13} color={g1} />
                </div>
                <span style={{ fontSize: T.sm, fontWeight: T.semibold, color: T.slate500 }}>{t.fuelWorkDays}</span>
              </div>
              <span style={{ fontSize: T.xl, fontWeight: T.black, color: T.slate800 }}>
                {workDaysNum !== null ? workDaysNum : '—'}
                <span style={{ fontSize: T.xs, fontWeight: T.semibold, color: T.slate400, marginLeft: 3 }}>{t.fuelDaysUnit}</span>
              </span>
            </div>
            <div style={{ width: '100%', height: 8, borderRadius: 4, background: `${g1}18` }}>
              <div style={{ width: '100%', height: '100%', borderRadius: 4, background: `linear-gradient(90deg,${g1},${g2})` }} />
            </div>
          </div>

          {/* วันที่นำรถมา */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: '#10b98115', border: '1.5px solid #10b98128',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Car size={13} color="#10b981" />
                </div>
                <span style={{ fontSize: T.sm, fontWeight: T.semibold, color: T.slate500 }}>{t.fuelCarDays}</span>
              </div>
              <span style={{ fontSize: T.xl, fontWeight: T.black, color: '#10b981' }}>
                {carDaysNum !== null ? carDaysNum : '—'}
                <span style={{ fontSize: T.xs, fontWeight: T.semibold, color: T.slate400, marginLeft: 3 }}>{t.fuelDaysUnit}</span>
              </span>
            </div>
            <div style={{ width: '100%', height: 8, borderRadius: 4, background: '#10b98118' }}>
              <div style={{
                width: `${carDaysPct}%`, height: '100%', borderRadius: 4,
                background: 'linear-gradient(90deg,#10b981,#34d399)',
                transition: 'width 0.6s cubic-bezier(.22,.68,0,1.2)',
              }} />
            </div>
          </div>
        </div>
      )}

      {/* หมายเหตุ — แสดงเฉพาะเมื่อมีข้อมูล */}
      {hasRemark && (
        <div style={{
          padding: '12px 18px 14px',
          borderTop: hasDaysData ? '1px solid #f8fafc' : 'none',
          background: '#fffbeb',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7, flexShrink: 0, marginTop: 1,
              background: '#fef3c7', border: '1.5px solid #fde68a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertCircle size={13} color="#d97706" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: T.xs, fontWeight: T.bold, color: '#d97706', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {t.fuelRemark}
              </p>
              <p style={{ fontSize: T.sm, fontWeight: T.semibold, color: '#92400e', lineHeight: 1.6, margin: 0, wordBreak: 'break-word' }}>
                {remark}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ─── FuelPricesCard Component ─────────────────────────────────────────────
function FuelPricesCard({ fuelData, fuelDate, g1, g2, t, lang }) {
  if (!fuelData) return null;

  const parseNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  };

  const fuelPrices = [
    { label: t.fuelBlueDiesel,    value: parseNum(fuelData.blueDiesel),    color: '#0ea5e9', Icon: Droplets, showUnit: true  },
    { label: t.fuelBlueGasohol91, value: parseNum(fuelData.blueGasohol91), color: '#22c55e', Icon: Droplets, showUnit: true  },
    { label: t.fuelPeak,          value: parseNum(fuelData.peak),           color: '#f59e0b', Icon: Zap,      showUnit: false },
  ].filter(fp => fp.value !== null);

  if (fuelPrices.length === 0) return null;

  return (
    <div className="aFU" style={{
      background: '#fff',
      borderRadius: T['2xl_r'],
      border: '1px solid #eef2ff',
      boxShadow: '0 2px 16px rgba(99,102,241,.07)',
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px 12px',
        borderBottom: '1px solid #f8fafc',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 4, height: 22, borderRadius: 2,
          background: `linear-gradient(180deg,${g1},${g2})`,
          flexShrink: 0,
        }}/>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: T.bold, fontSize: T.md, margin: 0, color: T.slate800 }}>
            {t.fuelPriceTitle}
          </p>
          <p style={{ fontSize: T.sm, fontWeight: T.medium, margin: '2px 0 0', color: T.slate400 }}>
            {t.fuelSummaryMonth(getPreviousMonthLabel(lang, fuelDate))}
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: '#f0f9ff', borderRadius: 100, padding: '4px 10px',
          border: '1px solid #bae6fd',
        }}>
          <TrendingUp size={11} color="#0ea5e9" />
          <span style={{ fontSize: T.xs, fontWeight: T.bold, color: '#0284c7' }}>
            {t.fuelPriceUnit}
          </span>
        </div>
      </div>

      {/* Price rows */}
      <div style={{ padding: '12px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fuelPrices.map((fp, idx) => (
          <div key={idx} className="aRI" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px',
            background: `${fp.color}08`,
            borderRadius: T.lg_r,
            border: `1px solid ${fp.color}18`,
            animationDelay: `${idx * 60}ms`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: `${fp.color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <fp.Icon size={16} color={fp.color} />
              </div>
              <span style={{ fontSize: T.sm, fontWeight: T.semibold, color: T.slate600, lineHeight: 1.3 }}>
                {fp.label}
              </span>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <span style={{ fontSize: T.xl, fontWeight: T.black, color: T.slate800 }}>
                {formatMoney(fp.value)}
              </span>
              {fp.showUnit && (
                <span style={{ fontSize: T.xs, fontWeight: T.medium, color: T.slate400, marginLeft: 4 }}>
                  {t.fuelPriceUnit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function UniformTotalCard({ totalCount, allSame, typeCount, g1, g2, t }) {
  return (
    <div style={{
      padding: '20px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: `linear-gradient(135deg,${g1},${g2})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 6px 18px ${g1}40`,
        }}>
          <Shirt size={22} color="#fff" />
        </div>
        <div>
          <p style={{ fontSize: T.sm, fontWeight: T.semibold, color: T.slate400, margin: 0 }}>
            {t.uniformTotalLabel}
          </p>
          {typeCount > 1 && (
  <p style={{ fontSize: T.md, fontWeight: T.bold, color: T.slate600, margin: '2px 0 0' }}>
    {typeCount} ประเภท
  </p>
)}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{
          fontSize: 36, fontWeight: T.black, color: T.slate800,
          letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          {totalCount}
        </span>
        <span style={{
          fontSize: T.md, fontWeight: T.bold, color: T.slate400, marginLeft: 4,
        }}>
          {t.uniformTotalUnit}
        </span>
      </div>
    </div>
  );
}
// ─── FuelCalcCard Component ───────────────────────────────────────────────
function FuelCalcCard({ calcInfo, g1, g2 }) {
  if (!calcInfo) return null;

  const rows = [
    {
      label: 'จุดคำนวนค่าน้ำมันรถส่วนตัว',
      value: calcInfo.calcPoint,
      color: '#0ea5e9',
      icon: <MapPin size={15} color="#0ea5e9" />,
    },
    {
      label: 'สายรถรับ-ส่ง',
      value: calcInfo.shuttleRoute,
      color: g1,
      icon: <Car size={15} color={g1} />,
    },
    {
      label: 'ระยะทาง',
      value: calcInfo.distance
        ? `${calcInfo.distance} กม.`
        : null,
      color: '#10b981',
      icon: <TrendingUp size={15} color="#10b981" />,
    },
  ].filter(r => r.value);

  if (rows.length === 0) return null;

  return (
    <div className="aFU" style={{
      background: '#fff',
      borderRadius: T['2xl_r'],
      border: '1px solid #eef2ff',
      boxShadow: '0 2px 16px rgba(99,102,241,.07)',
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px 12px',
        borderBottom: '1px solid #f8fafc',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 4, height: 22, borderRadius: 2,
          background: `linear-gradient(180deg,${g1},${g2})`,
          flexShrink: 0,
        }} />
        <p style={{ fontWeight: T.bold, fontSize: T.md, margin: 0, color: T.slate800 }}>
          ข้อมูลคำนวนค่าน้ำมัน
        </p>
      </div>

      {/* Rows */}
      <div style={{ padding: '10px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row, idx) => (
          <div key={idx} className="aRI" style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            background: `${row.color}08`,
            borderRadius: T.lg_r,
            border: `1px solid ${row.color}18`,
            animationDelay: `${idx * 60}ms`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: `${row.color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {row.icon}
              </div>
              <span style={{
                fontSize: T.sm, fontWeight: T.semibold,
                color: T.slate600, lineHeight: 1.3,
              }}>
                {row.label}
              </span>
            </div>
            <span style={{
              fontSize: T.md, fontWeight: T.black,
              color: T.slate800, flexShrink: 0, marginLeft: 8,
            }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
// ─── Build sections (i18n-aware) ─────────────────────────────────────────────
function buildSections(item, allItems, t, employeeName, medBalanceRecord, familyMedRecord, fuelSummaryRecord, lang) {
  const sheet = (item.sheet_name || item.product || '').trim();
  const $ = x => x || null;

if (sheet.includes('เครื่องแบบพนักงาน')) {
  const uniformItems = allItems.filter(it =>
    (it.sheet_name || it.product || '').includes('เครื่องแบบพนักงาน')
  );
  const items = uniformItems.length > 0 ? uniformItems : [item];

  // ── คำนวณ summary จำนวนชุด ──
  const parseNum = (v) => {
    if (!v && v !== 0) return null;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  };
  const countValues = items
    .map(uItem => parseNum(pick(uItem, 'จำนวนชุด', 'จำนวนชุดรวม')))
    .filter(v => v !== null);

  const uniqueCounts = [...new Set(countValues)];
  const allSame      = uniqueCounts.length === 1;
  const totalCount   = allSame
    ? uniqueCounts[0]                                    // ทุกชุดเท่ากัน → แสดงครั้งเดียว
    : countValues.reduce((a, b) => a + b, 0);           // ต่างกัน → รวมทั้งหมด

  const detailSections = items.map((uItem, idx) => {
    const rows = [
      { label: t.uniformType,       value: pick(uItem, 'ประเภทชุด', 'uniform_type') },
      // ── ลบ uniformTypeCount ออกแล้ว ──
      { label: t.uniformShirtSize,  value: pick(uItem, 'ขนาดเสื้อ', 'shirt_size') },
      { label: t.uniformShirtCount, value: pick(uItem, 'จำนวนเสื้อ', 'shirt_count') },
      { label: t.uniformPantsSize,  value: pick(uItem, 'ขนาดกางเกง', 'pants_size') },
      { label: t.uniformPantsCount, value: pick(uItem, 'จำนวนกางเกง', 'pants_count') },
    ].filter(r => !isEmpty(r.value));

    const typeName = pick(uItem, 'ประเภทชุด', 'uniform_type');
    return {
      id: `uniform_${idx}`,
      title: typeName || t.secInfo,
      rows,
      uniformNote: idx === items.length - 1 ? t.uniformNote : null,
    };
  });

  return [
    // ── Summary card (แสดงก่อน) ──
    ...(countValues.length > 0 ? [{
      id: 'uniform_total',
      isUniformTotal: true,
      totalCount,
      allSame,
      typeCount: items.length,
    }] : []),
    ...detailSections,
  ];
}
  if (sheet.includes('ประกันกลุ่มภาคสมัครใจ')) {
    const people = [];
    const empName = stripTitle(employeeName || extractName(item) || item.username);
    if (empName) people.push({ no: 0, name: empName });
    for (let n = 1; n <= 6; n++) {
      const nm =
        item[`บุคคลในครอบครัวคนที่ ${n}`] ||
        item[`บุคคลในครอบครัวคนที่${n}`]  ||
        item[`คนที่ ${n}`]                  ||
        item[`คนที่${n}`]                   || null;
      if (nm) people.push({ no: n, name: stripTitle(nm) });
    }
    return [
      {id:'people', title:t.secInsuranceMembers, people, count:people.length},
    ];
  }

if (sheet.includes('ค่าน้ำมัน')) {
    const plates=[];
    for(let n=1;n<=6;n++){
      const p=item[`ทะเบียนรถคันที่ ${n}`]||item[`ทะเบียนรถคันที่${n}`];
      if(p) plates.push({label:t.carNo(n), value:p});
    }
    // ── Merge ทั้ง 2 records — Doc "ค่าน้ำมัน" มีราคา, Doc "สรุป" มีวัน ──
    // Doc หลัก (item) มีราคาน้ำมัน → ต้องชนะ summary doc
// ดังนั้นต้อง spread summary ก่อน แล้ว spread item ทับ
    const merged = { ...(fuelSummaryRecord || {}), ...(item || {}) };
    const fuelData = extractFuelSummary(merged);
    const fuelDate = extractFuelSummaryDate(fuelSummaryRecord || item);
    const calcInfo = extractFuelCalcInfo(item);
    const hasCalcInfo = calcInfo && (calcInfo.calcPoint || calcInfo.shuttleRoute || calcInfo.distance);

return [
  {id:'plates', title:t.secPlates, plates, count:plates.length},
  ...(hasCalcInfo ? [{id:'fuelCalc', isFuelCalc:true, calcInfo}] : []),
  ...(fuelData ? [{id:'fuelSummary', title:t.fuelSummaryTitle, isFuelSummary:true, fuelData, fuelDate}] : []),
  ...(fuelData && SHOW_FUEL_PRICES_CARD
    ? [{id:'fuelPrices', title:t.fuelPriceTitle, isFuelPrices:true, fuelData}]
    : []),
];
  }

  if (sheet.includes('เงินตอบแทนบุพการี')) {
    return [{id:'info', title:t.secBeneficiary, rows:[
      {label:t.fullnameBene, value:$(stripTitle(extractName(item)))},
      {label:t.relation,     value:$(extractRelation(item))},
      {label:t.bank,         value:$(extractBank(item))},
      {label:t.accountNo,    value:$(extractAccount(item))},
    ]}];
  }

  if (sheet.includes('ของขวัญบุคคลในครอบครัว')) {
    return [
      {id:'info', title:t.secBeneficiary, rows:[
        {label:t.fullnameBene, value:$(stripTitle(extractName(item)))},
        {label:t.relation,     value:$(extractRelation(item))},
      ]},
      {id:'addr', title:t.secAddress, isAddr:true, editableAddr:false},
    ];
  }

  if (sheet.includes('ของขวัญวันเกิด')) {
    return [
      {id:'info', title:t.secBeneficiary, rows:[
        {label:t.fullname, value:$(stripTitle(extractName(item))), iconType:'name'},
        {label:t.phone,    value:$(extractPhone(item)), editablePhone:true},
      ]},
      {id:'addr', title:t.secAddressEdit, isAddr:true, editableAddr:true},
    ];
  }

  if (sheet === 'สวัสดิการค่ารักษาพยาบาล' || sheet.includes('ค่ารักษาพยาบาล')) {
    const fam = [];
    const famSource = familyMedRecord || item;
    for (let n = 1; n <= 6; n++) {
      const nm =
        famSource[`บุคคลในครอบครัวคนที่ ${n}`] ||
        famSource[`บุคคลในครอบครัวคนที่${n}`]  ||
        famSource[`คนที่ ${n}`]                  ||
        famSource[`คนที่${n}`]                   || null;
      if (nm) fam.push({ no: n, name: stripTitle(nm) });
    }
    return [
      {id:'medBalance', title:t.medBalanceTitle, isMedicalBalance:true},
      ...(fam.length > 0
        ? [{id:'family', title:t.secFamily, families:fam, count:fam.length}]
        : []),
    ];
  }

  return [{id:'info', title:t.secInfo, rows:[
    {label:t.fullname, value:$(stripTitle(extractName(item))||item.username)},
  ]}];
}

// ─── Global CSS ───────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body,*{font-family:'Noto Sans Thai',sans-serif;}

@keyframes popUp {
  0%   { opacity:0; transform:scale(.85) translateY(10px) }
  70%  { transform:scale(1.03) translateY(-2px) }
  100% { opacity:1; transform:scale(1) translateY(0) }
}
.popUp { animation: popUp .28s cubic-bezier(.22,.68,0,1.2) both }

@keyframes fadeUp    {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes fadeIn    {from{opacity:0}to{opacity:1}}
@keyframes scaleIn   {from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
@keyframes rowIn     {from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@keyframes slideInR  {from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:none}}
@keyframes float     {0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
@keyframes shimmer   {0%{background-position:-200%}100%{background-position:200%}}
@keyframes spin      {to{transform:rotate(360deg)}}
@keyframes bounceIn  {0%{opacity:0;transform:scale(.7)}60%{transform:scale(1.06)}80%{transform:scale(.97)}100%{opacity:1;transform:scale(1)}}
@keyframes slideUp   {from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:none}}
@keyframes pulseDot  {0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.6}}
@keyframes pulseRing {0%{transform:scale(.8);opacity:.8}100%{transform:scale(2.2);opacity:0}}
@keyframes skel      {0%{background-position:-300px 0}100%{background-position:300px 0}}
@keyframes shine {
  0%        { left: -100%; opacity: 0 }
  2%        { opacity: 1 }
  12%       { left: 130%;  opacity: 0 }
  12.001%,
  100%      { left: -100%; opacity: 0 }
}
@keyframes ripple    {to{transform:scale(4);opacity:0}}

@keyframes alertBlink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.2; }
}
  @keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}
.shake { animation: shake 0.5s ease-in-out; }
.alertBlink { animation: alertBlink 1s ease-in-out infinite; }

.aFU  {animation:fadeUp   .42s cubic-bezier(.22,.68,0,1.2) both}
.aFI  {animation:fadeIn   .28s ease both}
.aSI  {animation:scaleIn  .4s  cubic-bezier(.22,.68,0,1.2) both}
.aRI  {animation:rowIn    .3s  ease both}
.aSIR {animation:slideInR .38s cubic-bezier(.22,.68,0,1.2) both}
.aBI  {animation:bounceIn .5s  cubic-bezier(.22,.68,0,1.2) both}
.aSU  {animation:slideUp  .44s cubic-bezier(.22,.68,0,1.2) both}
.floA {animation:float 11s ease-in-out infinite}
.floB {animation:float 8s  ease-in-out infinite reverse}
.spin {animation:spin 1s linear infinite}

.shim{
  background:linear-gradient(90deg,#6366f1,#38bdf8,#8b5cf6,#6366f1);
  background-size:300%;
  -webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;
  animation:shimmer 4s linear infinite;
}

.glass{
  background:rgba(255,255,255,.88);
  backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);
  border:1px solid rgba(255,255,255,.96);
}

.skel{
  background:linear-gradient(90deg,#f1f5f9 25%,#e8edf5 50%,#f1f5f9 75%);
  background-size:600px 100%;
  animation:skel 1.4s ease-in-out infinite;
  border-radius:8px;
}

input{transition:border .18s,box-shadow .18s;}
input:focus{outline:none;border-color:#a5b4fc!important;box-shadow:0 0 0 3px rgba(99,102,241,.14)!important;}
button{cursor:pointer;border:none;}
::-webkit-scrollbar{width:0;}

.rowBtn{
  position:relative;overflow:hidden;
  transition:background .13s,transform .12s;
}
.rowBtn:hover{background:#f8fafc!important;}
.rowBtn:active{background:#eef2ff!important;transform:scale(.98);}

.ripple-el{
  position:absolute;border-radius:50%;
  background:rgba(99,102,241,.18);
  transform:scale(0);
  animation:ripple .55s linear;
  pointer-events:none;
}

.cardLift{transition:transform .22s cubic-bezier(.22,.68,0,1.2),box-shadow .22s;}
.cardLift:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(99,102,241,.13)!important;}
.cardLift:active{transform:scale(.985);}

.pDot{
  position:relative;
  display:inline-flex;align-items:center;justify-content:center;
}
.pDot::before{
  content:'';position:absolute;inset:0;border-radius:50%;
  background:currentColor;opacity:.25;
  animation:pulseRing 1.6s ease-out infinite;
}

.heroWrap{position:relative;overflow:hidden;}
.heroWrap::after{
  content:'';
  position:absolute;top:0;bottom:0;width:90px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.32),transparent);
  transform:skewX(-12deg);
  animation:shine 10s ease-in-out 1s infinite;
  pointer-events:none;
}
`;

const Em = () => <span style={{color:'#d1d5db'}}>—</span>;
const Val = ({v}) => (v==null||v==='') ? <Em/> : <>{v}</>;

function useRipple() {
  const [ripples, setRipples] = React.useState([]);
  const timeoutsRef = React.useRef([]);

  // เก็บ timeout ทั้งหมดไว้ใน ref แล้ว clear ตอน unmount
  React.useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, []);

  const addRipple = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.4;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top  - size / 2;
    const id = Date.now();
    setRipples(r => [...r, {id, x, y, size}]);
    const tid = setTimeout(() => {
      setRipples(r => r.filter(rp => rp.id !== id));
      timeoutsRef.current = timeoutsRef.current.filter(t => t !== tid);
    }, 600);
    timeoutsRef.current.push(tid);
  };
  const Ripples = () => (
    <>
      {ripples.map(rp => (
        <span key={rp.id} className="ripple-el"
          style={{left:rp.x, top:rp.y, width:rp.size, height:rp.size}}/>
      ))}
    </>
  );
  return { addRipple, Ripples };
}

const Badge = ({children, color='#6366f1', pulse=false}) => (
  <span style={{display:'inline-flex',alignItems:'center',gap:5,
    padding:'3px 10px',borderRadius:100,fontSize:T.xs,fontWeight:T.bold,
    background:`${color}1a`,color,border:`1px solid ${color}30`}}>
    {pulse && (
      <span style={{position:'relative',display:'inline-flex',width:7,height:7}}>
        <span style={{position:'absolute',inset:0,borderRadius:'50%',
          background:color,animation:'pulseDot 1.6s ease-in-out infinite'}}/>
        <span style={{position:'absolute',inset:-2,borderRadius:'50%',
          border:`1.5px solid ${color}`,opacity:.5,animation:'pulseRing 1.6s ease-out infinite'}}/>
      </span>
    )}
    {children}
  </span>
);

const IconBox = ({g1,g2,size=40,radius=12,children}) => (
  <div style={{width:size,height:size,borderRadius:radius,flexShrink:0,
    background:`linear-gradient(135deg,${g1},${g2})`,
    display:'flex',alignItems:'center',justifyContent:'center',
    boxShadow:`0 5px 16px ${g1}44`,
    transition:'transform .22s cubic-bezier(.22,.68,0,1.2),box-shadow .22s'}}
    onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.1) translateY(-2px)';e.currentTarget.style.boxShadow=`0 10px 24px ${g1}55`;}}
    onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow=`0 5px 16px ${g1}44`;}}>
    {children}
  </div>
);

const SectionCard = ({children, delay=0, slide=false}) => (
  <div className={slide ? 'aSIR' : 'aFU'}
    style={{background:'#fff',borderRadius:T['2xl_r'],
      border:'1px solid #eef2ff',boxShadow:'0 2px 16px rgba(99,102,241,.07)',
      marginBottom:12,overflow:'hidden',animationDelay:`${delay}ms`}}>
    {children}
  </div>
);

const SecHeader = ({title, subtitle, g1, g2, action}) => (
  <div style={{padding:'14px 18px 12px',borderBottom:'1px solid #f8fafc',
    display:'flex',alignItems:'center',justifyContent:'space-between'}}>
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      <div style={{width:4,height:22,borderRadius:2,
        background:`linear-gradient(180deg,${g1},${g2})`,flexShrink:0}}/>
      <div>
        <p style={{fontWeight:T.bold,color:T.slate800,fontSize:T.md,margin:0,lineHeight:1.3}}>{title}</p>
        {subtitle && <p style={{color:T.slate400,fontSize:T.sm,fontWeight:T.medium,margin:'1px 0 0'}}>{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

const InfoRow = ({label, value, last}) => {
  const [tap, setTap] = React.useState(false);
  return (
    <div
      onMouseDown={()=>setTap(true)} onMouseUp={()=>setTap(false)} onMouseLeave={()=>setTap(false)}
      onTouchStart={()=>setTap(true)} onTouchEnd={()=>setTap(false)}
      style={{display:'flex',alignItems:'flex-start',gap:12,padding:'13px 18px',
        borderBottom:last?'none':'1px solid #f8fafc',
        background:tap?'#f8faff':'transparent',
        transition:'background .15s'}}>
      <span style={{width:120,flexShrink:0,fontSize:T.sm,fontWeight:T.semibold,
        color:T.slate400,lineHeight:1.5,paddingTop:1}}>{label}</span>
      <span style={{flex:1,fontSize:T.md,fontWeight:T.bold,color:T.slate800,
        lineHeight:1.5,wordBreak:'break-word'}}><Val v={value}/></span>
    </div>
  );
};

const SkeletonRow = ({w='60%'}) => (
  <div style={{display:'flex',alignItems:'center',gap:12,padding:'13px 18px',
    borderBottom:'1px solid #f8fafc'}}>
    <div className="skel" style={{width:90,height:12,flexShrink:0}}/>
    <div className="skel" style={{width:w,height:12}}/>
  </div>
);

const EditBtn = ({onClick,label='แก้ไข',color='#6366f1'}) => (
  <button onClick={onClick} style={{display:'flex',alignItems:'center',gap:5,
    background:`${color}15`,color,padding:'6px 12px',borderRadius:100,
    fontSize:T.sm,fontWeight:T.bold,transition:'all .18s'}}
    onMouseEnter={e=>{e.currentTarget.style.background=`${color}28`;e.currentTarget.style.transform='scale(1.04)';}}
    onMouseLeave={e=>{e.currentTarget.style.background=`${color}15`;e.currentTarget.style.transform='';}}>
    <Edit3 size={12}/>{label}
  </button>
);

const SaveCancelBtns = ({onSave,onCancel,loading,g1,g2,t}) => (   // ← เพิ่ม ,t
  <div style={{display:'flex',gap:6}}>
    <button onClick={onCancel} style={{display:'flex',alignItems:'center',gap:4,
      background:'#f1f5f9',color:T.slate600,padding:'6px 12px',borderRadius:100,
      fontSize:T.sm,fontWeight:T.bold,transition:'all .15s'}}
      onMouseEnter={e=>e.currentTarget.style.background='#e2e8f0'}
      onMouseLeave={e=>e.currentTarget.style.background='#f1f5f9'}>
      <X size={12}/>{t.cancel}                                     {/* ← เปลี่ยน */}
    </button>
    <button onClick={onSave} disabled={loading} style={{display:'flex',alignItems:'center',gap:4,
      background:`linear-gradient(135deg,${g1},${g2})`,color:'#fff',
      padding:'6px 14px',borderRadius:100,fontSize:T.sm,fontWeight:T.bold,
      opacity:loading?.6:1,boxShadow:`0 4px 12px ${g1}40`,transition:'all .18s'}}
      onMouseEnter={e=>{if(!loading){e.currentTarget.style.transform='scale(1.04)';e.currentTarget.style.boxShadow=`0 6px 18px ${g1}55`;}}}
      onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow=`0 4px 12px ${g1}40`;}}>
      {loading?<Loader2 size={12} className="spin"/>:<><Check size={12}/><span>{t.save}</span></>}  {/* ← เปลี่ยน */}
    </button>
  </div>
);

const RippleRow = ({children, onClick, style={}}) => {
  const {addRipple, Ripples} = useRipple();
  return (
    <button className="rowBtn aRI"
      onClick={e=>{addRipple(e);onClick(e);}}
      style={{width:'100%',display:'flex',alignItems:'center',gap:12,
        padding:'14px 18px',background:'transparent',textAlign:'left',
        position:'relative',overflow:'hidden',...style}}>
      <Ripples/>
      {children}
    </button>
  );
};
// ─── Analytics: บันทึก event ลง Firestore ────────────────────────────────────
// dedup: ภายในวันเดียวกัน, user คนเดียวกัน, event เดียวกัน, welfare เดียวกัน → log แค่ครั้งเดียว
const LOG_DEDUP_KEY = 'welfare_log_dedup';

const logEvent = async (username, eventType, welfareName = null) => {
  if (!ANALYTICS_ENABLED || !db || !username) return;

  const today = new Date().toISOString().split('T')[0];
  const dedupKey = `${today}|${username}|${eventType}|${welfareName || ''}`;

  try {
    const seen = JSON.parse(localStorage.getItem(LOG_DEDUP_KEY) || '{}');
    // ล้าง key เก่าของวันก่อน (เก็บแค่ของวันนี้)
    const todayOnly = {};
    Object.keys(seen).forEach(k => { if (k.startsWith(today)) todayOnly[k] = seen[k]; });
    if (todayOnly[dedupKey]) return;   // log ไปแล้ววันนี้
    todayOnly[dedupKey] = 1;
    localStorage.setItem(LOG_DEDUP_KEY, JSON.stringify(todayOnly));

    const now = new Date();
    await addDoc(collection(db, ANALYTICS_COLLECTION), {
      username,
      event_type:   eventType,
      welfare_name: welfareName || null,
      timestamp:    now.toISOString(),
      date:         today,
      year_month:   `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`,
    });
  } catch(e) {
    console.warn('[Analytics]', e.message);
  }
};
const vib = (ms = 40) => {
  if (navigator?.vibrate) navigator.vibrate(ms);
};

// ─────────────────────────────────────────────────────────────────────────────
// ─── Toast Component ─────────────────────────────────────────────────────────
function Toast({ message, type = 'success', onClose }) {
  React.useEffect(() => {
    if (!message) return;
    const tid = setTimeout(onClose, 2800);
    return () => clearTimeout(tid);
  }, [message, onClose]);

  if (!message) return null;

  const palette = type === 'error'
    ? { bg: '#fff1f2', border: '#fecdd3', color: '#e11d48', Icon: AlertCircle }
    : { bg: '#f0fdf4', border: '#bbf7d0', color: '#10b981', Icon: CheckCircle };

  return (
    <div className="aSU" style={{
      position: 'fixed', bottom: 86, left: '50%', transform: 'translateX(-50%)',
      zIndex: 500, minWidth: 280, maxWidth: 420,
      background: palette.bg, border: `1.5px solid ${palette.border}`,
      borderRadius: T.lg_r, padding: '12px 16px',
      boxShadow: '0 12px 32px rgba(0,0,0,.12)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <palette.Icon size={18} color={palette.color} style={{ flexShrink: 0 }} />
      <span style={{
        fontSize: T.base, fontWeight: T.semibold, color: palette.color, flex: 1,
      }}>
        {message}
      </span>
    </div>
  );
}
export default function App() {
  const [view,      setView]      = useState('login');
  const [loading,   setLoading]   = useState(false);
  const [dataLoad,  setDataLoad]  = useState(false);
  const [error,     setError]     = useState('');
  const [uname,     setUname]     = useState('');
  const [pass,      setPass]      = useState('');
  const [user,      setUser]      = useState(null);
  const [dataList,  setDataList]  = useState([]);
  const [searchQ,   setSearchQ]   = useState('');
  const [activeKey, setActiveKey] = useState(null);
  const [lang,      setLang]      = useState('th');
  const t = I18N[lang];

  const [editMode,  setEditMode]  = useState(null);
  const [editBuf,   setEditBuf]   = useState({});
  const [saveLoad,  setSaveLoad]  = useState(false);
  const [loginShake, setLoginShake] = useState(false);
  const [warnMsg, setWarnMsg] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });   // ← เพิ่ม
  

  const [tx,setTx]=useState(null); const [ty,setTy]=useState(null);

  const employeeRecord = useMemo(() => {
    return dataList.find(it => {
      const sn = (it.sheet_name || it.product || '').trim();
      return sn === 'ชื่อพนักงาน' || sn.includes('ชื่อพนักงาน');
    });
  }, [dataList]);

  const employeeName = useMemo(() => {
    if (!employeeRecord) return '';
    return stripTitle(extractName(employeeRecord));
  }, [employeeRecord]);

    const medBalanceRecord = useMemo(() => {
    return dataList.find(it => {
      const sn = (it.sheet_name || it.product || '').trim();
      return sn.includes('วงเงินค่ารักษาพยาบาลคงเหลือ') || 
             sn.includes('วงเงินค่ารักษา') ||
             sn.includes('วงเงินคงเหลือ') ||
             (sn.includes('วงเงิน') && sn.includes('รักษา'));
    });
  }, [dataList]);

  const familyMedRecord = useMemo(() => {
    return dataList.find(it => {
      const sn = (it.sheet_name || it.product || '').trim();
      return sn.includes('ค่ารักษาพยาบาลบุคคลในครอบครัว');
    });
  }, [dataList]);

  // ── หา record สรุปค่าน้ำมันรถส่วนตัว ──
  const fuelSummaryRecord = useMemo(() => {
    return dataList.find(it => {
      const sn = (it.sheet_name || it.product || '').trim();
      // normalize ำ (sara am) → ให้ match ทั้ง ำ และ ํา
      const snNorm = sn.replace(/\u0e4d\u0e32/g, '\u0e33');
      return (snNorm.includes('สรุป') && (snNorm.includes('น้ำมัน') || sn.includes('น้ํามัน'))) ||
             sn.includes('สรุปข้อมูลสวัสดิการค่าน้ํามันรถส่วนตัว') ||
             sn.includes('สรุปข้อมูลสวัสดิการค่าน้ำมันรถส่วนตัว') ||
             sn.includes('สรุปค่าน้ำมัน') ||
             sn.includes('สรุปค่าน้ํามัน');
    });
  }, [dataList]);

  // ── เช็คว่าพนักงานมีข้อมูลสวัสดิการค่าน้ำมันหรือไม่ ──
  const hasFuelWelfare = useMemo(() => {
    return dataList.some(it => {
      const sn = (it.sheet_name || it.product || '').trim();
      return sn.includes('ค่าน้ำมัน') && !sn.includes('สรุป');
    });
  }, [dataList]);

  const HIDDEN_SHEETS = [
    'ชื่อพนักงาน',
    'ประกันกลุ่ม ภาคสมัครใจ',
    'ข้อมูลสวัสดิการของขวัญ',
    'รเครื่องแบบพนักงาน',
  ];

  const grouped = useMemo(() => {
    const g = {};
    dataList.forEach(it => {
      const k = (it.sheet_name || it.product || 'อื่นๆ').trim();
      if (HIDDEN_SHEETS.some(h => k === h)) return;
      if (k.includes('ชื่อพนักงาน')) return;
      if (k.includes('วงเงินค่ารักษาพยาบาลคงเหลือ') || k === 'วงเงินค่ารักษา') return;
      if (k.includes('ค่ารักษาพยาบาลบุคคลในครอบครัว')) return;
      // ── ซ่อน sheet สรุปค่าน้ำมันรถส่วนตัว — จะถูกรวมในเมนูสวัสดิการค่าน้ำมันรถแทน ──
      if (k.includes('สรุปข้อมูลสวัสดิการค่าน้ํามันรถส่วนตัว') ||
          k.includes('สรุปข้อมูลสวัสดิการค่าน้ำมันรถส่วนตัว') ||
          k.includes('สรุปค่าน้ำมัน') ||
          k.includes('สรุปค่าน้ํามัน')) return;      // ✅ ถูก — เช็ค enabled ก่อน แล้วค่อย push ครั้งเดียว
      if (k.includes('สรุปค่าน้ํามัน')) return;
      if (!isWelfareEnabled(k)) return;
      (g[k] = g[k] || []).push(it);
    });
    

    Object.keys(g).forEach(k => {
      if (g[k].length > 1) {
        g[k].sort((a, b) => getTimestamp(b.uploaded_at) - getTimestamp(a.uploaded_at));
        if (k.includes('ประกันกลุ่มภาคสมัครใจ')) {
          g[k] = [g[k][0]];
        }
      }
    });

// ✅ เพิ่ม isWelfareEnabled เช็คก่อน
if ((medBalanceRecord || familyMedRecord) && isWelfareEnabled('ค่ารักษาพยาบาล')) {
  const baseItem = medBalanceRecord || familyMedRecord;
  g['สวัสดิการค่ารักษาพยาบาล'] = [{
    ...baseItem,
    sheet_name: 'สวัสดิการค่ารักษาพยาบาล',
  }];
}

    return g;
  }, [dataList, medBalanceRecord, familyMedRecord]);

  const allKeys = useMemo(() => Object.keys(grouped), [grouped]);
  const visKeys = useMemo(() => {
    if (!searchQ) return allKeys;
    const q = searchQ.toLowerCase();
    return allKeys.filter(k => k.toLowerCase().includes(q));
  }, [allKeys, searchQ]);

  const curIdx     = activeKey ? allKeys.indexOf(activeKey) : -1;
  const repItem    = activeKey ? grouped[activeKey]?.[0]   : null;
  const groupItems = activeKey ? grouped[activeKey]        : [];

  const VIEWED_KEY = `welfare_viewed_${user?.username || 'guest'}`;
  
  const [viewedAt, setViewedAt] = useState(() => {
    try {
      const stored = localStorage.getItem(VIEWED_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  const hasUpdate = (k) => {
    const items = grouped[k] || [];
    if (items.length === 0) return false;
    let latestTs = 0;
    items.forEach(it => {
      const upTs = getTimestamp(it.uploaded_at);
      const editTs = getTimestamp(it.last_edited_at);
      latestTs = Math.max(latestTs, upTs, editTs);
    });
    if (!latestTs) return false;
    const lastViewed = viewedAt[k] || 0;
    return latestTs > lastViewed;
  };

  const markViewed = (k) => {
    const items = grouped[k] || [];
    let latestTs = 0;
    items.forEach(it => {
      const upTs = getTimestamp(it.uploaded_at);
      const editTs = getTimestamp(it.last_edited_at);
      latestTs = Math.max(latestTs, upTs, editTs);
    });
    if (!latestTs) latestTs = Date.now();
    const newViewed = {...viewedAt, [k]: latestTs};
    setViewedAt(newViewed);
    try { localStorage.setItem(VIEWED_KEY, JSON.stringify(newViewed)); } catch {}
  };

  const open = k => {
    vib(30);
    setActiveKey(k);
    setEditMode(null);
    markViewed(k);
    if (user?.username) logEvent(user.username, 'view_welfare', k);
  };
  const next = ()=>{ if(curIdx<allKeys.length-1) open(allKeys[curIdx+1]); };
  const prev = ()=>{ if(curIdx>0)                open(allKeys[curIdx-1]); };

  const onTS=e=>{setTy(null);setTx(e.targetTouches[0].clientX);};
  const onTM=e=>setTy(e.targetTouches[0].clientX);
  const onTE=()=>{if(!tx||!ty)return;const d=tx-ty;if(d>50)next();if(d<-50)prev();};

  const login = async e=>{
    e.preventDefault();setError('');setWarnMsg('');setLoading(true);
    if(!auth){setError(t.errNoDb);setLoading(false);return;}

    const loginId = uname.includes('@') ? uname.split('@')[0] : uname;

    if (isLockedOut(loginId)) {
      setError(t.errLocked);
      setLoginShake(true);
      setTimeout(() => setLoginShake(false), 600);
      setLoading(false);
      return;
    }

    try{
      const em=uname.includes('@')?uname:`${uname}@test.com`;
      const cr=await signInWithEmailAndPassword(auth,em,pass);
      const nm=cr.user.email.split('@')[0];
      clearLockout(loginId);
      setUser({name:nm,username:nm,email:cr.user.email});
      setView('dash');
      fetch_(nm);
      logEvent(nm, 'login');
    }catch(err){
      if(['auth/invalid-credential','auth/user-not-found','auth/wrong-password'].includes(err.code)) {
        const failCount = recordFailedAttempt(loginId);
        setLoginShake(true);
        setTimeout(() => setLoginShake(false), 600);

        if (failCount >= 5) {
          setError(t.errLocked);
        } else if (failCount >= 3) {
          const remaining = 5 - failCount;
          setError(t.errWrongCred);
          setWarnMsg(t.errWarn3(remaining));
        } else {
          setError(t.errWrongCred);
        }
      } else {
        setError(`${t.errPrefix}${err.message}`);
      }
    }finally{setLoading(false);}
  };

  const fetch_ = async who => {
  const u = who || user?.username;
  if (!db || !u) return;
  setDataLoad(true);
  try {
    const variants = new Set();
variants.add(u);                                  // "0001"

if (/^\d+$/.test(u)) {
  const unpadded = u.replace(/^0+/, '') || '0';
  variants.add(unpadded);                         // "1"
  const asNum = parseInt(u, 10);

  if (!isNaN(asNum)) {
    variants.add(asNum);                          // 1 (number)
    variants.add(asNum.toString());               // "1" (string)

    // ── padding 2, 3, 4 หลัก (string) ──
    [2, 3, 4].forEach(len => {
      variants.add(String(asNum).padStart(len, '0'));   // "01", "001", "0001"
    });

    // ── float formats (กรณี Google Sheets export เป็น "1.0") ──
    variants.add(`${asNum}.0`);                   // "1.0"
    [2, 3, 4].forEach(len => {
      variants.add(`${String(asNum).padStart(len, '0')}.0`);   // "01.0", "001.0", "0001.0"
    });
  }
}

    const rows = [];
    const seen = new Set();
    for (const v of variants) {
      try {
        const sn = await getDocs(
          query(collection(db, 'data'), where('username', '==', v))
        );
        sn.forEach(d => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            rows.push({ id: d.id, ...d.data() });
          }
        });
      } catch (qErr) {
        console.warn('Query failed for variant:', v, qErr);
      }
    }
// ─── FALLBACK: ดึง records พิเศษ (สรุปค่าน้ำมัน + วงเงินค่ารักษา) ───
// records พวกนี้ admin มัก import แยกและอาจเก็บ username ใน format แปลก
// (เช่น "1.0", "0001.0") — ดึงมาทั้ง sheet แล้ว match ฝั่ง client
const fallbackSheets = [
  'สรุปข้อมูลสวัสดิการค่าน้ํามันรถส่วนตัว',
  'สรุปข้อมูลสวัสดิการค่าน้ำมันรถส่วนตัว',
  'สรุปค่าน้ำมัน',
  'สรุปค่าน้ํามัน',
  'วงเงินค่ารักษาพยาบาลคงเหลือ',
  'วงเงินค่ารักษา',
  'วงเงินคงเหลือ',
];

// normalize username สำหรับเทียบ
// "0001" → "1", "1.0" → "1", "0001.0" → "1", 1 → "1"
const normalizeUser = (val) => {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  const m = s.match(/^0*(\d+?)(?:\.0+)?$/);
  return m ? m[1] : s;
};
const myNormalized = normalizeUser(u);

for (const sheetName of fallbackSheets) {
  try {
    const sn = await getDocs(
      query(collection(db, 'data'), where('sheet_name', '==', sheetName))
    );
    sn.forEach(d => {
      const data = d.data();
      if (normalizeUser(data.username) === myNormalized && !seen.has(d.id)) {
        seen.add(d.id);
        rows.push({ id: d.id, ...data });
        console.log(`[FALLBACK] เจอ "${sheetName}" username="${data.username}" (normalized="${normalizeUser(data.username)}")`);
      }
    });
  } catch (qErr) {
    console.warn('Fallback query failed:', sheetName, qErr);
  }
}
rows.sort((a, b) => getTimestamp(b.uploaded_at) - getTimestamp(a.uploaded_at));

// ── DEBUG LOG: เปิด DevTools (F12) → Console เพื่อดูข้อมูล ──
// ลบ block นี้ออกได้หลังจากแก้ปัญหาเสร็จ
console.log('═══════════════════════════════════════');
console.log('[DEBUG] username ที่ใช้ query:', u);
console.log('[DEBUG] จำนวน records ทั้งหมด:', rows.length);
console.log('[DEBUG] รายชื่อ sheet_name ทั้งหมด:');
rows.forEach((r, i) => {
  console.log(`  ${i+1}. sheet_name="${r.sheet_name}" | username="${r.username}" (${typeof r.username})`);
});

// ── ตรวจสอบว่าเจอ record สรุปค่าน้ำมันไหม ──
const debugFuel = rows.find(r => {
  const sn = (r.sheet_name || '').trim();
  return sn.includes('สรุป') || sn.includes('fuel') || sn.includes('น้ำมัน');
});
console.log('[DEBUG] Fuel summary record:', debugFuel ? `พบ! → "${debugFuel.sheet_name}"` : '❌ ไม่พบ');

// ── ตรวจสอบว่าเจอ record วงเงินค่ารักษาไหม ──
const debugMed = rows.find(r => {
  const sn = (r.sheet_name || '').trim();
  return sn.includes('วงเงิน') || sn.includes('balance') || sn.includes('ค่ารักษา');
});
console.log('[DEBUG] Medical balance record:', debugMed ? `พบ! → "${debugMed.sheet_name}"` : '❌ ไม่พบ');
if (debugMed) {
  console.log('[DEBUG] Medical balance fields:', Object.keys(debugMed));
  console.log('[DEBUG] วงเงินคงเหลือ =', debugMed['วงเงินค่ารักษาพยาบาลคงเหลือ']);
  console.log('[DEBUG] วงเงินคงเหลือ2 =', debugMed['วงเงินคงเหลือ']);
  console.log('[DEBUG] ยอดคงเหลือ =', debugMed['ยอดคงเหลือ']);
  console.log('[DEBUG] balance =', debugMed['balance']);
}
console.log('═══════════════════════════════════════');

setDataList(rows);
  } catch (e) {
    console.error(e);
  } finally {
    setDataLoad(false);
  }
};

  const logout=async()=>{
    if(auth)await signOut(auth);
    setUser(null);setDataList([]);setUname('');setPass('');
    setActiveKey(null);setView('login');setWarnMsg('');
    setError('');setSearchQ('');setEditMode(null);setEditBuf({});
    setToast({ message: '', type: 'success' });   // ← ลบบรรทัดนี้ถ้าไม่ทำ Patch #10
    if (user?.username) logEvent(user.username, 'logout');
  };

  const pushGAS = payload => {
    if(GAS) fetch(GAS,{method:'POST',mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:repItem.id,sheet_name:repItem.sheet_name,...payload})
    }).catch(()=>{});
  };

  const savePhone = async ()=>{
    if(!db||!repItem?.id)return;setSaveLoad(true);
    try{
      const phoneVal = editBuf.relationship || '';
      const payload={
        relationship: phoneVal,
        phone:        phoneVal,
        'เบอร์โทรศัพท์': phoneVal,
        last_edited_at: new Date().toISOString(),
        last_edited_by: user.username,
        is_client_edited: true,
      };
      await updateDoc(doc(db,'data',repItem.id),payload);
      pushGAS(payload);
      setDataList(l=>l.map(it=>it.id===repItem.id?{...it,...payload}:it));
      setEditMode(null);
      setToast({ message: t.saveOkPhone, type: 'success' });
    }catch{
      setToast({ message: t.saveErr, type: 'error' });
    }finally{setSaveLoad(false);}
  };

  const saveAddr = async ()=>{
    if(!db||!repItem?.id)return;setSaveLoad(true);
    try{
      const payload={
        house_no:editBuf.house_no||'',
        moo:editBuf.moo||'',
        village:editBuf.village||'',
        Soi:editBuf.Soi||'',
        road:editBuf.road||'',
        subdistrict:editBuf.subdistrict||'',
        district:editBuf.district||'',
        province:editBuf.province||'',
        zipcode:editBuf.zipcode||'',
        'บ้านเลขที่':editBuf.house_no||'',
        'หมู่':editBuf.moo||'',
        'หมู่บ้าน':editBuf.village||'',
        'ซอย':editBuf.Soi||'',
        'ถนน':editBuf.road||'',
        'ตำบล':editBuf.subdistrict||'',
        'อำเภอ':editBuf.district||'',
        'จังหวัด':editBuf.province||'',
        'รหัสไปรษณีย์':editBuf.zipcode||'',
        last_edited_at: new Date().toISOString(),
        last_edited_by:user.username,
        is_client_edited:true,
      };
      await updateDoc(doc(db,'data',repItem.id),payload);
      pushGAS(payload);
      setDataList(l=>l.map(it=>it.id===repItem.id?{...it,...payload}:it));
    setEditMode(null);
      setToast({ message: t.saveOkAddr, type: 'success' });
    }catch{
      setToast({ message: t.saveErr, type: 'error' });
    }finally{setSaveLoad(false);}
  };

    const addrVal = it=>{
    const a = extractAddr(it);
    const soiParts = [];
    if (!isEmpty(a.Soi)) soiParts.push(t.soiPrefix(a.Soi));
    if (!isEmpty(a.road)) soiParts.push(a.road);
    return [
      {label:t.houseNo,     value: isEmpty(a.house_no) ? null : a.house_no},
      {label:t.moo,         value: isEmpty(a.moo) ? null : a.moo},
      {label:t.village,     value: isEmpty(a.village) ? null : a.village},
      {label:t.soi,         value: soiParts.length > 0 ? soiParts.join(' ') : null},
      {label:t.subdistrict, value: isEmpty(a.subdistrict) ? null : a.subdistrict},
      {label:t.district,    value: isEmpty(a.district) ? null : a.district},
      {label:t.province,    value: isEmpty(a.province) ? null : a.province},
      {label:t.zipcode,     value: isEmpty(a.zipcode) ? null : a.zipcode},
    ];
  };

    const hasAnyData = (sec, item) => {
    if (sec.isUniformTotal) return sec.totalCount > 0;    // ← เพิ่มบรรทัดนี้
    if (sec.isMedicalBalance) {
      const bal = extractMedicalBalance(medBalanceRecord || item);
      return bal !== null;
    }
    // FuelSummary → แสดงเสมอถ้ามีข้อมูลสรุป
    if (sec.isFuelSummary) {
      const fd = sec.fuelData;
      if (!fd) return false;
      return fd.workDays !== null || fd.carDays !== null ||
             fd.blueDiesel !== null || fd.blueGasohol91 !== null || fd.peak !== null;
    }
if (sec.isFuelCalc) {
      const ci = sec.calcInfo;
      return !!(ci && (ci.calcPoint || ci.shuttleRoute || ci.distance));
    }
    if (sec.isFuelPrices) {
      const fd = sec.fuelData;
      if (!fd) return false;
      const p = (v) => { if (!v && v !== 0) return null; const n = parseFloat(String(v).replace(/,/g,'')); return isNaN(n)?null:n; };
      return p(fd.blueDiesel) !== null || p(fd.blueGasohol91) !== null || p(fd.peak) !== null;
    }
    if (sec.rows) return sec.rows.some(r => r.value != null && r.value !== '');
    if (sec.families) return sec.families.length > 0;
    if (sec.people) return sec.people.length > 0;
    if (sec.plates) return sec.plates.length > 0;
    if (sec.isAddr) {
      const a = extractAddr(item);
      return !!(a.house_no || a.moo || a.village || a.Soi ||
                a.road || a.subdistrict || a.district ||
                a.province || a.zipcode);
    }
    return false;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // LANG SWITCHER
  // ══════════════════════════════════════════════════════════════════════════
  const [langOpen, setLangOpen] = useState(false);

  const LangFAB = () => (
    <>
      {langOpen && (
        <div onClick={()=>setLangOpen(false)}
          style={{position:'fixed',inset:0,zIndex:89}}/>
      )}

      {langOpen && (
        <div className="popUp" style={{
          position:'fixed',bottom:68,right:16,zIndex:90,
          background:'rgba(255,255,255,.96)',
          backdropFilter:'blur(28px)',WebkitBackdropFilter:'blur(28px)',
          borderRadius:16,overflow:'hidden',
          boxShadow:'0 12px 40px rgba(0,0,0,.10)',
          border:'1px solid rgba(0,0,0,.06)',
          minWidth:140,
        }}>
          {LANGS.map((l,i) => {
            const active = lang === l.code;
            return (
              <button key={l.code}
                onClick={()=>{vib(20);setLang(l.code);setLangOpen(false);}}
                style={{
                  width:'100%',display:'flex',alignItems:'center',
                  justifyContent:'space-between',
                  padding:'12px 18px',border:'none',cursor:'pointer',
                  background:'transparent',
                  borderBottom: i < LANGS.length-1 ? '1px solid rgba(0,0,0,.05)' : 'none',
                  transition:'background .12s',
                }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(0,0,0,.025)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{
                  fontSize:14,
                  fontWeight: active ? 700 : 400,
                  color: active ? T.slate800 : T.slate500,
                  letterSpacing:'.02em',
                }}>{l.name}</span>
                {active && (
                  <span style={{
                    width:6,height:6,borderRadius:'50%',
                    background:T.slate800,flexShrink:0,
                  }}/>
                )}
              </button>
            );
          })}
        </div>
      )}

      <button onClick={()=>{vib(20);setLangOpen(o=>!o);}}
        style={{
          position:'fixed',bottom:20,right:16,zIndex:91,
          border:'none',cursor:'pointer',background:'transparent',
          padding:0,
        }}>
        <span style={{
          fontSize:11,fontWeight:700,
          color: langOpen ? T.slate800 : T.slate500,
          letterSpacing:'.08em',
          textTransform:'uppercase',
          transition:'color .18s',
          borderBottom:`1.5px solid ${langOpen ? T.slate800 : 'transparent'}`,
          paddingBottom:1,
        }}>
          {LANGS.find(l=>l.code===lang)?.code.toUpperCase()}
        </span>
      </button>
    </>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // LOGIN
  // ══════════════════════════════════════════════════════════════════════════
  if(view==='login') return (
    <div style={{minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',
      padding:24,background:'linear-gradient(150deg,#f0f4ff,#e8f0fe 50%,#f0f9ff)',
      position:'relative',overflow:'hidden'}}>
      <style>{CSS}</style>

      <div className="floA" style={{position:'absolute',top:'-20%',left:'-10%',width:'60vw',height:'60vw',
        borderRadius:'50%',background:'radial-gradient(circle,rgba(99,102,241,.13),transparent 65%)',
        pointerEvents:'none'}}/>
      <div className="floB" style={{position:'absolute',bottom:'-15%',right:'-10%',width:'50vw',height:'50vw',
        borderRadius:'50%',background:'radial-gradient(circle,rgba(14,165,233,.1),transparent 65%)',
        pointerEvents:'none'}}/>
      <div className="floA" style={{position:'absolute',top:'40%',right:'5%',width:'35vw',height:'35vw',
        borderRadius:'50%',background:'radial-gradient(circle,rgba(139,92,246,.08),transparent 65%)',
        pointerEvents:'none',animationDelay:'-3s'}}/>

      <LangFAB/>

      <div className={`aFU ${loginShake ? 'shake' : ''}`} style={{width:'100%',maxWidth:380,zIndex:1}}>

        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{position:'relative',display:'inline-block',marginBottom:16}}>
            <div style={{width:72,height:72,borderRadius:22,
              background:'linear-gradient(135deg,#6366f1,#3b82f6)',
              display:'flex',alignItems:'center',justifyContent:'center',
              boxShadow:'0 12px 36px rgba(99,102,241,.35)',margin:'0 auto'}}>
              <Heart size={32} color="#fff" fill="#fff"/>
            </div>
            <div style={{position:'absolute',top:4,right:4,width:12,height:12,borderRadius:'50%',
              background:'#34d399',border:'2px solid #fff',boxShadow:'0 0 0 3px #34d39940'}}/>
          </div>
          <h1 style={{fontSize:T['2xl'],fontWeight:T.black,color:T.slate800,lineHeight:1.25,
            marginBottom:6}}>{t.appTitle}</h1>
          <p style={{color:T.slate400,fontSize:T.base,fontWeight:T.medium}}>{t.appSubtitle}</p>
        </div>

        <form onSubmit={login}>
          {error&&(
            <div className="aSI" style={{display:'flex',alignItems:'flex-start',gap:10,
              background:'#fff1f2',border:'1px solid #fecdd3',color:'#e11d48',
              borderRadius:T.lg_r,padding:'11px 14px',marginBottom:14,fontSize:T.base}}>
              <AlertCircle size={16} style={{flexShrink:0,marginTop:1}}/><span style={{fontWeight:T.semibold}}>{error}</span>
            </div>
          )}
          {warnMsg&&(
            <div className="aSI" style={{display:'flex',alignItems:'flex-start',gap:10,
              background:'#fffbeb',border:'1px solid #fed7aa',color:'#d97706',
              borderRadius:T.lg_r,padding:'11px 14px',marginBottom:14,fontSize:T.sm}}>
              <AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/>
              <span style={{fontWeight:T.semibold}}>{warnMsg}</span>
            </div>
          )}

          <div className="glass" style={{borderRadius:T['2xl_r'],padding:8,marginBottom:12}}>
            {[
              {Ic:User, ph:t.empId,   val:uname, set:setUname, type:'text'},
              {Ic:Lock, ph:t.idCard6, val:pass,  set:setPass,  type:'password'},
            ].map(({Ic,ph,val,set,type},i)=>(
              <div key={i} style={{position:'relative',marginBottom:i===0?6:0}}>
                <div style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',
                  color:T.slate400,pointerEvents:'none'}}><Ic size={16}/></div>
                <input type={type} required placeholder={ph} value={val} onChange={e=>set(e.target.value)}
                  style={{width:'100%',padding:'13px 14px 13px 44px',
                    background:'rgba(248,250,252,.75)',border:'1.5px solid transparent',
                    borderRadius:T.lg_r,fontSize:T.md,fontWeight:T.semibold,color:T.slate800}}/>
              </div>
            ))}
          </div>

          <button type="submit" disabled={loading}
            style={{width:'100%',padding:'13px 0',border:'none',borderRadius:T.xl_r,
              background:'linear-gradient(135deg,#6366f1,#3b82f6)',color:'#fff',
              fontSize:T.md,fontWeight:T.bold,
              boxShadow:'0 8px 24px rgba(99,102,241,.32)',
              display:'flex',alignItems:'center',justifyContent:'center',gap:8,
              opacity:loading?.65:1,transition:'opacity .2s,transform .1s'}}
            onMouseEnter={e=>!loading&&(e.currentTarget.style.transform='translateY(-1px)')}
            onMouseLeave={e=>e.currentTarget.style.transform='none'}>
            {loading?<Loader2 size={18} className="spin"/>:<><span>{t.loginBtn}</span><ArrowRight size={16}/></>}
          </button>
        </form>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════
  const empty = dataList.length===0&&!dataLoad;
  const greetName = employeeName || user?.name || '';

  return (
    <div style={{minHeight:'100dvh',background:'linear-gradient(180deg,#eef2ff 0%,#f6f8fe 120px)',
      display:'flex',justifyContent:'center'}}>
      <style>{CSS}</style>

      <div style={{width:'100%',maxWidth:620,display:'flex',flexDirection:'column',height:'100dvh'}}>

        <div style={{padding:'14px 16px 8px',flexShrink:0}}>
          <div className="glass" style={{borderRadius:T.xl_r,padding:'10px 16px',
            display:'flex',alignItems:'center',justifyContent:'space-between',
            boxShadow:'0 2px 12px rgba(99,102,241,.07)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:36,height:36,borderRadius:11,flexShrink:0,
                background:'linear-gradient(135deg,#6366f1,#3b82f6)',
                display:'flex',alignItems:'center',justifyContent:'center',
                boxShadow:'0 4px 12px rgba(99,102,241,.28)'}}>
                <Heart size={16} color="#fff" fill="#fff"/>
              </div>
              <span style={{fontWeight:T.extrabold,fontSize:T.lg,color:T.slate800}}>{t.headerTitle}</span>
            </div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button onClick={()=>fetch_()} disabled={dataLoad}
                style={{width:34,height:34,borderRadius:10,background:T.slate100,
                  display:'flex',alignItems:'center',justifyContent:'center',color:T.slate500,
                  transition:'all .18s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#e2e8f0';e.currentTarget.style.transform='scale(1.1)';}}
                onMouseLeave={e=>{e.currentTarget.style.background=T.slate100;e.currentTarget.style.transform='';}}>
                <RefreshCw size={14} className={dataLoad?'spin':''}/>
              </button>
              <button onClick={logout}
                style={{width:34,height:34,borderRadius:10,background:'#fff1f2',
                  display:'flex',alignItems:'center',justifyContent:'center',color:'#f43f5e',
                  transition:'all .18s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#fecdd3';e.currentTarget.style.transform='scale(1.1)';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#fff1f2';e.currentTarget.style.transform='';}}>
                <LogOut size={14}/>
              </button>
            </div>
          </div>
        </div>

        <LangFAB/>
      <div style={{flex:1,overflowY:'auto',padding:'0 16px 80px'}}>
      <div className="aFU" style={{padding:'18px 2px 20px'}}>
            <p style={{fontSize:T.xl,fontWeight:T.black,color:T.slate800,lineHeight:1.3,marginBottom:3}}>
              <span className="shim">{t.greeting(greetName)}</span>
            </p>
            <p style={{color:T.slate400,fontSize:T.base,fontWeight:T.medium,marginBottom:6}}>
              {t.greetingSub}
            </p>
            {user?.username && (
              <div style={{display:'inline-flex',alignItems:'center',gap:6,
                background:T.indigo50,padding:'4px 12px',borderRadius:100,
                border:`1px solid ${T.indigo100}`}}>
                <User size={11} color={T.indigo500}/>
                <span style={{fontSize:T.xs,fontWeight:T.bold,color:T.indigo600,letterSpacing:'.02em'}}>
                  {t.empCodeLabel(user.username)}
                </span>
              </div>
            )}
          </div>

          {!empty&&!dataLoad&&(
            <div className="aFU" style={{position:'relative',marginBottom:16,animationDelay:'.06s'}}>
              <Search size={15} style={{position:'absolute',left:13,top:'50%',transform:'translateY(-50%)',
                color:T.slate400,pointerEvents:'none'}}/>
              <input type="text" placeholder={t.searchPlaceholder} value={searchQ}
                onChange={e=>setSearchQ(e.target.value)}
                style={{width:'100%',padding:'11px 14px 11px 40px',background:'#fff',
                  border:'1.5px solid #eef2ff',borderRadius:T.lg_r,fontSize:T.base,
                  fontWeight:T.medium,color:T.slate800,boxShadow:'0 2px 8px rgba(0,0,0,.04)'}}/>
            </div>
          )}

          {dataLoad?(
            <div className="aFI">
              <div style={{background:'#fff',borderRadius:T['2xl_r'],border:'1px solid #eef2ff',
                overflow:'hidden',boxShadow:'0 2px 20px rgba(99,102,241,.06)',marginBottom:14}}>
                <div style={{padding:'14px 18px 12px',borderBottom:'1px solid #f8fafc',
                  display:'flex',alignItems:'center',gap:10}}>
                  <div className="skel" style={{width:34,height:34,borderRadius:10,flexShrink:0}}/>
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
                    <div className="skel" style={{width:'50%',height:12}}/>
                    <div className="skel" style={{width:'32%',height:10}}/>
                  </div>
                  <div className="skel" style={{width:54,height:22,borderRadius:100}}/>
                </div>
                {[1,2,3].map(n=>(
                  <div key={n} style={{display:'flex',alignItems:'center',gap:12,
                    padding:'14px 18px',borderBottom:n<3?'1px solid #f8fafc':'none'}}>
                    <div className="skel" style={{width:46,height:46,borderRadius:14,flexShrink:0}}/>
                    <div style={{flex:1,display:'flex',flexDirection:'column',gap:7}}>
                      <div className="skel" style={{width:`${48+n*12}%`,height:13}}/>
                      <div className="skel" style={{width:88,height:18,borderRadius:100}}/>
                    </div>
                    <div className="skel" style={{width:28,height:28,borderRadius:'50%'}}/>
                  </div>
                ))}
              </div>
            </div>

          ):empty?(
            <div className="aSI" style={{background:'#fff',borderRadius:T['2xl_r'],padding:'44px 28px',
              textAlign:'center',border:'1px solid #eef2ff',boxShadow:'0 2px 16px rgba(0,0,0,.04)'}}>
              <div style={{width:64,height:64,background:T.slate50,borderRadius:18,border:'1px solid #eef2ff',
                display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
                <Gift size={28} color={T.slate200}/></div>
              <p style={{fontSize:T.lg,fontWeight:T.extrabold,color:T.slate700,marginBottom:6}}>{t.noWelfare}</p>
              <p style={{color:T.slate400,fontSize:T.base,lineHeight:1.7}}>{t.noWelfareSub}</p>
            </div>

          ):visKeys.length===0?(
            <div className="aFI" style={{textAlign:'center',padding:'56px 16px'}}>
              <Search size={32} color={T.slate200} style={{marginBottom:10}}/>
              <p style={{color:T.slate600,fontWeight:T.bold,fontSize:T.md,marginBottom:4}}>{t.searchNotFound}</p>
              <p style={{color:T.slate400,fontSize:T.base}}>{t.searchNotFoundSub}</p>
            </div>

          ):(
            <div className="aFU" style={{animationDelay:'.08s'}}>
              <div style={{background:'#fff',borderRadius:T['2xl_r'],border:'1px solid #eef2ff',
                boxShadow:'0 2px 20px rgba(99,102,241,.06)',overflow:'hidden',marginBottom:14}}>

                <div style={{padding:'14px 18px 12px',borderBottom:'1px solid #f8fafc',
                  display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:34,height:34,borderRadius:10,background:T.indigo50,
                    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <Briefcase size={15} color={T.indigo500}/></div>
                  <div style={{flex:1}}>
                    <p style={{fontWeight:T.extrabold,color:T.slate800,fontSize:T.md,marginBottom:1}}>{t.yourWelfare}</p>
                    <p style={{color:T.slate400,fontSize:T.sm,fontWeight:T.medium}}>{t.tapToView}</p>
                  </div>
                  <span style={{background:T.indigo50,color:T.indigo500,fontSize:T.sm,fontWeight:T.bold,
                    padding:'3px 10px',borderRadius:100}}>{t.itemCount(visKeys.length)}</span>
                </div>

                {visKeys.map((k,i)=>{
                  const {Icon,g1,g2}=pal(k); const cnt=grouped[k]?.length||0;
                  const rep=grouped[k]?.[0]||{};
                  const addr=extractAddr(rep);
                  const isMedical = k === 'สวัสดิการค่ารักษาพยาบาล';
                  const hasData = isMedical
                    ? (medBalanceRecord && extractMedicalBalance(medBalanceRecord) !== null)
                    : !!(
                      extractName(rep)||rep.username||
                      extractRelation(rep)||extractAccount(rep)||extractBank(rep)||
                      extractPhone(rep)||
                      addr.house_no||addr.village||addr.province||
                      rep['ทะเบียนรถคันที่ 1']||rep['ทะเบียนรถคันที่1']||
                      rep['บุคคลในครอบครัวคนที่ 1']||rep['บุคคลในครอบครัวคนที่1']||
                      rep['คนที่ 1']||rep['คนที่1']
                    );
                  const displayName = normalizeWelfareName(k);
                  
                  return(
                    <RippleRow key={k} onClick={()=>open(k)}
                      style={{borderBottom:i<visKeys.length-1?'1px solid #f8fafc':'none',
                        animationDelay:`${i*40}ms`}}>
                      <div style={{position:'relative',flexShrink:0}}>
                        <IconBox g1={g1} g2={g2} size={46} radius={14}>
                          <Icon size={20} color="#fff"/>
                        </IconBox>
                        {hasUpdate(k) && (
                          <span style={{
                            position:'absolute',
                            top:-2,
                            right:-2,
                            width:10,
                            height:10,
                            borderRadius:'50%',
                            background:'#ef4444',
                            zIndex:2,
                          }}/>
                        )}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontWeight:T.bold,color:T.slate800,fontSize:T.md,
                          marginBottom:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                          {displayName}
                        </p>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          {hasData ? (
                            <Badge color="#10b981" pulse>
                              <CheckCircle size={11}/>{t.registeredBadge}
                            </Badge>
                          ) : (
                            <Badge color="#f59e0b">
                              <span style={{fontSize:11}}>⏳</span>{t.notRegistered}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div style={{width:28,height:28,borderRadius:'50%',background:T.slate50,
                        display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                        transition:'background .15s,transform .15s'}}>
                        <ChevronRight size={14} color={T.slate400}/></div>
                    </RippleRow>
                  );
                })}
              </div>

              <p style={{textAlign:'center',color:T.slate400,fontSize:T.xs,fontWeight:T.medium,
                marginTop:16,lineHeight:1.7,padding:'0 8px'}}>
                {t.contactInfo}
              </p>

            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          FULL-SCREEN DETAIL
          ══════════════════════════════════════════════════════════════════════ */}
      {activeKey&&repItem&&(()=>{
        const {Icon,g1,g2,bg}=pal(activeKey);
        const sections=buildSections(repItem,groupItems,t,employeeName,medBalanceRecord,familyMedRecord,fuelSummaryRecord,lang);
        const isEditingPhone=editMode==='phone';
        const isEditingAddr=editMode==='addr';
        const repAddr = extractAddr(repItem);
        const isMedicalKey = activeKey === 'สวัสดิการค่ารักษาพยาบาล';
        const repHasData = isMedicalKey
          ? (medBalanceRecord && extractMedicalBalance(medBalanceRecord) !== null)
          : !!(
              extractName(repItem)||repItem.username||
              extractRelation(repItem)||extractAccount(repItem)||extractBank(repItem)||
              extractPhone(repItem)||
              repAddr.house_no||repAddr.village||repAddr.province||
              repItem['ทะเบียนรถคันที่ 1']||repItem['ทะเบียนรถคันที่1']||
              repItem['บุคคลในครอบครัวคนที่ 1']||repItem['บุคคลในครอบครัวคนที่1']||
              repItem['คนที่ 1']||repItem['คนที่1']
            );

        const sectionsWithData = sections.filter(s => hasAnyData(s, repItem));
        const hasAnySectionData = sectionsWithData.length > 0;

        const medBalance = extractMedicalBalance(medBalanceRecord || repItem);
        const medBalanceDate = extractMedicalBalanceDate(medBalanceRecord || repItem);

        return(
          <div className="aFI" style={{position:'fixed',inset:0,zIndex:300,
            background:'#f6f8fe',display:'flex',flexDirection:'column'}}>

            <div style={{position:'sticky',top:0,zIndex:10,flexShrink:0,
              background:'rgba(246,248,254,.94)',backdropFilter:'blur(18px)',
              WebkitBackdropFilter:'blur(18px)',borderBottom:'1px solid #eef2ff',
              padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
              <button onClick={()=>{vib(25);setActiveKey(null);setEditMode(null);}}
                style={{width:38,height:38,borderRadius:12,background:T.slate100,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  color:T.slate700,flexShrink:0,transition:'all .18s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#e2e8f0';e.currentTarget.style.transform='scale(1.08)';}}
                onMouseLeave={e=>{e.currentTarget.style.background=T.slate100;e.currentTarget.style.transform='';}}>
                <ArrowLeft size={18}/>
              </button>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontWeight:T.bold,fontSize:T.md,color:T.slate800,margin:0,
                  whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                  {activeKey === 'สวัสดิการค่ารักษาพยาบาล'
                    ? translateWelfareName('สวัสดิการค่ารักษาพยาบาล', t)
                    : normalizeWelfareName(activeKey)}
                </p>
                <p style={{color:T.slate400,fontSize:T.xs,fontWeight:T.medium,margin:0}}>
                  {t.detailHeader(curIdx+1, allKeys.length)}</p>
              </div>
              <div style={{display:'flex',gap:5,flexShrink:0}}>
                {[{fn:prev,Ic:ChevronLeft,dis:curIdx===0},
                  {fn:next,Ic:ChevronRight,dis:curIdx===allKeys.length-1}].map(({fn,Ic,dis},i)=>(
                  <button key={i} onClick={fn} disabled={dis}
                    style={{width:34,height:34,borderRadius:10,background:T.slate100,
                      display:'flex',alignItems:'center',justifyContent:'center',
                      color:T.slate700,opacity:dis?.28:1,cursor:dis?'not-allowed':'pointer',
                      transition:'all .18s'}}
                    onMouseEnter={e=>{if(!dis){e.currentTarget.style.background='#e2e8f0';e.currentTarget.style.transform='scale(1.1)';}}}
                    onMouseLeave={e=>{e.currentTarget.style.background=T.slate100;e.currentTarget.style.transform='';}}>
                    <Ic size={16}/></button>
                ))}
              </div>
            </div>

            <div style={{flex:1,overflowY:'auto',padding:'16px 16px 60px',
              maxWidth:620,width:'100%',margin:'0 auto'}}
              onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>

              <div key={activeKey} className="aSI heroWrap"
                style={{borderRadius:T['2xl_r'],padding:'22px 20px',marginBottom:14,
                  background:`linear-gradient(135deg,${g1},${g2})`,
                  boxShadow:`0 18px 48px ${g1}50`,position:'relative',overflow:'hidden'}}>
                <div style={{position:'absolute',top:-40,right:-40,width:160,height:160,
                  borderRadius:'50%',background:'rgba(255,255,255,.1)'}}/>
                <div style={{position:'absolute',bottom:-50,left:-30,width:120,height:120,
                  borderRadius:'50%',background:'rgba(0,0,0,.07)'}}/>

                <div style={{display:'flex',alignItems:'center',gap:16,position:'relative',zIndex:1}}>
                  <div className="aBI" style={{width:60,height:60,borderRadius:18,flexShrink:0,
                    background:'rgba(255,255,255,.22)',border:'1.5px solid rgba(255,255,255,.3)',
                    display:'flex',alignItems:'center',justifyContent:'center',animationDelay:'.1s'}}>
                    <Icon size={28} color="#fff"/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{color:'rgba(255,255,255,.7)',fontSize:T.xs,fontWeight:T.semibold,
                      marginBottom:4,textTransform:'uppercase',letterSpacing:'.1em'}}>{t.welfare}</p>
                    <p style={{color:'#fff',fontSize:T.xl,fontWeight:T.black,marginBottom:8,
                      lineHeight:1.2,wordBreak:'break-word'}}>{translateWelfareName(activeKey, t)}</p>
                    {repHasData ? (
                      <Badge color="rgba(255,255,255,.85)" pulse>
                        <CheckCircle size={11} color="rgba(255,255,255,.85)"/>
                        <span>{t.registered}</span>
                      </Badge>
                    ) : (
                      <Badge color="rgba(255,255,255,.7)">
                        <span style={{fontSize:11}}>⏳</span>
                        <span>{t.notReg}</span>
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {!hasAnySectionData ? (
                <div className="aSI" style={{background:'#fff',borderRadius:T['2xl_r'],
                  padding:'48px 28px',textAlign:'center',border:'1px solid #eef2ff',
                  boxShadow:'0 2px 16px rgba(0,0,0,.04)'}}>
                  <div style={{width:72,height:72,background:bg||T.slate50,borderRadius:20,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    margin:'0 auto 16px'}}>
                    <Icon size={32} color={g1}/>
                  </div>
                  <p style={{fontSize:T.lg,fontWeight:T.extrabold,color:T.slate700,marginBottom:6}}>
                    {t.noDetailData}
                  </p>
                  <p style={{color:T.slate400,fontSize:T.base,lineHeight:1.7}}>
                    {t.noDetailSub}
                  </p>
                </div>
              ) : (
                sections.map((sec,si)=>(
                  <SectionCard key={sec.id} delay={si*80} slide={si>0}>

                    {/* ── MedicalBalanceCard ── */}
                    {sec.isUniformTotal ? (
  <>
    <SecHeader title={t.uniformTotalLabel} g1={g1} g2={g2} />
    <UniformTotalCard
      totalCount={sec.totalCount}
      allSame={sec.allSame}
      typeCount={sec.typeCount}
      g1={g1} g2={g2} t={t}
    />
  </>
) : sec.isMedicalBalance ? (
  <MedicalBalanceCard
    balance={medBalance}
    balanceDate={medBalanceDate}
    g1={g1} g2={g2}
    t={t}
    lang={lang}
   />
)  : sec.isFuelSummary ? (
  <FuelSummaryCard
    fuelData={sec.fuelData}
    fuelDate={sec.fuelDate}
    g1={g1} g2={g2}
    t={t}
    lang={lang}
  />
) : sec.isFuelCalc ? (
  <FuelCalcCard
    calcInfo={sec.calcInfo}
    g1={g1} g2={g2}
  />
) : sec.isFuelPrices ? (
  <FuelPricesCard
    fuelData={sec.fuelData}
    fuelDate={sec.fuelDate}
    g1={g1} g2={g2}
    t={t}
    lang={lang}
  />
                    ) : (
                      <>
                        <SecHeader
                          title={sec.title}
                          subtitle={sec.count!=null
                            ? ((sec.families || sec.people) ? t.totalPeople(sec.count) : t.totalCars(sec.count))
                            : null}
                          g1={g1} g2={g2}
                          action={
                            sec.isAddr && sec.editableAddr && !isEditingAddr ? (
                              <EditBtn onClick={()=>{
                                  setEditMode('addr');
                                  setEditBuf({...repItem, ...extractAddr(repItem)});
                                }} label={t.editAddress} color={g1}/>
                            ) : null
                          }
                        />

                        {sec.people&&(
                          sec.people.length>0?(
                            <div>
                              {sec.people.map((person,pi)=>(
                                <div key={pi} className="aRI" style={{display:'flex',alignItems:'center',
                                  gap:12,padding:'13px 18px',
                                  borderBottom:pi<sec.people.length-1?'1px solid #f8fafc':'none',
                                  animationDelay:`${pi*30}ms`}}>
                                  <div style={{width:36,height:36,borderRadius:11,flexShrink:0,
                                    background:`${g1}15`,border:`1.5px solid ${g1}28`,
                                    display:'flex',alignItems:'center',justifyContent:'center'}}>
                                    {person.no === 0 ? (
                                      <User size={15} color={g1}/>
                                    ) : (
                                      <span style={{fontSize:T.base,fontWeight:T.black,color:g1}}>{person.no}</span>
                                    )}
                                  </div>
                                  <div style={{flex:1,minWidth:0}}>
                                    <p style={{color:T.slate400,fontSize:T.sm,fontWeight:T.semibold,
                                      marginBottom:2}}>
                                      {person.no === 0 ? t.employee : t.personNo(person.no)}
                                    </p>
                                    <p style={{color:T.slate800,fontSize:T.md,fontWeight:T.bold,
                                      lineHeight:1.5,wordBreak:'break-word',margin:0}}>{person.name}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ):(
                            <div style={{padding:'32px 18px',textAlign:'center',color:T.slate400,fontSize:T.base}}>
                              <Users size={30} color={T.slate200} style={{display:'block',margin:'0 auto 10px'}}/>
                              {t.noApplicantData}
                            </div>
                          )
                        )}

                        {sec.families&&(
                          sec.families.length>0?(
                            <div>
                              {sec.families.map((fam,fi)=>(
                                <div key={fi} className="aRI" style={{display:'flex',alignItems:'center',
                                  gap:12,padding:'13px 18px',
                                  borderBottom:fi<sec.families.length-1?'1px solid #f8fafc':'none',
                                  animationDelay:`${fi*30}ms`}}>
                                  <div style={{width:36,height:36,borderRadius:11,flexShrink:0,
                                    background:`${g1}15`,border:`1.5px solid ${g1}28`,
                                    display:'flex',alignItems:'center',justifyContent:'center'}}>
                                    <span style={{fontSize:T.base,fontWeight:T.black,color:g1}}>{fam.no}</span>
                                  </div>
                                  <div style={{flex:1,minWidth:0}}>
                                    <p style={{color:T.slate400,fontSize:T.sm,fontWeight:T.semibold,
                                      marginBottom:2}}>{t.personNo(fam.no)}</p>
                                    <p style={{color:T.slate800,fontSize:T.md,fontWeight:T.bold,
                                      lineHeight:1.5,wordBreak:'break-word',margin:0}}>{fam.name}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ):(
                            <div style={{padding:'32px 18px',textAlign:'center',color:T.slate400,fontSize:T.base}}>
                              <Users size={30} color={T.slate200} style={{display:'block',margin:'0 auto 10px'}}/>
                              {t.noFamilyData}
                            </div>
                          )
                        )}

                        {sec.plates&&(
                          sec.plates.length>0?(
                            <div>
                              {sec.plates.map((p,pi)=>(
                                <div key={pi} className="aRI" style={{display:'flex',alignItems:'center',
                                  gap:12,padding:'11px 18px',
                                  borderBottom:pi<sec.plates.length-1?'1px solid #f8fafc':'none',
                                  animationDelay:`${pi*30}ms`}}>
                                  <div style={{width:36,height:36,borderRadius:11,flexShrink:0,
                                    background:`${g1}15`,border:`1px solid ${g1}25`,
                                    display:'flex',alignItems:'center',justifyContent:'center'}}>
                                    <Car size={15} color={g1}/></div>
                                  <div style={{flex:1}}>
                                    <p style={{color:T.slate400,fontSize:T.xs,fontWeight:T.semibold,marginBottom:1}}>{p.label}</p>
                                    <p style={{color:T.slate800,fontSize:T.md,fontWeight:T.bold}}>{p.value}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ):(
                            <div style={{padding:'28px 18px',textAlign:'center',color:T.slate400,fontSize:T.base}}>{t.noPlateData}</div>
                          )
                        )}

                        {sec.isAddr&&(
                          isEditingAddr&&sec.editableAddr?(
                            <AddressEditor
                              editBuf={editBuf}
                              setEditBuf={setEditBuf}
                              g1={g1} g2={g2}
                              onSave={saveAddr}
                              onCancel={()=>setEditMode(null)}
                              saveLoad={saveLoad}
                              t={t}
                            />
                          ):(
                            <div style={{padding:'4px 0'}}>
                              {addrVal(repItem).map((r,ri,arr)=>(
                                <InfoRow key={ri} label={r.label} value={r.value} last={ri===arr.length-1}/>
                              ))}
                            </div>
                          )
                        )}

                        {sec.rows&&(
                          <div style={{padding:'4px 0'}}>
                            {sec.rows.map((r,ri)=>{
                              const isPhone=r.editablePhone;
                              const isNameIcon=r.iconType==='name';
                              const isLast=ri===sec.rows.length-1;
                              return(
                                <div key={ri}>
                                  {isPhone?(
                                    <div style={{padding:'12px 18px',
                                      borderBottom:isLast?'none':'1px solid #f8fafc'}}>
                                      <div style={{display:'flex',alignItems:'center',
                                        justifyContent:'space-between',marginBottom: isEditingPhone?10:0}}>
                                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                                          <div style={{width:28,height:28,borderRadius:8,background:`${g1}15`,
                                            display:'flex',alignItems:'center',justifyContent:'center'}}>
                                            <Phone size={13} color={g1}/></div>
                                          <span style={{fontSize:T.sm,fontWeight:T.semibold,color:T.slate400}}>
                                            {r.label}
                                          </span>
                                        </div>
                                        {!isEditingPhone?(
                                          <EditBtn
                                            onClick={()=>{
                                              setEditMode('phone');
                                              setEditBuf({relationship: extractPhone(repItem) || ''});
                                            }}
                                            label={t.edit} color={g1}/>
                                        ):(
                                          <SaveCancelBtns onSave={savePhone} onCancel={()=>setEditMode(null)} loading={saveLoad} g1={g1} g2={g2} t={t}/>
                                        )}
                                      </div>
                                      {isEditingPhone?(
                                        <input type="tel" value={editBuf.relationship||''}
                                          onChange={e=>setEditBuf({...editBuf,relationship:e.target.value})}
                                          placeholder={t.phonePlaceholder}
                                          style={{width:'100%',padding:'10px 12px',background:T.slate50,
                                            border:'1.5px solid #e8edf5',borderRadius:T.md_r,
                                            fontSize:T.base,fontWeight:T.semibold,color:T.slate800}}/>
                                      ):(
                                        <p style={{fontSize:T.md,fontWeight:T.bold,color:T.slate800,
                                          marginTop:4,marginLeft:36}}><Val v={r.value}/></p>
                                      )}
                                    </div>
                                  ):isNameIcon?(
                                    <div style={{padding:'12px 18px',
                                      borderBottom:isLast?'none':'1px solid #f8fafc'}}>
                                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                                        <div style={{width:28,height:28,borderRadius:8,background:`${g1}15`,
                                          display:'flex',alignItems:'center',justifyContent:'center'}}>
                                          <User size={13} color={g1}/>
                                        </div>
                                        <span style={{fontSize:T.sm,fontWeight:T.semibold,color:T.slate400}}>
                                          {r.label}
                                        </span>
                                      </div>
                                      <p style={{fontSize:T.md,fontWeight:T.bold,color:T.slate800,
                                        marginTop:4,marginLeft:36}}><Val v={r.value}/></p>
                                    </div>
                                  ):(
                                    <InfoRow label={r.label} value={r.value} last={isLast}/>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                    {sec.rows && sec.uniformNote && (
  <div style={{
    padding: '12px 18px 14px',
    borderTop: '1px solid #f8fafc',
    background: '#eef2ff',
    display: 'flex',
    justifyContent: 'center',  // ← เพิ่ม
    alignItems: 'flex-start',
    gap: 8,
  }}>
    <p style={{
      fontSize: T.xs,
      fontWeight: T.semibold,
      color: T.slate400,
      margin: 0,
      lineHeight: 1.6,
      textAlign: 'center',  // ← เพิ่ม
    }}>
      {sec.uniformNote}
    </p>
  </div>
)}
                  </SectionCard>
                ))
              )}
{/* ── หมายเหตุเงินตอบแทนบุพการี ── */}
{activeKey && activeKey.includes('บุพการี') && (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    padding: '2px 4px 10px',
  }}>
    <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}></span>
    <p style={{
      fontSize: T.xs,
      fontWeight: T.medium,
      color: T.slate400,
      margin: 0,
      lineHeight: 1.7,
    }}>
      บริษัทฯ กำหนดจ่ายในวันสุดท้ายก่อนวันหยุดบริษัทฯ เทศกาลวันสงกรานต์
    </p>
  </div>
)}

{/* ── หมายเหตุของขวัญบุคคลในครอบครัว ── */}
{activeKey && activeKey.includes('ของขวัญบุคคลในครอบครัว') && (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    padding: '2px 4px 10px',
  }}>
    <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}></span>
    <p style={{
      fontSize: T.xs,
      fontWeight: T.medium,
      color: T.slate400,
      margin: 0,
      lineHeight: 1.7,
    }}>
      บริษัทฯ กำหนดส่งในวันสุดท้ายก่อนวันหยุดบริษัทฯ เทศกาลวันสงกรานต์
    </p>
  </div>
)}
{/* ── หมายเหตุค่าน้ำมัน ── */}
{activeKey && activeKey.includes('ค่าน้ำมัน') && (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    padding: '2px 4px 10px',
  }}>
    <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}></span>
    <p style={{
      fontSize: T.xs,
      fontWeight: T.medium,
      color: T.slate400,
      margin: 0,
      lineHeight: 1.7,
    }}>
      ติดต่อสอบถามข้อมูลเพิ่มเติม กรุณาติดต่อแผนกทรัพยากรบุคคล โทร 541
    </p>
  </div>
)}
              {allKeys.length>1&&(
                <div style={{display:'flex',justifyContent:'center',alignItems:'center',
                  gap:5,padding:'14px 0 8px'}}>
                  {allKeys.map((_,i)=>(
                    <button key={i} onClick={()=>open(allKeys[i])}
                      style={{height:5,width:i===curIdx?24:5,borderRadius:3,padding:0,border:'none',
                        background:i===curIdx?g1:T.slate200,
                        transition:'all .25s cubic-bezier(.22,.68,0,1.2)'}}/>
                  ))}
                </div>
              )}
              {allKeys.length>1&&(
                
                <p style={{textAlign:'center',color:T.slate200,fontSize:T.xs,fontWeight:T.medium}}>
                  {t.swipeHint}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
    </div>
  );
}