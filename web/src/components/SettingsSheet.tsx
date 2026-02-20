import React, { useState, useEffect } from 'react';
import { Volume2, MonitorPlay, Trash2, AlertTriangle, Info, Settings2, Crown, Shield, Mail, Smartphone, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import type { AuthIdentitiesMeResponse } from '@/lib/api/types';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { useSessionStore } from '@/lib/store/sessionStore';
import { useAuthBindStore } from '@/lib/store/authBindStore';
import { api } from '@/lib/api/client';
import { verifyAliyunCaptcha } from '@/lib/auth/aliyun-captcha';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

function normalizePhone(input: string): string {
  return input.replace(/[^0-9]/g, '');
}

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

export function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
  const router = useRouter();
  const { 
    autoPlayVoice, 
    reducedMotion, 
    vipModeEnabled,
    toggleAutoPlay,
    toggleReducedMotion,
    toggleVipMode
  } = useSettingsStore();
  
  const { clearSession } = useSessionStore();

  const handleClearHistory = () => {
    if (window.confirm('确定要清除所有会话记录吗？此操作无法撤销。\nAre you sure you want to clear all session history? This action cannot be undone.')) {
      clearSession();
      onClose();
    }
  };

  const handleVipSwitchChange = (nextChecked: boolean) => {
    if (nextChecked === vipModeEnabled) {
      return;
    }

    if (nextChecked) {
      onClose();
      router.push('/sponsor?return_to=/chat');
      return;
    }

    toggleVipMode();
  };

  // ===== 账号绑定相关状态 =====
  const [bindError, setBindError] = useState('');
  const [bindSuccess, setBindSuccess] = useState('');
  const [identities, setIdentities] = useState<AuthIdentitiesMeResponse | null>(null);
  const [loadingIdentities, setLoadingIdentities] = useState(false);
  
  // 邮箱绑定状态
  const [emailInput, setEmailInput] = useState('');
  const [bindingEmail, setBindingEmail] = useState(false);
  
  // 手机绑定状态
  const [phoneInput, setPhoneInput] = useState('');
  const [smsCodeInput, setSmsCodeInput] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sendingSms, setSendingSms] = useState(false);
  const [bindingPhone, setBindingPhone] = useState(false);

  const smsChallengeId = useAuthBindStore((state) => state.phone_sms_challenge_id);
  const smsChallengeTarget = useAuthBindStore((state) => state.phone_sms_target);
  const smsRetryUntilMs = useAuthBindStore((state) => state.phone_sms_retry_until_ms);
  const setPhoneSmsChallenge = useAuthBindStore((state) => state.setPhoneSmsChallenge);
  const clearPhoneSmsChallenge = useAuthBindStore((state) => state.clearPhoneSmsChallenge);

  // 获取当前绑定状态
  const fetchIdentities = async () => {
    setLoadingIdentities(true);
    try {
      const data = await api.getIdentitiesMe();
      setIdentities(data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        router.push('/login?return_to=/chat');
      }
      // 静默失败，不影响用户体验
    } finally {
      setLoadingIdentities(false);
    }
  };

  // 当 Sheet 打开时获取绑定状态
  useEffect(() => {
    if (isOpen) {
      void fetchIdentities();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (phoneInput.trim().length > 0) {
      return;
    }
    if (smsChallengeTarget) {
      setPhoneInput(smsChallengeTarget);
    }
  }, [isOpen, phoneInput, smsChallengeTarget]);

  // 统一秒级 tick，用于跨组件生命周期倒计时显示
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const currentNow = Date.now();
    setNowMs(currentNow);
    if (smsRetryUntilMs <= currentNow) {
      return;
    }
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, smsRetryUntilMs]);

  // 清除成功/错误提示
  useEffect(() => {
    if (bindSuccess) {
      const timer = setTimeout(() => setBindSuccess(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [bindSuccess]);

  useEffect(() => {
    if (bindError) {
      const timer = setTimeout(() => setBindError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [bindError]);

  const normalizedPhone = normalizePhone(phoneInput);
  const normalizedEmail = normalizeEmail(emailInput);
  const smsCountdown = Math.max(0, Math.ceil((smsRetryUntilMs - nowMs) / 1000));
  const canSendSms = normalizedPhone.length >= 11 && smsCountdown <= 0 && !sendingSms;

  const resolveBindError = (err: unknown, type: 'email' | 'phone'): string => {
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        return '网络连接失败，请检查网络后重试';
      }
      if (err.response.status === 401) {
        // 未登录，跳转登录页
        router.push('/login?return_to=/chat');
        return '请先登录';
      }
      if (err.response.status === 429) {
        return '操作过于频繁，请稍后再试';
      }
      
      // 处理 409 冲突错误 - 提供更友好的提示
      if (err.response.status === 409) {
        const detail = typeof err.response.data?.detail === 'string' ? err.response.data.detail : '';
        const itemName = type === 'email' ? '邮箱' : '手机号';
        
        // 根据后端返回的不同冲突场景提供针对性提示
        if (detail.includes('已被其他账号绑定') || detail.includes('already bound to another')) {
          return `该${itemName}已被其他账号绑定，请使用其他${itemName}`;
        }
        if (detail.includes('当前账号已绑定其他') || detail.includes('account already has')) {
          return `您的账号已绑定其他${itemName}，如需更换请联系客服`;
        }
        if (detail.includes('已存在') || detail.includes('already exists')) {
          return `该${itemName}已被使用，请使用其他${itemName}`;
        }
        return `该${itemName}无法绑定，${detail || '请使用其他' + itemName}`;
      }
      
      const detail = typeof err.response.data?.detail === 'string' ? err.response.data.detail : '';
      if (detail) {
        // 对其他错误也做友好化处理
        if (detail.includes('格式不正确') || detail.includes('invalid format')) {
          return type === 'email' ? '邮箱格式不正确，请检查后重试' : '手机号格式不正确，请检查后重试';
        }
        if (detail.includes('人机验证') || detail.includes('captcha')) {
          return '请先完成人机验证';
        }
        return detail;
      }
      return '操作失败，请稍后重试';
    }
    if (err instanceof Error) {
      return err.message || '操作失败，请稍后重试';
    }
    return '操作失败，请稍后重试';
  };

  const handleSendSmsForBind = async () => {
    if (!canSendSms) return;
    setBindError('');
    setSendingSms(true);
    try {
      const captchaVerifyParam = await verifyAliyunCaptcha('login');
      const result = await api.sendSmsCode({
        phone: normalizedPhone,
        scene: 'login',
        captcha_verify_param: captchaVerifyParam,
      });
      setPhoneSmsChallenge({
        challengeId: result.sms_challenge_id,
        phone: normalizedPhone,
        retryAfterSec: result.retry_after_sec,
      });
    } catch (err) {
      setBindError(resolveBindError(err, 'phone'));
    } finally {
      setSendingSms(false);
    }
  };

  const handleBindEmail = async () => {
    if (!isValidEmail(normalizedEmail)) {
      setBindError('请输入有效的邮箱地址');
      return;
    }
    setBindError('');
    setBindingEmail(true);
    try {
      const captchaVerifyParam = await verifyAliyunCaptcha('login');
      await api.bindEmail({
        email: normalizedEmail,
        captcha_verify_param: captchaVerifyParam,
      });
      setBindSuccess('邮箱绑定成功！');
      setEmailInput('');
      // 刷新绑定状态
      void fetchIdentities();
    } catch (err) {
      setBindError(resolveBindError(err, 'email'));
    } finally {
      setBindingEmail(false);
    }
  };

  const handleBindPhone = async () => {
    if (normalizedPhone.length < 11) {
      setBindError('请输入有效的手机号');
      return;
    }
    if (smsCodeInput.trim().length < 4) {
      setBindError('请输入短信验证码');
      return;
    }
    if (!smsChallengeId) {
      setBindError('请先获取短信验证码');
      return;
    }
    setBindError('');
    setBindingPhone(true);
    try {
      const captchaVerifyParam = await verifyAliyunCaptcha('login');
      await api.bindPhone({
        phone: normalizedPhone,
        sms_challenge_id: smsChallengeId,
        sms_code: smsCodeInput.trim(),
        captcha_verify_param: captchaVerifyParam,
      });
      setBindSuccess('手机号绑定成功！');
      setPhoneInput('');
      setSmsCodeInput('');
      clearPhoneSmsChallenge();
      // 刷新绑定状态
      void fetchIdentities();
    } catch (err) {
      setBindError(resolveBindError(err, 'phone'));
    } finally {
      setBindingPhone(false);
    }
  };

  const canBindEmail = !bindingEmail && isValidEmail(normalizedEmail);
  const canBindPhone = !bindingPhone && normalizedPhone.length >= 11 && smsCodeInput.trim().length >= 4 && smsChallengeId.length > 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-[2.5rem] p-0 border-t-0 bg-white/80 backdrop-blur-xl shadow-2xl">
        <div className="h-full flex flex-col w-full max-w-2xl mx-auto">
            {/* 顶部手柄 - 视觉提示 */}
            <div className="w-full flex justify-center pt-4 pb-2 flex-shrink-0">
                <div className="w-12 h-1.5 bg-gray-300/60 rounded-full" />
            </div>

            {/* 标题栏 */}
            <SheetHeader className="px-6 pb-6 text-left flex-shrink-0">
                <SheetTitle className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Settings2 className="w-6 h-6 text-slate-400" />
                    设置
                </SheetTitle>
                <SheetDescription className="text-slate-500 font-medium">
                    个性化你的陪伴体验
                </SheetDescription>
            </SheetHeader>

            {/* 滚动内容区 */}
            <div className="flex-1 overflow-y-auto px-6 pb-8 space-y-8">
                
                {/* 分组：账号与安全 */}
                <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">
                        账号与安全
                    </h3>
                    <div className="bg-white/50 backdrop-blur-sm rounded-3xl p-5 border border-white/40 shadow-sm space-y-6">
                        {/* 邮箱绑定 */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                                        <Mail className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <span className="font-semibold text-slate-700">绑定邮箱</span>
                                        {loadingIdentities && (
                                            <span className="block text-xs text-slate-400">加载中...</span>
                                        )}
                                        {!loadingIdentities && identities?.email?.value && (
                                            <span className="block text-xs text-emerald-600 flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" />
                                                {identities.email.value}
                                            </span>
                                        )}
                                        {!loadingIdentities && !identities?.email?.value && (
                                            <span className="block text-xs text-slate-400">未绑定</span>
                                        )}
                                    </div>
                                </div>
                                {!loadingIdentities && identities?.email?.value && (
                                    <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full font-medium">
                                        已绑定
                                    </span>
                                )}
                            </div>
                            {!identities?.email?.value && (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="email"
                                            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                            placeholder="请输入邮箱地址"
                                            value={emailInput}
                                            onChange={(e) => setEmailInput(e.target.value)}
                                        />
                                    </div>
                                    <Button
                                        size="sm"
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-10 text-sm font-medium disabled:opacity-50"
                                        onClick={handleBindEmail}
                                        disabled={!canBindEmail}
                                    >
                                        {bindingEmail ? '绑定中...' : '绑定邮箱'}
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="border-t border-slate-100" />

                        {/* 手机号绑定 */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                                        <Smartphone className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <span className="font-semibold text-slate-700">绑定手机号</span>
                                        {loadingIdentities && (
                                            <span className="block text-xs text-slate-400">加载中...</span>
                                        )}
                                        {!loadingIdentities && identities?.phone?.value && (
                                            <span className="block text-xs text-emerald-600 flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" />
                                                {identities.phone.value}
                                            </span>
                                        )}
                                        {!loadingIdentities && !identities?.phone?.value && (
                                            <span className="block text-xs text-slate-400">未绑定</span>
                                        )}
                                    </div>
                                </div>
                                {!loadingIdentities && identities?.phone?.value && (
                                    <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full font-medium">
                                        已绑定
                                    </span>
                                )}
                            </div>
                            {!identities?.phone?.value && (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="tel"
                                            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                                            placeholder="请输入手机号"
                                            value={phoneInput}
                                            onChange={(e) => {
                                                const nextRaw = e.target.value;
                                                const nextPhone = normalizePhone(nextRaw);
                                                if (smsChallengeId && smsChallengeTarget && nextPhone !== smsChallengeTarget) {
                                                    clearPhoneSmsChallenge();
                                                }
                                                setPhoneInput(nextRaw);
                                            }}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                                                placeholder="短信验证码"
                                                value={smsCodeInput}
                                                onChange={(e) => setSmsCodeInput(e.target.value)}
                                            />
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 px-4 text-sm font-medium whitespace-nowrap disabled:opacity-50"
                                            onClick={handleSendSmsForBind}
                                            disabled={!canSendSms}
                                        >
                                            {sendingSms ? '发送中...' : smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码'}
                                        </Button>
                                    </div>
                                    <Button
                                        size="sm"
                                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 text-sm font-medium disabled:opacity-50"
                                        onClick={handleBindPhone}
                                        disabled={!canBindPhone}
                                    >
                                        {bindingPhone ? '绑定中...' : '绑定手机号'}
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* 状态提示 */}
                        {bindError && (
                            <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                <span>{bindError}</span>
                            </div>
                        )}
                        {bindSuccess && (
                            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-600">
                                <Shield className="w-4 h-4 flex-shrink-0" />
                                <span>{bindSuccess}</span>
                            </div>
                        )}
                    </div>
                </section>
                
                {/* 分组：语音与交互 */}
                <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">
                        语音与交互
                    </h3>
                    <div className="bg-white/50 backdrop-blur-sm rounded-3xl p-2 border border-white/40 shadow-sm">
                        {/* 选项：VIP 模式 */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-100/50 last:border-0">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-amber-100/80 text-amber-600 rounded-2xl">
                                    <Crown className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-semibold text-slate-700">VIP 模式</div>
                                    <div className="text-xs text-slate-500 mt-0.5">解锁语音输入与文字转语音回复</div>
                                </div>
                            </div>
                            <Switch checked={vipModeEnabled} onCheckedChange={handleVipSwitchChange} />
                        </div>
                        
                        {/* 选项：自动播放 */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-100/50 last:border-0">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-blue-100/80 text-blue-600 rounded-2xl">
                                    <Volume2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-semibold text-slate-700">自动播放语音</div>
                                    <div className="text-xs text-slate-500 mt-0.5">收到回复时自动朗读</div>
                                </div>
                            </div>
                            <Switch checked={autoPlayVoice} onCheckedChange={toggleAutoPlay} />
                        </div>

                        {/* 选项：减弱动画 */}
                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-sky-100/80 text-sky-600 rounded-2xl">
                                    <MonitorPlay className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-semibold text-slate-700">减弱动画</div>
                                    <div className="text-xs text-slate-500 mt-0.5">减少界面动效与 3D 渲染</div>
                                </div>
                            </div>
                            <Switch checked={reducedMotion} onCheckedChange={toggleReducedMotion} />
                        </div>
                    </div>
                </section>

                {/* 分组：危险区域 */}
                <section className="space-y-4">
                     <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        危险区域
                     </h3>
                     <div className="bg-red-50/40 backdrop-blur-sm rounded-3xl p-5 border border-red-100/60">
                        <div className="flex items-center gap-4 mb-4">
                             <div className="p-2.5 bg-white text-red-500 rounded-2xl shadow-sm">
                                <Trash2 className="w-5 h-5" />
                             </div>
                             <div>
                                <h4 className="font-semibold text-red-900">清除所有数据</h4>
                                <p className="text-xs text-red-700/70 mt-0.5 leading-relaxed">
                                    将永久删除当前会话的所有记忆、聊天记录和关系进展。
                                </p>
                             </div>
                        </div>
                        
                        <Button 
                            variant="outline" 
                            className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 bg-white/60 h-11 rounded-xl font-medium"
                            onClick={handleClearHistory}
                        >
                            立即清除数据
                        </Button>
                     </div>
                </section>

                {/* 底部版权 */}
                <div className="flex flex-col items-center justify-center pt-4 pb-8 opacity-60">
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-100/50 rounded-full">
                        <Info className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-500">
                            Anima Companion v0.1.0
                        </span>
                    </div>
                </div>
            </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
