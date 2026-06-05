import { useState } from 'react'
import { motion } from 'framer-motion'
import { Building2, Mail, Phone, Lock, User, CheckCircle2, AlertCircle } from 'lucide-react'
import { storage } from '../lib/storage'
import { googleSync } from '../lib/googleSync'
import type { Language } from '../lib/types'
import { t } from '../lib/translations'

export function OwnerRegister({ lang, setView, setSession }: { 
  lang: Language
  setView: (v: any) => void
  setSession: (s: any) => void 
}) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    business: '',
    password: '',
    confirmPassword: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {}
    if (!form.name.trim()) newErrors.name = 'Name is required'
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) newErrors.email = 'Valid email required'
    if (!form.phone.match(/^\d{10}$/)) newErrors.phone = '10-digit phone required'
    if (!form.business.trim()) newErrors.business = 'Business name required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {}
    if (form.password.length < 6) newErrors.password = 'Minimum 6 characters'
    if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Passwords must match'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2)
  }

  const handleRegister = async () => {
    if (!validateStep2()) return
    
    setLoading(true)
    try {
      const owners = storage.getOwners()
      
      if (owners.find(o => o.email === form.email)) {
        setErrors({ email: 'Email already registered' })
        return
      }

      // Generate consistent ID format (e.g., own_sarvam_001)
      const cleanPrefix = form.business.trim().toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '') || 'owner'
      let seq = 1
      owners.forEach(o => {
        const match = String(o.id).match(new RegExp('^own_' + cleanPrefix + '_(\\d+)$'))
        if (match) {
          const num = parseInt(match[1])
          if (num >= seq) seq = num + 1
        }
      })
      const seqStr = String(seq).padStart(3, '0')
      const ownerId = `own_${cleanPrefix}_${seqStr}`

      const newOwner = {
        id: ownerId,
        name: form.name,
        email: form.email,
        phone: form.phone,
        business: form.business,
        password: form.password,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        creditLimit: 50000,
        creditUsed: 0,
        creditFrozen: false,
        totalPaid: 0,
        adminNotes: ''
      }

      storage.saveOwners([...owners, newOwner])
      await googleSync.registerOwner(newOwner)

      const session = { role: 'owner' as const, userId: newOwner.id, ownerId: newOwner.id, name: newOwner.name }
      storage.setSession(session)
      setSession(session)
      setView('owner-dash')  // BUG-037 FIX: immediate navigation, no setTimeout
    } catch (e) {
      setErrors({ email: 'Registration failed. Please try again.' })
    } finally {
      setLoading(false)  // BUG-037 FIX: always re-enable button
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[440px]"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/20 mb-4">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight">Create Owner Account</h1>
          <p className="text-slate-600 mt-1">Manage your fleet with CNG Tracker</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[1, 2].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                i < step ? 'bg-green-500 text-white' : 
                i === step ? 'bg-blue-600 text-white' : 
                'bg-slate-200 text-slate-500'
              }`}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i}
              </div>
              {i < 2 && <div className={`w-12 h-0.5 ${i < step ? 'bg-green-500' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-[24px] shadow-xl shadow-slate-200/50 border border-slate-200/50 p-8">
          {step === 1 ? (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    placeholder="Rajesh Patel"
                    className={`w-full h-11 pl-10 pr-3 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all ${
                      errors.name ? 'border-red-300 focus:border-red-500 bg-red-50/50' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                </div>
                {errors.name && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.name}</p>}
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({...form, email: e.target.value})}
                    placeholder="you@company.com"
                    className={`w-full h-11 pl-10 pr-3 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all ${
                      errors.email ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                </div>
                {errors.email && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.email}</p>}
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={form.phone}
                    onChange={e => setForm({...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                    placeholder="9876543210"
                    className={`w-full h-11 pl-10 pr-3 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all ${
                      errors.phone ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                </div>
                {errors.phone && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.phone}</p>}
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">Business Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={form.business}
                    onChange={e => setForm({...form, business: e.target.value})}
                    placeholder="Patel Transport Pvt Ltd"
                    className={`w-full h-11 pl-10 pr-3 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all ${
                      errors.business ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                </div>
                {errors.business && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.business}</p>}
              </div>

              <button
                onClick={handleNext}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl mt-2 transition-colors"
              >
                Continue
              </button>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="text-center pb-2">
                <p className="text-sm text-slate-600">Almost done! Secure your account</p>
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm({...form, password: e.target.value})}
                    placeholder="Minimum 6 characters"
                    className={`w-full h-11 pl-10 pr-3 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all ${
                      errors.password ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                </div>
                {errors.password && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.password}</p>}
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={e => setForm({...form, confirmPassword: e.target.value})}
                    placeholder="Re-enter password"
                    className={`w-full h-11 pl-10 pr-3 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all ${
                      errors.confirmPassword ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                </div>
                {errors.confirmPassword && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.confirmPassword}</p>}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 h-11 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </button>
              </div>
            </motion.div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-600">
              Already have an account?{' '}
              <button onClick={() => setView('owner-login')} className="text-blue-600 hover:text-blue-700 font-medium">
                Sign in
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          By creating an account, you agree to our Terms and Privacy Policy
        </p>
      </motion.div>
    </div>
  )
}