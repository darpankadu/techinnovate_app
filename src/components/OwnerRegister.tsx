import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Building2, Mail, Phone, Lock, User, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { storage } from '../lib/storage'
import { firestoreSync } from '../lib/firestoreSync'
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
  const [otp, setOtp] = useState('')
  const [resendTimer, setResendTimer] = useState(0)
  const [otpLoading, setOtpLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const timerRef = useRef<any>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {}
    if (!form.name.trim()) newErrors.name = t('nameRequired', lang)
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) newErrors.email = t('emailRequired', lang)
    if (!form.phone.match(/^\d{10}$/)) newErrors.phone = t('phoneRequired', lang)
    if (!form.business.trim()) newErrors.business = t('businessRequired', lang)
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateStep3 = () => {
    const newErrors: Record<string, string> = {}
    if (form.password.length < 8) {
      newErrors.password = t('passLengthError', lang)
    } else if (!/[a-z]/.test(form.password)) {
      newErrors.password = t('passLowercaseError', lang)
    } else if (!/[A-Z]/.test(form.password)) {
      newErrors.password = t('passUppercaseError', lang)
    } else if (!/[0-9]/.test(form.password)) {
      newErrors.password = t('passNumberError', lang)
    } else if (!/[^a-zA-Z0-9]/.test(form.password)) {
      newErrors.password = t('passSpecialError', lang)
    }
    if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = t('passMatchError', lang)
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const startResendTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    setResendTimer(60)
    timerRef.current = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          timerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleSendOTP = async () => {
    setOtpLoading(true)
    setErrors({})
    try {
      const res = await firestoreSync.sendOTP(form.email)
      if (res.success) {
        startResendTimer()
        setStep(2)
      } else {
        setErrors({ email: res.error || t('registrationFailed', lang) })
      }
    } catch (err: any) {
      setErrors({ email: t('registrationFailed', lang) + ': ' + err.toString() })
    } finally {
      setOtpLoading(false)
    }
  }

  const handleVerifyOTP = async () => {
    if (!otp.trim() || otp.trim().length !== 6) {
      setErrors({ otp: t('otpLengthError', lang) })
      return
    }
    setOtpLoading(true)
    setErrors({})
    try {
      const res = await firestoreSync.verifyOTP(form.email, otp)
      if (res.success) {
        setStep(3)
      } else {
        setErrors({ otp: res.error || t('otpInvalidError', lang) })
      }
    } catch (err: any) {
      setErrors({ otp: t('verificationFailed', lang) + err.toString() })
    } finally {
      setOtpLoading(false)
    }
  }

  const handleNext = async () => {
    if (step === 1 && validateStep1()) {
      await handleSendOTP()
    }
  }

  const handleRegister = async () => {
    if (!validateStep3()) return
    
    setLoading(true)
    try {
      const ownerData = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        business: form.business,
        password: form.password
      };

      const res = await firestoreSync.registerOwner(ownerData);

      if (res.success && res.id) {
        const sessionObj = { role: 'owner' as const, userId: res.id, ownerId: res.id, name: form.name };
        storage.setSession(sessionObj);
        setSession(sessionObj);
        setView('owner-dash');
      } else {
        setErrors({ email: res.error || t('registrationFailed', lang) });
        setStep(1);
      }
    } catch (e) {
      setErrors({ email: t('registrationFailed', lang) });
    } finally {
      setLoading(false);
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
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight">{t('createOwnerAccount', lang)}</h1>
          <p className="text-slate-600 mt-1">{t('manageFleetDesc', lang)}</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                i < step ? 'bg-green-500 text-white' : 
                i === step ? 'bg-blue-600 text-white' : 
                'bg-slate-200 text-slate-500'
              }`}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i}
              </div>
              {i < 3 && <div className={`w-12 h-0.5 ${i < step ? 'bg-green-500' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-[24px] shadow-xl shadow-slate-200/50 border border-slate-200/50 p-8">
          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">{t('fullName', lang)}</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    placeholder={t('fullNamePlaceholder', lang)}
                    className={`w-full h-11 pl-10 pr-3 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all ${
                      errors.name ? 'border-red-300 focus:border-red-500 bg-red-50/50' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                </div>
                {errors.name && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.name}</p>}
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">{t('emailAddress', lang)}</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({...form, email: e.target.value})}
                    placeholder={t('emailPlaceholder', lang)}
                    className={`w-full h-11 pl-10 pr-3 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all ${
                      errors.email ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                </div>
                {errors.email && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.email}</p>}
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">{t('phoneNumber', lang)}</label>
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
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">{t('businessName', lang)}</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={form.business}
                    onChange={e => setForm({...form, business: e.target.value})}
                    placeholder={t('businessPlaceholder', lang)}
                    className={`w-full h-11 pl-10 pr-3 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all ${
                      errors.business ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                </div>
                {errors.business && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.business}</p>}
              </div>

              <button
                onClick={handleNext}
                disabled={otpLoading}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl mt-2 transition-colors flex items-center justify-center gap-2"
              >
                {otpLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('sendingCode', lang)}
                  </>
                ) : (
                  t('continue', lang)
                )}
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="text-center pb-2">
                <p className="text-sm text-slate-600">
                  {t('verificationCodeSentText', lang)}
                  <br />
                  <span className="font-semibold text-slate-800">{form.email}</span>
                </p>
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">{t('verificationCode', lang)}</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={t('enterOtp', lang)}
                    className={`w-full h-11 pl-10 pr-3 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all tracking-[0.2em] font-mono text-center ${
                      errors.otp ? 'border-red-300 focus:border-red-500 bg-red-50/50' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                </div>
                {errors.otp && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.otp}</p>}
              </div>

              <div className="text-center">
                {resendTimer > 0 ? (
                  <p className="text-xs text-slate-500 font-medium">
                    {t('resendCodeIn', lang).replace('{time}', resendTimer.toString())}
                  </p>
                ) : (
                  <button
                    onClick={handleSendOTP}
                    disabled={otpLoading}
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold disabled:opacity-50"
                  >
                    {t('resendCode', lang)}
                  </button>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 h-11 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors"
                >
                  {t('back', lang)}
                </button>
                <button
                  onClick={handleVerifyOTP}
                  disabled={otpLoading}
                  className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {otpLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t('verifying', lang)}
                    </>
                  ) : (
                    t('verifyCode', lang)
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="text-center pb-2">
                <p className="text-sm text-slate-600">{t('secureAccountText', lang)}</p>
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">{t('password', lang)}</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={e => setForm({...form, password: e.target.value})}
                    placeholder={t('passwordPlaceholder', lang)}
                    className={`w-full h-11 pl-10 pr-10 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all ${
                      errors.password ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.password}</p>}
                
                {/* Visual password requirement guidelines */}
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className={`flex items-center gap-1.5 transition-colors ${form.password.length >= 8 ? 'text-green-600 font-medium' : 'text-slate-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${form.password.length >= 8 ? 'bg-green-500' : 'bg-slate-300'}`} />
                    {t('min8Chars', lang)}
                  </div>
                  <div className={`flex items-center gap-1.5 transition-colors ${/[A-Z]/.test(form.password) ? 'text-green-600 font-medium' : 'text-slate-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(form.password) ? 'bg-green-500' : 'bg-slate-300'}`} />
                    {t('oneUppercase', lang)}
                  </div>
                  <div className={`flex items-center gap-1.5 transition-colors ${/[a-z]/.test(form.password) ? 'text-green-600 font-medium' : 'text-slate-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${/[a-z]/.test(form.password) ? 'bg-green-500' : 'bg-slate-300'}`} />
                    {t('oneLowercase', lang)}
                  </div>
                  <div className={`flex items-center gap-1.5 transition-colors ${/[0-9]/.test(form.password) ? 'text-green-600 font-medium' : 'text-slate-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(form.password) ? 'bg-green-500' : 'bg-slate-300'}`} />
                    {t('oneNumber', lang)}
                  </div>
                  <div className={`flex items-center gap-1.5 col-span-2 transition-colors ${/[^A-Za-z0-9]/.test(form.password) ? 'text-green-600 font-medium' : 'text-slate-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${/[^A-Za-z0-9]/.test(form.password) ? 'bg-green-500' : 'bg-slate-300'}`} />
                    {t('oneSpecialChar', lang)}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">{t('confirmPassword', lang)}</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={e => setForm({...form, confirmPassword: e.target.value})}
                    placeholder={t('confirmPasswordPlaceholder', lang)}
                    className={`w-full h-11 pl-10 pr-10 bg-slate-50 border rounded-xl text-[15px] outline-none transition-all ${
                      errors.confirmPassword ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.confirmPassword}</p>}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 h-11 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors"
                >
                  {t('back', lang)}
                </button>
                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t('creating', lang)}
                    </>
                  ) : (
                    t('createAccount', lang)
                  )}
                </button>
              </div>
            </motion.div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-600">
              {t('alreadyHaveAccount', lang)}{' '}
              <button onClick={() => setView('owner-login')} className="text-blue-600 hover:text-blue-700 font-medium">
                {t('signIn', lang)}
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          {t('agreeTermsPolicy', lang)}
        </p>
      </motion.div>
    </div>
  )
}