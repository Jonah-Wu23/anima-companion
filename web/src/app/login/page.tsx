"use client";

import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Shield, Smartphone, Lock, KeyRound, ChevronRight, AlertCircle } from "lucide-react";

import { verifyAliyunCaptcha } from "@/lib/auth/aliyun-captcha";
import { api } from "@/lib/api/client";

type LoginTab = "password" | "sms";

function normalizePhone(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

export default function LoginPage() {
  const router = useRouter();
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<LoginTab>("password");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsChallengeId, setSmsChallengeId] = useState("");
  const [smsCountdown, setSmsCountdown] = useState(0);
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

  const isPasswordMode = activeTab === "password";
  const accountPhone = normalizePhone(account);
  const canSendSms = accountPhone.length >= 11 && smsCountdown <= 0 && !sendingSms;
  const canSubmit = useMemo(() => {
    if (submitting || redirecting || !account.trim()) {
      return false;
    }
    if (isPasswordMode) {
      return password.length >= 6;
    }
    return smsCode.trim().length >= 4 && smsChallengeId.length > 0;
  }, [account, isPasswordMode, password.length, redirecting, smsChallengeId.length, smsCode, submitting]);

  const resolveCommonError = (err: unknown): string => {
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        return "网络连接失败，请检查网络后重试";
      }
      if (err.response.status === 429) {
        return "操作过于频繁，请稍后再试";
      }
      const detail = typeof err.response.data?.detail === "string" ? err.response.data.detail : "";
      if (detail) {
        return detail;
      }
      return "账号或密码错误，请重试";
    }
    if (err instanceof Error) {
      return err.message || "请求失败，请稍后重试";
    }
    return "请求失败，请稍后重试";
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
        phone: accountPhone,
        scene: "login",
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
      if (isPasswordMode) {
        const captchaVerifyParam = await verifyAliyunCaptcha("login");
        await api.loginWithPassword({
          account: account.trim(),
          password,
          captcha_verify_param: captchaVerifyParam,
        });
      } else {
        if (!smsChallengeId) {
          throw new Error("请先获取短信验证码");
        }
        const captchaVerifyParam = await verifyAliyunCaptcha("login");
        await api.loginWithSms({
          phone: accountPhone,
          sms_challenge_id: smsChallengeId,
          sms_code: smsCode.trim(),
          captcha_verify_param: captchaVerifyParam,
        });
      }
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
            href="/register"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-[#1E293B] rounded-lg hover:bg-[#334155] transition-colors duration-200 shadow-sm"
          >
            注册账号
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative pt-24 pb-12 px-4">
        <div className="mx-auto w-full max-w-md">
          <section className={`bg-white rounded-2xl border border-slate-200 p-8 shadow-lg transition-all duration-500 ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <header className="mb-8 text-center">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#3B82F6] shadow-md">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-[#1E293B]">欢迎回来</h1>
              <p className="mt-2 text-sm text-[#64748B]">登录你的白厄账号</p>
            </header>

            <div className="relative mb-6 rounded-lg bg-slate-100 p-1">
              <div
                className="absolute inset-y-1 rounded-md bg-white shadow-sm transition-all duration-200"
                style={{ left: isPasswordMode ? "4px" : "50%", width: "calc(50% - 4px)" }}
              />
              <div className="relative grid grid-cols-2">
                <button
                  type="button"
                  className={`relative z-10 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${isPasswordMode ? "text-[#2563EB]" : "text-[#64748B] hover:text-[#475569]"}`}
                  onClick={() => setActiveTab("password")}
                >
                  密码登录
                </button>
                <button
                  type="button"
                  className={`relative z-10 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${!isPasswordMode ? "text-[#2563EB]" : "text-[#64748B] hover:text-[#475569]"}`}
                  onClick={() => setActiveTab("sms")}
                >
                  短信登录
                </button>
              </div>
            </div>

            <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[#475569]">手机号/用户名</span>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-3 text-base outline-none transition-all duration-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
                    placeholder="请输入手机号或用户名"
                    value={account}
                    onChange={(event) => setAccount(event.target.value)}
                    autoComplete="username"
                  />
                </div>
              </label>

              {isPasswordMode ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[#475569]">密码</span>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                    <input
                      type="password"
                      className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-3 text-base outline-none transition-all duration-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
                      placeholder="请输入密码"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                </label>
              ) : (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[#475569]">短信验证码</span>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                      <input
                        className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-3 text-base outline-none transition-all duration-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
                        placeholder="请输入短信验证码"
                        value={smsCode}
                        onChange={(event) => setSmsCode(event.target.value)}
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
              )}

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
                {redirecting ? "登录成功，正在进入..." : submitting ? "登录中..." : "登录"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[#64748B]">
              还没有账号？
              <Link className="ml-1 font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors" href="/register">
                去注册
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
