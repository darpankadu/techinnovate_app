import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import {
  Fuel, Truck, ClipboardList, User, Car, Clock, MapPin, Bell,
  ChevronRight, ChevronDown, CheckCircle2, Search, SlidersHorizontal,
  LayoutDashboard, FileText, LogOut, Globe, Battery, Zap, Star, StarHalf,
  Weight, Ruler, Phone, Share2, Heart, Shield, Leaf, Sparkles, Receipt,
  IndianRupee, Camera, AlertTriangle, X, ArrowLeftRight
} from "lucide-react";
import { storage } from '../lib/storage'
import { firestoreSync } from '../lib/firestoreSync'
import { t } from '../lib/translations'
import type { Language, Notification } from '../lib/types'
import { CameraModal } from './CameraModal'

// ── Types for Tempo Finder ──────────────────────────────────────────────────────

type Lang = "EN" | "HI" | "GU";
type TempoType = "All" | "EV" | "CNG" | "Diesel";
type SortBy = "relevance" | "price_asc" | "price_desc" | "rating";

export interface TempoRequirement {
  id: number;
  city: "Vadodara" | "Ahmedabad";
  fuelType: "EV" | "Diesel" | "CNG";
  model: string;
  quantity: number;
  rateLimit?: string;
  bodyType: "Closed Body";
}

// ── Mock Data for Load Requirements (Small Tempo) ────────────────────────────────

export interface LoadRequirement {
  id: number;
  from: string;
  to: string;
  cargo: string;
  weight: string;
  rate: string;
  vehicleType: string;
  distance: string;
  available: "Today" | "Tomorrow" | string;
  category: "Light" | "Medium";
}

const LOAD_REQUIREMENTS: LoadRequirement[] = [
  { id: 1,  from: "Vadodara",  to: "Ahmedabad",  cargo: "Electronics",     weight: "480 Kg",  rate: "₹3,500",  vehicleType: "Tata Ace / Mini Truck",  distance: "110 km", available: "Today",    category: "Light" },
  { id: 2,  from: "Ahmedabad", to: "Surat",       cargo: "FMCG Goods",     weight: "650 Kg",  rate: "₹4,200",  vehicleType: "Tata Ace / Intra",       distance: "265 km", available: "Today",    category: "Medium" },
  { id: 3,  from: "Vadodara",  to: "Bharuch",     cargo: "Pharma Boxes",   weight: "280 Kg",  rate: "₹2,200",  vehicleType: "Tata Ace",               distance: "55 km",  available: "Tomorrow", category: "Light" },
  { id: 4,  from: "Surat",     to: "Rajkot",      cargo: "Textile Rolls",  weight: "750 Kg",  rate: "₹5,500",  vehicleType: "Tata Intra",             distance: "300 km", available: "Today",    category: "Medium" },
  { id: 5,  from: "Ahmedabad", to: "Vadodara",    cargo: "Grocery",        weight: "590 Kg",  rate: "₹2,800",  vehicleType: "Tata Ace",               distance: "110 km", available: "Today",    category: "Medium" },
  { id: 6,  from: "Vadodara",  to: "Nadiad",      cargo: "Hardware Items", weight: "380 Kg",  rate: "₹1,800",  vehicleType: "Mini Truck",             distance: "38 km",  available: "Today",    category: "Light" },
  { id: 7,  from: "Bharuch",   to: "Ahmedabad",   cargo: "Chemical Drums", weight: "520 Kg",  rate: "₹3,800",  vehicleType: "Tata Intra",             distance: "165 km", available: "Tomorrow", category: "Medium" },
  { id: 8,  from: "Rajkot",    to: "Ahmedabad",   cargo: "Auto Parts",     weight: "620 Kg",  rate: "₹4,000",  vehicleType: "Mini Truck",             distance: "218 km", available: "Today",    category: "Medium" },
  { id: 9,  from: "Surat",     to: "Vadodara",    cargo: "Garments",       weight: "350 Kg",  rate: "₹3,200",  vehicleType: "Tata Ace",               distance: "155 km", available: "Today",    category: "Light" },
  { id: 10, from: "Ahmedabad", to: "Anand",       cargo: "Dairy Products", weight: "290 Kg",  rate: "₹1,600",  vehicleType: "Tata Ace",               distance: "72 km",  available: "Tomorrow", category: "Light" },
  { id: 11, from: "Vadodara",  to: "Surat",       cargo: "Office Supplies",weight: "430 Kg",  rate: "₹3,600",  vehicleType: "Mini Truck",             distance: "155 km", available: "Today",    category: "Light" },
  { id: 12, from: "Anand",     to: "Vadodara",    cargo: "Fresh Produce",  weight: "460 Kg",  rate: "₹1,400",  vehicleType: "Tata Ace",               distance: "42 km",  available: "Today",    category: "Light" },
];

// ── Mock Data for Active Tempo Requirements ──────────────────────────────────────

const LANGS: Lang[] = ["EN", "HI", "GU"];
const LANG_LABELS: Record<Lang, string> = { EN: "English", HI: "हिंदी", GU: "ગુજરાતી" };
const TEMPO_TYPES: TempoType[] = ["All", "EV", "CNG", "Diesel"];

const TEMPO_REQUIREMENTS: TempoRequirement[] = [
  // Vadodara EV
  { id: 1, city: "Vadodara", fuelType: "EV", model: "Tata Intra EV", quantity: 2, rateLimit: "Upto ₹2,000 / day", bodyType: "Closed Body" },
  { id: 2, city: "Vadodara", fuelType: "EV", model: "Tata Ace EV", quantity: 2, rateLimit: "Upto ₹2,000 / day", bodyType: "Closed Body" },
  // Vadodara Diesel
  { id: 3, city: "Vadodara", fuelType: "Diesel", model: "Mahindra Bolero", quantity: 1, rateLimit: "Upto ₹2,000 / day", bodyType: "Closed Body" },
  // Vadodara CNG
  { id: 4, city: "Vadodara", fuelType: "CNG", model: "Tata Ace", quantity: 1, rateLimit: "Upto ₹2,000 / day", bodyType: "Closed Body" },
  { id: 5, city: "Vadodara", fuelType: "CNG", model: "Tata Intra", quantity: 1, rateLimit: "Upto ₹2,000 / day", bodyType: "Closed Body" },
  { id: 6, city: "Vadodara", fuelType: "CNG", model: "Mahindra Veero", quantity: 1, rateLimit: "Upto ₹2,000 / day", bodyType: "Closed Body" },
  
  // Ahmedabad EV
  { id: 7, city: "Ahmedabad", fuelType: "EV", model: "Tata Intra EV", quantity: 3, rateLimit: "Upto ₹2,000 / day", bodyType: "Closed Body" },
  // Ahmedabad CNG
  { id: 8, city: "Ahmedabad", fuelType: "CNG", model: "Tata Ace", quantity: 1, rateLimit: "Upto ₹2,000 / day", bodyType: "Closed Body" },
  { id: 9, city: "Ahmedabad", fuelType: "CNG", model: "Tata Intra", quantity: 1, rateLimit: "Upto ₹2,000 / day", bodyType: "Closed Body" },
  { id: 10, city: "Ahmedabad", fuelType: "CNG", model: "Mahindra Veero", quantity: 1, rateLimit: "Upto ₹2,000 / day", bodyType: "Closed Body" },
];

// Localized translations inside BrowseTrucks module
const localTranslations: Record<Language, Record<string, string>> = {
  en: {
    title: "Tempo Hire Portal",
    subtitle: "Find & hire tempos moving from A to B",
    searchPlaceholder: "Search driver, vehicle, city...",
    sourcePlaceholder: "Enter Pickup City...",
    destPlaceholder: "Enter Delivery City...",
    tempoType: "Vehicle Type",
    all: "All",
    bookTempo: "Book Tempo",
    viewDetails: "View Details",
    specs: "Transit Specifications",
    payload: "Weight Limit",
    volume: "Cargo Volume",
    dispatchDate: "Dispatch Date",
    dealerInfo: "Driver & Contact details",
    callDriver: "Call Driver",
    share: "Share Transit",
    availability: "Availability",
    noResults: "No transits match your route",
    backToDash: "Back to Dashboard",
    ratings: "Ratings",
    ratePerTrip: "Trip Fare",
    departure: "Departure"
  },
  hi: {
    title: "टेंपो बुकिंग पोर्टल",
    subtitle: "स्रोत A से B तक जाने वाले टेंपो खोजें और बुक करें",
    searchPlaceholder: "ड्राइवर, वाहन, शहर खोजें...",
    sourcePlaceholder: "पिकअप शहर दर्ज करें...",
    destPlaceholder: "वितरण शहर दर्ज करें...",
    tempoType: "वाहन प्रकार",
    all: "सभी",
    bookTempo: "टेंपो बुक करें",
    viewDetails: "विवरण देखें",
    specs: "पारगमन विनिर्देशों",
    payload: "वजन सीमा",
    volume: "कार्गो वॉल्यूम",
    dispatchDate: "भेजने की तिथि",
    dealerInfo: "ड्राइवर और संपर्क विवरण",
    callDriver: "कॉल ड्राइवर",
    share: "शेयर पारगमन",
    availability: "उपलब्धता",
    noResults: "आपके रूट से कोई पारगमन मेल नहीं खाता",
    backToDash: "डैशबोर्ड पर वापस जाएं",
    ratings: "रेटिंग",
    ratePerTrip: "यात्रा किराया",
    departure: "प्रस्थान"
  },
  gu: {
    title: "ટેમ્પો બુકિંગ પોર્ટલ",
    subtitle: "સોર્સ A થી B તરફ જતા ટેમ્પો શોધો અને બુક કરો",
    searchPlaceholder: "ડ્રાઇવર, વાહન, શહેર શોધો...",
    sourcePlaceholder: "પિકઅપ સિટી દાખલ કરો...",
    destPlaceholder: "ડિલિવરી સિટી દાખલ કરો...",
    tempoType: "વાહન પ્રકાર",
    all: "બધા",
    bookTempo: "ટેમ્પો બુક કરો",
    viewDetails: "વિગતો જુઓ",
    specs: "પરિવહન વિશિષ્ટતાઓ",
    payload: "વજન મર્યાદા",
    volume: "કાર્ગો વોલ્યુમ",
    dispatchDate: "મોકલવાની તારીખ",
    dealerInfo: "ડ્રાઇવર અને સંપર્ક વિગતો",
    callDealer: "ડ્રાઇવરને કૉલ કરો",
    callDriver: "ડ્રાઇવરને કૉલ કરો",
    share: "વિગતો શેર કરો",
    availability: "ઉપલબ્ધતા",
    noResults: "તમારા રૂટ સાથે કોઈ વાહન મેળ ખાતું નથી",
    backToDash: "ડેશબોર્ડ પર પાછા ફરો",
    ratings: "રેટિંગ્સ",
    ratePerTrip: "ભાડું",
    departure: "પ્રસ્થાન"
  }
};

// ── Shared Subcomponents ──────────────────────────────────────────────────────

function LanguageSwitcher({ lang, setLang, dark = false }: { lang: Language; setLang: (l: Language) => void; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const currentUpper = lang.toUpperCase() as Lang;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
          dark
            ? "bg-white/10 text-white hover:bg-white/20"
            : "bg-white border border-[#E2E6EB] text-[#6B7280] hover:bg-gray-50"
        }`}
      >
        <Globe size={13} />
        <span>{currentUpper}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-[#E2E6EB] overflow-hidden z-50 min-w-[120px]">
          {LANGS.map((l) => (
            <button
              key={l}
              onClick={() => { setLang(l.toLowerCase() as Language); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                l.toLowerCase() === lang ? "bg-[#fff1f0] text-[#E10600] font-semibold" : "text-[#111827] hover:bg-gray-50"
              }`}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={i} size={11} className="text-amber-400 fill-amber-400" />
      ))}
      {half && <StarHalf size={11} className="text-amber-400 fill-amber-400" />}
    </div>
  );
}

function TempoRequirementCard({ 
  req, 
  onSelect,
  langText
}: { 
  req: TempoRequirement; 
  onSelect: (r: TempoRequirement) => void;
  langText: Record<string, string>;
}) {
  const badgeColors: Record<string, string> = {
    EV: "bg-green-100 text-green-700 border-green-200",
    CNG: "bg-blue-100 text-blue-700 border-blue-200",
    Diesel: "bg-gray-100 text-gray-700 border-gray-200",
  };
  
  const fuelDot: Record<string, string> = {
    EV: "bg-green-500",
    CNG: "bg-blue-500",
    Diesel: "bg-gray-500",
  };

  return (
    <div className="bg-white rounded-3xl border border-[#E2E6EB] shadow-sm overflow-hidden flex flex-col h-full p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-extrabold border ${badgeColors[req.fuelType]}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${fuelDot[req.fuelType]}`} />
              {req.fuelType}
            </span>
            <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              {req.bodyType}
            </span>
          </div>
          <h3 className="text-base font-extrabold text-[#111827] leading-tight">{req.model}</h3>
          <p className="text-xs text-[#6B7280] font-bold mt-1">{req.quantity} {req.quantity > 1 ? "tempos" : "tempo"}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-[#6B7280] font-bold uppercase tracking-wider">Rate</p>
          <p className="text-xs font-black text-[#E10600] mt-0.5">{req.rateLimit || "Best Rate"}</p>
        </div>
      </div>

      <button
        onClick={() => onSelect(req)}
        className="w-full bg-[#E10600] text-white rounded-xl py-2.5 text-xs font-bold hover:bg-[#C80500] transition-colors mt-auto"
      >
        {langText.bookTempo || "Book Tempo"}
      </button>
    </div>
  );
}

function TempoRequirementDetailSheet({ 
  req, 
  onClose,
  langText,
  sessionName
}: { 
  req: TempoRequirement; 
  onClose: () => void;
  langText: Record<string, string>;
  sessionName?: string;
}) {
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [custName, setCustName] = useState(sessionName || "");
  const [custPhone, setCustPhone] = useState("");

  const handleBook = async () => {
    setBookingLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setBookingLoading(false);
    setBookingSuccess(true);
  };

  const fuelColorMap: Record<string, string> = {
    EV: "#15803d",
    CNG: "#1d4ed8",
    Diesel: "#4b5563",
  };

  const driverImageColor = fuelColorMap[req.fuelType] || "#E10600";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto max-w-[480px] mx-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#E2E6EB]" />
        </div>
        
        {/* Visual Header */}
        <div className="h-28 relative flex flex-col justify-center px-6 mx-4 rounded-2xl overflow-hidden mb-4"
          style={{ background: `linear-gradient(135deg, ${driverImageColor}20, ${driverImageColor}08)` }}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center text-[#111827] shadow-sm z-10"
          >
            <X size={16} />
          </button>
          
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 rounded-xl bg-white text-[#E10600] shadow-sm"><Truck size={20} /></div>
            <div>
              <p className="text-[10px] text-[#6B7280] font-bold uppercase tracking-wider">Requirement Details</p>
              <h2 className="text-lg font-black text-[#111827]">
                {req.model} ({req.city})
              </h2>
            </div>
          </div>
        </div>

        <div className="px-5 pb-8">
          {bookingSuccess ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto text-green-600">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-extrabold text-[#111827]">Booking Request Sent!</h3>
              <p className="text-sm text-[#6B7280] max-w-xs mx-auto leading-relaxed">
                Your request to book <strong>{req.model}</strong> in <strong>{req.city}</strong> has been sent. We will contact you shortly on your number (<strong>{custPhone}</strong>) to confirm the details.
              </p>
              <button 
                onClick={onClose}
                className="w-full bg-[#111827] text-white rounded-2xl py-3.5 font-bold text-sm mt-4"
              >
                Close Window
              </button>
            </div>
          ) : showForm ? (
            <div className="space-y-4 pt-1">
              <h3 className="text-base font-extrabold text-[#111827]">Enter Booking Details</h3>
              <p className="text-xs text-[#6B7280]">To send a booking request, please provide your contact details.</p>
              
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider block mb-1">Your Name</label>
                  <input
                    type="text"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full h-11 px-4 border border-[#E2E6EB] bg-white rounded-xl text-sm focus:outline-none focus:border-[#E10600] font-medium"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider block mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 10-digit mobile number"
                    className="w-full h-11 px-4 border border-[#E2E6EB] bg-white rounded-xl text-sm focus:outline-none focus:border-[#E10600] font-medium"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowForm(false)}
                  className="flex-1 border-2 border-[#E2E6EB] rounded-2xl py-3.5 font-bold text-sm text-center text-[#111827] hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button 
                  onClick={handleBook}
                  disabled={bookingLoading || !custName.trim() || custPhone.length !== 10}
                  className="flex-1 bg-[#E10600] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-2xl py-3.5 font-extrabold text-sm text-center shadow-lg hover:bg-[#C80500] transition-colors"
                >
                  {bookingLoading ? "Sending request..." : "Confirm Booking"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-semibold text-[#6B7280]">{req.fuelType} Category</p>
                  <h2 className="text-xl font-extrabold text-[#111827]">{req.model}</h2>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#6B7280]">Expected Rate</p>
                  <p className="text-base font-black text-[#E10600]">{req.rateLimit || "Best Rate Offer"}</p>
                </div>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { label: "City Location", value: req.city, icon: <MapPin size={15} className="text-[#E10600]" /> },
                  { label: "Fuel Type", value: req.fuelType, icon: <Fuel size={15} className="text-[#E10600]" /> },
                  { label: "Quantity Needed", value: `${req.quantity} ${req.quantity > 1 ? "tempos" : "tempo"}`, icon: <Truck size={15} className="text-[#E10600]" /> },
                  { label: "Body Type Constraint", value: req.bodyType, icon: <Shield size={15} className="text-[#E10600]" /> }
                ].map(({ label, value, icon }) => (
                  <div key={label} className="bg-[#F5F6F8] rounded-2xl p-3.5 border border-[#E2E6EB]">
                     <div className="flex items-center gap-2 mb-1.5">{icon}<span className="text-xs font-semibold text-[#6B7280]">{label}</span></div>
                    <p className="text-sm font-extrabold text-[#111827]">{value}</p>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowForm(true)}
                  className="w-full bg-[#E10600] text-white rounded-2xl py-4 font-extrabold text-sm text-center shadow-lg hover:bg-[#C80500] transition-colors"
                >
                  {langText.bookTempo || "Book Tempo"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadDetailSheet({
  load,
  onClose,
  sessionName,
  driverId,
}: {
  load: LoadRequirement;
  onClose: () => void;
  sessionName?: string;
  driverId?: string;
}) {
  const [step, setStep] = useState<"details" | "form" | "done">("details");
  const [name, setName] = useState(sessionName || "");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    try {
      const existing = JSON.parse(localStorage.getItem('cng_load_bookings') || '[]');
      localStorage.setItem('cng_load_bookings', JSON.stringify([{
        id: Date.now(),
        loadId: load.id,
        cargo: load.cargo,
        from: load.from,
        to: load.to,
        weight: load.weight,
        rate: load.rate,
        vehicleType: load.vehicleType,
        distance: load.distance,
        contactName: name,
        contactPhone: phone,
        driverId: driverId || '',
        driverName: name,
        time: new Date().toISOString(),
        status: 'pending',
      }, ...existing]));
    } catch {}
    setStep("done");
  };

  const cargoColors: Record<string, string> = {
    "Electronics": "#3B82F6",
    "FMCG Goods": "#10B981",
    "Pharma Boxes": "#8B5CF6",
    "Textile Rolls": "#F59E0B",
    "Grocery": "#10B981",
    "Hardware Items": "#6B7280",
    "Chemical Drums": "#EF4444",
    "Auto Parts": "#F97316",
    "Garments": "#EC4899",
    "Dairy Products": "#06B6D4",
    "Office Supplies": "#6366F1",
    "Fresh Produce": "#22C55E",
  };
  const color = cargoColors[load.cargo] || "#E10600";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto max-w-[480px] mx-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-[#E2E6EB]" /></div>

        {/* Header */}
        <div className="mx-4 mt-2 mb-4 rounded-2xl px-5 py-4 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${color}18, ${color}08)`, border: `1px solid ${color}25` }}>
          <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
            <X size={15} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white shadow-sm" style={{ color }}><MapPin size={20} /></div>
            <div>
              <p className="text-[10px] text-[#6B7280] font-bold uppercase tracking-wider">Load Details</p>
              <h2 className="text-lg font-black text-[#111827]" style={{ fontFamily: "'Archivo', sans-serif" }}>
                {load.from} → {load.to}
              </h2>
            </div>
          </div>
        </div>

        <div className="px-5 pb-8">
          {step === "done" ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto"><CheckCircle2 size={30} className="text-green-600" /></div>
              <h3 className="text-lg font-extrabold text-[#111827]">Request Sent!</h3>
              <p className="text-sm text-[#6B7280] max-w-xs mx-auto leading-relaxed">
                Your booking request for <strong>{load.cargo}</strong> ({load.from} → {load.to}) has been sent. We'll contact you on <strong>{phone}</strong>.
              </p>
              <button onClick={onClose} className="w-full bg-[#111827] text-white rounded-2xl py-3.5 font-bold text-sm mt-4">Close</button>
            </div>
          ) : step === "form" ? (
            <div className="space-y-4 pt-1">
              <h3 className="text-base font-extrabold text-[#111827]">Enter Contact Details</h3>
              <div>
                <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider block mb-1">Your Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name"
                  className="w-full h-11 px-4 border border-[#E2E6EB] bg-white rounded-xl text-sm focus:outline-none focus:border-[#E10600] font-medium" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider block mb-1">Mobile Number</label>
                <input type="tel" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile"
                  className="w-full h-11 px-4 border border-[#E2E6EB] bg-white rounded-xl text-sm focus:outline-none focus:border-[#E10600] font-medium" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep("details")} className="flex-1 border-2 border-[#E2E6EB] rounded-2xl py-3.5 font-bold text-sm text-[#111827]">Back</button>
                <button onClick={handleConfirm} disabled={loading || !name.trim() || phone.length !== 10}
                  className="flex-1 bg-[#E10600] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-2xl py-3.5 font-extrabold text-sm shadow-lg">
                  {loading ? "Sending..." : "Confirm Request"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { label: "Cargo Type",    value: load.cargo,       icon: <ClipboardList size={15} className="text-[#E10600]" /> },
                  { label: "Weight",        value: load.weight,      icon: <Weight size={15} className="text-[#E10600]" /> },
                  { label: "Distance",      value: load.distance,    icon: <Ruler size={15} className="text-[#E10600]" /> },
                  { label: "Vehicle Type",  value: load.vehicleType, icon: <Truck size={15} className="text-[#E10600]" /> },
                  { label: "Availability",  value: load.available,   icon: <Clock size={15} className="text-[#E10600]" /> },
                  { label: "Freight Rate",  value: load.rate,        icon: <IndianRupee size={15} className="text-[#E10600]" /> },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="bg-[#F5F6F8] rounded-2xl p-3.5 border border-[#E2E6EB]">
                    <div className="flex items-center gap-2 mb-1.5">{icon}<span className="text-xs font-semibold text-[#6B7280]">{label}</span></div>
                    <p className="text-sm font-extrabold text-[#111827]">{value}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep("form")} className="w-full bg-[#E10600] text-white rounded-2xl py-4 font-extrabold text-sm shadow-lg hover:bg-[#C80500] transition-colors">
                Book This Load
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RedeemSheet({ 
  onClose,
  fills,
  session,
  vehicle
}: { 
  onClose: () => void;
  fills: any[];
  session: any;
  vehicle: any;
}) {
  const [redeemed, setRedeemed] = useState(false);
  const [tab, setTab] = useState<"redeem" | "history">("redeem");
  const [requests, setRequests] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cng_redemption_requests') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const updateRequests = () => {
      try {
        setRequests(JSON.parse(localStorage.getItem('cng_redemption_requests') || '[]'));
      } catch {}
    };
    window.addEventListener('storage', updateRequests);
    return () => window.removeEventListener('storage', updateRequests);
  }, []);

  const totalSaved = fills.reduce((sum: number, f: any) => sum + Math.floor(f.kgs), 0); // ₹1 per whole Kg (floor per fill)
  const totalRedeemedOrPending = requests
    .filter((r: any) => String(r.driverId) === String(session.userId) && (r.status === 'approved' || r.status === 'pending'))
    .reduce((sum: number, r: any) => sum + r.amount, 0);

  const redeemable = Math.max(0, totalSaved - totalRedeemedOrPending);

  const handleRedeem = () => {
    setRedeemed(true);
    try {
      const allReqs = JSON.parse(localStorage.getItem('cng_redemption_requests') || '[]');
      const newReq = {
        id: 'req_' + Date.now(),
        driverId: session.userId,
        driverName: session.name,
        vehiclePlate: vehicle ? vehicle.plate : 'N/A',
        amount: redeemable,
        date: new Date().toLocaleDateString(),
        status: 'pending',
        ownerId: session.ownerId || ''
      };
      allReqs.push(newReq);
      localStorage.setItem('cng_redemption_requests', JSON.stringify(allReqs));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error('Failed to save redemption request:', e);
    }
  };

  const fillTime = (timeInput: any) => {
    if (typeof timeInput === 'string') return new Date(timeInput).getTime();
    return timeInput;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Bottom Sheet */}
      <div 
        className="relative bg-[#F5F6F8] rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden w-full max-w-[480px] mx-auto"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Drag handle + close */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1 flex-shrink-0">
          <div className="w-8" />
          <div className="w-10 h-1 rounded-full bg-[#E2E6EB]" />
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white border border-[#E2E6EB] flex items-center justify-center"
          >
            <X size={14} className="text-[#6B7280]" />
          </button>
        </div>

        {/* Hero Savings Card */}
        <div
          className="mx-4 mt-2 mb-4 rounded-3xl overflow-hidden flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #c20000 0%, #E10600 50%, #ff4500 100%)" }}
        >
          <div className="relative px-5 pt-5 pb-6">
            {/* Dot grid texture */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: "radial-gradient(circle, #fff 1.5px, transparent 1.5px)",
                backgroundSize: "16px 16px",
              }}
            />
            {/* Shimmer sweep */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.4) 50%, transparent 65%)",
                animation: "shimmer 2.5s infinite",
              }}
            />

            {/* Main amount row */}
            <div className="relative z-10 flex items-center justify-between mb-4">
              <div>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-[3px] mb-1">
                  Your Savings Wallet
                </p>
                <p className="text-white font-black leading-none" style={{ fontSize: 44 }}>
                  ₹{totalSaved}
                </p>
                <p className="text-white/60 text-xs font-semibold mt-1">
                  from {fills.length} fill-ups
                </p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center">
                  <IndianRupee size={32} className="text-white" />
                </div>
                <span className="text-white/60 text-[9px] font-bold uppercase tracking-wide">CNG Saves</span>
              </div>
            </div>

            {/* Redeemable Balance */}
            <div className="relative z-10">
              <div className="bg-white/15 rounded-2xl px-4 py-3 border border-white/20">
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-wide mb-0.5">Redeemable Balance</p>
                <p className="text-white font-extrabold text-lg">₹{redeemable}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex mx-4 mb-3 bg-white rounded-2xl p-1 border border-[#E2E6EB] flex-shrink-0">
          {([
            { id: "redeem"  as const, label: "Redeem" },
            { id: "history" as const, label: "Savings History" },
          ]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all ${
                tab === id ? "bg-[#E10600] text-white shadow-md" : "text-[#6B7280]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">

          {/* REDEEM TAB */}
          {tab === "redeem" && (
            <div className="flex flex-col gap-4">

              {/* Request summary */}
              <div className="bg-white rounded-2xl border border-[#E2E6EB] overflow-hidden">
                {[
                  { label: "Driver",          value: session.name,                   highlight: false },
                  { label: "Vehicle",         value: vehicle ? vehicle.plate : 'N/A', highlight: false },
                  { label: "Total Fills",     value: `${fills.length} fill-ups`,     highlight: false },
                  { label: "Amount to Redeem",value: `₹${redeemable}`,                highlight: true  },
                ].map(({ label, value, highlight }, i, arr) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i < arr.length - 1 ? "border-b border-[#F0F1F4]" : ""
                    }`}
                  >
                    <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                      {label}
                    </span>
                    <span className={`text-sm font-extrabold ${highlight ? "text-[#E10600]" : "text-[#111827]"}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {!redeemed ? (
                <button
                  onClick={handleRedeem}
                  disabled={redeemable <= 0}
                  className="w-full rounded-3xl py-4 flex items-center justify-center gap-3 shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none"
                  style={{
                    background: "linear-gradient(135deg, #E10600, #ff3a36)",
                    boxShadow: "0 8px 24px rgba(225,6,0,0.35)",
                  }}
                >
                  <span className="text-white font-extrabold text-base">Send Redemption Request</span>
                  <ChevronRight size={18} className="text-white/70" />
                </button>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 size={30} className="text-green-600" />
                  </div>
                  <p className="text-base font-extrabold text-[#111827]">Request Sent!</p>
                  <p className="text-xs text-[#6B7280] font-medium text-center leading-relaxed max-w-xs">
                    Your redemption request has been sent to your fleet owner.
                    You'll be notified once it's approved.
                  </p>
                </div>
              )}

              {!redeemed && (
                <p className="text-center text-[10px] text-[#6B7280] font-medium">
                  Savings valid for 90 days
                </p>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
          {tab === "history" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-1">
                {fills.length} fill-ups · ₹1 per Kg earned
              </p>
              {fills.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-white rounded-2xl p-4 border border-[#E2E6EB] flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#fff1f0] flex items-center justify-center flex-shrink-0">
                    <Fuel size={16} className="text-[#E10600]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#111827] truncate">{entry.station}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[#6B7280] font-medium">
                        {new Date(fillTime(entry.time)).toLocaleDateString()}
                      </span>
                      <span className="text-[10px] text-[#6B7280]">·</span>
                      <span className="text-[10px] text-[#6B7280] font-medium">{entry.kgs} Kg</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-extrabold text-[#E10600]">+₹{Math.floor(entry.kgs)}</p>
                    <p className="text-[10px] text-[#6B7280] font-medium">Earned</p>
                  </div>
                </div>
              ))}
              {fills.length === 0 && (
                <p className="text-center text-xs text-[#6B7280] py-8">No savings history recorded yet.</p>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

interface CNGStation {
  name: string;
  city: "Vadodara" | "Ahmedabad";
  lat: number;
  lng: number;
  wait: string;
}

const CNG_STATIONS: CNGStation[] = [
  // Vadodara
  { name: "GAIL CNG — Karelibaug", city: "Vadodara", lat: 22.3275, lng: 73.2089, wait: "~2 min" },
  { name: "Adani Gas — Gotri", city: "Vadodara", lat: 22.3130, lng: 73.1360, wait: "~7 min" },
  { name: "HP CNG — Alkapuri", city: "Vadodara", lat: 22.3088, lng: 73.1704, wait: "~4 min" },
  { name: "Adani CNG — Chhani", city: "Vadodara", lat: 22.3551, lng: 73.1812, wait: "~5 min" },
  
  // Ahmedabad
  { name: "Gujarat Gas — Vastrapur", city: "Ahmedabad", lat: 23.0351, lng: 72.5293, wait: "~3 min" },
  { name: "Adani CNG — Kalupur", city: "Ahmedabad", lat: 23.0298, lng: 72.5962, wait: "~8 min" },
  { name: "HP CNG — SG Highway", city: "Ahmedabad", lat: 23.0125, lng: 72.5085, wait: "~6 min" },
  { name: "Gujarat Gas — Naroda", city: "Ahmedabad", lat: 23.0655, lng: 72.6480, wait: "~4 min" },
];

function getDistanceKms(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(1));
}

const localNotifTranslations: Record<Language, Record<string, string>> = {
  en: {
    announcements: "Announcements",
    notifications: "Notifications",
    markAllRead: "Mark all as read",
    markRead: "Mark read",
    noNotifications: "No notifications",
    critical: "Critical",
    warning: "Warning",
    info: "Info",
    close: "Close"
  },
  hi: {
    announcements: "घोषणाएं",
    notifications: "सूचनाएं",
    markAllRead: "सभी पढ़े हुए चिह्नित करें",
    markRead: "पड़ा हुआ चिह्नित करें",
    noNotifications: "कोई सूचना नहीं है",
    critical: "गंभीर",
    warning: "चेतावनी",
    info: "सामान्य",
    close: "बंद करें"
  },
  gu: {
    announcements: "જાહેરાતો",
    notifications: "સૂચનાઓ",
    markAllRead: "બધા વાંચેલા તરીકે માર્ક કરો",
    markRead: "વાંચેલું માર્ક કરો",
    noNotifications: "કોઈ સૂચનાઓ નથી",
    critical: "ગંભીર",
    warning: "ચેતવણી",
    info: "માહિતી",
    close: "બંધ કરો"
  }
}

// ── Main DriverDashboard Component ─────────────────────────────────────────────

export function DriverDashboard({
  lang,
  setLang,
  session,
  setView,
  setSession,
  syncKey
}: {
  lang: Language;
  setLang: (l: Language) => void;
  session: any;
  setView: (v: any) => void;
  setSession?: (s: any) => void;
  syncKey?: number
}) {
  const [skelLoading, setSkelLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSkelLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const [showNotificationsLog, setShowNotificationsLog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cng_read_notifs_' + String(session.userId)) || '[]')
    } catch {
      return []
    }
  });

  const drivers = storage.getDrivers()
  const driver = drivers.find(d => String(d.id) === String(session.userId))
  const vehicles = storage.getVehicles()
  const vehicle = driver?.assignedVehicleId
    ? vehicles.find(v => v.plate === driver.assignedVehicleId || String(v.id) === String(driver.assignedVehicleId))
    : null
  const fills = storage.getFills().filter(f => f.driverId === session.userId)

  const driverNotifications = useMemo(() => {
    const allNotifs = storage.getNotifications();
    return allNotifs.filter((n: Notification) => 
      n.targetRole === 'all' || 
      n.targetRole === 'driver' || 
      n.targetUserId === String(session.userId)
    );
  }, [syncKey, refreshKey, session.userId]);

  const unreadDriverNotifsCount = useMemo(() => {
    return driverNotifications.filter((n: Notification) => !readNotifIds.includes(n.id)).length;
  }, [driverNotifications, readNotifIds]);

  useEffect(() => {
    const handleStorage = () => {
      try {
        setReadNotifIds(JSON.parse(localStorage.getItem('cng_read_notifs_' + String(session.userId)) || '[]'))
      } catch {}
      setRefreshKey(k => k + 1);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [session.userId]);

  // Tab State
  const [activeTab, setActiveTab] = useState<"cng" | "truck" | "load">("cng");
  const [activeModule, setActiveModule] = useState<null | "cng" | "truck" | "load" | "logs">(null);
  const [showRedeem, setShowRedeem] = useState(false);

  // ── Animation Variants ──────────────────────────────────────────────────────
  const staggerContainer = {
    hidden: {},
    show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
  };
  const fadeSlideUp = {
    hidden: { opacity: 0, y: 22 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 380, damping: 28 } },
  };
  const fadeSlideRight = {
    hidden: { opacity: 0, x: -18 },
    show: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 380, damping: 28 } },
  };
  const springTap = { type: 'spring' as const, stiffness: 500, damping: 22 };
  const moduleTileTransition = { type: 'spring' as const, stiffness: 550, damping: 18 };

  const [activeNotification, setActiveNotification] = useState<{
    id: string;
    type: 'approved' | 'rejected';
    amount: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    const checkRedemptionStatus = () => {
      try {
        const requests = JSON.parse(localStorage.getItem('cng_redemption_requests') || '[]');
        if (!Array.isArray(requests)) return;

        const myRequests = requests.filter((r: any) => String(r.driverId) === String(session.userId));
        const shownNotifs = JSON.parse(localStorage.getItem('cng_shown_redemption_notifs') || '[]');
        const newShownNotifs = [...shownNotifs];
        let triggeredNotif = null;

        for (const req of myRequests) {
          if (req.status !== 'pending' && !shownNotifs.includes(req.id)) {
            triggeredNotif = {
              id: req.id,
              type: req.status as 'approved' | 'rejected',
              amount: req.amount,
              message: req.status === 'approved'
                ? (lang === 'hi' ? `बधाई हो! ₹${req.amount} का आपका निकासी अनुरोध स्वीकृत हो गया है।` : lang === 'gu' ? `અભિનંદન! ₹${req.amount} ની તમારી ઉપાડ વિનંતી મંજૂર કરવામાં આવી છે.` : `Congrats! Your redemption request of ₹${req.amount} was approved.`)
                : (lang === 'hi' ? `₹${req.amount} का आपका निकासी अनुरोध अस्वीकृत कर दिया गया है।` : lang === 'gu' ? `₹${req.amount} ની તમારી ઉપાડ વિનંતી અસ્વીકાર કરવામાં આવી છે.` : `Your redemption request of ₹${req.amount} was rejected.`)
            };
            newShownNotifs.push(req.id);
            break;
          }
        }

        if (triggeredNotif) {
          localStorage.setItem('cng_shown_redemption_notifs', JSON.stringify(newShownNotifs));
          setActiveNotification(triggeredNotif);
          setTimeout(() => {
            setActiveNotification(current => current?.id === triggeredNotif.id ? null : current);
          }, 6000);
        }
      } catch (e) {
        console.error('Error checking redemption status updates:', e);
      }
    };

    checkRedemptionStatus();
    window.addEventListener('storage', checkRedemptionStatus);
    return () => window.removeEventListener('storage', checkRedemptionStatus);
  }, [session.userId, lang]);

  // Geolocation & Map States
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDriverCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.warn('Driver geolocation error:', error);
          // Default to Vadodara center if permission is denied or fails
          setDriverCoords({ lat: 22.3072, lng: 73.1812 });
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setDriverCoords({ lat: 22.3072, lng: 73.1812 });
    }
  }, []);

  // Trip Tracking States
  const [activeTrip, setActiveTrip] = useState<any>(() => {
    try {
      return JSON.parse(localStorage.getItem(`cng_active_trip_${session.userId}`) || 'null')
    } catch {
      return null
    }
  })

  const hasCompletedTripToday = (() => {
    try {
      const allTrips = storage.getTrips()
      return allTrips.some((t: any) => 
        t.driverId === session.userId && 
        t.status === 'completed' && 
        new Date(t.end.time).toDateString() === new Date().toDateString()
      )
    } catch { return false }
  })()

  const [odoInput, setOdoInput] = useState('')
  const [odoPhoto, setOdoPhoto] = useState<string>('')
  const [isSubmittingTrip, setIsSubmittingTrip] = useState(false)
  const [tripFormMode, setTripFormMode] = useState<'idle' | 'start' | 'end'>('idle')
  const [showTripCamera, setShowTripCamera] = useState<'start' | 'end' | null>(null)

  // Shift Time Duration Calculator
  const [shiftTime, setShiftTime] = useState('0h 0m')
  useEffect(() => {
    if (!activeTrip) {
      setShiftTime('0h 0m')
      return
    }
    const updateTime = () => {
      const diff = Date.now() - new Date(activeTrip.start.time).getTime()
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setShiftTime(`${h}h ${m}m`)
    }
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [activeTrip])

  // Listen to trip state changes from refueling wizard or other actions
  useEffect(() => {
    const handleTripStateChange = () => {
      try {
        const active = JSON.parse(localStorage.getItem(`cng_active_trip_${session.userId}`) || 'null')
        setActiveTrip(active)
      } catch (e) {
        console.error('Error loading active trip state:', e)
      }
    }
    window.addEventListener('trip_state_changed', handleTripStateChange)
    return () => window.removeEventListener('trip_state_changed', handleTripStateChange)
  }, [session.userId])

  const handleStartTrip = async () => {
    if (!vehicle) return
    const odoNum = parseInt(odoInput)
    if (isNaN(odoNum) || odoNum < vehicle.currentOdo) {
      alert(`${t('odoMinError', lang).replace('{min}', String(vehicle.currentOdo))}`)
      return
    }

    setIsSubmittingTrip(true)
    const tripId = 'trip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    
    let startGPS = null
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      })
      startGPS = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch (err) {
      console.warn('GPS reading failed for trip start', err)
    }

    let odoPhotoUrl = odoPhoto || '';
    if (odoPhoto && odoPhoto.startsWith('data:')) {
      try {
        const timestamp = Date.now();
        const fillDate = new Date().toISOString().split('T')[0];
        const folderName = `${vehicle.plate}_${fillDate}`;
        odoPhotoUrl = await firestoreSync.uploadMedia(odoPhoto, `trip_start_odo_${timestamp}.jpg`, folderName);
      } catch (err) {
        console.error('Failed to upload start trip odometer photo:', err);
      }
    }

    const tripObj = {
      id: tripId,
      driverId: session.userId,
      driverName: session.name,
      vehicleId: vehicle.plate,
      ownerId: session.ownerId,
      status: 'active',
      start: {
        time: new Date().toISOString(),
        odoReading: odoNum,
        odoPhotoUrl: odoPhotoUrl,
        gps: startGPS
      },
      end: null,
      refuelIds: [],
      distanceKms: 0,
      fuelConsumedKgs: 0
    }

    const allTrips = storage.getTrips()
    allTrips.push(tripObj)
    storage.saveTrips(allTrips)
    await firestoreSync.saveTrip(tripObj).catch(console.error)
    
    if (startGPS) {
      const locObj = {
        driverId: session.userId,
        driverName: session.name,
        ownerId: session.ownerId,
        lat: startGPS.lat,
        lng: startGPS.lng,
        lastUpdated: new Date().toISOString()
      }
      localStorage.setItem(`cng_driver_location_${session.userId}`, JSON.stringify(locObj))
      window.dispatchEvent(new Event('storage'))
      await firestoreSync.updateDriverLocation(locObj).catch(err => {
        console.error('Failed to sync live location to server:', err)
      })
    }

    localStorage.setItem(`cng_active_trip_${session.userId}`, JSON.stringify(tripObj))
    window.dispatchEvent(new Event('trip_state_changed'))
    setActiveTrip(tripObj)
    setTripFormMode('idle')
    setOdoInput('')
    setOdoPhoto('')
    setIsSubmittingTrip(false)
  }

  const handleEndTrip = async () => {
    if (!vehicle || !activeTrip) return
    const odoNum = parseInt(odoInput)
    if (isNaN(odoNum) || odoNum <= activeTrip.start.odoReading) {
      alert(`${t('odoMaxError', lang).replace('{min}', String(activeTrip.start.odoReading))}`)
      return
    }

    setIsSubmittingTrip(true)

    let endGPS = null
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      })
      endGPS = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch (err) {
      console.warn('GPS reading failed for trip end', err)
    }

    let odoPhotoUrl = odoPhoto || '';
    if (odoPhoto && odoPhoto.startsWith('data:')) {
      try {
        const timestamp = Date.now();
        const fillDate = new Date().toISOString().split('T')[0];
        const folderName = `${vehicle.plate}_${fillDate}`;
        odoPhotoUrl = await firestoreSync.uploadMedia(odoPhoto, `trip_end_odo_${timestamp}.jpg`, folderName);
      } catch (err) {
        console.error('Failed to upload end trip odometer photo:', err);
      }
    }

    const tripFills = fills.filter(f => f.time >= activeTrip.start.time)
    const fuelConsumed = tripFills.reduce((sum, f) => sum + f.kgs, 0)
    const distance = odoNum - activeTrip.start.odoReading

    const completedTrip = {
      ...activeTrip,
      status: 'completed',
      end: {
        time: new Date().toISOString(),
        odoReading: odoNum,
        odoPhotoUrl: odoPhotoUrl,
        gps: endGPS
      },
      refuelIds: tripFills.map(f => f.id),
      distanceKms: distance,
      fuelConsumedKgs: fuelConsumed
    }

    const allTrips = storage.getTrips()
    const tripIdx = allTrips.findIndex((t: any) => t.id === completedTrip.id)
    if (tripIdx >= 0) allTrips[tripIdx] = completedTrip
    else allTrips.push(completedTrip)
    storage.saveTrips(allTrips)
    await firestoreSync.saveTrip(completedTrip).catch(console.error)

    const allVehicles = storage.getVehicles()
    storage.saveVehicles(allVehicles.map(v => String(v.id) === String(vehicle.id) ? { ...v, currentOdo: odoNum } : v))

    localStorage.removeItem(`cng_driver_location_${session.userId}`)
    window.dispatchEvent(new Event('storage'))

    await firestoreSync.deleteDriverLocation(session.userId).catch(err => {
      console.error('Failed to delete live location from server:', err)
    })

    localStorage.removeItem(`cng_active_trip_${session.userId}`)
    window.dispatchEvent(new Event('trip_state_changed'))
    setActiveTrip(null)
    setTripFormMode('idle')
    setOdoInput('')
    setOdoPhoto('')
    setIsSubmittingTrip(false)
  }

  const handleLogout = () => {
    storage.clearSession()
    sessionStorage.removeItem('cng_jwt_token')
    setSession?.(null)
    setView('welcome')
  }

  // Dynamic calculations for driver stats
  const todayFills = fills.filter(f => new Date(fillTime(f.time)).toDateString() === new Date().toDateString())
  const todayKgs = todayFills.reduce((sum, f) => sum + f.kgs, 0)
  
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const weekFills = fills.filter(f => fillTime(f.time) >= oneWeekAgo)
  const weekKgs = weekFills.reduce((sum, f) => sum + f.kgs, 0)

  const totalFillsCount = fills.length
  const totalFilledKgs = fills.reduce((sum, f) => sum + f.kgs, 0)
  const totalSavingsRupees = fills.reduce((sum, f) => sum + Math.floor(f.kgs), 0)  // ₹1 per whole Kg (floor per fill)
  const avgFillKgs = fills.length > 0
    ? (totalFilledKgs / fills.length).toFixed(1) + ' Kg'
    : '0.0 Kg'

  function fillTime(timeInput: any) {
    if (typeof timeInput === 'string') return new Date(timeInput).getTime()
    return timeInput
  }

  // ── Find Tempo Filtering & State ─────────────────────────────────────────────

  const [selectedLoad, setSelectedLoad] = useState<LoadRequirement | null>(null);
  const [loadCity, setLoadCity] = useState<"All" | "Vadodara" | "Ahmedabad" | "Surat">("All");
  const [loadCategory, setLoadCategory] = useState<"All" | "Light" | "Medium">("All");

  // Read admin-posted loads; fall back to hardcoded list if admin hasn't posted any
  const availableLoads = useMemo(() => {
    try {
      const stored: any[] = JSON.parse(localStorage.getItem('cng_load_listings') || '[]');
      const active = stored.filter(l => l.status === 'active');
      return active.length > 0 ? active : LOAD_REQUIREMENTS;
    } catch { return LOAD_REQUIREMENTS; }
  }, [syncKey]);

  const filteredLoads = availableLoads.filter((l: any) => {
    if (loadCity !== "All" && l.from !== loadCity && l.to !== loadCity) return false;
    if (loadCategory !== "All" && l.category !== loadCategory) return false;
    return true;
  });

  const [tempoType, setTempoType] = useState<"All" | "EV" | "CNG" | "Diesel">("All");
  const [selectedCity, setSelectedCity] = useState<"Vadodara" | "Ahmedabad">("Vadodara");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequirement, setSelectedRequirement] = useState<TempoRequirement | null>(null);

  const detectedCity = driverCoords && driverCoords.lat > 22.6 ? "Ahmedabad" : "Vadodara";
  
  const nearbyStations = CNG_STATIONS
    .filter(s => s.city === detectedCity)
    .map(s => {
      const dist = driverCoords 
        ? getDistanceKms(driverCoords.lat, driverCoords.lng, s.lat, s.lng)
        : 999;
      return { ...s, dist };
    })
    .sort((a, b) => a.dist - b.dist);

  const googleMapsUrl = driverCoords
    ? `https://www.google.com/maps/search/?api=1&query=CNG+stations+near+${driverCoords.lat},${driverCoords.lng}`
    : `https://www.google.com/maps/search/?api=1&query=CNG+stations`;

  const filteredRequirements = TEMPO_REQUIREMENTS.filter((r) => {
    if (r.city !== selectedCity) return false;
    if (tempoType !== "All" && r.fuelType !== tempoType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesModel = r.model.toLowerCase().includes(q);
      const matchesFuel = r.fuelType.toLowerCase().includes(q);
      if (!matchesModel && !matchesFuel) return false;
    }
    return true;
  });

  const lt = localTranslations[lang] || localTranslations.en;

  const [claimed, setClaimed] = useState(false);

  const tabs = [
    { id: "cng" as const, icon: <Fuel size={15} />, label: "CNG Fill-up", activeColor: "bg-[#E10600]", activeText: "text-[#E10600]" },
    { id: "truck" as const, icon: <Truck size={15} />, label: "List Your Tempo", activeColor: "bg-[#111827]", activeText: "text-[#111827]", badge: true },
    { id: "load" as const, icon: <ClipboardList size={15} />, label: "Load Match", activeColor: "bg-[#6B7280]", activeText: "text-[#6B7280]" },
  ];

  const headerStats = [
    { 
      icon: <Car size={10} className="text-[#E10600]" />, 
      label: t('vehicle', lang) || "Vehicle", 
      value: vehicle ? vehicle.plate : 'N/A', 
      border: true 
    },
    { 
      icon: <Fuel size={10} className="text-[#E10600]" />, 
      label: lang === 'hi' ? 'आज' : lang === 'gu' ? 'આજે' : 'Today', 
      value: `${todayKgs.toFixed(1)} Kg`, 
      border: true 
    },
    { 
      icon: <div className={`w-1.5 h-1.5 rounded-full ${activeTrip ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />, 
      label: lang === 'hi' ? 'स्थिति' : lang === 'gu' ? 'સ્થિતિ' : 'Status', 
      value: activeTrip 
        ? (lang === 'hi' ? 'सक्रिय' : lang === 'gu' ? 'સક્રિય' : 'Online') 
        : (lang === 'hi' ? 'ऑफ़लाइन' : lang === 'gu' ? 'ઓફલાઇન' : 'Offline'), 
      valueClass: activeTrip ? "text-green-600" : "text-gray-500", 
      border: false 
    },
  ];

  const handleStartFillClick = () => {
    if (!vehicle) {
      alert(t('waitVehicleAssignment', lang) || "Please wait for vehicle assignment.");
      return;
    }
    if (activeTrip) {
      setView('wizard');
    } else {
      setTripFormMode('start');
    }
  };

  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) {
      return lang === 'hi' ? 'शुभ प्रभात' : lang === 'gu' ? 'સુપ્રભાત' : 'Good Morning';
    } else if (hrs < 17) {
      return lang === 'hi' ? 'शुभ दोपहर' : lang === 'gu' ? 'શુભ બપોર' : 'Good Afternoon';
    } else {
      return lang === 'hi' ? 'शुभ संध्या' : lang === 'gu' ? 'શુભ સાંજ' : 'Good Evening';
    }
  };

  if (skelLoading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex flex-col max-w-[480px] mx-auto border-x border-[#E8EAED]">
        <style>{`
          @keyframes skel-shimmer {
            0%   { background-position: -600px 0; }
            100% { background-position:  600px 0; }
          }
          .skel {
            background: linear-gradient(90deg, #ECEEF1 25%, #F7F8FA 50%, #ECEEF1 75%);
            background-size: 1200px 100%;
            animation: skel-shimmer 1.4s infinite;
            border-radius: 8px;
          }
        `}</style>

        {/* Header skeleton */}
        <div className="bg-white pt-12 px-5 pb-4" style={{ boxShadow: '0 1px 0 #F0F2F5' }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="skel w-11 h-11 rounded-2xl" />
              <div>
                <div className="skel w-20 h-2.5 mb-2 rounded" />
                <div className="skel w-28 h-4 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="skel w-10 h-10 rounded-2xl" />
              <div className="skel w-20 h-10 rounded-2xl" />
              <div className="skel w-10 h-10 rounded-2xl" />
            </div>
          </div>
          {/* Stats row skeleton */}
          <div className="grid grid-cols-3 gap-3">
            {[0,1,2].map(i => (
              <div key={i} className="bg-[#F7F8FA] rounded-2xl p-3 border border-[#ECEEF1]">
                <div className="skel w-10 h-2 mb-2 rounded" />
                <div className="skel w-16 h-4 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 px-4 pt-4 flex flex-col gap-4">
          {/* Banner skeleton */}
          <div className="skel w-full h-[88px] rounded-3xl" />

          {/* Modules card skeleton */}
          <div className="bg-white rounded-3xl border border-[#ECEEF1] p-4">
            <div className="skel w-16 h-3 mb-4 rounded" />
            <div className="grid grid-cols-3 gap-3">
              {[0,1,2].map(i => (
                <div key={i} className="flex flex-col items-center gap-2 bg-[#F7F8FA] rounded-2xl p-3">
                  <div className="skel w-12 h-12 rounded-2xl" />
                  <div className="skel w-14 h-2.5 rounded" />
                  <div className="skel w-10 h-2 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Stats cards skeleton */}
          <div className="grid grid-cols-2 gap-3">
            {[0,1].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-[#ECEEF1] p-4">
                <div className="skel w-12 h-2.5 mb-3 rounded" />
                <div className="skel w-16 h-5 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom nav skeleton */}
        <div className="bg-white border-t border-[#ECEEF1] px-6 py-4 flex justify-around">
          {[0,1,2].map(i => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="skel w-6 h-6 rounded-lg" />
              <div className="skel w-8 h-2 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col max-w-[480px] mx-auto border-x border-[#E8EAED]">
      {/* Real-time Payout Notifications */}
      <AnimatePresence>
        {activeNotification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-5 left-4 right-4 z-50 max-w-[448px] mx-auto"
          >
            <div className={`p-4 rounded-2xl shadow-xl border flex items-start gap-3 backdrop-blur-md ${
              activeNotification.type === 'approved' 
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900' 
                : 'bg-rose-50/95 border-rose-200 text-rose-900'
            }`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                activeNotification.type === 'approved' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
              }`}>
                {activeNotification.type === 'approved' ? <CheckCircle2 size={18} /> : <X size={18} />}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-xs font-black tracking-wide uppercase opacity-75">
                  {activeNotification.type === 'approved' 
                    ? (lang === 'hi' ? 'अनुरोध स्वीकृत' : lang === 'gu' ? 'વિનંતી મંજૂર' : 'Request Approved') 
                    : (lang === 'hi' ? 'अनुरोध अस्वीकृत' : lang === 'gu' ? 'વિનંતી અસ્વીકાર' : 'Request Rejected')
                  }
                </p>
                <p className="text-sm font-bold leading-snug mt-0.5">{activeNotification.message}</p>
              </div>
              <button 
                onClick={() => setActiveNotification(null)}
                className="p-1 hover:bg-black/5 rounded-lg text-gray-500 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HEADER ── */}
      <div className="bg-white pt-12 px-5 pb-4 relative z-20" style={{ boxShadow: '0 1px 0 #F0F2F5' }}>
        {activeModule === null ? (
          /* Module Home Header */
          <>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #c20000 0%, #E10600 100%)' }}>
                  <span className="text-white font-black text-base" style={{ fontFamily: "'Archivo', sans-serif" }}>
                    {session.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-[#9CA3AF] text-[11px] font-medium leading-none mb-1">{getGreeting()}</p>
                  <p className="text-[#111827] font-black text-[17px] leading-none" style={{ fontFamily: "'Archivo', sans-serif", letterSpacing: '-0.02em' }}>
                    {session.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <motion.button onClick={() => setShowNotificationsLog(true)}
                  whileTap={{ scale: 0.88 }} transition={springTap}
                  className="w-10 h-10 rounded-2xl bg-[#F7F8FA] border border-[#ECEEF1] flex items-center justify-center relative">
                  <Bell size={16} className="text-[#6B7280]" />
                  {unreadDriverNotifsCount > 0 && (
                    <motion.div
                      initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                      className="absolute -top-1 -right-1 px-1.5 bg-[#E10600] rounded-full text-[8px] font-black text-white min-w-[14px] h-[14px] flex items-center justify-center">
                      {unreadDriverNotifsCount}
                    </motion.div>
                  )}
                </motion.button>
                <motion.button type="button" onClick={() => setShowRedeem(true)}
                  whileTap={{ scale: 0.88 }} transition={springTap}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-2xl focus:outline-none"
                  style={{ background: 'linear-gradient(135deg, #c20000 0%, #E10600 100%)', boxShadow: '0 4px 12px rgba(225,6,0,0.25)' }}>
                  <IndianRupee size={12} className="text-white" />
                  <div className="flex flex-col text-left leading-none">
                    <span className="text-[7px] font-black text-white/70 uppercase tracking-widest leading-none">SAVED</span>
                    <span className="text-white font-black text-xs mt-0.5 leading-none" style={{ fontFamily: "'Archivo', sans-serif" }}>₹{totalSavingsRupees}</span>
                  </div>
                </motion.button>
                <LanguageSwitcher lang={lang} setLang={setLang} dark={false} />
              </div>
            </div>
            {/* Stats row */}
            <div className="flex gap-2">
              {headerStats.map(({ icon, label, value, valueClass, border: _b }, i) => (
                <motion.div
                  key={label}
                  className="flex-1 bg-[#F7F8FA] rounded-2xl px-3 py-2.5 border border-[#ECEEF1]"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28, delay: 0.08 + i * 0.06 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="flex items-center gap-1 mb-1">{icon}<span className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-wide">{label}</span></div>
                  <p className={`font-black text-sm leading-none ${valueClass || "text-[#111827]"}`} style={{ fontFamily: "'Archivo', sans-serif" }}>{value}</p>
                </motion.div>
              ))}
            </div>
          </>
        ) : (
          /* Module Detail Header */
          <div className="flex items-center gap-3">
            <motion.button onClick={() => setActiveModule(null)}
              whileTap={{ scale: 0.85, x: -3 }} transition={springTap}
              className="w-10 h-10 rounded-2xl bg-[#F7F8FA] border border-[#ECEEF1] flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </motion.button>
            <div className="flex-1">
              <p className="text-[#9CA3AF] text-[10px] font-semibold uppercase tracking-widest leading-none mb-1">
                {lang === 'hi' ? 'मॉड्यूल' : lang === 'gu' ? 'મોડ્યુલ' : 'Module'}
              </p>
              <p className="text-[#111827] font-black text-[17px] leading-none" style={{ fontFamily: "'Archivo', sans-serif" }}>
                {activeModule === 'cng' ? (lang === 'hi' ? 'सीएनजी फिल-अप' : lang === 'gu' ? 'સીએનજી ફિલ-અપ' : 'CNG Fill-up')
                  : activeModule === 'truck' ? (lang === 'hi' ? 'टेंपो नामांकन' : lang === 'gu' ? 'ટેમ્પો નોંધણી' : 'List Your Tempo')
                  : (lang === 'hi' ? 'लोड मैच' : lang === 'gu' ? 'લોડ મેચ' : 'Load Match')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <motion.button onClick={() => setShowNotificationsLog(true)}
                whileTap={{ scale: 0.88 }} transition={springTap}
                className="w-10 h-10 rounded-2xl bg-[#F7F8FA] border border-[#ECEEF1] flex items-center justify-center relative">
                <Bell size={16} className="text-[#6B7280]" />
                {unreadDriverNotifsCount > 0 && (
                  <div className="absolute -top-1 -right-1 px-1.5 bg-[#E10600] rounded-full text-[8px] font-black text-white min-w-[14px] h-[14px] flex items-center justify-center">
                    {unreadDriverNotifsCount}
                  </div>
                )}
              </motion.button>
              <motion.button type="button" onClick={() => setShowRedeem(true)}
                whileTap={{ scale: 0.88 }} transition={springTap}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #c20000 0%, #E10600 100%)', boxShadow: '0 4px 12px rgba(225,6,0,0.25)' }}>
                <IndianRupee size={12} className="text-white" />
                <span className="text-white font-black text-xs" style={{ fontFamily: "'Archivo', sans-serif" }}>₹{totalSavingsRupees}</span>
              </motion.button>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-[#F7F8FA] pb-36">

        {/* ── MODULE HOME ── */}
        {activeModule === null && (
          <motion.div className="px-4 pt-5 pb-4"
            variants={staggerContainer} initial="hidden" animate="show">

            {/* ₹5 Off Banner */}
            <motion.div variants={fadeSlideRight} className="rounded-3xl overflow-hidden mb-4 relative"
              style={{ background: 'linear-gradient(135deg, #a80000 0%, #E10600 55%, #ff3a00 100%)', boxShadow: '0 6px 24px rgba(225,6,0,0.28)' }}>
              <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1.5px, transparent 1.5px)', backgroundSize: '16px 16px' }} />
              <div className="relative z-10 flex items-center gap-4 px-5 py-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-black text-base leading-tight text-center" style={{ fontFamily: "'Archivo', sans-serif" }}>₹1<br/>/Kg</span>
                </div>
                <div>
                  <p className="text-white font-black text-base leading-tight" style={{ fontFamily: "'Archivo', sans-serif" }}>
                    {lang === 'hi' ? 'हर 1 Kg CNG पर ₹1 आपके वॉलेट में' : lang === 'gu' ? 'દર 1 Kg CNG ભરાઈ પર ₹1 વૉલેટમાં' : 'Earn ₹1 per Kg of CNG filled'}
                  </p>
                  <p className="text-white/65 text-xs font-medium mt-0.5">
                    {lang === 'hi' ? 'सभी पार्टनर स्टेशनों पर · हर भराई पर' : lang === 'gu' ? 'તમામ પાર્ટનર સ્ટેશनો · દરેક ભરાઈ' : 'In your wallet · At all partner stations · Every fill-up'}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Module icon grid — Direction A: Premium Gloss */}
            <motion.div variants={fadeSlideUp} className="bg-white rounded-3xl border border-[#ECEEF1] p-4 mb-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[2.5px] mb-4">
                {lang === 'hi' ? 'मॉड्यूल' : lang === 'gu' ? 'મોડ્યુલ' : 'Modules'}
              </p>
              <div className="grid grid-cols-3 gap-3">

                {/* ── CNG Fill-up ── */}
                <motion.button
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.88 }}
                  transition={moduleTileTransition}
                  onClick={() => { setActiveModule('cng'); setActiveTab('cng'); }}
                  className="flex flex-col items-center gap-2.5 py-4 px-1 rounded-2xl relative"
                  style={{ background: 'linear-gradient(160deg, #fff1f0 0%, #ffe4e2 100%)' }}>
                  {activeTrip && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  )}
                  <div className="relative w-[60px] h-[60px] rounded-[18px] flex items-center justify-center" style={{
                    background: 'linear-gradient(145deg, #C00000 0%, #8B0000 100%)',
                    boxShadow: '0 8px 20px rgba(176,0,0,0.42), 0 2px 4px rgba(0,0,0,0.14)',
                  }}>
                    <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-[18px]" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 100%)' }} />
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="relative z-10">
                      <rect x="5" y="7" width="15" height="21" rx="3" fill="white" opacity="0.95"/>
                      <rect x="7.5" y="10" width="10" height="6" rx="1.5" fill="#C00000" opacity="0.85"/>
                      <text x="12.5" y="14.8" fontSize="4" fill="white" fontWeight="900" textAnchor="middle" fontFamily="monospace">KG</text>
                      <rect x="7.5" y="18.5" width="10" height="1.5" rx="0.8" fill="#CCCCCC" opacity="0.45"/>
                      <rect x="7.5" y="22" width="10" height="3.5" rx="1.5" fill="rgba(255,255,255,0.16)"/>
                      <text x="12.5" y="24.5" fontSize="3.2" fill="white" fontWeight="900" textAnchor="middle" fontFamily="system-ui" letterSpacing="1">CNG</text>
                      <path d="M20 15 Q28 13 28 9 Q28 6.5 25.5 6.5 L24.5 6.5" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
                      <rect x="23" y="5" width="4.5" height="3" rx="1.5" fill="rgba(255,255,255,0.92)"/>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] font-bold text-[#111827] leading-tight">{lang === 'hi' ? 'सीएनजी फिल-अप' : lang === 'gu' ? 'સીએનજી ફિલ-અપ' : 'CNG Fill-up'}</p>
                    <p className="text-[9px] text-[#9CA3AF] font-medium mt-0.5">₹1 per Kg</p>
                  </div>
                </motion.button>

                {/* ── List Your Tempo ── */}
                <motion.button
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.88 }}
                  transition={moduleTileTransition}
                  onClick={() => { setActiveModule('truck'); setActiveTab('truck'); }}
                  className="flex flex-col items-center gap-2.5 py-4 px-1 rounded-2xl relative"
                  style={{ background: 'linear-gradient(160deg, #f1f3f6 0%, #e6e9ed 100%)' }}>
                  <div className="relative w-[60px] h-[60px] rounded-[18px] flex items-center justify-center" style={{
                    background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
                    boxShadow: '0 8px 20px rgba(15,23,42,0.40), 0 2px 4px rgba(0,0,0,0.16)',
                  }}>
                    <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-[18px]" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, transparent 100%)' }} />
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="relative z-10">
                      <rect x="3" y="15" width="20" height="12" rx="2" fill="white" opacity="0.92"/>
                      <rect x="23" y="19" width="10" height="8" rx="2" fill="white" opacity="0.78"/>
                      <rect x="24" y="20.5" width="7" height="3.5" rx="1" fill="#1e293b" opacity="0.45"/>
                      <circle cx="9.5" cy="28.5" r="3" fill="#374151" opacity="0.9"/>
                      <circle cx="9.5" cy="28.5" r="1.4" fill="white" opacity="0.55"/>
                      <circle cx="26" cy="28.5" r="3" fill="#374151" opacity="0.9"/>
                      <circle cx="26" cy="28.5" r="1.4" fill="white" opacity="0.55"/>
                      <rect x="6.5" y="17.5" width="1.2" height="7.5" rx="0.5" fill="rgba(30,41,59,0.14)"/>
                      <rect x="10.5" y="17.5" width="1.2" height="7.5" rx="0.5" fill="rgba(30,41,59,0.14)"/>
                      <rect x="14.5" y="17.5" width="1.2" height="7.5" rx="0.5" fill="rgba(30,41,59,0.14)"/>
                      <rect x="32" y="22.5" width="2" height="1.5" rx="0.5" fill="#FCD34D" opacity="0.85"/>
                      <rect x="3" y="22" width="20" height="1" fill="rgba(30,41,59,0.08)"/>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] font-bold text-[#111827] leading-tight">{lang === 'hi' ? 'टेंपो नामांकन' : lang === 'gu' ? 'ટેમ્પો નોંધણી' : 'List Your Tempo'}</p>
                    <p className="text-[9px] text-[#9CA3AF] font-medium mt-0.5">List & earn</p>
                  </div>
                </motion.button>

                {/* ── Load Match ── */}
                <motion.button
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.88 }}
                  transition={moduleTileTransition}
                  onClick={() => { setActiveModule('load'); setActiveTab('load'); }}
                  className="flex flex-col items-center gap-2.5 py-4 px-1 rounded-2xl relative"
                  style={{ background: 'linear-gradient(160deg, #eef2ff 0%, #e5e9ff 100%)' }}>
                  <div className="relative w-[60px] h-[60px] rounded-[18px] flex items-center justify-center" style={{
                    background: 'linear-gradient(145deg, #4338ca 0%, #3730a3 100%)',
                    boxShadow: '0 8px 20px rgba(67,56,202,0.42), 0 2px 4px rgba(0,0,0,0.12)',
                  }}>
                    <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-[18px]" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.20) 0%, transparent 100%)' }} />
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="relative z-10">
                      <circle cx="8" cy="9.5" r="2.5" fill="rgba(255,255,255,0.75)"/>
                      <circle cx="8" cy="9.5" r="1" fill="#4338ca" opacity="0.55"/>
                      <circle cx="28" cy="9.5" r="2.5" fill="rgba(255,255,255,0.55)"/>
                      <circle cx="28" cy="9.5" r="1" fill="rgba(255,255,255,0.7)"/>
                      <path d="M10.5 9.5 Q18 7.5 25.5 9.5" stroke="rgba(255,255,255,0.38)" strokeWidth="1.2" strokeDasharray="2 2" fill="none"/>
                      <rect x="3" y="14" width="11" height="11" rx="2" fill="white" opacity="0.92"/>
                      <rect x="3" y="18.5" width="11" height="1" fill="#4338ca" opacity="0.18"/>
                      <rect x="8" y="14" width="1" height="11" fill="#4338ca" opacity="0.18"/>
                      <path d="M15.5 19.5 H20.5" stroke="rgba(255,255,255,0.88)" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M18.5 17.2 L21.5 19.5 L18.5 21.8" stroke="rgba(255,255,255,0.88)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      <rect x="22" y="14" width="11" height="11" rx="2" fill="white" opacity="0.78"/>
                      <rect x="22" y="18.5" width="11" height="1" fill="#4338ca" opacity="0.18"/>
                      <rect x="27" y="14" width="1" height="11" fill="#4338ca" opacity="0.18"/>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] font-bold text-[#111827] leading-tight">{lang === 'hi' ? 'लोड मैच' : lang === 'gu' ? 'લોડ મેચ' : 'Load Match'}</p>
                    <p className="text-[9px] text-[#9CA3AF] font-medium mt-0.5">12 live routes</p>
                  </div>
                </motion.button>

              </div>
            </motion.div>

          </motion.div>
        )}


        {/* ── TAB 1: CNG FILL-UP ─────────────────────────────────────────────── */}
        {activeModule === 'cng' && activeTab === "cng" && (
          <motion.div
            className="pb-32 flex flex-col gap-5"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="px-4 pt-3 flex flex-col gap-5">
              {/* Start CNG Fill-up CTA / Trip Controls */}
              {!vehicle ? (
                <div className="p-6 rounded-3xl bg-[#FEF3C7] border border-[#FDE68A] text-center">
                  <Car className="w-10 h-10 text-[#D97706] mx-auto mb-3" />
                  <h3 className="font-bold text-[16px] text-[#92400E] mb-1">{t('noAssignedVehicle', lang)}</h3>
                  <p className="text-[13px] text-[#B45309]">{t('waitVehicleAssignment', lang)}</p>
                </div>
              ) : tripFormMode === 'start' ? (
                /* START TRIP FORM MODE */
                <div className="p-5 rounded-3xl bg-white border border-[#E2E6EB] shadow-sm space-y-4">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-bold text-[17px] text-[#111827]">🏁 {t('startNewTrip', lang)}</h3>
                    <button onClick={() => { setTripFormMode('idle'); setOdoInput(''); setOdoPhoto('') }} className="text-[12px] text-[#6B7280] hover:text-[#111827]">{t('cancel', lang)}</button>
                  </div>
                  <div>
                    <label className="text-[11px] text-[#6B7280] uppercase tracking-wider block mb-1 font-semibold">{t('startingOdo', lang)}</label>
                    <input
                      type="number"
                      value={odoInput}
                      onChange={e => setOdoInput(e.target.value)}
                      placeholder={`${lang === 'hi' ? 'न्यूनतम' : lang === 'gu' ? 'ન્યૂનતમ' : 'Min'} ${vehicle.currentOdo} km`}
                      className="w-full h-11 px-4 border border-[#E2E6EB] rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#6B7280] uppercase tracking-wider block mb-1.5 font-semibold">{t('odometerPhoto', lang)}</label>
                    <button
                      type="button"
                      onClick={() => setShowTripCamera('start')}
                      className="w-full h-11 bg-white border border-[#E2E6EB] hover:bg-[#F5F6F8] rounded-xl text-xs font-semibold text-[#4B5563] flex items-center justify-center gap-2"
                    >
                      <Camera className="w-4 h-4 text-[#6B7280]" />
                      {t('captureOdoPhoto', lang)}
                    </button>
                    {odoPhoto && (
                      <img src={odoPhoto} alt="Odo preview" className="w-32 h-20 object-cover rounded-lg border border-[#E2E6EB] mt-2" />
                    )}
                  </div>
                  <button
                    onClick={handleStartTrip}
                    disabled={!odoInput || !odoPhoto || isSubmittingTrip}
                    className="w-full h-12 bg-[#E10600] text-white font-bold rounded-2xl disabled:opacity-50 text-sm hover:brightness-110 active:scale-95 transition-all shadow-md"
                  >
                    {isSubmittingTrip ? t('startingTrip', lang) : t('confirmStartTrip', lang)}
                  </button>
                </div>
              ) : tripFormMode === 'end' ? (
                /* END TRIP FORM MODE */
                <div className="p-5 rounded-3xl bg-white border border-[#E2E6EB] shadow-sm space-y-4">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-bold text-[17px] text-[#111827]">🛑 {t('endActiveTrip', lang)}</h3>
                    <button onClick={() => { setTripFormMode('idle'); setOdoInput(''); setOdoPhoto('') }} className="text-[12px] text-[#6B7280] hover:text-[#111827]">{t('cancel', lang)}</button>
                  </div>
                  <div>
                    <label className="text-[11px] text-[#6B7280] uppercase tracking-wider block mb-1 font-semibold">{t('endingOdo', lang)}</label>
                    <input
                      type="number"
                      value={odoInput}
                      onChange={e => setOdoInput(e.target.value)}
                      placeholder={`${lang === 'hi' ? 'न्यूनतम' : lang === 'gu' ? 'ન્યૂનતમ' : 'Min'} ${activeTrip.start.odoReading + 1} km`}
                      className="w-full h-11 px-4 border border-[#E2E6EB] rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#6B7280] uppercase tracking-wider block mb-1.5 font-semibold">{t('odometerPhoto', lang)}</label>
                    <button
                      type="button"
                      onClick={() => setShowTripCamera('end')}
                      className="w-full h-11 bg-white border border-[#E2E6EB] hover:bg-[#F5F6F8] rounded-xl text-xs font-semibold text-[#4B5563] flex items-center justify-center gap-2"
                    >
                      <Camera className="w-4 h-4 text-[#6B7280]" />
                      {t('captureOdoPhoto', lang)}
                    </button>
                    {odoPhoto && (
                      <img src={odoPhoto} alt="Odo preview" className="w-32 h-20 object-cover rounded-lg border border-[#E2E6EB] mt-2" />
                    )}
                  </div>
                  <button
                    onClick={handleEndTrip}
                    disabled={!odoInput || !odoPhoto || isSubmittingTrip}
                    className="w-full h-12 bg-[#111827] text-white font-bold rounded-2xl disabled:opacity-50 text-sm hover:bg-black active:scale-95 transition-all"
                  >
                    {isSubmittingTrip ? t('endingTrip', lang) : t('confirmEndTrip', lang)}
                  </button>
                </div>
              ) : activeTrip ? (
                /* ACTIVE TRIP: Action CTA Buttons */
                <div className="flex flex-col gap-3">
                  <div className="p-4 rounded-3xl bg-emerald-50 border border-emerald-200 shadow-sm text-center">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-emerald-800 uppercase tracking-wider font-extrabold">🟢 {t('tripInProgress', lang)}</span>
                      <span className="text-[11px] text-emerald-700">{new Date(activeTrip.start.time).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm font-extrabold text-emerald-900 mt-1">{t('startedAt', lang)}: <strong>{activeTrip.start.odoReading} km</strong></p>
                  </div>
                  <button
                    onClick={() => setView('wizard')}
                    className="w-full rounded-3xl py-4 flex items-center justify-between px-5 active:scale-[0.98] transition-transform"
                    style={{ background: 'linear-gradient(135deg, #c20000 0%, #E10600 60%, #ff3000 100%)', boxShadow: '0 8px 24px rgba(225,6,0,0.3)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/20 flex items-center justify-center">
                        <Fuel size={18} className="text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-white/70 text-[9px] font-bold uppercase tracking-[2px] leading-none mb-1">Trip Active</p>
                        <span className="text-white font-black text-lg leading-none" style={{ fontFamily: "'Archivo', sans-serif" }}>
                          {lang === 'hi' ? 'सीएनजी भरना शुरू करें' : lang === 'gu' ? 'સીએનજી ભરો' : 'Record CNG Fill'}
                        </span>
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
                      <ChevronRight size={18} className="text-white" />
                    </div>
                  </button>
                  <button
                    onClick={() => setTripFormMode('end')}
                    className="w-full bg-[#111827] rounded-3xl py-4 flex items-center justify-between px-5 active:scale-[0.98] transition-transform"
                    style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
                        <span className="text-[18px]">🏁</span>
                      </div>
                      <div className="text-left">
                        <p className="text-white/40 text-[9px] font-bold uppercase tracking-[2px] leading-none mb-1">Wrap Up</p>
                        <span className="text-white font-black text-lg leading-none" style={{ fontFamily: "'Archivo', sans-serif" }}>
                          {lang === 'hi' ? 'यात्रा समाप्त करें' : lang === 'gu' ? 'મુસાફરી પૂર્ણ કરો' : 'End Trip'}
                        </span>
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                      <ChevronRight size={18} className="text-white/60" />
                    </div>
                  </button>
                </div>
              ) : (
                /* IDLE STATE: Start Trip CTA */
                <div className="space-y-3">
                  {hasCompletedTripToday && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 size={18} className="text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="text-emerald-800 font-black text-[13px]">{t('tripCompleted', lang)}</h3>
                        <p className="text-emerald-700 text-[11px]">{t('tripCompletedToday', lang)}</p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setTripFormMode('start')}
                    className="w-full rounded-3xl py-4 flex items-center justify-between px-5 active:scale-[0.98] transition-transform"
                    style={{ background: 'linear-gradient(135deg, #c20000 0%, #E10600 60%, #ff3000 100%)', boxShadow: '0 8px 24px rgba(225,6,0,0.3)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/20 flex items-center justify-center">
                        <Fuel size={18} className="text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-white/70 text-[9px] font-bold uppercase tracking-[2px] leading-none mb-1">
                          {lang === 'hi' ? 'शुरू करें' : lang === 'gu' ? 'શરૂ કરો' : 'Tap to Begin'}
                        </p>
                        <span className="text-white font-black text-lg leading-none" style={{ fontFamily: "'Archivo', sans-serif" }}>
                          {lang === 'hi' ? 'यात्रा शुरू करें' : lang === 'gu' ? 'મુસાફરી શરૂ કરો' : 'Start Your Trip'}
                        </span>
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
                      <ChevronRight size={18} className="text-white" />
                    </div>
                  </button>
                </div>
              )}

              {/* Recent Fills */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-black text-[15px] text-[#111827]" style={{ fontFamily: "'Archivo', sans-serif" }}>
                    {lang === 'hi' ? 'हालिया भराई' : lang === 'gu' ? 'તાજેતરની ભરાઈ' : 'Recent Fills'}
                  </p>
                  <button className="text-[#E10600] text-xs font-bold px-2 py-1 rounded-lg bg-[#FDE8E8] active:scale-95 transition-transform">
                    {lang === 'hi' ? 'सभी देखें' : lang === 'gu' ? 'બધા જુઓ' : 'View All'}
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {fills.slice(0, 5).map((fill) => (
                    <div key={fill.id} className="bg-white rounded-2xl p-4 border border-[#E2E6EB]">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-[#F5F6F8] flex items-center justify-center">
                            <Fuel size={13} className="text-[#6B7280]" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#111827]">{fill.kgs} Kg</p>
                            <p className="text-[10px] text-[#6B7280]">
                              {new Date(fillTime(fill.time)).toLocaleDateString()} at {new Date(fillTime(fill.time)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        {fill.verified ? (
                          <div className="flex items-center gap-1 bg-[#dcfce7] rounded-full px-2 py-0.5">
                            <CheckCircle2 size={10} className="text-green-600" />
                            <span className="text-green-700 text-[10px] font-bold">Synced</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 bg-[#FEF3C7] rounded-full px-2 py-0.5">
                            <AlertTriangle size={10} className="text-[#92400E]" />
                            <span className="text-[#92400E] text-[10px] font-bold">{t('pending', lang)}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between pl-10">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={10} className="text-[#6B7280]" />
                          <p className="text-[10px] text-[#6B7280] font-medium">{fill.station}</p>
                        </div>
                        <p className="text-xs font-black text-[#111827]">₹{fill.total != null ? fill.total.toFixed(0) : Math.round(fill.kgs * 96)}</p>
                      </div>
                    </div>
                  ))}
                  {fills.length === 0 && (
                    <div className="py-12 text-center">
                      <p className="text-[#9CA3AF] text-[14px]">{t('noFillsRecorded', lang)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Nearby CNG Stations */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-black text-[15px] text-[#111827]" style={{ fontFamily: "'Archivo', sans-serif" }}>
                    {lang === 'hi' ? 'आसपास के सीएनजी स्टेशन' : lang === 'gu' ? 'નજીકના સીએનજી સ્ટેશનો' : 'Nearby CNG Stations'}
                  </p>
                  <a 
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#E10600] text-xs font-bold hover:underline"
                  >
                    {lang === 'hi' ? 'मानचित्र देखें' : lang === 'gu' ? 'નકશો જુઓ' : 'Map View'}
                  </a>
                </div>
                <div className="flex flex-col gap-2">
                  {nearbyStations.slice(0, 3).map((s: any) => (
                    <div
                      key={s.name}
                      className="bg-white rounded-2xl px-4 py-3 border border-[#E2E6EB] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
                          <Fuel size={15} className="text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#111827]">{s.name}</p>
                          <p className="text-xs text-[#6B7280] font-medium">
                            {s.dist === 999 ? "Calculating..." : `${s.dist} km`} · Wait {s.wait}
                          </p>
                        </div>
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name + ' ' + s.city)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-3 py-1 hover:brightness-95 active:scale-95 transition-all"
                      >
                        Open
                      </a>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats Row */}
              <div>
                <p className="font-black text-[15px] text-[#111827] mb-3" style={{ fontFamily: "'Archivo', sans-serif" }}>
                  {lang === 'hi' ? 'आपकी प्रगति' : lang === 'gu' ? 'તમારી પ્રગતિ' : 'Your Stats'}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: lang === 'hi' ? 'इस सप्ताह' : lang === 'gu' ? 'આ અઠવાડિયે' : "This Week", value: `${weekKgs.toFixed(1)} Kg`, color: '#E10600' },
                    { label: lang === 'hi' ? 'कुल भराई' : lang === 'gu' ? 'કુલ ભરાઈ' : "Total Fills", value: totalFillsCount.toString(), color: '#111827' },
                    { label: lang === 'hi' ? 'औसत/भराई' : lang === 'gu' ? 'સરેરાશ/ભરાઈ' : "Avg/Fill", value: avgFillKgs, color: '#6B7280' }
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white rounded-2xl p-3 border border-[#E2E6EB] text-center">
                      <p className="font-black text-base leading-none" style={{ color, fontFamily: "'Archivo', sans-serif" }}>{value}</p>
                      <p className="text-[10px] font-semibold text-[#9CA3AF] leading-tight mt-1.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {/* ── TAB 2: FIND TEMPO ───────────────────────────────────────────── */}
        {activeModule === 'truck' && activeTab === "truck" && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="px-4 pt-4 pb-3 bg-white border-b border-[#F0F1F4] space-y-3">
              
              {/* City selector tabs */}
              <div className="flex bg-[#F5F6F8] p-1 rounded-2xl border border-[#E2E6EB] w-full">
                {(["Vadodara", "Ahmedabad"] as const).map((city) => (
                  <button
                    key={city}
                    onClick={() => setSelectedCity(city)}
                    className={`flex-1 py-2.5 text-center text-xs font-black rounded-xl transition-all ${
                      selectedCity === city 
                        ? "bg-[#E10600] text-white shadow-sm"
                        : "text-[#6B7280] hover:text-[#111827]"
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>

              {/* Fuel types selector */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {TEMPO_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setTempoType(type)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      tempoType === type 
                        ? "bg-[#E10600] text-white shadow-md" 
                        : "bg-[#F5F6F8] border border-[#E2E6EB] text-[#6B7280]"
                    }`}
                  >
                    {type === "EV" && <Zap size={11} />}
                    {type === "CNG" && <Fuel size={11} />}
                    {type === "Diesel" && <Fuel size={11} />}
                    {type === "All" && <Truck size={11} />}
                    {type === "All" ? "All Fuel" : type}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs font-bold text-[#6B7280]">
                <span className="text-[#111827] font-extrabold">{filteredRequirements.length}</span> tempos found
                {tempoType !== "All" && <span className="text-[#E10600]"> · {tempoType}</span>}
              </p>
            </div>

            {/* Active Tempo Requirements Grid */}
            <div className="px-4 flex flex-col gap-4">
              {filteredRequirements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-3xl bg-[#F5F6F8] flex items-center justify-center mb-4">
                    <Truck size={28} className="text-[#6B7280]" />
                  </div>
                  <p className="font-bold text-[#111827] mb-1">{lt.noResults || "No tempos match filters"}</p>
                </div>
              ) : (
                filteredRequirements.map((req) => (
                  <TempoRequirementCard key={req.id} req={req} onSelect={setSelectedRequirement} langText={lt} />
                ))
              )}
            </div>

            {selectedRequirement && (
              <TempoRequirementDetailSheet 
                req={selectedRequirement} 
                onClose={() => setSelectedRequirement(null)} 
                langText={lt} 
                sessionName={session?.name}
              />
            )}
          </motion.div>
        )}

        {/* ── TAB 3: LOAD MATCH ───────────────────────────────────────────── */}
        {activeModule === 'load' && activeTab === "load" && (
          <motion.div
            className="pb-36"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >

            {/* 32 Feet Coming Soon banner */}
            <div className="mx-4 mt-4 mb-3 flex items-center gap-3 bg-[#111827] rounded-2xl px-4 py-3">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <Truck size={15} className="text-white/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-bold leading-tight">32 Feet Loads — Coming Soon</p>
                <p className="text-white/45 text-[10px] font-medium">Large truck loads will be available shortly</p>
              </div>
              <span className="bg-[#E10600] text-white text-[8px] font-black rounded-full px-2 py-0.5 uppercase tracking-wide flex-shrink-0">Soon</span>
            </div>

            {/* My Active Bookings */}
            {(() => {
              try {
                const myBookings: any[] = JSON.parse(localStorage.getItem('cng_load_bookings') || '[]');
                if (myBookings.length === 0) return null;
                return (
                  <div className="px-4 mb-4">
                    <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[2px] mb-2">My Bookings</p>
                    <div className="space-y-2">
                      {myBookings.slice(0, 3).map((b: any) => (
                        <div key={b.id} className="bg-white rounded-2xl border border-[#ECEEF1] px-4 py-3 flex items-center gap-3" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                          <div className="w-9 h-9 rounded-xl bg-[#4338ca]/10 flex items-center justify-center flex-shrink-0">
                            <ClipboardList size={16} className="text-[#4338ca]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-extrabold text-[#111827] truncate">{b.cargo} · {b.from} → {b.to}</p>
                            <p className="text-[10px] text-[#6B7280]">{b.vehicleType} · {b.rate} · {new Date(b.time).toLocaleDateString()}</p>
                          </div>
                          <span className={`text-[9px] font-bold rounded-full px-2 py-0.5 uppercase flex-shrink-0 ${
                            b.status === 'approved' ? 'bg-green-100 text-green-700' :
                            b.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {b.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}

            {/* City filter */}
            <div className="px-4 mb-3">
              <div className="bg-white rounded-2xl p-1 border border-[#ECEEF1] flex gap-1" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                {(["All", "Vadodara", "Ahmedabad", "Surat"] as const).map(c => (
                  <button key={c} onClick={() => setLoadCity(c)}
                    className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all ${loadCity === c ? 'bg-[#111827] text-white shadow-sm' : 'text-[#6B7280]'}`}>
                    {c === "All" ? "All Cities" : c}
                  </button>
                ))}
              </div>
            </div>

            {/* Category filter */}
            <div className="px-4 mb-4 flex gap-2">
              {(["All", "Light", "Medium"] as const).map(cat => (
                <button key={cat} onClick={() => setLoadCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${loadCategory === cat ? 'bg-[#E10600] text-white border-[#E10600]' : 'bg-white text-[#6B7280] border-[#E2E6EB]'}`}>
                  {cat === "All" ? "All Loads" : cat === "Light" ? "Light (< 500 Kg)" : "Medium (500+ Kg)"}
                </button>
              ))}
            </div>

            {/* Count */}
            <div className="px-4 mb-3">
              <p className="text-[11px] font-bold text-[#6B7280]">
                <span className="text-[#111827] font-black">{filteredLoads.length}</span> loads found
              </p>
            </div>

            {/* Load cards */}
            <motion.div
              className="px-4 flex flex-col gap-3"
              variants={staggerContainer} initial="hidden" animate="show"
            >
              {filteredLoads.map((load, idx) => {
                const cargoColors: Record<string, string> = {
                  "Electronics": "#3B82F6", "FMCG Goods": "#10B981", "Pharma Boxes": "#8B5CF6",
                  "Textile Rolls": "#F59E0B", "Grocery": "#10B981", "Hardware Items": "#6B7280",
                  "Chemical Drums": "#EF4444", "Auto Parts": "#F97316", "Garments": "#EC4899",
                  "Dairy Products": "#06B6D4", "Office Supplies": "#6366F1", "Fresh Produce": "#22C55E",
                };
                const color = cargoColors[(load as any).cargo] || "#E10600";
                return (
                  <motion.div key={load.id} variants={fadeSlideUp}
                    whileHover={{ y: -2, boxShadow: '0 6px 20px rgba(0,0,0,0.10)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    className="bg-white rounded-3xl border border-[#ECEEF1] overflow-hidden"
                    style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                    <div className="p-4">
                      {/* Route row */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '18' }}>
                            <MapPin size={12} style={{ color }} />
                          </div>
                          <span className="text-[13px] font-black text-[#111827] truncate" style={{ fontFamily: "'Archivo', sans-serif" }}>
                            {load.from}
                          </span>
                          <ArrowLeftRight size={11} className="text-[#9CA3AF] flex-shrink-0" />
                          <span className="text-[13px] font-black text-[#111827] truncate" style={{ fontFamily: "'Archivo', sans-serif" }}>
                            {load.to}
                          </span>
                        </div>
                        <span className={`text-[9px] font-black rounded-full px-2 py-0.5 flex-shrink-0 ${
                          load.available === "Today" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {load.available}
                        </span>
                      </div>

                      {/* Info chips */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <span className="flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-1 border"
                          style={{ background: color + '12', color, borderColor: color + '30' }}>
                          {load.cargo}
                        </span>
                        <span className="text-[10px] font-bold text-[#6B7280] bg-[#F7F8FA] rounded-full px-2.5 py-1 border border-[#ECEEF1]">
                          {load.weight}
                        </span>
                        <span className="text-[10px] font-bold text-[#6B7280] bg-[#F7F8FA] rounded-full px-2.5 py-1 border border-[#ECEEF1]">
                          {load.distance}
                        </span>
                      </div>

                      {/* Rate + Book row */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-wide">Freight Rate</p>
                          <p className="text-lg font-black text-[#E10600]" style={{ fontFamily: "'Archivo', sans-serif" }}>{load.rate}</p>
                        </div>
                        <motion.button onClick={() => setSelectedLoad(load)}
                          whileTap={{ scale: 0.90 }} transition={springTap}
                          className="bg-[#111827] text-white rounded-2xl px-5 py-2.5 text-xs font-black">
                          Book Load
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {filteredLoads.length === 0 && (
                <div className="py-12 text-center text-[#6B7280] text-sm font-medium">
                  No loads found for selected filters.
                </div>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Load detail sheet */}
        {selectedLoad && (
          <LoadDetailSheet load={selectedLoad} onClose={() => setSelectedLoad(null)} sessionName={session.name} driverId={String(session.userId)} />
        )}

        {/* ── MY LOGS SCREEN ───────────────────────────────────────────────────── */}
        {activeModule === 'logs' && (
          <motion.div
            className="pb-36 px-4 pt-4"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setActiveModule(null)} className="w-9 h-9 rounded-full bg-white border border-[#E2E6EB] flex items-center justify-center shadow-sm">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <div>
                <h2 className="text-[18px] font-black text-[#111827]" style={{ fontFamily: "'Archivo', sans-serif" }}>
                  {lang === 'hi' ? 'मेरे लॉग' : lang === 'gu' ? 'મારા લૉગ' : 'My Fill Logs'}
                </h2>
                <p className="text-[11px] text-[#9CA3AF] font-medium">{session.name}</p>
              </div>
            </div>

            {/* Summary cards */}
            {(() => {
              const totalKgs = fills.reduce((s: number, f: any) => s + f.kgs, 0);
              const totalAmt = fills.reduce((s: number, f: any) => s + (f.total || 0), 0);
              const walletBal = fills.reduce((s: number, f: any) => s + Math.floor(f.kgs), 0);
              const now = new Date();
              const monthFills = fills.filter((f: any) => {
                const d = new Date(f.time);
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
              });
              const monthKgs = monthFills.reduce((s: number, f: any) => s + f.kgs, 0);
              const monthAmt = monthFills.reduce((s: number, f: any) => s + (f.total || 0), 0);
              return (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white rounded-2xl border border-[#ECEEF1] p-4 text-center" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase tracking-wider mb-1">Total Fills</p>
                      <p className="text-[26px] font-black text-[#111827]">{fills.length}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-[#ECEEF1] p-4 text-center" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase tracking-wider mb-1">Total CNG</p>
                      <p className="text-[26px] font-black text-[#111827]">{totalKgs.toFixed(1)}<span className="text-sm font-medium"> Kg</span></p>
                    </div>
                    <div className="bg-white rounded-2xl border border-[#ECEEF1] p-4 text-center" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <p className="text-[10px] text-[#9CA3AF] font-semibold uppercase tracking-wider mb-1">Total Spent</p>
                      <p className="text-[22px] font-black text-[#111827]">₹{totalAmt.toLocaleString()}</p>
                    </div>
                    <div className="rounded-2xl p-4 text-center" style={{ background: 'linear-gradient(135deg, #4338ca, #3730a3)', boxShadow: '0 4px 16px rgba(67,56,202,0.3)' }}>
                      <p className="text-[10px] text-white/70 font-semibold uppercase tracking-wider mb-1">Wallet Balance</p>
                      <p className="text-[22px] font-black text-white">₹{walletBal}</p>
                    </div>
                  </div>

                  {/* This month */}
                  <div className="bg-[#FFF7ED] rounded-2xl border border-[#FED7AA] px-4 py-3 mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-[#92400E] uppercase tracking-wider mb-0.5">This Month</p>
                      <p className="text-[13px] font-black text-[#111827]">{monthFills.length} fills · {monthKgs.toFixed(1)} Kg · ₹{monthAmt.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-[#92400E] font-medium">Earned</p>
                      <p className="text-[15px] font-black text-[#4338ca]">₹{Math.round(monthKgs)}</p>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Fill history */}
            <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[2px] mb-3">Fill History</p>
            {fills.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#ECEEF1] p-8 text-center">
                <p className="text-[13px] font-semibold text-[#6B7280]">No fills recorded yet</p>
                <p className="text-[11px] text-[#9CA3AF] mt-1">Your CNG fill-ups will appear here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...fills].sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime()).map((f: any) => (
                  <div key={f.id} className="bg-white rounded-2xl border border-[#ECEEF1] px-4 py-3.5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-[#111827] truncate">{f.station}</p>
                        <p className="text-[11px] text-[#6B7280] mt-0.5">
                          {f.kgs?.toFixed(1)} Kg · {new Date(f.time).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        {f.odo && <p className="text-[10px] text-[#9CA3AF] mt-0.5">Odometer: {f.odo.toLocaleString()} km</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[13px] font-black text-[#111827]">₹{(f.total != null ? f.total : Math.round(f.kgs * 96)).toLocaleString()}</p>
                        <p className="text-[10px] font-bold text-[#4338ca] mt-0.5">+₹{Math.floor(f.kgs)} wallet</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Load Bookings */}
            {(() => {
              try {
                const myBookings: any[] = JSON.parse(localStorage.getItem('cng_load_bookings') || '[]');
                if (myBookings.length === 0) return null;
                return (
                  <div className="mt-6">
                    <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[2px] mb-3">Load Bookings</p>
                    <div className="space-y-2">
                      {myBookings.map((b: any) => (
                        <div key={b.id} className="bg-white rounded-2xl border border-[#ECEEF1] px-4 py-3.5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold text-[#111827]">{b.cargo} · {b.from} → {b.to}</p>
                              <p className="text-[11px] text-[#6B7280] mt-0.5">{b.vehicleType} · {b.rate} · {b.weight}</p>
                              <p className="text-[10px] text-[#9CA3AF] mt-0.5">{new Date(b.time).toLocaleString()}</p>
                            </div>
                            <span className={`text-[9px] font-bold rounded-full px-2 py-0.5 uppercase flex-shrink-0 mt-1 ${
                              b.status === 'approved' ? 'bg-green-100 text-green-700' :
                              b.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {b.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}
          </motion.div>
        )}

      </div>

      {/* Bottom nav — animated pill */}
      <div className="fixed bottom-0 left-0 right-0 z-30 max-w-[480px] mx-auto px-4 pb-5 pt-3">
        <motion.div
          className="bg-white rounded-[28px] px-2 py-2 flex items-center justify-around"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)' }}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32, delay: 0.15 }}
        >
          <LayoutGroup>
            {[
              { label: lang === 'hi' ? 'होम' : lang === 'gu' ? 'હોમ' : 'Home', icon: <LayoutDashboard size={18} />, action: () => setActiveModule(null), active: activeModule === null },
              { label: lang === 'hi' ? 'लॉग' : lang === 'gu' ? 'લૉગ' : 'My Logs', icon: <FileText size={18} />, action: () => setActiveModule('logs'), active: activeModule === 'logs' },
              { label: lang === 'hi' ? 'लॉगआउट' : lang === 'gu' ? 'લૉગ આઉટ' : 'Logout', icon: <LogOut size={18} />, action: handleLogout, active: false },
            ].map(({ label, icon, action, active }) => (
              <motion.button
                key={label}
                onClick={action}
                whileTap={{ scale: 0.88 }}
                transition={springTap}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full relative z-10 ${
                  active ? 'text-white' : 'text-[#9CA3AF]'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-full z-[-1]"
                    style={{ background: 'linear-gradient(135deg, #c20000 0%, #E10600 100%)', boxShadow: '0 4px 14px rgba(225,6,0,0.35)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                  />
                )}
                <motion.span
                  animate={{ scale: active ? 1.1 : 1 }}
                  transition={springTap}
                >{icon}</motion.span>
                <AnimatePresence mode="wait">
                  {active && (
                    <motion.span
                      key={label}
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                      className="text-[12px] font-black leading-none overflow-hidden whitespace-nowrap"
                      style={{ fontFamily: "'Archivo', sans-serif" }}
                    >{label}</motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </LayoutGroup>
        </motion.div>
      </div>

      {/* Geolocation/Odometer Photo Capture Modals */}
      {showTripCamera && (
        <CameraModal
          mode="photo"
          title={t('captureOdoTitle', lang)}
          onCapture={(cap) => {
            setOdoPhoto(cap.dataUrl)
            setShowTripCamera(null)
          }}
          onClose={() => setShowTripCamera(null)}
          lang={lang}
        />
      )}

      {showRedeem && (
        <RedeemSheet
          onClose={() => setShowRedeem(false)}
          fills={fills}
          session={session}
          vehicle={vehicle}
        />
      )}

      {/* Driver Notifications Log Modal */}
      {showNotificationsLog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowNotificationsLog(false)}>
          <div className="bg-white rounded-t-[32px] sm:rounded-[24px] border-t sm:border border-[#E2E6EB] p-6 w-full max-w-[480px] shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-[#E2E6EB] pb-3">
              <div>
                <h3 className="text-[16px] font-extrabold text-[#111827]">
                  {localNotifTranslations[lang]?.notifications || 'Notifications'}
                </h3>
                <p className="text-[11px] font-bold text-[#6B7280]">
                  {unreadDriverNotifsCount} unread
                </p>
              </div>
              <div className="flex gap-2">
                {unreadDriverNotifsCount > 0 && (
                  <button 
                    onClick={() => {
                      const allUnreadIds = driverNotifications.filter((n: Notification) => !readNotifIds.includes(n.id)).map((n: Notification) => n.id);
                      const updated = [...readNotifIds, ...allUnreadIds];
                      setReadNotifIds(updated);
                      localStorage.setItem('cng_read_notifs_' + String(session.userId), JSON.stringify(updated));
                      window.dispatchEvent(new Event('storage'));
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-[#DBEAFE] text-[#1E40AF] text-[10px] font-bold"
                  >
                    {localNotifTranslations[lang]?.markAllRead || 'Mark all read'}
                  </button>
                )}
                <button onClick={() => setShowNotificationsLog(false)} className="w-8 h-8 hover:bg-[#F5F6F8] rounded-full flex items-center justify-center text-[#6B7280] font-bold">
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[50vh] pr-1">
              {driverNotifications.length === 0 ? (
                <div className="py-12 text-center text-[#6B7280] text-[12px] font-medium">
                  <span className="text-[24px] block mb-2">🔔</span> {localNotifTranslations[lang]?.noNotifications || 'No notifications'}
                </div>
              ) : (
                driverNotifications.slice().reverse().map((n: Notification) => {
                  const isRead = readNotifIds.includes(n.id);
                  return (
                    <div 
                      key={n.id} 
                      className={`p-3.5 rounded-2xl border text-[11px] transition-all ${
                        isRead ? 'bg-white border-[#E2E6EB]' : 'bg-[#FFFBEB] border-[#FDE68A] shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              n.severity === 'critical' ? 'bg-[#FEE2E2] text-[#991B1B]' : 
                              n.severity === 'warning' ? 'bg-[#FEF3C7] text-[#92400E]' : 
                              'bg-[#DBEAFE] text-[#1E40AF]'
                            }`}>
                              {localNotifTranslations[lang]?.[n.severity] || n.severity}
                            </span>
                            {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-[#E10600]" />}
                          </div>
                          <p className="font-bold text-[#111827] text-[12px] leading-snug break-words">{n.message}</p>
                          <p className="text-[9px] font-medium text-[#6B7280] mt-2">
                            {new Date(n.timestamp).toLocaleString()}
                          </p>
                        </div>
                        {!isRead && (
                          <button 
                            onClick={() => {
                              const updated = [...readNotifIds, n.id];
                              setReadNotifIds(updated);
                              localStorage.setItem('cng_read_notifs_' + String(session.userId), JSON.stringify(updated));
                              window.dispatchEvent(new Event('storage'));
                            }}
                            className="shrink-0 px-2.5 py-1.5 bg-white border border-[#E2E6EB] hover:bg-[#F5F6F8] text-[9px] font-extrabold text-[#4B5563] rounded-lg transition-colors"
                          >
                            {localNotifTranslations[lang]?.markRead || 'Read'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button 
              onClick={() => setShowNotificationsLog(false)}
              className="w-full mt-4 h-12 bg-[#111827] hover:bg-black text-white text-[13px] font-bold rounded-2xl transition-colors mb-2 sm:mb-0"
            >
              {localNotifTranslations[lang]?.close || 'Close'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

