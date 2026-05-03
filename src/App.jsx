import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, User, Database, ArrowRight, AlertCircle, LogOut, 
  UserCircle, Loader2, RefreshCw, CheckCircle, ShieldCheck,
  LayoutDashboard, List, Search, Award, Briefcase, ChevronRight,
  Home, Users, Heart, ArrowLeft, Gift, XCircle, MapPin, Sparkles, ChevronLeft, X
} from 'lucide-react';

// ------------------------------------------------------------------
// 1. นำเข้า Firebase SDK
// ------------------------------------------------------------------
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

// ==========================================
// ⚠️ ส่วนที่ต้องแก้ไข (FIREBASE CONFIGURATION) ⚠️
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAO7H5xZ191HJ9T4BAL7F9vIndapKGYuYk",
  authDomain: "sango-thai.firebaseapp.com",
  projectId: "sango-thai",
  storageBucket: "sango-thai.firebasestorage.app",
  messagingSenderId: "32641591329",
  appId: "1:32641591329:web:b0cc997ded1c00fb1e1b60",
  measurementId: "G-0VHNNJRFR1"
};
// ==========================================

// 2. เริ่มต้นใช้งาน Firebase
let auth, db;
try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "AIzaSy...") {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.error("Firebase Init Error:", e);
}

// --- Custom Animations (Friendly & Soft UI) ---
const customStyles = `
  @keyframes float {
    0% { transform: translateY(0px) scale(1); }
    50% { transform: translateY(-15px) scale(1.01); }
    100% { transform: translateY(0px) scale(1); }
  }
  .animate-float-slow {
    animation: float 12s ease-in-out infinite;
  }
  .animate-float-fast {
    animation: float 8s ease-in-out infinite reverse;
  }
  @keyframes slide-fade {
    0% { opacity: 0; transform: translateX(20px); }
    100% { opacity: 1; transform: translateX(0); }
  }
  .animate-slide-fade {
    animation: slide-fade 0.3s ease-out forwards;
  }
  .glass-panel {
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 1);
    box-shadow: 0 4px 24px rgba(79, 70, 229, 0.04);
  }
  .glass-card {
    background: #ffffff;
    border: 1px solid #f1f5f9;
    box-shadow: 0 4px 20px -4px rgba(79, 70, 229, 0.05);
  }
  ::-webkit-scrollbar { width: 0px; background: transparent; }
`;

export default function App() {
  const [view, setView] = useState('login'); 
  const [loading, setLoading] = useState(false);     
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  
  const [userDataList, setUserDataList] = useState([]);
  const [selectedWelfare, setSelectedWelfare] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // --- ระบบจัดการ Detail View แบบ Swipeable ---
  const [selectedIndex, setSelectedIndex] = useState(null); 
  
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const minSwipeDistance = 50; 

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  }
  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) handleNextDetail();
    if (isRightSwipe) handlePrevDetail();
  }

  // ฟังก์ชัน Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!auth) {
      setError('⚠️ ไม่สามารถเชื่อมต่อฐานข้อมูลได้');
      setLoading(false);
      return;
    }

    try {
      const emailToUse = username.includes('@') ? username : `${username}@test.com`;
      const userCredential = await signInWithEmailAndPassword(auth, emailToUse, password);
      const firebaseUser = userCredential.user;
      const displayUsername = firebaseUser.email.split('@')[0];

      const userData = { 
        name: displayUsername, 
        username: displayUsername, 
        email: firebaseUser.email,
        uid: firebaseUser.uid
      };
      
      setUser(userData);
      setView('dashboard');
      fetchMyData(userData.username); 

    } catch (err) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง');
      } else {
        setError(`ข้อผิดพลาด: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchMyData = async (currentUsername) => {
    const userToFetch = currentUsername || user?.username;
    if (!db || !userToFetch) return;
    
    setDataLoading(true); 
    try {
      const q = query(
        collection(db, "data"),
        where("username", "==", userToFetch)
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedData = [];
      querySnapshot.forEach((doc) => {
        fetchedData.push({ id: doc.id, ...doc.data() });
      });
      
      fetchedData.sort((a, b) => {
          const getTime = (val) => {
              if (!val) return 0;
              if (typeof val === 'object' && val.seconds !== undefined) {
                  return val.seconds * 1000;
              }
              const d = new Date(val);
              return isNaN(d.getTime()) ? 0 : d.getTime();
          };
          return getTime(b.uploaded_at) - getTime(a.uploaded_at);
      });

      setUserDataList(fetchedData);
    } catch (err) {
      console.error("Failed to fetch user data", err);
    } finally {
      setDataLoading(false); 
    }
  };

  const handleLogout = async () => {
    if (auth) await signOut(auth);
    setUser(null);
    setUserDataList([]);
    setUsername('');
    setPassword('');
    setSelectedIndex(null);
    setView('login');
  };

  const renderCellData = (value) => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-slate-300 font-normal">-</span>;
    }
    return value;
  };

  // Derived Data
  const welfareCategories = [...new Set(userDataList.map(item => item.sheet_name || item.product).filter(Boolean))];

  const displayData = userDataList.filter(item => {
    const matchWelfare = selectedWelfare === 'all' || (item.sheet_name || item.product) === selectedWelfare;
    const searchString = `${item['ชื่อ-สกุล'] || ''} ${item.product || ''} ${item.sheet_name || ''} ${item.fullname || ''}`.toLowerCase();
    const matchSearch = searchString.includes(searchQuery.toLowerCase());
    return matchWelfare && matchSearch;
  });

  const isCompletelyUnregistered = userDataList.length === 0 && !dataLoading;
  const isSearchNotFound = displayData.length === 0 && !isCompletelyUnregistered && !dataLoading;

  // Helpers สำหรับเลื่อนหน้า Detail
  const handleNextDetail = () => {
    if (selectedIndex !== null && displayData.length > 0) {
      setSelectedIndex((selectedIndex + 1) % displayData.length);
    }
  };

  const handlePrevDetail = () => {
    if (selectedIndex !== null && displayData.length > 0) {
      setSelectedIndex((selectedIndex - 1 + displayData.length) % displayData.length);
    }
  };

  const viewingDetail = selectedIndex !== null ? displayData[selectedIndex] : null;

  // ---------------- UI Components ----------------

  if (view === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-sans text-slate-800 relative overflow-hidden bg-slate-50 selection:bg-indigo-100">
        <style>{customStyles}</style>
        
        {/* Soft Ambient Background */}
        <div className="absolute inset-0 z-0 opacity-60 pointer-events-none overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-tr from-indigo-200/50 to-blue-200/40 blur-[100px] animate-float-slow"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-gradient-to-bl from-sky-200/50 to-indigo-100/50 blur-[100px] animate-float-fast" style={{animationDelay: '-4s'}}></div>
        </div>

        <div className="w-full max-w-[400px] z-10 animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out">
          
          <div className="text-center space-y-4 mb-10">
            {/* Friendly Logo */}
            <div className="mx-auto bg-gradient-to-br from-indigo-500 to-blue-500 w-[84px] h-[84px] rounded-[24px] flex items-center justify-center shadow-lg shadow-indigo-500/20 relative overflow-hidden group hover:scale-105 transition-transform duration-300">
              <Heart className="text-white w-10 h-10 relative z-10" fill="currentColor" />
            </div>
            <div>
              <h2 className="text-[32px] font-extrabold tracking-tight text-slate-800 leading-tight">
                ตรวจสอบข้อมูลสวัดิการ
              </h2>
              <p className="text-[15px] text-slate-500 font-medium mt-1">
                ระบบจัดการสวัสดิการพนักงาน
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-[16px] flex items-start gap-3 text-[14px] animate-in zoom-in-95 duration-300">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="font-medium leading-relaxed">{error}</p>
              </div>
            )}

            <div className="glass-panel rounded-[24px] p-3 flex flex-col gap-3">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="text-slate-400 w-5 h-5 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="รหัสพนักงาน"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded-[16px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-[16px] font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal transition-all"
                />
              </div>

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="text-slate-400 w-5 h-5 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                  type="password"
                  required
                  placeholder="รหัสบัตรประชาชน 6 ตัวท้าย"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded-[16px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-[16px] font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-[20px] shadow-md shadow-indigo-600/20 hover:shadow-lg hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 disabled:opacity-60 flex items-center justify-center gap-2 text-[16px]"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---------------- หน้า Dashboard (Friendly Soft UI) ----------------
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex justify-center relative overflow-hidden selection:bg-indigo-100">
      <style>{customStyles}</style>
      
      {/* Background Ambience Soft Blue */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40 overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] rounded-full bg-blue-100/50 blur-[120px] animate-float-slow"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-100/50 blur-[120px] animate-float-fast" style={{animationDelay: '-2s'}}></div>
      </div>

      <div className="w-full max-w-3xl flex flex-col h-screen z-10 relative">
        
        {/* Floating Friendly Header */}
        <header className="pt-5 px-4 sm:px-6 z-30">
            <div className="glass-panel rounded-[24px] px-5 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 w-10 h-10 rounded-[14px] flex items-center justify-center text-indigo-600">
                        <Heart className="w-5 h-5" fill="currentColor" />
                    </div>
                    <span className="text-[18px] font-bold tracking-tight text-slate-800">
                        ตรวจสอบข้อมูลสวัดิการ
                    </span>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                    <div className="hidden sm:flex items-center gap-2 bg-slate-100/80 px-3.5 py-2 rounded-[12px]">
                        <UserCircle className="w-5 h-5 text-slate-500" />
                        <span className="text-[14px] font-semibold text-slate-700">{user?.name}</span>
                    </div>
                    <button 
                        onClick={() => fetchMyData()}
                        disabled={dataLoading}
                        className="w-10 h-10 flex items-center justify-center rounded-[14px] bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                        title="รีเฟรชข้อมูล"
                    >
                        <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button 
                        onClick={handleLogout}
                        className="w-10 h-10 flex items-center justify-center rounded-[14px] bg-rose-50 hover:bg-rose-100 text-rose-500 transition-colors"
                        title="ออกจากระบบ"
                    >
                        <LogOut className="w-4 h-4 ml-0.5" />
                    </button>
                </div>
            </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-8 pb-32">
            
            <div className="mb-8 px-1">
                <h1 className="text-[32px] sm:text-[38px] font-extrabold tracking-tight text-slate-800 leading-tight mb-2">
                    สวัสดีครับคุณ, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-500">{user?.name}</span> 👋
                </h1>
                <p className="text-[16px] text-slate-500 font-medium">นี่คือข้อมูลสวัสดิการปัจจุบันของคุณ</p>
            </div>

            {/* Segmented Control Friendly Style */}
            {!isCompletelyUnregistered && !dataLoading && (
              <div className="bg-slate-200/60 p-1.5 rounded-[18px] flex mb-8 overflow-hidden">
                  <button
                      onClick={() => setSelectedWelfare('all')}
                      className={`flex-1 py-2.5 rounded-[14px] text-[15px] font-bold transition-all duration-300 ${
                          selectedWelfare === 'all' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'
                      }`}
                  >
                      ทั้งหมด
                  </button>
                  {welfareCategories.map(welfare => (
                      <button
                          key={welfare}
                          onClick={() => setSelectedWelfare(welfare)}
                          className={`flex-1 py-2.5 rounded-[14px] text-[15px] font-bold transition-all duration-300 truncate px-2 ${
                              selectedWelfare === welfare ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'
                          }`}
                      >
                          {welfare}
                      </button>
                  ))}
              </div>
            )}

            {dataLoading ? (
                <div className="flex flex-col items-center justify-center mt-24 space-y-4 animate-in fade-in">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                    <p className="text-slate-500 font-medium text-[15px]">กำลังดึงข้อมูลล่าสุด...</p>
                </div>

            ) : isCompletelyUnregistered ? (
                // Friendly Empty State
                <div className="bg-white/80 backdrop-blur-md flex flex-col items-center justify-center p-12 mt-6 rounded-[32px] text-center animate-in zoom-in-95 duration-500 shadow-sm border border-slate-100">
                    <div className="w-[100px] h-[100px] bg-slate-50 rounded-[28px] flex items-center justify-center mb-6 border border-slate-100">
                        <Gift className="w-12 h-12 text-slate-300" />
                    </div>
                    <h2 className="text-[22px] font-bold text-slate-800 mb-2">ยังไม่มีข้อมูลสวัสดิการ</h2>
                    <p className="text-[15px] text-slate-500 max-w-[280px] leading-relaxed">ดูเหมือนว่ายังไม่มีการเพิ่มข้อมูลสวัสดิการของคุณในระบบนะครับ ลองติดต่อฝ่าย HR ดูได้เลยครับ</p>
                </div>

            ) : (
                // List View
                <div className="animate-in slide-in-from-bottom-6 duration-500 ease-out space-y-5">
                    
                    {/* Search Bar */}
                    <div className="relative w-full group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="text-slate-400 w-5 h-5 group-focus-within:text-indigo-500 transition-colors" />
                        </div>
                        <input 
                            type="text" 
                            placeholder="ค้นหาสวัสดิการ..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 glass-panel rounded-[20px] focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 text-[16px] font-medium text-slate-800 placeholder:text-slate-400 transition-all border-slate-200"
                        />
                    </div>

                    {isSearchNotFound ? (
                        <div className="text-center py-16 bg-white/50 rounded-[24px] border border-slate-100 mt-4">
                            <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                            <p className="text-[18px] font-bold text-slate-700">ค้นหาไม่พบ</p>
                            <p className="text-slate-500 mt-1 text-[14px]">ลองพิมพ์คำค้นหาใหม่อีกครั้งครับ</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {displayData.map((row, index) => (
                                <div 
                                    key={row.id} 
                                    onClick={() => setSelectedIndex(index)}
                                    className="bg-white p-4 sm:p-5 rounded-[24px] cursor-pointer hover:scale-[1.01] hover:shadow-lg hover:shadow-indigo-500/5 active:scale-[0.98] transition-all duration-300 flex items-center justify-between group border border-slate-100"
                                    style={{ animationDelay: `${index * 30}ms` }}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-[56px] h-[56px] bg-indigo-50 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white rounded-[18px] flex items-center justify-center transition-colors duration-300">
                                            <Briefcase className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-[17px] font-bold text-slate-800 group-hover:text-indigo-600 transition-colors mb-0.5">
                                              {renderCellData(row.product)}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <p className="text-[14px] text-slate-500 font-medium">
                                                  {renderCellData(row.fullname || row['ชื่อ-สกุล'])}
                                                </p>
                                                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                                <span className="text-[13px] font-bold text-emerald-500">อนุมัติแล้ว</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-9 h-9 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-colors transform group-hover:translate-x-0.5" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>

      {/* ========================================================
          MODAL DETAIL VIEW (Swipeable Friendly Card) 
          ======================================================== */}
      {viewingDetail && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center sm:p-6 animate-in fade-in duration-300">
            {/* Soft Backdrop Overlay */}
            <div 
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity"
                onClick={() => setSelectedIndex(null)}
            ></div>

            {/* Bottom Sheet / Centered Card */}
            <div 
                className="w-full md:max-w-[460px] bg-slate-50 rounded-t-[32px] md:rounded-[32px] shadow-2xl relative z-10 animate-in slide-in-from-bottom-full md:slide-in-from-bottom-8 duration-400 overflow-hidden flex flex-col max-h-[90vh]"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {/* Drag Indicator for Mobile */}
                <div className="md:hidden w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-3"></div>

                {/* Content wrapper with key for slide animation */}
                <div key={selectedIndex} className="flex flex-col flex-1 overflow-y-auto animate-slide-fade [&::-webkit-scrollbar]:hidden">
                    
                    {/* Header (Friendly Gradient) */}
                    <div className="bg-gradient-to-br from-indigo-500 to-blue-500 p-6 sm:p-8 relative overflow-hidden text-white">
                        <div className="absolute top-[-30px] right-[-20px] w-[150px] h-[150px] bg-white/10 rounded-full blur-2xl"></div>
                        
                        <div className="flex justify-between items-start relative z-10 mb-6">
                            {/* Navigation Arrows for Swiping */}
                            <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-md p-1 rounded-full border border-white/10">
                                <button 
                                    onClick={handlePrevDetail}
                                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white hover:text-indigo-600 transition-all"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <span className="text-[13px] font-bold px-2">
                                    {selectedIndex + 1} / {displayData.length}
                                </span>
                                <button 
                                    onClick={handleNextDetail}
                                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white hover:text-indigo-600 transition-all"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>

                            <button 
                                onClick={() => setSelectedIndex(null)}
                                className="w-9 h-9 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="relative z-10 flex items-center gap-4">
                            <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-[16px] flex items-center justify-center border border-white/20 shadow-inner">
                                <Award className="w-7 h-7 text-white" />
                            </div>
                            <div>
                                <h3 className="text-[22px] sm:text-[24px] font-bold leading-tight">
                                    {viewingDetail.product}
                                </h3>
                                <div className="inline-flex items-center gap-1.5 bg-emerald-400/20 px-2.5 py-1 rounded-full mt-1.5 border border-emerald-400/30">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-100" />
                                    <span className="text-[12px] font-bold text-emerald-50">อนุมัติเรียบร้อย</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Body Details */}
                    <div className="p-6 space-y-4 pb-10 bg-slate-50">
                        
                        {/* ข้อมูลบุคคล */}
                        <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 p-5">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="bg-indigo-50 p-2 rounded-xl">
                                    <User className="w-5 h-5 text-indigo-500" />
                                </div>
                                <h4 className="text-[15px] font-bold text-slate-800">ข้อมูลผู้รับสิทธิ์</h4>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-[13px] text-slate-500 mb-1">ชื่อ-นามสกุล</p>
                                    <p className="text-[16px] font-bold text-slate-800">{renderCellData(viewingDetail.fullname || viewingDetail['ชื่อ-สกุล'])}</p>
                                </div>
                                <div>
                                    <p className="text-[13px] text-slate-500 mb-1">ความเกี่ยวข้อง</p>
                                    <p className="text-[15px] font-bold text-slate-800">{renderCellData(viewingDetail.relationship || 'พนักงาน')}</p>
                                </div>
                            </div>
                        </div>

                        {/* Address Block */}
                        {(viewingDetail.house_no || viewingDetail.province) && (
                            <div className="bg-white rounded-[24px] shadow-sm border border-slate-100 p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="bg-blue-50 p-2 rounded-xl">
                                        <MapPin className="w-5 h-5 text-blue-500" />
                                    </div>
                                    <h4 className="text-[15px] font-bold text-slate-800">ที่อยู่จัดส่ง / ติดต่อ</h4>
                                </div>
                                <div className="grid grid-cols-2 gap-y-4 gap-x-4 bg-slate-50 p-4 rounded-[16px]">
                                    <div>
                                        <p className="text-[12px] text-slate-500 mb-0.5">บ้านเลขที่ / หมู่</p>
                                        <p className="text-[14px] font-bold text-slate-800 truncate">{renderCellData(viewingDetail.house_no)} {viewingDetail.moo && `ม.${viewingDetail.moo}`}</p>
                                    </div>
                                    <div>
                                        <p className="text-[12px] text-slate-500 mb-0.5">ตำบล / อำเภอ</p>
                                        <p className="text-[14px] font-bold text-slate-800 truncate">{renderCellData(viewingDetail.subdistrict)} {renderCellData(viewingDetail.district)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[12px] text-slate-500 mb-0.5">จังหวัด</p>
                                        <p className="text-[14px] font-bold text-slate-800 truncate">{renderCellData(viewingDetail.province)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[12px] text-slate-500 mb-0.5">รหัสไปรษณีย์</p>
                                        <p className="text-[14px] font-bold text-slate-800">{renderCellData(viewingDetail.zipcode)}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}
