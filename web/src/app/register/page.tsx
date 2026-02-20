"use client";

import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, UserPlus, Smartphone, KeyRound, Lock, Mail, ChevronRight, AlertCircle } from "lucide-react";

import { verifyAliyunCaptcha } from "@/lib/auth/aliyun-captcha";
import { api } from "@/lib/api/client";
import { useLegalDocumentModal } from "@/components/legal/use-legal-document-modal";
import { markAuthPersistence } from "@/lib/auth/remember-me";

type RegisterTab = "phone" | "email";

function normalizePhone(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

function getPasswordScore(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

function getPasswordStrengthLabel(score: number): string {
  if (score <= 1) return "弱";
  if (score === 2) return "中";
  if (score === 3) return "较强";
  return "强";
}

export default function RegisterPage() {
  const router = useRouter();
  const { legalDocs, openLegalDocument, legalDocumentModal } = useLegalDocumentModal();
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<RegisterTab>("phone");
  
  // Phone registration state
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsChallengeId, setSmsChallengeId] = useState("");
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [password, setPassword] = useState("");
  
  // Email registration state
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Common state
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");
  const submitLockRef = useRef(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    void router.prefetch("/chat");
  }, [router]);

  useEffect(() => {
    if (smsCountdown <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setSmsCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [smsCountdown]);

  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = normalizeEmail(email);
  const canSendSms = normalizedPhone.length >= 11 && smsCountdown <= 0 && !sendingSms;
  
  const passwordScore = getPasswordScore(activeTab === "phone" ? password : emailPassword);
  const strengthLabel = getPasswordStrengthLabel(passwordScore);

  // Phone registration validation
  const canSubmitPhone = useMemo(
    () =>
      !submitting &&
      !redirecting &&
      agreed &&
      normalizedPhone.length >= 11 &&
      smsCode.trim().length >= 4 &&
      smsChallengeId.length > 0 &&
      password.length >= 6,
    [agreed, normalizedPhone.length, password.length, redirecting, smsChallengeId.length, smsCode, submitting]
  );

  // Email registration validation
  const canSubmitEmail = useMemo(
    () =>
      !submitting &&
      !redirecting &&
      agreed &&
      isValidEmail(normalizedEmail) &&
      emailPassword.length >= 6 &&
      emailPassword === confirmPassword,
    [agreed, confirmPassword, emailPassword, normalizedEmail, redirecting, submitting]
  );

  const canSubmit = activeTab === "phone" ? canSubmitPhone : canSubmitEmail;

  const resolveCommonError = (err: unknown): string => {
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        return "网络连接失败，请检查网络后重试";
      }
      if (err.response.status === 429) {
        return "操作过于频繁，请稍后再试";
      }
      const detail = err.response.data?.detail;
      if (typeof detail === "string" && detail.trim()) {
        return detail;
      }
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0];
        if (typeof first === "string" && first.trim()) {
          return first;
        }
        if (
          typeof first === "object" &&
          first !== null &&
          "msg" in first &&
          typeof (first as { msg?: unknown }).msg === "string"
        ) {
          return (first as { msg: string }).msg;
        }
      }
      if (typeof err.response.data?.message === "string" && err.response.data.message.trim()) {
        return err.response.data.message;
      }
      return "注册失败，请稍后重试";
    }
    if (err instanceof Error) {
      return err.message || "注册失败，请稍后重试";
    }
    return "注册失败，请稍后重试";
  };

  const handleSendSms = async () => {
    if (!canSendSms) {
      return;
    }
    setError("");
    setSendingSms(true);
    try {
      const captchaVerifyParam = await verifyAliyunCaptcha("sms");
      const result = await api.sendSmsCode({
        phone: normalizedPhone,
        scene: "register",
        captcha_verify_param: captchaVerifyParam,
      });
      setSmsChallengeId(result.sms_challenge_id);
      setSmsCountdown(result.retry_after_sec);
    } catch (err) {
      setError(resolveCommonError(err));
    } finally {
      setSendingSms(false);
    }
  };

  const handlePhoneSubmit = async (captchaVerifyParam: string) => {
    await api.register({
      phone: normalizedPhone,
      sms_challenge_id: smsChallengeId,
      sms_code: smsCode.trim(),
      password,
      captcha_verify_param: captchaVerifyParam,
    });
  };

  const handleEmailSubmit = async (captchaVerifyParam: string) => {
    await api.registerWithEmail({
      email: normalizedEmail,
      password: emailPassword,
      captcha_verify_param: captchaVerifyParam,
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLockRef.current || !canSubmit) {
      return;
    }
    submitLockRef.current = true;
    let succeeded = false;
    setError("");
    setSubmitting(true);
    try {
      const captchaVerifyParam = await verifyAliyunCaptcha("register");
      if (activeTab === "phone") {
        await handlePhoneSubmit(captchaVerifyParam);
      } else {
        await handleEmailSubmit(captchaVerifyParam);
      }
      markAuthPersistence(false);
      succeeded = true;
      setRedirecting(true);
      router.replace("/chat");
    } catch (err) {
      setError(resolveCommonError(err));
    } finally {
      if (!succeeded) {
        submitLockRef.current = false;
        setSubmitting(false);
      }
    }
  };

  const isPhoneMode = activeTab === "phone";

  return (
    <main className="relative min-h-screen bg-[#F8FAFC] overflow-x-hidden">
      {/* Background Elements - 与主页一致 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-blue-100/60 to-transparent rounded-full blur-[100px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-indigo-100/40 to-transparent rounded-full blur-[80px]" />
      </div>

      {/* Navigation - 与主页一致 */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
        <div className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#2563EB] to-[#3B82F6] rounded-lg flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-semibold text-[#1E293B]">二次元情感陪伴助手</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-[#475569] bg-white border border-slate-200 rounded-lg hover:border-[#2563EB]/30 hover:bg-slate-50 transition-colors duration-200"
          >
            登录账号
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative pt-24 pb-12 px-4">
        <div className="mx-auto w-full max-w-md">
          <section className={`bg-white rounded-2xl border border-slate-200 p-8 shadow-lg transition-all duration-500 ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <header className="mb-8 text-center">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#3B82F6] shadow-md">
                <UserPlus className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-[#1E293B]">创建账号</h1>
              <p className="mt-2 text-sm text-[#64748B]">开启与角色的专属陪伴</p>
            </header>

            {/* Tab Switcher */}
            <div className="relative mb-6 rounded-lg bg-slate-100 p-1">
              <div
                className="absolute inset-y-1 rounded-md bg-white shadow-sm transition-all duration-200"
                style={{ left: isPhoneMode ? "4px" : "50%", width: "calc(50% - 4px)" }}
              />
              <div className="relative grid grid-cols-2">
                <button
                  type="button"
                  className={`relative z-10 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${isPhoneMode ? "text-[#2563EB]" : "text-[#64748B] hover:text-[#475569]"}`}
                  onClick={() => setActiveTab("phone")}
                >
                  手机号注册
                </button>
                <button
                  type="button"
                  className={`relative z-10 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${!isPhoneMode ? "text-[#2563EB]" : "text-[#64748B] hover:text-[#475569]"}`}
                  onClick={() => setActiveTab("email")}
                >
                  邮箱注册
                </button>
              </div>
            </div>

            <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
              <input
                type="text"
                name="username"
                autoComplete="username"
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only pointer-events-none absolute opacity-0"
                value={isPhoneMode ? normalizedPhone : normalizedEmail}
                readOnly
              />

              {isPhoneMode ? (
                <>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[#475569]">手机号</span>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                      <input
                        className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-3 text-base outline-none transition-all duration-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
                        placeholder="请输入手机号"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        autoComplete="tel"
                      />
                    </div>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[#475569]">验证码</span>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                        <input
                          type="text"
                          className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-3 text-base outline-none transition-all duration-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
                          placeholder="请输入短信验证码"
                          value={smsCode}
                          onChange={(event) => setSmsCode(event.target.value)}
                          autoComplete="one-time-code"
                          inputMode="numeric"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={!canSendSms}
                        onClick={() => void handleSendSms()}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-[#64748B] transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        {sendingSms ? "发送中..." : smsCountdown > 0 ? `${smsCountdown}s` : "获取验证码"}
                      </button>
                    </div>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[#475569]">设置密码</span>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                      <input
                        type="password"
                        className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-3 text-base outline-none transition-all duration-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
                        placeholder="请输入至少 6 位密码"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </label>
                </>
              ) : (
                <>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[#475569]">邮箱</span>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                      <input
                        type="email"
                        className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-3 text-base outline-none transition-all duration-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
                        placeholder="请输入邮箱地址"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                      />
                    </div>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[#475569]">设置密码</span>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                      <input
                        type="password"
                        className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-3 text-base outline-none transition-all duration-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
                        placeholder="请输入至少 6 位密码"
                        value={emailPassword}
                        onChange={(event) => setEmailPassword(event.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[#475569]">确认密码</span>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                      <input
                        type="password"
                        className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-3 text-base outline-none transition-all duration-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
                        placeholder="请再次输入密码"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    {confirmPassword && emailPassword !== confirmPassword && (
                      <span className="text-xs text-rose-500">两次输入的密码不一致</span>
                    )}
                  </label>
                </>
              )}

              {/* Password Strength Indicator */}
              {((isPhoneMode && password) || (!isPhoneMode && emailPassword)) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#64748B]">
                    <span>密码强度</span>
                    <span className={`font-medium ${passwordScore <= 1 ? 'text-rose-500' : passwordScore === 2 ? 'text-amber-500' : 'text-emerald-500'}`}>{strengthLabel}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${passwordScore <= 1 ? 'bg-rose-400' : passwordScore === 2 ? 'bg-amber-400' : passwordScore === 3 ? 'bg-blue-400' : 'bg-emerald-400'}`}
                      style={{ width: `${(passwordScore / 4) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <label className="flex items-start gap-3 text-sm text-[#475569] cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>
                  我已阅读并同意《
                  <a
                    href={legalDocs.terms.href}
                    className="text-[#2563EB] underline-offset-2 hover:text-[#1D4ED8] hover:underline"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void openLegalDocument("terms");
                    }}
                  >
                    服务条款
                  </a>
                  》《
                  <a
                    href={legalDocs.privacy.href}
                    className="text-[#2563EB] underline-offset-2 hover:text-[#1D4ED8] hover:underline"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void openLegalDocument("privacy");
                    }}
                  >
                    隐私政策
                  </a>
                  》
                </span>
              </label>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-lg bg-[#2563EB] px-4 py-3.5 text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#1D4ED8] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-md"
              >
                {redirecting ? "注册成功，正在进入..." : submitting ? "注册中..." : "注册"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[#64748B]">
              已有账号？
              <Link className="ml-1 font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors" href="/login">
                去登录
              </Link>
            </p>
          </section>
        </div>
      </div>
      {legalDocumentModal}
    </main>
  );
}
